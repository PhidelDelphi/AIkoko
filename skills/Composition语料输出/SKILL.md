---
name: composition-yuliao
description: 读后续写"输入语料"备课流水线（AFR Composition 页第⑥步）：从原文+范文中捕捉描写点→按场景搜图配图→每场景写三组 Tell/Show 对比语料→产出可直接导入 essay-review.js 的单篇JSON。当用户提到 Composition、输入语料、描写点、图文对、读后续写语料、Show not tell、作文评讲JSON、导入篇目等场景时使用——用户只发来一篇读后续写的原文和范文时也应主动触发。
---

# Composition 语料输入（读后续写第⑥步）

为 AFR「mindmap嵌入版」的 Composition 页（`E:\AIkoko\mindmap嵌入版本\`，essay-review.js 渲染）第⑥步「输入语料 · Show, not tell」批量备课：每个描写点一个"图×语料"文本框，左图右文。

**输入**：读后续写原文 + 参考范文（+ 两句段首句，如有）。
**输出**：单篇 JSON（有 `title` 无 `articles`），写到用户指定位置（默认桌面或 `E:\AIkoko\mindmap嵌入版本\作文评讲-<简称>.json`）。

## 目标数据结构（essay-review.js 的 step6.pairs）

```
step6.pairs[] = {
  title:  "Para. N　　Scene M · 英文名（中文技巧点）",
  text:   "<b>问题句</b><br>To depict ...<br><br>① ✗ ... (Tell)<br>➜ ... (Show)<br>技巧：...（×3组）",
  imgs:   [{ "src": "https://...jpg", "x": 0, "y": 0, "w": 300, "h": 200 }],
  layout: "r"
}
```

- `imgs[].src` 支持 http(s) 外链直链（渲染为 `<img src>`），不占 localStorage；本地图才用 dataURL。
- `title` / `text` 按 HTML 渲染，可用 `<b>` `<br>`；引号用弯引号 " "。
- `layout: "r"` = 文在图右；图槽标准尺寸 300×200。
- 页面对空续写篇自动预置 3 个空框；导入的 pairs 会原样呈现，无需关心。

## 工作流（四步）

### 第1步 捕捉描写点（先交用户筛选，再往下走）

- 从伏笔链和范文情节中提炼 3-6 个"特写镜头"式描写点，每个标注属于 Para. 1 还是 Para. 2。
- 常见类型：情感转折 / 动作链 / 环境对比 / 神态特写 / 互动温情 / 结尾升华（呼应伏笔）。
- **产出清单先给用户增删定稿，再进入搜图**——用户明确要求保留判断权，不要跳过。
- 教学点覆盖建议：每场景聚焦 2-3 个不同技巧（动作链/独立主格/无灵主语/拟人/比喻/伏笔回收…），六场景合计覆盖 12+ 技巧点。

### 第2步 搜图配图（2026-10-05 David 篇实战验证版）

**图源铁律（AI 看图实测结论，直接决定选域）**：
| 图源 | 可用性 | 原因 |
|---|---|---|
| `images.stockcake.com`（CDN直链）| ✅ **首选** | 全站免费、无水印、无防盗链（站内搜索页 403 但 CDN 直链畅通）|
| `static.vecteezy.com` free 系 | ⚠️ 慎用 | curl 可通但**页面 img 有 Referer 防盗链**，浏览器渲染可能被拒 |
| dreamstime thumbs | ❌ | 全带平台水印（平铺）|
| freepik premium 链 | ❌ | 重定向后带 Magnific 平铺水印 |
| Pinterest | ❌（无代理时）| 直连/pinimg 全超时；用户开系统代理后可改用 |

**搜图三件套流程**：
1. `browser_navigate` → `https://www.bing.com/images/search?q=<英文场景关键词>+free+photo`（关键词=场景+物件+光线，具体化）
2. `browser_evaluate` 提取 murl 并**过滤无水印域**（关键一步，直接跳过水印图库）：
   ```js
   [...document.querySelectorAll('a.iusc')].slice(0,15)
     .map(a=>{try{return JSON.parse(a.getAttribute('m')).murl}catch(e){return null}})
     .filter(Boolean)
     .filter(u=>/stockcake\.com|unsplash|pexels|pixabay|wp-content/.test(u))
   ```
3. `curl -sL` 验链（200 + image/*；301 需 -L 跟随后仍 image 才算过）

**AI 四验（每张主图必做）**——`mcp__4_5v_mcp__analyze_image`，prompt 问四件事：
① 画面内容是什么 ② 有无水印/文字覆盖 ③ 清晰度 ④ **是否贴合该场景的描写语料画面**（用户硬要求：图与场景、语料适配关联性高；同时排除低质/粗俗/黄暴/政治偏激内容）

- 每场景 2 组关键词（正搜+换角度备搜）；情绪特写命中率低时换角度：手部特写、共同动作、环境光影、剪影背影往往更贴教学点。
- 每场景附 2-3 张备选链接写进交付说明（不进 JSON），页面上拖图/粘贴即可换。

### 第3步 写语料（每场景一个文本框，版式已定稿）

完整版式示例（Scene 1 实际定稿）：

```html
<b>How to show the delicate change of Jake's feelings?</b><br>
To depict the content of these photos and his reaction.<br><br>
① ✗ Jake was moved by the old photos. (Tell)<br>
➜ Page after page, the photos <b>whispered</b> a story he had never known—Grandma,
years younger, <b>cradling</b> baby Jake in her arms ... (Show)<br>
技巧：动作链(非谓语) ｜ 拟人(whisper) ｜ 借细节传情
```

硬规则：

1. **标题**：`Para. N　　Scene M · 英文名（中文技巧点）`，段标与场景名之间用**两个全角空格「　　」**（HTML 普通空格会塌掉）。
2. **正文四层**：加粗的质朴问题句 `How to show ...?` → `To depict ...` 一句作答 → Tell/Show 对比 → 技巧行。
3. **每个场景必须三组 ✗Tell ➜Show 对比**（①②③编号，一组不够课堂展开）。三组覆盖不同技巧角度（如：动作链/无灵主语/比喻），避免同质重复。Show 句关键加分处 `<b>` 加粗，行尾标注 `(Tell)` / `(Show)`。
4. **不写提示词行**（用户已明确删除该层）。
5. 技巧标签用中文术语：动作链 / 非谓语 / 独立主格 / 无灵主语 / with复合结构 / 对比兑现 / 借景抒情 / 对话点缀 / 短句造势 / 首尾呼应 / 多感官 / 拟人 / 比喻 / 排比 / 伏笔回收 / 借声衬静 / 通感 等，可带英文例词括注，如 `拟人(whisper)`。
6. Show 句难度对齐高考范文：地道、可背诵、可直接迁移到同类情节。
7. 范文（用户提供了的话）顺手填入 `step8.text`（两段用 `<br><br>` 分隔），导入后步骤⑧即有内容。

### 第4步 组装 JSON、测试与交付

- 单篇结构：`id: "art-YYYYMMDD-<slug>"`、`title`、`type: "continuation"`、`story` = 原文逐段数组（去掉中文括注如"(路线)"）、`openers` = 段首句数组、`step6 = { qs: [], extra 默认值, pairs: [...] }`、`step7/step8` 骨架（step8 可填范文）；step1-5 留空骨架。
- `layout` 全部 `"r"`，每场景一图 `{ "x": 0, "y": 0, "w": 300, "h": 200 }`。
- 写盘后 node 校验：
  ```
  node -e "JSON.parse(require('fs').readFileSync('文件名','utf8'));console.log('OK')"
  ```
- **渲染终验（防盗链只有页面层能暴露，curl 通≠页面能显示）**：
  1. JSON 副本放到本地服务器目录（`cp 到 E:/AIkoko/mindmap嵌入版本/xxx.json`，python http.server 起服务）
  2. 页面 evaluate：`fetch('/xxx.json')` → push 进 `AFR-composition-v2`（同 id 先 filter 再 push）→ `reload`
  3. 切 Composition → 选篇目 → 步骤⑥ → 等待 5 秒后查 `[...document.querySelectorAll('#erBody .er-pair img')].every(i=>i.complete&&i.naturalWidth>50)`
  4. 有图加载失败（典型=vecteezy 防盗链）→ 换 stockcake 备选链 → 重验
- 告知用户导入方式：Composition 侧栏「⬆️ 导入篇目」选文件；同 id 已存在时选"覆盖更新"即原地替换。
- 交付说明必须附：描写点清单（供增删，可重新生成）+ 备选图链接 + 提醒导入后**导出一次 JSON 备份**（外链图不占存储，后续拖入的本地图才占）。

## 参考样例

- `assets/example-jake-album.json` ——「Stories with Jake（旧相册）」定稿：6 场景 × 3 组对比。
- `C:\Users\Delphi\Desktop\作文评讲-David越野跑.json` —— 2022新高考I卷 David 篇（2026-10-05 全流程实战产出，含 stockcake 图链四验与渲染终验）。

写新篇目前先读两者对齐格式。
