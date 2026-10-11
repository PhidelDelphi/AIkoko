/* ============================================================
   博见 · Extension 板块（bojian.js）v3.3 —— 六卡片分区版
   ------------------------------------------------------------
   v3.3（2026-10-11）：顶部工具条增设「⬇️导出JSON / ⬇️导出本篇 / ⬆️导入JSON」
     与字体缩放控件（➖ 百分比 ➕ 🔒锁定 ♺重置，仿 Composition 评讲页）；
     导出格式：整库 {type:'bojian-db', papers,cur,data,notebook} / 单卷
     {type:'bojian-paper', paper, sections}；导入自动识别两种格式
     （整库替换需确认，单卷同名覆盖、异名追加）。
   v3 重构（2026-10-10）：页面主体 = 6 个卡片分区，一一对应试卷六大题型：
     📖 Reading 阅读理解 / 🔗 5 of 7 七选五 / 🧩 Cloze 完形填空
     📝 Gap-fill 语法填空 / ✉️ Writing 应用文 / ✨ Continuation 读后续写
   每卡统一四模块：📌语篇溯源 → 🌍博闻拓展(核心·四款外框多媒体) → 📚语料撷英 → 💡微思考(留言讨论)
   附加：🔖难度星级(基础/进阶/深度) · 💬讨论留言(教师点评) · 📂试卷存档回溯(话题知识库) · 📒语料本 · 右上角 ➕ 增加展品
   卡片点击展开/收起，减轻视觉负担。

   架构不变（零侵入）：index.html 仅 Tab按钮 + bojianView 容器 + 本脚本引用；
   存储 localStorage 'AFR-bojian-v3'（v1 旧展品自动迁移）；
   视图互斥双兜底（MutationObserver + click 捕获）；
   主题：走廊走 AFR 主题变量，四款展框保持画廊装裱美学。
   ============================================================ */
(function () {
  'use strict';

  const LS_KEY = 'AFR-bojian-v3';
  const LS_OLD = 'AFR-bojian-v1';
  const VIEW_IDS = ['preludeView', 'scoresView', 'reviewView', 'mindmapView', 'knowledgeView'];

  /* 六大卡片分区（一一对应试卷题型） */
  const SECTIONS = [
    { key: 'reading', icon: '📖', name: 'Reading 阅读理解' },
    { key: 'five7', icon: '🔗', name: '5 of 7 七选五' },
    { key: 'cloze', icon: '🧩', name: 'Cloze 完形填空' },
    { key: 'gapfill', icon: '📝', name: 'Gap-fill 语法填空' },
    { key: 'writing', icon: '✉️', name: 'Writing 应用文' },
    { key: 'cont', icon: '✨', name: 'Continuation 读后续写' },
  ];
  const SEC_NAME = {}; SECTIONS.forEach(s => SEC_NAME[s.key] = s.name);
  const DIFF_TXT = { 1: '★ 基础', 2: '★★ 进阶', 3: '★★★ 深度' };

  /* ================= 种子（试卷「高三上开学检测」） ================= */
  const SEED = {
    papers: [
      { id: 'p-kaohe', name: '高三上开学检测', date: '2026-09' },
      { id: 'p-lianxi06', name: '高三上补充练习06', date: '2026-09' }
    ],
    cur: 'p-kaohe',
    data: {
      'p-kaohe': {
        sections: {
          reading: {
            topic: '准社会关系（Passage C）',
            trace: '刚讲评的 C 篇：社交媒体时代， admiration 会不会变成"想象中的友谊"？文章下定义—析成因—让步—指害—亮立场。',
            browse: [
              { id: 'e1', type: 'video', title: '准社会关系：把名人当朋友的时代', en: 'Parasocial Relationships', url: 'https://www.bilibili.com/video/BV1GJ411x7h7', kw: '准社会关系 粉丝心理', source: 'B站 · 心理学科普', diff: 2, ai: false, reviewed: true, egg: true },
              { id: 'e3', type: 'text', tpl: 'book', title: '准社会关系小史', en: 'A Brief History', body: '1956年，美国社会学家 Horton 与 Wohl 在《精神病学》期刊上提出"准社会交往"（parasocial interaction）：观众与屏幕中的人物建立起一种单向的、由观众单方面维系的"亲密关系"。\n电视时代，这种关系止步于每周固定的播出时间；社交媒体时代，平台用持续的"日常更新"把这种想象亲密推向新高度——我们看到的是精心剪辑的"完美日常"。\n心理学研究提示：适度 admire 无妨，它甚至能带来归属感（belonging）与自信（confidence）；但当想象与现实边界模糊，投入就可能失衡。', source: '据 Horton & Wohl (1956) 改写', diff: 2, ai: true, reviewed: true, egg: false },
              { id: 'e5', type: 'image', title: '黑胶与舞台', en: 'Vinyl & Stage', url: 'https://picsum.photos/seed/vinyl-stage/720/480', kw: 'vinyl record concert', source: '示意图片（正式版可本地上传）', diff: 1, ai: false, reviewed: true, egg: false }
            ],
            corpus: [
              { id: 'c1', term: 'parasocial relationship', meaning: '准社会关系——粉丝对名人的单向想象亲密' },
              { id: 'c2', term: 'an edited version of reality', meaning: '被编辑过的现实（指精修的公众形象）' },
              { id: 'c3', term: 'a sense of belonging', meaning: '归属感' },
              { id: 'c4', term: 'draw / set a boundary', meaning: '划定边界' }
            ],
            think: {
              q: 'Do you think parasocial relationships do more good than harm to teenagers? Why?',
              replies: [
                { id: 'r1', name: '李同学', text: 'I think it does more good. Following my favorite writer makes me study harder.', time: '10-08 20:14', reply: 'Good point! 具体事例让观点有说服力——试着再加一个 "However..." 的让步句会更完整。' },
                { id: 'r2', name: '张同学', text: 'More harm, because fans may buy everything their idols sell.', time: '10-09 07:30', reply: '' }
              ]
            }
          },
          cloze: {
            topic: '社区老年志愿服务',
            trace: '刚讲评的完形：退休老人在社区做志愿、帮扶邻里——付出时间，收获归属。',
            browse: [
              { id: 'c-e1', type: 'text', tpl: 'book', title: '西方社区志愿服务文化 × 国内社区养老志愿模式', en: 'Community Volunteering', body: 'In many Western communities, volunteering is a lifelong habit rather than a retirement activity. Churches, schools and libraries all rely on volunteers; some Americans call it "a second job without pay".\n在中国，"社区养老"正把志愿服务推向另一种形态：低龄老人服务高龄老人（时间银行）、大学生结对陪伴、社区食堂里的银发志愿者……中西方的落点不同，但内核一致——mutual aid（互助）让社区有了温度。\n课后可查：Your local community center probably needs volunteers more than you think.', source: '据公开资料综合改写', diff: 2, ai: true, reviewed: true, egg: false }
            ],
            corpus: [
              { id: 'cc1', term: 'volunteer work', meaning: '志愿工作' },
              { id: 'cc2', term: 'community support', meaning: '社区帮扶' },
              { id: 'cc3', term: 'retire from work', meaning: '退休' },
              { id: 'cc4', term: 'mutual aid', meaning: '互助' },
              { id: 'cc5', term: 'a sense of purpose', meaning: '价值感/目标感' }
            ],
            think: {
              q: 'What can young people do to help the elderly in our community?',
              replies: []
            }
          },
          five7: {
            topic: '城市绿色出行',
            trace: '七选五语篇：电公交、自行车道与步行街——城市如何变得更宜居。',
            browse: [
              { id: 'f-e1', type: 'text', tpl: 'news', paperName: '登高日报', title: '从 Shenzhen 到 Paris：绿色出行的全球实验', en: 'Green Mobility', body: '本报讯 电动公交穿行深圳街头，巴黎的自行车道逐年延伸——城市正重新想象"移动"这件事。\n交通专家指出：最宜居的城市，往往不是汽车最快的城市，而是步行、绿地与公共交通最友好的城市。一句话：城市属于生活在其间的人，而不属于拥堵它的车。', source: '班级共写（示意）', diff: 1, ai: false, reviewed: true, egg: false }
            ],
            corpus: [
              { id: 'fc1', term: 'green mobility', meaning: '绿色出行' },
              { id: 'fc2', term: 'livable / walkable', meaning: '宜居的 / 宜步行的' }
            ],
            think: { q: 'Which is more important for a livable city: faster traffic or friendlier streets?', replies: [] }
          },
          gapfill: { topic: '电影的跨文化之旅（Dear You）', trace: '语法填空语篇：从侨批电影看中国故事的海外讲述。', browse: [], corpus: [], think: { q: 'If you could introduce one Chinese film to a foreign friend, which one and why?', replies: [] } },
          writing: { topic: '校园英文报新栏目 Voices of Youth', trace: '应用文任务：为校英文报新栏目写栏目介绍。', browse: [], corpus: [], think: { q: 'What would you name a new column for your school English paper, and what would it be about?', replies: [] } },
          cont: { topic: '深藏相册的祖母情', trace: '读后续写：Jake 与搬来的祖母、一本旧相册（Stories with Jake, To Be Continued）。', browse: [], corpus: [], think: { q: 'What did the faded blue album mean to Jake? Describe it with three adjectives.', replies: [] } }
        }
      },
      'p-lianxi06': {
        sections: {}
      }
    },
    notebook: []
  };

  /* AI建议桩（v3：按分区生成，v4 接真引擎） */
  const AI_DRAFTS = {
    default: {
      video: { title: '（AI草稿）主题相关视频', kw: '请填检索关键词', source: 'AI建议 · 待教师挑选' },
      audio: { title: '（AI草稿）主题音乐', kw: '请填检索关键词', source: 'AI建议 · 待教师挑选' },
      text: { tpl: 'book', title: '（AI草稿）文化背景注', body: '（AI草稿：请审定或改写）', source: 'AI草稿·待审定' },
      image: { title: '（AI草稿）建议配图', kw: '检索关键词（CC0来源）', source: 'AI建议 · 待教师挑选' }
    }
  };

  /* ================= 状态 ================= */
  let db = null;              /* {papers, cur, data, notebook} */
  let curSec = 'reading';    /* 抽屉选中的分区 */
  let drawerOpen = true;     /* 抽屉展开/收起 */
  let diffFilter = {};        /* secKey -> 'all'|'1'|'2'|'3' */
  let playing = {};
  let editingId = null;
  let dlgType = 'video';
  let dlgSec = 'reading';
  let inited = false;
  let shown = false;
  let guardUntil = 0;   /* show()后的竞态守卫截止时间戳 */

  /* 字体缩放（仿 Composition 评讲页：➖ 百分比 ➕ 🔒 ♺）——只缩内容列，工具条不动 */
  const ZOOM_MIN = 0.8, ZOOM_MAX = 3.0;
  let uiZoom = 1.0, zoomLocked = false, defaultZoom = null;
  let toastTimer = null;
  function toast(msg) {
    let t = document.getElementById('bjToast');
    if (!t) { t = document.createElement('div'); t.id = 'bjToast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2000);
  }

  const $ = id => document.getElementById(id);
  const uid = p => (p || 'x') + Date.now().toString(36) + Math.floor(Math.random() * 999);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ================= 持久化 ================= */
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(db)); } catch (e) { } }
  function blankSection() { return { topic: '', trace: '', browse: [], corpus: [], think: { q: '', replies: [] } }; }
  function blankPaper(name) {
    const id = uid('p'); const sections = {};
    SECTIONS.forEach(s => sections[s.key] = blankSection());
    return { id, name: name || ('未命名试卷 ' + new Date().toISOString().slice(5, 10)), sections };
  }
  function curPaper() { return db.papers.find(p => p.id === db.cur) || db.papers[0]; }
  function curData() {
    const p = curPaper();
    if (!db.data[p.id]) db.data[p.id] = { sections: {} };
    const d = db.data[p.id];
    SECTIONS.forEach(s => { if (!d.sections[s.key]) d.sections[s.key] = blankSection(); });
    return d;
  }
  function secData(key) { return curData().sections[key]; }

  /* v1 旧数据迁移（items+packs → papers[0] 的博闻拓展） */
  function migrateV1() {
    try {
      const raw = localStorage.getItem(LS_OLD);
      if (!raw) return;
      const old = JSON.parse(raw);
      if (!old || !Array.isArray(old.items) || !old.items.length) return;
      const SEC_OF = { 'Passage A': 'reading', 'Passage B': 'reading', 'Passage C': 'reading', 'Passage D': 'reading', '5 of 7': 'five7', 'Cloze': 'cloze', 'Blank Filling': 'gapfill', 'Application Writing': 'writing', 'Continuation Writing': 'cont' };
      const paper = blankPaper('已导入展品（迁移）');
      old.items.forEach(it => {
        const sec = SEC_OF[it.discourse] || 'reading';
        const sd = paper.sections[sec];
        sd.topic = sd.topic || '旧展品迁移';
        sd.browse.push(Object.assign({}, it, { sec, diff: it.diff || 2 }));
      });
      db.papers.unshift({ id: paper.id, name: paper.name, date: '—' });
      db.data[paper.id] = { sections: paper.sections };
      db.cur = paper.id;
    } catch (e) { }
  }

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(LS_KEY); } catch (e) { }
    if (raw) {
      try {
        db = JSON.parse(raw);
        if (db && Array.isArray(db.papers) && db.data) { if (!db.notebook) db.notebook = []; if (db.curSec) curSec = db.curSec; return; }
      } catch (e) { }
    }
    migrateV1();
    if (!db || !Array.isArray(db.papers) || !db.papers.length) db = JSON.parse(JSON.stringify(SEED));
    if (!db.data[db.cur]) db.data[db.cur] = { sections: {} };
    if (!db.notebook) db.notebook = [];
    save();
  }

  /* ================= 字体缩放（➖ 百分比 ➕ 🔒 ♺） ================= */
  function restoreZoom() {
    if (db.ui) { uiZoom = db.ui.zoom || 1.0; zoomLocked = !!db.ui.locked; defaultZoom = db.ui.default || null; }
  }
  function applyZoom() {
    const c = $('bjContent');
    if (c) c.style.zoom = uiZoom;
    const lbl = $('bjZoomLevel'); if (lbl) lbl.textContent = Math.round(uiZoom * 100) + '%';
    const lock = $('bjZoomLock');
    if (lock) {
      lock.textContent = '🔒 ' + Math.round((defaultZoom || 1) * 100) + '%';
      lock.classList.toggle('locked', zoomLocked);
    }
  }
  function saveZoom() {
    db.ui = db.ui || {};
    db.ui.zoom = uiZoom; db.ui.locked = zoomLocked; db.ui.default = defaultZoom;
    save();
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
    defaultZoom = zoomLocked ? uiZoom : null;   /* 锁定 = 记住当前为默认值 */
    applyZoom(); saveZoom();
    toast(zoomLocked ? '已锁定 ' + Math.round(uiZoom * 100) + '% 为默认缩放' : '已解锁缩放');
  }

  /* ================= 导入导出（JSON） =================
     整库格式 {type:'bojian-db', papers, cur, data, notebook}——导入整体替换；
     单卷格式 {type:'bojian-paper', paper:{name,date}, sections}——同名覆盖、异名追加。 */
  function downloadJSON(payload, filename) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }
  function exportJSON() {
    save();
    downloadJSON(Object.assign({ type: 'bojian-db' }, db), '博见-数据导出.json');
    toast('已导出全部数据（试卷存档 ' + db.papers.length + ' 份）');
  }
  function exportSingle() {
    save();
    const p = curPaper();
    if (!p) { toast('没有当前试卷'); return; }
    const payload = { type: 'bojian-paper', paper: { name: p.name, date: p.date }, sections: curData().sections };
    const safe = p.name.replace(/[\\/:*?"<>|]/g, '_');
    downloadJSON(payload, '博见-' + safe + '.json');
    toast('已导出当前试卷「' + p.name + '」（单卷格式）');
  }
  function importJSON(input) {
    const f = input.files && input.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      let obj = null;
      try { obj = JSON.parse(r.result); } catch (e) { alert('导入失败：不是有效的 JSON 文件'); input.value = ''; return; }
      if (obj && Array.isArray(obj.papers) && obj.data) return doImportWhole(obj, input);
      if (obj && obj.sections && (obj.paper || obj.type === 'bojian-paper')) return doImportPaper(obj, input);
      alert('导入失败：不是博见导出的 JSON（需要 papers+data 整库格式，或 type:bojian-paper 单卷格式）');
      input.value = '';
    };
    r.readAsText(f, 'utf-8');
  }
  function doImportWhole(obj, input) {
    if (!confirm('导入将【整体替换】当前浏览器里的博见数据（试卷存档、展品、语料本，未导出的修改会丢失）。继续？')) { input.value = ''; return; }
    db = { papers: obj.papers, cur: obj.cur, data: obj.data, notebook: obj.notebook || [] };
    if (!db.papers.length || !db.data[db.cur]) db.cur = db.papers[0] && db.papers[0].id;
    curSec = 'reading';
    restoreZoom();
    save(); renderAll(); applyZoom();
    toast('导入成功：试卷存档 ' + db.papers.length + ' 份');
    input.value = '';
  }
  function doImportPaper(obj, input) {
    const meta = obj.paper || {};
    const name = (meta.name || '导入试卷').trim();
    const sections = {};
    SECTIONS.forEach(s => { sections[s.key] = Object.assign(blankSection(), (obj.sections || {})[s.key] || {}); });
    const nItems = SECTIONS.reduce((a, s) => a + (sections[s.key].browse || []).length, 0);
    const exist = db.papers.find(p => p.name === name);
    if (exist && !confirm('已存在同名试卷「' + name + '」，覆盖更新？')) { input.value = ''; return; }
    let pid;
    if (exist) { pid = exist.id; exist.date = meta.date || exist.date; db.data[pid] = { sections }; }
    else {
      pid = uid('p');
      db.papers.unshift({ id: pid, name, date: meta.date || new Date().toISOString().slice(5, 10) });
      db.data[pid] = { sections };
    }
    db.cur = pid; curSec = 'reading';
    save(); renderAll();
    toast('已导入试卷「' + name + '」（展品 ' + nItems + ' 件）——展品为 🤖AI草稿，请逐件审定');
    input.value = '';
  }
  /* 合并JSON路由入口：「考试名称-合并.json」经 ⚙→🤖 导入时由主逻辑调用。
     只接受单卷 bojian-paper 格式；静默追加不弹确认，同名试卷直接覆盖更新 */
  function importMerged(obj) {
    init();   /* 合并导入可能先于任何一次打开 Extension——确保 db 已加载（幂等） */
    if (!obj || !obj.sections) return { ok: false, msg: '未识别到试卷（需 type:bojian-paper 单卷格式）' };
    const meta = obj.paper || {};
    const name = (meta.name || '导入试卷').trim();
    const sections = {};
    SECTIONS.forEach(s => { sections[s.key] = Object.assign(blankSection(), (obj.sections || {})[s.key] || {}); });
    const nItems = SECTIONS.reduce((a, s) => a + (sections[s.key].browse || []).length, 0);
    const exist = db.papers.find(p => p.name === name);
    let pid;
    if (exist) { pid = exist.id; exist.date = meta.date || exist.date; db.data[pid] = { sections }; }
    else {
      pid = uid('p');
      db.papers.unshift({ id: pid, name, date: meta.date || new Date().toISOString().slice(5, 10) });
      db.data[pid] = { sections };
    }
    db.cur = pid; curSec = 'reading';
    save(); renderAll();
    return { ok: true, msg: '试卷「' + name + '」展品 ' + nItems + ' 件' };
  }

  /* ================= 视频/音频地址解析 ================= */
  function videoEmbed(url, mute) {
    if (!url) return null;
    const mz = mute ? '&mute=1' : '';
    let m = url.match(/bilibili\.com\/video\/(BV[\w]+)/i);
    if (m) return 'https://player.bilibili.com/player.html?bvid=' + m[1] + '&autoplay=1&high_quality=1' + mz;
    m = url.match(/youtube\.com\/watch\?v=([\w-]+)|youtu\.be\/([\w-]+)/i);
    if (m) return 'https://www.youtube.com/embed/' + (m[1] || m[2]) + '?autoplay=1' + (mute ? '&mute=1' : '');
    if (/^https?:\/\//.test(url)) return url;
    return null;
  }
  function audioKind(url) {
    if (!url) return 'none';
    let m = url.match(/music\.163\.com.*[?&]id=(\d+)/) || url.match(/^(\d{6,})$/);
    if (m) return 'netease:' + m[1];
    if (/^https?:\/\/.+\.(mp3|wav|m4a|ogg)(\?|$)/i.test(url)) return 'direct';
    return 'unknown';
  }

  /* ================= 四款装裱外框（画廊美学，原样保留） ================= */
  function frameHTML(it) {
    const p = playing[it.id];
    if (it.type === 'video') {
      const st = p || null;                       // p = {on, mute} 播放态
      const on = !!(st && st.on);
      const mute = st ? st.mute !== false : true; // 首播默认静音，控制条一键开声
      const embed = on ? videoEmbed(it.url, mute) : null;
      return `<div class="bj-cinema ${on ? 'playing' : ''}" data-cinema="${it.id}">
        <span class="onair">ON AIR</span>
        <div class="screen">
          ${embed ? `<iframe src="${embed}" allowfullscreen="true" allow="autoplay; fullscreen; encrypted-media"></iframe>`
                  : `<div class="cover" onclick="Bojian.togglePlay('${it.id}')"><div class="play">▶</div><div class="kw">${esc(it.kw) || '贴上视频网址后即可在此播放'}<br><span style="font-size:10px;color:#6a7080">${esc(it.source)}</span></div></div>`}
        </div>
        <div class="bj-cin-ctrls">
          ${on ? `<button onclick="Bojian.toggleMute('${it.id}')" title="静音/开声">${mute ? '🔇 已静音·点击开声' : '🔊 声音开·点击静音'}</button>
          <button onclick="Bojian.goFull('${it.id}')" title="全屏观看">⛶ 全屏</button>`
               : `<button onclick="Bojian.togglePlay('${it.id}')">▶ 播放</button>`}
        </div>
        <span class="brand">BOJIAN CINEMA</span>
      </div>`;
    }
    if (it.type === 'audio') {
      const kind = audioKind(it.url);
      let player = '';
      if (p && kind.startsWith('netease')) {
        player = `<iframe src="https://music.163.com/outchain/player?type=2&id=${kind.split(':')[1]}&auto=1&height=66"></iframe>`;
      } else if (p && kind === 'direct') {
        player = `<audio controls autoplay src="${esc(it.url)}" style="width:100%"></audio>`;
      }
      return `<div class="bj-vinylbox">
        <div class="vinyl ${p ? 'spinning' : ''}"><span class="label">博见<br>唱片</span><span class="hole"></span></div>
        <div class="side">
          <div class="song">${esc(it.title)}</div>
          <div class="tip">${kind === 'none' ? '尚未贴音频链接（网易云外链或mp3直链）' : (p ? '正在播放…' : esc(it.kw))}</div>
          ${player || `<button class="bj-playbtn" onclick="Bojian.togglePlay('${it.id}')">${kind === 'unknown' && it.url ? '尝试播放' : '▶ 播放'}</button>`}
        </div>
      </div>`;
    }
    if (it.type === 'text') {
      const body = (it.body || '').split(/\n\n+/).map((para, i) =>
        `<p class="${i === 0 ? 'lead' : ''}">${esc(para).replace(/\n/g, '<br>')}</p>`).join('');
      if (it.tpl === 'news') {
        const dt = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
        return `<div class="bj-paperframe"><div class="news">
          <div class="mast"><div class="nm">${esc(it.paperName) || '班级日报'}</div><div class="dt">${dt} · 拓展阅读版</div></div>
          <h5>${esc(it.title)}</h5><div class="cols">${body}</div>
        </div></div>`;
      }
      return `<div class="bj-bookframe"><div class="book">
        <h4>${esc(it.paperName) || '博见文库'}</h4><div class="chap">${esc(it.title)}</div>${body}
      </div><div class="pages">· BOJIAN LIBRARY ·</div></div>`;
    }
    if (it.type === 'image') {
      const img = it.url
        ? `<img src="${esc(it.url)}" alt="" onerror="this.outerHTML='<div class=nofoto>图片暂不可达<br>（外链失效或离线）<br>检索词：${esc(it.kw) || '—'}</div>'">`
        : `<div class="nofoto">尚未贴图片网址<br>${esc(it.kw)}</div>`;
      return `<div class="bj-canvasframe"><div class="canvasinner">${img}</div>
        <div class="plateline"><div class="plate"><div class="pt">${esc(it.title)}</div><div class="pm">${esc(it.source)}</div></div></div>
      </div>`;
    }
    return '';
  }

  /* ================= 展品卡（含难度标注） ================= */
  function exhibitHTML(it) {
    const d = it.diff || 2;
    return `
      <div class="bj-exhibit ${it.wide ? 'wide' : ''} ${it.egg ? 'isEgg' : ''}">
        <span class="egg">🎬 课堂彩蛋</span>
        <span class="ops">
          <button onclick="Bojian.toggleEgg('${it.id}')" title="课堂彩蛋">${it.egg ? '取消彩蛋' : '设彩蛋'}</button>
          <button onclick="Bojian.openEdit('${it.id}')">编辑</button>
          <button onclick="Bojian.del('${it.id}')">移除</button>
        </span>
        ${frameHTML(it)}
        <div class="bj-plaque">
          <div class="t">${esc(it.title)}<span class="en">${esc(it.en)}</span></div>
          <div class="meta">
            <span class="bj-dstar" title="难度标注">🔖 ${DIFF_TXT[d]}</span>
            <span>${esc(it.source)}</span>
            ${it.ai ? (it.reviewed ? '<span class="bj-badge ok">✅ AI供·师已审</span>' : '<span class="bj-badge draft">🤖 AI草稿·待审定</span>') : '<span class="bj-badge ok">✅ 教师自备</span>'}
            ${!it.reviewed ? `<button class="bj-btn mini" onclick="Bojian.approve('${it.id}')">✓ 审定</button>` : ''}
          </div>
          ${it.qa ? `<div class="bj-qa">💬 看完想想：${esc(it.qa)}</div>` : ''}
        </div>
      </div>`;
  }

  /* ================= 渲染：抽屉导航 + 右侧居中内容 ================= */
  function secItems(sec) { return sec.browse || []; }
  function diffFilterOf(key) { return diffFilter[key] || 'all'; }
  function renderDrawer() {
    const p = curPaper();
    const d = curData();
    const list = SECTIONS.map(sd => {
      const sec = d.sections[sd.key];
      const nEx = (sec.browse || []).length, nCo = (sec.corpus || []).length, nRp = ((sec.think || {}).replies || []).length;
      const n = nEx + nCo + nRp;
      const active = curSec === sd.key;
      return `<button class="bj-navitem ${active ? 'active' : ''}" onclick="Bojian.selectSec('${sd.key}')" title="${sd.name}">
        <span class="ico">${sd.icon}</span><span class="lb">${sd.name}</span>${n ? `<span class="n">${n}</span>` : ''}
      </button>`;
    }).join('');
    const opts = db.papers.map(x => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
    $('bjDrawerList').innerHTML = list;
    $('bjDrawerFoot').innerHTML = `
      <div class="bj-flabel" style="margin-top:2px">📂 存档回溯（试卷）</div>
      <select class="bj-fselect" id="bjPaperSel" style="font-size:12px" onchange="Bojian.switchPaper(this.value)">${opts}</select>
      <button class="bj-btn mini" style="margin-top:6px;width:100%" onclick="Bojian.newPaper()">＋ 新试卷存档</button>`;
  }

  function renderContent() {
    const sd = SECTIONS.find(x => x.key === curSec);
    const sec = secData(curSec);
    const ff = diffFilterOf(curSec);
    const items = secItems(sec).filter(it => ff === 'all' || String(it.diff || 2) === ff);
    const nEx = secItems(sec).length, nCo = (sec.corpus || []).length, nRp = ((sec.think || {}).replies || []).length;
    const topicTxt = sec.topic || '（话题待定——点✎编辑本卡填写）';
    const fchips = [['all', '全部'], ['1', '★ 基础'], ['2', '★★ 进阶'], ['3', '★★★ 深度']].map(x =>
      `<button class="bj-chip mini ${ff === x[0] ? 'active' : ''}" onclick="Bojian.setDiff('${curSec}','${x[0]}')">${x[1]}</button>`).join('');
    const exhibits = items.length
      ? items.map(exhibitHTML).join('')
      : `<div class="bj-mod-empty">这一分区还没有拓展素材——点右上角「➕ 增加展品」，选本分区即可装裱上墙。</div>`;
    const nb = db.notebook || [];
    const corpus = (sec.corpus || []).length
      ? sec.corpus.map(c => {
          const got = nb.some(x => x.term === c.term);
          return `<span class="bj-corpus-chip ${got ? 'on' : ''}">
            <b>${esc(c.term)}</b><span class="mn">${esc(c.meaning)}</span>
            <button class="star" title="${got ? '已收入语料本——点击移除' : '收入语料本'}" onclick="Bojian.toggleCollect('${esc(c.term)}','${esc(c.meaning)}')">${got ? '★' : '☆'}</button>
            <button class="del" title="移除该语料" onclick="Bojian.delCorpus('${curSec}','${c.id}')">×</button>
          </span>`;
        }).join('')
      : '<span class="bj-mod-empty-inline">暂无语料——点「＋ 加语料」补充话题高频词/短语/句型。</span>';
    const replies = ((sec.think || {}).replies || []).map(r => `
      <div class="bj-reply">
        <div class="hd"><b>${esc(r.name)}</b><span class="tm">${esc(r.time)}</span>
          ${r.reply ? '' : `<button class="bj-btn mini" onclick="Bojian.replyTo('${curSec}','${r.id}')">👩‍🏫 教师点评</button>`}
        </div>
        <div class="tx">${esc(r.text)}</div>
        ${r.reply ? `<div class="bj-reply-t">👩‍🏫 教师点评：${esc(r.reply)}</div>` : ''}
      </div>`).join('');
    $('bjContent').innerHTML = `
      <div class="bj-titlebar">
        <span class="bj-t-ico">${sd.icon}</span>
        <span class="bj-t-name">${sd.name}</span>
        <span class="bj-t-topic">原语篇话题：<b>${esc(topicTxt)}</b></span>
        <span class="bj-hspace"></span>
        <button class="bj-btn mini" onclick="Bojian.openCardEdit('${curSec}')">✎ 编辑本卡</button>
      </div>
      <div class="bj-mod">
        <div class="bj-mod-h">📌 语篇溯源</div>
        <div class="bj-trace">${esc(sec.trace) || '<span class="bj-dim">（一句话概括原文主题——点✎填写，建立与试卷的关联）</span>'}</div>
      </div>
      <div class="bj-mod">
        <div class="bj-mod-h">🌍 博闻拓展 <span class="bj-mod-tip">文化背景 · 人物事件 · 外刊节选——多元媒介，难度分层</span></div>
        <div class="bj-diffrow"><span class="bj-lab">难度：</span>${fchips}</div>
        <div class="bj-wall-in">${exhibits}</div>
      </div>
      <div class="bj-mod">
        <div class="bj-mod-h">📚 语料撷英 <span class="bj-mod-tip">话题高频词 · 地道短语 · 句型——☆收入语料本即可积累</span>
          <span style="flex:1"></span><button class="bj-btn mini" onclick="Bojian.addCorpus('${curSec}')">＋ 加语料</button></div>
        <div class="bj-corpus">${corpus}</div>
      </div>
      <div class="bj-mod">
        <div class="bj-mod-h">💡 微思考 <span class="bj-mod-tip">开放性问题，不设标准答案——💬 Discourse 讨论入口：下方留言即交流，教师浏览点评</span>
          <span style="flex:1"></span><span class="bj-lab">留言 ${nRp}</span></div>
        <div class="bj-think-q">${esc(sec.think.q) || '<span class="bj-dim">（点✎编辑本卡设置微思考问题）</span>'}</div>
        <div class="bj-replies">${replies || '<div class="bj-mod-empty-inline">还没有留言——第一个留下你的想法吧。</div>'}</div>
        <div class="bj-reply-form">
          <input class="bj-finput" id="bjRpName-${curSec}" placeholder="称呼" style="max-width:120px">
          <input class="bj-finput" id="bjRpText-${curSec}" placeholder="用英文简单说说你的想法……" style="flex:1">
          <button class="bj-btn primary" onclick="Bojian.postReply('${curSec}')">留言</button>
        </div>
      </div>`;
  }

  function renderBar() {
    renderDrawer();
    const nEx = Object.keys(db.data).reduce((a, k) => a + Object.values(db.data[k].sections || {}).reduce((b, s) => b + (s.browse || []).length, 0), 0);
    $('bjStat').textContent = `试卷存档 ${db.papers.length} 份 · 展品 ${nEx} 件 · 语料本 ${(db.notebook || []).length} 条`;
    $('bjNotebookBtn').textContent = '📒 语料本（' + (db.notebook || []).length + '）';
  }

  function renderCards() { renderContent(); }   /* 兼容别名：旧接口残留调用统一走新渲染 */
  function renderAll() { db.curSec = curSec; renderDrawer(); renderBar(); renderContent(); save(); }

  /* ================= 弹层（添加/编辑展品） ================= */
  function openDialog(it, presetSec) {
    const isEdit = !!it;
    const typeCards = [
      ['video', '📺', '视频 · 影院框'], ['audio', '🎵', '音乐 · 黑胶框'],
      ['text', '📖', '文本 · 书报框'], ['image', '🖼', '图片 · 画布框']
    ].map(t => `<div class="bj-typecard ${dlgType === t[0] ? 'active' : ''}" data-t="${t[0]}" onclick="Bojian.setType('${t[0]}')"><span class="ico">${t[1]}</span>${t[2]}</div>`).join('');
    const secOpts = SECTIONS.map(s => `<option value="${s.key}" ${(it ? it.sec : (presetSec || dlgSec)) === s.key ? 'selected' : ''}>${s.icon} ${s.name}</option>`).join('');
    const diffOpts = [[1, '★ 基础拓展'], [2, '★★ 进阶拓展'], [3, '★★★ 深度拓展']].map(x =>
      `<option value="${x[0]}" ${(it ? (it.diff || 2) : 2) === x[0] ? 'selected' : ''}>${x[1]}</option>`).join('');
    $('bjDlg').innerHTML = `<div class="bj-dialog">
      <h3>${isEdit ? '✏ 编辑展品' : '➕ 增加展品'} <span style="font-size:11px;color:var(--text-tertiary);font-weight:400">（展品只存网址与文字，零媒体存储）</span></h3>
      <div class="bj-frow">
        <div><label class="bj-flabel">归属分区（六大题型卡）</label><select class="bj-fselect" id="fSec">${secOpts}</select></div>
        <div><label class="bj-flabel">难度标注</label><select class="bj-fselect" id="fDiff">${diffOpts}</select></div>
      </div>
      <label class="bj-flabel">媒介类型（决定外框）</label>
      <div class="bj-typegrid" id="bjTypeGrid">${typeCards}</div>
      <label class="bj-flabel">课堂彩蛋</label>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px"><input type="checkbox" id="fEgg" ${it && it.egg ? 'checked' : ''}> 标记为课堂彩蛋（登高联动预备）</label>
      <label class="bj-flabel">展品标题（中文）</label>
      <input class="bj-finput" id="fTitle" value="${it ? esc(it.title) : ''}" placeholder="如：社区志愿服务文化对照">
      <div class="bj-frow">
        <div><label class="bj-flabel">英文副题</label><input class="bj-finput" id="fEn" value="${it ? esc(it.en) : ''}"></div>
        <div><label class="bj-flabel">来源 / 版权标注</label><input class="bj-finput" id="fSource" value="${it ? esc(it.source) : ''}" placeholder="B站 / 网易云 / 自写 / AI草稿"></div>
      </div>
      <span id="fT"></span><span id="fHost"></span>
      <label class="bj-flabel">检索关键词（链接失效换链 / 采买一键跳转）</label>
      <div style="display:flex;gap:6px;align-items:center">
        <input class="bj-finput" id="fKw" value="${it ? esc(it.kw) : ''}" placeholder="如：社区志愿服务 高中生" style="flex:1">
        <button class="bj-btn mini" onclick="Bojian.kwSearch('bili')">去B站</button>
        <button class="bj-btn mini" onclick="Bojian.kwSearch('netease')">去网易云</button>
      </div>
      <span id="bjAiFlag" hidden><div class="bj-hintline" style="color:var(--color-primary-text-dark)">🤖 已填入AI建议草稿——请审定、改写后再保存上墙。</div></span>
      <div class="bj-dlgactions">
        <button class="bj-btn" onclick="Bojian.aiDraft()">🤖 AI建议（示例草稿）</button>
        <span style="flex:1"></span>
        <button class="bj-btn" onclick="Bojian.closeDialog()">取消</button>
        <button class="bj-btn primary" onclick="Bojian.saveDialog()">保存上墙</button>
      </div>
      <div class="bj-hintline">🤖 草稿需点「✓ 审定」后转正式；视频/音频课前点开预加载一次（课堂播放需联网）。</div>
    </div>`;
    $('bjDlg').classList.remove('hidden');
    renderTypeFields(it);
  }
  function renderTypeFields(it) {
    $('bjTypeGrid').querySelectorAll('.bj-typecard').forEach(c => c.classList.toggle('active', c.dataset.t === dlgType));
    $('fT').innerHTML = dlgType === 'text' ? '<label class="bj-flabel">模板与正文</label>' : '<label class="bj-flabel">网址 / 内容</label>';
    $('fHost').innerHTML = (function () {
      if (dlgType === 'video') return `<input class="bj-finput" id="fUrl" value="${it ? esc(it.url) : ''}" placeholder="B站视频页网址（含BV号）/ YouTube网址 / 其他直链">
        <div class="bj-hintline">影院框自动识别B站BV号与YouTube链接，官方外链播放器播放。</div>`;
      if (dlgType === 'audio') return `<input class="bj-finput" id="fUrl" value="${it ? esc(it.url) : ''}" placeholder="网易云音乐歌曲网址（含id=）/ mp3直链">
        <div class="bj-hintline">黑胶框识别网易云id与mp3直链。⚠ 网易云外链偶需登录——彩蛋建议课前实测。</div>`;
      if (dlgType === 'image') return `<input class="bj-finput" id="fUrl" value="${it ? esc(it.url) : ''}" placeholder="图片网址（正式版可本地上传）">
        <div class="bj-hintline">画布框适配任意图片链接；失效自动显示检索词占位卡。</div>`;
      if (dlgType === 'text') return `<div class="bj-frow"><div><label class="bj-flabel">框型</label>
          <select class="bj-fselect" id="fTpl"><option value="book" ${it && it.tpl !== 'news' ? 'selected' : ''}>书 · 文化背景/长文</option><option value="news" ${it && it.tpl === 'news' ? 'selected' : ''}>报 · 新闻对照阅读</option></select></div>
          <div><label class="bj-flabel">报名（报框用）</label><input class="bj-finput" id="fPaper" value="${it ? esc(it.paperName) : ''}" placeholder="如：登高日报"></div></div>
        <label class="bj-flabel">正文（空行分段）</label>
        <textarea class="bj-farea" id="fBody" placeholder="粘贴文字……">${it ? esc(it.body) : ''}</textarea>`;
      return '';
    })();
  }

  /* ================= 编辑本卡（话题/溯源/微思考/语料） ================= */
  function openCardEdit(secKey) {
    const sec = secData(secKey);
    const corpusTxt = (sec.corpus || []).map(c => c.term + ' | ' + c.meaning).join('\n');
    $('bjDlg').innerHTML = `<div class="bj-dialog">
      <h3>✎ 编辑本卡 · ${esc(SEC_NAME[secKey])}</h3>
      <label class="bj-flabel">原语篇话题（卡片标题栏显示）</label>
      <input class="bj-finput" id="fTopic" value="${esc(sec.topic)}" placeholder="如：社区老年志愿服务">
      <label class="bj-flabel">📌 语篇溯源（一句话，建立与试卷的关联）</label>
      <textarea class="bj-farea" id="fTrace" style="min-height:60px" placeholder="刚讲评的那篇文章讲了什么……">${esc(sec.trace)}</textarea>
      <label class="bj-flabel">💡 微思考问题（开放性，不设标准答案）</label>
      <input class="bj-finput" id="fThink" value="${esc(sec.think.q)}" placeholder="如：What can young people do to help the elderly?">
      <label class="bj-flabel">📚 语料撷英（每行一条，格式：词条 | 释义）</label>
      <textarea class="bj-farea" id="fCorpus" style="min-height:110px" placeholder="volunteer work | 志愿工作&#10;mutual aid | 互助">${esc(corpusTxt)}</textarea>
      <div class="bj-dlgactions">
        <span style="flex:1"></span>
        <button class="bj-btn" onclick="Bojian.closeDialog()">取消</button>
        <button class="bj-btn primary" onclick="Bojian.saveCard('${secKey}')">保存本卡</button>
      </div>
    </div>`;
    $('bjDlg').classList.remove('hidden');
  }

  /* ================= 交互实现（供 Bojian 接口调用） ================= */
  function findItem(id) {
    const d = curData();
    for (const sk of Object.keys(d.sections)) {
      const it = (d.sections[sk].browse || []).find(x => x.id === id);
      if (it) return { secKey: sk, sec: d.sections[sk], it };
    }
    return null;
  }
  function saveCard(secKey) {
    const sec = secData(secKey);
    sec.topic = $('fTopic').value.trim();
    sec.trace = $('fTrace').value.trim();
    sec.think.q = $('fThink').value.trim();
    const rows = $('fCorpus').value.split('\n').map(l => l.trim()).filter(Boolean);
    sec.corpus = rows.map((l, i) => {
      const m = l.split(/\s*[|｜—-]\s*/);
      return { id: 'c' + Date.now().toString(36) + i, term: (m[0] || '').trim(), meaning: (m[1] || '').trim() };
    }).filter(c => c.term);
    Bojian.closeDialog(); renderAll();
  }
  function doReply(secKey, rid, reply) {
    const sec = secData(secKey);
    const r = (sec.think.replies || []).find(x => x.id === rid);
    if (r) { r.reply = reply; save(); renderCards(); }
  }

  /* ================= 对外接口 ================= */
  window.Bojian = {
    show,
    selectSec(key) { curSec = key; db.curSec = key; renderDrawer(); renderContent(); save(); },
    toggleDrawer() {
      drawerOpen = !drawerOpen;
      document.getElementById('bjApp').classList.toggle('drawer-collapsed', !drawerOpen);
      document.getElementById('bjDrawerToggle').textContent = drawerOpen ? '◂' : '▸';
    },
    setDiff(key, f) { diffFilter[key] = f; renderCards(); },
    switchPaper(id) { if (id && id !== db.cur) { db.cur = id; curSec = 'reading'; renderAll(); } },
    newPaper() {
      const name = prompt('新试卷存档名称：', '未命名试卷 ' + new Date().toISOString().slice(5, 10));
      if (!name) return;
      const p = blankPaper(name);
      db.papers.unshift({ id: p.id, name: p.name, date: new Date().toISOString().slice(5, 10) });
      db.data[p.id] = { sections: p.sections };
      db.cur = p.id; curSec = 'reading';
      renderAll();
    },
    openAdd(sec) { editingId = null; dlgType = 'video'; dlgSec = sec || 'reading'; openDialog(null, dlgSec); },
    openEdit(id) {
      const f = findItem(id);
      if (!f) return;
      editingId = id; dlgType = f.it.type; dlgSec = f.secKey; openDialog(f.it, f.secKey);
    },
    setType(t) { dlgType = t; const f = editingId ? findItem(editingId) : null; renderTypeFields(f ? f.it : null); },
    closeDialog() { $('bjDlg').classList.add('hidden'); },
    saveDialog() {
      const g = id => ($(id) ? $(id).value.trim() : '');
      const secKey = g('fSec') || 'reading';
      const d = curData();
      if (!d.sections[secKey]) d.sections[secKey] = blankSection();
      let it = editingId ? (findItem(editingId) || {}).it : null;
      if (!it) {
        it = { id: uid('e'), ai: false, reviewed: false, egg: false };
        d.sections[secKey].browse.unshift(it);
      } else {
        /* 若改了分区，从旧分区移除 */
        const f = findItem(it.id);
        if (f && f.secKey !== secKey) f.sec.browse = f.sec.browse.filter(x => x.id !== it.id);
        d.sections[secKey].browse.unshift(it);
      }
      it.sec = secKey;
      it.type = dlgType;
      it.diff = Number(g('fDiff')) || 2;
      it.title = g('fTitle') || '未命名展品';
      it.en = g('fEn');
      it.source = g('fSource');
      it.kw = g('fKw');
      it.egg = $('fEgg').checked;
      if (dlgType !== 'text') { it.url = g('fUrl'); }
      if (dlgType === 'text') { it.tpl = $('fTpl').value; it.body = $('fBody').value; it.paperName = g('fPaper'); delete it.url; }
      curSec = secKey;            /* 保存后跳到目标分区——让教师立刻看到新展品上墙 */
      Bojian.closeDialog(); renderAll();
    },
    aiDraft() {
      const secKey = $('fSec').value;
      const d = AI_DRAFTS[secKey] || AI_DRAFTS.default;
      const draft = d[dlgType] || d.default || {};
      $('fTitle').value = draft.title || '';
      $('fSource').value = draft.source || '';
      if (draft.kw != null && $('fKw')) $('fKw').value = draft.kw;
      if (draft.body != null && $('fBody')) $('fBody').value = draft.body;
      if (draft.tpl && $('fTpl')) $('fTpl').value = draft.tpl;
      $('bjAiFlag').hidden = false;
    },
    togglePlay(id) {
      if (playing[id] && playing[id].on) { delete playing[id]; }
      else {
        Object.keys(playing).forEach(k => { delete playing[k]; });   // 单播放互斥
        playing[id] = { on: true, mute: true };                      // 首播默认静音
      }
      renderCards();
    },
    toggleMute(id) {
      const st = playing[id];
      if (st && st.on) { st.mute = !st.mute; renderCards(); }
    },
    goFull(id) {
      const el = document.querySelector('.bj-cinema[data-cinema="' + id + '"] .screen');
      if (!el) return;
      try {
        if (document.fullscreenElement) { document.exitFullscreen(); return; }
        (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el);
      } catch (e) { alert('当前浏览器不支持全屏：' + e.message); }
    },
    toggleEgg(id) { const f = findItem(id); if (f) { f.it.egg = !f.it.egg; renderCards(); save(); } },
    approve(id) { const f = findItem(id); if (f) { f.it.reviewed = true; renderCards(); save(); } },
    del(id) {
      const f = findItem(id);
      if (f && confirm('移除展品《' + f.it.title + '》？')) { f.sec.browse = f.sec.browse.filter(x => x.id !== id); renderCards(); save(); }
    },
    openCardEdit,   // 编辑本卡弹层（函数声明见上）
    saveCard,       // 保存本卡（函数声明见上）
    addCorpus(secKey) {
      const term = prompt('词条（英文）：'); if (!term) return;
      const meaning = prompt('释义：') || '';
      secData(secKey).corpus.push({ id: uid('c'), term: term.trim(), meaning: meaning.trim() });
      renderCards();
    },
    delCorpus(secKey, cid) { const sec = secData(secKey); sec.corpus = sec.corpus.filter(c => c.id !== cid); renderCards(); },
    toggleCollect(term, meaning) {
      db.notebook = db.notebook || [];
      const i = db.notebook.findIndex(x => x.term === term);
      if (i > -1) db.notebook.splice(i, 1); else db.notebook.push({ term, meaning });
      save(); renderBar(); renderContent();
    },
    openNotebook() {
      const list = db.notebook || [];
      $('bjNotebook').innerHTML = `<div class="bj-dialog">
        <h3>📒 我的语料本 <span style="font-size:11px;color:var(--text-tertiary);font-weight:400">（跨试卷积累，可直接抄进笔记本）</span></h3>
        ${list.length ? list.map((x, i) => `
          <div class="bj-nb-item">
            <span><b>${esc(x.term)}</b><span class="mn">　${esc(x.meaning)}</span></span>
            <button class="bj-btn mini" onclick="Bojian.removeNb(${i})">移除</button>
          </div>`).join('') : '<div class="bj-mod-empty-inline">还是空的——去各卡片的 📚 语料撷英 点 ☆ 收集。</div>'}
        <div class="bj-dlgactions">
          <button class="bj-btn" onclick="Bojian.copyNb()">📋 复制全部</button>
          <span style="flex:1"></span>
          <button class="bj-btn primary" onclick="Bojian.closeNotebook()">完成</button>
        </div>
      </div>`;
      $('bjNotebook').classList.remove('hidden');
    },
    closeNotebook() { $('bjNotebook').classList.add('hidden'); },
    removeNb(i) { db.notebook.splice(i, 1); save(); Bojian.openNotebook(); renderBar(); },
    copyNb() {
      const txt = (db.notebook || []).map(x => x.term + ' — ' + x.meaning).join('\n');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => alert('已复制 ' + db.notebook.length + ' 条语料'), () => alert(txt));
      else alert(txt);
    },
    replyTo(secKey, rid) {
      const reply = prompt('教师点评：');
      if (reply && reply.trim()) doReply(secKey, rid, reply.trim());
    },
    postReply(secKey) {
      const name = ($('bjRpName-' + secKey) || {}).value || '';
      const text = ($('bjRpText-' + secKey) || {}).value || '';
      if (!text.trim()) { alert('先写下你的想法'); return; }
      const sec = secData(secKey);
      sec.think.replies = sec.think.replies || [];
      sec.think.replies.push({ id: uid('r'), name: name.trim() || '同学', text: text.trim(), time: new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }), reply: '' });
      save(); renderCards();
    },

    kwSearch(plat) {
      const kw = ($('fKw').value || '').trim();
      if (!kw) { alert('先填检索关键词'); return; }
      const u = plat === 'bili'
        ? 'https://search.bilibili.com/all?keyword=' + encodeURIComponent(kw)
        : 'https://music.163.com/#/search/m/?s=' + encodeURIComponent(kw);
      window.open(u, '_blank');
    },
    reset() {
      if (confirm('重置展廊？将清空所有试卷存档与作答，恢复示例数据。')) {
        try { localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_OLD); } catch (e) { }
        location.reload();
      }
    },

    /* v3.3：导入导出 + 字体缩放（供工具条 onclick 调用） */
    _export: exportJSON,
    _exportSingle: exportSingle,
    _importJSON: importJSON,
    _importMerged: importMerged,
    _zoom: zoomStep,
    _lockZoom: lockZoom,
    _resetZoom: resetZoom
  };

  /* ================= 初始化 / 视图接入 ================= */
  function init() {
    if (inited) return; inited = true;
    load();
    const host = document.getElementById('bojianView');
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    host.innerHTML = `
    <div class="bj-app" id="bjApp">
      <nav class="bj-drawer" id="bjDrawer">
        <div class="bj-drawer-list" id="bjDrawerList"></div>
        <div class="bj-drawer-foot" id="bjDrawerFoot"></div>
      </nav>
      <button class="bj-drawer-toggle" id="bjDrawerToggle" onclick="Bojian.toggleDrawer()" title="收起/展开导航">◂</button>
      <main class="bj-main">
        <div class="bj-toolbar">
          <span class="bj-stat" id="bjStat"></span>
          <div class="bj-ops">
            <button class="bj-btn" id="bjNotebookBtn" onclick="Bojian.openNotebook()">📒 语料本（0）</button>
            <button class="bj-btn" onclick="Bojian.reset()" title="清空所有试卷存档，恢复示例">🔄 重置</button>
            <button class="bj-btn primary" onclick="Bojian.openAdd()" title="增加展品">➕ 增加展品</button>
            <button class="bj-btn" onclick="Bojian._export()" title="导出全部试卷存档与语料本（整库JSON）">⬇️ 导出JSON</button>
            <button class="bj-btn" onclick="Bojian._exportSingle()" title="只导出当前试卷（单卷格式，可在导入入口追加）">⬇️ 导出本篇</button>
            <button class="bj-btn" onclick="document.getElementById('bjImportFile').click()" title="导入博见JSON：整库替换或单卷追加">⬆️ 导入JSON</button>
            <input type="file" id="bjImportFile" accept=".json" style="display:none" onchange="Bojian._importJSON(this)">
            <button class="bj-btn" onclick="Bojian._zoom(-0.1)" title="缩小字体">➖</button>
            <span class="bj-zoomlvl" id="bjZoomLevel" title="当前缩放">100%</span>
            <button class="bj-btn" onclick="Bojian._zoom(0.1)" title="放大字体">➕</button>
            <button class="bj-btn" id="bjZoomLock" onclick="Bojian._lockZoom()" title="锁定当前缩放为默认值">🔒 100%</button>
            <button class="bj-btn" onclick="Bojian._resetZoom()" title="重置缩放">♺</button>
          </div>
        </div>
        <div class="bj-content" id="bjContent"></div>
      </main>
      <div class="bj-overlay hidden" id="bjDlg"></div>
      <div class="bj-overlay hidden" id="bjNotebook"></div>
    </div>`;
    restoreZoom();
    renderAll();
    applyZoom();

    /* Esc 关闭弹层/抽屉（仅博见视图内生效） */
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      const hv = document.getElementById('bojianView');
      if (!hv || hv.classList.contains('hidden')) return;
      ['bjDlg', 'bjNotebook'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.classList.contains('hidden')) el.classList.add('hidden');
      });
    });

    /* 顶部让位：视图 inset:0 以 .main-content 为定位基准（自身已在主头部之下），
       不能再叠加头部高度，否则顶部多出一条头部高的空白。
       本文件与 essay-review.js 均会注入 .main-content{position:relative}（幂等），
       保证无论先打开哪个板块，该基准都成立；fitTop 的回退分支仅为极端缺脚本情形兜底。
       注意不能用 offsetParent 判断——init 时视图还处于 hidden（display:none），offsetParent 恒为 null。 */
    const fitTop = () => {
      const hv = document.getElementById('bojianView');
      if (!hv) return;
      const mc = hv.parentElement;
      const insideMain = !!(mc && mc.classList.contains('main-content') && getComputedStyle(mc).position !== 'static');
      const h = (document.querySelector('.header') || {}).offsetHeight || 0;
      hv.style.top = insideMain ? '0px' : h + 'px';
      hv.style.height = insideMain ? '100%' : Math.max(300, window.innerHeight - h) + 'px';
    };
    fitTop();
    window.addEventListener('resize', fitTop);

    /* 互斥双兜底（原样保留） */
    const host2 = document.getElementById('bojianView');

    const obs = new MutationObserver(() => {
      const otherVisible = VIEW_IDS.concat(['essayView', 'cansxView']).some(id => {
        const el = document.getElementById(id);
        return el && !el.classList.contains('hidden');
      });
      if (otherVisible && !host2.classList.contains('hidden') && Date.now() > guardUntil) host2.classList.add('hidden');
    });
    VIEW_IDS.concat(['essayView', 'cansxView']).forEach(id => {
      const el = document.getElementById(id);
      if (el) obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    });
    document.addEventListener('click', e => {
      const tab = e.target.closest && e.target.closest('.view-tab');
      if (tab && tab.dataset.view !== 'bojian') setTimeout(() => host2.classList.add('hidden'), 0);
    }, true);
    /* 守卫期轮询：AFR启动尾部的视图重置若晚于observer触发，这里夺回可见性（守卫期结束后停止）
       注意：夺回检测只含 AFR 五视图+essayView，不含 cansxView——参省无夺回逻辑，
       若列入会在守卫窗内吞掉用户切换到参省的正常点击（合并 Introspection 时调整） */
    const guardTick = setInterval(() => {
      if (!(shown && Date.now() < guardUntil)) { clearInterval(guardTick); return; }
      const hv = document.getElementById('bojianView');
      const other = VIEW_IDS.concat(['essayView']).some(id => {
        const el = document.getElementById(id);
        return el && !el.classList.contains('hidden');
      });
      if (other && hv.classList.contains('hidden')) {
        VIEW_IDS.concat(['essayView']).forEach(id => {
          const el = document.getElementById(id);
          if (el) el.classList.add('hidden');
        });
        hv.classList.remove('hidden');
      }
    }, 120);
  }

  function show() {
    init();
    shown = true;
    guardUntil = Date.now() + 5000;   /* 守卫窗：覆盖AFR启动尾部的视图重置 */
    VIEW_IDS.concat(['essayView', 'cansxView']).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
    document.querySelectorAll('.view-tab').forEach(t => t.classList.toggle('active', t.dataset.view === 'bojian'));
    document.getElementById('bojianView').classList.remove('hidden');
  }

  /* ================= 样式 ================= */
  const CSS = `
#bojianView{position:absolute;inset:0;z-index:20;overflow-y:auto;padding:0!important}
.main-content{position:relative}
#bojianView.hidden{display:none}
.bj-app{height:100%;display:flex;background:var(--bg-subtle);color:var(--text-body);font-size:14px;font-family:inherit;overflow:hidden}

/* ---- 走廊（AFR主题变量区） ---- */
.bj-drawer{width:216px;flex-shrink:0;background:var(--bg-panel);border-right:1px solid var(--border-color-light);display:flex;flex-direction:column;transition:width .2s;overflow:hidden}
.bj-app.drawer-collapsed .bj-drawer{width:54px}
.bj-drawer-list{flex:1;overflow-y:auto;padding:12px 8px 8px;display:flex;flex-direction:column;gap:4px}
.bj-navitem{display:flex;align-items:center;gap:9px;border:none;background:transparent;border-radius:9px;padding:11px 10px;font-size:12.5px;cursor:pointer;color:var(--text-secondary);text-align:left;width:100%;transition:background .15s}
.bj-navitem:hover{background:var(--color-primary-bg-soft);color:var(--color-primary-text-dark)}
.bj-navitem.active{background:var(--color-primary);color:var(--text-on-primary);font-weight:700}
.bj-navitem .ico{font-size:16px;width:22px;text-align:center;flex-shrink:0}
.bj-navitem .lb{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left}
.bj-navitem .n{font-size:10px;background:var(--color-primary-bg);color:var(--color-primary-text-dark);border-radius:9px;padding:0 6px}
.bj-navitem.active .n{background:rgba(255,255,255,.25);color:#fff}
.bj-drawer-foot{padding:10px 10px 14px;display:flex;flex-direction:column;gap:2px}
.bj-app.drawer-collapsed .bj-navitem .lb,.bj-app.drawer-collapsed .bj-navitem .n,
.bj-app.drawer-collapsed .bj-flabel,.bj-app.drawer-collapsed .bj-fselect,
.bj-app.drawer-collapsed .bj-drawer-foot .bj-btn,.bj-app.drawer-collapsed .bj-drawer-brand{display:none}
.bj-app.drawer-collapsed .bj-drawer-foot{padding:6px 4px}
.bj-drawer-toggle{position:fixed;top:50%;left:216px;transform:translateY(-50%);z-index:45;width:16px;height:46px;
  border:1px solid var(--border-color);border-left:none;border-radius:0 8px 8px 0;background:var(--bg-panel);
  color:var(--text-tertiary);cursor:pointer;font-size:10px;padding:0;transition:left .2s}
.bj-drawer-toggle:hover{color:var(--color-primary)}
.bj-app.drawer-collapsed .bj-drawer-toggle{left:54px}
.bj-main{flex:1;min-width:0;display:flex;flex-direction:column;overflow-y:auto;height:100%}
.bj-toolbar{margin:0;padding:9px 16px;display:flex;gap:10px;align-items:center;flex-wrap:nowrap;width:100%;
  border-bottom:1px solid var(--border-color-light);position:sticky;top:0;z-index:12;background:var(--bg-subtle)}
.bj-stat{font-size:11.5px;color:var(--text-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:1;min-width:0}
/* 按钮组：仿 Composition er-ops / Mindmap mm-ops——单行右对齐小按钮 */
.bj-ops{display:flex;align-items:center;gap:4px;flex-wrap:nowrap;flex-shrink:0;margin-left:auto}
.bj-toolbar .bj-btn{padding:3px 9px;font-size:11.5px;white-space:nowrap;flex-shrink:0}
.bj-zoomlvl{font-size:12px;color:var(--text-tertiary);min-width:36px;text-align:center;user-select:none}
.bj-btn.locked{border-color:var(--color-primary);color:var(--color-primary-text-dark);background:var(--color-primary-bg);font-weight:700}
#bjToast{position:fixed;bottom:30px;left:50%;transform:translateX(-50%) translateY(8px);background:rgba(28,30,38,.94);color:#fff;
  padding:9px 18px;border-radius:9px;font-size:13px;opacity:0;pointer-events:none;transition:.22s;z-index:9999;max-width:80vw}
#bjToast.on{opacity:1;transform:translateX(-50%) translateY(0)}
.bj-content{max-width:920px;margin:0 auto;padding:10px 20px 34px;width:100%;display:flex;flex-direction:column;gap:12px}
.bj-titlebar{display:flex;align-items:center;gap:10px;background:var(--bg-panel);border:1px solid var(--border-color-light);border-left:4px solid var(--color-primary);border-radius:10px;padding:11px 16px;flex-wrap:wrap}
.bj-t-ico{font-size:20px}
.bj-t-name{font-size:16px;font-weight:800;color:var(--color-primary-text-dark)}
.bj-t-topic{font-size:12.5px;color:var(--text-secondary)}
.bj-t-topic b{color:var(--color-primary-text-dark)}
.bj-btn{border:1px solid var(--border-color);background:var(--bg-panel);color:var(--text-secondary);border-radius:var(--radius-base,8px);padding:6px 14px;font-size:12.5px;cursor:pointer;transition:all .15s}
.bj-btn:hover{border-color:var(--color-primary-hover);color:var(--color-primary-hover)}
.bj-btn.primary{background:var(--color-primary);color:var(--text-on-primary);border-color:var(--color-primary);font-weight:600}
.bj-btn.primary:hover{opacity:.9;color:var(--text-on-primary)}
.bj-btn.mini{font-size:11px;padding:2px 9px}
.bj-lab{font-size:11.5px;color:var(--text-tertiary)}

/* ---- 存档回溯（已移入抽屉底部；本条保留兼容） ---- */
#bjArchive{flex-wrap:wrap}

/* ---- 四模块 ---- */
.bj-mod{border:1px solid var(--border-color-lighter);border-radius:10px;padding:10px 14px;background:var(--bg-subtle)}
.bj-mod-h{font-size:13px;font-weight:800;color:var(--color-primary-text-dark);display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px}
.bj-mod-tip{font-size:10.5px;font-weight:400;color:var(--text-tertiary)}
.bj-dim{color:var(--text-tertiary)}
.bj-trace{font-size:13px;line-height:1.8;color:var(--text-body)}
.bj-diffrow{display:flex;gap:5px;align-items:center;margin-bottom:10px;flex-wrap:wrap}
.bj-chip{border:1px solid var(--border-color);background:var(--bg-panel);border-radius:16px;padding:3px 12px;font-size:11.5px;cursor:pointer;color:var(--text-body)}
.bj-chip:hover{border-color:var(--color-primary-hover)}
.bj-chip.active{background:var(--color-primary);color:var(--text-on-primary);border-color:var(--color-primary)}
.bj-chip.mini{padding:2px 10px;font-size:11px;border-radius:12px}
.bj-wall-in{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px;align-items:start}
.bj-wall-in>*:only-child{grid-column:1/-1;max-width:820px}
.bj-mod-empty{grid-column:1/-1;text-align:center;color:var(--text-tertiary);padding:26px 12px;font-size:12.5px;line-height:1.9;border:1px dashed var(--border-color);border-radius:10px}
.bj-mod-empty-inline{font-size:12px;color:var(--text-tertiary)}

/* ---- 语料撷英 ---- */
.bj-corpus{display:flex;flex-wrap:wrap;gap:8px}
.bj-corpus-chip{position:relative;display:inline-flex;flex-direction:column;border:1px solid var(--border-color);border-radius:10px;padding:6px 46px 6px 12px;background:var(--bg-panel);max-width:300px}
.bj-corpus-chip.on{border-color:var(--color-warning,#faad14);background:rgba(250,173,20,.06)}
.bj-corpus-chip .star{position:absolute;right:26px;top:50%;transform:translateY(-50%);border:none;background:transparent;font-size:16px;color:#cfc7b4;cursor:pointer;line-height:1;padding:2px}
.bj-corpus-chip.on .star{color:var(--color-warning,#faad14);text-shadow:0 0 6px rgba(250,173,20,.45)}
.bj-corpus-chip .del{position:absolute;right:8px;top:50%;transform:translateY(-50%);border:none;background:transparent;color:var(--text-tertiary);cursor:pointer;font-size:12px;padding:2px}
.bj-corpus-chip .del:hover{color:var(--color-danger,#d9534f)}
.bj-corpus-chip b{font-size:12.5px;color:var(--text-primary)}
.bj-corpus-chip .mn{font-size:11px;color:var(--text-tertiary);margin-top:1px}
.bj-corpus-chip .ops{position:absolute;right:4px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:2px}
.bj-corpus-chip .ops button{border:none;background:transparent;color:var(--color-warning,#faad14);cursor:pointer;font-size:13px;padding:0 3px;line-height:1.1}
.bj-corpus-chip .ops button:last-child{color:var(--text-tertiary)}
.bj-corpus-chip .ops button:hover{transform:scale(1.25)}

/* ---- 微思考留言 ---- */
.bj-think-q{font-size:14.5px;font-weight:700;line-height:1.7;color:var(--text-primary);background:var(--color-primary-bg-soft);border-left:4px solid var(--color-primary);border-radius:0 8px 8px 0;padding:9px 13px}
.bj-replies{display:flex;flex-direction:column;gap:8px;margin-top:8px}
.bj-reply{border:1px solid var(--border-color-lighter);border-radius:8px;padding:7px 11px;background:var(--bg-panel)}
.bj-reply .hd{display:flex;gap:8px;align-items:center;font-size:12px;color:var(--text-secondary);margin-bottom:3px}
.bj-reply .hd .tm{color:var(--text-tertiary);font-size:10.5px;flex:1}
.bj-reply .tx{font-size:13px;line-height:1.7;color:var(--text-body)}
.bj-reply-t{margin-top:6px;font-size:12px;line-height:1.7;color:var(--color-primary-text-dark);background:var(--color-primary-bg-soft);border-radius:6px;padding:5px 10px}
.bj-reply-form{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}

/* ---- 展品卡（原v2样式保留） ---- */
.bj-exhibit{background:var(--bg-panel);border-radius:6px;box-shadow:0 3px 14px rgba(60,60,90,.12);overflow:hidden;transition:transform .18s,box-shadow .18s;position:relative}
.bj-exhibit:hover{transform:translateY(-3px);box-shadow:0 8px 22px rgba(60,60,90,.18)}
.bj-exhibit.wide{grid-column:span 2}
.bj-exhibit .ops{position:absolute;top:8px;right:8px;z-index:30;display:none;gap:5px}
.bj-exhibit:hover .ops{display:flex}
.bj-exhibit .ops button{border:1px solid rgba(255,255,255,.5);background:rgba(0,0,0,.45);color:#fff;border-radius:6px;font-size:11px;padding:2px 8px;cursor:pointer}
.bj-exhibit .egg{position:absolute;top:8px;left:8px;z-index:30;font-size:11px;background:var(--color-warning,#faad14);color:#fff;border-radius:10px;padding:2px 9px;display:none}
.bj-exhibit.isEgg .egg{display:block}
.bj-plaque{padding:10px 14px 12px;background:var(--bg-panel);border-top:1px solid var(--border-color-light)}
.bj-plaque .t{font-size:13.5px;font-weight:700;color:var(--text-primary)}
.bj-plaque .t .en{font-weight:400;color:var(--text-tertiary);font-size:11.5px;margin-left:6px}
.bj-plaque .meta{font-size:10.5px;color:var(--text-tertiary);margin-top:3px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.bj-badge{font-size:10px;border-radius:8px;padding:1px 7px}
.bj-badge.draft{background:var(--color-primary-bg-soft);color:var(--color-primary-text-dark);border:1px solid var(--color-primary-border)}
.bj-badge.ok{background:var(--color-success-bg,#e9f7ee);color:var(--color-success);border:1px solid var(--color-success-border,#b7e0c3)}
.bj-dstar{font-size:10.5px;color:var(--color-warning,#c9a227);font-weight:700}
.bj-qa{margin-top:7px;font-size:12px;line-height:1.7;color:var(--text-secondary);background:var(--bg-subtle);border-left:3px solid var(--color-primary);border-radius:0 6px 6px 0;padding:5px 10px}

/* ---- 影院框 ---- */
.bj-cinema{background:#14161c;padding:14px 14px 16px;border-radius:4px;position:relative;box-shadow:inset 0 0 0 1px #2a2e3a,inset 0 0 30px rgba(0,0,0,.8)}
.bj-cinema .onair{position:absolute;top:6px;left:14px;font-size:9px;color:#ff5f56;letter-spacing:2px;display:flex;align-items:center;gap:4px}
.bj-cinema .onair::before{content:'';width:6px;height:6px;border-radius:50%;background:#ff5f56}
.bj-cinema.playing .onair::before{animation:bjBlink 1.2s infinite}
@keyframes bjBlink{50%{opacity:.25}}
.bj-cinema .screen{position:relative;aspect-ratio:16/9;background:#000;border-radius:3px;overflow:hidden;display:flex;align-items:center;justify-content:center;cursor:pointer}
.bj-cinema .cover{text-align:center;color:#9aa2b5;padding:12px}
.bj-cinema .cover .play{width:52px;height:52px;border-radius:50%;border:2px solid #9aa2b5;margin:0 auto 8px;display:flex;align-items:center;justify-content:center;font-size:20px;color:#cfd5e2;transition:all .2s}
.bj-cinema .screen:hover .play{border-color:#fff;color:#fff;transform:scale(1.08)}
.bj-cinema .cover .kw{font-size:11.5px;line-height:1.6}
.bj-cinema iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.bj-cinema .brand{position:absolute;bottom:3px;right:12px;font-size:8.5px;color:#3c4152;letter-spacing:3px}
.bj-cin-ctrls{display:flex;gap:10px;justify-content:center;padding:8px 8px 2px}
.bj-cin-ctrls button{border:1px solid #3c4152;background:#1d2029;color:#cfd5e2;border-radius:14px;font-size:11px;padding:3px 16px;cursor:pointer;transition:all .15s}
.bj-cin-ctrls button:hover{border-color:#cfd5e2;color:#fff}

/* ---- 黑胶框 ---- */
.bj-vinylbox{background:linear-gradient(160deg,#3a3128,#241f18);padding:18px;display:flex;gap:16px;align-items:center;min-height:150px}
.bj-vinylbox .vinyl{width:118px;height:118px;border-radius:50%;flex-shrink:0;position:relative;
  background:repeating-radial-gradient(circle at 50% 50%,#1b1b1d 0 2px,#232326 2px 4px);
  box-shadow:0 4px 14px rgba(0,0,0,.5),inset 0 0 8px rgba(255,255,255,.06)}
.bj-vinylbox .vinyl::after{content:'';position:absolute;inset:0;border-radius:50%;
  background:conic-gradient(from 0deg,transparent 0 340deg,rgba(255,255,255,.14) 355deg,transparent 360deg)}
.bj-vinylbox .vinyl .label{position:absolute;inset:36%;border-radius:50%;background:#b8934a;display:flex;align-items:center;justify-content:center;font-size:9px;color:#3d3010;text-align:center;padding:4px}
.bj-vinylbox .vinyl .hole{position:absolute;inset:47%;border-radius:50%;background:#171511}
.bj-vinylbox .vinyl.spinning{animation:bjSpin 2.4s linear infinite}
@keyframes bjSpin{to{transform:rotate(360deg)}}
.bj-vinylbox .side{flex:1;min-width:0;color:#d8cfc0}
.bj-vinylbox .side .song{font-size:13.5px;font-weight:700;margin-bottom:4px}
.bj-vinylbox .side .tip{font-size:11px;color:#9a8f7c;line-height:1.6;margin-bottom:8px}
.bj-playbtn{border:1px solid #d8cfc0;background:transparent;color:#d8cfc0;border-radius:16px;padding:4px 16px;font-size:12px;cursor:pointer}
.bj-playbtn:hover{background:#d8cfc0;color:#241f18}
.bj-vinylbox iframe{width:100%;height:90px;border:0;border-radius:6px}

/* ---- 书框 ---- */
.bj-bookframe{background:linear-gradient(135deg,#6b4a2a,#8a6238 30%,#6b4a2a);padding:12px}
.bj-bookframe .book{background:#f8f2e4;color:#2e2a22;padding:20px 22px 24px;font-family:Georgia,"Songti SC","SimSun",serif;
  line-height:1.95;font-size:13.5px;max-height:340px;overflow-y:auto;position:relative;box-shadow:inset 0 0 26px rgba(120,90,40,.18)}
.bj-bookframe .book h4{text-align:center;font-size:15px;margin-bottom:10px;letter-spacing:1px}
.bj-bookframe .book .chap{font-size:15px;font-weight:700;margin-bottom:10px;letter-spacing:1px}
.bj-bookframe .book p{margin-bottom:10px;text-align:justify}
.bj-bookframe .book p.lead::first-letter{font-size:30px;font-weight:700;float:left;line-height:1;padding:3px 6px 0 0;color:#8f6f2f}
.bj-bookframe .pages{text-align:center;color:#e8d9bd;font-size:9px;letter-spacing:4px;padding-top:6px}

/* ---- 报纸框 ---- */
.bj-paperframe{background:#e9e4d8;padding:12px}
.bj-paperframe .news{background:#f4efe3;color:#2e2a22;padding:14px 16px;font-family:Georgia,"SimSun",serif;max-height:340px;overflow-y:auto}
.bj-paperframe .news .mast{text-align:center;border-bottom:3px double #4a4436;padding-bottom:6px;margin-bottom:4px}
.bj-paperframe .news .mast .nm{font-size:20px;font-weight:900;letter-spacing:6px;font-family:"SimSun",serif}
.bj-paperframe .news .mast .dt{font-size:10px;color:#6a6353;letter-spacing:1px}
.bj-paperframe .news h5{text-align:center;font-size:14.5px;margin:8px 0;line-height:1.5}
.bj-paperframe .news .cols{column-count:2;column-gap:18px;column-rule:1px solid #cfc7b4;font-size:12.5px;line-height:1.85;text-align:justify}
.bj-paperframe .news .cols p{margin-bottom:8px}

/* ---- 画布框 ---- */
.bj-canvasframe{background:linear-gradient(135deg,#d9c48a,#a8874a 25%,#e6d29a 50%,#8f6f2f 75%,#d9c48a);padding:14px}
.bj-canvasframe .canvasinner{background:repeating-linear-gradient(45deg,#f2ecdd,#f2ecdd 3px,#ece5d3 3px,#ece5d3 6px);padding:10px;text-align:center}
.bj-canvasframe .canvasinner img{max-width:100%;max-height:300px;display:block;margin:0 auto}
.bj-canvasframe .canvasinner .nofoto{padding:40px 16px;color:#8d8265;font-size:12px;line-height:1.7}
.bj-canvasframe .plateline{display:flex;justify-content:center;padding-top:10px}
.bj-canvasframe .plate{background:linear-gradient(#f4efe2,#e6dfcd);border:1px solid #b6a97f;border-radius:3px;padding:6px 18px;font-family:Georgia,serif;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.25)}
.bj-canvasframe .plate .pt{font-size:12.5px;font-weight:700;color:#4a4030}
.bj-canvasframe .plate .pm{font-size:10px;color:#7a6f57;margin-top:2px}

/* ---- 弹层（AFR主题） ---- */
.bj-overlay{position:fixed;inset:0;background:rgba(30,30,45,.5);z-index:100;display:flex;align-items:center;justify-content:center}
.bj-overlay.hidden{display:none}
.bj-dialog{background:var(--bg-panel);border-radius:12px;width:560px;max-width:94vw;max-height:92vh;overflow-y:auto;padding:20px 22px;box-shadow:0 16px 40px rgba(0,0,0,.3);color:var(--text-body)}
.bj-dialog h3{font-size:15px;margin-bottom:12px;color:var(--color-primary-text-dark)}
.bj-flabel{font-size:12px;font-weight:600;color:var(--text-tertiary);margin:10px 0 4px;display:block}
.bj-finput,.bj-farea,.bj-fselect{width:100%;border:1px solid var(--border-color);border-radius:8px;padding:8px 11px;font-size:13px;font-family:inherit;background:var(--bg-panel);color:var(--text-body)}
.bj-finput:focus,.bj-farea:focus{outline:none;border-color:var(--color-primary)}
.bj-farea{min-height:90px;resize:vertical;line-height:1.7}
.bj-frow{display:flex;gap:10px}.bj-frow>div{flex:1}
.bj-typegrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.bj-typecard{border:1.5px solid var(--border-color);border-radius:10px;padding:10px 6px;text-align:center;cursor:pointer;font-size:12px;color:var(--text-body)}
.bj-typecard .ico{font-size:22px;display:block;margin-bottom:4px}
.bj-typecard.active{border-color:var(--color-primary);background:var(--color-primary-bg-soft);box-shadow:0 0 0 2px var(--color-primary-border)}
.bj-dlgactions{display:flex;gap:8px;margin-top:16px;align-items:center}
.bj-hintline{font-size:11px;color:var(--text-tertiary);line-height:1.6;margin-top:4px}
.bj-foot{text-align:center;font-size:11px;color:var(--text-tertiary);padding:14px 0 26px;line-height:1.9}
[hidden]{display:none!important}

/* ---- 语料本抽屉 ---- */
#bjNotebook .bj-dialog{width:480px}
.bj-nb-item{display:flex;justify-content:space-between;gap:10px;border-bottom:1px dashed var(--border-color-light);padding:7px 2px;font-size:13px;align-items:baseline}
.bj-nb-item b{color:var(--text-primary)}
.bj-nb-item .mn{color:var(--text-tertiary);font-size:12px}
`;
})();
