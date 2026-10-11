---
name: essay-generate
description: 英语作文评讲内容生成器。用户发来读后续写或应用文的原文（粘贴文本或给路径），按AFR Composition八步框架生成全部评讲内容，输出json供网页"导入篇目"按钮一键读取。触发词："生成作文评讲"、"作文评讲生成"、"评讲这篇续写"、"评讲这篇应用文"、"essay review"。
---

# 作文评讲内容生成（AFR Composition 配套）

## 工作流

1. **接收原文**：用户提供读后续写原文（含段首句）或应用文题目要求。
2. **确认信息**：若无则询问——篇目标题、来源（哪份卷子）、type（continuation 续写 / practical 应用文）。
3. **生成八步内容**（按下方结构）。
4. **写文件**：生成单个 article 对象，存到 `G:\ClaudeCode\Assignment Feedback\essay-import.json`（固定路径，方便用户导入）。
5. **告知用户**：在 AFR → Composition 视图 → 侧栏「⬆️ 导入篇目」→ 选 `essay-import.json`。

## article 结构（续写 type: continuation）

```json
{
  "id": "art-<时间戳>",
  "title": "<篇目标题，如：深藏相册的祖母情>",
  "source": "<来源，如：2026.9 高三月考卷>",
  "type": "continuation",
  "hw": "<所属练习名，可空>",
  "story": ["段落1", "段落2", ...],
  "openers": ["Para1段首句", "Para2段首句"],
  "step1": [{"paras": "Para 1-5", "main": "<段落大意>", "implied": "<言外之意>", "feelings": "<情绪词, 情绪词>"}],
  "step2": [{"q": "文章中什么发生了改变，从状态 A 变成了状态 B？", "a": "..."}, {"q": "造成状态A的原因？什么契机造成B？", "a": "..."}, {"q": "What message does the story convey?", "a": "..."}],
  "step3": {"guide": "<五类伏笔速查：仅🏠环境/📦物品/💔关系/⚖两难/❓悬念五行定义，不带优先级排序和必答题说明>", "items": [{icon,name,type,cls,extract,reuse,effect,refs}], "patterns": "<语言模式提示>"},
  "step4": {"p1": {"keywords": "<段1关键词>", "plots": ["情节A: ...", "情节B: ...", "情节C: ..."]}, "p2": {...}},
  "step5": [{"t": "<问题名>", "desc": "<问题描述>", "checks": [{"q": "<自查项>"}], "pred": "<预测>}],
  "step6": {"qs": [{"p": "Para 1", "q": "<How to show...?>", "corpus": [{"tell": "<直白版>", "show": "<show-don't-tell升级版，加粗亮点词>", "skills": ["技巧名"]}]}], "pairs": "<见下方描写点模式（续写必生成4-6个）>", "extra": "<补充语料HTML>"},
  "step7": {"text": "<导入学生作文提示>", "images": []},
  "step8": {"text": "<完整范文HTML，两段续写>"},
  "stepsMeta": null
}
```

## article 结构（应用文 type: practical）

stepsMeta 用 `["① 审题拆解", "② 开设目的", "③ 栏目内容", "④ 结尾构思", "⑤ 反馈问题", "⑥ 输入语料", "⑦ 集体诊断", "⑧ 共赏佳作"]`，
step1 结构为 `{"rows": [{"label": "身份/约束/落点", "cells": ["...", "..."]}]}` 审题拆解表，
step2 开设目的、step3 栏目内容、step4 结尾构思。

## step6 描写点模式（续写必生成 · 图文并茂）

分析续写原文时**敏锐捕捉 4-6 个主要描写点**——续写两段中最值得"show 不 tell"的可视化瞬间。每个描写点生成一个图文框（教师课后到 Pinterest 等找高质量相关图，Ctrl+V 贴入空图框即成图文并茂）。

```json
"pairs": [
  {
    "title": "<英文引导问句，描述画面任务，如：What might Jake see in these old photos?>",
    "text": "<span class=\"er-txtdrag\" title=\"按住拖动：放到图的左边 / 右边 / 下面\" onpointerdown=\"EssayReview._txtPtrDown(PAIR序号,event,this)\">⠿<b>描写句（show版）</b>：与预期画面严格对应，含1-2个加粗亮点表达，15-30词</span>",
    "imgs": [{"src": "", "x": 0, "y": 0, "w": 280, "h": 180}],
    "layout": "r"
  }
]
```

**硬性规则**：
- `text` 的 span 属性串**逐字照抄**（er-txtdrag 类名/onpointerdown=EssayReview._txtPtrDown），仅替换序号（从 0 起）与句子内容
- `imgs` 一律单个空 src 框（w:280,h:180）——教师贴图后自动填充；**绝不生成 base64**
- `layout` 用 "r"（文本在图右侧，教师可拖拽换 l/b）

**描写点选取标准**（从原文+续写规划推导）：
1. **动作瞬间**：续写关键动作的画面定格（ Jake's fingers traced the worn photo edges）
2. **情感爆发点**：人物情绪外化场景（祖母眼中的泪光/释然的笑）
3. **环境烘托**：场景氛围（雨夜/黄昏房间/老物件特写）
4. **物品细节**：与 step3 伏笔联动的关键物品（相册/信件/旧毛衣）
5. **人物互动**：两人关系的定格画面（拥抱/递物/对视）
每个描写点对应续写规划(step4)的一个情节支点，title 用"读者视角"的问句，text 是该画面的示范描写句。

**教师配图流程**（生成后告知用户）：
```
导入篇目 → 第六步见 N 个描写点（空图框+描写句）
→ 到 Pinterest 搜索画面关键词 → 右键复制图片
→ 点击目标描写点框体选中 → Ctrl+V 粘贴（或点框内 ➕/拖入文件）
→ 文本⠿抓手可拖到图左/右/下；💾自动保存 → 课堂图文展示
```

## 生成质量要求

- **step1 语篇梳理**：按情节节点分段（如 Para 1-5 / 6 / 7），main=显性情节，implied=言外之意/伏笔，feelings=人物情绪递进
- **step3 伏笔**：找原文所有可回收线索（物品/环境/关系/台词/标题），每条给"如何在续写中回收"
- **step6 语料**：每段2-3条，tell(直白) → show(升级)，show版必须带加粗的亮点表达和 skills 标签；**续写另生成 pairs 描写点 4-6 个**（上文规范）
- **step8 范文**：严格衔接段首句、回收全部伏笔、应用step6语料，两段各约100-120词
- 内容用中英混合（框架中文、例句英文），HTML标签内嵌（b/i/span.er-muted等）

## 参考

- 完整范例：`G:\ClaudeCode\Assignment Feedback\essay-review.js` 内 seedJake() / seedVoices()（结构最权威）
- 用户已调好的数据范例：Jake篇（语篇梳理最规范）
- **step6 pairs 图文范例**：`C:\Users\Delphi\Desktop\comp-merged.json` 内"深藏相册的祖母情"篇（5 个描写点+实图，title/text/layout 写法标杆）
