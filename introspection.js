/* ============================================================
   参省 · Introspection 板块（introspection.js）v0.2
   四卡：📊得分概览 → ❌错题归因 → 📝得失总结 → 🎯行动计划
   双模式：🧑‍🎓学生填写 / 👩‍🏫教师批阅；数据按 试卷×学生 存档于 localStorage 'AFR-cansx-v1'
   得分概览自动读取 AFR IndexedDB（afr-database → homeworks/meta）
   ============================================================ */
(function () {
  'use strict';

  const LS_KEY = 'AFR-cansx-v1';
  const VIEW_IDS = ['preludeView', 'scoresView', 'reviewView', 'mindmapView', 'knowledgeView'];
  const MUTEX_IDS = VIEW_IDS.concat(['essayView', 'bojianView']);

  const TYPES = [
    { key: 'listening', name: '听力', max: 30 },
    { key: 'reading', name: '阅读理解', max: 50 },
    { key: 'five7', name: '七选五', max: 12.5 },
    { key: 'cloze', name: '完形填空', max: 15 },
    { key: 'gapfill', name: '语法填空', max: 15 },
    { key: 'writing', name: '应用文', max: 15 },
    { key: 'cont', name: '读后续写', max: 25 }
  ];
  const KNOW_OPTS = ['生词、短语不认识', '长难句结构看不懂', '语法知识点掌握不牢', '话题背景文化知识欠缺', '写作句型、素材储备不足'];
  const HABIT_OPTS = ['审题粗心，漏看题干限定信息', '阅读定位慢，做题时间分配不合理', '主观题表达不规范', '心态紧张，读题浮躁', '读后续写情节逻辑构思不足'];
  const RES_OPTS = [
    { key: 'bojian', label: '去【博见】看本卷语篇文化拓展' },
    { key: 'knowledge', label: '去【Knowledge】过知识点清单' },
    { key: 'scores', label: '去【Scores】再复盘成绩明细' }
  ];

  let db = null;
  let curStudent = '';
  let mode = 'stu';
  let teaViewStudent = '';
  let inited = false;
  let shown = false;
  let guardUntil = 0;
  let scoreRows = [];
  let scoreQuestions = [];   /* 题目对象（含每题满分score），分项成绩聚合用 */
  let scorePaperName = '';

  function curPaper() { return db.papers.find(p => p.id === db.cur) || db.papers[0]; }

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = p => (p || 'x') + Date.now().toString(36) + Math.floor(Math.random() * 999);
  const nowStr = () => new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(db)); } catch (e) { } }
  function blankRec() {
    return { total: '', rank: '', types: {}, know: [], habit: [], custom: '', gain: '', weak: '',
      planShort: '', planRes: [], planCheck: '', submitted: false, submitTime: '', teacherReply: '', replyTime: '' };
  }
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(LS_KEY); } catch (e) { }
    if (raw) {
      try {
        db = JSON.parse(raw);
        if (db && Array.isArray(db.papers) && db.recs) { if (!db.notebook) db.notebook = []; if (db.curSec) curSec = db.curSec; return; }
      } catch (e) { }
    }
    db = { papers: [{ id: 'p-demo', name: '高三上开学检测', date: '2026-09' }], cur: 'p-demo', recs: {}, mode: 'stu', notebook: [] };
    save();
  }
  function paperRec(paperId, stu) {
    if (!db.recs[paperId]) db.recs[paperId] = {};
    if (!db.recs[paperId][stu]) db.recs[paperId][stu] = blankRec();
    return db.recs[paperId][stu];
  }
  function findStuRecs(stu) {
    const out = [];
    db.papers.forEach(p => { const r = db.recs[p.id] && db.recs[p.id][stu]; if (r) out.push({ paper: p.name, paperId: p.id, rec: r }); });
    return out;
  }

  function readAfrScores() {
    /* 竞速兜底：IndexedDB事务偶发挂起时6秒后放行（沿用已读scoreRows），保证选人链路必达 */
    return Promise.race([
      new Promise(res => setTimeout(() => res(), 6000)),
      new Promise(res => {
      try {
        const req = indexedDB.open('afr-database');
        req.onsuccess = () => {
          try {
            const tx = req.result.transaction(['homeworks', 'meta']);
            const getHw = tx.objectStore('homeworks').getAll();
            const getMeta = tx.objectStore('meta').get('appState');
            tx.oncomplete = () => {
              try {
                const hws = getHw.result || [];
                const meta = getMeta.result || {};
                const app = typeof meta === 'object' ? meta : {};
                const hasScores = x => x.scores && Object.values(x.scores).some(a => Array.isArray(a) && a.length);
                const scored = hws.filter(hasScores);
                const hw = (app.currentHomework && hws.find(x => x.id === app.currentHomework && hasScores(x))) || scored[0] || hws[0];
                if (!hw) { res(); return; }
                scorePaperName = hw.name || '';
                const cls = app.currentClass || 'class9';
                const rows = (hw.scores && (hw.scores[cls] || hw.scores.class9 || hw.scores.class11)) || [];
                scoreRows = rows.map(r => ({ name: r.name, score: r.score, rank: r.rank, questionScores: r.questionScores || {} })).filter(r => r.name);
                scoreQuestions = (hw.questions && (hw.questions[cls] || hw.questions.class9)) || [];
                res();
              } catch (e) { console.log('[参省诊断] 异常: ' + e.message); res(); }
            };
            getHw.onerror = () => { res(); };
            getMeta.onerror = () => { res(); };
          } catch (e) { console.log('[参省诊断] tx异常: ' + e.message); res(); }
        };
        req.onerror = () => { res(); };
        req.onblocked = () => { res(); };
      } catch (e) { res(); }
      })
    ]);
  }
  function autoScoreOf(stu) { return scoreRows.find(r => r.name === stu) || null; }

  /* 题号 → 七题型分桶（标准高考卷号段；主观题66应用文/67续写） */
  function bucketOf(qNum) {
    if (qNum >= 1 && qNum <= 20) return 'listening';
    if (qNum >= 21 && qNum <= 35) return 'reading';
    if (qNum >= 36 && qNum <= 40) return 'five7';
    if (qNum >= 41 && qNum <= 55) return 'cloze';
    if (qNum >= 56 && qNum <= 65) return 'gapfill';
    if (qNum === 66) return 'writing';
    if (qNum >= 67) return 'cont';
    return null;
  }

  /* 从成绩行聚合各题型分项得分+满分（questionScores × questions） */
  function typeScoresFromRow(row) {
    const acc = {}, max = {};
    const qs = row.questionScores || {};
    Object.keys(qs).forEach(k => {
      const qNum = parseInt(k);
      const bucket = bucketOf(qNum);
      if (!bucket) return;
      acc[bucket] = (acc[bucket] || 0) + (parseFloat(qs[k]) || 0);
      const q = scoreQuestions.find(x => Number(x.id) === qNum);
      if (q && q.score) max[bucket] = (max[bucket] || 0) + parseFloat(q.score);
    });
    return { acc, max };
  }

  /* 自动同步：把总分/排名/各题型分项写进反思记录 */
  function autoFillFromRow(rec, row) {
    if (!row) return;
    rec.total = String(row.score);
    rec.rank = String(row.rank);
    const { acc, max } = typeScoresFromRow(row);
    Object.keys(acc).forEach(bucket => {
      rec.types[bucket] = {
        score: Math.round(acc[bucket] * 10) / 10,
        max: max[bucket] || (TYPES.find(t => t.key === bucket) || {}).max || ''
      };
    });
  }

  function renderBar() {
    // 顶部仅保留右上角模式切换（统计行/标题文字已按需求移除；靠右由.cx-ph-btns的flex-end实现）
    $('cxBar').innerHTML = `
      <button class="cx-btn ${mode === 'stu' ? 'primary' : ''}" onclick="Cansx.setMode('stu')">🧑‍🎓 学生填写</button>
      <button class="cx-btn ${mode === 'tea' ? 'primary' : ''}" onclick="Cansx.setMode('tea')">👩‍🏫 教师批阅</button>`;
    renderDrawer();
  }
  function renderDrawer() {
    const opts = db.papers.map(x => `<option value="${x.id}" ${x.id === db.cur ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
    $('cxDrawerFoot').innerHTML = `
      <div class="cx-flabel">📂 存档回溯（试卷）</div>
      <select class="cx-fselect" style="font-size:12px" onchange="Cansx.switchPaper(this.value)">${opts}</select>
      <button class="cx-btn mini" style="margin-top:6px;width:100%" onclick="Cansx.newPaper()">＋ 新试卷存档</button>`;
  }
  function stuOptions(sel, list) {
    const p = curPaper();
    const known = Object.keys(db.recs[p.id] || {});
    const names = [...new Set(list.concat(scoreRows.map(r => r.name)).concat(known))];
    return names.map(n => `<option ${n === sel ? 'selected' : ''}>${esc(n)}</option>`).join('');
  }

  function renderContent() {
    const box = $('cxContent');
    const p = curPaper();
    if (mode === 'tea') {
      const stus = Object.keys(db.recs[p.id] || {}).sort();
      if (!stus.length) {
        box.innerHTML = `<div class="cx-empty">本卷还没有学生的反思记录。<br>切到「学生填写」模式选一位学生开始，或让学生在填好后告知你。</div>`;
        return;
      }
      const stu = teaViewStudent && db.recs[p.id][teaViewStudent] ? teaViewStudent : stus[0];
      const rec = db.recs[p.id][stu];
      box.innerHTML = `
        <div class="cx-titlebar">
          <span class="cx-t-ico">👩‍🏫</span>
          <span class="cx-t-name">教师批阅 · ${esc(p.name)}</span>
          <span class="cx-hspace"></span>
          <select class="cx-fselect" style="max-width:200px" onchange="Cansx.setTeaView(this.value)">
            ${stus.map(x => `<option ${x === stu ? 'selected' : ''}>${esc(x)}</option>`).join('')}
          </select>
        </div>
        ${teaHTML(stu, rec)}`;
      return;
    }
    if (!curStudent) curStudent = scoreRows[0] ? scoreRows[0].name : '';
    const rec = curStudent ? paperRec(p.id, curStudent) : blankRec();
    const auto = curStudent ? autoScoreOf(curStudent) : null;
    const autoChip = auto
      ? `<span class="cx-chip ok">✓ 已匹配成绩：总分 ${auto.score} · 班级排名 ${auto.rank}</span>`
      : `<span class="cx-chip warn">未在成绩表匹配到该生——总分位次请手动填写</span>`;
    box.innerHTML = `
      <div class="cx-titlebar">
        <span class="cx-t-ico">🧑‍🎓</span>
        <span class="cx-t-name">学生：${esc(curStudent || '（未选择）')}</span>
        <span id="cxAutoChip">${autoChip}</span>
        <span style="flex:1"></span>
        <span class="cx-status ${rec.submitted ? 'ok' : ''}">${rec.submitted ? '✓ 已提交 · ' + esc(rec.submitTime) : '填写中'}</span>
      </div>
      ${card1HTML(rec, auto)}
      ${card2HTML(rec)}
      ${card3HTML(rec)}
      ${card4HTML(rec)}
      <div class="cx-actions">
        <button class="cx-btn" onclick="Cansx.exportSheet()">📋 导出反思单</button>
        <span style="flex:1"></span>
        <button class="cx-btn primary" onclick="Cansx.submit()">${rec.submitted ? '✓ 重新提交' : '提交反思'}</button>
      </div>`;
  }

  function scoreRow(rec) {
    return TYPES.map(tp => {
      const v = (rec.types[tp.key] || {}).score || '';
      const m = (rec.types[tp.key] || {}).max || tp.max;
      const pct = (v !== '' && m) ? Math.max(0, Math.min(100, Math.round(v / m * 100))) : null;
      return { key: tp.key, name: tp.name, v, m, pct };
    });
  }
  function radarSVG(rows) {
    const pts = rows.filter(r => r.pct != null);
    if (pts.length < 3) return '';
    const R = 86, cx = 130, cy = 118;
    const ang = i => (Math.PI * 2 * i) / rows.length - Math.PI / 2;
    const pos = (i, r) => [cx + Math.cos(ang(i)) * r, cy + Math.sin(ang(i)) * r];
    let grid = '';
    [0.33, 0.66, 1].forEach(k => {
      const ring = rows.map((_, i) => pos(i, R * k).join(',')).join(' ');
      grid += `<polygon points="${ring}" fill="none" stroke="var(--border-color-light)" stroke-width="1"/>`;
    });
    const axes = rows.map((_, i) => {
      const [x, y] = pos(i, R);
      return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--border-color-light)" stroke-width="1"/>`;
    }).join('');
    const poly = pts.map(r => {
      const i = rows.indexOf(r);
      return pos(i, R * r.pct / 100).map(v => v.toFixed(1)).join(',');
    }).join(' ');
    const dots = pts.map(r => {
      const i = rows.indexOf(r);
      const [x, y] = pos(i, R * r.pct / 100);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" fill="var(--color-primary)"/>`;
    }).join('');
    const labels = rows.map((r, i) => {
      const [x, y] = pos(i, R + 15);
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="9.5" text-anchor="middle" fill="var(--text-secondary)">${esc(r.name.slice(0, 4))}</text>`;
    }).join('');
    return `<svg class="cx-radar" width="260" height="236" viewBox="0 0 260 236">
      ${grid}${axes}
      <polygon points="${poly}" fill="var(--color-primary-bg-soft)" stroke="var(--color-primary)" stroke-width="2" stroke-linejoin="round" opacity=".92"/>
      ${dots}${labels}
    </svg>`;
  }
  function card1HTML(rec, auto) {
    const rows = scoreRow(rec);
    const filled = rows.filter(r => r.pct != null);
    let best = null, worst = null;
    filled.forEach(r => { if (!best || r.pct > best.pct) best = r; if (!worst || r.pct < worst.pct) worst = r; });
    const inputs = rows.map(r => `
      <div class="cx-srow">
        <span class="cx-sname">${r.name}</span>
        <input class="cx-finput cx-mini" type="number" step="0.5" min="0" value="${r.v}" placeholder="得分"
          oninput="Cansx.setType('${r.key}', this.value, this.parentNode.querySelector('.cx-mmax').value)">
        <span class="cx-slash">/</span>
        <input class="cx-finput cx-mini cx-mmax" type="number" step="0.5" min="1" value="${r.m}"
          oninput="Cansx.setType('${r.key}', this.parentNode.querySelector('.cx-mini:not(.cx-mmax)').value, this.value)">
        <div class="cx-sbar"><div class="cx-sbar-in" style="width:${r.pct == null ? 0 : r.pct}%"></div></div>
        <span class="cx-spct">${r.pct == null ? '' : r.pct + '%'}</span>
      </div>`).join('');
    const radar = radarSVG(rows);
    const guide = best && worst
      ? `<div class="cx-guide">💡 引导：<b>${esc(best.name)}</b>（${best.pct}%）目前是你的优势板块，<b>${esc(worst.name)}</b>（${worst.pct}%）是薄弱板块——后续归因和计划，优先围绕薄弱板块展开。</div>`
      : `<div class="cx-guide">💡 填入各题型得分后，这里会自动标出你的优势与薄弱板块。</div>`;
    const autoHtml = auto
      ? `<span class="cx-chip ok">✓ 已匹配成绩：总分 ${auto.score} · 班级排名 ${auto.rank}</span>`
      : `<div class="cx-frow"><div><label class="cx-flabel">总分</label><input class="cx-finput cx-mini" value="${esc(rec.total)}" oninput="Cansx.setRec('total', this.value)"></div>
         <div><label class="cx-flabel">班级排名</label><input class="cx-finput cx-mini" value="${esc(rec.rank)}" oninput="Cansx.setRec('rank', this.value)"></div></div>`;
    const arc = findStuRecs(curStudent);
    const arcHtml = arc.length > 1
      ? `<div class="cx-arc"><div class="cx-arc-t">📂 我的反思成长轨迹</div>${arc.map(a =>
          `<span class="cx-arc-item ${a.rec.submitted ? '' : 'draft'}">${esc(a.paper)} · ${a.rec.submitted ? '已提交' : '填写中'}${a.rec.total ? ' · 总分 ' + esc(a.rec.total) : ''}</span>`).join('')}</div>`
      : '';
    return `
    <section class="cx-card">
      <div class="cx-card-h">📊 得分概览 <span class="cx-card-tip">数据自动读取成绩表——看看你的强项与短板</span></div>
      <div class="cx-ov-top">
        <div class="cx-ov-left">
          <div class="cx-auto">${autoHtml}</div>
          <div class="cx-srows">${inputs}</div>
        </div>
        <div class="cx-ov-right" id="cxRadar">${radar || '<div class="cx-radar-empty">填入 ≥3 项得分<br>生成雷达简图</div>'}</div>
      </div>
      ${guide}
      ${arcHtml}
      <div class="cx-guide-q">❓ 想一想：本次测试，哪一个题型是你的<b>优势板块</b>？哪一个是<b>薄弱板块</b>？</div>
    </section>`;
  }

  function card2HTML(rec) {
    const group = (opts, bucket) => opts.map(o => {
      const on = rec[bucket].indexOf(o) > -1;
      return `<label class="cx-attr-opt ${on ? 'on' : ''}">
        <input type="checkbox" ${on ? 'checked' : ''} onchange="Cansx.toggleAttr('${bucket}', this.checked, '${esc(o)}')">${esc(o)}</label>`;
    }).join('');
    return `
    <section class="cx-card">
      <div class="cx-card-h">❌ 错题归因 <span class="cx-card-tip">勾选失分原因（可多选）——个性化补充写在下方</span></div>
      <div class="cx-attr-t">🔹 知识层面</div>
      <div class="cx-attr-g">${group(KNOW_OPTS, 'know')}</div>
      <div class="cx-attr-t">🔹 应试能力 &amp; 习惯层面</div>
      <div class="cx-attr-g">${group(HABIT_OPTS, 'habit')}</div>
      <label class="cx-flabel">✍ 典型错题自评（写出本次试卷最典型的 2-3 道错题，简单写下错因）</label>
      <textarea class="cx-farea" placeholder="例：完形第44题——辨析 spend/cost/pay；阅读33题——定位到末段但理解偏差……" oninput="Cansx.setRec('custom', this.value)">${esc(rec.custom)}</textarea>
    </section>`;
  }

  function card3HTML(rec) {
    return `
    <section class="cx-card">
      <div class="cx-card-h">📝 得失总结 <span class="cx-card-tip">不只盯着错误，也看见自己的进步</span></div>
      <label class="cx-flabel">✅ 本次收获（做得好的地方：技巧见效 / 卷面稳定 / 时间把控进步……）</label>
      <textarea class="cx-farea" placeholder="例：阅读定位技巧见效，两道推断题都是先看题干再回原文找依据……" oninput="Cansx.setRec('gain', this.value)">${esc(rec.gain)}</textarea>
      <label class="cx-flabel">⚠️ 现存短板（最亟待解决的一个问题）</label>
      <textarea class="cx-farea" placeholder="例：完形正确率不稳定，遇到熟词僻义就慌……" oninput="Cansx.setRec('weak', this.value)">${esc(rec.weak)}</textarea>
    </section>`;
  }

  function card4HTML(rec) {
    const resBoxes = RES_OPTS.map(r => {
      const on = rec.planRes.indexOf(r.key) > -1;
      return `<label class="cx-res-opt ${on ? 'on' : ''}">
        <input type="checkbox" ${on ? 'checked' : ''} onchange="Cansx.toggleRes('${r.key}', this.checked)">${esc(r.label)}</label>`;
    }).join('');
    const reply = rec.teacherReply
      ? `<div class="cx-t-reply"><div class="hd">👩‍🏫 教师批注 · ${esc(rec.replyTime || '')}</div><div class="tx">${esc(rec.teacherReply)}</div></div>`
      : `<div class="cx-t-reply empty">💬 教师批注区——提交后教师会在这里写下评语与建议。</div>`;
    return `
    <section class="cx-card">
      <div class="cx-card-h">🎯 行动计划 <span class="cx-card-tip">目标要可落地、可检测——拒绝空泛口号</span></div>
      <label class="cx-flabel">1️⃣ 短期目标（下次小测前，针对薄弱题型的具体行动）</label>
      <textarea class="cx-farea" style="min-height:64px" placeholder="例：每天精读 1 篇完形，积累 10 个话题词汇；每周两篇读后续写限时构思……" oninput="Cansx.setRec('planShort', this.value)">${esc(rec.planShort)}</textarea>
      <label class="cx-flabel">2️⃣ 学习资源选择（勾选后可从顶部对应板块进入）</label>
      <div class="cx-res">${resBoxes}
        <input class="cx-finput" placeholder="其他自定义资源……" value="${esc((rec.planRes || []).filter(x => x.startsWith('other:')).map(x => x.slice(6))[0] || '')}" oninput="Cansx.setOtherRes(this.value)">
      </div>
      <label class="cx-flabel">3️⃣ 自我监测方式（如何检验自己是否改进）</label>
      <input class="cx-finput" placeholder="例：同类题型限时训练，每次记录正确率" value="${esc(rec.planCheck)}" oninput="Cansx.setRec('planCheck', this.value)">
      <div class="cx-t-reply-wrap">${reply}</div>
    </section>`;
  }

  window.Cansx = {
    show,
    setMode(m) { mode = m; renderBar(); renderContent(); },
    setTeaView(n) { teaViewStudent = n; renderContent(); },
    pickStudent(n) {
      curStudent = n.trim();
      if (!curStudent) { renderContent(); return; }
      /* 选人即重读成绩（刚导入的也能匹配），自动同步总分/位次/各题型分项 */
      readAfrScores().then(() => {
        const rec = paperRec(curPaper().id, curStudent);
        autoFillFromRow(rec, autoScoreOf(curStudent));
        renderBar(); renderContent(); save();
      });
    },
    setRec(k, v) { if (!curStudent) return; const r = curRecSafe(); r[k] = v; save(); },
    submit() {
      if (!curStudent) return;
      const r = curRecSafe();
      r.submitted = true; r.submitTime = nowStr();
      save(); renderContent();
      alert('反思已提交——教师批阅后，批注会显示在「🎯 行动计划」底部。');
    },
    exportSheet() {
      if (!curStudent) return;
      const r = curRecSafe();
      const p = curPaper();
      const L = [];
      L.push('参省 · 测后自我反思单');
      L.push('试卷：' + p.name + '　学生：' + curStudent + (r.submitTime ? '　提交：' + r.submitTime : ''));
      if (r.total || r.rank) L.push('总分/排名：' + (r.total || '—') + (r.rank ? ' / 班级第 ' + r.rank : ''));
      L.push('');
      L.push('【各题型得分】');
      scoreRow(r).forEach(x => { if (x.v !== '') L.push('  ' + x.name + '：' + x.v + ' / ' + x.m + (x.pct != null ? '（' + x.pct + '%）' : '')); });
      L.push('');
      L.push('【错题归因·知识层面】' + ((r.know || []).join('；') || '—'));
      L.push('【错题归因·应试习惯】' + ((r.habit || []).join('；') || '—'));
      if (r.custom) L.push('【典型错题自评】' + r.custom);
      L.push('');
      L.push('【本次收获】' + (r.gain || '—'));
      L.push('【现存短板】' + (r.weak || '—'));
      L.push('');
      L.push('【短期目标】' + (r.planShort || '—'));
      L.push('【学习资源】' + ((r.planRes || []).join('；') || '—'));
      L.push('【自我监测】' + (r.planCheck || '—'));
      if (r.teacherReply) L.push('');
      if (r.teacherReply) L.push('【教师批注】' + r.teacherReply);
      const text = L.join('\n');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => alert('反思单已复制到剪贴板——可粘贴到错题本/Word'), () => alert(text));
      } else alert(text);
    },
    switchPaper(id) {
      if (id && id !== db.cur) { db.cur = id; renderDrawer(); renderBar(); renderContent(); save(); }
    },
    goto(target) {
      const hv = document.getElementById('cansxView');
      if (hv) hv.classList.add('hidden');
      guardUntil = Date.now() + 3000;   /* 跳转离开参省，守卫窗防回藏 */
      if (target === 'bojian' && window.Bojian) { Bojian.show(); return; }
      if (window.AFR && AFR.switchView) AFR.switchView(target);
    },
    newPaper() {
      const name = prompt('新试卷存档名称：', '未命名试卷 ' + new Date().toISOString().slice(5, 10));
      if (!name) return;
      const id = uid('p');
      db.papers.unshift({ id, name, date: new Date().toISOString().slice(5, 10) });
      db.cur = id;
      renderDrawer(); renderBar(); renderContent(); save();
    },
    setType(key, score, max) {
      if (!curStudent) return;
      const r = curRecSafe();
      r.types = r.types || {};
      const m = parseFloat(max) || 0, v = score === '' ? '' : parseFloat(score);
      r.types[key] = { score: v === '' || isNaN(v) ? '' : v, max: m };
      save(); updateScoreViz(r);
    },
    toggleAttr(bucket, on, opt) {
      if (!curStudent) return;
      const r = curRecSafe();
      r[bucket] = r[bucket] || [];
      const i = r[bucket].indexOf(opt);
      if (on && i === -1) r[bucket].push(opt);
      if (!on && i > -1) r[bucket].splice(i, 1);
      save(); renderContent();
    },
    toggleRes(key, on) {
      if (!curStudent) return;
      const r = curRecSafe();
      r.planRes = r.planRes || [];
      const i = r.planRes.indexOf(key);
      if (on && i === -1) r.planRes.push(key);
      if (!on && i > -1) r.planRes.splice(i, 1);
      save(); renderContent();
    },
    setOtherRes(v) {
      if (!curStudent) return;
      const r = curRecSafe();
      r.planRes = (r.planRes || []).filter(x => x !== 'other' && !x.startsWith('other:'));
      if (v.trim()) r.planRes.push('other:' + v.trim());
      save();
    },
    saveReply(stu) {
      const rec = paperRec(curPaper().id, stu);
      rec.teacherReply = ($('cxTeaReply') || {}).value || '';
      rec.replyTime = nowStr();
      save(); renderContent();
    }
  };

  function renderStuBar() {
    const bar = $('cxStuBar');
    if (!bar) return;
    const roster = scoreRows.map(r => r.name);
    const rosterChip = roster.length
      ? `<span class="cx-chip ok">✓ 已识别名单 ${roster.length} 人</span>`
      : `<span class="cx-chip warn">未读取到成绩名单——请先在 Scores 导入成绩表</span>`;
    if (mode === 'tea') { bar.innerHTML = `<span class="cx-lab">👩‍🏫 批阅模式：右侧选择学生查看反思并写批注</span>${rosterChip}`; return; }
    const opts = roster.map(n => `<option value="${esc(n)}">`).join('');
    bar.innerHTML = `
      <span class="cx-lab">🧑‍🎓 我是谁：</span>
      <input class="cx-finput" style="max-width:220px" list="cxStuDatalist" placeholder="输入姓名（导入成绩后可直接下拉选）"
        value="${esc(curStudent)}" onchange="Cansx.pickStudent(this.value)">
      <datalist id="cxStuDatalist">${opts}</datalist>
      ${rosterChip}
      <span style="flex:1"></span>
      <button class="cx-btn" onclick="Cansx.exportSheet()">📋 导出反思单</button>`;
  }
  function curRecSafe() { return curStudent ? paperRec(curPaper().id, curStudent) : blankRec(); }

  function renderAll() { renderDrawer(); renderBar(); renderContent(); }

  /* 外科手术式更新得分可视化（不重绘输入框，避免打字竞态） */
  function updateScoreViz(rec) {
    const rows = scoreRow(rec);
    document.querySelectorAll('#cxContent .cx-srow').forEach((rowEl, i) => {
      if (i >= rows.length) return;
      const r = rows[i];
      const bar = rowEl.querySelector('.cx-sbar-in');
      const pct = rowEl.querySelector('.cx-spct');
      if (bar) bar.style.width = (r.pct == null ? 0 : r.pct) + '%';
      if (pct) pct.textContent = r.pct == null ? '' : r.pct + '%';
    });
    const radar = document.getElementById('cxRadar');
    if (radar) radar.innerHTML = radarSVG(rows) || '<div class="cx-radar-empty">填入 ≥3 项得分<br>生成雷达简图</div>';
    const filled = rows.filter(r => r.pct != null);
    let best = null, worst = null;
    filled.forEach(r => { if (!best || r.pct > best.pct) best = r; if (!worst || r.pct < worst.pct) worst = r; });
    const g = document.getElementById('cxGuide');
    if (g) {
      if (best && worst) {
        g.innerHTML = '💡 引导：<b>' + esc(best.name) + '</b>（' + best.pct + '%）目前是你的优势板块，<b>' + esc(worst.name) + '</b>（' + worst.pct + '%）是薄弱板块——后续归因和计划，优先围绕薄弱板块展开。';
      } else {
        g.innerHTML = '💡 填入各题型得分后，这里会自动标出你的优势与薄弱板块。';
      }
    }
  }

  function teaHTML(stu, rec) {
    const rows = scoreRow(rec);
    return `
    <div class="cx-card">
      <div class="cx-card-h">📊 得分概览 · ${esc(stu)}</div>
      <div class="cx-srows">${rows.map(r => `
        <div class="cx-srow"><span class="cx-sname">${r.name}</span>
          <div class="cx-sbar"><div class="cx-sbar-in" style="width:${r.pct == null ? 0 : r.pct}%"></div></div>
          <span class="cx-spct">${r.v === '' ? '未填' : r.v + '/' + r.m}</span>
        </div>`).join('')}</div>
    </div>
    <div class="cx-card">
      <div class="cx-card-h">❌ 错题归因</div>
      <div class="cx-attr-view">🔹 知识层面：${(rec.know || []).length ? esc(rec.know.join('；')) : '<i>未勾选</i>'}</div>
      <div class="cx-attr-view">🔹 应试习惯：${(rec.habit || []).length ? esc(rec.habit.join('；')) : '<i>未勾选</i>'}</div>
      ${rec.custom ? `<div class="cx-attr-view">✍ 典型错题：${esc(rec.custom)}</div>` : ''}
    </div>
    <div class="cx-card">
      <div class="cx-card-h">📝 得失总结</div>
      <div class="cx-attr-view">✅ 本次收获：${esc(rec.gain) || '<i>未填写</i>'}</div>
      <div class="cx-attr-view">⚠️ 现存短板：${esc(rec.weak) || '<i>未填写</i>'}</div>
    </div>
    <div class="cx-card">
      <div class="cx-card-h">🎯 行动计划</div>
      <div class="cx-attr-view">1️⃣ 短期目标：${esc(rec.planShort) || '<i>未填写</i>'}</div>
      <div class="cx-attr-view">2️⃣ 学习资源：${esc((rec.planRes || []).join('；')) || '<i>未选</i>'}</div>
      <div class="cx-attr-view">3️⃣ 自我监测：${esc(rec.planCheck) || '<i>未填写</i>'}</div>
    </div>
    <div class="cx-card cx-teacher-card">
      <div class="cx-card-h">💬 教师批注 <span class="cx-card-tip">写下评语后保存——学生的行动计划卡底部会显示</span></div>
      <textarea class="cx-farea" id="cxTeaReply" placeholder="写下评语、鼓励或个性化建议……">${esc(rec.teacherReply)}</textarea>
      <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
        <button class="cx-btn primary" onclick="Cansx.saveReply('${esc(stu)}')">保存批注</button>
        ${rec.replyTime ? `<span class="cx-lab">上次批注：${esc(rec.replyTime)}</span>` : ''}
      </div>
    </div>`;
  }

  function init() {
    if (inited) return; inited = true;
    load();
    const host = document.getElementById('cansxView');
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    host.innerHTML = `
    <div class="cx-app" id="cxApp">
      <nav class="cx-drawer" id="cxDrawer">
        <div class="cx-drawer-list">
          <div class="cx-nav-h">复盘四卡</div>
          <div class="cx-navitem static">📊 得分概览</div>
          <div class="cx-navitem static">❌ 错题归因</div>
          <div class="cx-navitem static">📝 得失总结</div>
          <div class="cx-navitem static">🎯 行动计划</div>
          <div class="cx-nav-h" style="margin-top:14px">关联跳转</div>
          <button class="cx-navlink" onclick="Cansx.goto('scores')">📊 Scores 成绩</button>
          <button class="cx-navlink" onclick="Cansx.goto('bojian')">🖼 博见 拓展</button>
          <button class="cx-navlink" onclick="Cansx.goto('knowledge')">📝 Knowledge 知识</button>
        </div>
        <div class="cx-drawer-foot" id="cxDrawerFoot"></div>
      </nav>
      <main class="cx-main">
        <div class="cx-pagehead">
          <div class="cx-ph-btns" id="cxBar"></div>
        </div>
        <div class="cx-toolbar" id="cxStuBar"></div>
        <div class="cx-content" id="cxContent"></div>
      </main>
      <div class="cx-overlay hidden" id="cxDlg"></div>
      <div class="cx-foot">
        参省 · 取自《劝学》"君子博学而日参省乎己，则知明而行无过矣"。<br>
        反思按试卷×学生自动存档，形成个人成长档案｜🤖 AI仅汇编排版，内容源于你的填写｜导出的反思单可粘贴到个人错题本
      </div>
    </div>`;
    renderAll();

    /* 顶部让位：视图 inset:0 以 .main-content 为定位基准（自身已在主头部之下），
       不能再叠加头部高度，否则顶部多出一条头部高的空白。
       本文件与 essay-review.js 均会注入 .main-content{position:relative}（幂等）。
       左侧抽屉是 fixed 定位（基准=视口），仍需按主头部实际高度让位。
       注意不能用 offsetParent 判断视图归属——init 时视图还处于 hidden（display:none），offsetParent 恒为 null。 */
    const fitTop = () => {
      const h = (document.querySelector('.header') || {}).offsetHeight || 0;
      const hv = document.getElementById('cansxView');
      if (hv) {
        const mc = hv.parentElement;
        const insideMain = !!(mc && mc.classList.contains('main-content') && getComputedStyle(mc).position !== 'static');
        hv.style.top = insideMain ? '0px' : h + 'px';
      }
      const dr = document.getElementById('cxDrawer');
      if (dr) dr.style.top = h + 'px';
    };
    fitTop();
    window.addEventListener('resize', fitTop);

    const obs = new MutationObserver(() => {
      const otherVisible = MUTEX_IDS.some(id => {
        const el = document.getElementById(id);
        return el && !el.classList.contains('hidden');
      });
      const hv = document.getElementById('cansxView');
      if (otherVisible && hv && !hv.classList.contains('hidden') && Date.now() > guardUntil) hv.classList.add('hidden');
    });
    MUTEX_IDS.concat(['bojianView']).forEach(id => {
      const el = document.getElementById(id);
      if (el) obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    });
    document.addEventListener('click', e => {
      const tab = e.target.closest && e.target.closest('.view-tab');
      if (tab && tab.dataset.view !== 'cansx') setTimeout(() => { const hv = document.getElementById('cansxView'); if (hv) hv.classList.add('hidden'); }, 0);
    }, true);

    readAfrScores().then(() => { renderBar(); renderStuBar(); renderContent(); });
  }

  function show() {
    init();
    MUTEX_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
    document.querySelectorAll('.view-tab').forEach(t => t.classList.toggle('active', t.dataset.view === 'cansx'));
    const hv = document.getElementById('cansxView');
    hv.classList.remove('hidden');
    window.dispatchEvent(new Event('resize'));
    readAfrScores().then(() => {
      if (curStudent) {
        const rec = paperRec(curPaper().id, curStudent);
        autoFillFromRow(rec, autoScoreOf(curStudent));
      }
      renderBar(); renderStuBar(); renderContent(); save();
    });
  }

  const CSS = `
#cansxView{position:absolute;inset:0;z-index:20;overflow-y:auto;padding:0!important}
.main-content{position:relative}
#cansxView.hidden{display:none}
.cx-app{min-height:100%;background:var(--bg-subtle);color:var(--text-body);font-size:14px;font-family:inherit}
.cx-drawer{position:fixed;left:0;width:216px;top:0;bottom:0;background:var(--bg-panel);border-right:1px solid var(--border-color-light);display:flex;flex-direction:column;z-index:30}
.cx-drawer-title{padding:16px 14px 2px;font-size:20px;font-weight:900;letter-spacing:3px;color:var(--color-primary-text-dark)}
.cx-drawer-title .en{display:block;font-size:10px;color:var(--text-tertiary);letter-spacing:1px;font-weight:400;margin-top:2px}
.cx-drawer-sub{padding:2px 14px 12px;font-size:11px;color:var(--text-tertiary);line-height:1.7;border-bottom:1px solid var(--border-color-light)}
.cx-drawer-sub i{font-style:italic}
.cx-drawer-list{flex:1;overflow-y:auto;padding:10px 10px;display:flex;flex-direction:column;gap:4px}
.cx-nav-h{font-size:10.5px;color:var(--text-tertiary);letter-spacing:1px;padding:2px 4px}
.cx-navitem{padding:10px 12px;border-radius:9px;color:var(--text-secondary);font-size:13px}
.cx-navlink{border:none;background:transparent;text-align:left;border-radius:9px;padding:9px 12px;font-size:12.5px;cursor:pointer;color:var(--text-secondary);width:100%}
.cx-navlink:hover{background:var(--color-primary-bg-soft);color:var(--color-primary-text-dark)}
.cx-drawer-foot{padding:10px 10px 14px;border-top:1px solid var(--border-color-light);display:flex;flex-direction:column;gap:2px}
.cx-main{margin-left:216px;display:flex;flex-direction:column;min-height:100%}
.cx-pagehead{max-width:920px;margin:16px auto 0;padding:0 20px;width:100%}
.cx-ph-btns{display:flex;justify-content:flex-end;align-items:center;gap:8px}
.cx-ph-t{font-size:21px;font-weight:900;color:var(--color-primary-text-dark)}
.cx-ph-t .en{font-size:13px;font-weight:600;color:var(--text-secondary)}
.cx-ph-s{font-size:12px;color:var(--text-tertiary);margin-top:3px}
.cx-toolbar{max-width:920px;margin:12px auto 0;padding:8px 16px;width:100%;background:var(--bg-panel);border:1px solid var(--border-color-light);border-radius:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.cx-lab{font-size:11.5px;color:var(--text-tertiary)}
.cx-stat{font-size:11.5px;color:var(--text-tertiary)}
.cx-content{max-width:920px;margin:12px auto 30px;padding:0 20px;width:100%;display:flex;flex-direction:column;gap:14px}
.cx-card{background:var(--bg-panel);border:1px solid var(--border-color-light);border-radius:12px;padding:16px 20px;box-shadow:0 2px 10px rgba(60,60,90,.07)}
.cx-card-h{font-size:15px;font-weight:800;color:var(--color-primary-text-dark);margin-bottom:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cx-card-tip{font-size:11px;font-weight:400;color:var(--text-tertiary)}
.cx-btn{border:1px solid var(--border-color);background:var(--bg-panel);color:var(--text-secondary);border-radius:var(--radius-base,8px);padding:6px 14px;font-size:12.5px;cursor:pointer;transition:all .15s}
.cx-btn:hover{border-color:var(--color-primary-hover);color:var(--color-primary-hover)}
.cx-btn.primary{background:var(--color-primary);color:var(--text-on-primary);border-color:var(--color-primary);font-weight:600}
.cx-btn.primary:hover{opacity:.9;color:var(--text-on-primary)}
.cx-btn.mini{font-size:11px;padding:2px 9px}
.cx-flabel{font-size:12px;font-weight:600;color:var(--text-secondary);margin:10px 0 4px;display:block}
.cx-finput,.cx-farea,.cx-fselect{width:100%;border:1px solid var(--border-color);border-radius:8px;padding:8px 11px;font-size:13px;font-family:inherit;background:var(--bg-panel);color:var(--text-body)}
.cx-finput:focus,.cx-farea:focus{outline:none;border-color:var(--color-primary)}
.cx-farea{min-height:84px;resize:vertical;line-height:1.8}
.cx-frow{display:flex;gap:10px}.cx-frow>div{flex:1}
.cx-mini{max-width:90px;text-align:center}
.cx-titlebar{display:flex;align-items:center;gap:10px;background:var(--bg-panel);border:1px solid var(--border-color-light);border-left:4px solid var(--color-primary);border-radius:10px;padding:11px 16px;flex-wrap:wrap}
.cx-chip{font-size:11px;border-radius:9px;padding:2px 9px}
.cx-chip.ok{background:var(--color-success-bg,#e9f7ee);color:var(--color-success);border:1px solid var(--color-success-border,#b7e0c3)}
.cx-chip.warn{background:rgba(250,173,20,.12);color:var(--color-warning,#d48806);border:1px solid #ffd666}
.cx-status{font-size:11.5px;color:var(--text-tertiary);border:1px dashed var(--border-color);border-radius:10px;padding:2px 10px}
.cx-status.ok{color:var(--color-success);border-color:var(--color-success-border,#b7e0c3)}
.cx-ov-top{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap}
.cx-ov-left{flex:1;min-width:320px}
.cx-ov-right{flex-shrink:0;border:1px solid var(--border-color-light);border-radius:10px;background:var(--bg-panel);padding:6px}
.cx-radar-empty{width:248px;height:224px;display:flex;align-items:center;justify-content:center;text-align:center;color:var(--text-tertiary);font-size:12px;line-height:2}
.cx-srow{display:flex;align-items:center;gap:8px;margin-bottom:7px}
.cx-sname{width:74px;font-size:12.5px;color:var(--text-secondary);flex-shrink:0}
.cx-slash{color:var(--text-tertiary)}
.cx-sbar{flex:1;height:8px;background:var(--bg-inset);border-radius:5px;overflow:hidden}
.cx-sbar-in{height:100%;background:linear-gradient(90deg,var(--color-primary),var(--color-primary-hover));border-radius:5px}
.cx-spct{width:38px;font-size:11px;color:var(--text-secondary);text-align:right}
.cx-guide{margin-top:10px;font-size:12.5px;line-height:1.8;color:var(--text-secondary);background:var(--color-primary-bg-soft);border-radius:8px;padding:8px 12px}
.cx-guide-q{margin-top:12px;font-size:12.5px;color:var(--text-secondary);border-top:1px dashed var(--border-color);padding-top:10px}
.cx-arc{margin-top:10px}
.cx-arc-t{font-size:11px;color:var(--text-tertiary);margin-bottom:4px}
.cx-arc-item{display:inline-block;font-size:11px;border:1px solid var(--border-color-light);border-radius:12px;padding:2px 10px;margin:0 6px 6px 0;color:var(--text-secondary)}
.cx-arc-item.draft{border-style:dashed;color:var(--text-tertiary)}
.cx-attr-g{margin-bottom:10px}
.cx-attr-t{font-size:12.5px;font-weight:700;color:var(--color-primary-text-dark);margin:8px 0 6px}
.cx-attr-opt{display:inline-flex;align-items:center;gap:6px;border:1.5px solid var(--border-color);border-radius:18px;padding:6px 14px;margin:0 8px 8px 0;font-size:12.5px;cursor:pointer;user-select:none;transition:all .15s}
.cx-attr-opt:hover{border-color:var(--color-primary)}
.cx-attr-opt.on{border-color:var(--color-primary);background:var(--color-primary-bg-soft);color:var(--color-primary-text-dark);font-weight:600}
.cx-attr-opt input{accent-color:var(--color-primary)}
.cx-attr-view{font-size:13px;line-height:1.9;color:var(--text-body);margin-bottom:6px}
.cx-attr-view i{color:var(--text-tertiary)}
.cx-res{display:flex;flex-direction:column;gap:6px}
.cx-res-opt{display:flex;align-items:center;gap:8px;border:1px solid var(--border-color);border-radius:9px;padding:8px 12px;font-size:12.5px;cursor:pointer}
.cx-res-opt:hover{border-color:var(--color-primary)}
.cx-res-opt.on{border-color:var(--color-primary);background:var(--color-primary-bg-soft)}
.cx-res-opt input{accent-color:var(--color-primary)}
.cx-t-reply-wrap{margin-top:14px}
.cx-t-reply{border-left:4px solid var(--color-warning,#faad14);background:rgba(250,173,20,.08);border-radius:0 8px 8px 0;padding:10px 14px}
.cx-t-reply .hd{font-size:12px;font-weight:700;color:var(--color-warning,#d48806);margin-bottom:4px}
.cx-t-reply .tx{font-size:13.5px;line-height:1.8;color:var(--text-body)}
.cx-t-reply.empty{border-left-color:var(--text-tertiary);background:var(--bg-subtle);color:var(--text-tertiary);font-size:12px}
.cx-empty{text-align:center;color:var(--text-tertiary);padding:90px 20px;font-size:13.5px;line-height:2.1}
.cx-foot{text-align:center;font-size:11px;color:var(--text-tertiary);padding:16px 0 26px;line-height:1.9;margin-left:216px}
[hidden]{display:none!important}
@media (max-width:1100px){.cx-drawer{display:none}.cx-main,.cx-foot{margin-left:0}}
`;

  init();
})();
