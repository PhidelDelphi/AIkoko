# AIkoko · AFR 英语教学一体化系统

> AFR = Assignment Feedback & Review（作业反馈与评讲）
> 面向高中英语教学场景的**纯前端、离线优先**课堂系统：从课前歌曲到成绩分析、试卷评讲、语篇研读、作文评讲、真题拓展与教学反思，八个版面覆盖一节英语课的完整流程。

## 功能版面

| Tab | 名称 | 功能 |
|---|---|---|
| ① 「须臾」Prelude | 课前 | 每日歌曲（`Song of the Day/` 文件夹自动扫描）、课堂开场 |
| ② 「受绳」Feedback | 学生成绩 | Excel 导入、按学号/分数排序、自动等级标识 |
| ③ 「就砺」Review | 习题评讲 | 题型分类、正确率着色、原文圈画标注（画笔/高亮/橡皮）、题号网格导航 |
| ④ 「致远」MindMap | 语篇研读 | 语篇六步研读引擎、PDF 语篇自动识别、正文整篇可编辑 |
| ⑤ 「青蓝」Composition | 作文评讲 | 读后续写/应用文八步评讲框架、PDF 自动识别原文与范文、输入语料（Show, not tell） |
| ⑥ 「跬步」Knowledge | 知识技能 | 按作业+班级独立保存的知识点笔记 |
| ⑦ 「博见」Extension | 真题拓展 | 高考真题拓展包、单卷 JSON 导入导出 |
| ⑧ 「参省」Introspection | 教学反思 | 成绩自动同步分桶、教师批注、学生反思 |

数据全部保存在浏览器本地（IndexedDB + localStorage），关闭浏览器不丢失；通过 JSON 导出/导入实现跨机迁移。

## 快速开始

### 方式一：Windows 一键启动（推荐）

- **免 Python**：双击 `启动服务器-免Python.bat`（调用 `server.ps1`，基于 .NET HttpListener，Win7~Win11 均可）
- **有 Python**：双击 `启动服务器.bat`

启动后浏览器自动打开 `http://localhost:8766`。

### 方式二：任意静态服务器

```bash
# 在本目录执行
python -m http.server 8766 --bind 127.0.0.1
# 访问 http://127.0.0.1:8766
```

### 方式三：GitHub Pages

本系统为纯静态站点，可直接开启 GitHub Pages 托管（Settings → Pages → 部署 main 分支根目录）。
注：Pages 环境无 `/list-songs` 接口，Of Today 歌曲扫描会自动退回固定文件名逻辑，其余功能不受影响。

### 浏览器要求

Chrome / Edge / Firefox / Safari 均可；不支持 IE。获取新版页面请 **Ctrl+Shift+R 强制刷新**。

## 数据工作流

系统与 AI 助手配合的典型备课流程（技能见 [`skills/`](skills/)）：

```
试卷 PDF + 答案 PDF
   ├─ Scores        ← Excel 答题明细导入（PreAFR成绩合并 技能预处理）
   ├─ MindMap       ← PDF 语篇自动识别（Mindmap语篇自动识别 技能）
   ├─ Review        ← 逐题 AI 分析 JSON（Review错因分析和变式生成 技能）
   ├─ Composition   ← 作文评讲 JSON（Composition系列 技能）
   ├─ Extension     ← 真题拓展 JSON（Extension拓展内容生成 技能）
   └─ 总包「考试名称-合并.json」(type: afr-merged)
        → ⚙ → 🤖 Import AI Analysis 一键分发到各板块
```

各板块也有独立的 ⬆️导入JSON / ⬇️导出JSON 按钮，可单独搬运数据。

## 目录结构

```
AIkoko/
├── index.html              # 主页面（八版面 + 视图容器 + 内联脚本）
├── script-v2.js            # AFR 主逻辑（index.html 实际加载的脚本）
├── essay-review.js         # Composition 作文评讲模块
├── bojian.js               # Extension 博见模块
├── introspection.js        # Introspection 参省模块
├── extension-高考真题.json  # 博见真题拓展包（板块内 ⬆️导入JSON 载入）
├── libs/                   # 第三方库（全部本地化，离线可用）
│   ├── xlsx.full.min.js    #   SheetJS Excel 解析
│   ├── fabric.min.js       #   Canvas 圈画标注
│   ├── pdf.min.legacy.js + pdf.worker.min.legacy.js + pdfjs-cmaps/  # pdf.js（含中文CID字体解码）
│   ├── html2canvas.min.js / jspdf.umd.min.js / jszip.min.js
│   └── importWorker.js     #   后台导入 Worker
├── skills/                 # AI 工作流技能（生成各板块 JSON 数据）
├── docs/开发纪要.md         # 开发内档：架构决策、深坑实录、修改守则
├── server.ps1              # PowerShell 本地服务器（含 /list-songs 接口）
├── 启动服务器.bat           # Python 启动
├── 启动服务器-免Python.bat  # PowerShell 启动
├── Song of the Day/        # 每日歌曲（MP3 自备，见文件夹内 README.txt）
└── Data/                   # 本地试卷/成绩数据（不入库，见下方隐私说明）
```

## 数据与隐私

- **Data/**（试卷 PDF/XLSX、真实学生成绩）**绝不入库**，已在 `.gitignore` 中排除；
- `Song of the Day/` 中的 MP3/LRC 为个人音乐文件，同样不入库（仅保留约定说明）；
- `incoming/pending.json` 为 AI 处理试卷后的落稿位置，属工作数据，不入库；
- 浏览器内的 IndexedDB / localStorage 数据不随文件迁移，跨机请使用各板块的 JSON 导出/导入。

## 二次开发

改动前请先阅读 [`docs/开发纪要.md`](docs/开发纪要.md)，要点：

- 改 `index.html` 前先备份；改任一 JS 后 `node --check` 语法检查并 bump 对应 `?v=`/`?t=` 版本参数（各模块独立）；
- 主逻辑只发布单份 `script-v2.js`（原开发环境中的 `script.js` 与其完全同步）；
- 已知无害噪音：启动时 `favicon.ico` 与 `AFR-backup-*.json` 探测的 404。

## 致谢

本项目为参加无锡市"人工智能+教育"创新应用技能大赛的作品。
