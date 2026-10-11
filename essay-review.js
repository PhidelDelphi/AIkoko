/* ============================================================
   EssayReview / Composition 作文评讲模块（读后续写八步评讲）
   ------------------------------------------------------------
   零侵入接入 AFR：
   - index.html 仅新增：Tab 按钮 + essayView 容器 + 本脚本引用
   - 不修改 script-v2.js / AFR 任何现有元素与逻辑
   - 离开视图由 MutationObserver 兜底（任何原视图显示时自动隐藏本页）
   数据：localStorage 'AFR-composition-v1'，格式与独立版互通
   （{ articles: [...] }，可从独立版导出 JSON 后直接导入）
============================================================ */
(function () {
  'use strict';

  const LS_KEY = 'AFR-composition-v2';
  const ER_VERSION = '20261006p';   // 侧栏底部可见，用于确认浏览器是否加载了最新版（旧缓存时显示旧号）
  console.log('[EssayReview] 已加载 build=' + ER_VERSION + ' ——若您在排查问题，此行版本号即当前页面实际运行的脚本版本');
  const DEFAULT_STEP_NAMES = ["① 梳理语篇", "② 确定主题", "③ 寻找伏笔", "④ 预测情节", "⑤ 反馈问题", "⑥ 输入语料", "⑦ 评价升格", "⑧ 共赏佳作"];
  /* ★应用文八步·普适版（方案A·结构先行序）：审题→基调→布局→建构→自查→语料→评价→佳作
     ③④调序（2026-10-06用户定）：先定三段骨架（谋篇·凤头猪肚豹尾），再往骨架里填肉（建构·四把梯子）；
     ④名"建构"取建构主义之义：在要点基础上主动加工出层次与思想（"转化"只说动作不说方向，已弃用） */
  const PRACTICAL_STEP_NAMES = ["① 审题拆解", "② 定位基调", "③ 谋篇布局", "④ 建构要点", "⑤ 反馈问题", "⑥ 输入语料", "⑦ 评价升格", "⑧ 共赏佳作"];
  const SEED_VER = 6;   /* ★种子内容版本：种子内容有实质更新时 +1，ensureTypes 据此把库里旧种子整体刷新（1=四问版 2=凤猪豹四梯版 3=加本篇建构） */
  /* 步骤⑦学生原卷默认链接（学测网；换考试后用「✎ 改链接」更新） */
  const DEFAULT_XUECE_URL = "https://www.xuece.cn/analysis/overview/studentScore?year=2026&semester=FIRST&examinationId=48751&exampaperId=63668&gradeCode=S03&classorgId=4877&exampaperCreateMode=MANUALLY&initExampaperId=63668&courseCode=ENGLISH&currentRole=";
  const VIEW_IDS = ['preludeView', 'scoresView', 'reviewView', 'mindmapView', 'knowledgeView'];
  const GROUPS = [
    { key: 'practical',    name: '✉️ Practical Writing' },
    { key: 'continuation', name: '✍️ Continuation Writing' }
  ];
  /* 步骤③续写篇指南（五类伏笔速查） */
  const GUIDE_FIVE = "🏠 <b>环境场所</b>　对某地或某个场景集中描写<br>📦 <b>特殊物品</b>　作者特意给镜头特写的物件<br>💔 <b>人物关系</b>　明示或暗示的关系状态<br>⚖️ <b>两难冲突</b>　主角面临的两难选择<br>❓ <b>悬念留白</b>　未解释的话、带省略号的话";
  /* Jake 篇五张伏笔卡（Think Tank 定稿版）；refs = 原文高亮定位（p=段号, q=原文原句） */
  const JAKE_FU = [
    { icon: "🏠", name: "储藏室", type: "环境场所 · 对比型", cls: "c-hj",
      extract: "<i>The place was a disaster. Spiderwebs drooped from every corner, and dust swirled like dirty smoke.</i>",
      reuse: "<i>The room slowly changed from a forgotten mess to a <b>clean, welcoming space</b> — with everything in place and sunlight streaming in.</i>",
      effect: "脏乱 → 窗明几净。<b>房间的转变 = Jake 心态的转变</b>，环境对比承载主题。",
      refs: [{ p: 6, q: "The place was a disaster. Spiderwebs drooped from every corner, and dust swirled" }] },
    { icon: "💔", name: "祖孙关系", type: "情感关系 · 对比型", cls: "c-gx",
      extract: "<i>He didn't even know her that well... the word feeling almost <b>foreign</b> on his tongue.</i>（陌生疏远）",
      reuse: "<i>They spent hours <b>poring over the photos</b>, her laughter mingling with his.</i>（其乐融融）",
      effect: "陌生 → 亲密。这是全文最大的对比股，升值空间最高。",
      refs: [{ p: 5, q: "the word feeling almost foreign on his tongue" }] },
    { icon: "❓", name: "相册封面上的字", type: "悬念留白 · 呼应型", cls: "c-xn",
      extract: "相册封面上那行 <i>Story with Jake (To Be Continued...)</i>",
      reuse: "<i>A fresh photo joined the album — ready to <b>continue their story</b> together.</i>",
      effect: "标题级伏笔，续写结尾<b>必须回收</b>——新照片入册 = “故事继续”，主题升华全靠它。",
      refs: [{ p: 7, q: "Stories with Jake (To Be Continued...)" }] },
    { icon: "⚖️", name: "打篮球 vs 打扫房间", type: "两难选择 · 对比型", cls: "c-ln",
      extract: "<i>he couldn't wait to play basketball... this job was going to take forever.</i>",
      reuse: "<i>Maybe this wasn't such a bad way to spend a Saturday.</i>（范文原句！）",
      effect: "一开始“浪费周六” → 结尾“值得的周六”。同一件事的价值反转。",
      refs: [{ p: 1, q: "couldn't wait to play basketball with his friends" }, { p: 6, q: "this job was going to take forever" }] },
    { icon: "📦", name: "祖母的题字", type: "物品细节 · 呼应型", cls: "c-wp",
      extract: "照片下祖母的手写题字：",
      reuse: "结尾可让祖母再次动笔：<i>Under the new photo, in the same careful handwriting, she wrote: “Glad to be home, Jake.”</i>",
      effect: "一句话的前世今生，首尾闭环，最能打动阅卷人。",
      refs: [{ p: 7, q: "Glad to meet you, baby Jake." }] }
  ];

  /* 步骤⑤典型问题自查单（说明 + 微情境对照清单，可跳转⑥语料） */
  const JAKE_STEP5 = [
    { t: "烂尾楼（伏笔未回收）",
      desc: "原文埋下的关键线索——相册题字 <i>(To Be Continued...)</i>、储藏室的脏乱、祖孙的疏离——相当于<b>开了工的地基</b>，续写却没把它们盖起来。埋线索不回收，作文就成了<b>烂尾楼</b>；这是评分标准里“与原文融洽度”的直接失分点。",
      checks: [
        { q: "结尾新照片入册 / 故事继续（回应 <i>To Be Continued</i>）" },
        { q: "储藏室焕然一新（环境对比）", s6: 2 },
        { q: "祖孙其乐融融（关系对比）", s6: 4 }],
      pred: "常见病例：结尾只写祖孙拥抱，忘了让“故事继续”。" },
    { t: "说明书（只写结论，不写表现）",
      desc: "典型现象：<i>He was sad. He cleaned the house.</i>——只交付<b>结果</b>，不展示<b>过程</b>。就像产品说明书只报参数不给体验：sad 是什么样子（手、眼、呼吸）？cleaned 是怎么打扫的（扫、叠、卷）？阅卷人要的是<b>演示</b>，不是通知。自查：以下微情境，你的作文给镜头了吗？",
      checks: [
        { q: "翻看照片时的画面感（祖母养育的细节）", s6: 0 },
        { q: "打扫储藏室的动作链", s6: 1 },
        { q: "祖母接过相册的神态", s6: 3 },
        { q: "两人依偎互动的温馨镜头", s6: 4 }],
      pred: "常见病例：He was sad. He cleaned the room. They were happy. —— 全篇说明书。" },
    { t: "独角戏（段落内比重失衡）",
      desc: "每段内部的三个微情境是有<b>主次</b>的：主干情节（如 Para 1 的照片触动→转变）该唱主角，过渡性交代点到即止。不会给情节排重要性，就会把第一拍写到一半以上篇幅，后面的关键情节（打扫收工 / 祖母反应）被挤没了——整段成了独角戏。",
      checks: [
        { q: "我能说出每段三个微情境的主次排序吗？主干是哪个？" },
        { q: "有没有哪一拍占了全段一半以上篇幅？" },
        { q: "关键情节（打扫收工 / 祖母反应）分到了足够戏份吗？", s6: 2 },
        { q: "过渡性叙述是否点到即止（约三成以内）？" }],
      pred: "常见病例：Para 1 看照片写了 80 词，打扫一笔带过；Para 2 只剩 30 词——头重脚轻。" },
    { t: "变脸术（情感演变突变）",
      desc: "情感转变没有驱动源、没有过程——上一句还在抱怨，下一句就深爱。转变必须有触发事件（照片）并分层递进：触动 → 愧疚 → 行动。",
      checks: [
        { q: "转变有明确的驱动事件（照片）", s6: 0 },
        { q: "触动 → 愧疚 → 行动，分层递进", s6: 0 },
        { q: "当晚 → 次日，时间断开自然" }],
      pred: "常见病例：无照片铺垫，突然 I love Grandma so much." }
  ];

  let inited = false, curArtId = null, curStep = 0, editing = false, DB = null;
  let groupsOpen = { practical: true, continuation: true };

  /* 步骤标签按文体区分：续写 ①梳理语篇…⑧共赏佳作；应用文 审题拆解…共赏佳作 */
  function stepNames(a) {
    const custom = a && a.stepsMeta;
    if (Array.isArray(custom) && custom.length === 8) return custom;
    return (a && a.type === 'practical') ? PRACTICAL_STEP_NAMES : DEFAULT_STEP_NAMES;
  }
  function curHwName() {
    const el = document.getElementById('homeworkBtnText');
    return el ? (el.textContent || '').trim() : '';
  }
  /* 数据迁移：老数据补 type（有 story 字段 = 续写），保证分组可用；并清洗异常 stepsMeta */
  function ensureTypes(db) {
    db.articles.forEach(a => {
      if (!a.type) a.type = (a.story && a.story.length) ? 'continuation' : 'practical';
      /* ★应用文题干连写行自动拆分（逻辑在 splitRunOnLines，与 parsePracticalCore 共用；幂等） */
      if (a.type === 'practical' && Array.isArray(a.story)) {
        a.story = splitRunOnLines(a.story);
      }
      /* ★步骤名迁移：旧版应用文步骤名（③转化④谋篇旧序 / ④转化要点旧名）→ 最新序与名 */
      if (a.type === 'practical' && Array.isArray(a.stepsMeta) && a.stepsMeta.length === 8 &&
          (String(a.stepsMeta[3] || '').indexOf('转化要点') >= 0 || String(a.stepsMeta[2] || '').indexOf('转化要点') >= 0)) {
        a.stepsMeta = PRACTICAL_STEP_NAMES.slice();
      }
      /* ★种子篇版本化升级：english-party 的 seedVer 与代码 SEED_VER 不一致 → 整体刷新为最新种子
         （特征检测法每加新内容都要改条件，改为版本号一劳永逸；种子=示范品，要定制请"复制为模板"新建篇） */
      if (a.id === 'english-party' && a.seedVer !== SEED_VER) {
        const s = seedEnglishParty();
        ['rowLabels', 'fuLabels', 'story', 'step1', 'step2', 'step3', 'step4', 'step5', 'step6', 'step8'].forEach(k => {
          if (s[k] !== undefined) a[k] = JSON.parse(JSON.stringify(s[k]));
        });
        a.stepsMeta = PRACTICAL_STEP_NAMES.slice();
        a.seedVer = SEED_VER;
      }
      /* ★旧版应用文篇结构升级（回迁后旧数据兼容）：③无凤猪豹sections→补通用骨架；⑤无正反案例→补12病理骨架。
         幂等：骨架带标记字段，已有结构不覆盖；占位内容待教师按新八步重新生成（可用"Composition应用文步骤"技能） */
      if (a.type === 'practical') {
        if (!(a.step4 && Array.isArray(a.step4.sections))) {
          a.step4 = a.step4 || {};
          a.step4.overview = '凤引出来意 → 猪充实理由与安排 → 豹推动行动——三段各有其职（本篇为旧版数据，骨架已升级，内容请重新生成）。';
          a.step4.sections = [
            { icon: '🐦', part: '凤头 · 开头段', budget: '约15词 · 1-2句', cls: 'c-wp', goal: '3秒定向 + 定调（谁写、为什么写、第一句立住语域）', micro: '呼语 →（自我介绍·仅当对方不认识你）→ 目的句 → 背景句', plots: ['（待填：本题开头段示范句）'] },
            { icon: '🐗', part: '猪肚 · 主体段', budget: '约45词 · 3-4句', cls: 'c-gx', goal: '得分点全展开——读者的所有疑问在此被解决', micro: '总起句 → 层次① → 层次② → 个性化句（层次怎么爬梯 → ④建构要点）', plots: ['（待填：本题主体段层次示范）'] },
            { icon: '🐆', part: '豹尾 · 结尾段', budget: '约20词 · 1-2句', cls: 'c-ln', goal: '促成行动 + 留余韵', micro: '行动句（带期限）→ 期待句', plots: ['（待填：本题结尾段示范）'] }
          ];
        }
        if (!(Array.isArray(a.step5) && a.step5.some(c => c && c.bad !== undefined))) {
          const SK = (t, src, note) => ({ t, src, bad: '（待填：本题反面例句）', good: '（待填：本题正面例句）', note });
          a.step5 = [
            SK('立意偏离主题', '审题病 · 五维①内容连贯', '回看①的任务卡：一句话锚点不能丢。'),
            SK('要点遗漏缺失', '审题病 · 五维①内容完整', '时间四要素 + 要点逐条对照题干。'),
            SK('格式杂糅混乱', '审题病 · 五维⑤格式规范', '文体的格式三件套与口吻要纯正。'),
            SK('人称错位失联', '审题病 · 五维③得体性', '信写给 you，不是谈论 he。'),
            SK('交际效果欠佳', '基调病 · 五维③得体性', '②情感分寸的落点：诚意给足、决定权留给对方。'),
            SK('结构松散凌乱', '结构病 · 五维④结构流畅', '③凤猪豹各归其位。'),
            SK('要点重复冗余', '结构病 · 五维①内容完整', '猪肚要分层，不要分句堆放。'),
            SK('内容宽泛空洞', '建构病 · 五维②层次性', '④四把梯：具体内容上句才是内容。'),
            SK('思想浅显单薄', '建构病 · 五维②思想性', '梯子爬到顶（意义层）才见思想。'),
            SK('内容陈旧老套', '建构病 · 五维②思想性', '从本题具体情境切入，弃万金油。'),
            SK('语言单调简单', '语言病 · 五维③丰富性', '升级路径见⑥语料（Tell➜Show）。'),
            SK('时态混乱错位', '语言病 · 五维⑤语法规范', '动笔前定"这封信活在什么时间里"。')
          ];
        }
      }
      /* stepsMeta 必须是恰好 8 项的数组，否则丢弃（防脏数据导致步骤栏空白/错乱） */
      if (a.stepsMeta && !(Array.isArray(a.stepsMeta) && a.stepsMeta.length === 8)) delete a.stepsMeta;
      /* 旧版续写指南（含"复用规则"字样）升级为五类伏笔速查表 */
      if (a.type === 'continuation' && a.step3 && typeof a.step3.guide === 'string' && a.step3.guide.indexOf('复用规则') >= 0) {
        a.step3.guide = GUIDE_FIVE;
      }
      /* Jake 篇旧版五卡升级为定稿版（合并卡 / 缺 refs / 含旧版失配定位句时刷新） */
      if (a.id === 'jake-album' && a.step3 && Array.isArray(a.step3.items) &&
          a.step3.items.some(it => it && (it.name === '相册 + 题字' || !it.refs ||
            (it.refs || []).some(r => r && r.q && r.q.indexOf('like dirty smoke') >= 0)))) {
        a.step3.items = JSON.parse(JSON.stringify(JAKE_FU));
      }
      /* Jake 篇步骤⑤升级为自查单版（旧版无 checks / 含旧名"伏笔蒸发"“贴标签”“流水账”时刷新） */
      if (a.id === 'jake-album' && Array.isArray(a.step5) &&
          a.step5.some(c => c && (!Array.isArray(c.checks) || /伏笔蒸发|贴标签|流水账/.test(c.t || '')))) {
        a.step5 = JSON.parse(JSON.stringify(JAKE_STEP5));
      }
    });
  }
  /* 规范化：任何残缺篇目自动补全默认结构——渲染层永不因缺字段崩溃 */
  function normalizeArticle(a) {
    if (!a || typeof a !== 'object') return null;
    if (!a.id) a.id = 'art-' + Math.random().toString(36).slice(2, 9);
    if (!a.title) a.title = '未命名篇目';
    if (a.type !== 'practical') a.type = 'continuation';
    if (!Array.isArray(a.story)) a.story = [];
    if (!Array.isArray(a.openers)) a.openers = ['', ''];
    if (!Array.isArray(a.step1)) a.step1 = [];
    a.step1 = a.step1.filter(x => x && typeof x === 'object');
    a.step1.forEach(s => { ['paras', 'main', 'implied', 'feelings'].forEach(k => { if (typeof s[k] !== 'string') s[k] = ''; }); });
    if (!Array.isArray(a.step2)) a.step2 = [];
    a.step2 = a.step2.filter(x => x && typeof x === 'object');
    a.step2.forEach(qa => { if (typeof qa.q !== 'string') qa.q = ''; if (typeof qa.a !== 'string') qa.a = ''; });
    const s3 = (a.step3 && typeof a.step3 === 'object') ? a.step3 : (a.step3 = {});
    if (typeof s3.guide !== 'string') s3.guide = '';
    if (!Array.isArray(s3.items)) s3.items = [];
    s3.items = s3.items.filter(x => x && typeof x === 'object');
    s3.items.forEach(it => { ['icon', 'name', 'type', 'cls', 'extract', 'reuse', 'effect'].forEach(k => { if (typeof it[k] !== 'string') it[k] = it[k] || ''; }); });
    if (typeof s3.patterns !== 'string') s3.patterns = '';
    const s4 = (a.step4 && typeof a.step4 === 'object') ? a.step4 : (a.step4 = {});
    ['p1', 'p2'].forEach(k => {
      const b = (s4[k] && typeof s4[k] === 'object') ? s4[k] : (s4[k] = {});
      if (typeof b.keywords !== 'string') b.keywords = '';
      if (!Array.isArray(b.plots)) b.plots = [];
      if (b.openerTxt !== undefined && typeof b.openerTxt !== 'string') delete b.openerTxt;
    });
    if (!Array.isArray(a.step5)) a.step5 = [];
    a.step5.forEach(c => {
      ['t', 'std', 'pred'].forEach(k => { if (typeof c[k] !== 'string') c[k] = ''; });
      if (typeof c.desc !== 'string') c.desc = c.std || '';   // 新版说明字段，旧数据回落到 std
      if (!Array.isArray(c.checks)) c.checks = [];
      c.checks.forEach(k => { if (typeof k.q !== 'string') k.q = ''; if (k.s6 !== undefined && !/^\d+$/.test(String(k.s6))) delete k.s6; });
    });
    const s6 = (a.step6 && typeof a.step6 === 'object') ? a.step6 : (a.step6 = {});
    if (!Array.isArray(s6.qs)) s6.qs = [];
    s6.qs = s6.qs.filter(x => x && typeof x === 'object');
    s6.qs.forEach(q => { if (typeof q.q !== 'string') q.q = ''; if (typeof q.p !== 'string') q.p = ''; if (!Array.isArray(q.corpus)) q.corpus = []; q.corpus.forEach(cp => { if (typeof cp.tell !== 'string') cp.tell = ''; if (typeof cp.show !== 'string') cp.show = ''; if (!Array.isArray(cp.skills)) cp.skills = []; }); });
    if (typeof s6.extra !== 'string') s6.extra = "<p class='er-muted'>（此区可导入补充语料）</p>";
    if (!Array.isArray(s6.images)) s6.images = [];
    s6.images = s6.images.filter(im => im && typeof im === 'object');
    s6.images.forEach(im => { if (typeof im.src !== 'string') im.src = ''; if (typeof im.cap !== 'string') im.cap = ''; });
    /* 图×语料成对（新版结构）；旧 images 自动迁移为 pairs */
    if (!Array.isArray(s6.pairs)) s6.pairs = [];
    if (!s6.pairs.length && s6.images.length) {
      s6.pairs = s6.images.map(im => ({ img: im.src || '', w: 0, text: im.cap || '' }));
      s6.images = [];
    }
    s6.pairs = s6.pairs.filter(x => x && typeof x === 'object');
    s6.pairs.forEach(x => {
      if (typeof x.text !== 'string') x.text = '';
      if (typeof x.title !== 'string') x.title = '';
      if (!Array.isArray(x.imgs)) x.imgs = [];
      if (!x.imgs.length && typeof x.img === 'string' && x.img) x.imgs = [{ src: x.img, w: isFinite(x.w) ? x.w : 0 }];
      delete x.img; delete x.w;
      x.imgs = x.imgs.filter(m => m && typeof m === 'object' && typeof m.src === 'string');
      x.imgs.forEach((m, k) => {
        if (!isFinite(m.w) || m.w <= 0) m.w = 280;
        if (!isFinite(m.h) || m.h <= 0) m.h = 180;
        if (!isFinite(m.x) || m.x < 0) m.x = (k % 2) * (m.w + 12);   /* 旧数据迁移：网格摆位 */
        if (!isFinite(m.y) || m.y < 0) m.y = Math.floor(k / 2) * (m.h + 12);
        delete m.br;
      });
      if (['r', 'b', 'l'].indexOf(x.layout) < 0) x.layout = 'r';
    });
    /* 续写篇默认呈现“待添加图文”骨架：空作业也能直接进入描写点模式（应用文不预置） */
    if (!s6.pairs.length && a.type === 'continuation') {
      s6.pairs = [0, 1, 2].map(() => ({ title: '', text: '', imgs: [{ src: '', x: 0, y: 0, w: 280, h: 180 }], layout: 'r' }));
    }
    const s7 = (a.step7 && typeof a.step7 === 'object') ? a.step7 : (a.step7 = {});
    if (typeof s7.text !== 'string') s7.text = "<p class='er-muted'>（导入学生作文）</p>";
    if (!Array.isArray(s7.images)) s7.images = [];
    /* ★步骤⑦评价升格 V3字段初始化（旧数据兼容） */
    if (!Array.isArray(a.ev7Stars)) a.ev7Stars = [0,0,0,0,0];
    if (typeof a.ev7Band !== 'number') a.ev7Band = 1;
    if (typeof a.ev7Auto !== 'boolean') a.ev7Auto = false;
    if (!Array.isArray(a.ev7Cards)) a.ev7Cards = [{who:"",band:"",score:"",good:"",prob:"",next:""}];
    if (!a.ev7Self || typeof a.ev7Self !== 'object') a.ev7Self = {who:"",band:"",score:"",good:"",prob:"",next:""};
    if (!Array.isArray(a.ev7Submitted)) a.ev7Submitted = [];
    if (!Array.isArray(a.ev7Wall)) a.ev7Wall = [];
    if (!Array.isArray(a.ev7Dirs)) a.ev7Dirs = [];
    if (typeof a.ev7Src !== 'string') a.ev7Src = "";
    if (typeof a.ev7Editing !== 'boolean') a.ev7Editing = false;
    if (!Array.isArray(a.ev7Logs)) a.ev7Logs = [];
    if (typeof a.ev7Why !== 'string') a.ev7Why = "";
    if (typeof a.ev7Plus !== 'string') a.ev7Plus = "";
    if (typeof a.ev7Up !== 'string') a.ev7Up = "";
    if (!Array.isArray(a.ev7Fu)) a.ev7Fu = [];   /* ★应用文⑦要点覆盖清单（勾选数组，续写不用） */
    const s8 = (a.step8 && typeof a.step8 === 'object') ? a.step8 : (a.step8 = {});
    if (typeof s8.text !== 'string') s8.text = '';
    if (Array.isArray(a.stepsMeta) && a.stepsMeta.length !== 8) delete a.stepsMeta;
    return a;
  }
  function blankArt() { return normalizeArticle({ id: '__blank__', title: '（无篇目，请导入或复制模板）', type: 'continuation' }); }

  /* ================= 数据 ================= */
  const DEFAULT_DB = { articles: [/* 首次进入由 seedJake() 注入 */] };

  function seedJake() {
    return {
      id: 'jake-album', title: '深藏相册的祖母情', source: '2025.5 浙江镇海中学考前模拟卷',
      type: 'continuation', hw: '高三上开学检测',
      story: [
        "It was a sunny Saturday morning, and Jake had just put on his sneakers when his phone buzzed. It was a message from Ryan: “Meet at the park in 15 minutes?” Jake smiled. It had been a long week of school, and he couldn't wait to play basketball with his friends. Just as he was heading out, his mom called from the kitchen.",
        "“Jake! Come back! I need your help with the storage room.”",
        "“But Mom, I told Ryan I'd meet him at the park.” Jake protested.",
        "“We talked about this. Grandma is moving in this weekend, so we need to clean out the storage room to make space for her.”",
        "“Grandma?” Jake thought, the word feeling almost foreign on his tongue. He didn't even know her that well—it had been years since she last visited, and now she was moving in? He couldn't believe he had to give up his Saturday for someone he barely knew. With complaints and sighs, he kicked at the floor as he trudged down the hallway, dragging his feet like they weighed a ton.",
        "Stepping into the storage room, his nose wrinkled in disgust. The place was a disaster. Spiderwebs drooped from every corner, and dust swirled in the sunlight like dirty smoke. Boxes teetered in unstable stacks, a rolled-up carpet with worn edges lay half-spilled across the floor, and forgotten junk crowded every inch. Jake let out a long, dramatic sigh—this job was going to take forever.",
        "Just as he was about to give up and sneak a text to Ryan, a faded blue album tucked at the bottom of the suitcase caught his eye. Faint words were etched on its leather cover: Stories with Jake (To Be Continued...). He pulled it out and flipped it open—the pages were filled with moments of him and his grandmother. On the very first page was a photo: his grandmother, much younger then, cradling a tiny baby wrapped in a soft blanket. At the bottom of the photo he saw some words in careful handwriting: “Glad to meet you, baby Jake.”"
      ],
      openers: [
        "As he flipped through more photos, his eyes began to mist.",
        "Next morning, when his grandmother stepped into her new room, Jake handed her the album."
      ],
      step1: [
        { paras: "Para 1-5", main: "Jake had to sacrifice his basketball plan to clean the storage room for Grandma.", implied: "Jake hardly knew Grandma and prioritized his own pleasure.", feelings: "Annoyed, reluctant, disappointed" },
        { paras: "Para 6", main: "Jake entered the messy storage room and thought the cleaning would take forever.", implied: "The mess mirrors Grandma's long absence and Jake's long separation from her.", feelings: "Disgusted, impatient, helpless" },
        { paras: "Para 7", main: "Jake discovered an old photo album reflecting warm early memories with Grandma.", implied: "Grandma once loved Jake deeply, but Jake had forgotten those precious moments.", feelings: "Surprised, touched" }
      ],
      step2: [
        { q: "文章中什么发生了改变，从状态 A 变成了状态 B？", a: "The Grandma-grandson relationship: from <b>estrangement</b> to <b>closeness</b>." },
        { q: "造成状态 A 的原因是什么？什么转机 / 契机造成了状态 B？", a: "A 的原因：<b>The long separation.</b><br>B 的契机：<b>The accidental discovery of an old album holding shared memories.</b>" },
        { q: "What message does the story try to convey?", a: "Time and distance may weaken family ties, yet shared memories can reawaken love and rebuild family bonds.<br><span class='er-muted' style='font-size:12px'>（另一表述）Shared memories can transcend time and space to restore faded family bonds.</span>" }
      ],
      step3: {
        guide: GUIDE_FIVE,
        items: JAKE_FU,
        patterns: "对比兑现：<i>X had once been..., but now...</i> / <i>What used to be... was now...</i>　｜　呼应兑现：复用原文关键词 + 升级（<i>to be continued → their story, continued</i>）"
      },
      step4: {
        p1: { keywords: "flipped through more photos / mist", plots: ["<b>情节A</b>：What Jake saw in these photos when flipping through them.（照片细节 + 回忆）", "<b>情节B</b>：The change of his feelings from complaining to guilty and ashamed.（照片驱动转变；He texted Ryan to cancel the appointment.）", "<b>情节C</b>（段末，由 Para 2 段首句反推）：The process of cleaning the room and the new look of the room.（当晚必须收工）"] },
        p2: { keywords: "the next morning / new room / the album", plots: ["<b>情节A</b>：Grandma's reaction and feeling at the sight of the room and the album.（神态特写）", "<b>情节B</b>：Their interaction and communication.（共看相册，感情拉近）", "<b>情节C</b>（结尾三选一）：<span class='er-chip er-chip-end'>close-up shot 特写镜头</span><span class='er-chip er-chip-end'>natural ending 自然结尾</span><span class='er-chip er-chip-end'>elevation 主题升华</span>"] }
      },
      step5: JAKE_STEP5,
      step6: {
        qs: [
          { p: "Para 1", q: "How to show the delicate change of Jake's feelings? <span class='er-muted'>(to justify Jake's decision)</span>", corpus: [{ tell: "Jake felt guilty.", show: "<b>Complaints gave way to guilt</b> as he realized how much love she had poured into his childhood.", skills: ["无灵主语", "宾从"] }] },
          { p: "Para 1", q: "How to show the process of cleaning the storage room? <span class='er-muted'>(to emphasize Jake's devotion)</span>", corpus: [{ tell: "Jake cleaned the room carefully.", show: "He <b>rolled up</b> the old carpet, <b>stacked</b> boxes neatly, and <b>swept</b> the floor, stirring up clouds of dust. Spiderwebs clung to his sleeves, but he didn't stop.", skills: ["动作链", "非谓语"] }] },
          { p: "Para 1", q: "How to show the room's new look? <span class='er-muted'>(to echo with the “new room”)</span>", corpus: [{ tell: "The room became clean and tidy.", show: "<b>What used to be</b> a forgotten mess <b>was now</b> a bright, welcoming room, with sunlight streaming in.", skills: ["对比兑现", "with复合结构"] }] },
          { p: "Para 2", q: "How to show the natural change of the Grandma-grandson relation? <span class='er-muted'>(to contrast with the previous estrangement)</span>", corpus: [{ tell: "Grandma was moved.", show: "Her wrinkled hands <b>trembled</b> as she touched the cover, <b>tears welling up</b> in her eyes, “You kept this?” she whispered.", skills: ["独立主格", "神态描写"] }] },
          { p: "Para 2", q: "How to show the warmth of their interaction and dialogue? <span class='er-muted'>(to stress the continuity of family bond)</span>", corpus: [{ tell: "They talked happily.", show: "They spent hours <b>poring over</b> the photos, her laughter <b>mingling with</b> his as stories unfolded.", skills: ["强势动词", "独立主格"] }] }
        ],
        extra: "<p class='er-muted'>（此区可导入补充语料）</p>"
      },
      step7: { text: "<p class='er-muted'>导入学生作文，全班一起评价并提出改进意见。<br>点击下方按钮导入文字或图片。</p>", images: [] },
      step8: { text: "<b>Para 1</b><br>As he flipped through more photos, Jake's eyes began to mist. There were pictures of him as a baby, always in his grandmother's arms—smiling, feeding him, helping him take his first steps. He hadn't remembered any of it, but the photos told a story of love and time shared. His anger from earlier now felt silly. Taking a deep breath, he set the album aside and got to work. He rolled up the old carpet, stacked boxes neatly, and swept the floor, stirring up clouds of dust. Spiderwebs clung to his sleeves, but he didn't stop. The room slowly changed from a forgotten mess to a clean, welcoming space. As sunlight streamed in, Jake looked around and smiled. Maybe this wasn't such a bad way to spend a Saturday.<br><br><b>Para 2</b><br>Next morning, when his grandmother stepped into her new room, Jake handed her the album. She blinked in surprise, then smiled softly as she ran her fingers over the worn cover. “You found this?” she asked. Jake nodded. “I didn't know we had so many memories.” They sat together on the edge of the bed, flipping through the pages. She laughed at some photos, explained others, and paused with misty eyes at a few. When they reached the last page, Jake grinned, “Let's add a new one.” He grabbed his phone, held it out, and the two leaned in close. “Say cheese!” Click. A fresh photo joined the album—Jake and his grandmother, smiling side by side, ready to continue their story together." }
    };
  }

  /* ★应用文种子篇目：English Party 邀请函（2023新课标I卷）
     通用邀请函骨架——八步数据全部按普适评讲流程编写，换任何一篇应用文只换内容不换结构 */
  function seedEnglishParty() {
    return {
      id: 'english-party', title: 'English Party 邀请函', source: '2023新课标I卷 · 应用文',
      type: 'practical', hw: '高三上开学检测',
      stepsMeta: PRACTICAL_STEP_NAMES,
      /* ①审题拆解三层维度：题干明示什么 / 必须读出什么 / 哪里容易读错（与②"决策推断"分工：①只管事实与陷阱，不谈语气口吻） */
      rowLabels: ['题干信息', '隐含要求', '易错预警'],
      fuLabels: ['台阶', '示范'],
      story: [
        "假定你是李华。你校将举办英语派对（English Party），请给你校外教Chris写一封邮件邀请他参加，内容包括：",
        "1. 活动时间与地点；",
        "2. 活动内容。",
        "注意：",
        "1. 写作词数应为80左右；",
        "2. 请按如下格式在答题卡的相应位置作答。",
        "Dear Chris,",
        "Yours sincerely,",
        "Li Hua"
      ],
      openers: [],   /* 题干侧不再显示三段规划（规划内容归④谋篇布局）——openers留空 */
      step1: [
        { paras: "Who am I?", main: "李华，本校学生（题干明示）", implied: "以学生个人名义写信——不是官方发布口吻", feelings: "自封头衔（chairman of the Student Union）——题干没给的不能加" },
        { paras: "To whom?", main: "外教 Chris（题干明示）", implied: "师长 + 英语本族语者：表达习惯按英语书信的路数来", feelings: "人称写成 he/she 第三方（Chris is kind. He can...）——收信人变成了谈论对象" },
        { paras: "What?", main: "邀请信：邮件邀请 Chris 参加 English Party（题干明示）", implied: "邀请 ≠ 通知 ≠ 倡议——只能恳请，不能布置", feelings: "写成通知口吻（Attention please / Everyone should come）" },
        { paras: "Where?", main: "答题卡书信格式（Dear Chris, / Yours sincerely, / Li Hua 题干已给）", implied: "三件套齐全 + 80 词上限", feelings: "漏落款署名；词数失控（80 写到 120）" },
        { paras: "Why?", main: "让 Chris 参加 Party（题干明示）；潜台词：最好还表演节目（\"擅长唱歌\"是可用信息）", implied: "任务成功的标准 = Chris 答应来", feelings: "写成活动介绍（I'd like to tell you about...）——目的悄悄降级成了告知" },
        { paras: "★ 任务卡合成", card: "我是李华，以学生身份用邮件邀请外教 Chris 参加 English Party（并期待他表演节目），80 词，书信三件套。", tag: "［半正式偏正式 · 热情留白 · 联结配方：契合＋感情＋身份］", hint: "动笔前默念一遍——这句话就是全篇的锚。语用标签由②四问判定后回填。" }
      ],
      /* ②定位基调·四问辨析台：每问四选项（错误项=真实病症方向），学生先揣摩选择再揭示。
         四维框架具一般性：目的四型/语域四格/温度四档/联结三通道——换题只换落点与例句 */
      step2: [
        { q: "① 交际目的：这封信最终要 Chris 做什么？",
          opts: [
            { t: "A. 让他知道有这件事（告知型）", v: false, why: "写完全文 Chris 只是\"知道了\"——那是通知的功能，全文没有一处推动行动。" },
            { t: "B. 让他答应来，最好还愿意表演（促成型）", v: true, why: "邀请 = 促成。全文每句都要往\"答应\"推：安排说清（能来）、理由给足（想来）、回复路径留好（怎么答）。" },
            { t: "C. 展示我的英语水平（表现型）", v: false, why: "堆难词炫技，收信人被无视——交际对象消失了。" },
            { t: "D. 让他喜欢我（讨好型）", v: false, why: "满篇客套吹捧，真正的目的（他来表演）反而失焦。" }
          ],
          a: "落点 <b>B</b>。判断法：想象 Chris 读完放下手机——B 型的信让他\"想回一句 I'd love to\"，A 型只会让他\"哦\"。四型对照：通知=告知 · 邀请/请求=促成 · 申请=表现 · 道歉=修复。" },
        { q: "② 关系定位：李华与 Chris 的关系落在标尺哪一格？",
          opts: [
            { t: "A. 正式（对校长 / 陌生机构）", v: false, why: "过冷。Chris 是天天见面的外教，不是公文收件人。" },
            { t: "B. 半正式偏正式（师长：亲切而恭敬）", v: true, why: "\"熟而不友\"——认识很久（可亲）＋ 评过我作业（须敬）。亲切可以有（We would be glad），随意不行（Hey / You must）。" },
            { t: "C. 半正式平视（不熟的家长 / 房东）", v: false, why: "少了敬意——师生之间的权力差还在。" },
            { t: "D. 非正式（好友：Hey, wanna come?）", v: false, why: "最高频误判：\"外教很随和啊\"——随和是性格，语域看关系。师长终归是师长。" }
          ],
          a: "落点 <b>B</b>。语域标尺四格（正式→非正式）任何题先标位：通知/申请信=正式 · 邀请/感谢师长=偏正式 · 托不熟的人=平视 · 给好友=非正式。" },
        { q: "③ 情感分寸：这封信该多\"热\"？",
          opts: [
            { t: "A. 越热越好（满篇感叹、really really want）", v: false, why: "热情变成施压——师长被架住了。" },
            { t: "B. 热在诚意，留白在决定权", v: true, why: "热情端：It would be our honor / we would be glad（诚意给足）；恭敬端：Would you be available... / if you could...——虚拟语气 = 把决定权还给对方（他有拒绝权，邀请不施压）。" },
            { t: "C. 公事公办，零度叙述", v: false, why: "信息全对，但不像邀请——像会议通知。" },
            { t: "D. 卑微恳求（I beg you...）", v: false, why: "过谦失度——学生请老师，不是下级求上级。" }
          ],
          a: "落点 <b>B</b>。分寸的语法化：虚拟语气就是\"恭敬的留白\"——形式即功能。" },
        { q: "④ 联结路径：靠什么与 Chris 建立联结？",
          opts: [
            { t: "A. 讲道理（This party will enrich our school life...）", v: false, why: "官方\"意义牌\"——学生最爱写，对师长最无力：他不需要你告诉他活动有意义。道理是单向输出，不产生联结。" },
            { t: "B. 给契合（You are good at singing——舞台正好为你而设）", v: true, why: "联结通道①：他的特长 × 活动的需求对上号——\"这舞台缺你\"（被需要）。" },
            { t: "C. 动感情（We would be glad to have you with us）", v: true, why: "联结通道②：真诚的期待感——\"我们想有你\"。" },
            { t: "D. 抬身份（It would be our honor if you could...）", v: true, why: "联结通道③：特邀感——\"您配得上这份邀请\"（师长受用的尊重）。" }
          ],
          a: "配方 <b>B＋C＋D</b>，道理最多一句背景。三通道记住：契合是\"正好\"、感情是\"想你\"、身份是\"配您\"——通道开一两条，联结就建立；道理牌谁也打不动。" }
      ],
      /* ④建构要点·四把梯子：层次性=爬梯过程，思想性=顶层风景（与⑦五维"要点层次性和思想性"闭环） */
      step3: {
        guide: "<b>梯子爬到顶，就是思想性</b>。主体段的得分项不能平铺——沿一把思维阶梯往上爬：层次性是爬的过程，思想性是顶层风景。学生作文\"平\"，病根是梯子只爬了第一级（罗列事实）从不登顶。四把梯各有适用（卡内标注），80 词的猪肚通常<b>选一把梯爬两三级即可</b>，不必四把全上。",
        items: [
          { icon: "⛏", name: "深度梯", type: "由表及里", cls: "c-wp", extract: "现象 → 原因 → 本质／价值", reuse: "<i>You are good at singing</i>（表·契合）→ <i>your song will be the highlight of the party</i>（里·活动价值）→ <i>it will encourage us to explore the beauty of English</i>（顶·学习意义）", effect: "适用：分析\"为什么喜欢 / 为什么推荐\"——三格爬完，一句顶三句。" },
          { icon: "⛰", name: "高度梯", type: "由小到大", cls: "c-gx", extract: "个人 → 集体 → 社会／一代人", reuse: "<i>your performance</i>（个人）→ <i>light up the party for everyone</i>（集体）→ <i>show how music brings us closer</i>（社会·人际）", effect: "适用：分析影响、解决方案、意义——视野一格比一格宽。" },
          { icon: "🪜", name: "认知梯", type: "由低到高", cls: "c-hj", extract: "了解 → 实践 → 创造", reuse: "<i>watch English plays</i>（了解）→ <i>sing and perform yourselves</i>（实践）→ <i>create your own short plays</i>（创造）", effect: "适用：安排活动、写收获与成长——认知层级逐级抬升。" },
          { icon: "🎈", name: "抽象梯", type: "由实到虚", cls: "c-ln", extract: "具体事实 → 意义价值", reuse: "<i>an English Party</i>（事实）→ <i>a window into another culture</i>（意义）→ <i>a chance to think and speak as young global citizens</i>（价值）", effect: "适用：结尾升华、点出活动价值——豹尾留余韵的那一句常在这里。" }
        ],
        patterns: "登梯衔接句式：<i>What lies behind...</i>（进一层）／ <i>not only..., but also...</i>（双层递进）／ <i>More importantly, ...</i>（抬升）／ <i>It is... that truly matters.</i>（登顶）",
        /* ★第二部分·本篇建构：支架的应用——本题选梯 + 爬梯现场（三级成句）+ 与③猪肚框架对接。
           支架的意义在应用：学生根据本篇内容定梯后，看梯子怎样架到本题要点上爬出真句 */
        build: {
          pick: "本题两个得分点各配一把梯：<b>活动安排 → 认知梯</b>（活动按认知层级排布，\"安排感\"变\"设计感\"）；<b>个性化邀请 → 深度梯</b>（从契合爬到意义，一句顶三句）。",
          runs: [
            { ladder: "认知梯", point: "要点② · 活动内容", cls: "c-hj", steps: [
              { lvl: "第1级·了解", sent: "You can watch English plays and enjoy poetry reading by our classmates." },
              { lvl: "第2级·实践", sent: "Better still, you can sing along and perform with us on stage." },
              { lvl: "第3级·创造", sent: "For the boldest, there is even a chance to create your own short plays — the stage is yours." }
            ], note: "三格连排 = ranging from...to... 的升级版：活动不再并列堆放，而是逐级深入。这一格格正是③猪肚里的\"层次①②\"。" },
            { ladder: "深度梯", point: "个性化邀请 · 升档句", cls: "c-wp", steps: [
              { lvl: "表·契合", sent: "Given your gift for singing," },
              { lvl: "里·价值", sent: "your song will surely be the highlight of the party," },
              { lvl: "顶·意义", sent: "encouraging us to explore the beauty of English through music." }
            ], note: "三格用分词结构合成一句——这就是③猪肚里\"个性化句\"的最终形态：一句顶三句，④的终点产出。" }
          ]
        }
      },
      /* ③谋篇布局·凤头猪肚豹尾：三段各达成什么+段内微结构+字数预算（凤15·猪45·豹20） */
      step4: {
        overview: "凤引出来意 → 猪充实理由与安排 → 豹推动行动——80 词三段各有其职，一气贯通。",
        sections: [
          { icon: "🐦", part: "凤头 · 开头段", budget: "约15词 · 1-2句", cls: "c-wp",
            goal: "3秒定向 + 定调：读信人立刻知道谁、为什么写；第一句就立住语域（承②的判定）",
            micro: "呼语 →（自我介绍·仅当对方不认识你）→ 目的句 → 背景句",
            plots: ["<b>目的句</b>（开门见山）：I am writing to invite you to... —— 三秒内知道这封信要干什么", "<b>背景句</b>（一句即可）：To enrich our campus life... —— 给个理由，不展开", "<b>自检</b>：Dear Chris 之后直接入来意？—— 凤头不讲废话、不寒暄凑字"] },
          { icon: "🐗", part: "猪肚 · 主体段", budget: "约45词 · 3-4句", cls: "c-gx",
            goal: "得分点全展开——读者的所有疑问（几点/哪里/干什么/有什么意思）在此被解决",
            micro: "总起句 → 层次① → 层次② → 个性化句（层次怎么爬梯 → ④建构要点）",
            plots: ["<b>总起</b>（时间地点四要素）：The party is scheduled for 3-5 pm on Friday, June 5th, in the school hall.", "<b>层次①②</b>（活动展开）：There will be a variety of activities, ranging from... to...", "<b>个性化句</b>（升档句）：Given your gift for singing, it would be our honor if...", "<b>自检</b>：读信人的问句全答完了吗？猪肚要\"实·丰·序\""] },
          { icon: "🐆", part: "豹尾 · 结尾段", budget: "约20词 · 1-2句", cls: "c-ln",
            goal: "促成行动（承②促成型目的）+ 留余韵",
            micro: "行动句（带期限）→ 期待句",
            plots: ["<b>行动句</b>：Please let me know by Wednesday if you can make it.", "<b>期待句</b>：Looking forward to your early reply.", "<b>自检</b>：结尾是\"期待\"不是\"通知\"；不说 Thank you for reading 空客套——豹尾一击即收"] }
        ]
      },
      /* ⑤反馈问题·病理对照库：12类高频问题×正反真句对照，按病源分组（溯源前四步+⑦五维） */
      step5: [
        { t: "立意偏离主题", src: "审题病 · 五维①内容连贯", bad: "I am a student who loves English very much. I want to make friends with you.", good: "I am writing to invite you to the English Party to be held in our school.", note: "自我介绍喧宾夺主，邀请信悄悄变成了交友信——回看①的任务卡：一句话锚点不能丢。" },
        { t: "要点遗漏缺失", src: "审题病 · 五维①内容完整", bad: "The party will be very interesting. Please come.", good: "The party is scheduled for 3-5 pm on Friday, June 5th, in the school hall, with songs, plays and poetry reading.", note: "时间四要素+活动全无——Chris 想来都不知道几点去哪。" },
        { t: "格式杂糅混乱", src: "审题病 · 五维⑤格式规范", bad: "Attention please! An English Party will be held. Everyone should come.", good: "Dear Chris, ... It would be our honor if you could join us. ... Yours sincerely, Li Hua", note: "通知口吻混入邀请信 + 称呼落款全丢——①的 Where? 一问白答了。" },
        { t: "人称错位失联", src: "审题病 · 五维③得体性", bad: "Chris is a good teacher. He can sing well. Students will like him.", good: "You are good at singing, and we would love to hear you sing.", note: "收信人被写成\"他\"——信是写给 you 的，不是谈论 his 的（①易错预警第一条）。" },
        { t: "交际效果欠佳", src: "基调病 · 五维③得体性", bad: "You must come to our party. It will be good for you.", good: "It would be our honor if you could join us.", note: "命令+功利=施压；虚拟语气=恭敬的留白（②情感分寸的落点）。" },
        { t: "结构松散凌乱", src: "结构病 · 五维④结构流畅", bad: "Our school will hold a party. I hope you can come. It is on Friday. There will be songs. We all like you.", good: "总起（时间地点）→ 层次（活动展开）→ 个性化邀请——凤引出来意、猪充实安排、豹推动行动。", note: "碎片流水账：想到哪写到哪。③的凤猪豹各归其位，脉络才立起来。" },
        { t: "要点重复冗余", src: "结构病 · 五维①内容完整", bad: "There will be many activities. There will be English songs. There will be short plays. There will be poetry reading.", good: "There will be a variety of activities, ranging from English songs and short plays to poetry reading.", note: "同一句式连发四枪不如 ranging from...to... 一网收拢——猪肚要分层不要分句堆放。" },
        { t: "内容宽泛空洞", src: "建构病 · 五维②层次性", bad: "The party will be very interesting and meaningful. You will have a good time.", good: "You can watch English plays, sing along on stage, and even create your own short plays.", note: "\"有趣\"\"有意义\"是贴标签；活动名上句才是内容（④认知梯三格就是反空洞的药）。", checks: [{ q: "活动只写了一项？想想还能加什么", s6: 3 }] },
        { t: "思想浅显单薄", src: "建构病 · 五维②思想性", bad: "The party is fun. Fun is good for students.", good: "...encouraging us to explore the beauty of English through music.", note: "梯子只爬第一级就停——爬到顶（意义层），一句顶三句（④深度梯的终点）。" },
        { t: "内容陈旧老套", src: "建构病 · 五维②思想性", bad: "With the development of society, English is more and more important...", good: "When it comes to the liveliest corner of our school, the upcoming English Party springs to my mind.", note: "万金油开头是阅卷疲劳源——从本题的具体情境切入（联结路径的\"契合\"通道）。" },
        { t: "语言单调简单", src: "语言病 · 五维③丰富性", bad: "The party is good. You can sing. You can play. I hope you come.", good: "Given your gift for singing, it would be our honor if you could treat us to an English song.", note: "通篇简单句+good/come——升级路径见⑥语料（Tell➜Show）。", checks: [{ q: "结尾只会 I hope you can come？", s6: 7 }] },
        { t: "时态混乱错位", src: "语言病 · 五维⑤语法规范", bad: "I will invite you to the party. The party was held on Friday.", good: "I am writing to invite you... The party is scheduled for Friday...", note: "写信此刻=现在进行（am writing）；活动未办=将来（is scheduled）——\"这封信活在什么时间里\"动笔前就要定调。", checks: [{ q: "invite you join 漏了什么小词？", s6: 0 }, { q: "The party will hold 哪里错了？", s6: 2 }] }
      ],
      /* ⑥输入语料·段位结构版：猪肚（主体段）4框扩容，每框2-3例——句式全家桶
         （with复合/三大从句/非谓语/倒装/强调/虚拟/无灵主语） */
      step6: {
        qs: [
          { p: "Para 1 · 凤头", q: "目的句起手（功能句 + 虚拟）", corpus: [
            { tell: "I want to invite you to our party.", show: "I am <b>writing to invite you to</b> the English Party <b>to be held</b> in our school.", skills: ["功能句", "不定式作定语"] },
            { tell: "I hope you can come to our party.", show: "I <b>would feel much honored</b> if you <b>could spare some time</b> for our English Party.", skills: ["虚拟语气"] }
          ] },
          { p: "Para 1 · 凤头", q: "背景句（目的状语 + 非谓语后置）", corpus: [
            { tell: "Our school will have a party.", show: "<b>To enrich our campus life</b>, our school is going to hold an English Party.", skills: ["目的状语前置"] },
            { tell: "The party is coming and it is interesting.", show: "An English Party <b>is around the corner</b>, <b>aimed at bringing English closer to our daily life</b>.", skills: ["非谓语后置"] }
          ] },
          { p: "Para 2 · 猪肚 主体段", q: "总起 · 时间地点（被动四要素 + with复合结构）", corpus: [
            { tell: "The party will hold in our school hall on Friday.", show: "The party <b>is scheduled for</b> 3-5 pm on Friday, June 5th, in the school hall.", skills: ["被动语态", "四要素具体"] },
            { tell: "The hall will have many activities.", show: "<b>With</b> a variety of activities <b>lined up</b>, the school hall <b>will be turned into</b> a stage of English.", skills: ["with复合结构", "被动"] }
          ] },
          { p: "Para 2 · 猪肚 主体段", q: "活动展开（There be + 名词性从句 + 倒装）", corpus: [
            { tell: "There will have many activities.", show: "<b>There will be</b> a variety of activities, <b>ranging from</b> English songs and short plays <b>to</b> poetry reading.", skills: ["There be", "from...to..."] },
            { tell: "I like the drama part best.", show: "<b>What impresses me most is</b> the drama section, <b>where</b> you can watch and even join English plays.", skills: ["名词性从句", "where定从"] },
            { tell: "You can enjoy performances and you can act too.", show: "<b>Not only can you enjoy</b> wonderful performances, <b>but you will also get a chance to</b> act in a short play.", skills: ["倒装句"] }
          ] },
          { p: "Para 2 · 猪肚 主体段", q: "个性化邀请（分词短语 + 强调句 + 虚拟）", corpus: [
            { tell: "You are good at singing. You can sing a song.", show: "<b>Given your gift for singing</b>, it would be <b>our honor</b> if you could treat us to an English song.", skills: ["过去分词", "虚拟语气"] },
            { tell: "Your singing will make the party great.", show: "<b>It is your singing that</b> will <b>light up</b> the whole party.", skills: ["强调句"] },
            { tell: "If you sing a song, the party will be perfect.", show: "<b>If you were to give us a song</b>, the party <b>would be complete</b>.", skills: ["虚拟语气·if从句"] }
          ] },
          { p: "Para 2 · 猪肚 主体段", q: "价值升华（无灵主语 + 介词+which）", corpus: [
            { tell: "The party can help us learn English.", show: "Your performance <b>will add color to</b> the party and <b>bring English alive</b> for us.", skills: ["无灵主语"] },
            { tell: "These activities are useful for us.", show: "Such activities <b>open a window through which</b> we see the beauty of English.", skills: ["介词+which定从"] }
          ] },
          { p: "Para 3 · 豹尾", q: "行动句（if宾从 + 期限 + 省略if倒装）", corpus: [
            { tell: "Reply me soon.", show: "Please <b>let me know by Wednesday</b> if you can make it.", skills: ["if宾语从句", "期限"] },
            { tell: "If you have questions, you can ask me.", show: "<b>Should you have any questions</b>, don't hesitate to write to me.", skills: ["省略if的虚拟倒装"] }
          ] },
          { p: "Para 3 · 豹尾", q: "期待句（动名词惯例 + 虚拟收尾）", corpus: [
            { tell: "I hope you can come.", show: "<b>Looking forward to your early reply.</b>", skills: ["动名词", "交际惯例"] },
            { tell: "I will be happy if you come.", show: "It <b>would be</b> our great pleasure <b>to see you among us</b>.", skills: ["虚拟语气收尾"] }
          ] }
        ],
        extra: "<p class='er-muted'>（此区可导入补充语料）</p>"
      },
      step7: { text: "", images: [] },
      /* ⑧共赏佳作：范文 + eval五维点评（右栏数据；词数体检由前端实时计算对照③凤15猪45豹20） */
      step8: {
        text: "<b>Dear Chris,</b><br><br>I am writing to invite you to the English Party to be held in our school.<br><br>The party is scheduled for 3:00-5:00 pm on Friday, June 5th, in the school hall. There will be a variety of activities, ranging from English songs and short plays to poetry reading. Given your gift for singing, it would be our honor if you could sing a song for us at the party.<br><br>Would you be available for the party? Looking forward to your early reply.<br><br><b>Yours sincerely,<br>Li Hua</b>",
        eval: [
          { dim: "内容完整性和连贯性", comment: "两要点全覆盖（时间地点四要素＋活动两项），从 invite 开门到 Looking forward 收束无一句偏离任务——①的任务卡在这篇里完整兑现。" },
          { dim: "要点层次性和思想性", comment: "活动 ranging from...to... 拉开层次；个性化邀请（your gift for singing）把\"请你来\"升为\"这舞台缺你\"——④深度梯的表→里→顶在一句话里走完。" },
          { dim: "语言丰富性和得体性", comment: "功能句起手（I am writing to invite）＋虚拟语气（it would be our honor if you could）恳请而不施压——对师长语域（②定位）的教科书级示范。" },
          { dim: "结构严谨性和流畅性", comment: "凤15·猪45·豹20（右侧词数体检可验证）：三段各司其职，Given your gift 分词衔接使个性化句嵌得自然，不显突兀。" },
          { dim: "语法规范性和准确性", comment: "三件套齐全；时态定调清晰（写信此刻 am writing＋安排将来 is scheduled）；80 词达标——⑤语言病一条不犯。" }
        ]
      }
    };
  }

  function load() {
    let fresh = false;
    try {
      const s = localStorage.getItem(LS_KEY);
      if (s) DB = JSON.parse(s); else fresh = true;
    } catch (e) { DB = null; fresh = true; }
    /* articles 必须是真数组——任何历史脏形态（对象/字符串/null）一律整体重置 */
    if (!DB || typeof DB !== 'object' || !Array.isArray(DB.articles)) { DB = { articles: [] }; fresh = true; }
    /* 空库保持空（正式版语义——种子 English Party 仅经⬆️导入篇目/技能JSON进入；
       测试版曾用"空库即注入"便于走查，回迁时还原） */
    try {
      /* v1 → v2 迁移：补 type（不再强插应用文种子） */
      ensureTypes(DB);
      DB.v2seeded = true;
      if (!DB.articles.some(a => a.id === curArtId)) curArtId = DB.articles[0] ? DB.articles[0].id : null;
      if (DB.ui) { uiZoom = DB.ui.zoom || 1.0; zoomLocked = !!DB.ui.locked; defaultZoom = DB.ui.default || null; }
      /* 关键防线：规范化所有篇目，补全任何缺失字段 */
      DB.articles = DB.articles.map(normalizeArticle).filter(Boolean);
    } catch (e) {
      console.warn('er: 数据迁移异常，重置为空库', e);
      DB = { articles: [], v2seeded: true };
      curArtId = null;
    }
    try { persist(); } catch (e) { console.warn('er: localStorage 写入失败（可能已满），功能照常运行', e); }
  }
  function persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(DB));
    } catch (e) {
      console.warn('er: 存储失败，尝试压缩全部图片后重试', e);
      compressAllImages(() => {
        try {
          localStorage.setItem(LS_KEY, JSON.stringify(DB));
          toast('存储曾超限：已自动压缩全部图片');
        } catch (e2) {
          console.error('er: 存储仍失败', e2);
          toast('存储空间已满！请导出JSON备份并删除部分图片');
        }
      });
    }
  }
  /* 全库图片瘦身（配额告急时自救） */
  function compressAllImages(done) {
    const tasks = [];
    DB.articles.forEach(a => {
      (a.step6 && Array.isArray(a.step6.pairs) ? a.step6.pairs : []).forEach(pr => {
        (Array.isArray(pr.imgs) ? pr.imgs : []).forEach(m => {
          if (m && m.src && m.src.length > 150000) tasks.push(cb => compressDataUrl(m.src, du => { m.src = du; cb(); }));
        });
      });
      (a.step7 && Array.isArray(a.step7.images) ? a.step7.images : []).forEach(d => {
        if (typeof d === 'string' && d.length > 150000) tasks.push(cb => compressDataUrl(d, du => { /* 数组项为字符串，替换 */ const arr = a.step7.images; const idx = arr.indexOf(d); if (idx >= 0) arr[idx] = du; cb(); }));
      });
    });
    let i = 0;
    (function next() { if (i >= tasks.length) { done(); return; } tasks[i++](next); })();
  }
  /* 用 id 定位当前篇目——导入/删除/复制模板后绝不失步；空库时返回空白占位，渲染永不崩溃 */
  function art() { return DB.articles.find(a => a.id === curArtId) || DB.articles[0] || blankArt(); }
  function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function toast(msg) {
    let t = document.getElementById('erToast');
    if (!t) { t = document.createElement('div'); t.id = 'erToast'; document.body.appendChild(t); }
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(t._tm); t._tm = setTimeout(() => t.style.display = 'none', 1800);
  }

  /* ================= 样式（全部 er- 前缀，隔离 AFR 主题） ================= */
  const CSS = `
  /* 全部引用 AFR 主题变量，自动跟随主系统换肤 */
  .er-app{height:100%;display:flex;background:var(--bg-panel);color:var(--text-body);border-radius:var(--radius-panel);box-shadow:var(--shadow-panel);overflow:hidden;font-family:inherit;font-size:14px;position:relative;padding-left:235px;transition:padding-left .25s}
  .er-app.collapsed{padding-left:0}
  .er-app .en{font-family:Georgia,"Times New Roman",serif}
  .er-app button{font-family:inherit}
  /* 侧栏：浮层（收展不影响正文布局） */
  .er-side{position:absolute;left:0;top:0;bottom:0;width:235px;z-index:10;background:var(--bg-subtle);border-right:1px solid var(--border-color-light);box-shadow:var(--shadow-elevated);display:flex;flex-direction:column;transform:translateX(0);transition:transform .25s}
  .er-app.collapsed .er-side{transform:translateX(-100%)}
  .er-side h3{font-size:15px;color:var(--text-primary);padding:14px 14px 9px;border-bottom:1px solid var(--border-color-lighter)}
  /* 结构性防挤占：essayView 脱离 flex 流（绝对定位铺满），无论何种异常状态都不可能与其它视图并排分宽 */
  .main-content{position:relative}
  #essayView{position:absolute;inset:0;z-index:20}
  .er-list{flex:1;overflow-y:auto;padding:9px}
  .er-item{width:100%;text-align:left;background:var(--bg-panel);color:var(--text-body);border:1px solid var(--border-color-lighter);border-radius:8px;padding:9px 11px;margin-bottom:7px;cursor:pointer;font-size:13px;line-height:1.4;transition:all .15s}
  .er-item:hover{border-color:var(--color-primary-border);background:var(--color-primary-bg-soft)}
  .er-item.on{border-color:var(--color-primary);background:var(--color-primary-bg);color:var(--color-primary-text-dark);font-weight:600}
  .er-item .src{display:block;color:var(--text-tertiary);font-size:11.5px;margin-top:2px;font-weight:normal}
  .er-sideops{padding:9px;border-top:1px solid var(--border-color-lighter);display:flex;flex-wrap:wrap;gap:5px}
  .er-sideops button{flex:1;min-width:95px;background:var(--bg-panel);color:var(--text-secondary);border:1px solid var(--border-color);border-radius:6px;padding:6px 3px;cursor:pointer;font-size:11.5px;transition:all .15s}
  .er-sideops button:hover{border-color:var(--color-primary-hover);color:var(--color-primary-hover)}
  /* 收起按钮：挂在侧栏右缘、垂直居中，随侧栏一起滑动 */
  .er-collapse{position:absolute;top:50%;right:-25px;transform:translateY(-50%);width:24px;height:44px;background:var(--bg-panel);border:1px solid var(--border-color);border-left:none;border-radius:0 8px 8px 0;color:var(--text-tertiary);cursor:pointer;font-size:14px;z-index:12;box-shadow:var(--shadow-pop)}
  .er-collapse:hover{color:var(--color-primary-hover)}
  /* 展开按钮（收起后悬浮于应用左缘、垂直居中） */
  .er-open{position:absolute;left:0;top:50%;transform:translateY(-50%);width:26px;height:44px;background:var(--bg-panel);border:1px solid var(--border-color);border-left:none;border-radius:0 8px 8px 0;color:var(--text-tertiary);cursor:pointer;font-size:15px;z-index:12;display:none;box-shadow:var(--shadow-pop)}
  .er-open:hover{color:var(--color-primary-hover)}
  .er-app.collapsed .er-open{display:block}
  .er-main{flex:1;display:flex;flex-direction:column;min-width:0;background:var(--bg-panel)}
  .er-top{display:flex;align-items:center;gap:12px;padding:10px 18px;border-bottom:1px solid var(--border-color-lighter)}
  .er-title{display:none}
  .er-ops{display:flex;gap:7px;flex-wrap:nowrap;flex-shrink:0}
  .er-ops button{background:var(--bg-panel);color:var(--text-secondary);border:1px solid var(--border-color);border-radius:var(--radius-base);padding:4px 11px;cursor:pointer;font-size:12px;transition:all .15s}
  .er-ops button:hover{border-color:var(--color-primary-hover);color:var(--color-primary-hover)}
  .er-ops button.editing{background:var(--color-primary);color:var(--text-on-primary);border-color:var(--color-primary)}
  .er-steps{display:flex;gap:5px;flex-wrap:nowrap;overflow-x:auto;flex:1;min-width:0}
  .er-steps button{background:var(--bg-subtle);color:var(--text-secondary);border:1px solid var(--border-color-lighter);border-radius:16px;padding:6px 13px;cursor:pointer;font-size:12.5px;transition:all .15s}
  .er-steps button:hover{border-color:var(--color-primary-border);color:var(--color-primary-text-dark)}
  .er-steps button.on{background:var(--color-primary);color:var(--text-on-primary);border-color:var(--color-primary);font-weight:bold}
  .er-body{flex:1;overflow-y:auto;overflow-x:hidden;padding:16px 20px 50px}
  .er-pane{display:none;max-width:var(--er-pane-w,1400px);margin:0 auto}
  .er-pane.on{display:block}
  /* 步骤①-④：左原文 / 右步骤内容 分栏（分隔线仿 AFR Review split 模式） */
  .er-split{display:flex;align-items:stretch}
  .er-src{flex:none;width:42%;overflow-y:auto;overflow-x:hidden;padding:4px 10px 4px 18px;max-height:calc(100vh - 210px)}
  .er-src .er-storyp{margin:6px 0}
  .er-divider{flex:0 0 10px;cursor:col-resize;position:relative;background:transparent;z-index:20;touch-action:none;user-select:none}
  .er-divider::before{content:'';position:absolute;left:4px;top:0;bottom:0;width:2px;background:var(--border-color-light);transition:background .15s,width .15s}
  .er-divider:hover::before,.er-divider.dragging::before{background:var(--color-primary);width:3px;left:3.5px}
  body.er-splitting{user-select:none;cursor:col-resize}
  .er-stepcol{flex:1;min-width:0;overflow-y:auto;max-height:calc(100vh - 210px);padding-left:8px}
  .er-stepcol .er-pane{max-width:none;margin:0}
  /* 侧栏分组（下拉） */
  .er-group{margin-bottom:4px}
  .er-group-head{width:100%;display:flex;justify-content:space-between;align-items:center;background:var(--bg-inset);border:none;border-radius:6px;padding:7px 10px;cursor:pointer;font-size:12.5px;font-weight:600;color:var(--text-secondary);transition:all .15s}
  .er-group-head:hover{color:var(--color-primary-hover)}
  .er-sideinfo{display:flex;align-items:center;gap:6px}
  .er-count{background:var(--color-primary-bg);color:var(--color-primary-text-dark);border-radius:8px;padding:0 7px;font-size:11px}
  .er-caret{display:inline-block;transition:transform .2s;font-size:11px}
  .er-group.closed .er-caret{transform:rotate(-90deg)}
  .er-group-body{display:block;padding-top:4px}
  .er-group.closed .er-group-body{display:none}
  .er-empty{font-size:11.5px;color:var(--text-disabled);text-align:center;padding:10px 4px;border:1px dashed var(--border-color-lighter);border-radius:8px;margin-bottom:6px;line-height:1.6}
  .er-sec{font-size:16px;color:var(--color-primary-text-dark);border-left:4px solid var(--color-primary);padding-left:9px;margin:16px 0 10px;font-weight:600}
  .er-sec:first-child{margin-top:0}
  .er-sec-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:16px 0 10px}
  /* 可折叠指南 */
  .er-fold-head{width:100%;display:flex;justify-content:space-between;align-items:center;background:none;border:none;color:var(--color-primary-text-dark);font-size:14px;font-weight:600;cursor:pointer;padding:0 0 6px}
  .er-fold-head:hover{color:var(--color-primary-hover)}
  .er-fold-body{display:block;border-top:1px dashed var(--border-color-lighter);padding-top:8px;margin-top:2px}
  .er-fold.closed .er-fold-body{display:none}
  .er-fold.closed .er-card{padding-bottom:8px}
  /* 原文伏笔高亮（配色与伏笔卡一致） */
  .er-mark{padding:0 2px;border-radius:3px}
  .er-mark.c-hj{background:var(--bg-success-soft);box-shadow:inset 0 -2px 0 var(--color-success)}
  .er-mark.c-gx{background:var(--bg-danger-soft);box-shadow:inset 0 -2px 0 var(--color-danger)}
  .er-mark.c-wp{background:rgba(250,140,22,.14);box-shadow:inset 0 -2px 0 var(--color-warning)}
  .er-mark.c-ln{background:rgba(114,46,209,.12);box-shadow:inset 0 -2px 0 #722ed1}
  .er-mark.c-xn{background:var(--color-primary-bg);box-shadow:inset 0 -2px 0 var(--color-primary)}
  .er-sec-row .er-sec{margin:0}
  .er-hidden{display:none !important}
  .er-app p,.er-app li{font-size:14px;line-height:1.7;color:var(--text-body)}
  .er-muted{color:var(--text-tertiary);font-size:12.5px}
  .er-card{background:var(--bg-panel);border:1px solid var(--border-color-lighter);border-radius:var(--radius-base);padding:12px 14px;margin:8px 0}
  .er-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .er-grid2.er-single{grid-template-columns:1fr}   /* 窄屏课堂：单列排布 */
  @media(max-width:1000px){.er-grid2{grid-template-columns:1fr}}
  .er-storyp{font-size:14.5px;line-height:1.8;margin:7px 0}
  .er-pnum{display:inline-block;min-width:26px;color:var(--color-primary);font-weight:bold}
  .er-opener{background:var(--color-primary-bg-soft);border-left:4px solid var(--color-primary);padding:8px 12px;border-radius:6px;font-style:italic}
  /* ★应用文答题卡示意区：呼语 + 横线（宽度自适应左栏，高度由fitAnswerSheet弹性铺放）+ 右对齐落款 */
  .er-answer-sheet{margin-top:16px;padding-top:10px;border-top:1px dashed var(--border-color-lighter)}
  .er-answer-line{height:1.7em;border-bottom:1px solid var(--border-color)}
  .er-sign{text-align:right;margin:8px 0}
  .er-sign:last-child{padding-right:1.2em}
  .er-sign:not(:last-child){padding-right:4.5em}
  /* ★①任务卡合成（审题输出物） */
  .er-taskcard{border-left:3px solid var(--color-primary);background:var(--color-primary-bg-soft)}
  /* ★③凤猪豹三卡的字数预算徽章 */
  .er-budget{display:inline-block;margin-left:8px;font-size:11.5px;color:var(--color-primary-text-dark);background:var(--color-primary-bg-soft);border:1px solid var(--color-primary-border);border-radius:10px;padding:1px 8px;font-weight:600}
  /* ★④本篇建构·爬梯现场：三级台阶阶梯式视觉（缩进递增+底色渐深=往上爬） */
  .er-ladder{display:flex;flex-direction:column;gap:1px;margin-top:8px}
  .er-lv{display:flex;gap:9px;align-items:baseline;border-radius:6px;padding:6px 11px;font-size:13px;transition:margin .2s}
  .er-lv0{background:var(--bg-subtle)}
  .er-lv1{background:var(--color-primary-bg-soft)}
  .er-lv2{background:var(--color-primary-bg)}
  .er-lv-tag{flex:none;font-size:11px;font-weight:700;color:var(--color-primary-text-dark);white-space:nowrap}
  .er-lv-arrow{font-size:10px;color:var(--color-primary);line-height:1.4;margin:1px 0}
  /* ★⑤病理对照库：正反案例红绿对照 + 病源徽章 */
  .er-bg{border-radius:6px;padding:6px 10px;margin:5px 0;font-size:13px;line-height:1.7}
  .er-bg.bad{background:rgba(255,77,79,.07);border-left:3px solid var(--color-danger)}
  .er-bg.good{background:rgba(82,196,26,.08);border-left:3px solid var(--color-success)}
  .er-src-tag{display:inline-block;margin-left:8px;font-size:11px;color:var(--color-primary-text-dark);background:var(--color-primary-bg-soft);border:1px solid var(--color-primary-border);border-radius:10px;padding:1px 8px}
  /* ★⑧右栏：词数体检行 + 五维点评 */
  .er-wc-row{font-size:13px;color:var(--text-body);padding:3px 0}
  .er-evdim{padding:7px 0;border-bottom:1px dashed var(--border-color-lighter)}
  .er-evdim:last-child{border-bottom:none}
  /* ★②四问辨析台选项：先揣摩点选 → 展开辨析why（✓绿/✗红） */
  .er-opts2{margin-top:8px;display:flex;flex-direction:column;gap:5px}
  .er-opt2{border:1px solid var(--border-color-light);border-radius:8px;padding:6px 10px;cursor:pointer;transition:border-color .15s,background .15s;user-select:none}
  .er-opt2:hover{border-color:var(--color-primary-hover)}
  .er-opt2-mark{display:inline-block;min-width:20px;font-weight:700}
  .er-opt2-t{color:var(--text-body)}
  .er-opt2-why{display:none;margin-top:5px;padding:6px 9px;background:var(--bg-subtle);border-radius:6px;font-size:12.5px;color:var(--text-secondary);line-height:1.7}
  .er-opt2.on .er-opt2-why{display:block}
  .er-opt2.on{border-color:var(--color-danger)}
  .er-opt2.on .er-opt2-mark::before{content:'✗'}
  .er-opt2.on[data-v="1"]{border-color:var(--color-success)}
  .er-opt2.on[data-v="1"] .er-opt2-mark::before{content:'✓'}
  .er-kw{color:var(--color-primary-text-dark);border-bottom:2px dashed var(--color-primary-border);font-weight:bold}
  .er-tag{display:inline-block;background:var(--color-primary);color:var(--text-on-primary);font-weight:bold;border-radius:12px;padding:1px 11px;font-size:12px;margin-bottom:5px}
  .er-row{display:flex;gap:8px;margin:5px 0;align-items:baseline}
  .er-row b.lab{flex:0 0 108px;color:var(--text-secondary);font-size:13px}
  .er-row div.en{flex:1}
  .er-fu{border-left:4px solid;border-left-color:var(--border-color)}
  .er-fu .fu-head{display:flex;align-items:center;gap:9px;margin-bottom:5px;font-size:14.5px;color:var(--text-primary)}
  .er-fu .fu-type{font-size:11.5px;border-radius:10px;padding:1px 9px;background:var(--bg-inset)}
  .c-hj{border-left-color:var(--color-success)}.c-hj .fu-type{color:var(--color-success-deep)}
  .c-wp{border-left-color:var(--color-warning)}.c-wp .fu-type{color:var(--color-warning)}
  .c-gx{border-left-color:var(--color-danger)}.c-gx .fu-type{color:var(--color-danger-deep)}
  .c-ln{border-left-color:var(--type-listening)}.c-ln .fu-type{color:var(--type-listening)}
  .c-xn{border-left-color:var(--color-primary)}.c-xn .fu-type{color:var(--color-primary-text-dark)}
  .er-chip{display:inline-block;background:var(--color-primary-bg);border:1px solid var(--color-primary-border);color:var(--color-primary-text-dark);border-radius:14px;padding:2px 11px;margin:2px 4px 2px 0;font-size:12.5px}
  .er-chip-end{background:var(--diff-hard-bg);border-color:var(--diff-hard-border);color:var(--diff-hard-text)}
  .er-check{display:flex;gap:11px;align-items:flex-start}
  .er-check .box{flex:0 0 24px;height:24px;border:2px solid var(--color-primary-border);border-radius:6px;cursor:pointer;margin-top:3px;display:flex;align-items:center;justify-content:center;color:var(--text-on-primary);font-weight:bold;background:var(--bg-panel)}
  .er-check .box.done{background:var(--color-primary);border-color:var(--color-primary)}
  /* 步骤⑤自查项 + ⑥语料跳转 */
  .er-check-item{display:flex;gap:9px;align-items:center;padding:3px 0;flex-wrap:wrap}
  .er-check-item .box{flex:0 0 20px;height:20px;border:2px solid var(--color-primary-border);border-radius:5px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--text-on-primary);font-weight:bold;font-size:12px;background:var(--bg-panel)}
  .er-check-item .box.done{background:var(--color-primary);border-color:var(--color-primary)}
  .er-check-item .ck{font-size:13.5px;line-height:1.6}
  .er-link6{background:var(--color-primary-bg);color:var(--color-primary-text-dark);border:1px solid var(--color-primary-border);border-radius:12px;padding:1px 9px;cursor:pointer;font-size:11.5px;white-space:nowrap}
  .er-link6:hover{background:var(--color-primary);color:var(--text-on-primary)}
  @keyframes erflash{0%,100%{box-shadow:0 0 0 0 transparent}30%{box-shadow:0 0 0 4px var(--color-primary-ring)}}
  .er-flash{animation:erflash .6s ease-in 3}
  /* 步骤⑥联想图片 × 语料 成对工作台 */
  .er-pair{display:flex;gap:12px;align-items:flex-start;padding:10px 10px 10px 52px;border:1px dashed var(--border-color-lighter);border-radius:10px;margin:8px 0;background:var(--bg-subtle);position:relative}
  .er-pair.dragover{border-color:var(--color-primary);border-style:solid}
  .er-pair.sel{border-color:var(--color-primary);border-style:solid;background:var(--color-primary-bg-soft)}
  .er-pair.zone-l{box-shadow:inset 4px 0 0 var(--color-primary)}
  .er-pair.zone-r{box-shadow:inset -4px 0 0 var(--color-primary)}
  .er-pair.zone-b{box-shadow:inset 0 -4px 0 var(--color-primary)}
  .er-pair.lay-b{flex-direction:column;align-items:stretch}
  .er-pair.lay-b .er-pair-txt{width:100%}
  
  .er-slot{position:absolute;border:none;border-radius:10px;background:transparent;color:var(--color-primary-text-dark);cursor:pointer;overflow:visibleborder:2px dashed var(--color-primary-border);border-radius:8px;background:var(--color-primary-bg-soft);color:var(--color-primary-text-dark);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:12.5px;cursor:pointer;text-align:center}
  .er-slot:not(.filled){background:var(--color-primary-tint)}
  .er-slot:hover{box-shadow:0 0 0 1.5px var(--color-primary-border)}
  .er-slot.filled img{border-radius:10px;box-shadow:0 10px 24px rgba(0,0,0,.55), 0 4px 8px rgba(0,0,0,.35), 0 0 0 1px rgba(0,0,0,.15)}
  .er-slot-hint{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:12.5px}
  .er-pair-img{position:relative;flex:0 0 auto}
  .er-slot-size{font-size:11px;color:var(--text-tertiary)}
  .er-slot .er-imgdel{opacity:.35}
  .er-noimg{color:var(--text-tertiary);font-size:12px;padding:14px 10px;border:1.5px dashed var(--border-color);border-radius:8px}
  .er-pair-img.er-drawing{cursor:crosshair;position:relative}
  .er-drawrect{position:absolute;border:2px dashed var(--color-primary);background:rgba(24,144,255,.12);border-radius:6px;z-index:5;pointer-events:none}
  .er-laybtn{position:absolute;top:4px;right:4px;height:20px;padding:0 6px;border:none;border-radius:10px;background:var(--color-primary-bg);color:var(--color-primary-text-dark);border:1px solid var(--color-primary-border);cursor:pointer;font-size:11px;opacity:0;transition:opacity .15s}
  .er-pair-txt:hover .er-laybtn{opacity:1}
  .er-pair-img{flex:0 0 auto;position:relative;display:flex;flex-wrap:wrap;gap:6px;align-items:flex-start}
  .er-imgcell{position:relative}
  .er-imgcell.br{flex-basis:100%}
  .er-imgbr{position:absolute;top:5px;left:5px;height:20px;padding:0 6px;border:none;border-radius:10px;background:rgba(0,0,0,.45);color:#fff;cursor:pointer;font-size:10.5px;opacity:0;transition:opacity .15s}
  .er-imgcell:hover .er-imgbr{opacity:1}
  .er-imgdel{position:absolute;top:5px;right:5px;width:20px;height:20px;border:none;border-radius:50%;background:rgba(0,0,0,.45);color:#fff;cursor:pointer;font-size:11px;opacity:0;transition:opacity .15s}
  .er-imgcell:hover .er-imgdel{opacity:1}
  .er-mini{background:var(--color-primary-bg);color:var(--color-primary-text-dark);border:1px solid var(--color-primary-border);border-radius:10px;padding:1px 8px;cursor:pointer;font-size:11.5px}
  .er-addimg{align-self:flex-start;padding:6px 14px;background:none;border:1.5px dashed var(--border-color);border-radius:8px;color:var(--text-tertiary);cursor:pointer;font-size:12.5px}
  .er-addimg:hover{border-color:var(--color-primary-border);color:var(--color-primary-text-dark)}
  .er-pair-img img{border-radius:8px;display:block;max-width:100%}
  .er-pair-empty{width:220px;height:120px;border:2px dashed var(--border-color);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--text-tertiary);font-size:12.5px;cursor:pointer;text-align:center;line-height:1.7}
  .er-pair-empty:hover{border-color:var(--color-primary-border);color:var(--color-primary-text-dark)}
  .er-pair-empty.sel{border-color:var(--color-primary);color:var(--color-primary-text-dark)}
  .er-rs{position:absolute;right:0;bottom:0;width:14px;height:14px;background:var(--color-primary);border-radius:3px;cursor:nwse-resize;opacity:.65;touch-action:none}
  .er-rs:hover{opacity:1}
  .er-pair-title{font-size:15.5px;font-weight:600;color:var(--text-primary);background:var(--bg-subtle);border-bottom:1px dashed var(--border-color-lighter);margin:-8px -10px 8px;padding:6px 12px;border-radius:8px 8px 0 0;min-height:16px}
  .er-pair-title:empty::before{content:attr(data-ph);color:var(--text-tertiary);font-weight:normal;font-size:13px}
  .er-pair-body{font-size:14px;line-height:1.75;min-height:40px}
  .er-pair-body:empty::before{content:attr(data-ph);color:var(--text-tertiary);font-style:italic}
  .er-pair-txt{position:relative;flex:1;min-width:180px;font-family:Georgia,serif;font-size:14px;line-height:1.7;padding:8px 10px;background:var(--bg-panel);border:1px solid var(--border-color-lighter);border-radius:8px;min-height:64px;overflow-wrap:anywhere}
  .er-pair-txt:empty::before{content:attr(data-ph);color:var(--text-tertiary);font-style:italic}
  .er-sides{position:absolute;left:8px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:6px;z-index:3}
  .er-sbtn{width:26px;height:26px;display:flex;align-items:center;justify-content:center;border:1px solid var(--border-color);background:var(--bg-panel);border-radius:6px;cursor:pointer;font-size:13px;color:var(--text-secondary);user-select:none;touch-action:none;padding:0;line-height:1}
  .er-sbtn:hover{border-color:var(--color-primary);color:var(--color-primary)}
  .er-sbtn.del{color:var(--color-danger-strong)}
  .er-pair.drag-src{opacity:.45}
  #erInsLine{pointer-events:none}
  .er-grip{position:absolute;left:0px;top:0px;bottom:0px;display:flex;align-items:center;cursor:grab;left:0px;top:0px;bottom:0px;display:flex;align-items:center;cursor:grab;color:var(--text-tertiary);font-size:16px;user-select:none;padding:8px 6px;touch-action:none}
  .er-pair-del{position:absolute;right:8px;top:6px;opacity:.2;transition:opacity .15s}
  .er-pair:hover .er-pair-del{opacity:1}
  .er-tell{color:var(--color-danger);text-decoration:line-through;font-size:13px}
  .er-arrow{color:var(--text-tertiary);margin:0 7px}
  .er-shows{font-family:Georgia,serif;font-size:14px;line-height:1.65;color:var(--text-body)}
  .er-skill{display:inline-block;background:var(--color-primary-bg);color:var(--color-primary-text-dark);border:1px solid var(--color-primary-border);border-radius:10px;padding:0 9px;margin:3px 3px 0 0;font-size:11px;font-weight:bold}
  .er-zone{border:2px dashed var(--border-color);border-radius:10px;padding:14px;text-align:center;color:var(--text-tertiary)}
  .er-zone img{max-width:100%;border-radius:8px;margin:8px 0}
  .er-btn{background:var(--bg-panel);color:var(--text-secondary);border:1px solid var(--border-color);border-radius:var(--radius-base);padding:6px 15px;cursor:pointer;font-size:12.5px;margin:3px 5px;transition:all .15s}
  .er-btn-sm{padding:4px 11px;font-size:12px;margin:0}
  .er-btn:hover{border-color:var(--color-primary-hover);color:var(--color-primary-hover)}
  .er-editable{border-radius:6px}
  /* ★编辑态视觉强化：左栏题干(er-src)占满整栏，outline虚线在容器外缘几乎不可见——
     改用浅蓝底+内嵌虚线框（box-shadow不占布局空间），进没进编辑态一眼可辨 */
  .er-app.editmode .er-src{background:var(--color-primary-tint);box-shadow:inset 0 0 0 1.5px var(--color-primary-border)}
  .er-app.editmode .er-editable{outline:1px dashed var(--color-primary-border);outline-offset:3px}
  .er-app.editmode .er-editable:focus{outline:2px solid var(--color-primary);background:var(--color-primary-tint)}
  #erModal{position:fixed;inset:0;background:var(--bg-overlay);z-index:3000;display:none;align-items:center;justify-content:center}
  #erModal.on{display:flex}
  #erModal .box{background:var(--bg-panel);border:1px solid var(--border-color);border-radius:12px;padding:18px;width:min(700px,90vw);box-shadow:var(--shadow-elevated)}
  #erModal textarea{width:100%;height:280px;background:var(--bg-subtle);color:var(--text-body);border:1px solid var(--border-color);border-radius:8px;padding:11px;font-size:13.5px;line-height:1.7;resize:vertical;font-family:inherit}
  #erToast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--color-primary);color:var(--text-on-primary);font-weight:bold;border-radius:18px;padding:8px 20px;z-index:3500;display:none;font-size:14px;box-shadow:var(--shadow-pop)}
  /* 字体缩放控件 */
  #erZoomLevel{font-size:11px;color:var(--text-secondary);min-width:38px;text-align:center;align-self:center;user-select:none}
  .er-ops button.locked{background:var(--color-primary);color:var(--text-on-primary);border-color:var(--color-primary)}
  /* ★步骤⑦评价升格 V3（全部走AFR主题变量） */
  .ev7-tabs{display:flex;gap:6px;margin-bottom:12px}
  .ev7-tabs button{background:var(--bg-subtle);color:var(--text-secondary);border:1px solid var(--border-color-lighter);border-radius:16px;padding:6px 16px;cursor:pointer;font-size:13px;transition:all .15s}
  .ev7-tabs button:hover{border-color:var(--color-primary-border);color:var(--color-primary-text-dark)}
  .ev7-tabs button.on{color:var(--text-on-color,var(--text-on-primary));font-weight:bold;background:var(--color-primary);border-color:var(--color-primary)}
  .ev7-sec{font-size:15px;font-weight:600;color:var(--color-primary-text-dark);border-left:4px solid var(--color-primary);padding-left:9px;margin:14px 0 8px}
  .ev7-sec .sub{font-size:11.5px;color:var(--text-tertiary);font-weight:normal;margin-left:8px}
  .ev7-card{background:var(--bg-panel);border:1px solid var(--border-color-lighter);border-radius:8px;padding:12px 14px;margin-bottom:10px}
  .ev7-radar-wrap{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
  .ev7-radar-box{flex:none;position:relative}
  .ev7-radar-box svg{display:block;max-width:100%}
  .ev7-radar-star{cursor:pointer}
  .ev7-radar-star:hover{filter:brightness(1.2)}
  .ev7-dim-notes{flex:1;min-width:250px}
  .ev7-dim-note{display:flex;gap:8px;align-items:flex-start;padding:6px 8px;border-radius:8px;transition:.12s;cursor:pointer}
  .ev7-dim-note:hover{background:var(--bg-subtle)}
  .ev7-dim-note .no{flex:none;width:22px;height:22px;border-radius:50%;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:2px}
  .ev7-dim-note b{font-size:13px}
  .ev7-dim-note p{font-size:12.3px;color:var(--text-secondary);line-height:1.7;margin-top:1px}
  .ev7-dim-note .dv{flex:none;font-size:12px;color:var(--text-tertiary);margin-top:3px;min-width:44px;text-align:right}
  .ev7-dim-note .dv b{color:var(--color-primary-text-dark,#096dd9);font-size:14px}
  .ev7-bandstrip{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px}
  .ev7-bandstrip button{border:1px solid var(--border-color);background:var(--bg-panel);border-radius:6px;padding:4px 11px;cursor:pointer;font-size:12.5px;color:var(--text-secondary)}
  .ev7-bandstrip button.on{background:var(--color-primary);border-color:var(--color-primary);color:var(--text-on-primary,#fff);font-weight:600}
  .ev7-nexttip{background:var(--bg-subtle);border:1px solid var(--border-color-lighter);border-radius:6px;padding:9px 12px;font-size:12.5px;color:var(--text-secondary);margin-top:8px}
  .ev7-nexttip b{color:var(--color-primary-text-dark)}
  .ev7-bandspec{display:flex;gap:10px;margin-top:10px;align-items:stretch}
  .ev7-bandspec .bs-left{flex:1;border:1px solid var(--border-color-lighter);border-radius:8px;padding:11px 13px;background:var(--bg-subtle)}
  .ev7-bandspec .bs-left h5,.ev7-bandspec .bs-right h5{font-size:12px;color:var(--text-tertiary);font-weight:600;margin-bottom:6px}
  .ev7-bandspec .bs-left p{font-size:13px;line-height:1.85;color:var(--text-body)}
  .ev7-bandspec .bs-right{flex:1.35;border:1px solid var(--color-primary-border);border-radius:8px;padding:11px 13px;background:var(--color-primary-bg-soft)}
  .ev7-bs-dim{font-size:12.8px;line-height:1.8;color:var(--text-secondary);margin-bottom:7px}
  .ev7-bs-dim:last-child{margin-bottom:0}
  .ev7-bs-dim b{display:inline-block;font-size:11.5px;color:#fff;border-radius:4px;padding:0 7px;margin-right:6px;vertical-align:1px}
  .ev7-bs-dim.d-content b,.ev7-bs-dim.d-lang b,.ev7-bs-dim.d-struct b{background:var(--color-primary)}
  .ev7-principle{font-size:12px;color:var(--text-tertiary);background:var(--bg-subtle);border-radius:6px;padding:7px 11px;margin-bottom:8px}
  @media(max-width:1100px){.ev7-bandspec{flex-direction:column}}
  .ev7-pc-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:stretch}
  .ev7-pc-grid>*{display:flex;flex-direction:column}
  .ev7-pc-grid .pcard{flex:1}
  @media(max-width:1100px){.ev7-pc-grid{grid-template-columns:1fr}}
  .ev7-pcard{border:1px solid var(--border-color-lighter);border-radius:8px;padding:12px 14px;margin-bottom:10px;background:var(--bg-panel);border-left:3px solid var(--color-primary);display:flex;flex-direction:column}
  .ev7-pcard-head{display:flex;align-items:center;gap:8px;margin-bottom:8px;min-height:29px}
  .ev7-pcard-head .who{font-weight:600;color:var(--color-primary-text-dark);font-size:13px}
  .ev7-bs-line{display:flex;align-items:center;gap:4px;font-size:13px;color:var(--text-body);margin-bottom:10px;padding:6px 10px;background:var(--bg-subtle);border:1px solid var(--border-color-lighter);border-radius:6px;flex-wrap:wrap}
  .ev7-bs-line input{border:1px solid var(--border-color);border-radius:4px;padding:3px 6px;font-size:12.5px;text-align:center;background:var(--bg-panel);flex:1;min-width:40px;color:var(--text-body)}
  .ev7-pc-submit{text-align:center;margin-top:6px}
  .ev7-frow{margin-bottom:8px}
  .ev7-frow label{display:block;font-size:12.5px;font-weight:600;margin-bottom:3px;color:var(--text-secondary)}
  .ev7-frow textarea{width:100%;border:1px solid var(--border-color-light);border-radius:6px;padding:7px 10px;font:inherit;line-height:1.6;outline:none;resize:vertical;background:var(--bg-panel);color:var(--text-body)}
  .ev7-frow textarea:focus{border-color:var(--color-primary-border);box-shadow:0 0 0 2px var(--color-primary-bg)}
  .ev7-fb-item{display:flex;gap:8px;align-items:baseline;padding:7px 0;border-bottom:1px dashed var(--border-color-lighter);font-size:13px;line-height:1.7;flex-wrap:wrap}
  .ev7-fb-item:last-child{border-bottom:none}
  .ev7-fb-who{flex:none;font-weight:700;color:var(--color-primary-text-dark);font-size:12.5px;background:var(--color-primary-bg);border:1px solid var(--color-primary-border);border-radius:8px;padding:1px 8px}
  .ev7-fb-band{flex:none;font-weight:700;color:var(--color-primary-text-dark);font-size:12px}
  .ev7-fb-body{flex:1;min-width:200px;color:var(--text-body)}
  .ev7-fb-del{flex:none;width:22px;height:22px;border:none;border-radius:50%;background:var(--bg-subtle);color:var(--text-tertiary);font-size:11px;cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center;transition:.12s;align-self:center}
  .ev7-fb-del:hover{background:var(--color-danger);color:#fff}
  .ev7-q-group{margin-bottom:10px}
  .ev7-q-group:last-child{margin-bottom:0}
  .ev7-q-dim{font-size:13px;font-weight:700;margin-bottom:5px;padding-left:2px}
  .ev7-q-dim .dim-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px}
  .ev7-q-row{display:flex;align-items:flex-start;gap:8px;padding:8px 12px;border-radius:8px;cursor:pointer;font-size:13.5px;line-height:1.7;transition:.12s;border:1px solid transparent;color:var(--text-body)}
  .ev7-q-row:hover{background:var(--bg-subtle)}
  .ev7-q-row.on{background:var(--color-primary-bg-soft);border-color:var(--color-primary-border);font-weight:600}
  .ev7-q-row input[type=checkbox]{margin-top:5px;flex:none;accent-color:var(--color-primary);width:15px;height:15px}
  .ev7-pick-tag{display:inline-block;font-size:11.5px;background:var(--color-primary-bg-soft);border:1px solid var(--color-primary-border);color:var(--color-primary-text-dark);border-radius:10px;padding:1px 9px;margin:2px 2px}
  .ev7-b-summary{display:flex;align-items:center;gap:10px;background:var(--color-primary-bg-soft);border:1px solid var(--color-primary-border);border-radius:8px;padding:10px 14px;margin-top:10px;flex-wrap:wrap}
  .ev7-b-summary .pick{font-weight:600;color:var(--color-primary-text-dark)}
  .ev7-dir-chips{display:flex;gap:7px;flex-wrap:wrap;margin:6px 0 4px}
  .ev7-dir{border:1px solid var(--border-color);background:var(--bg-panel);border-radius:14px;padding:4px 13px;font-size:12.5px;cursor:pointer;user-select:none;color:var(--text-secondary)}
  .ev7-dir:hover{border-color:var(--color-primary);color:var(--color-primary-text-dark)}
  .ev7-dir.on{background:var(--color-primary);border-color:var(--color-primary);color:#fff}
  .ev7-compare{display:flex;gap:10px;margin:10px 0}
  .ev7-compare .col{flex:1;border-radius:8px;padding:10px 12px;min-height:64px}
  .ev7-compare .before{background:var(--bg-danger-soft,var(--bg-subtle));border:1px solid var(--color-danger,var(--border-color))}
  .ev7-compare .after{background:var(--bg-success-soft,var(--bg-subtle));border:1px solid var(--color-success,var(--border-color))}
  .ev7-compare h5{font-size:12px;margin-bottom:5px}
  .ev7-compare .before h5{color:var(--color-danger)}
  .ev7-compare .after h5{color:var(--color-success)}
  .ev7-compare p{font-size:13.5px;line-height:1.8;color:var(--text-body)}
  .ev7-wallgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px}
  .ev7-wallcard{border:1px solid var(--border-color-lighter);border-radius:10px;padding:11px 13px;background:var(--bg-panel);position:relative}
  .ev7-wallcard .o{font-family:Georgia,'Times New Roman',serif;font-size:12.5px;color:var(--text-secondary);text-decoration:line-through;text-decoration-color:rgba(255,77,79,.4);margin-bottom:7px}
  .ev7-wallcard .n{font-family:Georgia,'Times New Roman',serif;font-size:13.5px;color:var(--text-body)}
  .ev7-wallcard .meta{display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:8px;border-top:1px dashed var(--border-color-lighter);padding-top:7px;flex-wrap:wrap}
  .ev7-wallcard .meta .w{font-size:11.5px;color:var(--text-tertiary)}
  .ev7-wallcard .meta .tk{font-size:11px;color:var(--color-primary-text-dark);background:var(--color-primary-bg);border:1px solid var(--color-primary-border);border-radius:9px;padding:1px 9px}
  .ev7-wall-del{position:absolute;top:6px;right:6px;width:22px;height:22px;border:none;border-radius:50%;background:var(--bg-subtle);color:var(--text-tertiary);font-size:12px;cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center;transition:.12s}
  .ev7-wall-del:hover{background:var(--color-danger);color:#fff}
  `;

  /* ================= 八步渲染 ================= */
  /* 左栏：原文 + 段首句（步骤①-④共用常驻）；步骤③Show 时按伏笔类型给原文着色 */
  let step3Hidden = false;
  /* --- 自动识别：从伏笔卡英文引文生成分词键（长句 → 省略号分段 → 前缀降级） --- */
  function tokWords(t) {
    const out = [], re = /[A-Za-z0-9’']+/g; let m;
    while ((m = re.exec(t))) out.push({ w: m[0].toLowerCase(), s: m.index, e: m.index + m[0].length });
    return out;
  }
  function buildKeys(extractHtml) {
    const keys = [];
    if (!extractHtml) return keys;
    const d = document.createElement('div'); d.innerHTML = extractHtml;
    const text = d.textContent || '';
    const push = str => {
      const toks = tokWords(str).map(x => x.w).filter(w => w.length > 1 || /^[a-z0-9]$/.test(w));
      if (toks.length >= 4 && !keys.some(k => k.join(' ') === toks.join(' '))) keys.push(toks);
    };
    push(text);
    text.split(/…|\.{3}/).forEach(seg => push(seg));
    const all = tokWords(text).map(x => x.w);
    push(all.slice(0, 12).join(' '));
    push(all.slice(0, 6).join(' '));
    keys.sort((a, b) => b.length - a.length);   // 长键优先（更精准的匹配先上色）
    return keys;
  }
  function matchKey(ptoks, kw) {
    const n = ptoks.length, k = kw.length;
    if (!k || k > n) return null;
    for (let i = 0; i <= n - k; i++) {
      let ok = true;
      for (let j = 0; j < k; j++) { if (ptoks[i + j].w !== kw[j]) { ok = false; break; } }
      if (ok) return { s: ptoks[i].s, e: ptoks[i + k - 1].e };
    }
    return null;
  }
  function markedStory() {
    const a = art();
    /* ★应用文题干：中文原样排版——不标段号（段落梳理是续写原文的读法）、不做伏笔高亮。
       末尾呼语行（Dear ... ,）起渲染为答题卡示意：呼语 + 8条自适应横线 + 右对齐落款（末行最靠右）。
       呼语/落款行保留 er-storyp 类：collectEdits 靠它回写（横线div是纯渲染层，不进数据） */
    if (a.type === 'practical') {
      const isSalut = p => /^Dear\s+[^,]{1,40},?\s*$/i.test(String(p || '').trim());
      const lines = a.story.map(p => String(p || '').trim()).filter(Boolean);
      const salutIdx = lines.findIndex(isSalut);
      const bodyHtml = (salutIdx >= 0 ? lines.slice(0, salutIdx) : lines)
        .map(p => `<p class="er-storyp">${esc(p)}</p>`).join('');
      let sheetHtml = '';
      if (salutIdx >= 0) {
        const salut = lines[salutIdx];
        const signs = lines.slice(salutIdx + 1);
        /* 横线设为不可编辑：点击落款附近不再误入横线div（打字进横线区=保存丢失的根因） */
        const rules = '<div class="er-answer-line" contenteditable="false"></div>'.repeat(8);
        const signHtml = signs.map(s => `<p class="er-storyp er-sign">${esc(s)}</p>`).join('');
        sheetHtml = `<div class="er-answer-sheet"><p class="er-storyp er-salut">${esc(salut)}</p>${rules}${signHtml}</div>`;
      }
      return bodyHtml + sheetHtml;
    }
    const active = (curStep === 2) && !step3Hidden && a.step3 && Array.isArray(a.step3.items);
    return a.story.map((p, i) => {
      let html = p;
      if (active) {
        const ptoks = tokWords(p);
        const ranges = [];
        a.step3.items.forEach(it => {
          if (!it) return;
          let count = 0;   // 每卡最多 2 处高亮，避免噪音
          buildKeys(it.extract).forEach(kw => {
            if (count >= 2) return;
            const r = matchKey(ptoks, kw);
            if (r && !ranges.some(g => r.s < g.e && g.s < r.e)) { ranges.push({ cls: it.cls || '', s: r.s, e: r.e }); count++; }
          });
          /* 自动匹配落空 → refs 定位兜底（段号+原句） */
          if (count === 0 && Array.isArray(it.refs)) {
            it.refs.forEach(ref => {
              if (ref && ref.p === i + 1 && ref.q) {
                const j = p.indexOf(ref.q);
                if (j >= 0 && !ranges.some(g => j < g.e && g.s < j + ref.q.length)) ranges.push({ cls: it.cls || '', s: j, e: j + ref.q.length });
              }
            });
          }
        });
        if (ranges.length) {
          ranges.sort((x, y) => x.s - y.s);
          let out = '', pos = 0;
          ranges.forEach(g => { if (g.s < pos) return; out += esc(p.slice(pos, g.s)) + `<mark class="er-mark ${g.cls}">${esc(p.slice(g.s, g.e))}</mark>`; pos = g.e; });
          out += esc(p.slice(pos));
          html = out;
        }
      }
      return `<p class="er-storyp en" data-paras="${i + 1}"><span class="er-pnum">${i + 1}.</span> ${html}</p>`;
    }).join('');
  }
  function srcHtml() {
    const a = art();
    /* ★应用文题干侧不再显示"三段规划"块——段落规划属于④谋篇布局的教学内容，题干区只呈现题干本身 */
    const openers = a.type === 'practical' ? '' :
      `<h4 class="er-sec" style="font-size:14px">续写段首句</h4>` +
      a.openers.map(o => `<p class="er-opener en">${o}</p>`).join('');
    return `<h4 class="er-sec" style="font-size:14px">${a.type === 'practical' ? '题干（审题对象）' : '原文（自动标注段落）'}</h4>${markedStory()}${openers}`;
  }
  /* ★答题卡横线弹性铺放：题干文字之后的剩余高度内自动伸缩横线行高（clamp 22~33px）——
     矮屏/窄栏下题干区永不撑出纵向滚动条；横线宽度天然100%随栏宽自适应 */
  function fitAnswerSheet() {
    const src = document.querySelector('.er-src[data-path="story"]');
    const sheet = src && src.querySelector('.er-answer-sheet');
    if (!src || !sheet) return;
    const lines = [...sheet.querySelectorAll('.er-answer-line')];
    if (!lines.length) return;
    lines.forEach(l => { l.style.height = ''; l.style.display = ''; });   // 复位默认再量（幂等）
    const srcR = src.getBoundingClientRect();
    const sheetR = sheet.getBoundingClientRect();
    const usedAbove = sheetR.top - srcR.top + src.scrollTop;   // sheet顶以上内容高
    const salut = sheet.querySelector('.er-salut');
    const signs = [...sheet.querySelectorAll('.er-sign')];
    const belowH = (salut ? salut.offsetHeight + 8 : 0) + signs.reduce((s, x) => s + x.offsetHeight + 16, 0);
    const avail = src.clientHeight - usedAbove - belowH - 14;   // 横线区可用总高
    if (avail < 66) { lines.forEach(l => l.style.display = 'none'); return; }   // 极矮：只留呼语落款
    let n = lines.length;
    while (n > 3 && avail / n < 24) n--;                    // 空间不足先减条数（最少3条）
    const per = Math.min(34, Math.floor(avail / n));        // 行高≤34防稀疏
    lines.forEach((l, i) => { if (i >= n) l.style.display = 'none'; else l.style.height = per + 'px'; });
  }

  let step1Hidden = false;   // 语篇梳理答案显隐（课堂问答用，刷新重置为显示）
  let step2Hidden = false;   // 确定主题答案显隐
  function toggleStep1() {
    step1Hidden = !step1Hidden;
    renderContent();
  }
  function htmlStep1() {
    const a = art();
    const L = a.rowLabels || ['Main idea', 'Implied idea', 'Feelings'];
    const parts = a.step1.map((s, i) => {
      /* ★任务卡合成（审题的输出物）：一句话任务定义 + 语用标签（②判定后回填）——动笔前的锚 */
      if (s.card) {
        return `<div class="er-card er-taskcard${step1Hidden ? ' er-hidden' : ''}">
          <span class="er-tag">★ 任务卡合成</span>
          <div class="er-editable" data-path="step1.${i}.card" style="font-size:14.5px;font-weight:600;color:var(--color-primary-text-dark);line-height:1.8;margin-top:4px">${s.card}</div>
          ${s.tag ? `<div class="er-editable" data-path="step1.${i}.tag" style="display:inline-block;margin-top:8px;background:var(--color-primary-bg-soft);border:1px solid var(--color-primary-border);color:var(--color-primary-text-dark);border-radius:12px;padding:2px 12px;font-size:12.5px">${s.tag}</div>` : ''}
          ${s.hint ? `<p class="er-editable" data-path="step1.${i}.hint" style="margin:8px 0 0;font-size:12px;color:var(--text-tertiary)">${s.hint}</p>` : ''}
        </div>`;
      }
      return `
      <div class="er-card er-fu">
        <span class="er-tag">${esc(s.paras)}</span>
        <div class="er-rows${step1Hidden ? ' er-hidden' : ''}">
          <div class="er-row"><b class="lab">${L[0]}</b><div class="en er-editable" data-path="step1.${i}.main">${s.main}</div></div>
          <div class="er-row"><b class="lab">${L[1]}</b><div class="en er-editable" data-path="step1.${i}.implied">${s.implied}</div></div>
          <div class="er-row"><b class="lab">${L[2]}</b><div class="en er-editable" data-path="step1.${i}.feelings">${s.feelings}</div></div>
        </div>
      </div>`;
    }).join('');
    const btn = `<button class="er-btn er-btn-sm" onclick="EssayReview._toggleStep1()">${step1Hidden ? '👁 Show' : '🙈 Hide'}</button>`;
    /* ★应用文①审题拆解：读题干情境五问（续写①读原文按段梳理）——输入理解，源泉不同 */
    const isPrac = a.type === 'practical';
    const secTitle = isPrac ? '审题拆解 · 情境五问' : '语篇梳理';
    return `<div class="er-sec-row"><h4 class="er-sec" style="margin:0">${secTitle}</h4>${btn}</div>${parts}`;
  }
  function toggleStep2() {
    step2Hidden = !step2Hidden;
    renderContent();
  }
  function htmlStep2() {
    const btn = `<button class="er-btn er-btn-sm" onclick="EssayReview._toggleStep2()">${step2Hidden ? '👁 Show' : '🙈 Hide'}</button>`;
    /* 净化：p内嵌div是非法HTML，浏览器截断p导致布局碎裂+collectEdits丢div内容。div统一转br */
    const clean = (h) => String(h || '')
      .replace(/<div[^>]*>/gi, '<br>').replace(/<\/div>/gi, '')
      .replace(/(<br>\s*){2,}/gi, '<br>');
    /* ★应用文②定位基调·四问辨析台：交际目的/关系定位/情感分寸/联结路径——
       每问四选项（错误项=真实病症方向），学生先揣摩点选，再展开辨析why，总结a由Hide控制（学生先行）。
       续写step2无opts → 走原q/a渲染，零影响 */
    const isPrac2 = (art().type === 'practical');
    const hasOpts2 = isPrac2 && art().step2.some(q => q && Array.isArray(q.opts));
    const secTitle = hasOpts2 ? '定位基调 · 四问辨析' : (isPrac2 ? '定位基调' : '确定主题 · 三问');
    return `<div class="er-sec-row"><h4 class="er-sec" style="margin:0">${secTitle}</h4>${btn}</div>` +
      art().step2.map((qa, i) => {
        const optsHtml = (isPrac2 && Array.isArray(qa.opts) && qa.opts.length) ? `
          <div class="er-opts2">
            ${qa.opts.map((o, j) => `
            <div class="er-opt2" data-v="${o.v ? 1 : 0}" data-open="0">
              <span class="er-opt2-mark"></span><span class="er-opt2-t">${esc(o.t)}</span>
              <div class="er-opt2-why">${o.why}</div>
            </div>`).join('')}
          </div>` : '';
        return `
      <div class="er-card">
        <p class="er-editable" style="color:var(--color-primary-text-dark);font-weight:bold" data-path="step2.${i}.q">${qa.q}</p>
        ${optsHtml}
        <p class="en er-editable${step2Hidden ? ' er-hidden' : ''}" style="margin-top:6px" data-path="step2.${i}.a">${clean(qa.a)}</p>
      </div>`;
      }).join('');
  }
  /* 步骤③④ 单列/双列排布（窄屏课堂用），记忆在 DB.ui.single34 */
  function singleCol() { return !!(DB && DB.ui && DB.ui.single34); }
  function toggleCols34() {
    DB.ui = DB.ui || {};
    DB.ui.single34 = !DB.ui.single34;
    persist(); renderContent();
  }
  function colBtn() {
    return `<button class="er-btn er-btn-sm" onclick="EssayReview._toggleCols34()" title="切换排布">${singleCol() ? '▤ 单列' : '▦ 双列'}</button>`;
  }
  /* 步骤③指南：可折叠（学生回顾后收起不占空间） */
  let guide3Open = true;
  function toggleGuide3() {
    guide3Open = !guide3Open;
    renderContent();
  }
  function toggleStep3() {
    step3Hidden = !step3Hidden;
    renderContent();   // 右栏卡片显隐 + 左栏原文高亮同步刷新
  }
  function htmlStep3() {
    const a = art(), s = a.step3;
    const FL = a.fuLabels || ['提取', '复用'];
    const isCon = a.type !== 'practical';
    /* ★应用文④建构要点·四把梯子：层次性=爬梯过程，思想性=顶层（续写③盘点原文隐性伏笔） */
    const title = isCon ? '寻找伏笔 · 五类潜力股' : '建构要点 · 四把梯子爬出层次';
    const guideTitle = isCon ? '伏笔寻找指南' : '选梯指南';
    const btn = colBtn() + `<button class="er-btn er-btn-sm" onclick="EssayReview._toggleStep3()">${step3Hidden ? '👁 Show' : '🙈 Hide'}</button>`;
    const buildHtml = isCon ? '' : renderBuild(s);   /* ④应用文第二部分：本篇建构（续写无此区块） */
    return `<div class="er-sec-row"><h4 class="er-sec" style="margin:0">${title}</h4>${btn}</div>
      <div class="er-card er-fold${guide3Open ? '' : ' closed'}">
        <button class="er-fold-head" onclick="EssayReview._toggleGuide3()">${guideTitle} <span class="er-caret">${guide3Open ? '▾' : '▸'}</span></button>
        <div class="er-fold-body er-editable" data-path="step3.guide"><p>${s.guide}</p></div>
      </div>
      <div class="er-grid2${step3Hidden ? ' er-hidden' : ''}${singleCol() ? ' er-single' : ''}">${s.items.map((it, i) => `
        <div class="er-card er-fu ${it.cls}">
          <div class="fu-head">${it.icon} <b>${esc(it.name)}</b> <span class="fu-type">${esc(it.type)}</span></div>
          <p class="en" style="font-size:13px"><b style="color:var(--text-tertiary)">${FL[0]}：</b><span class="er-editable" data-path="step3.items.${i}.extract">${it.extract}</span></p>
          <p class="en" style="font-size:13px"><b style="color:var(--text-tertiary)">${FL[1]}：</b><span class="er-editable" data-path="step3.items.${i}.reuse">${it.reuse}</span></p>
          <p style="font-size:12.5px;color:var(--text-secondary)"><span class="er-editable" data-path="step3.items.${i}.effect">${it.effect}</span></p>
        </div>`).join('')}</div>
      ${buildHtml}`;
  }
  /* ★④第二部分·本篇建构（支架的应用）：选梯决策 + 爬梯现场（三级成句，阶梯式视觉）——
     支架的意义在应用：梯子架到本题要点上，爬出③猪肚需要的层次与个性化句 */
  function renderBuild(s) {
    const b = s.build;
    if (!b || !Array.isArray(b.runs)) return '';
    const runs = b.runs.map((r, i) => `
      <div class="er-card er-fu ${r.cls || ''}">
        <div class="fu-head">🪜 <b>${esc(r.ladder)}</b> <span class="fu-type">→ ${esc(r.point)}</span></div>
        <div class="er-ladder${step3Hidden ? ' er-hidden' : ''}">${(r.steps || []).map((st, j) => `
          <div class="er-lv er-lv${j}" style="margin-left:${j * 26}px">
            <span class="er-lv-tag">${esc(st.lvl)}</span>
            <span class="en er-editable" style="flex:1" data-path="step3.build.runs.${i}.steps.${j}.sent">${st.sent}</span>
          </div>
          ${j < r.steps.length - 1 ? '<div class="er-lv-arrow" style="margin-left:' + ((j * 26) + 13) + 'px">▼</div>' : ''}`).join('')}
        </div>
        <p style="margin-top:8px;font-size:12.5px;color:var(--text-secondary)"><span class="er-editable" data-path="step3.build.runs.${i}.note">${r.note}</span></p>
      </div>`).join('');
    return `
      <div class="er-sec-row" style="margin-top:14px"><h4 class="er-sec" style="margin:0">本篇建构 · 把梯子架到本题要点上</h4></div>
      <div class="er-card" style="background:var(--color-primary-bg-soft);border:1px solid var(--color-primary-border)">
        <b style="color:var(--color-primary-text-dark)">本篇选梯：</b><span class="er-editable" data-path="step3.build.pick">${b.pick}</span>
      </div>${runs}`;
  }
  let step4Hidden = false;
  function toggleStep4() {
    step4Hidden = !step4Hidden;
    renderContent();
  }
  /* 隐藏态只留"情节A/B/C"式标签，正文不进 DOM（也避免误收集编辑） */
  function maskPlot(p) {
    const m = /^(&nbsp;|\s)*<b>([^<]*)<\/b>/.exec(p);
    return m ? `<b>${m[2]}</b>` : '';
  }
  function htmlStep4() {
    const a = art(), s = a.step4;
    /* ★应用文③谋篇布局·凤头猪肚豹尾：三段各达成什么+段内微结构+字数预算（凤15·猪45·豹20）；
       sections 结构不存在时回落续写 p1/p2 双卡渲染（续写路径原样保留零改动） */
    if (a.type === 'practical' && Array.isArray(s.sections)) {
      const title = '谋篇布局 · 凤头猪肚豹尾';
      const btn = `<button class="er-btn er-btn-sm" onclick="EssayReview._toggleStep4()">${step4Hidden ? '👁 Show' : '🙈 Hide'}</button>`;
      const cards = s.sections.map((sec, i) => `
        <div class="er-card er-fu ${sec.cls || ''}" style="margin-bottom:10px">
          <div class="fu-head">${sec.icon} <b>${esc(sec.part)}</b>
            <span class="er-budget">预算 ${esc(sec.budget)}</span></div>
          <p style="margin:6px 0 2px"><b style="color:var(--color-primary-text-dark)">达成：</b><span class="er-editable" data-path="step4.sections.${i}.goal">${sec.goal}</span></p>
          <p style="margin:4px 0"><b style="color:var(--text-tertiary)">微结构：</b><span class="er-editable" data-path="step4.sections.${i}.micro">${sec.micro}</span></p>
          <div class="${step4Hidden ? 'er-hidden' : ''}">${(sec.plots || []).map(p => `<p style="margin:5px 0;font-size:13px">${p}</p>`).join('')}</div>
        </div>`).join('');
      return `<div class="er-sec-row"><h4 class="er-sec" style="margin:0">${title}</h4>${btn}</div>
        <div class="er-card" style="background:var(--color-primary-bg-soft);border:1px solid var(--color-primary-border)">
          <div class="er-editable" data-path="step4.overview" style="font-size:13.5px;color:var(--color-primary-text-dark);font-weight:600">${s.overview || ''}</div>
        </div>${cards}`;
    }
    const title = '预测情节 · 先圈段首句关键词，再排 3+3 微情节';
    const btn = colBtn() + `<button class="er-btn er-btn-sm" onclick="EssayReview._toggleStep4()">${step4Hidden ? '👁 Show' : '🙈 Hide'}</button>`;
    function blk(k, openerIdx, label) {
      const openerText = (k.openerTxt !== undefined) ? k.openerTxt : (art().openers[openerIdx] || '');
      const plotsHtml = step4Hidden
        ? k.plots.map(p => `<p>${maskPlot(p)}</p>`).join('')
        : k.plots.map(p => `<p>${p}</p>`).join('');
      const plotsDiv = step4Hidden
        ? `<div>${plotsHtml}</div>`
        : `<div class="er-editable" data-path="step4.${label}.plots">${plotsHtml}</div>`;
      // keywords 可编辑（隐藏答案态仍隐藏）
      const kwHtml = step4Hidden
        ? `<span class="er-kw en er-hidden">${k.keywords}</span>`
        : `<span class="er-kw en er-editable" data-path="step4.${label}.keywords">${k.keywords}</span>`;
      return `<div class="er-card">
        <p class="er-opener en">${openerText}</p>
        <p style="margin:7px 0"><b style="color:var(--color-primary-text-dark)">Key words:</b> ${kwHtml}</p>
        ${plotsDiv}
      </div>`;
    }
    return `<div class="er-sec-row"><h4 class="er-sec" style="margin:0">${title}</h4>${btn}</div>
      <div class="er-grid2${singleCol() ? ' er-single' : ''}">${blk(s.p1, 0, 'p1')}${blk(s.p2, 1, 'p2')}</div>`;
  }
  function htmlStep5() {
    const a5 = art();
    /* ★应用文⑤病理对照库：12类高频问题 × 正反真句对照，按病源分组（溯源前四步+⑦五维）；
       续写保持原 std/checks/pred 渲染（零改动） */
    if (a5.type === 'practical' && a5.step5.some(c => c && c.bad !== undefined)) {
      const GROUP_META = [
        ['审题病', '① 审题拆解'], ['基调病', '② 定位基调'], ['结构病', '③ 谋篇布局'],
        ['建构病', '④ 建构要点'], ['语言病', '⑥ 输入语料']
      ];
      const groups = {};
      a5.step5.forEach((c, i) => {
        if (!c) return;
        const g = String(c.src || '').split('·')[0].trim() || '其他';
        (groups[g] = groups[g] || []).push({ c, i });
      });
      const html = GROUP_META.filter(m => groups[m[0]]).map(m => `
        <div class="er-sec-row" style="margin-top:12px"><h4 class="er-sec" style="margin:0;font-size:13.5px">${m[0]} · 源自 ${m[1]}</h4></div>
        ${groups[m[0]].map(({ c, i }) => `
        <div class="er-card">
          <p style="margin:0"><b style="color:var(--color-primary-text-dark)">${c.t}</b>
            ${c.src ? `<span class="er-src-tag">${String(c.src).split('·')[1] || ''}</span>` : ''}</p>
          <div class="er-bg bad en">✗ <span class="er-editable" data-path="step5.${i}.bad">${c.bad}</span></div>
          <div class="er-bg good en">✓ <span class="er-editable" data-path="step5.${i}.good">${c.good}</span></div>
          <p class="er-editable" data-path="step5.${i}.note" style="margin:5px 0 0;font-size:12.5px;color:var(--text-secondary)">${c.note || ''}</p>
          ${(c.checks || []).length ? `<div style="margin-top:6px">${c.checks.map((k, j) => `
          <div class="er-check-item">
            <span class="box" onclick="EssayReview._tick(this)"></span>
            <span class="ck en er-editable" style="flex:1" data-path="step5.${i}.checks.${j}.q">${k.q}</span>
            ${k.s6 !== undefined ? `<button class="er-link6" onclick="EssayReview._gotoS6(${k.s6})" title="跳到⑥的对应语料">⑥ 语料</button>` : ''}
          </div>`).join('')}</div>` : ''}
        </div>`).join('')}`).join('');
      return `<h4 class="er-sec">反馈问题 · 病理对照</h4>` + html;
    }
    return `<h4 class="er-sec">反馈问题 · 对照自查</h4>` +
      a5.step5.map((c, i) => `
      <div class="er-card">
        <p><b style="color:var(--color-primary-text-dark)">${c.t}</b></p>
        <p class="er-editable" data-path="step5.${i}.desc" style="margin-top:4px;color:var(--text-body)">${c.desc || c.std || ''}</p>
        <div style="margin-top:8px">${(c.checks || []).map((k, j) => `
          <div class="er-check-item">
            <span class="box" onclick="EssayReview._tick(this)"></span>
            <span class="ck en er-editable" style="flex:1" data-path="step5.${i}.checks.${j}.q">${k.q}</span>
            ${k.s6 !== undefined ? `<button class="er-link6" onclick="EssayReview._gotoS6(${k.s6})" title="跳到⑥的对应语料">⑥ 语料</button>` : ''}
          </div>`).join('')}</div>
        <p class="er-editable" data-path="step5.${i}.pred" style="margin-top:6px">${c.pred || ''}</p>
      </div>`).join('');
  }
  /* 从⑤的自查项跳到⑥对应语料卡：切步骤 + 滚动定位 + 闪光 */
  function gotoS6(idx) {
    curStep = 5; renderContent();
    const card = document.querySelector(`.er-pane.on [data-path="step6.qs.${idx}"]`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('er-flash');
      setTimeout(() => card.classList.remove('er-flash'), 1800);
    }
  }
  /* ===== 步骤⑥ 图×语料 成对工作台 ===== */
  /* 图片压缩：长边 maxDim，输出 JPEG；小图（<150KB）或已是位图小件原样返回 */
  function compressDataUrl(dataUrl, cb) {
    const maxDim = 960, quality = 0.85;
    if (!/^data:image/i.test(dataUrl) || dataUrl.length < 150000) { cb(dataUrl); return; }
    const img = new Image();
    img.onload = () => {
      const sc = Math.min(1, maxDim / Math.max(img.width, img.height));
      if (sc >= 1) { cb(dataUrl); return; }
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      cb(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => cb(dataUrl);
    img.src = dataUrl;
  }

  let selPairIdx = null;      // 当前选中的图框（粘贴目标）
  let dragPairIdx = null;     // 拖拽排序源
  function pairs() { const s6 = art().step6; if (!Array.isArray(s6.pairs)) s6.pairs = []; return s6.pairs; }
  function addPair() { pairs().push({ imgs: [{ src: '', x: 0, y: 0, w: 280, h: 180 }], text: '' }); persist(); renderContent(); }
  function delPair(i) { pairs().splice(i, 1); persist(); renderContent(); }
  function delPairImg(i, k) { const ps = pairs(); if (ps[i] && Array.isArray(ps[i].imgs)) { ps[i].imgs.splice(k, 1); persist(); renderContent(); } }
  function cycleLayout(i) { const ps = pairs(); if (ps[i]) { const cur = ps[i].layout || 'r'; ps[i].layout = ({ r: 'b', b: 'l', l: 'r' })[cur]; persist(); renderContent(); } }
  function toggleBr(i, k) { const ps = pairs(); if (ps[i] && ps[i].imgs && ps[i].imgs[k]) { ps[i].imgs[k].br = !ps[i].imgs[k].br; persist(); renderContent(); } }
  function selPair(i) {
    selPairIdx = i;
    document.querySelectorAll('.er-pair').forEach((row, k) => row.classList.toggle('sel', k === i));
    document.querySelectorAll('.er-pair-empty').forEach(z => z.classList.remove('sel'));
    toast('已选中第 ' + (i + 1) + ' 对：Ctrl+V 将粘贴到这里');
  }
  let pickTarget = null;
  function pickImg(i, k) { pickTarget = { i: i, k: k }; const inp = document.getElementById('erPairFile'); if (inp) { inp.value = ''; inp.click(); } }
  function pairFileChosen(input) {
    const f = input.files && input.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setPairImg(pickTarget && pickTarget.i, pickTarget && pickTarget.k, r.result);
    r.readAsDataURL(f);
  }
  function setPairImg(i, k, dataUrl) {
    compressDataUrl(dataUrl, du => {
      const ps = pairs();
      if (i === null || i === undefined || i < 0 || i >= ps.length) { ps.push({ imgs: [{ src: du, w: 0 }], text: '' }); }
      else {
        if (!Array.isArray(ps[i].imgs)) ps[i].imgs = [];
        if (k === null || k === undefined) { const maxY = ps[i].imgs.reduce((m, q) => Math.max(m, (q.y || 0) + (q.h || 0)), 0); ps[i].imgs.push({ src: du, x: 0, y: maxY + 10, w: 280, h: 180 }); }
        else if (ps[i].imgs[k]) ps[i].imgs[k].src = du;
        else ps[i].imgs.push({ src: du, w: 0 });
      }
      persist(); renderContent(); selPairIdx = null;
    });
  }
  function setupPairPaste() {
    /* 三通道：①位图 item（截图/网页图） ②files（资源管理器复制的文件） ③text/html 内嵌 <img>（微信/Word/WPS） */
    const handleDataUrl = (dataUrl) => {
      const ps = pairs();
      const target = (selPairIdx !== null && ps[selPairIdx]) ? selPairIdx : null;
      if (target !== null) {
        const emptySlot = (ps[target].imgs || []).findIndex(m => !m.src);
        if (emptySlot >= 0) { setPairImg(target, emptySlot, dataUrl); toast('图片已填入第 ' + (target + 1) + ' 对的空图框'); return; }
      }
      setPairImg(target, null, dataUrl);
      toast(target !== null ? '图片已粘贴到第 ' + (target + 1) + ' 对' : '已粘贴为新一对');
    };
    const readBlob = (f) => {
      const r = new FileReader();
      r.onload = () => compressDataUrl(r.result, handleDataUrl);
      r.readAsDataURL(f);
    };
    document.addEventListener('paste', e => {
      if (document.getElementById('essayView').classList.contains('hidden') || curStep !== 5) return;
      const cd = e.clipboardData;
      if (!cd) return;
      /* 焦点在可编辑文本内：仅拦截真图片；纯文字/富文本放行默认粘贴 */
      const inEditable = e.target && e.target.closest && !!e.target.closest('.er-editable');
      let imgFile = null, htmlItem = null;
      if (cd.items) {
        for (const it of cd.items) {
          if (!it.type) continue;
          if (it.type.indexOf('image') === 0 && !imgFile) imgFile = it.getAsFile();
          else if (it.type.indexOf('text/html') === 0 && !htmlItem) htmlItem = it;
        }
      }
      if (!imgFile && cd.files && cd.files.length && cd.files[0].type.indexOf('image') === 0) imgFile = cd.files[0];
      if (imgFile) { e.preventDefault(); readBlob(imgFile); return; }   // 图片：无论焦点在哪都收图
      if (inEditable) return;                                            // 文本框内非图片：放行默认粘贴（文字可 Ctrl+V）
      if (htmlItem) {
        e.preventDefault();
        htmlItem.getAsString(html => {
          const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html || '');
          const src = m && m[1];
          if (!src) { toast('剪贴板里没有检测到图片'); return; }
          if (/^data:image/i.test(src)) { compressDataUrl(src, handleDataUrl); return; }
          /* http(s) 图：抓取转 dataURL（跨域失败则提示） */
          fetch(src).then(r => r.blob()).then(readBlob).catch(() => toast('图片来自外部链接，无法直接粘贴，请先另存为本地文件'));
        });
        return;
      }
      toast('剪贴板里没有检测到图片（试试点图片选中后按 Ctrl+V）');
    }, true);
  }
  /* 槽位整体拖动：按住框体拖动即移动位置；未移动的按下仍视为点击（选中） */
  function slotMove(i, k, e, slot) {
    if (e.target.closest && e.target.closest('.er-rs, .er-imgdel')) return;   // 调大小/删除有自己的交互
    e.preventDefault();
    try { slot.setPointerCapture(e.pointerId); } catch (err) { }
    const sx = e.clientX, sy = e.clientY;
    const L0 = slot.offsetLeft, T0 = slot.offsetTop;
    let moved = false;
    const move = ev => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      moved = true;
      slot.dataset.moved = '1';
      slot.style.left = Math.max(0, L0 + dx) + 'px';
      slot.style.top = Math.max(0, T0 + dy) + 'px';
      fitArea(slot.closest('.er-pair-img'));
    };
    const up = () => {
      slot.removeEventListener('pointermove', move);
      slot.removeEventListener('pointerup', up);
      slot.removeEventListener('pointercancel', up);
      try { slot.releasePointerCapture(e.pointerId); } catch (err) { }
      if (moved) {
        setTimeout(() => { delete slot.dataset.moved; }, 120);
        const ps = pairs();
        if (ps[i] && ps[i].imgs && ps[i].imgs[k]) {
          ps[i].imgs[k].x = slot.offsetLeft;
          ps[i].imgs[k].y = slot.offsetTop;
          persist(); renderContent();
        }
      }
    };
    slot.addEventListener('pointermove', move);
    slot.addEventListener('pointerup', up);
    slot.addEventListener('pointercancel', up);
  }
  /* 画布自适应：按全部槽位外包络实时设定图区尺寸（文本随之伸缩） */
  function fitArea(area) {
    const slots = [...area.querySelectorAll('.er-slot')];
    let W = 200, H = 120;
    slots.forEach(el => {
      W = Math.max(W, el.offsetLeft + el.offsetWidth);
      H = Math.max(H, el.offsetTop + el.offsetHeight);
    });
    area.style.width = (W + 8) + 'px';
    area.style.height = (H + 8) + 'px';
  }
  /* ▢ 框定图框：点击后进入画框态，在图区拖画矩形 → 生成该尺寸空图框 */
  function rectBtn(i, btn) {
    const row = btn.closest('.er-pair');
    const area = row && row.querySelector('.er-pair-img');
    if (!area) return;
    toast('在图区按住拖画矩形，松手生成图框');
    area.classList.add('er-drawing');
    let sx = 0, sy = 0, box = null;
    const down = e => {
      if (e.button !== 0) return;
      e.preventDefault();
      const rc = area.getBoundingClientRect();
      sx = e.clientX - rc.left; sy = e.clientY - rc.top;
      box = document.createElement('div');
      box.className = 'er-drawrect';
      area.appendChild(box);
      try { area.setPointerCapture(e.pointerId); } catch (err) { }
      const move = ev => {
        let x = ev.clientX - rc.left, y = ev.clientY - rc.top;
        x = Math.max(0, Math.min(Math.max(area.clientWidth, 560), x));
        y = Math.max(0, Math.min(Math.max(area.clientHeight, 420), y));
        /* 锚点语义：按下点固定为左上角，向右下拖出宽高（反向拖动按 0 处理） */
        const w = Math.max(0, x - sx), h = Math.max(0, y - sy);
        box.style.cssText = 'left:' + sx + 'px;top:' + sy + 'px;width:' + w + 'px;height:' + h + 'px';
        area.style.width = Math.max(area.offsetWidth, sx + w + 8) + 'px';
        area.style.height = Math.max(area.offsetHeight, sy + h + 8) + 'px';
      };
      const up = ev => {
        area.removeEventListener('pointermove', move);
        area.removeEventListener('pointerup', up);
        try { area.releasePointerCapture(ev.pointerId); } catch (err) { }
        box.remove();
        area.classList.remove('er-drawing');
        area.onpointerdown = null;
        const w = Math.round(Math.max(0, ev.clientX - rc.left - sx)) || 280;
        const h = Math.round(Math.max(0, ev.clientY - rc.top - sy)) || 180;
        const cw = Math.max(90, Math.min(560, w)), ch = Math.max(70, Math.min(420, h));
        const pr = pairs()[i];
        if (pr) {
          if (!Array.isArray(pr.imgs)) pr.imgs = [];
          pr.imgs.push({ src: '', x: Math.max(0, Math.round(Math.min(sx, ev.clientX - rc.left))), y: Math.max(0, Math.round(Math.min(sy, ev.clientY - rc.top))), w: cw, h: ch });
          persist(); renderContent(); toast('已生成 ' + cw + '×' + ch + ' 图框（位置按你所画）');
        }
      };
      area.addEventListener('pointermove', move);
      area.addEventListener('pointerup', up);
    };
    area.onpointerdown = down;
  }
  /* 文本框指针拖拽：按下即抓（Pointer Capture），拖动实时指示落区，松手落位 */
  function txtDropZone(row, e) {
    const imgB = row.querySelector('.er-pair-img');
    if (!imgB) return 'r';
    const ib = imgB.getBoundingClientRect();
    if (e.clientY > ib.bottom - 8) return 'b';
    return e.clientX < ib.left + ib.width / 2 ? 'l' : 'r';
  }
  function txtPtrDown(i, e, handle) {
    e.preventDefault();
    try { handle.setPointerCapture(e.pointerId); } catch (err) { }
    const row = handle.closest('.er-pair');
    if (!row) return;
    document.body.style.cursor = 'grabbing';
    const hint = ev => {
      const z = txtDropZone(row, ev);
      ['l', 'r', 'b'].forEach(k => row.classList.toggle('zone-' + k, k === z));
    };
    const up = ev => {
      handle.removeEventListener('pointermove', hint);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      try { handle.releasePointerCapture(ev.pointerId); } catch (err) { }
      document.body.style.cursor = '';
      const z = txtDropZone(row, ev);
      row.classList.remove('zone-l', 'zone-r', 'zone-b');
      const ps = pairs();
      if (ps[i] && (ps[i].layout || 'r') !== z) {
        ps[i].layout = z; persist(); renderContent();
        toast(z === 'b' ? '文本已移到图下方' : z === 'l' ? '文本已移到图左侧' : '文本已移到图右侧');
      }
    };
    handle.addEventListener('pointermove', hint);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }
 
  function pairDragStart(i, e) { dragPairIdx = i; try { e.dataTransfer.effectAllowed = 'move'; } catch (err) { } }
  function pairDragOver(i, e) {
    if (dragTxtIdx !== null) {   // 拖文本框：仅允许落在自己的对上
      if (dragTxtIdx === i) e.preventDefault();
      return;
    }
    if (dragPairIdx === null || dragPairIdx === i) return;
    e.preventDefault();
    document.querySelectorAll('.er-pair').forEach((r, k) => r.classList.toggle('dragover', k === i));
  }
  function pairDrop(i, e) {
    e.preventDefault();
    document.querySelectorAll('.er-pair').forEach(r => r.classList.remove('dragover'));
    if (dragTxtIdx !== null) {   // 拖文本框落点 → 布局
      if (dragTxtIdx === i) {
        const zone = txtDropZone(document.querySelectorAll('.er-pair')[i], e);
        const ps = pairs(); if (ps[i]) { ps[i].layout = zone; persist(); renderContent(); toast(zone === 'b' ? '文本已移到图下方' : zone === 'l' ? '文本已移到图左侧' : '文本已移到图右侧'); }
      }
      dragTxtIdx = null;
      return;
    }
    if (dragPairIdx === null || dragPairIdx === i) return;
    const ps = pairs();
    const [m] = ps.splice(dragPairIdx, 1);
    ps.splice(i, 0, m);
    dragPairIdx = null;
    persist(); renderContent();
  }
  function pairDragEnd(el) { el.removeAttribute('draggable'); dragPairIdx = null; document.querySelectorAll('.er-pair').forEach(r => r.classList.remove('dragover')); }
  /* 图片宽度拖拽（右下角手柄，位置式） */
  function pairResize(i, k, e) {
    const handle = e.currentTarget;
    const slot = handle.parentElement;
    if (!slot) return;
    e.preventDefault();
    e.stopPropagation();
    try { handle.setPointerCapture(e.pointerId); } catch (err) { }
    const rc = slot.getBoundingClientRect();
    const move = ev => {
      const w = Math.max(70, Math.min(560, ev.clientX - rc.left));
      const h = Math.max(55, Math.min(420, ev.clientY - rc.top));
      slot.style.width = w + 'px';
      slot.style.height = h + 'px';
      const size = slot.querySelector('.er-slot-size');
      if (size) size.textContent = Math.round(w) + ' × ' + Math.round(h);
      fitArea(slot.closest('.er-pair-img'));   /* 大框/文本实时自适应 */
    };
    const up = ev => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      try { handle.releasePointerCapture(ev.pointerId); } catch (err) { }
      const ps = pairs();
      if (ps[i] && ps[i].imgs && ps[i].imgs[k]) {
        ps[i].imgs[k].w = Math.round(slot.offsetWidth);
        ps[i].imgs[k].h = Math.round(slot.offsetHeight);
        persist();
      }
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  }
  function pairFileDrop(i, k, e) {
    e.preventDefault(); e.stopPropagation();
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && f.type.indexOf('image') === 0) {
      const r = new FileReader();
      r.onload = () => setPairImg(i, (k === undefined ? null : k), r.result);
      r.readAsDataURL(f);
    }
  }
  function htmlStep6() {
    const s = art().step6;
    const ps = Array.isArray(s.pairs) ? s.pairs : [];
    const pairRows = ps.map((p, i) => {
      const imgs = Array.isArray(p.imgs) ? p.imgs : [];
      /* 画布尺寸 = 所有槽位的外包络（保证绝对定位的槽都在画布内） */
      let CW = 200, CH = 120;
      imgs.forEach(m => { CW = Math.max(CW, (m.x || 0) + (m.w || 280)); CH = Math.max(CH, (m.y || 0) + (m.h || 180)); });
      const cells = imgs.map((im, k) => {
        const x = im.x || 0, y = im.y || 0, w = im.w || 280, h = im.h || 180;
        const inner = im.src
          ? `<img src="${im.src}" alt="图${i + 1}-${k + 1}" style="width:100%;height:100%;object-fit:cover">`
          : `<div class="er-slot-hint">➕ 加图 / Ctrl+V<div class="er-slot-size">${w} × ${h}</div></div>`;
        return `<div class="er-slot${im.src ? ' filled' : ''}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;cursor:grab;touch-action:none"
          onpointerdown="EssayReview._slotMove(${i},${k},event,this)"
          onclick="if(!this.dataset.moved)EssayReview._selPair(${i})" ondragover="event.preventDefault()" ondrop="EssayReview._pairFileDrop(${i},${k},event)"
          title="按住拖动调整位置；右下角拖动调大小${im.src ? '' : '；Ctrl+V / 拖入图片'}">
          ${inner}
          <div class="er-rs" title="拖动调整框大小" onpointerdown="EssayReview._pairResize(${i},${k},event)"></div>
          <button class="er-imgdel" title="删除此框" onclick="event.stopPropagation();EssayReview._delPairImg(${i},${k})">✕</button>
        </div>`;
      }).join('');
      const imgWrap = `<div class="er-pair-img" style="width:${CW + 8}px;height:${CH + 8}px">${cells || '<div class="er-noimg">左侧点 ▢ 框定图框大小</div>'}</div>`;
      const txtBlock = `<div class="er-pair-txt en">
          <div class="er-pair-title er-editable en" data-path="step6.pairs.${i}.title" data-ph="标题（如：目标句式 / 微情境名）">${p.title || ''}</div>
          <div class="er-pair-body er-editable en" data-path="step6.pairs.${i}.text" data-ph="正文：提示词 / 目标句式 / 示范句">${p.text}</div>
        </div>`;
      return `
      <div class="er-pair${selPairIdx === i ? ' sel' : ''}">
        <div class="er-sides">
          <button class="er-sbtn" title="框定新图框（在图区拖画矩形）" onclick="EssayReview._rectBtn(${i},this)">▢</button>
          <button class="er-sbtn del" title="删除本框" onclick="EssayReview._delPair(${i})">✕</button>
        </div>
        ${imgWrap}${txtBlock}
      </div>`;
    }).join('');
    /* ★应用文⑥输入语料：纯文字语料（无图文工作台——图文对照是续写描写点的形态，应用文语言得体不需要配图）；
       续写⑥保持图文工作台（Show not tell + 图×语料成对） */
    const isPrac6 = (art().type === 'practical');
    const secTitle = isPrac6 ? '输入语料 · Idiomatic, not literal' : '输入语料 · Show, not tell';
    const qsHtml = `<h4 class="er-sec">${secTitle}</h4>` + s.qs.map((q, i) => `
      <div class="er-card">
        <p style="color:var(--color-primary-text-dark);font-weight:bold">${esc(q.p)} ｜ <span class="er-editable" data-path="step6.qs.${i}.q">${q.q}</span></p>
        ${q.corpus.map(cp => `
          <p style="margin-top:7px">
            <span class="er-tell">${cp.tell}</span><span class="er-arrow">➜</span>
            <span class="er-shows">${cp.show}</span>
            <br>${cp.skills.map(k => `<span class="er-skill">${k}</span>`).join('')}
          </p>`).join('')}
      </div>`).join('');
    if (isPrac6) return qsHtml;   /* 应用文：纯语料文字到此为止 */
    return qsHtml + `
      <div style="text-align:right;margin:12px 0 2px"><button class="er-btn er-btn-sm" onclick="EssayReview._addPair()">➕ 新增一对（图 × 语料）</button></div>
      ${pairRows || `<div class="er-zone">点「➕ 新增一对」开始：左图右文，图片可粘贴 / 选图 / 拖入，右下角拖动调宽，抓手拖动排序</div>`}
      <input type="file" id="erPairFile" accept="image/*" hidden>
      <h4 class="er-sec">补充语料（可导入）</h4>
      <div class="er-zone er-editable" data-path="step6.extra">${s.extra}</div>
      <div style="text-align:center"><button class="er-btn" onclick="EssayReview._importText('step6.extra')">📥 导入文字</button></div>`;
  }
  /* 步骤⑦学生原卷（学测网）：新标签打开，链接可改可存 */
  function xueceUrl() { return (DB.ui && DB.ui.xueceUrl) || DEFAULT_XUECE_URL; }
  function openXuece() { window.open(xueceUrl(), '_blank'); }
  function editXuece() {
    const u = prompt('学测网学生原卷链接（换考试后在此更新）：', xueceUrl());
    if (u && u.trim()) { DB.ui = DB.ui || {}; DB.ui.xueceUrl = u.trim(); persist(); toast('原卷链接已更新'); }
  }
  /* ================= 步骤⑦ 评价升格（读后续写V3嵌入版，应用文保持原界面） ================= */
  const EV7_DATA = {
    cont: {
      dims: [
        {n:"情节合理", h:"续写内容贴合原文主线，情节合理、有起伏，人物情感发展自然，紧扣故事主题"},
        {n:"内容完整", h:"完成两段给定开头的任务，要点覆盖到位，情感闭环，满足故事续写要求"},
        {n:"语言丰富", h:"词汇、句式多样化；恰当使用非谓语、复合句、描写性表达（动作/神态/环境）"},
        {n:"语法规范", h:"时态、主谓一致、拼写、标点错误少，不出现严重影响理解的硬伤"},
        {n:"衔接顺畅", h:"句间、段内逻辑衔接自然，善用连接词，行文流畅，段落过渡顺滑"}
      ],
      bands: [
        {b:"第五档", r:"21~25分", d:"创造了丰富、合理的内容，富有逻辑性，续写完整，与原文情境融洽度高；使用了多样并且恰当的词汇和语法结构，可能有个别小错误，但不影响意义表达；有效地使用了语句间的衔接手段，全文结构清晰、意义连贯。"},
        {b:"第四档", r:"16~20分", d:"与所给短文融洽度较高，与段落开头语衔接较合理；内容比较丰富、合理；所使用语法结构和词汇较为准确，些许错误不影响意义表达；上下文比较连贯。"},
        {b:"第三档", r:"11~15分", d:"与所给短文关系较为密切，与段落开头语有一定程度的衔接；内容基本合理；语法结构和词汇基本准确，一些错误基本不影响意义表达；上下文基本连贯。"},
        {b:"第二档", r:"6~10分", d:"与所给短文有一定的关系，与段落开头语衔接较差；内容不够丰富或不够合理；语法结构单调、词汇有限，错误较多且部分影响意义表达；上下文不够连贯。"},
        {b:"第一档", r:"1~5分", d:"与所给短文和段落开头语之间的关系较差；内容不合理或不丰富；语法结构单调、词汇有限，错误很多，严重影响意义表达；上下文不连贯，缺乏完整性。"}
      ],
      nextTips: [
        "保持：融洽+丰富+多样三项都稳；拼写、卷面和标点别丢印象分。",
        "融洽度再高一点：伏笔逐条呼应；新增 1-2 处首稿没有的细节；句式再加 1 处独立主格/with复合结构。",
        "情节必须扣住原文情境（不能飞）；段首句之后直接推进；把 felt/happy 类 tell 词换成动作神态。",
        "先保完整连贯：两段写满；把错误减到\"不影响理解\"；用简单连接词 then/when/because 串住上下文。",
        "围绕原文人物与事件写满两段，绝不抄原文；用最有把握的简单句写对。"
      ],
      checklist: [
        {q:"我的续写有没有\"飞\"？每一步都能在原文找到依据吗？"},
        {q:"人物情感变化有过程吗？是渐变还是突变？突变处补过渡句了吗？"},
        {q:"两段任务都完成了吗？逐项对照漏了什么？"},
        {q:"关键伏笔回收了吗？回收了哪几条？"},
        {q:"我的情感是\"演\"出来的还是\"说\"出来的？"},
        {q:"有没有一条动作链（≥3个连续动作写完一件事）？"},
        {q:"有没有至少一处独立主格或 with 复合结构？"},
        {q:"全文时态统一过去时了吗？逐个动词翻一遍"},
        {q:"主谓一致／单复数过了吗？"},
        {q:"段首句之后紧接情节推进了吗？两段之间有呼应吗？"}
      ],
      checkGroups: [
        {dim:"情节合理",color:"var(--color-primary,#1890ff)",from:0,to:1},
        {dim:"内容完整",color:"var(--color-primary,#1890ff)",from:2,to:3},
        {dim:"语言丰富",color:"var(--color-primary,#1890ff)",from:4,to:6},
        {dim:"语法规范",color:"var(--color-primary,#1890ff)",from:7,to:8},
        {dim:"衔接顺畅",color:"var(--color-primary,#1890ff)",from:9,to:9}
      ],
      dirs: ["动作链","无灵主语","独立主格","with复合结构","对话点缀","环境烘托","短句造势","比喻拟人","非谓语压缩","五感细节"],
      srcPH: "例：He cleaned the room carefully.",
      upPH: "例：He *rolled up the old carpet, *stacked the boxes neatly and swept the floor, *stirring up clouds of dust.",
      whyPH: "例：动作有链了，画面动起来了",
      plusPH: "例：加了 with sunlight streaming in 的环境描写",
      bandSpec: [],  /* 由essay-generate技能或教师按本篇定制填写 */
      principle: "评分时，主要从内容、语言表达和篇章结构三个方面考虑。",
      maxScore: 25, scorePH: "18",
      fuyao: null   /* 要点覆盖清单：应用文专属，续写不用 */
    },
    /* ★V3.15 应用文五维（用户定稿·双性格式）——数据从V3融合版移植，配色遵循嵌入版主题蓝统一原则 */
    prac: {
      dims: [
        {n:"内容完整性和连贯性", h:"题干要求的要点逐条覆盖？无遗漏无无关？内容与题干情境、对象身份连贯一致？"},
        {n:"要点层次性和思想性", h:"要点按逻辑递进（背景→安排→期待），不堆砌？有深意、有情感温度，不止表面信息？"},
        {n:"语言丰富性和得体性", h:"句式多样（高级结构/功能句/多样词汇）？用词得体（符合对象身份，不生硬不过分随意）？"},
        {n:"结构严谨性和流畅性", h:"段落功能清晰（一般2-3段）？衔接过渡顺滑（连接词/指代/词汇链自然）？"},
        {n:"语法规范性和准确性", h:"时态/主谓一致/拼写/标点错误少？格式要素对（称呼/落款/Li Hua）？词数达标？"}
      ],
      bands: [
        {b:"第五档", r:"13~15分", d:"完全完成了试题规定的任务；覆盖所有内容要点；应用了较多的语法结构和词汇；语法结构或词汇方面有些许错误，但为尽力使用较复杂结构或较高级词汇所致；有效使用语句间的连接成分，全文结构紧凑，完全达到预期的写作目的。"},
        {b:"第四档", r:"10~12分", d:"完成了试题规定的任务；虽漏掉1、2个次重点，但覆盖所有主要内容；应用的语法结构和词汇能满足任务要求；些许错误主要因尝试较复杂结构或词汇所致；应用简单的连接成分，全文结构比较紧凑，达到预期的写作目的。"},
        {b:"第三档", r:"7~9分", d:"基本完成了试题规定的任务；虽漏掉一些内容，但覆盖所有主要内容；应用的语法结构和词汇能满足任务要求；有一些错误，但不影响理解；应用简单的连接成分，全文内容基本连贯，基本达到预期的写作目的。"},
        {b:"第二档", r:"4~6分", d:"未恰当完成试题规定的任务；漏掉或未描述清楚一些主要内容，写了一些无关内容；语法结构单调、词汇有限；有较多错误影响理解；较少使用语句间的连接成分，内容缺乏连贯性。"},
        {b:"第一档", r:"1~3分", d:"未能完成试题规定的任务；明显遗漏主要内容，写了一些无关内容；语法结构单调、词汇有限；较多错误严重影响理解；缺乏语句间的连接成分，内容不连贯。"}
      ],
      nextTips: [
        "保持：要点全 + 结构紧凑 + 语言流畅；格式细节（称呼/落款）和拼写别丢分。",
        "补齐漏掉的次要点；加 1-2 处高级结构（if 从句 / with / 非谓语）；连接手段再丰富（Therefore / In addition）。",
        "要点宁多勿漏，逐条对照题干；写准固定搭配（would like to do / be held）；通篇用连接词串一遍。",
        "先删无关内容；动笔前列全要点；简单句写对 + 最基本的 First / Then / Besides。",
        "对照题目把要点一条条写全；用背熟的模板句保住格式；避免中式直译。"
      ],
      checklist: [
        {q:"题干要点逐条覆盖了吗？", ev:"漏了哪条：______"},
        {q:"内容与题干情境连贯吗？有没有写偏、写无关的内容？", ev:"偏了的地方：______"},
        {q:"要点按逻辑递进吗（背景→安排→期待），不是平铺堆砌？", ev:"我的顺序：______"},
        {q:"要点有思想性吗——有深意、有情感温度，不止表面信息？", ev:"我体现思想的地方：______"},
        {q:"有≥2处高级结构吗（if从句 / with / 非谓语）？", ev:"写在哪儿：______"},
        {q:"用词得体吗——符合对象身份（对朋友自然、对外教礼貌）？", ev:"不得体的词：______"},
        {q:"段落功能清晰吗（一般2-3段，一段一个功能）？", ev:"我的分段：______"},
        {q:"衔接过渡顺滑吗——连接成分≥2处？指代/词汇链自然？", ev:"我用了：______"},
        {q:"语法硬伤自查：invite you to join？will be held？There will be？拼写标点过一遍", ev:"可疑处：______"},
        {q:"格式要素对吗（称呼/落款/Li Hua）？词数达标（80左右）？", ev:"对象：______ 词数：____"}
      ],
      checkGroups: [
        {dim:"内容完整性和连贯性",color:"var(--color-primary,#1890ff)",from:0,to:1},
        {dim:"要点层次性和思想性",color:"var(--color-primary,#1890ff)",from:2,to:3},
        {dim:"语言丰富性和得体性",color:"var(--color-primary,#1890ff)",from:4,to:5},
        {dim:"结构严谨性和流畅性",color:"var(--color-primary,#1890ff)",from:6,to:7},
        {dim:"语法规范性和准确性",color:"var(--color-primary,#1890ff)",from:8,to:9}
      ],
      dirs: ["if从句","with复合结构","非谓语压缩","被动语态","固定搭配","连接成分","高级词块","礼貌句式"],
      srcPH: "例：The party will hold in our school hall.",
      upPH: "例：The party *will be held* in our school hall, *with a variety of English activities *ranging from songs to short plays.",
      whyPH: "例：语气得体了，要点也收齐了",
      plusPH: "例：加了 It would be our honor if... 的虚拟语气",
      bandSpec: [
        {content:"三个要点全覆盖且扩展得体：①活动背景与目的（English Party / 交流展演）一句点明；②时间地点安排具体（Friday, June 5, 3-5 pm, school hall）＋ ≥2 项活动（songs / short plays / poetry reading）；③礼貌收尾（回复期限＋期待参加），并针对 Chris 擅长唱歌给一句个性化邀请。",
         lang:"功能句地道（I am writing to invite you to… / It would be our honor if… / Looking forward to…）；≥3 处高级结构（if 从句 / with 复合结构 / 非谓语）；拼写标点零失误。",
         struct:"2-3 段功能清晰（自我介绍与目的→安排细节→期待回复）；连接成分自然（Besides / Therefore / In addition）；语气对朋友亲切得体。"},
        {content:"要点全覆盖，扩展略简（如只列 2 项活动、个性化邀请略弱）。",
         lang:"功能句正确；≥2 处高级结构；错误极个别且为尝试复杂结构所致。",
         struct:"段落清晰；有连接成分；语气得体。"},
        {content:"要点基本覆盖（允许漏 1 个次要点，如回复期限）；扩展不足、内容偏简。",
         lang:"语言基本正确；高级结构 0-1 处；有一些错误但不影响理解。",
         struct:"有分段；连接成分少量；结尾完整。"},
        {content:"漏掉主要要点或有无关内容凑字；活动安排不具体。",
         lang:"通篇简单句；错误较多、部分影响理解（如 invite you join / There will have 类错误未修正）。",
         struct:"段落不清或一段到底；几乎无连接成分；格式要素（称呼/落款）有误。"},
        {content:"明显遗漏要点；无关内容多。",
         lang:"错误严重影响理解。",
         struct:"格式要素缺失；内容不连贯。"}
      ],
      principle: "评分原则：先根据内容和语言初步定档，再以该档要求衡量调整。四个看点：① 内容要点覆盖度 ② 语法结构与词汇的准确性和多样性 ③ 语句间连接与篇章连贯 ④ 格式与交际得体性。拼写标点是语言准确性的一部分；书写较差影响交际，酌情降档。",
      maxScore: 15, scorePH: "12",
      fuyaoTitle: "要点覆盖清单（题干逐条拆解）",
      fuyaoHint: "题目要求的信息点，逐条勾选 = 已写到",
      fuyao: ["邀请原因（活动背景一句话）","时间与地点（具体到日期、钟点、地点）","活动安排（≥2 项，有层次）","恳请回复 / 期待参加（礼貌收尾）"]
    }
  };
  /* ★V3.16 统一色系：全部用AFR主题色（--color-primary蓝系），不再彩虹色 */
  const EV7_DIM_COLORS = ["var(--color-primary,#1890ff)","var(--color-primary,#1890ff)","var(--color-primary,#1890ff)","var(--color-primary,#1890ff)","var(--color-primary,#1890ff)"];
  function ev7FmtWho(v){const n=parseInt(v);return n>0?"第"+n+"组":v}
  function ev7FmtBand(v){const m={"一":1,"二":2,"三":3,"四":4,"五":5};const t=v.trim();if(m[t])return"第"+t+"档";if(/^[1-5]$/.test(t))return"第"+"一二三四五"[t-1]+"档";return v}
  function ev7FmtScore(v,max){const n=parseInt(v);return n>=1&&n<=(max||25)?n+"分":v}
  function ev7BandIdx(g){if(!g.ev7Stars||!g.ev7Stars.every(x=>x>0))return null;const avg=g.ev7Stars.reduce((a,b)=>a+b,0)/5;return avg>=2.7?0:avg>=2.2?1:avg>=1.6?2:avg>=1?3:4}
  /* ★双文体：续写/应用文各自取评价数据（应用文不再回落旧界面） */
  function ev7Sel(g){return (art().type||'continuation')==='continuation' ? EV7_DATA.cont : EV7_DATA.prac}
  function ev7RenderRadar(){
    const g=art(), D=ev7Sel(g); if(!D)return '';
    const dims=D.dims, N=dims.length;
    const W=340,H=320,CX=170,CY=165,R=92,RS=R*0.8;
    const ang=i=>-Math.PI/2+i*2*Math.PI/N;
    const pt=(i,r)=>[CX+Math.cos(ang(i))*r, CY+Math.sin(ang(i))*r];
    const P=(i,r)=>pt(i,r).map(v=>v.toFixed(1)).join(",");
    let svg="";
    for(let ring=1;ring<=3;ring++)svg+=`<polygon points="${[...Array(N).keys()].map(i=>P(i,RS*ring/3)).join(" ")}" fill="${ring===3?"var(--bg-subtle)":"none"}" stroke="var(--border-color-lighter)" stroke-width="1"/>`;
    for(let i=0;i<N;i++)svg+=`<line x1="${CX}" y1="${CY}" x2="${pt(i,RS)[0]}" y2="${pt(i,RS)[1]}" stroke="var(--border-color-lighter)"/>`;
    if(g.ev7Stars&&g.ev7Stars.some(x=>x>0))svg+=`<polygon points="${[...Array(N).keys()].map(i=>P(i,RS*(g.ev7Stars[i]||0)/3)).join(" ")}" fill="rgba(24,144,255,.18)" stroke="var(--color-primary)" stroke-width="2" stroke-linejoin="round"/>`;
    for(let i=0;i<N;i++)for(let s=1;s<=3;s++){
      const[x,y]=pt(i,RS*s/3),on=g.ev7Stars&&g.ev7Stars[i]>=s;
      svg+=`<circle class="ev7-radar-star" cx="${x}" cy="${y}" r="13" fill="transparent" data-i="${i}" data-s="${s}"/><text x="${x}" y="${y+6.5}" text-anchor="middle" font-size="17" pointer-events="none" fill="${on?"#faad14":"var(--border-color-light)"}">★</text>`;
    }
    for(let i=0;i<N;i++){
      const[lx,ly]=pt(i,R+6);const cosv=Math.cos(ang(i));
      let x=lx,anchor="middle";
      if(cosv>0.25){anchor="start";x=lx+6}else if(cosv<-0.25){anchor="end";x=lx-6}
      const y=ly+(Math.sin(ang(i))<-0.9?-6:5);
      svg+=`<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="13" font-weight="700" fill="${EV7_DIM_COLORS[i%5]}">${dims[i].n}</text>`;
    }
    return `<div class="ev7-radar-wrap"><div class="ev7-radar-box"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${svg}</svg></div><div class="ev7-dim-notes">${dims.map((d,i)=>`<div class="ev7-dim-note"><span class="no" style="background:${EV7_DIM_COLORS[i%5]}">${i+1}</span><div style="flex:1"><b>${d.n}</b><p>${esc(d.h)}</p></div><span class="dv">${g.ev7Stars&&g.ev7Stars[i]?`<b>${"★".repeat(g.ev7Stars[i])}</b>${"☆".repeat(3-g.ev7Stars[i])}`:"☆☆☆"}</span></div>`).join("")}</div></div>`;
  }
  function ev7RenderBands(){
    const g=art(),D=ev7Sel(g);if(!D)return'';
    const cur=D.bands[g.ev7Band!=null?g.ev7Band:1];
    const src=g.ev7Auto?"<span style='font-size:11px;color:var(--color-primary);background:var(--color-primary-bg);border-radius:8px;padding:0 8px;margin-left:6px'>按打星推算</span>":"<span style='font-size:11px;color:var(--color-primary-text-dark);background:var(--color-primary-bg-soft);border-radius:8px;padding:0 8px;margin-left:6px'>手动选定</span>";
    const spec=(D.bandSpec||[])[g.ev7Band!=null?g.ev7Band:1];
    return `<div class="ev7-principle">${D.principle||"评分时，主要从内容、语言表达和篇章结构三个方面考虑。"}</div>
    <div class="ev7-bandstrip">${D.bands.map((b,i)=>`<button class="${(g.ev7Band!=null?g.ev7Band:1)===i?"on":""}" data-bi="${i}">${b.b} ${b.r}</button>`).join("")}</div>
    <div class="ev7-nexttip"><b>上档点 · 你在${cur.b}（${cur.r}）</b>${src}——${D.nextTips[g.ev7Band!=null?g.ev7Band:1]}</div>
    <div class="ev7-bandspec"><div class="bs-left"><h5>官方档次要求（原文）</h5><p>${esc(cur.d)}</p></div><div class="bs-right"><h5>这篇作文里，${cur.b}要做到——</h5>${spec?`<div class="ev7-bs-dim d-content"><b>内容</b>${esc(spec.content)}</div><div class="ev7-bs-dim d-lang"><b>语言</b>${esc(spec.lang)}</div><div class="ev7-bs-dim d-struct"><b>结构</b>${esc(spec.struct)}</div>`:'<span style="font-size:12px;color:var(--text-tertiary)">本篇三维定制待备课生成</span>'}</div></div>`;
  }
  function ev7RenderCards(){
    const g=art(), D=ev7Sel(g), sPH=(D&&D.scorePH)||"18";
    const cards=g.ev7Cards||[{who:"",band:"",score:"",good:"",prob:"",next:""}];
    const sc=g.ev7Self||{who:"",band:"",score:"",good:"",prob:"",next:""};
    return `<div class="ev7-pc-grid"><div>${cards.map((c,i)=>`<div class="ev7-pcard"><div class="ev7-pcard-head"><span class="who">互评卡 ${i+1}</span><button class="er-btn er-btn-sm" style="margin-left:auto;color:var(--color-danger)" onclick="EssayReview._ev7DelCard(${i})">删除</button></div><div class="ev7-bs-line"><span>评价者：</span><input type="text" data-f="who" data-i="${i}" value="${esc(c.who)}" placeholder="3或姓名"><span>档位：</span><input type="text" data-f="band" data-i="${i}" value="${esc(c.band)}" placeholder="四"><span>得分：</span><input type="text" data-f="score" data-i="${i}" value="${esc(c.score)}" placeholder="${sPH}"></div><div class="ev7-frow"><label>1. 亮点</label><textarea rows="2" data-f="good" data-i="${i}">${esc(c.good)}</textarea></div><div class="ev7-frow"><label>2. 问题</label><textarea rows="2" data-f="prob" data-i="${i}">${esc(c.prob)}</textarea></div><div class="ev7-frow"><label>3. 建议</label><textarea rows="2" data-f="next" data-i="${i}">${esc(c.next)}</textarea></div><div class="ev7-pc-submit"><button class="er-btn er-btn-sm" onclick="EssayReview._ev7SubmitPeer(${i})">提交</button></div></div>`).join("")}</div><div class="ev7-pcard" style="border-left-color:var(--color-primary);background:var(--color-primary-bg-soft)"><div class="ev7-pcard-head"><span class="who">自评卡</span></div><div class="ev7-bs-line"><span>自评者：</span><input type="text" data-f="who" data-sc="1" value="${esc(sc.who)}" placeholder="姓名"><span>档位：</span><input type="text" data-f="band" data-sc="1" value="${esc(sc.band)}" placeholder="四"><span>得分：</span><input type="text" data-f="score" data-sc="1" value="${esc(sc.score)}" placeholder="${sPH}"></div><div class="ev7-frow"><label>1. 亮点</label><textarea rows="2" data-f="good" data-sc="1">${esc(sc.good)}</textarea></div><div class="ev7-frow"><label>2. 问题</label><textarea rows="2" data-f="prob" data-sc="1">${esc(sc.prob)}</textarea></div><div class="ev7-frow"><label>3. 建议</label><textarea rows="2" data-f="next" data-sc="1">${esc(sc.next)}</textarea></div><div class="ev7-pc-submit"><button class="er-btn er-btn-sm" onclick="EssayReview._ev7SubmitSelf()">提交</button></div></div></div>`;
  }
  /* ★应用文专属：要点覆盖清单（题干逐条拆解，勾选=已写到）——诊断"任务完成度"，五维打星之前先过这条生命线 */
  function ev7RenderFuyao(){
    const g=art(), D=ev7Sel(g);
    if(!D||!D.fuyao)return '';
    const fu=Array.isArray(g.ev7Fu)?g.ev7Fu:[];
    const done=fu.filter(Boolean).length;
    return `<div class="ev7-sec">第零步 · ${D.fuyaoTitle||"要点覆盖清单"}<span class="sub">${D.fuyaoHint||"逐条勾选 = 已写到"}</span></div>
    <div class="ev7-card" style="margin-bottom:12px">
      <div style="display:flex;flex-wrap:wrap;gap:6px 14px">${D.fuyao.map((f,i)=>`<label class="ev7-q-row" style="flex:1 1 44%"><input type="checkbox" data-fi="${i}" ${fu[i]?"checked":""}><span>${esc(f)}</span></label>`).join("")}</div>
      <div id="ev7FuTip" style="margin-top:8px;font-size:12.5px;color:${done===D.fuyao.length?'var(--color-success)':'var(--color-warning)'};font-weight:600">${done===D.fuyao.length?'✓ 要点全覆盖——任务完成度过关，再看五维质量':'⚠ 已覆盖 '+done+' / '+D.fuyao.length+' 条——先补齐要点，再谈升档'}</div>
    </div>`;
  }
  function ev7RenderFeedback(){
    const g=art(),all=g.ev7Submitted||[];
    if(!all.length)return '<div style="font-size:12.5px;color:var(--text-tertiary);padding:8px">提交互评卡/自评卡后，评价结果在此汇总。</div>';
    const bands=all.filter(x=>x.band).map(x=>parseInt(x.band.replace(/[^0-9]/g,""))).filter(x=>x>0);
    const avg=bands.length?(bands.reduce((a,b)=>a+b,0)/bands.length).toFixed(1):null;
    return `<div style="margin-bottom:8px;font-size:13px">${all.length} 份评价${avg?` ｜ 平均档位 <b style="color:var(--color-warning)">第${avg}档</b>`:""}${bands.length>=2?` ｜ 区间 第${Math.min(...bands)}~第${Math.max(...bands)}档`:""}</div>${all.map((x,i)=>`<div class="ev7-fb-item"><span class="ev7-fb-who">${esc(x.who||"匿名")}</span><span class="ev7-fb-band">${esc(x.band||"—")}${x.score?" · "+esc(x.score):""}</span><div class="ev7-fb-body">${x.good?`<b style="color:var(--color-success)">✦</b> ${esc(x.good)}　`:""}${x.prob?`<b style="color:var(--color-danger)">✗</b> ${esc(x.prob)}　`:""}${x.next?`<b style="color:var(--color-warning)">➜</b> ${esc(x.next)}`:""}</div><button class="ev7-fb-del" onclick="EssayReview._ev7DelFb(${i})">✕</button></div>`).join("")}`;
  }
  function ev7RenderChecks(){
    const D=ev7Sel(art());if(!D)return'';
    const g=art(),groups=D.checkGroups,list=D.checklist;
    return groups.map(gp=>{const items=[];for(let i=gp.from;i<=gp.to;i++){if(!list[i])continue;items.push(`<label class="ev7-q-row ${(g.ev7Self&&g.ev7Self[i]&&g.ev7Self[i].on)?"on":""}"><input type="checkbox" ${(g.ev7Self&&g.ev7Self[i]&&g.ev7Self[i].on)?"checked":""} data-ci="${i}"><span>${esc(list[i].q)}</span></label>`)}
    return `<div class="ev7-q-group"><div class="ev7-q-dim" style="color:${gp.color}"><span class="dim-dot" style="background:${gp.color}"></span>${gp.dim}</div>${items.join("")}</div>`}).join("");
  }
  function ev7RenderDirs(){
    const D=ev7Sel(art());if(!D)return'';
    return D.dirs.map(k=>`<span class="ev7-dir ${(art().ev7Dirs||[]).includes(k)?"on":""}" data-k="${k}">${k}</span>`).join("");
  }
  function ev7RenderWall(){
    const w=art().ev7Wall||[];
    if(!w.length)return '<div style="text-align:center;color:var(--text-tertiary);font-size:12.5px;padding:18px;border:1.5px dashed var(--border-color-lighter);border-radius:8px">墙还空着——升格完第一句，点「📌 收进档案·送上升格墙」</div>';
    return w.slice(0,30).map((x,i)=>`<div class="ev7-wallcard"><div class="o">✗ ${esc(x.src.length>110?x.src.slice(0,110)+"…":x.src)}</div><div class="n">➜ ${esc(x.up.length>150?x.up.slice(0,150)+"…":x.up).replace(/\*(.+?)\*/g,'<b style="color:var(--color-success)">★$1</b>')}</div><div class="meta"><span class="w">${esc(x.who||"匿名")} · ${x.t||""}</span><span class="tk">${esc(x.dirs||"—")}</span></div><button class="ev7-wall-del" onclick="EssayReview._ev7DelWall(${i})">✕</button></div>`).join("");
  }
  function ev7RenderLog(){
    const logs=art().ev7Logs||[];
    if(!logs.length)return '<div style="font-size:12.5px;color:var(--text-tertiary);text-align:center;padding:16px;border:1.5px dashed var(--border-color-lighter);border-radius:8px">还没有记录。升格完第一句，点「📌 收进档案·送上升格墙」。</div>';
    return logs.map((l,i)=>`<div style="display:flex;gap:10px;align-items:flex-start;padding:9px 4px;${i<logs.length-1?'border-bottom:1px dashed var(--border-color-lighter);':''}">
      <span style="flex:none;color:var(--text-tertiary);font-size:11.5px;width:44px;padding-top:2px">${l.t}</span>
      <div style="flex:1;font-size:13px;line-height:1.7">
        <div style="font-family:Georgia,'Times New Roman',serif;color:var(--text-secondary);text-decoration:line-through;text-decoration-color:rgba(255,77,79,.35)">✗ ${esc(l.src)}</div>
        <div style="font-size:11.5px;color:var(--color-primary-text-dark);margin:1px 0">➜ 方向：${esc(l.dirs||'—')}</div>
        <div style="font-family:Georgia,'Times New Roman',serif;color:var(--text-body)">➜ ${esc(l.up).replace(/\*(.+?)\*/g,'<b style="color:var(--color-success)">★$1</b>')}</div>
        ${l.plus?`<div style="font-size:12px;color:var(--color-warning);margin-top:2px">➕ 新增亮点：${esc(l.plus)}</div>`:''}
        ${l.why?`<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">💬 ${esc(l.why)}</div>`:''}
      </div>
      <button class="er-btn er-btn-sm" style="flex:none;color:var(--color-danger);align-self:center" onclick="EssayReview._ev7DelLog(${i})">删</button>
    </div>`).join('');
  }
  function ev7BindAll(){
    const g=art();
    /* Tab切换 */
    document.querySelectorAll('.ev7-tabs button').forEach(b=>b.onclick=()=>{
      document.querySelectorAll('.ev7-tabs button').forEach(x=>x.classList.remove('on'));
      document.querySelectorAll('.ev7-pane').forEach(x=>x.style.display='none');
      b.classList.add('on');
      document.getElementById('ev7Pane'+b.dataset.t).style.display='block';
    });
    /* 雷达打星 */
    document.querySelectorAll('.ev7-radar-star').forEach(el=>el.onclick=()=>{
      const i=+el.dataset.i,s=+el.dataset.s;
      if(!g.ev7Stars)g.ev7Stars=[0,0,0,0,0];
      g.ev7Stars[i]=(g.ev7Stars[i]===s?0:s);
      if(g.ev7Stars.every(x=>x>0)){const avg=g.ev7Stars.reduce((a,b)=>a+b,0)/5;g.ev7Band=Math.max(0,Math.min(4,avg>=2.7?0:avg>=2.2?1:avg>=1.6?2:avg>=1?3:4));g.ev7Auto=true}
      renderContent(); persist();
    });
    /* 档位条 */
    document.querySelectorAll('.ev7-bandstrip button').forEach(b=>b.onclick=()=>{g.ev7Band=+b.dataset.bi;g.ev7Auto=false;renderContent();persist()});
    /* 卡片输入 */
    document.querySelectorAll('[data-i][data-f]').forEach(t=>{
      t.oninput=()=>{const i=+t.dataset.i,f=t.dataset.f;if(!g.ev7Cards)g.ev7Cards=[{who:"",band:"",score:"",good:"",prob:"",next:""}];if(!g.ev7Cards[i])g.ev7Cards[i]={};g.ev7Cards[i][f]=t.value;persist()};
      t.onblur=()=>{const f=t.dataset.f;let v=t.value.trim();if(f==="who")v=ev7FmtWho(v);else if(f==="band")v=ev7FmtBand(v);else if(f==="score")v=ev7FmtScore(v,(ev7Sel(g)||{}).maxScore);t.value=v;const i=+t.dataset.i;if(g.ev7Cards&&g.ev7Cards[i])g.ev7Cards[i][f]=v;persist()};
    });
    document.querySelectorAll('[data-sc][data-f]').forEach(t=>{
      t.oninput=()=>{if(!g.ev7Self)g.ev7Self={who:"",band:"",score:"",good:"",prob:"",next:""};g.ev7Self[t.dataset.f]=t.value;persist()};
      t.onblur=()=>{const f=t.dataset.f;let v=t.value.trim();if(f==="band")v=ev7FmtBand(v);else if(f==="score")v=ev7FmtScore(v,(ev7Sel(g)||{}).maxScore);t.value=v;if(g.ev7Self)g.ev7Self[f]=v;persist()};
    });
    /* 十问勾选 */
    document.querySelectorAll('[data-ci]').forEach(cb=>cb.onchange=()=>{
      const i=+cb.dataset.ci;if(!g.ev7Self)g.ev7Self={};
      if(!g.ev7Self[i])g.ev7Self[i]={on:false};
      g.ev7Self[i].on=cb.checked;
      const row=cb.closest('.ev7-q-row');if(row)row.classList.toggle('on',cb.checked);
      ev7RenderPickSummary(); persist();
    });
    /* ★应用文要点覆盖清单勾选（局部刷新，不重渲染防丢焦点） */
    document.querySelectorAll('[data-fi]').forEach(cb=>cb.onchange=()=>{
      const i=+cb.dataset.fi,D=ev7Sel(g);
      if(!Array.isArray(g.ev7Fu))g.ev7Fu=[];
      g.ev7Fu[i]=cb.checked;
      const row=cb.closest('.ev7-q-row');if(row)row.classList.toggle('on',cb.checked);
      const done=g.ev7Fu.filter(Boolean).length,n=(D&&D.fuyao)?D.fuyao.length:0;
      const tip=document.getElementById('ev7FuTip');
      if(tip&&n)tip.textContent=done===n?'✓ 要点全覆盖——任务完成度过关，再看五维质量':'⚠ 已覆盖 '+done+' / '+n+' 条——先补齐要点，再谈升档';
      persist();
    });
    /* 升格方向 */
    document.querySelectorAll('.ev7-dir').forEach(d=>d.onclick=()=>{
      const k=d.dataset.k;if(!g.ev7Dirs)g.ev7Dirs=[];
      const ix=g.ev7Dirs.indexOf(k);
      if(ix>=0)g.ev7Dirs.splice(ix,1);else{if(g.ev7Dirs.length>=2){toast("最多选两个方向");return}g.ev7Dirs.push(k)}
      d.classList.toggle('on'); persist();
    });
    /* 升格输入实时对比 */
    const src=document.getElementById('ev7Src'),up=document.getElementById('ev7Up');
    if(src)src.oninput=()=>{g.ev7Src=src.value;document.getElementById('ev7CmpB').textContent=src.value||'（输入原文后自动对比）';persist()};
    if(up)up.oninput=()=>{g.ev7Up=up.value;document.getElementById('ev7CmpA').innerHTML=esc(up.value).replace(/\*(.+?)\*/g,'<b style="color:var(--color-success)">★$1</b>')||'（*号词自动高亮）';persist()};
  }
  function ev7RenderPickSummary(){
    const g=art(),D=ev7Sel(g);if(!D)return;
    const list=D.checklist,picks=[];
    if(g.ev7Self)for(let i=0;i<list.length;i++){if(g.ev7Self[i]&&g.ev7Self[i].on)picks.push(list[i].q)}
    document.getElementById('ev7PickShow').innerHTML=picks.length?picks.map(q=>`<span class="ev7-pick-tag">${esc(q.length>30?q.slice(0,30)+"…":q)}</span>`).join(" "):"（勾选做得不好的条目）";
  }
  function htmlStep7() {
    const g=art(),D=ev7Sel(g);
    /* ★双文体V3评价升格：续写/应用文各自数据（dims/bands/checklist全数据驱动） */
    return `<div class="ev7-tabs"><button class="on" data-t="A">A. 评价</button><button data-t="B">B. 升格</button></div>
    <div class="ev7-pane" id="ev7PaneA">
      ${ev7RenderFuyao()}
      <div class="ev7-sec">第一步 · 五维雷达评维<span class="sub">每维点 1-3 星（再点取消）</span></div>
      ${ev7RenderRadar()}
      <div class="ev7-sec" style="margin-top:14px">第二步 · 综合定档<span class="sub">打星满五维自动推算 · 也可手动点选对拍</span></div>
      ${ev7RenderBands()}
      <div class="ev7-sec" style="margin-top:14px">第三步 · 互评与自评</div>
      <div style="text-align:right;margin-bottom:8px"><button class="er-btn er-btn-sm" onclick="EssayReview._ev7AddCard()">➕ 加一张互评卡</button></div>
      ${ev7RenderCards()}
      <div class="ev7-card" style="border-left:3px solid var(--color-primary);margin-top:12px"><div class="ev7-sec" style="margin-top:0">📋 评价反馈</div>${ev7RenderFeedback()}</div>
    </div>
    <div class="ev7-pane" id="ev7PaneB" style="display:none">
      <div class="ev7-sec">第一步 · 问题自反馈<span class="sub">勾选做得不好的条目，选中的就是你要升格的方向</span></div>
      ${ev7RenderChecks()}
      <div class="ev7-b-summary"><span>🎯 我的改进点：</span><span class="pick" id="ev7PickShow">（勾选做得不好的条目）</span><button class="er-btn er-btn-sm" onclick="EssayReview._ev7ClearPick()">清除</button></div>
      <div class="ev7-sec" style="margin-top:14px">第二步 · 针对性升格</div>
      <div class="ev7-card">
        <div class="ev7-frow"><label>原文</label><textarea id="ev7Src" rows="2" placeholder="${esc(D.srcPH)}">${esc(g.ev7Src||"")}</textarea></div>
        <div class="ev7-frow"><label>升格方向</label><div class="ev7-dir-chips">${ev7RenderDirs()}</div></div>
        <div class="ev7-frow"><label>改文（自己写·亮点词用*号标出）</label><textarea id="ev7Up" rows="3" placeholder="${esc(D.upPH)}">${esc(g.ev7Up||"")}</textarea></div>
        <div class="ev7-compare"><div class="col before"><h5>✗ 原文</h5><p id="ev7CmpB">${esc(g.ev7Src||"（输入原文后自动对比）")}</p></div><div class="col after"><h5>➜ 改文</h5><p id="ev7CmpA">${esc(g.ev7Up||"（*号词自动高亮）").replace(/\*(.+?)\*/g,'<b style="color:var(--color-success)">★$1</b>')}</p></div></div>
        <div class="ev7-frow" style="margin-top:8px"><label>升格后读起来有什么不同？<span style="font-weight:normal;color:var(--text-tertiary)">（一句话，写进档案）</span></label><input type="text" id="ev7Why" placeholder="${esc(D.whyPH||"例：动作有链了，画面动起来了")}" value="${esc(g.ev7Why||"")}" style="width:100%;border:1px solid var(--border-color-light);border-radius:6px;padding:6px 10px;font-size:13px;color:var(--text-body)"></div>
        <div class="ev7-frow" style="background:var(--color-primary-bg-soft);border:1px solid var(--color-primary-border);border-radius:6px;padding:8px 12px;margin-top:6px"><label style="color:var(--color-primary-text-dark)">➕ 本次新增亮点（首稿没有的细节/句式/词块）<span style="font-weight:normal;color:var(--text-tertiary)">—— 二稿要"有增量"，专门表扬它</span></label><input type="text" id="ev7Plus" placeholder="${esc(D.plusPH||"例：加了 with sunlight streaming in 的环境描写")}" value="${esc(g.ev7Plus||"")}" style="width:100%;border:1px solid var(--color-primary-border);border-radius:6px;padding:6px 10px;font-size:13px;background:var(--bg-panel);color:var(--text-body)"></div>
        <div style="display:flex;gap:8px;margin-top:9px;flex-wrap:wrap;align-items:center"><input type="text" id="ev7Who" placeholder="你的名字" style="width:110px;font-size:12.5px;padding:5px 10px;border:1px solid var(--border-color);border-radius:6px;color:var(--text-body)"><button class="er-btn er-btn-sm" onclick="EssayReview._ev7AddLog()">📌 收进档案·送上升格墙</button></div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin:14px 0 4px;flex-wrap:wrap"><span class="ev7-sec" style="margin:0">修改记录 · 思维留痕</span><span style="font-size:12px;color:var(--color-primary-text-dark);font-weight:600;margin-left:auto">已留痕 ${(art().ev7Logs||[]).length} 处</span><span style="font-size:11.5px;color:var(--text-tertiary)">评价的不是"写了什么"，而是"改变了什么"</span></div>
      <div class="ev7-card" style="border-left:3px solid var(--color-primary)">${ev7RenderLog()}</div>
      <div class="ev7-sec" style="margin-top:14px">🧱 班级升格墙</div>
      <div class="ev7-wallgrid">${ev7RenderWall()}</div>
    </div>`;
  }
  /* htmlStep7Practical 已删除：应用文与续写统一走V3评价升格界面（数据双文体化） */
  /* ★⑧范文词数体检：剥标签→分段→词数统计，分段对照③凤15猪45豹20预算（编辑范文实时刷新）。
     分段归并：书信呼语（Dear...,短段）并入凤头、落款（Yours.../Li Hua短段）并入豹尾、多余中段归猪肚 */
  function essayStats(html) {
    const txt = String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ');
    const wc = s => (String(s).match(/[A-Za-z]+(?:'[a-z]+)?/g) || []).length;
    let paras = txt.split(/\n{2,}/).map(s => s.replace(/\s+/g, ' ').trim()).filter(s => /[A-Za-z]/.test(s));
    if (paras.length > 3 && wc(paras[0]) <= 5) { paras[1] = paras[0] + ' ' + paras[1]; paras.shift(); }
    while (paras.length > 3 && wc(paras[paras.length - 1]) <= 5) { const last = paras.pop(); paras[paras.length - 1] += ' ' + last; }
    while (paras.length > 3) { paras[2] = paras[1] + ' ' + paras[2]; paras.splice(1, 1); }
    const words = paras.reduce((t, p) => t + wc(p), 0);
    const sents = (txt.match(/[.!?](\s|$)/g) || []).length || 1;
    return { paras, words, paraWords: paras.map(wc), sents };
  }
  function wcBudgetTag(n, budget, label) {   // 词数与预算对照徽章：±40%内达标
    const ok = n >= budget * 0.6 && n <= budget * 1.4;
    return `<span class="er-budget" style="margin-left:6px;${ok ? '' : 'border-color:var(--color-warning);color:var(--color-warning)'}">${label}：${n} 词 · 预算约${budget}${ok ? ' ✓' : ' ⚠'}</span>`;
  }
  function htmlStep8() {
    const a8 = art();
    /* ★⑧双文体分栏的右栏：词数体检（应用文对照凤15猪45豹20 / 续写两段各约75）+ 五维评价
       （step8.eval 本篇点评优先；无则按文体取⑦五维维度说明兜底）。左栏范文由 renderContent 分栏渲染 */
    const isCon8 = (a8.type || 'continuation') === 'continuation';
    const st = essayStats(a8.step8.text);
    const paraLabels = isCon8 ? ['Para 1', 'Para 2'] : ['凤头 Para 1', '猪肚 Para 2', '豹尾 Para 3'];
    const budgets = isCon8 ? [75, 75] : [15, 45, 20];
    const paraRows = paraLabels.map((nm, i) => `<div class="er-wc-row">${st.paras[i] !== undefined ? wcBudgetTag(st.paraWords[i], budgets[i], nm) : `${nm}：<span class="er-muted">未识别</span>`}</div>`).join('');
    const D8 = ev7Sel(a8) || EV7_DATA.cont;   /* 按文体的⑦五维（dims含维度名+说明） */
    const evals = (Array.isArray(a8.step8.eval) && a8.step8.eval.length)
      ? a8.step8.eval.map((ev, i) => `<div class="er-evdim"><b style="color:var(--color-primary)">${esc(ev.dim)}</b><div class="er-editable en" data-path="step8.eval.${i}.comment" style="font-size:13px;line-height:1.8;margin-top:2px">${ev.comment}</div></div>`).join('')
      : D8.dims.map(d => `<div class="er-evdim"><b style="color:var(--color-primary)">${d.n}</b><div style="font-size:12.5px;line-height:1.7;margin-top:2px;color:var(--text-secondary)">${esc(d.h)}</div></div>`).join('');
    return `<h4 class="er-sec">词数体检${isCon8 ? ' · 续写150词两段各约75' : ' · 对照③凤15猪45豹20'}</h4>
      <div class="er-card" style="text-align:center;padding:14px">
        <div style="font-size:34px;font-weight:800;color:var(--color-primary-text-dark);line-height:1.2"><span id="erWcTotal">${st.words}</span><span style="font-size:14px;font-weight:600;color:var(--text-tertiary)"> 词</span></div>
        <div style="font-size:12.5px;color:var(--text-secondary);margin-top:2px">句子 ${st.sents} 句 ｜ 平均句长 ${st.sents ? Math.round(st.words / st.sents) : 0} 词</div>
        <div style="text-align:left;margin-top:10px;border-top:1px dashed var(--border-color-lighter);padding-top:8px">${paraRows}</div>
      </div>
      <h4 class="er-sec" style="margin-top:14px">五维评价 · 这篇范文好在哪</h4>
      <div class="er-card">${evals}</div>`;
  }
  const STEP_RENDER = [htmlStep1, htmlStep2, htmlStep3, htmlStep4, htmlStep5, htmlStep6, htmlStep7, htmlStep8];

  /* ================= 渲染骨架 ================= */
  function renderSidebar() {
    const list = document.getElementById('erList'); list.innerHTML = '';
    GROUPS.forEach(g => {
      const arts = DB.articles.map((a, i) => ({ a, i })).filter(x => (x.a.type || 'continuation') === g.key);
      const grp = document.createElement('div');
      grp.className = 'er-group' + (groupsOpen[g.key] ? '' : ' closed');
      grp.innerHTML = `
        <button class="er-group-head" onclick="EssayReview._toggleGroup('${g.key}')">
          <span>${g.name}</span>
          <span class="er-sideinfo"><span class="er-count">${arts.length}</span><span class="er-caret">▾</span></span>
        </button>
        <div class="er-group-body" id="erGrp-${g.key}"></div>`;
      const body = grp.querySelector('.er-group-body');
      if (!arts.length) {
        body.innerHTML = '<div class="er-empty">暂无篇目<br>用「📋 复制为模板」或「⬆️ 导入篇目」添加</div>';
      } else {
        arts.forEach(({ a, i }) => {
          const b = document.createElement('button');
          b.className = 'er-item' + (art() && art().id === a.id ? ' on' : '');
          const sub = [a.hw, a.source].filter(Boolean).join(' · ');
          b.innerHTML = esc(a.title) + `<span class="src">${esc(sub)}</span>`;
          b.onclick = () => {
            try { collectEdits(); } catch (e) { console.warn('er: collectEdits', e); }
            curArtId = a.id; curStep = 0;
            renderAll(); collapse(true);
          };
          body.appendChild(b);
        });
      }
      list.appendChild(grp);
    });
  }
  function renderSteps() {
    const bar = document.getElementById('erSteps'); bar.innerHTML = '';
    let names = stepNames(art());
    if (!Array.isArray(names) || !names.length) names = DEFAULT_STEP_NAMES;   // 兜底：步骤栏绝不空白
    names.forEach((n, i) => {
      const b = document.createElement('button'); b.textContent = n; b.className = i === curStep ? 'on' : '';
      b.onclick = () => { collectEdits(); curStep = i; renderContent(); };
      bar.appendChild(b);
    });
  }
  /* 分栏宽度夹取：25%~70% 且右栏保底 320px；宽度按缩放反向补偿——
     记忆值与测量值均为"视觉像素"，任何字号下左右比例不变 */
  function applySplitClamp() {
    const srcEl = document.querySelector('.er-src'), splitEl = document.querySelector('.er-split');
    if (!srcEl || !splitEl) return;
    const totalVisual = splitEl.getBoundingClientRect().width;   // 视觉宽（含 zoom）
    if (totalVisual <= 0) return;
    let w = (DB.ui && isFinite(DB.ui.split)) ? DB.ui.split : totalVisual * 0.42;
    const maxW = Math.min(totalVisual * 0.7, totalVisual - 320);
    w = Math.max(totalVisual * 0.25, Math.min(maxW, w));
    const z = uiZoom || 1;
    srcEl.style.flex = 'none';
    srcEl.style.width = (w / z) + 'px';   // 布局宽 = 视觉宽 ÷ 缩放
    if (DB.ui && isFinite(DB.ui.split)) DB.ui.split = Math.round(w);
  }
  function renderContent() {
    const c = document.getElementById('erBody'); c.innerHTML = '';
    /* 空库引导态：无任何篇目时不渲染评讲步骤 */
    if (!DB.articles.length) {
      c.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;gap:14px;text-align:center">
        <div style="font-size:17px;font-weight:600;color:var(--text-primary)">📝 作文评讲 · 暂无篇目</div>
        <div style="color:var(--text-secondary);font-size:13.5px;line-height:2">
          三种方式开始：<br>
          ① 侧栏「📋 一键粘贴」——粘贴原文+段首句自动识别<br>
          ② 侧栏「⬆️ 导入篇目」——读取 AI 生成的评讲 JSON（essay-generate 技能）<br>
          ③ 导入试卷 PDF——读后续写语篇自动建篇
        </div>
      </div>`;
      return;
    }
    /* ★应用文③④结构先行序（2026-10-06用户定）：③位渲染谋篇布局(step4数据)、④位渲染转化要点(step3数据)；
       续写保持原渲染顺序，零改动 */
    const renderMap = (art().type === 'practical')
      ? [htmlStep1, htmlStep2, htmlStep4, htmlStep3, htmlStep5, htmlStep6, htmlStep7, htmlStep8]
      : STEP_RENDER;
    const paneHtml = renderMap[curStep]();
    if (curStep <= 4) {
      /* 步骤①-④：左原文 / 右步骤内容，分隔线可拖拽并记忆宽度 */
      const savedW = (DB.ui && isFinite(DB.ui.split)) ? ` style="flex-basis:${DB.ui.split}px"` : '';
      c.innerHTML = `<div class="er-split">
        <div class="er-src er-editable" data-path="story"${savedW}>${srcHtml()}</div>
        <div class="er-divider" title="拖动调整左右宽度"></div>
        <div class="er-stepcol"><div class="er-pane on">${paneHtml}</div></div>
      </div>`;
      /* 渲染期防线 + 显示后补刀（隐藏时 clientWidth=0） */
      applySplitClamp();
      requestAnimationFrame(() => { applySplitClamp(); fitAnswerSheet(); });
    } else if (curStep === 6) {
      /* ★步骤⑦双文体：左=学生作文（V3双分区：①原卷扫描②文字识别） 右=评价升格（续写/应用文各自五维） */
      const s7 = art().step7;
      const ev7Editing = !!art().ev7Editing;
      const hasImgs = (s7.images||[]).length > 0;
      const hasTxt = (s7.text||'').replace(/<[^>]+>/g,'').trim().length > 0;
      c.innerHTML = `<div class="er-split">
        <div class="er-src" style="display:flex;flex-direction:column;padding:8px;gap:8px;background:var(--bg-subtle);border-right:1px solid var(--border-color-light)">
          <input type="file" id="ev7ImgInput" accept="image/*" multiple hidden>
          <!-- ① 原卷扫描 -->
          <div style="flex:1;display:flex;flex-direction:column;min-height:0">
            <div style="display:flex;align-items:center;gap:6px;padding:0 2px 5px;font-size:13px;font-weight:700;color:var(--text-body)">
              <span>① 原卷扫描</span>
              <button class="er-btn er-btn-sm" style="margin-left:auto" onclick="document.getElementById('ev7ImgInput').click()">🖼 导入图片</button>
            </div>
            <div style="flex:1;min-height:120px;overflow-y:auto;background:var(--bg-panel);border:1px solid var(--border-color-light);border-radius:8px;padding:8px">
              ${hasImgs ? s7.images.map((d,i)=>`<div style="margin-bottom:6px;position:relative"><img src="${d}" style="width:100%;border-radius:4px;display:block"><button style="position:absolute;top:4px;right:4px;width:22px;height:22px;border:none;border-radius:50%;background:rgba(0,0,0,.5);color:#fff;font-size:11px;cursor:pointer" onclick="EssayReview._ev7DelImg(${i})">✕</button></div>`).join('') : '<div style="text-align:center;color:var(--text-tertiary);font-size:12px;padding:30px 10px;border:1.5px dashed var(--border-color-lighter);border-radius:6px">学生原卷扫描件显示在这里<br>点右上「🖼 导入图片」（可多选）</div>'}
            </div>
          </div>
          <!-- ② 文字识别 -->
          <div style="flex:1;display:flex;flex-direction:column;min-height:0">
            <div style="display:flex;align-items:center;gap:6px;padding:0 2px 5px;font-size:13px;font-weight:700;color:var(--text-body)">
              <span>② 文字识别</span>
              <button class="er-btn er-btn-sm" style="margin-left:auto" onclick="EssayReview._ev7OCR()" title="从上方图片OCR识别">🔤 识别文字</button>
            </div>
            <div style="flex:1;min-height:120px;overflow-y:auto;background:var(--bg-panel);border:1px solid var(--border-color-light);border-radius:8px;padding:10px 14px;line-height:1.9;font-family:Georgia,'Times New Roman',serif;white-space:pre-wrap;color:var(--text-body);${ev7Editing?'outline:none;':'user-select:none;cursor:default;'}" id="ev7EssayText" contenteditable="${ev7Editing?'true':'false'}">${s7.text||''}</div>
            <div style="padding:6px 2px 0;display:flex;gap:6px;justify-content:center;align-items:center">
              <button class="er-btn er-btn-sm" onclick="EssayReview._importText('step7.text')" title="粘贴或导入文本文件">📥 导入文本</button>
              <button class="er-btn er-btn-sm" id="ev7EditBtn" onclick="EssayReview._ev7ToggleEdit()" title="切换编辑模式">${ev7Editing?'✅ 完成':'✏️ 编辑'}</button>
              <button class="er-btn er-btn-sm" onclick="EssayReview._ev7SaveText()" title="保存到本浏览器">💾 保存</button>
            </div>
          </div>
        </div>
        <div class="er-divider" title="拖动调整左右宽度"></div>
        <div class="er-stepcol"><div class="er-pane on">${paneHtml}</div></div>
      </div>`;
      /* 文本区实时保存 */
      const et = document.getElementById('ev7EssayText');
      if (et) et.addEventListener('input', () => { if(!art().ev7Editing)return; art().step7.text = et.innerText; clearTimeout(et._tm); et._tm = setTimeout(() => persist(), 500); });
      applySplitClamp();
      requestAnimationFrame(applySplitClamp);
    } else if (curStep === 7) {
      /* ★⑧双文体：左=参考范文（可编辑） 右=词数体检（应用文凤15猪45豹20 / 续写两段各约75）+五维评价；分割线可拖 */
      const s8 = art().step8;
      c.innerHTML = `<div class="er-split">
        <div class="er-src er-editable en" data-path="step8.text" style="line-height:1.9">${s8.text}</div>
        <div class="er-divider" title="拖动调整左右宽度"></div>
        <div class="er-stepcol"><div class="er-pane on">${paneHtml}</div></div>
      </div>`;
      applySplitClamp();
      requestAnimationFrame(applySplitClamp);
      /* 范文编辑 → 右栏词数体检实时刷新（不重渲染防丢焦点） */
      const src8 = c.querySelector('.er-src');
      if (src8) src8.addEventListener('input', () => {
        const st = essayStats(src8.innerHTML);
        const t = document.getElementById('erWcTotal');
        if (t) t.textContent = st.words;
      });
    } else {
      /* 步骤⑤⑥⑧（⑦已走V3分栏）：全宽居中 */
      c.innerHTML = `<div class="er-pane on">${paneHtml}</div>`;
    }
    const inpF = document.getElementById('erPairFile');
    if (inpF) inpF.onchange = function () { pairFileChosen(this); };
    const inp = document.getElementById('erImgInput');
    if (inp) inp.onchange = function () { addImages(this); };
    /* ★步骤⑦评价升格：绑定V3交互（仅续写渲染时存在） */
    if (typeof ev7BindAll === 'function' && document.querySelector('.ev7-tabs')) {
      ev7BindAll();
      if (typeof ev7RenderPickSummary === 'function') ev7RenderPickSummary();
    }
    /* ★步骤⑦图片上传：复用已有addImages（已验证可工作） */
    const ev7Img = document.getElementById('ev7ImgInput');
    if (ev7Img) {
      ev7Img.addEventListener('change', function() { addImages(this); });
    }
    /* ★编辑态跨步骤/切篇保持：重渲染后 contenteditable 属性丢失——
       editing=true 时恢复全部 er-editable（含左栏题干）可编辑性，
       否则按钮显示"编辑中"但内容点不动（题干微调失灵的根因） */
    if (editing) document.querySelectorAll('#erApp .er-editable').forEach(el => el.setAttribute('contenteditable', 'true'));
    renderSteps();
    const nm = document.getElementById('erName');
    if (nm) nm.textContent = art().title;
  }
  function renderAll() { renderSidebar(); renderContent(); }

  /* ================= 字体缩放（仿 Review 页：➖ 百分比 ➕ 🔒 ♺） ================= */
  const ZOOM_MIN = 0.8, ZOOM_MAX = 3.0;   // 课堂投影：最大 300%
  let uiZoom = 1.0, zoomLocked = false, defaultZoom = null;

  function applyZoom() {
    /* 只缩放正文讲评区；顶部标题、操作按钮、步骤导航栏保持原大小 */
    const body = document.getElementById('erBody');
    if (body) {
      body.style.zoom = uiZoom;
      /* 行宽自适应：视觉宽度恒定约 1400px，放大字号时行不拉长，两侧自动留白 */
      body.style.setProperty('--er-pane-w', Math.round(1400 / uiZoom) + 'px');
    }
    applySplitClamp();   // 缩放变化后重新补偿分栏宽度，保持左右比例
    const lbl = document.getElementById('erZoomLevel');
    if (lbl) lbl.textContent = Math.round(uiZoom * 100) + '%';
    const lock = document.getElementById('erZoomLock');
    if (lock) {
      lock.textContent = '🔒 ' + Math.round((defaultZoom || 1) * 100) + '%';
      lock.classList.toggle('locked', zoomLocked);
    }
  }
  function saveZoom() {
    DB.ui = DB.ui || {};
    DB.ui.zoom = uiZoom; DB.ui.locked = zoomLocked; DB.ui.default = defaultZoom;
    persist();
  }
  function zoomStep(delta) {
    if (zoomLocked) { toast('🔒 缩放已锁定——点 🔒 解锁后再调节'); return; }
    const nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(uiZoom + delta).toFixed(2)));
    if (nz === uiZoom) { toast(delta > 0 ? '已是最大 (300%)' : '已是最小 (80%)'); return; }
    uiZoom = nz; applyZoom(); saveZoom();
  }
  function resetZoom() {
    if (zoomLocked) { toast('🔒 缩放已锁定——点 🔒 解锁后再调节'); return; }
    uiZoom = defaultZoom || 1.0; applyZoom(); saveZoom();
  }
  function lockZoom() {
    zoomLocked = !zoomLocked;
    defaultZoom = zoomLocked ? uiZoom : null;   // 锁定 = 记住当前为默认值
    applyZoom(); saveZoom();
  }

  /* ================= 编辑 / 保存 ================= */
  function getByPath(o, p) { return p.split('.').reduce((x, k) => x && x[/^\d+$/.test(k) ? +k : k], o); }
  function setByPath(o, p, v) { const ks = p.split('.'), last = ks.pop(); const t = ks.reduce((x, k) => x[/^\d+$/.test(k) ? +k : k], o); t[/^\d+$/.test(last) ? +last : last] = v; }
  function collectEdits() {
    document.querySelectorAll('#erApp .er-editable[data-path]').forEach(el => {
      const p = el.dataset.path;
      if (p === 'story') {
        /* 段号剥离仅限续写（er-pnum徽章）；应用文题干的"1. 要点"列表是内容本体，严禁剥数字前缀 */
        const isPrac = (art().type === 'practical');
        const ps = [...el.querySelectorAll('.er-storyp')].map(x => isPrac ? x.textContent.trim() : x.textContent.replace(/^\s*\d+\.\s*/, '').trim());
        if (ps.length) art().story = ps;
      } else if (p === 'step4.p1.plots') { art().step4.p1.plots = [...el.children].map(x => x.innerHTML); }
      else if (p === 'step4.p2.plots') { art().step4.p2.plots = [...el.children].map(x => x.innerHTML); }
      else {
        /* 只有字符串叶子可回写；对象/数组槽位禁止整卡覆写（防 HTML 字符串污染数据结构） */
        const o = getByPath(art(), p);
        if (typeof o === 'string' || o === undefined) setByPath(art(), p, el.innerHTML);
      }
    });
  }
  function setEdit(on) {
    collectEdits();
    editing = on;
    const app = document.getElementById('erApp');
    app.classList.toggle('editmode', on);
    app.querySelectorAll('.er-editable').forEach(el => el.setAttribute('contenteditable', on ? 'true' : 'false'));
    const b = document.getElementById('erEditBtn');
    b.classList.toggle('editing', on);
    b.textContent = on ? '✏️ 编辑中…（点击退出）' : '✏️ 编辑';
  }
  function collapse(on) { document.getElementById('erApp').classList.toggle('collapsed', on); }

  /* 分栏分隔线拖拽：仿 AFR setupMmSplitter——位置式（宽度=鼠标位置，非增量），
     数学上不存在跳变；事件委托挂在 document，重渲染不需要重绑 */
  let erSplitting = false;
  function setupErSplitter() {
    document.addEventListener('mousedown', e => {
      const divider = e.target.closest && e.target.closest('.er-divider');
      if (!divider || document.getElementById('essayView').classList.contains('hidden')) return;
      erSplitting = true;
      divider.classList.add('dragging');
      document.body.classList.add('er-splitting');
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!erSplitting) return;
      const src = document.querySelector('.er-src'), split = document.querySelector('.er-split');
      if (!src || !split) return;
      const rect = split.getBoundingClientRect();
      let w = e.clientX - rect.left;   // 视觉像素（rect 已含 zoom）
      const maxW = Math.min(rect.width * 0.7, rect.width - 320);   // 右栏保底
      w = Math.max(rect.width * 0.25, Math.min(maxW, w));
      const z = uiZoom || 1;
      src.style.flex = 'none';
      src.style.width = (w / z) + 'px';   // 反向补偿：缩放下比例不变
    });
    document.addEventListener('mouseup', () => {
      if (!erSplitting) return;
      erSplitting = false;
      document.querySelectorAll('.er-divider.dragging').forEach(d => d.classList.remove('dragging'));
      document.body.classList.remove('er-splitting');
      const src = document.querySelector('.er-src');
      if (src) {
        DB.ui = DB.ui || {};
        DB.ui.split = Math.round(src.getBoundingClientRect().width);   // 存视觉像素
        persist();
      }
      fitAnswerSheet();   // ★拖完分隔线重算横线铺放
    });
    window.addEventListener('resize', () => fitAnswerSheet());   // 窗口变化重算
    /* ★②辨析选项点击（委托挂document，重渲染不丢绑）：点亮/收起 why，✓绿✗红 */
    document.addEventListener('click', e => {
      const opt = e.target.closest && e.target.closest('.er-opt2');
      if (!opt) return;
      opt.classList.toggle('on');
    });
  }

  /* ================= 导入导出 ================= */
  let modalTarget = null;
  function importText(path) {
    modalTarget = path;
    document.getElementById('erModalText').value = '';
    document.getElementById('erModal').classList.add('on');
  }
  function modalOk() {
    const txt = document.getElementById('erModalText').value;
    if (!txt.trim()) return;
    collectEdits();
    setByPath(art(), modalTarget, '<p class="en" style="white-space:pre-wrap">' + esc(txt) + '</p>');
    document.getElementById('erModal').classList.remove('on');
    renderContent(); persist(); toast('导入成功（原内容已替换）');
  }
  function addImages(input) {
    [...input.files].forEach(f => {
      const r = new FileReader();
      r.onload = () => { art().step7.images.push(r.result); persist(); renderContent(); };
      r.readAsDataURL(f);
    });
  }
  /* ★步骤⑦图片压缩（防localStorage爆仓） */
  function compressDataURL(url, cb) {
    const im = new Image();
    im.onload = () => {
      const MAX = 1100, sc = Math.min(1, MAX / im.width);
      const cv = document.createElement('canvas');
      cv.width = Math.round(im.width * sc); cv.height = Math.round(im.height * sc);
      cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
      cb(cv.toDataURL('image/jpeg', 0.82));
    };
    im.onerror = () => cb(url);
    im.src = url;
  }
  function exportJSON() {
    collectEdits(); persist();
    const blob = new Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = '作文评讲-数据导出.json'; a.click();
  }
  /* 单篇导出：只导当前篇目（essay-import.json格式，任何「导入」入口都能追加导入） */
  function exportSingle() {
    collectEdits(); persist();
    const a0 = art();
    if (!a0) { toast('没有当前篇目'); return; }
    const safe = a0.title.replace(/[\\/:*?"<>|]/g, '_');
    const blob = new Blob([JSON.stringify(a0, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = '作文评讲-' + safe + '.json'; a.click();
    toast('已导出当前篇目「' + a0.title + '」');
  }
  /* 导入JSON：整库替换（合并版/独立版互通）。选择文件→校验articles数组→写localStorage→热重载
     单篇格式（有title无articles）自动转成追加导入，不替换整库 */
  function importJSON(input) {
    const f = input.files && input.files[0];
    if (!f) return;
    const r0 = new FileReader();
    r0.onload = () => {
      let single = null;
      try { const pre = JSON.parse(r0.result); if (pre && pre.title && !pre.articles) single = pre; } catch (e) {}
      const isSingle = !!single;
      if (!isSingle && !confirm('导入将【整体替换】当前浏览器里的作文评讲数据（当前未保存的编辑会丢失）。继续？')) { input.value = ''; return; }
      if (isSingle) doImportSingle(single, input);
      else doImportWhole(r0.result, input);
    };
    r0.readAsText(f, 'utf-8');
  }
  function doImportWhole(text, input) {
    try {
      const d = JSON.parse(text);
      if (!d || typeof d !== 'object' || !Array.isArray(d.articles)) throw new Error('格式不对：缺少 articles 数组');
      DB = d;
      curArtId = DB.articles[0] && DB.articles[0].id;
      persist();
      renderAll();
      toast('导入成功：' + DB.articles.length + ' 篇（' + ER_VERSION + '）');
      } catch (e) {
        alert('导入失败：' + e.message);
      }
      input.value = '';
  }
  /* 单篇追加导入（不替换整库；与「导入篇目」同逻辑） */
  function doImportSingle(single, input) {
    collectEdits();
    const norm = normalizeArticle(single);
    const exist = DB.articles.findIndex(x => x.id === norm.id);
    if (exist >= 0) {
      if (!confirm(`「${norm.title}」已存在，覆盖更新？`)) { input.value = ''; return; }
      DB.articles[exist] = norm;
    } else {
      DB.articles.push(norm);
    }
    curArtId = norm.id;
    ensureTypes(DB);
    persist(); renderAll();
    input.value = '';
    toast('已追加导入「' + norm.title + '」（单篇格式）');
  }
  /* 合并JSON路由入口：「考试名称-合并.json」经 ⚙→🤖 导入时由主逻辑调用。
     静默追加不弹确认；接受单篇格式（有title）或 {articles:[...]}；按 id 去重，已存在则覆盖更新 */
  function importMerged(payload) {
    init();   /* 合并导入可能先于任何一次打开 Composition——确保 DB 已加载、骨架已就绪（幂等） */
    const list = Array.isArray(payload && payload.articles) ? payload.articles
               : (payload && payload.title) ? [payload] : [];
    if (!list.length) return { ok: false, msg: '未识别到篇目（需 title 单篇格式或 articles 数组）' };
    collectEdits();
    let added = 0, updated = 0;
    list.forEach(a => {
      if (!a || !a.title) return;
      const norm = normalizeArticle(a);
      const i = DB.articles.findIndex(x => x.id === norm.id);
      if (i >= 0) { DB.articles[i] = norm; updated++; }
      else { DB.articles.push(norm); added++; }
    });
    if (!added && !updated) return { ok: false, msg: '篇目数据为空' };
    if (!DB.articles.some(x => x.id === curArtId)) curArtId = DB.articles[0].id;
    ensureTypes(DB);
    persist(); renderAll();
    return { ok: true, msg: '追加 ' + added + ' 篇' + (updated ? '、更新 ' + updated + ' 篇' : '') };
  }
  function addFromTpl() {
    collectEdits();
    // 新建自带完整框架：按目标文体取种子框架（续写→Jake / 应用文→English Party），步骤结构/表格/指南/自查单全保留
    const tplType = (art().type === 'practical') ? 'practical' : 'continuation';
    const t = JSON.parse(JSON.stringify(tplType === 'practical' ? seedEnglishParty() : seedJake()));
    t.id = 'art-' + Date.now();
    t.title = '新篇目（待命名）';
    t.source = '框架新建';
    t.hw = curHwName() || t.hw || '';   // 随当前练习走
    // 只清内容性字段——框架结构原样保留
    t.story = ['（粘贴续写原文……）'];
    t.openers = (tplType === 'practical') ? [] : ['（段首句待填）', '（段首句待填）'];   /* 应用文题干侧不显示段首句/三段规划 */
    t.step7 = { text: '<p class="er-muted">导入学生作文，全班一起评价并提出改进意见。<br>点击下方按钮导入文字或图片。</p>', images: [] };
    t.step8 = { text: '<p class="er-muted">（范文待填）</p>' };
    DB.articles.push(t); curArtId = t.id;
    persist(); renderAll(); toast('已新建' + (tplType === 'practical' ? '应用文' : '续写') + '篇目（框架已就位），点✏️编辑修改');
  }
  function delArt() {
    if (!DB.articles.length) { toast('库已为空'); return; }
    if (confirm('确定删除当前篇目「' + art().title + '」？')) {
      DB.articles = DB.articles.filter(x => x.id !== art().id);
      curArtId = DB.articles[0] ? DB.articles[0].id : null;
      persist(); renderAll();
    }
  }
  /* 一键导入最新篇目：抓取 incoming/pending.json（我处理试卷后写到该位置） */
  function importPending() {
    fetch('incoming/pending.json', { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d => {
        const arts = d.articles || (d.title ? [d] : null);
        if (!arts) { toast('pending.json 里没有篇目数据'); return; }
        let added = 0;
        arts.forEach(a => {
          if (!a || !a.title) return;
          const norm = normalizeArticle(a);
          const exist = DB.articles.findIndex(x => x.id === norm.id);
          if (exist >= 0) {
            if (confirm(`「${norm.title}」已存在，覆盖更新？`)) { DB.articles[exist] = norm; added++; }
          } else { DB.articles.push(norm); added++; }
        });
        if (!added) { toast('没有新增篇目'); return; }
        curArtId = arts[0].id;
        persist(); renderAll();
        toast(`已导入 ${added} 篇（来自 pending.json）`);
      })
      .catch(e => toast('读取 pending.json 失败：' + e.message + '（需经服务器 localhost:8766 打开）'));
  }

  /* ================= 导入Word（docx）→ 自动建篇目 =================
     解析 word/document.xml（WPS优先读 word/htmlDocument.html），
     段落→story数组；识别"段首句/续写提示"行填openers；自动新建篇目 */
  function importWordDoc() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.docx';
    inp.onchange = () => {
      const f = inp.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = async () => {
        try {
          toast('解析中…');
          // 加载JSZip（优先本地libs，回退CDN——file://协议下CDN可能失败则提示）
          if (typeof JSZip === 'undefined') {
            await new Promise((res, rej) => {
              const s = document.createElement('script');
              s.src = 'libs/jszip.min.js';
              s.onload = res; s.onerror = rej;
              document.head.appendChild(s);
            }).catch(async () => {
              await new Promise((res, rej) => {
                const s = document.createElement('script');
                s.src = 'https://cdn.jsdelivr.net/npm/jszip@3/dist/jszip.min.js';
                s.onload = res; s.onerror = rej;
                document.head.appendChild(s);
              });
            });
          }
          const zip = await JSZip.loadAsync(r.result);
          // 优先WPS的html版，否则document.xml
          let html = null;
          const hf = zip.file('word/htmlDocument.html');
          if (hf) html = await hf.async('string');
          if (!html) {
            const xf = zip.file('word/document.xml');
            if (!xf) throw new Error('无法读取文档内容');
            const xml = await xf.async('string');
            // w:p=段落，w:t=文本，w:br换行
            html = xml.replace(/<w:p[ >]/g, '<p>').replace(/<\/w:p>/g, '</p>')
                      .replace(/<w:br[^>]*\/>/g, '<br>')
                      .replace(/<\/w:t>/g, '</w:t>');
          }
          // 提取纯文本段落（剥标签+实体解码+空白收敛，防w:p属性残留混入文本）
          const paras = [];
          const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
          let m;
          while ((m = pRe.exec(html)) !== null) {
            const t = m[1].replace(/<[^>]+>/g, '')
                          .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                          .replace(/\s+/g, ' ').trim();
            if (t) paras.push(t);
          }
          if (!paras.length) throw new Error('未提取到文本段落');
          // 识别段首句/续写句（"Para 1：xxx"或"续写段首句"后的两行）
          const openerIdx = paras.findIndex(p => /^续写段首句/.test(p));
          let openers = paras.filter(p => /^(para\s*\d|paragraph\s*\d)[:：]/i.test(p) && p.length < 250).slice(0, 2);
          if (!openers.length && openerIdx >= 0) {
            openers = paras.slice(openerIdx + 1, openerIdx + 3).filter(p => p.length > 5 && p.length < 300);
          }
          const openerTexts = openers.length === 2 ? openers.map(o => o.replace(/^(para\s*\d+|paragraph\s*\d+)[:：]?\s*/i, '')) : null;
          // story：若有段首句，去掉"续写段首句："标记行和段首句行，取其前的正文
          let storyParas = paras;
          if (openerTexts) {
            const firstOp = paras.indexOf(openers[0]);
            if (firstOp > 0) {
              let cut = firstOp;
              if (openerIdx >= 0 && openerIdx === firstOp - 1) cut = openerIdx;   // 连标记行一起去掉
              storyParas = paras.slice(0, cut);
            }
          }
          // 建篇目（模板框架+填入文本）
          const t = JSON.parse(JSON.stringify(seedJake()));
          t.id = 'art-' + Date.now();
          t.title = f.name.replace(/\.docx$/i, '');
          t.source = 'Word导入';
          t.story = storyParas;
          if (openerTexts) t.openers = openerTexts;
          else t.openers = ['（段首句待填）', '（段首句待填）'];
          t.step7 = { text: "<p class='er-muted'>导入学生作文，全班一起评价并提出改进意见。<br>点击下方按钮导入文字或图片。</p>", images: [] };
          t.step8 = { text: "<p class='er-muted'>（范文待填）</p>" };
          DB.articles.push(t); curArtId = t.id;
          persist(); renderAll();
          toast(`已从Word导入「${t.title}」：${storyParas.length}段${openerTexts ? '，段首句已识别' : ''}。八步内容可继续编辑或发给AI生成`);
        } catch (e) {
          alert('Word导入失败：' + e.message);
        }
      };
      r.readAsArrayBuffer(f);
    };
    inp.click();
  }

  /* ================= 一键粘贴+自动识别 =================
     整篇粘贴（原文+段首句+参考范文可混排），自动拆分：
     - "Para 1：/Para 2："行（或"续写段首句"标记后两行）→ openers
     - "范文/参考范文/参考答案"标记后的内容 → step8
     - 其余 → story（自动分段） */
  function pasteAndParse() {
    // 弹大文本框
    const ov = document.createElement('div');
    ov.id = 'erPasteModal';
    ov.style.cssText = 'position:fixed;inset:0;background:var(--bg-overlay,rgba(0,0,0,.45));z-index:3000;display:flex;align-items:center;justify-content:center';
    ov.innerHTML = `<div style="background:var(--bg-panel,#fff);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.2);padding:18px;width:min(720px,92vw)">
      <h4 style="color:var(--text-primary);margin:0 0 6px">📋 粘贴全文，自动识别</h4>
      <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:8px">
        把 <b>原文 + 两个段首句 + 参考范文</b> 一次性粘贴进来（顺序随意），点「自动识别」拆分填充。<br>
        识别规则：含 "Para 1：/Para 2：" 的行→段首句；"范文/参考范文"标记后的内容→共赏佳作；其余→原文。
      </div>
      <textarea id="erPasteText" placeholder="在此粘贴全文……（原文、段首句、范文一起）"
        style="width:100%;height:320px;box-sizing:border-box;padding:10px;border:1px solid var(--border-color,#ccc);border-radius:6px;font-size:13px;line-height:1.7;resize:vertical;font-family:inherit;background:var(--bg-subtle,#fafafa);color:var(--text-primary,#222)"></textarea>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
        <label style="font-size:12px;color:var(--text-tertiary);display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="checkbox" id="erPasteNew" checked> 新建篇目（不勾=填充到当前篇目）
        </label>
        <div>
          <button class="er-btn" onclick="EssayReview._autoParse()">✨ 自动识别</button>
          <button class="er-btn" onclick="document.getElementById('erPasteModal').remove()">取消</button>
        </div>
      </div>
    </div>`;
    document.body.appendChild(ov);
    document.getElementById('erPasteText').focus();
  }

  /* 续写文本解析核心（autoParse 与试卷联动 ingestFromExam 共用） */
  function parseContCore(txt) {
    const lines = txt.replace(/\r\n?/g, '\n').split('\n').map(l => l.trim());
    const paras = lines.filter(l => l);
    // ①段首句：形如 "Para 1：xxx" / "Para 1: xxx" / "Paragraph 1：xxx"
    const openerRe = /^(para\s*(1|2|one|two)|paragraph\s*(1|2))\s*[:：.、]?\s*(.{5,})$/i;
    let openers = [];
    const openerLineIdx = [];
    paras.forEach((p, i) => {
      const m = p.match(openerRe);
      if (m && !openers[0]) { openers[0] = m[4].trim(); openerLineIdx.push(i); }
      else if (m && openers[0] && !openers[1]) { openers[1] = m[4].trim(); openerLineIdx.push(i); }
    });
    // "续写段首句："标记行后的两行兜底
    if (openers.filter(Boolean).length < 2) {
      const mk = paras.findIndex(p => /^续写段首句|^段首句/.test(p));
      if (mk >= 0) {
        const cand = paras.slice(mk + 1, mk + 3).filter(p => p.length > 5 && p.length < 400);
        if (!openers[0]) openers[0] = cand[0];
        if (!openers[1]) openers[1] = cand[1];
        if (cand.length) openerLineIdx.push(mk, mk + 1, mk + 2);
      }
    }
    // ②范文："范文/参考范文/参考答案/参考续写" 标记行 → 其后全部
    const sampleRe = /^(参考)?(范文|续写范文|参考续写|下水文| sample (writing|essay))\s*[:：]?\s*$/i;
    const sampleRe2 = /^(参考范文|范文|参考答案|参考续写)[:：]/;
    let sampleIdx = -1, sampleInline = null;
    paras.forEach((p, i) => {
      if (sampleIdx < 0 && (sampleRe.test(p) || sampleRe2.test(p))) {
        sampleIdx = i;
        const inline = p.replace(sampleRe2, '').trim();
        if (inline.length > 20) sampleInline = inline;
      }
    });
    // ③story：去掉段首句行/标记行/范文区，其余全部；卷头噪声行剔除
    const skipIdx = new Set(openerLineIdx);
    if (sampleIdx >= 0) for (let i = sampleIdx; i < paras.length; i++) skipIdx.add(i);
    const noiseRe = /^(命制|审核|\d{4}届|.*备课组|.*专项[（(].*[）)])\s*[:：]?/;
    const markerRe = /^(续写段首句|段首句|原题呈现|【原题呈现】|原文呈现)\s*[:：]?【?】?$/;
    const story = paras.filter((p, i) => !skipIdx.has(i) && !noiseRe.test(p) && !markerRe.test(p) && !(sampleIdx >= 0 && i >= sampleIdx));
    let sampleText = sampleInline;
    if (!sampleText && sampleIdx >= 0) sampleText = paras.slice(sampleIdx + 1).join('<br><br>');
    return { paras, openers, story, sampleText };
  }

  /* 试卷联动入口：PDF识别的续写语篇 → 自动新建Composition篇目（去重） */
  function ingestFromExam(rawText, sourceName) {
    if (!DB || !Array.isArray(DB.articles)) load();
    const src = String(sourceName || '试卷');
    if (DB.articles.some(a => a && a.type === 'continuation' && a.source === src && a.title.indexOf('读后续写') === 0)) return { dupe: true };
    /* 预清洗：①剔除卷面指令/注意行 ②纯答题下划线行删除 ③答题卡式段首句（"As he... mist.____"）标准化为 "Paragraph N:" 格式 */
    let openerSeq = 0;
    const cleanedLines = [];
    String(rawText || '').split(/\r\n?|\n/).forEach(raw0 => {
      let l = raw0.trim();
      if (!l) return;
      if (/^(读后续写|阅读下面材料|根据其内容|所给段落开头语|注意[：:])/.test(l)) return;
      if (/^[（(]?\s*[12]\s*[）)]?\s*[.、]\s*(续写词数|所续写|段落|续写完成后|请用|请按)/.test(l)) return;
      const om = l.match(/^([A-Z][\s\S]{8,}?[.!?])\s*[_＿]{2,}/);   // 段首句+答题线 → 提取句
      if (om) { openerSeq++; cleanedLines.push('Paragraph ' + openerSeq + ': ' + om[1].trim()); return; }
      if (/^[_＿]{3,}$/.test(l)) return;                              // 纯答题线行删除
      cleanedLines.push(l);
    });
    const cleaned = cleanedLines.join('\n');
    const parsed = parseContCore(cleaned);
    const target = JSON.parse(JSON.stringify(seedJake()));
    target.id = 'art-' + Date.now();
    target.title = '读后续写（' + src + '）';
    target.source = src;
    // story兜底清洗：剔除误混入的选项行（"41. A. crowded..."）、题干行（"35. What..."）、孤立选项、页眉短碎片
    const cleanStory = parsed.story.filter(p =>
        !/^\d{1,2}\s*[.．]\s*[A-H]\s*[.．、]/.test(p) &&          // 题号+选项行
        !/^\d{1,2}\s*[.．、]\s*[A-Z][a-z]/.test(p) &&              // 题干行 "35. What..."
        !/^[A-H]\s*[.．、]\s*\S/.test(p) &&                        // 孤立选项行
        (p.match(/[A-Za-z]/g) || []).length > 25 &&                // 过短碎片/页眉
        (p.match(/[一-龥]/g) || []).length / p.length < 0.5         // 中文页眉行
    );
    target.story = cleanStory.length ? cleanStory : ['（未识别到原文段落，请手动检查）'];
    target.openers = parsed.openers.filter(Boolean).length === 2 ? parsed.openers : ['（段首句未识别，请手动填写）', '（段首句未识别，请手动填写）'];
    target.step1 = []; target.step2 = []; target.step5 = [];
    target.step3 = { guide: '', items: [], patterns: '' };
    target.step4 = { p1: { keywords: '', plots: [] }, p2: { keywords: '', plots: [] } };
    target.step6 = { qs: [], extra: "<p class='er-muted'>（此区可导入补充语料）</p>", pairs: [0, 1, 2].map(() => ({ title: '', text: '', imgs: [{ src: '', x: 0, y: 0, w: 280, h: 180 }], layout: 'r' })) };
    target.step7 = { text: "<p class='er-muted'>导入学生作文，全班一起评价并提出改进意见。</p>", images: [] };
    target.step8 = { text: "<p class='er-muted'>（评讲内容待生成——可发原文给AI用 essay-generate 技能生成八步后导入）</p>" };
    DB.articles.push(target);
    curArtId = target.id;
    try { persist(); } catch (e) { }
    if (document.getElementById('erApp')) { try { renderAll(); } catch (e) { } }
    return { ok: true, paras: parsed.story.length, openers: parsed.openers.filter(Boolean).length };
  }

  /* 答案PDF联动：参考范文 → 回填对应续写篇的步骤⑧（篇已存在且step8为占位时才填） */
  function fillSampleFromExam(sourceName, sampleHtml) {
    if (!DB || !Array.isArray(DB.articles)) load();
    const src = String(sourceName || '试卷');
    const a = DB.articles.find(x => x && x.type === 'continuation' && x.source === src && x.title.indexOf('读后续写') === 0);
    if (!a) return { noArt: true };
    const cur = (a.step8 && a.step8.text) || '';
    if (cur && !/er-muted|待生成|未识别/.test(cur)) return { dupe: true };   // 已有范文不覆盖
    a.step8 = { text: String(sampleHtml) };
    try { persist(); } catch (e) { }
    if (document.getElementById('erApp')) { try { renderAll(); } catch (e) { } }
    return { ok: true };
  }

  /* ================= ★应用文识别管线（与续写管线对称；零侵入续写代码） =================
     试卷PDF → ingestPracticalFromExam（题干入位建篇）
     答案PDF → extractPracticalSample + fillPracticalSampleFromExam（范文回填步骤⑧）
     粘贴入口 → autoParse 前置分流 */

  /* 连写行拆分（ensureTypes迁移 与 parsePracticalCore 共用）："标题：1.××；2.××"→标题行+条目各一行 */
  function splitRunOnLines(lines) {
    return lines.flatMap(p => {
      const m = /^(.{1,14}[:：])\s*(\d+[.、].+)$/.exec(String(p || '').trim());
      if (!m) return [p];
      const items = m[2].split(/(?<![\d.])(?=\d+[.、](?!\d))/).map(s => s.trim()).filter(Boolean);
      return items.length > 1 ? [m[1], ...items] : [p];
    });
  }

  /* 应用文题干解析核心（字符定位+结构重排，内容驱动）。
     ★pdf.js文本流"段落=一大行"（视觉行块粘连、段内无换行）——行驱动解析不可靠：
     先字符级锚定"假定/假设你是"，截到落款署名或下一大题，再做断行重排。
     返回 { lines } 或 null（无锚点=该文本不含应用文题，调用方静默跳过） */
  function parsePracticalCore(txt) {
    const raw = String(txt || '').replace(/\r\n?/g, '\n');
    /* 锚点三级：①标准"假定/假设你是" ②变体"你是李华"（句首定位，防正文误触）
       ③结构锚（文体无关，兜底）：写作部分"第一节(…15分)"→"第二节/读后续写"之间的区域=应用文题干——
         不论题目以什么词开头（投稿/书信/通知/发言稿…），只要卷面有节结构即可定位。
         取"最后一个"第一节15分匹配：写作部分在卷尾，语言运用部分的第一节（完形，同为15分）靠取最后排除 */
    const aM = /假[定设]你是/.exec(raw) || /(?:^|[\n。.!?；;]\s*)你是李华/.exec(raw);
    let seg;
    if (aM) {
        seg = raw.slice(aM.index);
    } else {
        let m15 = null, mtmp;
        const re15 = /第\s*[一1]\s*节[^\n]{0,26}15\s*分/g;
        while ((mtmp = re15.exec(raw)) !== null) m15 = mtmp;   // 最后一个=写作第一节
        if (!m15) return null;
        const after = raw.slice(m15.index);
        const stop = after.search(/第\s*[二2]\s*节|读后续写|续写词数/);
        const segText = after.slice(0, stop > 0 ? stop : 1200);
        // 区域需含中文写作指令特征（防纯英文正文/误配区进入）
        if (!/[一-龥]{6,}/.test(segText) || !/(写|征|请|投|稿|邀请|通知|发言|你)/.test(segText)) return null;
        // 剥掉"第一节(满分15分)"节标题头（防下游清洗把它与粘连的题干正文整行误删）
        seg = segText.replace(/^第\s*[一1]\s*节[^\n]{0,26}15\s*分\s*[)）]?\s*/, '').trim();
    }
    /* 终点：落款署名块（Yours...+短署名）或下一大题边界，取先到者 */
    const signBlk = seg.match(/(Yours\s+(?:sincerely|truly|faithfully)\s*,?|Best\s+wishes\s*,?)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)?/i);
    const stopM = seg.match(/\n\s*(读后续写|第二节|第一节|阅读理解|完形填空|完型填空|七选五|语法填空)/);
    let end = seg.length;
    if (signBlk && signBlk.index > 10) end = Math.min(end, signBlk.index + signBlk[0].length);
    if (stopM && stopM.index > 10) end = Math.min(end, stopM.index);
    seg = seg.slice(0, end);
    /* 结构重排：一维粘连文本 → 题干行序列 */
    let t = seg.replace(/\n+/g, '\n');
    t = t.replace(/([。；;：:])\s*(?=\d+\s*[.、](?!\d))/g, '$1\n');            // 句读/冒号后跟要点编号 → 断行
    t = t.replace(/([。.;；]?)\s*(注意[：:])/g, '$1\n$2');                       // "注意："独立成行
    t = t.replace(/([。.；;：:])\s*([（(]\s*[12]\s*[）)])\s*(?=[^）)]{4,})/g, '$1\n$2');  // "(1)(2)"注意要点各自行（前面须是句读/冒号，防英文正文括号误断）
    t = t.replace(/([。.;；]?)\s*(Dear\s+[A-Z][A-Za-z\s]{1,20},?)/g, '$1\n$2'); // 呼语独立成行
    t = t.replace(/([。.;；]?)\s*(Yours\s+(?:sincerely|truly|faithfully)|Best\s+wishes)/ig, '$1\n$2');  // 落款独立
    t = t.replace(/(Yours\s+(?:sincerely|truly|faithfully)\s*,?|Best\s+wishes\s*,?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*$/i, '$1\n$2');  // 落款后粘连署名断开
    const lines = t.split('\n').map(l => l.replace(/\s+/g, ' ').trim())
      .filter(l => l && !/^[_＿]{3,}$/.test(l));
    /* 噪声清洗：板块标题行/满分标注/卷面指令残留 */
    const cleaned = lines.filter(l =>
      !/^(第[一二三]节|书面表达|应用文写作|应用文)[（(]?/.test(l) &&
      !/^[（(]\s*满分\s*\d+\s*分\s*[）)]$/.test(l) &&
      !/^(请将答案写在|答卷前|考生注意|本试卷|答题卡要求)/.test(l)
    );
    return { lines: splitRunOnLines(cleaned) };
  }

  /* 试卷联动入口：PDF识别文本 → 自动新建应用文篇（题干入位，八步留白待AI生成；去重） */
  function ingestPracticalFromExam(rawText, sourceName) {
    if (!DB || !Array.isArray(DB.articles)) load();
    const src = String(sourceName || '试卷');
    if (DB.articles.some(a => a && a.type === 'practical' && a.source === src && a.title.indexOf('应用文') === 0)) return { dupe: true };
    const parsed = parsePracticalCore(rawText);
    if (!parsed || parsed.lines.length < 3) return { none: true };   // 无应用文特征（普通续写卷），静默跳过
    const target = JSON.parse(JSON.stringify(seedEnglishParty()));
    target.id = 'art-' + Date.now();
    target.title = '应用文（' + src + '）';
    target.source = src;
    target.hw = curHwName() || '';
    target.story = parsed.lines;
    target.step1 = []; target.step2 = []; target.step5 = [];
    target.step3 = { guide: '', items: [], patterns: '' };
    target.step4 = { p1: { keywords: '', plots: [] }, p2: { keywords: '', plots: [] } };
    target.step6 = { qs: [], extra: "<p class='er-muted'>（此区可导入补充语料）</p>", pairs: [] };
    target.step7 = { text: '', images: [] };
    target.step8 = { text: "<p class='er-muted'>（范文待回填——可导入答案PDF自动识别，或发AI生成后导入）</p>" };
    DB.articles.push(target);
    curArtId = target.id;
    try { persist(); } catch (e) { }
    if (document.getElementById('erApp')) { try { renderAll(); } catch (e) { } }
    return { ok: true, lines: parsed.lines.length };
  }

  /* 答案PDF范文提取（字符驱动）：落款签名块（Yours...+署名）反向定位最近的 Dear 呼语，圈出英文信。
     词数60-220过滤续写范文（300+）；中文占比/Paragraph标记过滤噪声。返回html或null。
     与续写的段首句锚定切分互补：应用文信有独立签名特征，不依赖范文标记行（标记行可能属续写） */
  function extractPracticalSample(rawText) {
    const raw = String(rawText || '').replace(/\r\n?/g, '\n');
    /* ①标记行分支（文体无关）：答案册"应用文…参考范文"标记行自带板块名——标记后英文段到
         下一中文行即范文。投稿/通知等无Dear呼语、无Yours落款的范文（2026真题投稿篇实锤
         全卷Dear/Yours零匹配）靠此识别；书信类落不到此分支或落此分支同样成立。
         ★多组收集：答案册常给"参考范文(一)(二)"两篇，全部回填（带范文1/2标题） */
    const reAp = /应用文[^\n]{0,10}参考范文/g;
    let am;
    const apBlocks = [];
    while ((am = reAp.exec(raw)) !== null && apBlocks.length < 2) {
        const after = raw.slice(am.index + am[0].length);
        const stop = after.search(/[一-龥]{2,}/);   // 下一处2+汉字（下一篇标记/续写标记）截断
        let block = after.slice(0, stop > 0 ? stop : 2000);
        block = block.replace(/^\s*[（(]\s*[一二1２]\s*[）)]\s*/, '').replace(/[_＿]{3,}/g, '').trim();
        const cn = (block.match(/[一-龥]/g) || []).length / (block.length || 1);
        const words = (block.match(/[A-Za-z]+/g) || []).length;
        if (cn < 0.3 && words >= 60 && words <= 220 && !/Paragraph\s*[12]\s*[:：]/i.test(block)) {
            apBlocks.push(block.split(/\n+/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean));
        }
    }
    if (apBlocks.length) {
        return apBlocks.map((lines, i) =>
            (apBlocks.length > 1 ? '<p><b>范文' + (i + 1) + '</b></p>' : '')
            + lines.map(p => '<p>' + esc(p) + '</p>').join('')
        ).join('');
    }
    /* ②信件兜底：落款签名（Yours sincerely/truly/faithfully 系 + 裸"Yours," + Best wishes；后跟署名）反向圈信 */
    const signRe = /(?:Yours\s*(?:sincerely|truly|faithfully)?\s*,?|Best\s+wishes\s*,?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/ig;
    let m;
    while ((m = signRe.exec(raw)) !== null) {
      const head = raw.slice(0, m.index);
      let dIdx = -1, dm;
      const dearRe = /Dear\s+[A-Z][A-Za-z\s]{1,20}\s*,/g;
      while ((dm = dearRe.exec(head)) !== null) dIdx = dm.index;   // 离落款最近的Dear（最后一个）
      if (dIdx < 0 || m.index + m[0].length - dIdx > 2400) continue;   // Dear→落款距离限制（约500词）
      const block = raw.slice(dIdx, m.index + m[0].length);
      const cn = (block.match(/[一-龥]/g) || []).length / (block.length || 1);
      if (cn > 0.15) continue;                       // 中文指令粘连过多
      if (/Paragraph\s*[12]\s*[:：]/i.test(block)) continue;   // 续写范文混入
      const words = (block.match(/[A-Za-z]+/g) || []).length;
      if (words < 60 || words > 220) continue;       // 应用文80词左右；续写范文300+排除
      /* 结构化输出：呼语/正文段/落款/署名各成<p> */
      let t = block.replace(/(Dear\s+[A-Z][A-Za-z\s]{1,20}\s*,)/, '\n$1\n');
      t = t.replace(/(Yours\s+(?:sincerely|truly|faithfully)\s*,?|Best\s+wishes\s*,?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*$/i, '\n$1\n$2');
      return t.split(/\n+/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
        .map(p => '<p>' + esc(p) + '</p>').join('');
    }
    return null;
  }

  /* 答案联动入口：范文 → 回填对应应用文篇步骤⑧；无应用文篇时自动建篇（题干留待补）——
     教师常先导答案册（只有范文无题干），不应让范文无处可去 */
  function fillPracticalSampleFromExam(sourceName, sampleHtml) {
    if (!DB || !Array.isArray(DB.articles)) load();
    const src = String(sourceName || '试卷');
    const phRe = /er-muted|待回填|待生成|待导入|范文未/;
    const isVacant = x => { const t = (x.step8 && x.step8.text) || ''; return !t.trim() || phRe.test(t); };
    /* 找篇三级放宽：①管线建的标准篇（同卷名+应用文开头）②同卷名任意应用文篇且⑧空/占位 ③任意应用文篇且⑧空/占位（跨卷兜底） */
    let a = DB.articles.find(x => x && x.type === 'practical' && x.source === src && x.title.indexOf('应用文') === 0)
         || DB.articles.find(x => x && x.type === 'practical' && x.source === src && isVacant(x))
         || DB.articles.find(x => x && x.type === 'practical' && isVacant(x));
    let created = false;
    if (!a) {   /* 库里无应用文篇：自动建"应用文（卷名）"——范文先落袋，题干待导试卷PDF或手填 */
      a = JSON.parse(JSON.stringify(seedEnglishParty()));
      a.id = 'art-' + Date.now();
      a.title = '应用文（' + src + '）';
      a.source = src;
      a.story = ['（题干待补：请导入试卷PDF自动识别，或点✏️编辑手填）'];
      a.step1 = []; a.step2 = []; a.step5 = [];
      a.step3 = { guide: '', items: [], patterns: '' };
      a.step4 = { overview: '', sections: [] };
      a.step6 = { qs: [], extra: '' };
      a.step8 = { text: '' };
      delete a.seedVer;
      DB.articles.push(a);
      created = true;
    }
    if (!isVacant(a)) return { dupe: true };   // 已有范文不覆盖
    a.step8 = { text: String(sampleHtml) };
    try { persist(); } catch (e) { }
    if (document.getElementById('erApp')) { try { renderAll(); } catch (e) { } }
    return { ok: true, created };
  }

  function autoParse() {
    const ta = document.getElementById('erPasteText');
    const txt = ta ? ta.value.trim() : '';
    if (!txt) { toast('请先粘贴内容'); return; }
    const makeNew = document.getElementById('erPasteNew').checked;

    /* ★应用文粘贴分流：含"假定/假设你是 + 内容包括/写一封"特征 → 走应用文解析建篇（续写解析路径零改动） */
    if (/假[定设]你是/.test(txt) && /(内容包括|内容要点|写一封|写一篇)/.test(txt)) {
      const prac = parsePracticalCore(txt);
      if (prac && prac.lines.length >= 3) {
        collectEdits();
        let t;
        if (makeNew) {
          t = JSON.parse(JSON.stringify(seedEnglishParty()));
          t.id = 'art-' + Date.now();
          t.title = '新应用文（待命名）';
          t.source = '粘贴识别';
          t.step7 = { text: '', images: [] };
          t.step8 = { text: "<p class='er-muted'>（范文待回填）</p>" };
          DB.articles.push(t);
        } else {
          t = art();
          t.type = 'practical';
          t.stepsMeta = PRACTICAL_STEP_NAMES.slice();
        }
        t.story = prac.lines;
        curArtId = t.id;
        persist(); renderAll();
        document.getElementById('erPasteModal').remove();
        toast('✉ 应用文题干已识别：' + prac.lines.length + ' 行——步骤①看题干，八步评讲内容可发AI生成后导入');
        return;
      }
    }

    const { paras, openers, story, sampleText } = parseContCore(txt);
    const sampleIdx = -1;   // story/sampleText已由核心解析给出

    // ④写入
    collectEdits();
    let target;
    if (makeNew) {
      target = JSON.parse(JSON.stringify(seedJake()));
      target.id = 'art-' + Date.now();
      target.title = '新篇目（待命名）';
      target.source = '粘贴识别';
      target.step7 = { text: "<p class='er-muted'>导入学生作文，全班一起评价并提出改进意见。</p>", images: [] };
      DB.articles.push(target);
    } else {
      target = art();
    }
    target.story = story.length ? story : ['（未识别到原文段落，请检查粘贴内容）'];
    if (openers.filter(Boolean).length === 2) target.openers = openers;
    else target.openers = ['（段首句未识别，请手动填写）', '（段首句未识别，请手动填写）'];
    if (sampleText && sampleText.length > 20) {
      target.step8 = { text: sampleText };
    } else if (makeNew) {
      target.step8 = { text: "<p class='er-muted'>（范文未识别——粘贴内容中需有「范文：/参考范文」标记行）</p>" };
    }
    curArtId = target.id;
    persist(); renderAll();
    document.getElementById('erPasteModal').remove();
    toast(`识别完成：原文${story.length}段 · 段首句${openers.filter(Boolean).length}/2 · 范文${sampleText && sampleText.length > 20 ? '✓' : '✗'}——步骤①看原文，步骤⑧看范文`);
  }

  function importArticle() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
    inp.onchange = () => {
      const f = inp.files[0]; const r = new FileReader();
      r.onload = () => {
        try {
          const d = JSON.parse(r.result);
          if (d.articles) { DB = d; curArtId = DB.articles[0] ? DB.articles[0].id : null; }
          else if (d.title) { DB.articles.push(d); curArtId = d.id; }
          else throw 0;
          ensureTypes(DB);
          DB.articles = DB.articles.map(normalizeArticle).filter(Boolean);
          const hw = curHwName();
          DB.articles.forEach(a => { if (!a.hw && hw) a.hw = hw; });   // 新导入默认归属当前练习
          if (!DB.v2seeded) DB.v2seeded = true;
          persist(); renderAll(); toast('导入成功');
        } catch (e) { toast('JSON 格式不符'); }
      };
      r.readAsText(f);
    };
    inp.click();
  }

  /* ================= 初始化 / 视图接入 ================= */
  function init() {
    if (inited) return; inited = true;
    load();

    // 注入样式
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

    // 注入视图骨架（essayView 容器由 index.html 提供）
    const host = document.getElementById('essayView');
    host.innerHTML = `
      <div class="er-app" id="erApp">
        <aside class="er-side">
          <h3>📖 作文评讲</h3>
          <div class="er-list" id="erList"></div>
          <div class="er-sideops">
            <button style="background:var(--color-primary-bg);color:var(--color-primary-text-dark);border-color:var(--color-primary-border)" onclick="EssayReview._pasteParse()" title="粘贴全文（原文+段首句+范文），自动识别拆分">📋 一键粘贴</button>
            <button onclick="EssayReview._addTpl()">📋 复制为模板</button>
            <button onclick="EssayReview._importWordDoc()" title="解析docx：段落自动填入原文区，识别段首句">📄 导入Word</button>
            <button onclick="EssayReview._importArt()">⬆️ 导入篇目</button>
            <button style="color:var(--color-danger-strong);border-color:var(--border-danger);background:var(--bg-danger-soft)" onclick="EssayReview._delArt()">🗑 删除当前</button>
            <div style="flex-basis:100%;text-align:center;font-size:10px;color:var(--text-disabled);user-select:none">模块版本 ${ER_VERSION}</div>
          </div>
          <button class="er-collapse" onclick="EssayReview._collapse(true)" title="收起篇目栏">«</button>
        </aside>
        <button class="er-open" onclick="EssayReview._collapse(false)" title="展开篇目栏">»</button>
        <div class="er-main">
          <div class="er-top">
            <div class="er-steps" id="erSteps"></div>
            <div class="er-ops">
              <button id="erEditBtn" onclick="EssayReview._edit()">✏️ 编辑</button>
              <button onclick="EssayReview._save()">💾 保存</button>
              <button onclick="EssayReview._export()">⬇️ 导出JSON</button>
              <button onclick="EssayReview._exportSingle()" title="只导出当前篇目（单篇格式，可在任何导入入口追加）">⬇️ 导出本篇</button>
              <button onclick="document.getElementById('erImportFile').click()" title="导入合并版/独立版JSON（整体替换本浏览器数据）">⬆️ 导入JSON</button>
              <input type="file" id="erImportFile" accept=".json" style="display:none" onchange="EssayReview._importJSON(this)">
              <button onclick="EssayReview._zoom(-0.1)" title="缩小字体">➖</button>
              <span id="erZoomLevel" title="当前缩放">100%</span>
              <button onclick="EssayReview._zoom(0.1)" title="放大字体">➕</button>
              <button id="erZoomLock" onclick="EssayReview._lockZoom()" title="锁定当前缩放为默认值">🔒 100%</button>
              <button onclick="EssayReview._resetZoom()" title="重置缩放">♺</button>
            </div>
          </div>
          <div class="er-body" id="erBody"></div>
        </div>
      </div>
      <div id="erModal"><div class="box">
        <h4 style="color:var(--text-primary);margin-bottom:10px">导入文字</h4>
        <textarea id="erModalText" placeholder="在此粘贴文字……"></textarea>
        <div style="text-align:right;margin-top:10px">
          <button class="er-btn" onclick="EssayReview._modalOk()">确定</button>
          <button class="er-btn" onclick="document.getElementById('erModal').classList.remove('on')">取消</button>
        </div>
      </div></div>`;

    // 键盘：←→ 切步骤（编辑与弹窗时失效）
    document.addEventListener('keydown', e => {
      if (editing || document.getElementById('erModal').classList.contains('on')) return;
      if (document.getElementById('essayView').classList.contains('hidden')) return;
      if (e.key === 'ArrowRight' && curStep < 7) { curStep++; renderContent(); }
      if (e.key === 'ArrowLeft' && curStep > 0) { curStep--; renderContent(); }
    });

    // 窗口缩放时重新夹取分栏宽度（防止分隔线被挤出可视区抓不到）
    window.addEventListener('resize', applySplitClamp);
    setupErSplitter();   // 分隔线拖拽（位置式，仿 AFR split）
    setupPairPaste();    // 步骤⑥ Ctrl+V 粘贴图片

    // 兜底1：任何原视图被显示时，自动隐藏作文页（Tab 高亮由 AFR.switchView 自行管理，不越权）
    const obs = new MutationObserver(() => {
      const otherVisible = VIEW_IDS.some(id => {
        const el = document.getElementById(id);
        return el && !el.classList.contains('hidden');
      });
      if (otherVisible && !host.classList.contains('hidden')) {
        host.classList.add('hidden');
      }
    });
    VIEW_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (el) obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    });

    // 兜底2：事件级保险——点击任何原视图 Tab 后，强制确保作文页隐藏（防观察器意外失效）
    document.addEventListener('click', e => {
      const tab = e.target.closest && e.target.closest('.view-tab');
      if (tab && tab.dataset.view !== 'essay') {
        setTimeout(() => host.classList.add('hidden'), 0);
      }
    }, true);

    try {
      renderAll();
      applyZoom();
    } catch (e) {
      console.error('er: 渲染失败，尝试自愈', e);
      try {
        DB.articles = DB.articles.map(normalizeArticle).filter(Boolean);
        persist(); renderAll(); applyZoom();
      } catch (e2) {
        const host = document.getElementById('essayView');
        host.innerHTML = '<div style="padding:30px;font-size:15px;color:var(--color-danger-strong)">作文模块渲染失败：' +
          '<button class="btn" onclick="localStorage.removeItem(\'' + LS_KEY + '\');location.reload()">🗑 清空作文数据并重载</button>' +
          '&nbsp;（或导出 JSON 后联系助手排查）</div>';
      }
    }
  }

  function show() {
    init();
    // 隐藏 AFR 五个原视图（只加 hidden，不改其内容）
    VIEW_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
    // Tab 高亮切换
    document.querySelectorAll('.view-tab').forEach(t => t.classList.toggle('active', t.dataset.view === 'essay'));
    // 显示作文页
    document.getElementById('essayView').classList.remove('hidden');
    // 显示后补夹分栏宽度（初始化渲染发生在隐藏态，clientWidth 曾为 0）
    requestAnimationFrame(applySplitClamp);
    // 若从 Prelude 过来，尝试停音乐（可选，不影响主流程）
    try { if (window.AFR && typeof AFR.stopPreludeMusic === 'function') AFR.stopPreludeMusic(); } catch (e) { }
  }

  /* ================= 对外接口 ================= */
  window.EssayReview = {
    show,
    _edit: () => setEdit(!editing),
    _save: () => { collectEdits(); persist(); toast('已保存到本机浏览器'); },
    _export: exportJSON,
    _exportSingle: exportSingle,
    _importJSON: importJSON,
    _importMerged: importMerged,
    _addTpl: addFromTpl,
    _delArt: delArt,
    _importArt: importArticle,
    _importWordDoc: importWordDoc,
    _pasteParse: pasteAndParse,
    _autoParse: autoParse,
    ingestFromExam,
    fillSampleFromExam,
    /* ★应用文识别管线 API（script-v2.js PDF收尾联动调用） */
    ingestPracticalFromExam,
    extractPracticalSample,
    fillPracticalSampleFromExam,
    _importText: importText,
    _modalOk: modalOk,
    _delImg: i => { art().step7.images.splice(i, 1); persist(); renderContent(); },
    _tick: box => { box.classList.toggle('done'); box.textContent = box.classList.contains('done') ? '✓' : ''; },
    _toggleStep1: toggleStep1,
    _toggleStep2: toggleStep2,
    _toggleGuide3: toggleGuide3,
    _toggleStep3: toggleStep3,
    _toggleStep4: toggleStep4,
    _toggleCols34: toggleCols34,
    _gotoS6: gotoS6,
    _openXuece: openXuece, _editXuece: editXuece,
    /* ★步骤⑦评价升格 API */
    _ev7AddCard(){const g=art();if(!g.ev7Cards)g.ev7Cards=[];g.ev7Cards.push({who:"",band:"",score:"",good:"",prob:"",next:""});renderContent();persist()},
    _ev7DelCard(i){const g=art();if(!g.ev7Cards||g.ev7Cards.length<=1){toast("至少保留一张卡");return}g.ev7Cards.splice(i,1);renderContent();persist()},
    _ev7SubmitPeer(i){const g=art(),c=(g.ev7Cards||[])[i];if(!c||(!c.who&&!c.band&&!c.good&&!c.prob&&!c.next)){toast("先填内容再提交");return}if(!g.ev7Submitted)g.ev7Submitted=[];g.ev7Submitted.push({...c});g.ev7Cards.splice(i,1);if(!g.ev7Cards.length)g.ev7Cards.push({who:"",band:"",score:"",good:"",prob:"",next:""});renderContent();persist();toast("✓ 已提交")},
    _ev7SubmitSelf(){const g=art(),sc=g.ev7Self;if(!sc||(!sc.who&&!sc.band&&!sc.good&&!sc.prob&&!sc.next)){toast("先填内容再提交");return}if(!g.ev7Submitted)g.ev7Submitted=[];g.ev7Submitted.push({...sc,who:(sc.who||"")+"（自评）"});g.ev7Self={who:"",band:"",score:"",good:"",prob:"",next:""};renderContent();persist();toast("✓ 已提交")},
    _ev7DelFb(i){const g=art();if(g.ev7Submitted)g.ev7Submitted.splice(i,1);renderContent();persist()},
    _ev7ClearPick(){const g=art();if(g.ev7Self)for(const k in g.ev7Self){if(g.ev7Self[k]&&g.ev7Self[k].on)g.ev7Self[k].on=false}renderContent();persist()},
    _ev7AddLog(){
      const g=art();
      const src=document.getElementById('ev7Src').value.trim(),up=document.getElementById('ev7Up').value.trim();
      if(!src||!up){toast("原文和改文都写好再收进档案");return}
      if(!g.ev7Dirs||!g.ev7Dirs.length){toast("请至少选一个升格方向");return}
      const now=new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});
      const whyEl=document.getElementById('ev7Why'),plusEl=document.getElementById('ev7Plus');
      const why=whyEl?whyEl.value.trim():'',plus=plusEl?plusEl.value.trim():'';
      const entry={t:now,who:document.getElementById('ev7Who').value.trim(),src,up,dirs:g.ev7Dirs.join(" + "),why,plus};
      if(!g.ev7Logs)g.ev7Logs=[];
      g.ev7Logs.unshift(entry);
      if(!g.ev7Wall)g.ev7Wall=[];
      g.ev7Wall.unshift(entry);
      g.ev7Src="";g.ev7Up="";g.ev7Dirs=[];g.ev7Why="";g.ev7Plus="";
      renderContent();persist();toast("✓ 已留痕并上墙");
    },
    _ev7DelLog(i){const g=art();if(g.ev7Logs)g.ev7Logs.splice(i,1);renderContent();persist()},
    _ev7DelWall(i){const g=art();if(g.ev7Wall)g.ev7Wall.splice(i,1);renderContent();persist()},
    _ev7AddImgs(input){
      const files=input.files; if(!files||!files.length)return;
      const g=art(); if(!Array.isArray(g.step7.images)) g.step7.images=[];
      let done=0;
      [...files].forEach(f=>{
        const r=new FileReader();
        r.onload=()=>{
          g.step7.images.push(r.result);done++;
          if(done===files.length){persist();renderContent();toast(files.length+'张已导入')}
        };
        r.onerror=()=>{toast('图片读取失败');done++};
        r.readAsDataURL(f);
      });
      input.value='';
    },
    _ev7DelImg(i){const g=art();if(confirm('删除此图？')){g.step7.images.splice(i,1);renderContent();persist()}},
    _ev7ToggleEdit(){
      const g=art(); g.ev7Editing = !g.ev7Editing;
      const el = document.getElementById('ev7EssayText');
      if (el) {
        el.contentEditable = g.ev7Editing ? 'true' : 'false';
        el.style.outline = g.ev7Editing ? 'none' : '';
        el.style.userSelect = g.ev7Editing ? '' : 'none';
        el.style.cursor = g.ev7Editing ? '' : 'default';
        if (g.ev7Editing) el.focus();
        else { g.step7.text = el.innerText; persist(); toast('✓ 已保存'); }
      }
      const btn = document.getElementById('ev7EditBtn');
      if (btn) btn.textContent = g.ev7Editing ? '✅ 完成' : '✏️ 编辑';
    },
    _ev7SaveText(){
      const el = document.getElementById('ev7EssayText');
      if (el) { art().step7.text = el.innerText; persist(); toast('💾 已保存'); }
    },
    _ev7OCR(){
      const g=art(), ims=g.step7.images||[];
      if(!ims.length){toast("请先在「① 原卷扫描」导入图片");return}
      if(!window._tessOK){
        const s=document.createElement('script');
        s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        s.onload=()=>{window._tessOK=true;EssayReview._ev7OCR()};
        s.onerror=()=>toast("OCR库加载失败——请检查网络或手动输入");
        document.head.appendChild(s);return;
      }
      (async()=>{
        try{
          const w=await Tesseract.createWorker('eng');
          let all='';
          for(let i=0;i<ims.length;i++){toast(`识别中 ${i+1}/${ims.length}…`);const r=await w.recognize(ims[i]);all+=(all?'\n\n':'')+String(r.data.text||'').trim();}
          await w.terminate();
          if(all){
            g.step7.text=all; g.ev7Editing=true;
            renderContent();persist();toast("识别完成——已进入编辑模式，请校对");
          }else toast("未识别到文字——建议重拍或手动输入");
        }catch(e){toast("识别失败："+e.message)}
      })();
    },
    _addPair: addPair, _delPair: delPair, _delPairImg: delPairImg,     _toggleBr: toggleBr, _cycleLayout: cycleLayout, _txtPtrDown: txtPtrDown, _rectBtn: rectBtn, _slotMove: slotMove, _selPair: selPair, _pickImg: pickImg,
    _pairDragStart: pairDragStart, _pairDragOver: pairDragOver, _pairDrop: pairDrop, _pairDragEnd: pairDragEnd,
    _pairResize: pairResize, _pairFileDrop: pairFileDrop,
    _zoom: zoomStep, _lockZoom: lockZoom, _resetZoom: resetZoom,
    _importPending: importPending,
    /* 供 AFR 主备份还原后热重载（未初始化时静默跳过，首次 show() 会自然读取） */
    _reloadFromStorage: function () {
      if (!inited) return;
      try { load(); curStep = 0; renderAll(); applyZoom(); }
      catch (e) { console.warn('er: reloadFromStorage', e); }
    },
    _collapse: on => collapse(on),
    _toggleGroup: key => {
      groupsOpen[key] = !groupsOpen[key];
      const list = document.getElementById('erList');
      if (!list) return;
      const heads = list.querySelectorAll('.er-group');
      GROUPS.forEach((g, i) => { if (heads[i]) heads[i].classList.toggle('closed', !groupsOpen[g.key]); });
    }
  };
})();
