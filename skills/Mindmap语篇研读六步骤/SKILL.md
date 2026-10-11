---
name: mindmap-six-steps
description: MindMap语篇研读六步骤JSON生成技能。当用户发来英语试卷语篇（粘贴文本/文件路径/PDF）并指明题型（阅读理解A-D/完形填空/七选五/语法填空/读后续写），要求生成"六步研读/语篇研读/mindmap内容/研读JSON"时触发。按七类题型固定模板生成 sixsteps 格式JSON，教师在AFR系统MindMap页面点"⬆️导入JSON"一键载入，课堂六步研读使用。触发词："六步研读"、"生成研读JSON"、"分析这个语篇"、"按六步分析"、"mindmap六步"。
---

# MindMap语篇研读六步骤 · 生成技能

把一篇英语试卷语篇转化为 AFR MindMap 六步研读交互内容。AI 课前生成 → 教师审定 → 课堂学生先行。

## 一、工作流

```
1. 接收：语篇原文（粘贴/路径/PDF）+ 题型 +（可选）试题与题号
2. 判定文体（议论文/说明文/记叙文/应用文），套用【第四节 对应模板】
3. 逐字段生成JSON（严格遵循第二节Schema）
4. 自检（第六节质检清单）→ 输出为 .json 文件
5. 教师在 AFR → MindMap 视图 → 工具栏 ⬆️导入JSON → 课堂使用
```

## 二、JSON Schema（必须逐字段对齐，缺失字段会导致渲染失败）

```json
{
  "type": "sixsteps",
  "version": 1,
  "title": "语篇标题（如：高三上开学检测·阅读C篇）",
  "data": {
    "genre": {
      "items": [
        { "label": "语篇类型 Genre", "correctText": "议论文", "opts": ["议论文","说明文","记叙文","应用文"] },
        { "label": "文本来源 Source", "correctText": "…", "opts": ["…","…","…","…"] },
        { "label": "目标读者 Reader", "correctText": "…", "opts": ["…","…","…","…"] }
      ],
      "hints": ["引导语1","引导语2","引导语3"],
      "why": ["解析1","解析2","解析3"]
    },
    "content": {
      "items": [
        { "label": "主题语境·大类", "type": "choice", "correctText": "人与社会", "opts": ["人与自我","人与社会","人与自然"], "hint": "…", "why": "…" },
        { "label": "主题语境·具体话题", "type": "groupedChoice", "correctText": "社会热点问题", "groups": { "人与自我": ["…"], "人与社会": ["…"], "人与自然": ["…"] }, "hint": "…", "why": "…" },
        { "label": "主旨 Main Idea", "type": "choice", "correctText": "…", "opts": [{"text":"…","err":"反向设置"},{"text":"…（正确）","err":null},{"text":"…","err":"无中生有"},{"text":"…","err":"以偏概全"}], "hint": "…", "why": "…" },
        { "label": "基调 Tone / Attitude", "type": "choice", "correctText": "…", "opts": ["objective 客观中立","cautionary 理性提醒","critical 批判否定","indifferent 冷漠无关","optimistic 乐观积极","skeptical 怀疑质疑","enthusiastic 热情推崇","defensive 辩护维护"], "hint": "…", "why": "…" }
      ]
    },
    "struct": {
      "paraFuncs": [
        { "para": 1, "correctText": "引入·下定义", "opts": ["…","…","…","…"], "hint": "…", "why": "…" }
      ],
      "paraSummaries": [
        { "para": 1, "summary": "English summary sentence." }
      ],
      "trace": [
        { "q": 21, "type": "细节理解", "stem": "题干（可缩写）", "correctText": "P1 · 出处句关键词", "opts": ["P1 · …","P2 · …","P3 · …","P5 · …"], "correctQuote": "必须与原文逐字一致的出处句（高亮定位用）", "hint": "…", "why": "…" }
      ]
    },
    "cohesion": {
      "argTitle": "论证方式",
      "inter": [
        { "from": 1, "to": 2, "answer": "progression", "hint": "…" }
      ],
      "intra": [
        { "para": 2, "type": "指代", "correctText": "…", "item": "this influence", "opts": ["…","…","…","…"], "hint": "…", "why": "…" },
        { "para": 4, "type": "连接词", "correctText": "…", "item": "Furthermore", "opts": ["…","…","…","…"], "hint": "…", "why": "…" },
        { "para": 5, "type": "词汇链", "correctText": "…", "item": "boundary / distant / one-sided", "opts": ["…","…","…","…"], "hint": "…", "why": "…" }
      ],
      "argument": [
        { "para": 1, "correctText": "下定义", "opts": ["…","…","…","…"], "hint": "…", "why": "…" }
      ]
    },
    "lang": {
      "sentences": [
        { "kind": "语法/句法点名称", "para": 2, "sen": "原句（逐字摘录）", "ana": "主干拆解+语法分析" }
      ],
      "rhetoric": [
        { "kind": "修辞/构词名称", "para": 5, "sen": "原句", "ana": "分析" }
      ],
      "corpus": [
        { "type": "高分短语|高分句型|话题词汇", "en": "…", "zh": "…", "usage": "使用场景" }
      ]
    },
    "purpose": {
      "items": [
        { "label": "A · 写作目的", "correctText": "…", "opts": ["…","…","…"], "hint": "…", "why": "…" },
        { "label": "B · 说服策略", "correctText": "…", "opts": ["…","…","…","…"], "hint": "…", "why": "…" },
        { "label": "C · 最强论证", "correctText": "…", "opts": ["…","…","…","…"], "hint": "…", "why": "…" },
        { "label": "D · 读者启示", "correctText": "…", "opts": ["…","…","…","…"], "hint": "…", "why": "…" }
      ],
      "concepts": [
        { "term": "english term", "def": "中文释义——主题概念" }
      ]
    }
  },
  "aux": {
    "funcLabels": { "1": "段落功能标签（①-④画布节点显示）", "2": "…" },
    "paraBriefs": { "1": "Paragraph brief in English", "2": "…" }
  }
}
```

**硬性约定**：
- 段间关系 `answer` 只能取六键：`progression递进 / contrast转折 / causality因果 / parallel并列 / concession让步 / example举例`
- `correctQuote` 必须从原文**逐字复制**（含标点），是左栏原文高亮定位的唯一依据
- 选项一律 4 个（主旨题可带 `err` 干扰说明；目的题可 3 个）；正确项随机位置由系统自动打乱，无需手动分布
- 段落数 = 原文自然段数（读后续写含续写规划段，见模板E）
- `argTitle` 可选：议论文"论证方式"/说明文"说明方法"/记叙文与续写"叙述技巧"（缺失时默认"论证方式"）

## 三、六步通用设计原则（大赛"人机协同"理念）

1. **学生先行**：每题先学生作答；答错只给引导语（hint 是启发式提问，不泄露答案）
2. **串行解锁**：步骤内前一题答对才解锁下一题；③的试题溯源在"五段功能全对+Show揭示段意"后解锁
3. **AI幕后供材**：所有揭示的 why/summary 均为课前AI生成、教师审定，无课堂即时生成
4. **hint 写法**：启发式反问（如"作者有没有全盘否定？"），指向文本证据而非答案本身
5. **why 写法**：点破命题逻辑（如"A反向设置；C无中生有；D以偏概全"）
6. **干扰项设计四式**：反向设置 / 无中生有 / 以偏概全 / 张冠李戴（选项 err 字段标注）

## 四、七类题型固定模板

### 4.1 阅读理解 A-D（文体三分支）

| 步骤 | 议论文（C篇范式·已定稿） | 说明文 | 记叙文 |
|---|---|---|---|
| ①Genre | 文体/来源/读者 三题 | 同左，来源偏科普媒体/产品说明 | 同左，来源偏个人故事/传记 |
| ②Content | 大类→子话题→主旨→cautionary系基调 | 同左，基调偏objective | 同左，基调偏emotional（hopeful/touching/bittersweet） |
| ③Structure | 论证功能：引入下定义/分析深化/让步/指危害/总结亮立场 | 说明板块：现象引入/原理阐释/应用举例/分类对比/展望 | **情节山**：起因/发展/转折(高潮)/结局/回声 |
| ④第三部分 | 论证方式（argTitle=论证方式） | **说明方法**：下定义/举例子/作比较/列数字/分类别 | **叙述技巧**：顺叙/倒叙/伏笔/对话推动/首尾呼应 |
| ⑤Language | 长难句3+修辞2+语料5 | 同左，语料偏说明性表达 | 语料偏**动作链/情感描写** |
| ⑥Purpose | 论证+说服策略+启示 | 说明意图+读者价值 | **人生启示**为落点；B=写作手法而非说服策略 |

### 4.2 完形填空（记叙为主）
- **①**：文体 + **叙事视角**（第一/三人称）+ 情感基调预判
- **②**：主题 + **情感线四题**（开端情感→冲突→转折→收束情感，主旨题换"故事告诉人们…"）
- **③**：paraFuncs=起承转合；trace 的 stem=**挖空所在句**、q=完形题号（41-55）、correctQuote=**解题依据句**（上下文线索句，非挖空句本身）
- **④**：intra 是灵魂——type 用 **词汇复现/同现/逻辑连接词**；argTitle=情节推进技巧
- **⑤**：sentences=**熟词生义句**（kind="熟词生义:address v.处理"）；corpus=完形高频词块
- **⑥**：主旨+情感升华；concepts=故事核心品质词（perseverance/empathy…）

### 4.3 七选五（语篇衔接即本体）
- **①**：文体 + **空格分布**（"本文空格位置：段首x处/段中x处/段尾x处"作第2题）
- **③**：paraFuncs=全文骨架功能；paraSummaries 含**空格位置功能说明**（"P2首句空：需概括本段主题"）
- **④比重最大**：inter 照常；intra 三题固定为 **指代（代词it/they指什么）/ 词汇复现（同义转换对）/ 逻辑连接词**；argTitle=衔接策略
- **⑤**：sentences=**含空格的关键句**；rhetoric=代词指代关系；corpus=衔接类语料
- **trace**：q=七选五题号，correctQuote=**正确选项的关键依据句**（复现词所在句）

### 4.4 语法填空（短填）
- **①**：文体 + **语篇语法特征**（如"科普文：被动语态+名词化高频"作第2题）
- **③**：常规结构；trace 的 q=61-70，stem=**考点名称+挖空句**，correctQuote=含空原句
- **④**：intra=**从句衔接**（连接词/关系词）+非谓语逻辑；argTitle=句法手段
- **⑤（核心）**：sentences=**3个典型考点句**（kind=考点名：非谓语作状语/定语从句/名词性从句连接词…，ana=为什么填这个词的完整推理）；rhetoric=**构词法**（kind="派生:care→carefully"）；corpus=语法高频词形转换
- **⑥**：常规；concepts=语法概念（非谓语/从句/被动）英文名+释义

### 4.5 读后续写
- **①**：记叙文 + **续写任务特征**（开放情节/给定首句）
- **②**：主题 + **情感基调**（基调题opts换：hopeful/warm/tense/relieved…；主旨=故事精神）
- **③（特殊）**：paraFuncs=原文情节山；paraSummaries=**续写P1/P2内容规划**（英文规划句，各1-2条：P1接续给定句+情节推进；P2高潮收束+回扣主题）；trace 的 q 用 1-3，stem=**伏笔回收**（"续写须回收的伏笔：the lost wallet"），correctQuote=**原文伏笔句**
- **④**：inter=原文末段→续写P1→续写P2 衔接；intra=**情节连贯**（代词一致/时态一致）；argTitle=叙述技巧
- **⑤（核心）**：sentences=**高分描写句拆解**（kind="动作链:took a deep breath and stepped forward"）；rhetoric=情感外化（kind="情感外化:her hands trembled"）；corpus=**动作/情感/环境描写语料**（type 用"动作描写/情感描写/环境描写"）
- **⑥**：**主题升华**为A题（"两段续写的共同落点是什么？"）；D=读者共鸣；concepts=主题精神词

## 五、生成流程要点

1. **先通读原文**，标出：自然段号、每段功能、六色段间关系、3个长难句、2处修辞、5条语料、试题出处句
2. **quote 三查**：与原文逐字一致？无省略号改动？标点全角半角一致？
3. 主旨题 err 标注干扰方式；hint 全部用反问句式
4. paraSummaries 一律**英文完整句**（Show揭示后学生读英文概括）
5. 生成后跑第六节质检清单，全过再输出
6. 输出文件名：`六步研读-{试卷名}-{题型}.json`（UTF-8编码）

## 六、质检清单（逐项自检后再交付）

- [ ] type=sixsteps, version=1, title 非空
- [ ] 六个 data 节点齐全：genre/content/struct/cohesion/lang/purpose
- [ ] genre 三题、content 四题（含groupedChoice三组）、每题4选项（基调8选项）
- [ ] paraFuncs/paraSummaries/inter 段号连续，inter 的 answer 全部在六键内
- [ ] intra 恰好三题：指代/连接词/词汇链（或题型特化版）
- [ ] trace 的 correctQuote 逐字原文（复制粘贴，禁止手打）
- [ ] sentences 3条 + rhetoric 2条 + corpus 5条
- [ ] purpose A-D 四题 + concepts 3条
- [ ] aux.funcLabels/paraBriefs 键覆盖全部段落
- [ ] 所有 hint 为反问句式；所有 why 点破逻辑
- [ ] JSON 语法有效（无注释、无尾逗号）

## 七、导入与验证

1. AFR → MindMap 视图 → 工具栏 **⬆️ 导入JSON** → 选择文件
2. 系统自动校验 `data.genre && data.content`，通过后整体替换并持久化
3. 验证：六步Tab逐一点击走查——答题不消失、串行解锁正常、③试题溯源高亮左栏原文
4. 教师可用 ✏️编辑 微调文本，💾保存 持久化；不满意处改后导出留档

## 附：参考范式

`E:/AIkoko/mindmap嵌入版本/index.html` 内嵌 DATA（准社会关系议论文C篇）为议论文完整标杆样例，生成议论文类内容时对照其密度与口吻。
