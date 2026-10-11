> 📌 AFR项目副本说明（2026-10-03）：本技能功能已在Zcode副本实测跑通（开学检测PDF→8语篇→MindMap下拉直读原文，识别<1秒）。**按用户要求只采用"试卷语篇自动识别"这一条功能链**（PDF导入→examIndex→MindMap语篇下拉直读文本），Zcode副本中的"⑤ AI Map 登高"与内置AI配置面板等其余新增功能**全部舍弃、不移植**。功能代码尚未移植到本项目（E:/AIkoko/VScode for AFR/），移植时以Zcode副本script.js中"试卷语篇自动识别"注释段为源，依赖 libs/pdfjs-cmaps/（168个bcmap）需一并复制。

---
name: yupian-auto-detect
description: AFR试卷语篇自动识别——导入试卷PDF后自动切分阅读理解A-D/七选五/完形/语法填空/读后续写并存入语篇索引，MindMap语篇下拉直读原文。当用户提到"导入试卷识别语篇"、"MindMap没文本"、"语篇下拉"、"Passage识别错了"、"试卷原文提取"、"识别用时"等场景时使用本技能进行使用、排查与扩展。
---

# 语篇自动识别（Exam Discourse Auto-Detect）

AFR 系统的试卷语篇自动识别功能：导入**有文字层的试卷 PDF** 时，自动提取每页文本、按试卷结构切分语篇、存入作业索引；MindMap 顶部语篇下拉选中即直读原文，无需粘贴。

**代码位置**：`E:\AIkoko\Zcode for this item\Assignment Feedback\`（script.js / script-v2.js，搜索 `试卷语篇自动识别` 段落注释）

## 用户使用（课堂操作）

1. 数据面板 → 📁 Choose File 选试卷 PDF → Import
2. 导入完成提示「📄 已自动识别语篇：Passage A、…」；含答案册时追加 ⚠ 警告
3. MindMap → 顶部语篇下拉（识别到的题型带 📄 角标，一节多篇的如 `5 of 7 · A` 在 From Exam 分组）→ 点选即显示原文
4. 控制台 `AFR.debugExamIndex()` 查看识别清单（语篇/来源/起始页/字数）

**边界**：扫描版 PDF（无文字层）取不出词，仍走 📋 Paste；`___41___` 类空格题干保留、纯答题横线删除、题目选项区自动截掉、中文指令行剔除、段落按版面还原。

## 识别原理（三层，非 OCR）

1. **文字层提取** `extractPdfPageText(page)`：pdf.js getTextContent（需 cmaps，见下）→ 按Y聚合行、按X间隙拼词 → 过滤噪音行（页眉页脚/学科网/备课组/命制审核/页码，`isNoiseLine`）→ **双栏拆分**（`splitPdfColumns` 找竖直装订沟，跨栏行<4%才判双栏）→ 分栏独立统计左边距众数/行距中位数，按 缩进/行距拉大/题干行/选项行/中英翻转 五启发式还原段落（`buildParasFromLines`）
2. **结构切分** `buildExamIndexFromPages`：在行流上找标记——中文结构词+指令句指纹（`EXAM_CN_MARKS`：七选五="从短文后的选项中选出"、完型="从短文后各题所给的"、语法="在空白处填入 1 个"、续写="开头语续写"；注意"完型/完形"两种写法）→ 独立字母行 A-D / "Passage One" / "A 标题"粘连形式（`looksLikeBareLetter`，防选项组误判：紧跟选项行或后4行含≥2选项行则拒绝）→ **区域感知**：字母key由当前区域决定（阅读区→`Passage X`，其他区→`5 of 7 · A`）；孤立"试题/试卷"行=合卷边界，重置区域防第二份材料顶替主卷
3. **切片清洗** `trimExamSlice`：剔中文指令行（`isCnInstructionLine`）→ 按题型截尾（阅读/完型切到第一题干行；七选五定位选项组后取含空格题干的一侧）→ 答题横线清理（`stripAnswerLines`：≥4连下划线且后不接数字→空格；`___41___` 保留；该版完形空格可能是光秃数字 "a 41 mountain road"）→ 小节无题型词时 `classifySectionSlice` 按内容反推（编号选项行≥3=完型；空格+选项组=七选五；仅空格且号≥46=语法填空）

结果存 `hw.examIndex[key] = {text, sourceId, pageStart}`，随作业进 IndexedDB；`tryAutoLoadExamText` 在进入 MindMap/切语篇时无文本则自动填充。

## 性能（实测，Edge headless，2026-10-03）

| 环节 | 14页正常板式 | 8页原文在前版 |
|---|---|---|
| 逐页文字提取合计 | ~760ms（每页20-190ms） | ~740ms |
| 结构切分 | 16ms | 7ms |
| **识别合计** | **<1秒** | **<1秒** |
| 整个PDF导入（用户感知） | ~48s | ~47s |

导入耗时的主导是**原有**的页面渲染成图（2x canvas+toDataURL，供 Review 圈画）+锚点/条带检测，与语篇识别无关。识别耗时可在控制台看 `[AFR] 语篇识别·…` 计时日志。

## 排查与扩展（开发者）

**铁律**：改完 script.js 必须 `node --check script.js && cp script.js script-v2.js`（index.html 只加载 v2，靠 `?t=` 破缓存）。

**调试方法（快）**：识别逻辑是纯函数，先离线复现再上浏览器——
```bash
# 1. 起服务（在 Assignment Feedback 目录）
python -m http.server 8768 --bind 127.0.0.1
# 2. 导入目标PDF并落盘每页文字层（同会话内！IndexedDB不跨profile）
python ..\shots\dump_real_paper.py   # → shots\real_pages.json
# 3. 生成并跑 node 离线 harness（纯函数切分，秒级迭代）
python ..\shots\make_harness.py && node ..\shots\harness.js real_pages.json
```
端到端（最终确认）：`shots/test_real_paper.py`（真实卷）、`test_two_layouts.py`（两版式）、`test_exam_detect.py`（仿真卷，reportlab 造卷脚本 `make_mock_exam.py`）。

**历史踩过的坑（改代码前先对照）**：
- 中文提取空白 → `getDocument` 必须带 `cMapUrl:'libs/pdfjs-cmaps/'`（168个bcmap，在 libs/ 内随 gitignore 不入库；丢了 `npm i pdfjs-dist@3.11.174` 重拷）
- 双栏卷文字搅混 → 必须走 splitPdfColumns，分栏后各自统计边距/行距
- "B/D篇缺失" → 字母头被选项组误杀，看 looksLikeBareLetter 的选项判定窗口
- "Passage A 是题目" → 卷尾合订材料顶替，确认"试题"边界行未被噪音过滤器删掉（它承担区域重置）
- 指令措辞变体识别不到 → 先在 PDF 原文里 grep 实际措辞再补 EXAM_CN_MARKS 正则
- git 操作报 dubious ownership → 加 `-c safe.directory="E:/AIkoko/Zcode for this item/Assignment Feedback"`

**红线**：绝不修改 `E:\AIkoko\VScode for AFR\`、G盘一切、`E:\Assignment Feedback\`（6月旧副本）；只在本项目文件夹内开发。
