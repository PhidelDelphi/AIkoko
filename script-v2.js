/**
 * AFR - Assignment Feedback and Review
 * 核心应用逻辑
 */
const AFR = (() => {
    // ===== 全局状态 =====
    let state = {
        currentClass: 'class9',
        currentView: 'prelude',
        currentHomework: null,
        scoreSortMode: 'id',
        hideNames: false,
        remarkMode: false,  // false | 'edit' | 'show'
        gridSortMode: 'number',
        activeTypeFilter: 'all',
        activeQuestionId: null,
        drawingTool: 'select',
        drawingColor: '#f5222d',
        brushSize: 3,
        currentTheme: 'classic',
        knowledgeMode: 'free',
    };

    // ===== 主题系统 =====
    const THEMES = ['classic', 'dark', 'paper', 'vibrant', 'morandi', 'cartoon', 'space', 'forest', 'turquoise', 'marine', 'cream', 'cow', 'graphite', 'salmon'];

    function applyTheme(theme) {
        document.documentElement.dataset.theme = theme;
    }

    function selectTheme(theme) {
        if (!THEMES.includes(theme)) return;
        state.currentTheme = theme;
        applyTheme(theme);
        // 更新菜单active
        document.querySelectorAll('#themeMenu .dropdown-item').forEach(it =>
            it.classList.toggle('active', it.dataset.theme === theme));
        closeAllDropdowns();
        saveAppState();
        notify('Theme switched', 'info');
    }

    function toggleThemeMenu() {
        // 关闭其他菜单（homework/class）
        document.getElementById('homeworkMenu')?.classList.remove('show');
        document.getElementById('classMenu')?.classList.remove('show');
        document.getElementById('homeworkBtn')?.classList.remove('open');
        document.getElementById('classBtn')?.classList.remove('open');
        const menu = document.getElementById('themeMenu');
        const btn = document.getElementById('themeBtn');
        if (menu) menu.classList.toggle('show');
        if (btn) btn.classList.toggle('open');
    }


    // 数据存储
    let homeworks = {};       // { id: { name, date, scores, questions, passages, knowledge, config } }
    let homeworkOrder = [];   // 作业ID列表，保持顺序
    let fabricCanvas = null;

    // ===== 题型范围定义 =====
    const TYPE_RANGES = {
        listening: { min: 1, max: 20, label: 'Listening', key: 'listening' },
        reading:   { min: 21, max: 35, label: 'Reading', key: 'reading' },
        sevenfive: { min: 36, max: 40, label: '5 of 7', key: 'sevenfive' },
        cloze:     { min: 41, max: 55, label: 'Cloze', key: 'cloze' },
        grammar:   { min: 56, max: 65, label: 'Gap-fill', key: 'grammar' },
        applied:   { min: 66, max: 66, label: 'Writing', key: 'applied' },
        writing:   { min: 67, max: 67, label: 'Continuation', key: 'writing' },
    };

    // ===== 正确率难度分级（以Excel"学生明细"表的班级正确率为准） =====
    // 🔴红 难题<60%·详细评讲 | 🟡黄 较难60~70%·快速评讲 | 🔵蓝 一般70~85%·相互讨论 | 🟢绿 简单≥85%·不用评讲
    function getDifficultyByRate(rate) {
        if (rate >= 85) return 'easy';
        if (rate >= 70) return 'medium';
        if (rate >= 60) return 'hard';
        return 'difficult';
    }

    const DIFFICULTY_LABELS = {
        easy: '简单·不用评讲',
        medium: '一般·相互讨论',
        hard: '较难·快速评讲',
        difficult: '难题·详细评讲',
    };

    // ===== 初始化 =====
    // ===== 变式弹窗：Esc关闭 =====
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            const ov = document.getElementById('variantOverlay');
            if (ov && ov.classList.contains('open')) closeVariantPage();
        }
    });

    async function init() {
        await loadDataFromDB();
        if (homeworkOrder.length === 0) {
            // 空数据：尝试检测项目文件夹里的备份，提示一键导入
            const imported = await checkAutoImport();
            // 不自动加载demo——空数据就显示空列表，等用户导入真实数据
        } else {
            // 非空数据也保底检测：若有备份文件，静默检查是否需要导入（避免清库不干净/换电脑数据不全）
            checkAutoImport().catch(() => {});
        }
        if (!state.currentHomework && homeworkOrder.length > 0) {
            state.currentHomework = homeworkOrder[0];
        }
        renderHomeworkMenu();
        renderAll();
        switchView('prelude');   // 默认显示Prelude封面页
        initFabricCanvas();
        setupTodoToggle();
        setupOutlineScrollSpy();
        setupInlineAddHover();
        initSymbolListEnter();
        setupWorkflowKeys();
        setupColumnsEnter();
        setupTableTools();
        setupTableContextMenu();
        setupTableCellSelection();
        setupTableColumnResize();
        setupTableRowResize();
        setupMmSplitter();
        setupMmToolboxSplitter();
        // 评论气泡：点别处/滚动时关闭
        document.addEventListener('mousedown', (e) => {
            if (commentBubble && !commentBubble.contains(e.target) && !e.target.closest('.kn-comment')) closeCommentBubble();
        });
        document.addEventListener('scroll', closeCommentBubble, true);
        setupGlobalClickHandlers();
        setupAudioEvents();
    }

    // 启动检测：扫描项目根目录的 AFR-backup-*.json，提示一键导入
    async function checkAutoImport() {
        // 列出可能的备份文件名（今天、昨天、前天 + 通用名）
        const candidates = [];
        const now = new Date();
        for (let d = 0; d < 7; d++) {  // 近7天
            const date = new Date(now.getTime() - d * 86400000);
            candidates.push(`AFR-backup-${date.toISOString().slice(0, 10)}.json`);
        }
        for (const name of candidates) {
            try {
                // HEAD + 超时保护（4秒），避免大文件/网络问题导致 fetch 挂起
                const ctrl = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), 4000);
                const resp = await fetch(name, { method: 'HEAD', signal: ctrl.signal });
                clearTimeout(timer);
                if (resp.ok) {
                    console.log('[AFR] 检测到备份文件:', name);
                    // 找到备份 → 弹确认框
                    return showAutoImportPrompt(name);
                }
            } catch (e) { /* file 协议 fetch 失败/超时,跳过 */ }
        }
        console.log('[AFR] 未检测到备份文件');
        return false;
    }

    function showAutoImportPrompt(fileName) {
        return new Promise((resolve) => {
            // 半透明遮罩层：确保弹框在任何视图之上可见（含Prelude全屏背景）
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.45);z-index:99998;display:flex;align-items:center;justify-content:center';
            const dialog = document.createElement('div');
            dialog.style.cssText = 'position:relative;background:var(--bg-panel);border:1px solid var(--border-color);border-radius:12px;padding:28px 32px;box-shadow:var(--shadow-elevated);z-index:99999;max-width:420px;text-align:center;font-family:inherit';
            dialog.innerHTML = `
                <div style="font-size:40px;margin-bottom:12px">📥</div>
                <div style="font-size:17px;font-weight:700;color:var(--text-primary);margin-bottom:8px">Detected a backup</div>
                <div style="font-size:13px;color:var(--text-secondary);margin-bottom:20px;line-height:1.5">Found <b>${fileName}</b> in the project folder.<br>Import it to restore your data?</div>
                <div style="display:flex;gap:10px;justify-content:center">
                    <button id="aiYes" style="padding:9px 22px;background:var(--color-primary);color:var(--text-on-primary);border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer">Import</button>
                    <button id="aiNo" style="padding:9px 18px;background:var(--bg-panel);color:var(--text-secondary);border:1px solid var(--border-color);border-radius:6px;font-size:14px;cursor:pointer">Skip</button>
                </div>`;
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            const close = () => overlay.remove();
            dialog.querySelector('#aiYes').onclick = async () => {
                close();
                try {
                    const resp = await fetch(fileName);
                    const backup = JSON.parse(await resp.text());
                    applyBackup(backup);  // 复用导入逻辑
                    resolve(true);
                } catch (e) {
                    notify('Auto-import failed: ' + e.message, 'error');
                    resolve(false);
                }
            };
            dialog.querySelector('#aiNo').onclick = () => { close(); resolve(false); };
        });
    }

    // 全局点击处理：关闭块菜单、关闭主题菜单等
    function setupGlobalClickHandlers() {
        document.addEventListener('click', (e) => {
            // 点击块菜单外部 → 关闭块菜单
            const blockMenu = document.getElementById('blockMenu');
            if (blockMenu && blockMenu.classList.contains('show')) {
                // 刚点+号弹出的菜单(500ms内),跳过关闭,防闪退
                const justOpened = window.__plusJustClicked && (Date.now() - window.__plusJustClicked < 500);
                if (!justOpened && !blockMenu.contains(e.target) && !e.target.closest('.inline-add-btn') && !e.target.closest('.line-add-btn')) {
                    blockMenu.classList.remove('show');
                }
                if (justOpened) window.__plusJustClicked = 0;   // 用完清除
            }
            // 点击 export 菜单外部 → 关闭
            const exportMenu = document.getElementById('exportMenu');
            if (exportMenu && exportMenu.classList.contains('show') &&
                !exportMenu.contains(e.target) && !e.target.closest('.export-dropdown > .btn')) {
                exportMenu.classList.remove('show');
            }
            // 点击 Discourse 题型菜单外部 → 关闭
            const discourseMenu = document.getElementById('mmDiscourseMenu');
            if (discourseMenu && discourseMenu.classList.contains('show') &&
                !discourseMenu.contains(e.target) && !e.target.closest('#mmDiscourseBtn')) {
                discourseMenu.classList.remove('show');
            }
            // 点击 同步菜单外部 → 关闭
            const knSyncMenu = document.getElementById('knSyncMenu');
            if (knSyncMenu && knSyncMenu.classList.contains('show') &&
                !knSyncMenu.contains(e.target) && !e.target.closest('#knSyncGroup > .btn')) {
                knSyncMenu.classList.remove('show');
            }
            // 点击 字体菜单外部 → 关闭
            const fontMenu = document.getElementById('fontMenu');
            if (fontMenu && fontMenu.classList.contains('show') &&
                !fontMenu.contains(e.target) && !e.target.closest('#fontGroup > .toolbar-btn')) {
                fontMenu.classList.remove('show');
            }
            // 点击 页边距菜单外部 → 关闭
            const marginMenu = document.getElementById('marginMenu');
            if (marginMenu && marginMenu.classList.contains('show') &&
                !marginMenu.contains(e.target) && !e.target.closest('#marginGroup > .toolbar-btn')) {
                marginMenu.classList.remove('show');
            }
            // 点击 行距菜单外部 → 关闭
            const lsMenu = document.getElementById('lineSpacingMenu');
            if (lsMenu && lsMenu.classList.contains('show') &&
                !lsMenu.contains(e.target) && !e.target.closest('#lineSpacingGroup > .toolbar-btn')) {
                lsMenu.classList.remove('show');
            }
            // 点击 颜色菜单外部 → 关闭
            const knColorMenu = document.getElementById('knColorMenu');
            if (knColorMenu && knColorMenu.classList.contains('show') &&
                !knColorMenu.contains(e.target) && !e.target.closest('#knColorGroup > .toolbar-btn')) {
                knColorMenu.classList.remove('show');
            }
        });
        // Esc 关闭块菜单
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeBlockMenu();
        });
        // Language Kit 拖动
        setupLangKitDrag();
    }

    function setupLangKitDrag() {
        const panel = document.getElementById('langKitPanel');
        const header = document.getElementById('langKitHeader');
        if (!panel || !header) return;
        let dragging = false, offX = 0, offY = 0;
        header.addEventListener('mousedown', (e) => {
            // 不拖动关闭按钮
            if (e.target.classList.contains('lang-kit-close')) return;
            dragging = true;
            const rect = panel.getBoundingClientRect();
            offX = e.clientX - rect.left;
            offY = e.clientY - rect.top;
            panel.style.right = 'auto';
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            let left = e.clientX - offX;
            let top = e.clientY - offY;
            left = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, left));
            top = Math.max(0, Math.min(window.innerHeight - 50, top));
            panel.style.left = left + 'px';
            panel.style.top = top + 'px';
        });
        document.addEventListener('mouseup', () => { dragging = false; });
    }

    // ===== IndexedDB 数据持久化 =====
    const DB_NAME = 'afr-database';
    const DB_VERSION = 2; // 升级版本号，触发旧数据清理
    let db = null;

    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (e) => {
                const database = e.target.result;
                // v2: 清除旧格式数据（没有examId字段）
                if (e.oldVersion < 2) {
                    if (database.objectStoreNames.contains('homeworks')) {
                        database.deleteObjectStore('homeworks');
                    }
                    if (database.objectStoreNames.contains('meta')) {
                        database.deleteObjectStore('meta');
                    }
                }
                if (!database.objectStoreNames.contains('homeworks')) {
                    database.createObjectStore('homeworks', { keyPath: 'id' });
                }
                if (!database.objectStoreNames.contains('meta')) {
                    database.createObjectStore('meta', { keyPath: 'key' });
                }
            };
            request.onsuccess = (e) => {
                db = e.target.result;
                resolve(db);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    function dbPut(storeName, data) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req = store.put(data);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    function dbGetAll(storeName) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    function dbDelete(storeName, key) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req = store.delete(key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    function dbGet(storeName, key) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function loadDataFromDB() {
        try {
            await openDB();
            const allHomeworks = await dbGetAll('homeworks');
            homeworks = {};
            homeworkOrder = [];
            allHomeworks.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
            allHomeworks.forEach(hw => {
                homeworks[hw.id] = hw;
                homeworkOrder.push(hw.id);
            });
            const meta = await dbGet('meta', 'appState');
            if (meta) {
                state.currentClass = meta.currentClass || 'class9';
                state.currentHomework = meta.currentHomework || homeworkOrder[0];
            }
            // 应用主题（IndexedDB权威，但localStorage已在head同步预读，这里同步state）
            const savedTheme = (meta && meta.currentTheme) || 'classic';
            state.currentTheme = THEMES.includes(savedTheme) ? savedTheme : 'classic';
            applyTheme(state.currentTheme);
            // 同步主题菜单active状态
            document.querySelectorAll('#themeMenu .dropdown-item').forEach(it =>
                it.classList.toggle('active', it.dataset.theme === state.currentTheme));
        } catch (err) {
            console.warn('IndexedDB加载失败，使用演示数据:', err);
        }
    }

    async function saveAppState() {
        try {
            await dbPut('meta', {
                key: 'appState',
                currentClass: state.currentClass,
                currentHomework: state.currentHomework,
                currentTheme: state.currentTheme || 'classic',
            });
            // 双写localStorage，供head防闪烁脚本同步读取
            try { localStorage.setItem('afr-theme', state.currentTheme || 'classic'); } catch (e) {}
        } catch (err) {
            console.warn('保存应用状态失败:', err);
        }
    }

    async function saveHomework(hwId) {
        if (homeworks[hwId]) {
            try {
                await dbPut('homeworks', homeworks[hwId]);
            } catch (err) {
                console.warn('保存作业数据失败:', err);
            }
        }
    }

    // ===== 演示数据 =====
    function loadDemoData() {
        const demoId = 'demo-hw1';
        homeworks[demoId] = {
            id: demoId,
            name: 'Book 1 Unit 4 作业练习',
            date: '2026-06-04',
            config: {
                validQuestions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
            },
            scores: {
                class9: [
                    { examId: '80240597', studentNo: '44', id: '44', name: '渠可威', score: 92, rank: 1 },
                    { examId: '80240549', studentNo: '41', id: '41', name: '路通达', score: 88, rank: 2 },
                    { examId: '80240194', studentNo: '23', id: '23', name: '苏梓量', score: 85, rank: 3 },
                    { examId: '80240568', studentNo: '42', id: '42', name: '李嘉炜', score: 82, rank: 4 },
                    { examId: '80240071', studentNo: '5', id: '5', name: '池毅', score: 78, rank: 5 },
                    { examId: '80240147', studentNo: '21', id: '21', name: '张放', score: 75, rank: 6 },
                    { examId: '80240328', studentNo: '30', id: '30', name: '冯涵宇', score: 72, rank: 7 },
                    { examId: '80240246', studentNo: '8', id: '8', name: '陈飞宇', score: 68, rank: 8 },
                    { examId: '80240089', studentNo: '18', id: '18', name: '刘佳乐', score: 65, rank: 9 },
                    { examId: '80240407', studentNo: '25', id: '25', name: '刘明富', score: 60, rank: 10 },
                ],
                class11: [
                    { id: '20241101', name: '陈一', score: 93, rank: 1 },
                    { id: '20241102', name: '林二', score: 90, rank: 2 },
                    { id: '20241103', name: '黄三', score: 87, rank: 3 },
                    { id: '20241104', name: '杨四', score: 84, rank: 4 },
                    { id: '20241105', name: '朱五', score: 80, rank: 5 },
                    { id: '20241106', name: '刘六', score: 76, rank: 6 },
                    { id: '20241107', name: '许七', score: 73, rank: 7 },
                    { id: '20241108', name: '何八', score: 69, rank: 8 },
                    { id: '20241109', name: '马九', score: 66, rank: 9 },
                    { id: '20241110', name: '罗十', score: 63, rank: 10 },
                ],
            },
            questions: {
                class9: [
                    { id: 1, type: '单选题', score: 1.5, classRate: 1.85, schoolRate: 3.54, correctAnswer: 'A', errorRate: 98.15, knowledgePoints: '词汇辨析', options: { A: { count: 1 }, B: { count: 4 }, C: { count: 49 }, D: { count: 0 } } },
                    { id: 2, type: '单选题', score: 1.5, classRate: 30.0, schoolRate: 25.33, correctAnswer: 'B', errorRate: 70, knowledgePoints: '语法-时态', options: { A: { count: 2 }, B: { count: 3 }, C: { count: 4 }, D: { count: 1 } } },
                    { id: 3, type: '单选题', score: 1.5, classRate: 70.0, schoolRate: 62.0, correctAnswer: 'C', errorRate: 30, knowledgePoints: '阅读理解-细节推断', options: { A: { count: 1 }, B: { count: 2 }, C: { count: 7 }, D: { count: 0 } } },
                    { id: 4, type: '单选题', score: 1.5, classRate: 90.0, schoolRate: 85.33, correctAnswer: 'D', errorRate: 10, knowledgePoints: '完形填空-上下文', options: { A: { count: 0 }, B: { count: 1 }, C: { count: 0 }, D: { count: 9 } } },
                    { id: 5, type: '单选题', score: 1.5, classRate: 94.67, schoolRate: 85.33, correctAnswer: 'A', errorRate: 5.33, knowledgePoints: '语法-虚拟语气', options: { A: { count: 10 }, B: { count: 0 }, C: { count: 0 }, D: { count: 0 } } },
                    { id: 6, type: '单选题', score: 1.5, classRate: 55.0, schoolRate: 48.0, correctAnswer: 'C', errorRate: 45, knowledgePoints: '词汇-固定搭配', options: { A: { count: 2 }, B: { count: 3 }, C: { count: 6 }, D: { count: 1 } } },
                    { id: 7, type: '单选题', score: 1.5, classRate: 82.0, schoolRate: 75.0, correctAnswer: 'B', errorRate: 18, knowledgePoints: '阅读理解-主旨大意', options: { A: { count: 1 }, B: { count: 9 }, C: { count: 1 }, D: { count: 1 } } },
                    { id: 8, type: '单选题', score: 1.5, classRate: 45.0, schoolRate: 40.0, correctAnswer: 'A', errorRate: 55, knowledgePoints: '语法-非谓语动词', options: { A: { count: 5 }, B: { count: 3 }, C: { count: 2 }, D: { count: 2 } } },
                    { id: 9, type: '单选题', score: 1.5, classRate: 91.0, schoolRate: 86.0, correctAnswer: 'D', errorRate: 9, knowledgePoints: '词汇-词义辨析', options: { A: { count: 0 }, B: { count: 1 }, C: { count: 0 }, D: { count: 11 } } },
                    { id: 10, type: '单选题', score: 1.5, classRate: 63.0, schoolRate: 58.0, correctAnswer: 'B', errorRate: 37, knowledgePoints: '语法-定语从句', options: { A: { count: 3 }, B: { count: 7 }, C: { count: 1 }, D: { count: 1 } } },
                    { id: 11, type: '单选题', score: 1.5, classRate: 78.0, schoolRate: 72.0, correctAnswer: 'C', errorRate: 22, knowledgePoints: '阅读理解-推理判断', options: { A: { count: 1 }, B: { count: 2 }, C: { count: 9 }, D: { count: 0 } } },
                    { id: 12, type: '单选题', score: 1.5, classRate: 35.0, schoolRate: 30.0, correctAnswer: 'A', errorRate: 65, knowledgePoints: '语法-倒装句', options: { A: { count: 4 }, B: { count: 5 }, C: { count: 2 }, D: { count: 1 } } },
                    { id: 13, type: '单选题', score: 1.5, classRate: 88.0, schoolRate: 80.0, correctAnswer: 'D', errorRate: 12, knowledgePoints: '词汇-近义词', options: { A: { count: 1 }, B: { count: 0 }, C: { count: 1 }, D: { count: 10 } } },
                    { id: 14, type: '单选题', score: 1.5, classRate: 52.0, schoolRate: 46.0, correctAnswer: 'B', errorRate: 48, knowledgePoints: '完形填空-逻辑关系', options: { A: { count: 3 }, B: { count: 6 }, C: { count: 2 }, D: { count: 1 } } },
                    { id: 15, type: '单选题', score: 1.5, classRate: 96.0, schoolRate: 90.0, correctAnswer: 'C', errorRate: 4, knowledgePoints: '语法-情态动词', options: { A: { count: 0 }, B: { count: 0 }, C: { count: 12 }, D: { count: 0 } } },
                ],
                class11: [
                    { id: 1, type: '单选题', score: 1.5, classRate: 94.67, schoolRate: 85.33, correctAnswer: 'B', errorRate: 5.33, knowledgePoints: '词汇辨析', options: { A: { count: 0 }, B: { count: 10 }, C: { count: 0 }, D: { count: 0 } } },
                    { id: 2, type: '单选题', score: 1.5, classRate: 85.33, schoolRate: 75.33, correctAnswer: 'A', errorRate: 14.67, knowledgePoints: '语法-时态', options: { A: { count: 9 }, B: { count: 1 }, C: { count: 0 }, D: { count: 0 } } },
                    { id: 3, type: '单选题', score: 1.5, classRate: 70.0, schoolRate: 62.0, correctAnswer: 'C', errorRate: 30, knowledgePoints: '阅读理解-细节推断', options: { A: { count: 1 }, B: { count: 2 }, C: { count: 7 }, D: { count: 0 } } },
                    { id: 4, type: '单选题', score: 1.5, classRate: 45.33, schoolRate: 45.33, correctAnswer: 'D', errorRate: 54.67, knowledgePoints: '完形填空-上下文', options: { A: { count: 2 }, B: { count: 3 }, C: { count: 2 }, D: { count: 3 } } },
                    { id: 5, type: '单选题', score: 1.5, classRate: 25.33, schoolRate: 25.33, correctAnswer: 'A', errorRate: 74.67, knowledgePoints: '语法-虚拟语气', options: { A: { count: 3 }, B: { count: 5 }, C: { count: 2 }, D: { count: 0 } } },
                ],
            },
            passages: [
                {
                    id: 'passage-1',
                    title: 'Passage 1 — Reading Comprehension',
                    type: 'text',
                    content: '<p>In recent years, the concept of "lifelong learning" has gained increasing attention from educators and policymakers alike. The rapid pace of technological change means that skills acquired in formal education can quickly become outdated, requiring workers to continually update their knowledge and abilities throughout their careers.</p><p>According to a recent survey conducted by the Ministry of Education, over 60% of working adults in major cities have participated in some form of continuing education within the past five years. This trend reflects a growing recognition that learning is not confined to classrooms or limited to specific age groups.</p><p>However, challenges remain. Many working adults struggle to balance the demands of their jobs and family responsibilities with the time and energy required for further study. Online learning platforms have emerged as a potential solution, offering flexible schedules and a wide range of courses that can be accessed from anywhere.</p><p>The key question facing educators is how to design learning experiences that are both effective and engaging for adult learners, who bring a wealth of practical experience but may lack confidence in their academic abilities.</p>',
                    questions: [1, 2, 3, 4, 5],
                    questionData: [
                        {
                            id: 1,
                            stem: 'What is the main idea of the passage?',
                            options: ['A. Technology has made education unnecessary', 'B. Lifelong learning is becoming increasingly important', 'C. Online learning is the only solution for adults', 'D. Formal education is outdated'],
                        },
                        {
                            id: 2,
                            stem: 'According to the survey mentioned in paragraph 2, what percentage of working adults have participated in continuing education?',
                            options: ['A. Over 40%', 'B. Over 50%', 'C. Over 60%', 'D. Over 70%'],
                        },
                        {
                            id: 3,
                            stem: 'What challenge do many working adults face?',
                            options: ['A. They cannot afford education', 'B. They lack interest in learning', 'C. They struggle to balance work, family and study', 'D. They cannot find suitable courses'],
                        },
                        {
                            id: 4,
                            stem: 'What does the word "confined" in paragraph 2 most likely mean?',
                            options: ['A. Limited', 'B. Expanded', 'C. Related', 'D. Applied'],
                        },
                        {
                            id: 5,
                            stem: 'What is the key question facing educators according to the passage?',
                            options: ['A. How to reduce the cost of education', 'B. How to make online platforms more popular', 'C. How to design effective and engaging learning for adults', 'D. How to increase the survey response rate'],
                        },
                    ],
                },
            ],
            knowledge: {
                class9: '1. **词汇辨析**: 区分 acquire/obtain/gain 的用法\n2. **时态**: 现在完成时 vs 一般过去时的区别\n3. **阅读策略**: 寻找主旨句通常在段落首尾',
                class11: '1. **固定搭配**: participate in / take part in\n2. **非谓语动词**: requiring... 现在分词作状语',
            },
        };

        homeworkOrder = [demoId];
        state.currentHomework = demoId;
        saveHomework(demoId);
        saveAppState();
    }

    // ===== 获取当前作业数据 =====
    function getCurrentHomework() {
        return homeworks[state.currentHomework] || null;
    }

    function getCurrentQuestions() {
        const hw = getCurrentHomework();
        if (!hw) return [];
        return hw.questions[state.currentClass] || [];
    }

    function getCurrentScores() {
        const hw = getCurrentHomework();
        if (!hw) return [];
        return hw.scores[state.currentClass] || [];
    }

    // ===== 渲染 =====
    function renderAll() {
        updateClassBtnText();
        updateHomeworkBtnText();
        renderScores();
        renderQuestionGrid();
        renderQuestionDetail();
        renderPassage();
        renderKnowledge();
    }

    // ===== 作业下拉菜单 =====
    function renderHomeworkMenu() {
        const menu = document.getElementById('homeworkMenu');
        if (!menu) return;
        menu.innerHTML = homeworkOrder.map(id => {
            const hw = homeworks[id];
            return `<div class="dropdown-item ${id === state.currentHomework ? 'active' : ''}"
                         onclick="AFR.selectHomework('${id}')">
                        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
                            <div style="flex:1;min-width:0">
                                <div style="font-weight:500">${hw.name}</div>
                                <div style="font-size:11px;color:var(--text-tertiary)">${hw.date || ''}</div>
                            </div>
                            <span class="hw-rename-btn" title="Rename"
                                  onclick="event.stopPropagation();AFR.promptRenameHomework('${id}')">✎</span>
                            <span class="hw-del-btn" title="Delete"
                                  onclick="event.stopPropagation();AFR.deleteHomework('${id}')">✕</span>
                        </div>
                    </div>`;
        }).join('');
        updateHomeworkBtnText();
    }

    // 菜单✎改名入口：弹输入框（预填当前名），复用renameCurrentHomework
    function promptRenameHomework(hwId) {
        const hw = homeworks[hwId];
        if (!hw) return;
        const newName = prompt('Rename assignment:', hw.name);
        if (newName === null) return;   // 取消
        if (state.currentHomework !== hwId) {
            // 改的是非当前作业：直接改名（不切换）
            const n = newName.trim();
            if (!n) { notify('Name cannot be empty', 'error'); return; }
            hw.name = n;
            saveHomework(hwId);
            renderHomeworkMenu();
            notify('Renamed to: ' + n, 'success');
        } else {
            renameCurrentHomework(newName);
        }
    }

    // 删除单个作业（带确认，删后自动切换到第一个作业）
    function deleteHomework(hwId) {
        const hw = homeworks[hwId];
        if (!hw) return;
        if (!confirm(`Delete "${hw.name}"? This cannot be undone.`)) return;
        delete homeworks[hwId];
        homeworkOrder = homeworkOrder.filter(id => id !== hwId);
        dbDelete('homeworks', hwId).catch(e => console.warn('删除作业失败:', e));
        // 当前作业被删 → 切换到第一个
        if (state.currentHomework === hwId) {
            state.currentHomework = homeworkOrder[0] || null;
            state.activeQuestionId = null;
        }
        if (homeworkOrder.length === 0) {
            // 全删空了：保存空状态，显示空列表（不自动补demo）
            saveAppState();
            renderHomeworkMenu();
            renderAll();
            notify('All assignments deleted', 'info');
        } else {
            saveAppState();
            renderHomeworkMenu();
            renderAll();
            notify('Assignment deleted', 'info');
        }
    }

    function updateHomeworkBtnText() {
        const el = document.getElementById('homeworkBtnText');
        if (el && homeworks[state.currentHomework]) {
            el.textContent = homeworks[state.currentHomework].name;
        }
    }

    function updateClassBtnText() {
        const el = document.getElementById('classBtnText');
        if (el) {
            el.textContent = state.currentClass === 'class9' ? '高三09班' : '高三11班';
        }
    }

    // ===== 下拉菜单切换 =====
    function toggleDropdown(type) {
        const menuId = type === 'homework' ? 'homeworkMenu' : 'classMenu';
        const btnId = type === 'homework' ? 'homeworkBtn' : 'classBtn';
        const menu = document.getElementById(menuId);
        const btn = document.getElementById(btnId);

        // 关闭其他下拉
        document.querySelectorAll('.dropdown-menu').forEach(m => {
            if (m.id !== menuId) m.classList.remove('show');
        });
        document.querySelectorAll('.dropdown-btn').forEach(b => {
            if (b.id !== btnId) b.classList.remove('open');
        });

        menu.classList.toggle('show');
        btn.classList.toggle('open');
    }

    // 点击外部关闭下拉
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown-group')) {
            document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('show'));
            document.querySelectorAll('.dropdown-btn').forEach(b => b.classList.remove('open'));
        }
    });

    // ===== 选择作业 =====
    function selectHomework(hwId) {
        if (!homeworks[hwId]) return;
        state.currentHomework = hwId;
        state.activeQuestionId = null;
        currentUnitIndex = 0;     // 切换作业时重置到第一个素材
        unitScrollMap = {};
        saveAppState();
        renderHomeworkMenu();
        renderAll();
        closeAllDropdowns();
        notify('Switched to: ' + homeworks[hwId].name, 'success');

        // 切换作业时：如果当前在MindMap视图，重新加载该作业的语篇分析数据
        if (state.currentView === 'mindmap') {
            loadMmAnalysisFromHw();
            // 同步顶部Discourse按钮显示
            const dlabel = document.getElementById('mmDiscourseLabel');
            if (dlabel) dlabel.textContent = state.mmDiscourse || 'Passage A';
            // 渲染：有数据则显示，无数据则空白
            if (state.mmCustomText) {
                renderMmParas(state.mmCustomText);
            } else if (tryAutoLoadExamText(state.mmDiscourse)) {
                // 📄 已从试卷自动提取原文（examIndex）
            } else {
                const body = document.getElementById('mmTextBody');
                const title = document.getElementById('mmTextTitle');
                if (body) body.innerHTML = '<div class="mm-empty-hint">No text for ' + escapeHtml(state.mmDiscourse || 'Passage A') + '. Click 📁 Import or 📋 Paste.</div>';
                if (title) title.textContent = (state.mmDiscourse || 'Passage A') + ' — Text';
                // 段落块、节点画布也清空
                const pane2 = document.querySelector('.mm-step-pane[data-step-pane="2"]');
                if (pane2) pane2.innerHTML = '<div class="mm-empty-hint">Import or paste text first — paragraph blocks will appear here.</div>';
                const canvas = document.getElementById('mmLinkCanvas');
                if (canvas) canvas.innerHTML = '<svg class="mm-link-svg" id="mmLinkSvg"></svg><div class="mm-empty-hint">Import or paste text first — paragraph nodes will appear here.</div>';
            }
        }
    }

    // ===== 选择班级 =====
    function selectClass(cls) {
        state.currentClass = cls;
        state.activeQuestionId = null;
        saveAppState();
        // 更新下拉高亮
        document.querySelectorAll('#classMenu .dropdown-item').forEach(item => {
            item.classList.toggle('active', item.textContent.includes(cls === 'class9' ? '9' : '11'));
        });
        renderAll();
        closeAllDropdowns();
    }

    // 重命名当前作业（改name字段并持久化）
    // 顶部Tab左右滚动（按钮触发）
    function scrollTabs(delta) {
        const container = document.getElementById('viewTabsContainer');
        if (!container) return;
        container.scrollBy({ left: delta, behavior: 'smooth' });
    }

    function renameCurrentHomework(newName) {
        const hw = getCurrentHomework();
        if (!hw) { notify('No assignment selected', 'error'); return false; }
        newName = (newName || '').trim();
        if (!newName) { notify('Name cannot be empty', 'error'); return false; }
        hw.name = newName;
        saveHomework(hw.id);
        renderHomeworkMenu();
        // 更新顶部按钮显示
        const btn = document.getElementById('homeworkBtnText');
        if (btn) btn.textContent = newName;
        notify('Renamed to: ' + newName, 'success');
        return true;
    }

    // 设置手动星标名单（老师指定的额外表彰学生，不管排名）
    // names: 姓名数组，如 ['高进','颜寒香']
    function setStarredNames(names) {
        const hw = getCurrentHomework();
        if (!hw) { notify('No assignment selected', 'error'); return false; }
        hw.starredNames = Array.isArray(names) ? names.filter(n => n && n.trim()) : [];
        saveHomework(hw.id);
        renderScores();
        notify('Starred ' + hw.starredNames.length + ' students: ' + hw.starredNames.join(', '), 'success');
        return true;
    }

    // 追加手动星标（不覆盖已有）
    function addStarredNames(names) {
        const hw = getCurrentHomework();
        if (!hw) { notify('No assignment selected', 'error'); return false; }
        if (!hw.starredNames) hw.starredNames = [];
        const existing = new Set(hw.starredNames);
        (Array.isArray(names) ? names : []).forEach(n => { if (n && n.trim()) existing.add(n.trim()); });
        hw.starredNames = Array.from(existing);
        saveHomework(hw.id);
        renderScores();
        notify('Starred list now: ' + hw.starredNames.join(', '), 'success');
        return true;
    }

    function closeAllDropdowns() {
        document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('show'));
        document.querySelectorAll('.dropdown-btn').forEach(b => b.classList.remove('open'));
    }

    // ===== 视图切换 =====
    function switchView(view) {
        state.currentView = view;

        // 更新Tab高亮
        document.querySelectorAll('.view-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.view === view);
        });

        // 切换视图
        document.getElementById('preludeView').classList.toggle('hidden', view !== 'prelude');
        document.getElementById('scoresView').classList.toggle('hidden', view !== 'scores');
        document.getElementById('reviewView').classList.toggle('hidden', view !== 'review');
        document.getElementById('mindmapView').classList.toggle('hidden', view !== 'mindmap');
        document.getElementById('knowledgeView').classList.toggle('hidden', view !== 'knowledge');

        if (view === 'prelude') {
            renderPrelude();
        } else {
            // 离开Prelude → 暂停音乐
            stopPreludeMusic();
        }
        if (view === 'review') {
            renderQuestionGrid();
            renderQuestionDetail();
            renderPassage();
            // 重新初始化Canvas尺寸
            setTimeout(() => resizeCanvas(), 100);
        }
        if (view === 'mindmap') {
            // 进入MindMap：先迁移旧数据（如有），再加载当前题型
            migrateMmAnalysisIfNeeded();
            loadMmAnalysisFromHw();
            // 同步顶部Discourse按钮显示
            const dlabel = document.getElementById('mmDiscourseLabel');
            if (dlabel) dlabel.textContent = state.mmDiscourse || 'Passage A';
            // 有数据则渲染，否则显示空白提示（不再用占位演示文本）
            if (state.mmCustomText) {
                renderMmParas(state.mmCustomText);
            } else if (tryAutoLoadExamText(state.mmDiscourse)) {
                // 📄 已从试卷自动提取原文（examIndex）
            } else {
                const body = document.getElementById('mmTextBody');
                const title = document.getElementById('mmTextTitle');
                if (body) body.innerHTML = '<div class="mm-empty-hint">No text for ' + escapeHtml(state.mmDiscourse || 'Passage A') + '. Click 📁 Import or 📋 Paste.</div>';
                if (title) title.textContent = (state.mmDiscourse || 'Passage A') + ' — Text';
            }
            renderMmNotes();
            initMmToolkitNotes();   // 空工具箱时种入六大语篇预设
            renderMmNotes();        // 种入后再渲染一次
            setTimeout(syncDrawerTogglePos, 50);
            if (!document.querySelector('.mm-step-tab.active')) {
                switchMindmapStep(state.mmCurrentStep || 1);
            }
        }
    }

    // ===== MindMap 思维导图工作流视图 =====
    // 当前步骤（1-4），默认第1步
    state.mmCurrentStep = 1;

    // 抽屉折叠：收起/展开左侧工具箱
    function toggleMindmapDrawer() {
        const toolbox = document.getElementById('mmToolbox');
        const toggle = document.getElementById('mmDrawerToggle');
        if (!toolbox || !toggle) return;
        const collapsed = toolbox.classList.toggle('collapsed');
        toggle.classList.toggle('drawer-collapsed', collapsed);
        toggle.textContent = collapsed ? '▸' : '◂';
        // 折叠时用工具箱实际宽度设负margin，展开时清除
        if (collapsed) {
            const w = toolbox.offsetWidth;
            toolbox.style.marginLeft = (-w) + 'px';
            toggle.style.left = '0px';   // 折叠时清除内联left，让CSS类控制到最左
        } else {
            toolbox.style.marginLeft = '';
            toggle.style.left = toolbox.offsetWidth + 'px';   // 展开时恢复跟随工具箱宽度
        }
    }

    // 同步折叠按钮位置到工具箱实际宽度（拖拽改宽后调用）
    function syncDrawerTogglePos() {
        const toolbox = document.getElementById('mmToolbox');
        const toggle = document.getElementById('mmDrawerToggle');
        if (!toolbox || !toggle) return;
        if (!toolbox.classList.contains('collapsed')) {
            toggle.style.left = toolbox.offsetWidth + 'px';
        }
    }

    // 四步切换：切换右侧工作区显示哪一步
    function switchMindmapStep(step) {
        state.mmCurrentStep = step;
        // 更新导航高亮
        document.querySelectorAll('.mm-step-tab').forEach(tab => {
            tab.classList.toggle('active', Number(tab.dataset.step) === step);
        });
        // 切换内容面板
        document.querySelectorAll('.mm-step-pane').forEach(pane => {
            pane.classList.toggle('hidden', Number(pane.dataset.stepPane) !== step);
        });
        // 切换步骤时清除左侧段落的凸出态（避免残留）
        const body = document.getElementById('mmTextBody');
        if (body) body.querySelectorAll('p.mm-pop').forEach(p => p.classList.remove('mm-pop'));
        document.querySelectorAll('.mm-role-block.active').forEach(b => b.classList.remove('active'));
        // 切到 step3（Logic Links）时渲染节点和工具栏
        if (step === 3) {
            renderMmLinkToolbar();
            setTimeout(() => { renderMmNodes(); }, 50);   // 等面板可见后再渲染（否则坐标算不准）
        }
        // 切到 step1（Subject Matter）时渲染四要素
        if (step === 1) {
            renderMmSubject();
        }
        // 切到 step4（Build Map）时自动生成思维导图
        if (step === 4) {
            setTimeout(renderMmBuild, 50);   // 等面板可见后渲染（否则宽度算不准）
        }
    }

    // ===== Discourse 题型下拉 =====
    // 当前选中的题型（默认 Passage D，因用户录入的通常是 Passage D）
    state.mmDiscourse = 'Passage D';
    // 用户导入/粘贴的自定义文本（按空行分段）
    state.mmCustomText = '';
    // 各段功能标注 {段落号: 文本}（按作业持久化）
    state.mmRoleFns = {};

    // 打开/关闭 Discourse 下拉菜单
    function toggleDiscourseMenu(ev) {
        if (ev) ev.stopPropagation();
        const menu = document.getElementById('mmDiscourseMenu');
        if (!menu) return;
        menu.classList.toggle('show');
    }

    // 选中某个题型
    // ===== 试卷语篇自动识别（Exam Discourse Auto-Detect，自Zcode副本移植） =====
    // PDF导入时提取每页文字层（pdf.js getTextContent），按行+缩进重建段落，
    // 再按试卷结构切分：阅读理解A-D / 七选五 / 完形填空 / 语法填空 / 读后续写，
    // 存 hw.examIndex[type] = {text, sourceId, pageStart}。
    // MindMap 顶部语篇下拉选中即自动填充文本区，无需再粘贴。
    // ==================================================================

    // 页眉页脚/页码等噪音行（"2027届高三英语备课组""第1页/共14页""学科网…"等）
    // 注意：/^试\s*[卷题]$/ 不在噪音里——它承担"合卷第二份开始"的区域重置边界职责
    const PDF_NOISE_RES = [
        /第\s*\d+\s*页\s*共\s*\d+\s*页/,
        /第\s*\d+\s*页\s*[\/／]\s*共\s*\d+\s*页/,
        /共\s*\d+\s*页\s*第\s*\d+\s*页/,
        /命制[:：]/, /审核[:：]/, /备课组/,
        /学科网/, /股份有限公司/,
        /^英\s*语\s*$/,
        /^(高三|高二|高一)\s*[（(]?\s*英语\s*[)）]?\s*(诊断练习|开学检测|期未|期末|期中|月考|试题|练习)/,
        /^\d{1,3}$/,
    ];
    function isNoiseLine(t) {
        const s = String(t || '').trim();
        if (!s) return true;
        const bare = s.replace(/\s/g, '');   // "学科 网(北京 ）股份 有限公 司"字间带空格
        return PDF_NOISE_RES.some(re => (re.test(s) || re.test(bare)) && (s.length < 40 || /^\d{1,3}$/.test(s)));
    }

    // 逐行文本项 → 整页纯文本（带段落结构；自动识别并拆分双栏排版）
    async function extractPdfPageText(pdfPage) {
        const tc = await pdfPage.getTextContent();
        const items = tc.items.filter(it => it.str && it.str.trim());
        if (!items.length) return '';
        let pageW = 595;
        try { pageW = pdfPage.getViewport({ scale: 1 }).width || 595; } catch (e) {}
        // 1. 按Y坐标聚合成行（PDF坐标Y向上，保留x与字号）
        const rows = [];
        items.forEach(it => {
            const x = it.transform[4], y = it.transform[5];
            const size = Math.abs(it.transform[3]) || it.height || 10;
            let row = null;
            for (let i = rows.length - 1; i >= 0; i--) {
                if (Math.abs(rows[i].y - y) < 2.5) { row = rows[i]; break; }
                if (rows[i].y - y > 30) break;   // 已排序时提前终止
            }
            if (!row) { row = { y: y, x: x, size: size, parts: [] }; rows.push(row); }
            row.parts.push({ str: it.str, x: x, endX: x + (it.width || 0) });
            if (x < row.x) row.x = x;
            if (size > row.size) row.size = size;
        });
        rows.sort((a, b) => b.y - a.y);   // 从页顶到页底
        // 2. 行内拼词：x间隙>1pt补空格；连字符行尾直接接
        rows.forEach(r => {
            r.parts.sort((a, b) => a.x - b.x);
            let s = '';
            r.parts.forEach(p => {
                if (!s) { s = p.str; r.lastEnd = p.endX; return; }
                if (p.x - r.lastEnd > 1 && !/\s$/.test(s) && !/^\s/.test(p.str)) s += ' ';
                s += p.str;
                r.lastEnd = p.endX;
            });
            r.text = s.replace(/\s+/g, ' ').trim();
        });
        // 3. 过滤页眉页脚噪音行
        const lines = rows.filter(r => r.text && !isNoiseLine(r.text));
        if (!lines.length) return '';
        // 4. 双栏检测：窄行聚类，找无跨栏的竖直装订沟
        const segs = splitPdfColumns(lines, pageW);
        // 5. 逐栏重组段落（栏内单独统计左边距/行距，防止跨栏污染）
        return segs.map(seg => buildParasFromLines(seg)).filter(Boolean).join('\n\n');
    }

    // 双栏拆分：返回按阅读顺序的行段数组（[左栏, 右栏] 或 [整页]）
    function splitPdfColumns(lines, pageW) {
        const narrow = lines.filter(l => (l.lastEnd - l.x) < pageW * 0.7);
        if (narrow.length < 12) return [lines];   // 行太少或多为通栏 → 单栏
        let best = null;
        for (let g = Math.round(pageW * 0.38); g <= Math.round(pageW * 0.62); g++) {
            let cross = 0;
            narrow.forEach(l => { if (l.x < g - 2 && l.lastEnd > g + 2) cross++; });
            if (!best || cross < best.cross) best = { g: g, cross: cross };
        }
        if (!best || best.cross > Math.max(1, Math.round(narrow.length * 0.04))) return [lines];
        const left = [], right = [];
        narrow.forEach(l => {
            if (l.lastEnd <= best.g + 2) left.push(l);
            else if (l.x >= best.g - 2) right.push(l);
            else (l.x + l.lastEnd) / 2 < best.g ? left.push(l) : right.push(l);
        });
        if (left.length < 5 || right.length < 5) return [lines];
        return [left, right];   // 通栏行（大标题）已先被noise过滤；若残留按窄行归属
    }

    // 行段 → 段落文本（左右边距众数 + 行距中位数 + 题干行 + 选项行 + 中英翻转）
    function buildParasFromLines(lines) {
        if (!lines.length) return '';
        lines = lines.slice().sort((a, b) => b.y - a.y);
        const xs = {};
        lines.forEach(l => { if (/[A-Za-z]{10,}/.test(l.text)) xs[Math.round(l.x)] = (xs[Math.round(l.x)] || 0) + 1; });
        let dominantX = 0, bestN = 0;
        Object.keys(xs).forEach(k => { if (xs[k] > bestN) { bestN = xs[k]; dominantX = Number(k); } });
        const gaps = [];
        for (let i = 1; i < lines.length; i++) {
            const g = lines[i - 1].y - lines[i].y;
            if (g > 1 && g < 60) gaps.push(g);
        }
        gaps.sort((a, b) => a - b);
        /* 行距取下四分位（段内行距）而非中位数：短文档（如答案册范文页）行距双峰
           （段内~15 / 段间~30），中位数可能落在段间簇导致阈值过大永不分段；P25 恒取段内行距 */
        const medGap = gaps.length ? gaps[Math.max(0, Math.floor(gaps.length * 0.25))] : 14;
        const cnRatio = t => {
            const s = t.replace(/\s/g, '');
            return s ? (s.match(/[一-龥]/g) || []).length / s.length : 0;
        };
        const isOptLine = t => /^[A-H]\s*[.．、]\s*\S/.test(t);
        const paras = [];
        let cur = '';
        lines.forEach((l, i) => {
            const prev = i > 0 ? lines[i - 1] : null;
            let newPara = i === 0
                || l.x > dominantX + Math.max(8, l.size * 1.1)
                || (prev && (prev.y - l.y) > medGap * 1.6 + 2)
                || isQuestionStemLine(l.text);
            if (!newPara && isOptLine(l.text)) {
                // "A. xxx"选项行：前一行非选项且以句号结尾，或前一行也是选项 → 各自成段
                newPara = prev && (isOptLine(prev.text) ? true : /[.!?。；]$/.test(prev.text));
            }
            if (!newPara && prev) {
                // 中→英 / 英→中 翻转处（如中文指令后接英文正文、注意后接Paragraph 1）
                const pc = cnRatio(prev.text), cc = cnRatio(l.text);
                if ((pc > 0.3 && cc < 0.1) || (pc < 0.1 && cc > 0.3)) newPara = true;
            }
            if (newPara) {
                if (cur) paras.push(cur);
                cur = l.text;
            } else if (cur) {
                cur += /[A-Za-z]-$/.test(cur) ? l.text : ' ' + l.text;
            } else {
                cur = l.text;
            }
        });
        if (cur) paras.push(cur);
        return paras.join('\n\n');
    }

    // 纯中文指令行判定（"第一节（共15小题…）""注意：…"等，从语篇正文中剔除）
    function isCnInstructionLine(t) {
        const s = String(t || '').replace(/\s/g, '');
        if (!s) return true;
        if (/[_＿]{2,}\s*\d{0,2}|\d{0,2}\s*[_＿]{2,}/.test(t)) return false;   // 含空格题干标记，保留
        const cn = (s.match(/[一-龥]/g) || []).length;
        return cn / s.length > 0.5;
    }

    // 题干行判定："21. What did..." / "41. A. despite..."（完形选项行）
    function isQuestionStemLine(t) {
        const s = String(t || '');
        if (/^\d{1,2}\s*[.．、]?\s*[_＿]/.test(s)) return false;   // "41.___"是文内空格，不是题干
        const m = s.match(/^(\d{1,2})\s*[.．、]\s*(\S)/);
        if (!m) return false;
        const num = Number(m[1]);
        if (num < 1 || num > 67) return false;
        return /[A-Za-z]{2,}/.test(s);
    }

    // Passage 头部判定。"Passage A/One" 独立行直接认；孤立字母行需额外校验
    function examPassageLetterWord(t) {
        const m = String(t || '').trim().match(/^Passage\s+(One|Two|Three|Four|1|2|3|4|[A-Da-d])\b\s*[.．、]?\s*$/i);
        if (!m) return null;
        const map = { one: 'A', two: 'B', three: 'C', four: 'D', '1': 'A', '2': 'B', '3': 'C', '4': 'D' };
        return map[m[1].toLowerCase()] || m[1].toUpperCase();
    }
    function looksLikeBareLetter(lines, i, allowGlued) {
        const l = String(lines[i] || '').trim();
        let m = l.match(/^([A-D])\s*$/);
        if (!m && allowGlued) {
            // "A Welcome to Asimov's Science Fiction!"——字母头与标题被排在同一行
            m = l.match(/^([A-D])\s+([A-Z].{1,58})$/);
        }
        if (!m) return null;
        const isOpt = t => /^[A-H]\s*[.．、]\s*\S/.test(t);
        // 收集后4个非空行：紧跟选项行、或其中≥2行是选项行 → 这是选项组不是语篇头
        const after = [];
        for (let j = i + 1; j < lines.length && after.length < 4; j++) {
            if (String(lines[j]).trim()) after.push(lines[j].trim());
        }
        if (after.length && isOpt(after[0])) return null;
        if (after.filter(isOpt).length >= 2) return null;
        const eng = (after.join('').match(/[A-Za-z]/g) || []).length;
        return eng >= 40 ? m[1] : null;
    }

    const EXAM_CN_MARKS = [
        { key: '5 of 7',              re: /七选五|从短文后的选项中选出/ },
        { key: 'Cloze',               re: /完形填空|完型填空|从短文后各题所给的/ },   // 学校卷两种写法都常见
        { key: 'Blank Filling',       re: /语法填空|在空白处填入\s*1\s*个/ },
        { key: 'Continuation Writing', re: /读后续写|根据其内容和所给段落开头语续写/ },
        { key: 'ReadingRegion',       re: /阅读理解/ },
        { key: 'boundary',            re: /第[一二三四1234]部分|第[一二三四1234]节|书面表达|参考答案|答案解析|绝密|启用前|英\s*语\s*试\s*题|^试\s*[卷题]\s*$/ },
    ];

    // 从一组页面文本（按页序）构建语篇索引；返回 {key: {text, sourceId, pageStart}}
    function buildExamIndexFromPages(examPages, sourceId) {
        // examPages: [{pageIdx, text}]；把每页文本拆回"行"以便逐行扫描
        const doc = [];   // {text, pageIdx, isParaHead}
        examPages.forEach(p => {
            const paras = String(p.text || '').split(/\n\n+/);
            paras.forEach(para => {
                para.split(/\n/).forEach((ln, k) => {
                    if (ln.trim()) doc.push({ text: ln.trim(), pageIdx: p.pageIdx, isParaHead: k === 0 || undefined });
                });
                doc.push({ text: '', pageIdx: p.pageIdx });   // 段落分隔哨兵
            });
        });
        // 1. 扫描全部标记（语篇头/中文结构标记），按位置排序；字母头的key由当前区域决定
        //    （真实试卷一节可能有多篇："一、七选五(共2篇)" 下 A、B 都是七选五 → key '5 of 7 · A'）
        const texts = doc.map(d => d.text);
        const REGION_OF = { 'ReadingRegion': 'reading', '5 of 7': '5of7', 'Cloze': 'cloze', 'Blank Filling': 'gf', 'Continuation Writing': 'cw' };
        const REGION_LABEL = { '5of7': '5 of 7', 'cloze': 'Cloze', 'gf': 'Blank Filling', 'cw': 'Continuation Writing' };
        const marks = [];
        const keySeen = {};
        let curRegion = null;
        doc.forEach((d, i) => {
            const t = d.text;
            // 中文指令行在段落重组时可能合并成超长行（"第二部分 阅读理解… 第一节… 阅读下列短文…"），上限放宽到300
            if (!t || t.length > 300) return;
            for (const h of EXAM_CN_MARKS) {
                if (h.re.test(t)) {
                    const first = !keySeen[h.key];
                    keySeen[h.key] = 1;
                    if (h.key === 'boundary') {
                        // 续写区内忽略页眉类boundary（"试题/试卷"页眉因pdf文本流顺序常落在区内，会误切断答题区的段首句）
                        if (curRegion === 'cw' && !/参考答案|答案解析|书面表达/.test(t)) return;
                        curRegion = null;   // 新文档/新大部分开始（合卷第二份、第四部分写作等）
                    } else if (first && REGION_OF[h.key]) {
                        curRegion = REGION_OF[h.key];
                    }
                    marks.push({ i, key: first ? h.key : 'boundary', letter: null, line: t });
                    return;
                }
            }
            const word = examPassageLetterWord(t);
            let letter = null;
            let allowGlued = false;
            if (word) {
                letter = word;
            } else if (keySeen['ReadingRegion'] || keySeen['5 of 7'] || keySeen['Cloze'] || keySeen['Blank Filling']) {
                // "A 标题"粘连形式只在前一行不是英文正文时认（防止正文里"A Capitalized..."误判）
                let prevEn = '';
                for (let j = i - 1; j >= 0; j--) { if (texts[j]) { prevEn = texts[j]; break; } }
                allowGlued = !(/[A-Za-z]{4,}/.test(prevEn) && prevEn.length > 60);
                letter = looksLikeBareLetter(texts, i, allowGlued);
            }
            if (!letter) return;
            if (curRegion === 'cw') return;   // 续写区：答题段首句行首字母（As/Next…）不是新语篇头，防止CW切片被误切断
            // 阅读区（或未识别区域）的字母 → Passage X；其他区域的字母 → "题型 · 字母"
            const key = (!curRegion || curRegion === 'reading') ? 'Passage ' + letter
                : REGION_LABEL[curRegion] + ' · ' + letter;
            if (marks.some(m => m.key === key)) { marks.push({ i, key: 'boundary', letter: null }); return; }
            marks.push({ i, key: key, letter: letter });
        });
        if (!marks.length) return {};
        marks.sort((a, b) => a.i - b.i);
        // 2a. 先认领"无题型词"的小节（光秃秃"第三节(共15小题)"）：按切片内容反推题型
        //     有编号选项行=完形；空格+选项组=七选五；只有空格=语法填空（空格号≥46）
        const index = {};
        const collectSlice = (startI, endI) => {
            const slice = [];
            for (let j = startI; j < endI; j++) {
                if (doc[j].text) slice.push({ text: doc[j].text, pageIdx: doc[j].pageIdx, isParaHead: doc[j].isParaHead || false });
            }
            return slice;
        };
        const nextMarkIdx = mi => {
            for (let j = mi + 1; j < marks.length; j++) if (marks[j].i > marks[mi].i) return j;
            return marks.length;
        };
        for (let mi = 0; mi < marks.length; mi++) {
            const mk = marks[mi];
            if (mk.key !== 'boundary' || !mk.line || !/(共\s*\d+\s*小题|每小题)/.test(mk.line) || /听力/.test(mk.line)) continue;
            const ni = nextMarkIdx(mi);
            const next = ni < marks.length ? marks[ni] : null;
            if (next && next.key !== 'boundary') continue;   // 已被字母头/题型标记认领
            const slice = collectSlice(mk.i + 1, ni < marks.length ? marks[ni].i : doc.length);
            const type = classifySectionSlice(slice);
            if (!type) continue;
            const out = trimExamSlice(slice, type);
            if (out && (out.match(/[A-Za-z]/g) || []).length >= 100 && !index[type]) {
                index[type] = { text: out, sourceId: sourceId, pageStart: slice.length ? slice[0].pageIdx : null };
            }
        }
        // 2b. 相邻标记之间切片 → 清洗 → 生成语篇文本（key 可能带篇章后缀 '5 of 7 · A'）；先认领者优先
        for (let mi = 0; mi < marks.length; mi++) {
            const mk = marks[mi];
            const km = mk.key.match(/^(Passage [A-D]|5 of 7|Cloze|Blank Filling|Continuation Writing)(?:\s*·\s*[A-D])?$/);
            if (!km) continue;
            const base = km[1];
            if (index[mk.key]) continue;   // 首份试卷优先，合卷尾部/重复不覆盖
            const ni = nextMarkIdx(mi);
            const slice = collectSlice(mk.i + 1, ni < marks.length ? marks[ni].i : doc.length);
            const out = trimExamSlice(slice, base);
            if (out && (out.match(/[A-Za-z]/g) || []).length >= 100) {
                index[mk.key] = { text: out, sourceId: sourceId, pageStart: slice.length ? slice[0].pageIdx : null };
            }
        }
        return index;
    }

    // 按切片内容反推题型（试卷小节标题不带题型词时）
    function classifySectionSlice(slice) {
        if (!slice || slice.length < 3) return null;
        const hasBlank = t => /[_＿]{2,}\s*\d{1,2}|\d{1,2}\s*[_＿]{2,}/.test(t);
        const numOpt = slice.filter(l => /^\d{1,2}\s*[.．、]\s*[A-D][.．、]\s*\S/.test(l.text));
        const blanks = slice.filter(l => hasBlank(l.text));
        let optBlock = false;
        for (let k = 0; k < slice.length - 2; k++) {
            const a = slice[k].text.match(/^([A-H])\s*[.．、]\s*\S/);
            if (!a) continue;
            for (let j = k + 1; j <= k + 3 && j < slice.length; j++) {
                const b = slice[j].text.match(/^([A-H])\s*[.．、]\s*\S/);
                if (b && b[1].charCodeAt(0) === a[1].charCodeAt(0) + 1) { optBlock = true; break; }
            }
            if (optBlock) break;
        }
        if (numOpt.length >= 3) return 'Cloze';
        if (blanks.length && optBlock) return '5 of 7';
        if (blanks.length) {
            const nums = blanks.map(l => {
                const m = l.text.match(/[_＿]{2,}\s*(\d{1,2})|(\d{1,2})\s*[_＿]{2,}/);
                return m ? Number(m[1] || m[2]) : 0;
            }).filter(Boolean);
            const minN = nums.length ? Math.min.apply(null, nums) : 99;
            return minN >= 46 ? 'Blank Filling' : '5 of 7';
        }
        return null;
    }

    // 答题横线清理：≥4连下划线（后面不接数字，即答题栏横线）替换为空格；
    // 带题号空格 ___41___ 保留；词尾粘连的下划线剥掉；纯下划线token删除
    function stripAnswerLines(t) {
        let s = String(t || '')
            .replace(/_{4,}(?!\d)/g, ' ')
            .replace(/[A-Za-z。，；！”"')\]]_{2,}/g, m => m.replace(/_+$/, ''));
        return s.split(/\s+/).filter(w => w && !/^_+$/.test(w)).join(' ').trim();
    }

    // 切片清洗：剔除中文指令行、按题型截掉题目/选项区，返回带段落结构的文本
    function trimExamSlice(slice, key) {
        if (!slice.length) return '';
        let src = slice;
        if (key === 'Continuation Writing') {
            // 答题卡式段首句 → 标准化为 "Paragraph N: 句子"（供Composition联动识别）。必须在stripAnswerLines之前处理（后者吃掉下划线）。
            // 两遍状态机：句1与句2常落在不同重组段（句1与story末段粘连、句2独立），单行判定凑不齐两条——
            // 第一遍全切片收集候选段首句（含长答题线串的段），凑齐≥2条才依次编号（防story单段误配）
            const arr = slice.filter(l => (l.text || '').trim());
            const openerAt = new Map();   // 行号→句子（null=已是标准Paragraph行）
            for (let k = 0; k < arr.length; k++) {
                const txt = String(arr[k].text || '').trim();
                if (/^para(?:graph)?\s*[12]\s*[:：]/i.test(txt)) { openerAt.set(k, null); continue; }
                if (!/[_＿]{4,}/.test(txt)) continue;   // 无长答题线串的段不参与（story正文天然免疫）
                // 形态①句+线同行且句以句读结尾："As he... mist.____"（句内无线防粘连错切）
                const m1 = txt.match(/^([A-Z][\s\S]{8,}?[.!?])\s*[_＿]{2,}/);
                if (m1 && !/[_＿]{4,}/.test(m1[1])) { openerAt.set(k, m1[1].trim()); continue; }
                // 形态②独立短句行+后随纯答题线行（句尾标点可选：部分卷面段首句行尾不印句号）
                if (/^[A-Z][\s\S]{19,119}[.!?]?$/.test(txt)
                    && arr.slice(k + 1, k + 3).some(x => /^[_＿\s]{6,}$/.test(String(x.text || '').trim()))) { openerAt.set(k, txt); continue; }
                // 形态③重组粘连段（"...ruined. Daniel...train 线 线"：story末段+句1同段）：
                //   split线串取非空part，超长part取最后一个句读后的新句子（段尾句=段首句）
                const parts = txt.split(/[_＿]{4,}/)
                    .map(x => {
                        let t = x.replace(/\s+/g, ' ').trim();
                        if (t.length > 119) {
                            const mE = t.match(/[.!?]["')\]]?\s+([A-Z][^.!?]{9,118})$/);
                            t = mE ? mE[1].trim() : '';
                        }
                        return t.replace(/[.!?]$/, '').trim();
                    })
                    .filter(x => /^[A-Z][\s\S]{9,119}$/.test(x));
                if (parts.length >= 1) openerAt.set(k, parts[parts.length - 1]);
            }
            const openerLines = [...openerAt.entries()].sort((a, b) => a[0] - b[0]);
            const out = [];
            if (openerLines.length >= 2 || openerLines.some(e => e[1] === null)) {
                let seq = 0;
                const seqMap = new Map();
                openerLines.forEach(([k, sent]) => { if (sent !== null) { seq++; seqMap.set(k, seq + '' + sent); } });
                for (let k = 0; k < arr.length; k++) {
                    if (seqMap.has(k)) {
                        const m = seqMap.get(k).match(/^(\d+)([\s\S]*)$/);
                        out.push({ text: 'Paragraph ' + m[1] + ': ' + m[2], pageIdx: arr[k].pageIdx, isParaHead: arr[k].isParaHead });
                    } else out.push(arr[k]);
                }
                src = out;
            }
            src = out;
        }
        let lines = src.filter(l => !isCnInstructionLine(l.text))
            .map(l => ({ text: stripAnswerLines(l.text), pageIdx: l.pageIdx, isParaHead: l.isParaHead }))
            .filter(l => l.text);
        if (!lines.length) return '';
        if (key === '5 of 7') {
            // 找选项组：连续≥3行 A./B./C.带内容
            let optStart = -1;
            for (let k = 0; k < lines.length - 2; k++) {
                const a = lines[k].text.match(/^([A-H])\s*[.．、]\s*\S/);
                if (!a) continue;
                for (let j = k + 1; j <= k + 3 && j < lines.length; j++) {
                    const b = lines[j].text.match(/^([A-H])\s*[.．、]\s*\S/);
                    if (b && b[1].charCodeAt(0) === a[1].charCodeAt(0) + 1) { optStart = k; break; }
                }
                if (optStart > -1) break;
            }
            if (optStart > -1) {
                const before = lines.slice(0, optStart).map(l => l.text).join('\n');
                const after = lines.slice(optStart).map(l => l.text).join('\n');
                const hasBlank = t => /[_＿]{2,}\s*\d{0,2}|\d{0,2}\s*[_＿]{2,}/.test(t);
                // 选项在前、带空格的语篇在后 → 取后段；否则取前段
                lines = (hasBlank(before) || !hasBlank(after)) ? lines.slice(0, optStart) : lines.slice(optStart);
            }
        } else if (key === 'Cloze' || /^Passage [A-D]$/.test(key)) {
            // 截掉正文后的题目/选项区（第一个题干行之前）
            for (let k = 1; k < lines.length; k++) {
                if (isQuestionStemLine(lines[k].text)) { lines = lines.slice(0, k); break; }
            }
        }
        // 按段落标记重组（isParaHead=页面文本的段首行；mmCustomText 按\n\n分段，MindMap 直接可用）
        return assembleParas(lines);
    }

    // 组装段落文本（isParaHead=页面文本的段首行；mmCustomText 按\n\n分段，MindMap 直接可用）
    function assembleParas(lines) {
        let out = '';
        lines.forEach((l, i) => {
            if (i === 0) { out = l.text; return; }
            out += (l.isParaHead ? '\n\n' : '\n') + l.text;
        });
        return out;
    }

    // 读后续写独立解析（不走examIndex，直接扫原始页文本——简化方案）
    function parseContinuationRaw(raw) {
        const s = String(raw || '');
        const head = s.match(/读后续写|根据其内容和所给段落开头语续写/);
        if (!head) return null;
        const lines = s.slice(s.indexOf(head[0])).split(/\n/).map(x => x.trim()).filter(Boolean);
        // ① 跳过头部：标题/指令/注意块（pdf.js常把整块粘成一行，指令过滤同时作用于行内）
        const isHead = t => /^(读后续写|阅读下面材料|根据其内容|所给段落开头语|注意[：:])/.test(t) || /^\d+\s*[.、]\s*(续写词数|所续写|段落|请按|请用)/.test(t);
        let i = 0;
        while (i < lines.length && isHead(lines[i])) i++;
        // ② 原文：到答题区起点（含连续答题线的行块——pdf.js的textContent是视觉行块，原文/答题区各粘成一行）
        let j = i;
        while (j < lines.length && !/^para(?:graph)?\s*[12]\s*[:：.、]/i.test(lines[j]) && !/[_＿]{4,}/.test(lines[j])) j++;
        const enLines = lines.slice(i, j).filter(l => (l.match(/[一-龥]/g) || []).length / l.length < 0.5);
        const enAll = enLines.join('\n');
        if ((enAll.match(/[A-Za-z]/g) || []).length < 300) return null;   // 原文体量门槛（字符数而非行数）
        // ③ 段首句：答题区行内提取"句子+答题线"模式（两处）
        const zone = lines.slice(j).join(' ');
        const openers = [];
        let m;
        const reOpener = /([A-Z][^.!?]{15,160}?[.!?])(?=\s*[_＿]{4,})/g;   // 句子后紧跟答题线
        while ((m = reOpener.exec(zone)) !== null && openers.length < 2) openers.push(m[1].trim());
        if (openers.length < 2) {
            const reOpener2 = /(?:para(?:graph)?\s*[12]\s*[:：.、]\s*)([A-Z][^.!?]{15,160}?[.!?])/gi;
            while ((m = reOpener2.exec(zone)) !== null && openers.length < 2) openers.push(m[1].trim());
        }
        return { story: enLines, openers };
    }


    // 试卷结构应用文在前、读后续写在尾 → 多个"参考范文"标记时从后往前取（优先续写范文）
    // ★返回组数组：答案册常给"参考范文(一)(二)"两篇续写范文，全部收集（应用文标记的组排除，留给应用文管线）
    function extractSampleFromPages(joined) {
        const s = String(joined || '');
        const re = /(参考范文|One possible version|Possible version)\s*[:：]?\s*\n?/ig;
        const starts = [];
        let mm;
        while ((mm = re.exec(s)) !== null) {
            // 标记行自带板块前缀（"应用文参考范文"vs"读后续写参考范文"）：应用文组跳过
            if (/应用文/.test(s.slice(Math.max(0, mm.index - 10), mm.index))) continue;
            starts.push(mm.index + mm[0].length);
        }
        if (!starts.length) return null;
        const extractFrom = (start) => {
            const lines = s.slice(start).split(/\n/).map(x => x.trim()).filter(Boolean);
            const paras = [];
            let buf = [];
            for (const l of lines) {
                const cn = (l.match(/[一-龥]/g) || []).length / (l.length || 1);
                const cnShort = l.length <= 4 && /[一-龥]/.test(l);   // "(一)"类序号行：中文占比不足0.5但非正文
                const isLis = /^(Text\s*\d+\b|[MW]\s*[:：])/.test(l);   // 听力原文起始行：范文后常紧跟听力，须在此截断
                if (cn > 0.5 || cnShort || isLis) { if (buf.length) { paras.push(buf.join(' ')); buf = []; } if (paras.length >= 2) break; continue; }
                // ★答案册续写范文自带Paragraph N:标记且段1段2间无中文行——用标记行作段界（否则收不满2段会越界吞进听力区→isListening整组误杀）
                if (/^para(?:graph)?\s*\d\s*[:：]/i.test(l)) {
                    if (buf.length) { paras.push(buf.join(' ')); buf = []; if (paras.length >= 2) break; }
                }
                buf.push(l);
            }
            if (buf.length) paras.push(buf.join(' '));
            return paras.filter(p => (p.match(/[A-Za-z]/g) || []).length > 80);
        };
        /* 听力原文特征（Text N / M: / W: 对话）→ 弃该组继续往前找。
           ★只查组头400字：末标记（答案册最后一个范文）尾部常与听力粘连，MW冒号在段尾——
           那部分交给收尾切分的stopM截断，不该整组误杀 */
        const isListening = arr => arr.some(p => /^(Text\s*\d|M\s*[:：]|W\s*[:：])/i.test(p))
            || ((arr.join(' ').slice(0, 400).match(/\b[MW]\s*[:：]/g) || []).length >= 4);
        const groups = [];
        for (let gi = starts.length - 1; gi >= 0; gi--) {
            const en = extractFrom(starts[gi]);
            if (en.length && !isListening(en)) groups.push(en);   // 全部合格组收集（从后往前）
        }
        if (!groups.length) return null;
        groups.reverse();   // 反转=卷面正序（范文一、范文二…）
        return groups;      // ★组数组（收尾按段首句逐组切分后拼接）
    }

    // MindMap 联动：当前题型无文本时，从 hw.examIndex 自动填充
    function tryAutoLoadExamText(type) {
        const hw = getCurrentHomework();
        const idx = hw && hw.examIndex && hw.examIndex[type];
        if (!idx || !idx.text) return false;
        state.mmCustomText = idx.text;
        state.mmRoleFns = {};
        state.mmNodes = {};
        state.mmEdges = [];
        state.mmStructure = null;
        renderMmParas(idx.text);
        saveMmAnalysisToHw();
        notify('📄 已从试卷自动提取「' + type + '」原文，无需粘贴', 'success');
        return true;
    }

    // 语篇下拉菜单：给已识别到文本的题型加 📄 角标；一节多篇的语篇动态补菜单项
    function refreshMmDiscourseBadges() {
        const menu = document.getElementById('mmDiscourseMenu');
        if (!menu) return;
        const hw = getCurrentHomework();
        const idx = (hw && hw.examIndex) || {};
        menu.querySelectorAll('.dropdown-item').forEach(item => {
            const type = item.dataset.mmType || (item.getAttribute('onclick') || '').match(/selectDiscourse\('([^']+)'\)/)?.[1];
            if (!type) return;
            item.dataset.mmType = type;
            const flag = item.querySelector('.mm-exam-flag');
            if (idx[type] && idx[type].text) {
                if (!flag) {
                    const s = document.createElement('span');
                    s.className = 'mm-exam-flag';
                    s.title = '已从试卷自动识别';
                    s.textContent = ' 📄';
                    item.appendChild(s);
                }
            } else if (flag) {
                flag.remove();
            }
        });
        // 动态项：如 '5 of 7 · A'（试卷一节多篇）——先撤失效项，再补新项
        menu.querySelectorAll('.dropdown-item[data-dynamic-item]').forEach(item => {
            const k = item.getAttribute('data-mm-type');
            if (!idx[k] || !idx[k].text) item.remove();
        });
        Object.keys(idx).forEach(k => {
            if (!idx[k] || !idx[k].text) return;
            if (menu.querySelector('.dropdown-item[data-mm-type="' + (window.CSS && CSS.escape ? CSS.escape(k) : k) + '"]')) return;
            let sec = menu.querySelector('.mm-menu-section[data-dynamic-sec]');
            if (!sec) {
                sec = document.createElement('div');
                sec.className = 'mm-menu-section';
                sec.setAttribute('data-dynamic-sec', '1');
                sec.textContent = 'From Exam 试卷';
                menu.appendChild(sec);
            }
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.setAttribute('data-mm-type', k);
            item.setAttribute('data-dynamic-item', '1');
            item.textContent = k;
            const flag = document.createElement('span');
            flag.className = 'mm-exam-flag';
            flag.title = '已从试卷自动识别';
            flag.textContent = ' 📄';
            item.appendChild(flag);
            item.addEventListener('click', () => AFR.selectDiscourse(k));
            menu.appendChild(item);
        });
        const dynSec = menu.querySelector('.mm-menu-section[data-dynamic-sec]');
        if (dynSec && !menu.querySelector('.dropdown-item[data-dynamic-item]')) dynSec.remove();
    }

    function selectDiscourse(type) {
        state.mmDiscourse = type;
        // 更新按钮显示文字
        const label = document.getElementById('mmDiscourseLabel');
        if (label) label.textContent = type;
        // 更新菜单项选中态
        document.querySelectorAll('#mmDiscourseMenu .dropdown-item').forEach(item => {
            item.classList.toggle('active', item.textContent.trim() === type);
        });
        // 关闭菜单
        const menu = document.getElementById('mmDiscourseMenu');
        if (menu) menu.classList.remove('show');
        // 切题型：重新加载该题型的数据 + 重新渲染
        loadMmAnalysisFromHw();
        if (state.mmCustomText) {
            renderMmParas(state.mmCustomText);
        } else if (tryAutoLoadExamText(state.mmDiscourse)) {
            // 📄 已从试卷自动提取原文（examIndex）
        } else {
            // 该题型无数据 → 左侧文本区显示空白提示（不再用占位演示文本）
            const body = document.getElementById('mmTextBody');
            const title = document.getElementById('mmTextTitle');
            if (body) body.innerHTML = '<div class="mm-empty-hint">No text for ' + escapeHtml(type) + '. Click 📁 Import or 📋 Paste.</div>';
            if (title) title.textContent = type + ' — Text';
            // 段落块也清空
            const pane2 = document.querySelector('.mm-step-pane[data-step-pane="2"]');
            if (pane2) pane2.innerHTML = '<div class="mm-empty-hint">Import or paste text first — paragraph blocks will appear here.</div>';
            // 节点画布也清空
            const canvas = document.getElementById('mmLinkCanvas');
            if (canvas) canvas.innerHTML = '<svg class="mm-link-svg" id="mmLinkSvg"></svg><div class="mm-empty-hint">Import or paste text first — paragraph nodes will appear here.</div>';
        }
    }

    // 渲染左侧文本（按题型）—— 目前用占位文本演示联动高亮
    function renderMmText(type) {
        const body = document.getElementById('mmTextBody');
        const title = document.getElementById('mmTextTitle');
        if (!body || !title) return;
        // 如果已有用户导入的文本，优先用导入的（切题型不覆盖用户文本）
        if (state.mmCustomText) {
            title.textContent = type + ' — Text';
            renderMmParas(state.mmCustomText);
            return;
        }
        title.textContent = type + ' — Text';
        // 占位：演示用5段文本（后续替换为真实文章数据）
        const demoParas = [
            '(Para 1) ' + type + ' opening paragraph — main idea introduced here.',
            '(Para 2) Supporting detail / first argument.',
            '(Para 3) Transition or further development.',
            '(Para 4) Counter-point or deeper analysis.',
            '(Para 5) Conclusion and restatement of the main idea.'
        ];
        body.innerHTML = demoParas.map((t, i) => `<p data-para="${i + 1}">${t}</p>`).join('');
    }

    // ===== Passage 文本 & 段落功能：按作业持久化（存IndexedDB，随Export导出）=====
    // 数据结构：hw.mmAnalysis = { text: string, roleFns: {1:'...', 2:'...'} }

    // 把当前 state 的语篇分析数据存进当前作业【按题型区分】
    // 数据结构：hw.mmAnalysis = { 'Passage A': {text,roleFns,nodes,edges}, 'Passage D': {...} }
    function saveMmAnalysisToHw() {
        const hw = getCurrentHomework();
        if (!hw) return;
        if (!hw.mmAnalysis) hw.mmAnalysis = {};
        hw.mmAnalysis[state.mmDiscourse] = {
            text: state.mmCustomText || '',
            roleFns: state.mmRoleFns || {},
            nodes: state.mmNodes || {},
            edges: state.mmEdges || [],
            levels: state.mmLevels || {},
            subject: state.mmSubject || { source:'', reader:'', type:'', matter:'', idea:'', tone:'' }
        };
        saveHomework(hw.id);   // 写IndexedDB（随Export导出）
    }

    // 一次性迁移：把旧版（不区分题型）的 mmAnalysis 数据搬到 'Passage D' 下
    // 旧版：hw.mmAnalysis = { text, roleFns, nodes, edges }
    // 新版：hw.mmAnalysis = { 'Passage D': { text, roleFns, nodes, edges } }
    function migrateMmAnalysisIfNeeded() {
        const hw = getCurrentHomework();
        if (!hw || !hw.mmAnalysis) return;
        const a = hw.mmAnalysis;
        // 检测旧结构：根下直接有 text 字段
        if (typeof a.text === 'string') {
            // 旧数据 → 搬到 Passage D（用户录入的真实题型）
            const oldData = {
                text: a.text || '',
                roleFns: a.roleFns || {},
                nodes: a.nodes || {},
                edges: a.edges || []
            };
            delete a.text; delete a.roleFns; delete a.nodes; delete a.edges;
            a['Passage D'] = oldData;
            saveHomework(hw.id);   // 持久化迁移结果
            console.log('[AFR] 迁移：旧语篇分析数据已搬到 Passage D');
        }
    }

    // 从当前作业加载【当前题型】的语篇分析
    function loadMmAnalysisFromHw() {
        const hw = getCurrentHomework();
        const data = (hw && hw.mmAnalysis && hw.mmAnalysis[state.mmDiscourse]) || null;
        if (data) {
            state.mmCustomText = data.text || '';
            state.mmRoleFns = data.roleFns || {};
            state.mmNodes = data.nodes || {};
            state.mmEdges = data.edges || [];
            state.mmLevels = data.levels || {};
            state.mmSubject = data.subject || { source:'', reader:'', type:'', matter:'', idea:'', tone:'' };
        } else {
            // 该题型无数据 → 显示空白
            state.mmCustomText = '';
            state.mmRoleFns = {};
            state.mmNodes = {};
            state.mmEdges = [];
            state.mmLevels = {};
            state.mmSubject = { source:'', reader:'', type:'', matter:'', idea:'', tone:'' };
        }
    }

    // 把原始文本按空行分段后渲染到文本区
    function renderMmParas(rawText) {
        const body = document.getElementById('mmTextBody');
        if (!body) return;
        // 按空行（连续换行）分段，过滤空段
        const paras = rawText.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
        if (paras.length === 0) {
            body.innerHTML = '<div class="mm-empty-hint">No text loaded</div>';
            renderMmRoles([]);   // 清空段落块
            return;
        }
        body.innerHTML = paras.map((t, i) => `<p data-para="${i + 1}">${escapeHtml(t)}</p>`).join('');
        // 同步生成 Paragraph Roles 段落块
        renderMmRoles(paras);
    }

    // ===== 左栏语篇正文：随六步工具栏 ✏️编辑/💾保存 联动（自动识别有误时可就地修正） =====
    // 整篇编辑模式：整个文本区作为一个大编辑器（Ctrl+A 全选整篇增删、整篇粘贴替换、回车新段）
    let mmTextEditDirty = false;   // 进入过编辑态未持久化（toggle 关闭只收内存，等 💾保存 落库）

    function setMmTextEditable(on) {
        const body = document.getElementById('mmTextBody');
        if (!body) return;
        if (on) {
            mmTextEditDirty = true;
            if (!body.querySelectorAll('p[data-para]').length) {
                body.innerHTML = '<p data-para="1"></p>';   // 空态也给一段可写：整篇快速新增入口
            }
            body.setAttribute('contenteditable', 'true');
            body.classList.add('mm-text-editing');
        } else {
            body.removeAttribute('contenteditable');
            body.classList.remove('mm-text-editing');
            const hasText = Array.from(body.children).some(el => (el.textContent || '').trim());
            if (!hasText) renderMmParas('');   // 整篇删空 → 恢复空态提示
        }
    }

    // 采集左栏编辑 → state.mmCustomText；persist=true 时落库当前作业（hw.mmAnalysis，刷新后仍生效）
    // persist 无论有无文本改动都会写库——toggle 关闭过的编辑（仅内存）也能被随后的 💾保存 持久化
    function commitMmTextEdit(persist) {
        const body = document.getElementById('mmTextBody');
        if (!body) return false;
        const editingNow = body.classList.contains('mm-text-editing');
        if (!editingNow && !mmTextEditDirty) return false;   // 没进过编辑态：不采集也不落库
        let changed = false;
        if (editingNow) {
            const paras = Array.from(body.children)
                .map(el => (el.textContent || '').replace(/\u00a0/g, ' ').trim())
                .filter(Boolean);   // contenteditable 回车/粘贴产生的块一律按段落收集；全删空=清空整篇
            const text = paras.join('\n\n');
            changed = text !== (state.mmCustomText || '');
            if (changed) {
                state.mmCustomText = text;
                renderMmParas(text);   // 段号规范化+Roles块同步；空文本→空态提示
            }
            setMmTextEditable(false);   // 收尾：去容器编辑态
        }
        let persisted = false;
        if (persist) {
            if (getCurrentHomework()) {
                saveMmAnalysisToHw();
                mmTextEditDirty = false;
                persisted = true;
            } else {
                notify('⚠ 语篇正文未存档：当前无作业——先点顶部 + 创建作业（或选择已有作业），编辑已暂存内存', 'error');
            }
        }
        return changed || persisted;
    }

    // 渲染 Paragraph Roles 段落块（step2）
    // paras: 段落数组（与左侧 data-para 一一对应）
    function renderMmRoles(paras) {
        const pane = document.querySelector('.mm-step-pane[data-step-pane="2"]');
        if (!pane) return;
        if (!paras || paras.length === 0) {
            pane.innerHTML = '<div class="mm-empty-hint">Import or paste text first — paragraph blocks will appear here.</div>';
            return;
        }
        pane.innerHTML = paras.map((t, i) => {
            const num = i + 1;
            const fn = (state.mmRoleFns && state.mmRoleFns[num]) || '';
            return `
                <div class="mm-role-block collapsed" data-role-para="${num}">
                    <div class="mm-role-head">
                        <span class="mm-role-num" onclick="AFR.popMmPara(${num})">Para ${num}</span>
                        <div class="mm-role-btns">
                            <button class="mm-role-btn" onclick="AFR.showMmRoleFn(${num}, event)">Show</button>
                            <button class="mm-role-btn" onclick="AFR.hideMmRoleFn(${num}, event)">Hide</button>
                        </div>
                    </div>
                    <div class="mm-role-fn">
                        <textarea class="mm-role-fn-area" placeholder="Function / role of this paragraph..." onclick="event.stopPropagation()" oninput="AFR.updateMmRoleFn(${num}, this.value)">${escapeHtml(fn)}</textarea>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 显示某段功能框
    function showMmRoleFn(num, ev) {
        if (ev) ev.stopPropagation();
        const block = document.querySelector(`.mm-role-block[data-role-para="${num}"]`);
        if (!block) return;
        block.classList.remove('collapsed');
        // 更新按钮高亮态
        block.querySelectorAll('.mm-role-btn').forEach((b, i) => b.classList.toggle('on', i === 0));
    }

    // 隐藏某段功能框
    function hideMmRoleFn(num, ev) {
        if (ev) ev.stopPropagation();
        const block = document.querySelector(`.mm-role-block[data-role-para="${num}"]`);
        if (!block) return;
        block.classList.add('collapsed');
        block.querySelectorAll('.mm-role-btn').forEach(b => b.classList.remove('on'));
    }

    // 点击右侧段落块 → 左侧对应段落凸出
    function popMmPara(num) {
        const body = document.getElementById('mmTextBody');
        if (!body) return;
        // 清除所有凸出和段落块激活态
        body.querySelectorAll('p').forEach(p => p.classList.remove('mm-pop'));
        document.querySelectorAll('.mm-role-block').forEach(b => b.classList.remove('active'));
        // 高亮目标段落
        const target = body.querySelector(`p[data-para="${num}"]`);
        if (target) {
            target.classList.add('mm-pop');
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        const block = document.querySelector(`.mm-role-block[data-role-para="${num}"]`);
        if (block) block.classList.add('active');
    }

    // 更新段落功能（防抖存盘，避免每次输入都写库）
    let mmRoleFnSaveTimer = null;

    // ===== Subject Matter 四要素 =====
    // 当前模式：默认 'hide'（打开网页答案隐藏，准备好让学生回答）
    state.mmSubjectMode = 'hide';

    // 渲染六要素（把数据填进输入框 + 同步模式按钮高亮）
    function renderMmSubject() {
        const s = state.mmSubject || { source:'', reader:'', type:'', matter:'', idea:'', tone:'' };
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
        set('mmSource', s.source);
        set('mmReader', s.reader);
        set('mmTextType', s.type);
        set('mmSubjectMatter', s.matter);
        set('mmMainIdea', s.idea);
        set('mmTone', s.tone);
        setMmSubjectMode(state.mmSubjectMode || 'edit', true);
    }

    // 设置课堂模式：edit / show / hide
    function setMmSubjectMode(mode, skipNotify) {
        state.mmSubjectMode = mode;
        const wrap = document.querySelector('.mm-subject-wrap');
        if (!wrap) return;
        // 切换 hide 模式（遮罩答案）
        wrap.classList.toggle('mode-hide', mode === 'hide');
        // 输入框只读：hide 时只读，edit/show 可编辑
        ['mmSource','mmReader','mmSubjectMatter','mmMainIdea','mmTextType','mmTone'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.readOnly = (mode === 'hide');
        });
        // 按钮高亮（用 .active，和顶部 Tab 一致）
        const showBtn = document.getElementById('mmSubjectShowBtn');
        const hideBtn = document.getElementById('mmSubjectHideBtn');
        if (showBtn) showBtn.classList.toggle('active', mode === 'show');
        if (hideBtn) hideBtn.classList.toggle('active', mode === 'hide');
    }

    // 实时更新某个 subject 字段（输入时）
    // Apply 期间用 state.mmSilent 标志禁用自动保存（避免时序错乱）
    function updateMmSubject(field, value) {
        if (!state.mmSubject) state.mmSubject = { source:'', reader:'', type:'', matter:'', idea:'', tone:'' };
        state.mmSubject[field] = value;
        if (state.mmSilent) return;   // Apply 期间不自动保存
        clearTimeout(mmRoleFnSaveTimer);
        mmRoleFnSaveTimer = setTimeout(saveMmAnalysisToHw, 800);
    }
    function updateMmRoleFn(num, value) {
        if (!state.mmRoleFns) state.mmRoleFns = {};
        state.mmRoleFns[num] = value;
        clearTimeout(mmRoleFnSaveTimer);
        mmRoleFnSaveTimer = setTimeout(saveMmAnalysisToHw, 800);   // 停止输入800ms后存
    }

    // 更新段落层级（Build Map 分层用）
    function updateMmLevel(num, level) {
        if (!state.mmLevels) state.mmLevels = {};
        state.mmLevels[num] = Number(level) || 1;
        saveMmAnalysisToHw();
    }

    // ===== Logic Links 节点连线（Blender式）=====
    // 六大关系类型（颜色 + 标签）
    const MM_LINK_TYPES = [
        { key: 'progression', label: '递进 Progression', color: '#1890ff' },
        { key: 'contrast',    label: '转折 Contrast',    color: '#f5222d' },
        { key: 'causality',   label: '因果 Causality',   color: '#fadb14' },   // 黄色（原橙色与红色太近）
        { key: 'parallel',    label: '并列 Parallel',    color: '#52c41a' },
        { key: 'concession',  label: '让步 Concession',  color: '#722ed1' },
        { key: 'example',     label: '举例 Example',     color: '#13c2c2' },
    ];
    // 当前选中的关系类型（默认递进）
    state.mmLinkType = 'progression';
    // 节点位置 {段落号: {x, y}}，按作业持久化
    state.mmNodes = {};
    // 连线 [{from: 段号, to: 段号, type: 关系key}]
    state.mmEdges = [];
    // 段落层级 {段落号: 层级1-6}（Build Map 用）
    state.mmLevels = {};
    // Subject Matter 六要素（按认知顺序）
    state.mmSubject = { source: '', reader: '', type: '', matter: '', idea: '', tone: '' };
    // Apply 期间静默标志：禁用 oninput 的自动保存，避免时序错乱
    state.mmSilent = false;

    // 渲染关系类型工具栏
    function renderMmLinkToolbar() {
        const tb = document.getElementById('mmLinkToolbar');
        if (!tb) return;
        tb.innerHTML = `<span class="mm-link-toolbar-label">Link type:</span>` +
            MM_LINK_TYPES.map(t => `
                <button class="mm-link-type-btn ${t.key === state.mmLinkType ? 'active' : ''}"
                    data-type="${t.key}"
                    onclick="AFR.selectMmLinkType('${t.key}')"
                    style="${t.key === state.mmLinkType ? 'background:' + t.color + ';border-color:' + t.color : ''}">
                    <span class="mm-type-dot" style="background:${t.color}"></span>${t.label}
                </button>
            `).join('') +
            `<button class="mm-link-clear-btn" onclick="AFR.clearMmEdges()" title="Delete all links">🗑 Clear</button>`;
    }

    // 清空所有连线
    function clearMmEdges() {
        if (state.mmEdges.length === 0) return;
        if (!confirm('Delete ALL links?')) return;
        state.mmEdges = [];
        renderMmEdges();
        saveMmAnalysisToHw();
    }

    // ===== Step4 Build Map：分层卡片式思维导图（ASI导图风格，全英文）=====
    // 按段落"层级(Tier)"纵向分层，同层横向并列；层间用步骤3的关系箭头连接
    let mmBuildResizeObs = null;

    // Apply Analysis：读取 discourse-data.json 批量填充步骤1-4
    async function applyDiscourseAnalysis() {
        try {
            // 【关键】先取消所有待执行的防抖保存（防止旧数据在切题型后误存到新题型）
            clearTimeout(mmRoleFnSaveTimer);
            // 先把当前 state 存到【当前】discourse（保存用户可能在看的题型的最新编辑）
            saveMmAnalysisToHw();

            // fetch discourse-data.json
            let resp;
            try {
                resp = await fetch('discourse-data.json?_=' + Date.now(), { cache: 'no-store' });
            } catch (fetchErr) {
                notify('Cannot read discourse-data.json (network/server). Let AI analyze first.', 'error');
                console.error('[AFR] fetch error:', fetchErr);
                return;
            }
            if (resp.status === 404) {
                notify('discourse-data.json not found. Let AI analyze the article first.', 'error');
                return;
            }
            if (!resp.ok) {
                notify('Read failed (HTTP ' + resp.status + ').', 'error');
                return;
            }
            const txt = await resp.text();
            let data;
            try { data = JSON.parse(txt); }
            catch (parseErr) {
                notify('discourse-data.json is invalid JSON.', 'error');
                console.error('[AFR] JSON parse error:', parseErr, '内容前100字:', txt.slice(0, 100));
                return;
            }
            // 【关键】开启静默模式：填充期间禁用 oninput 触发的自动保存
            state.mmSilent = true;
            try {
                // 1. 切换 Discourse 题型（如指定）
                if (data.discourse) {
                    state.mmDiscourse = data.discourse;
                    const lbl = document.getElementById('mmDiscourseLabel');
                    if (lbl) lbl.textContent = data.discourse;
                    loadMmAnalysisFromHw();   // 加载目标题型的数据（清空 state）
                }
                // 2. 填充 Subject Matter 六要素
                if (data.subject) {
                    state.mmSubject = Object.assign({ source:'', reader:'', type:'', matter:'', idea:'', tone:'' }, data.subject);
                }
                // 3. 填充 Passage 文本
                if (data.paragraphs && Array.isArray(data.paragraphs)) {
                    state.mmCustomText = data.paragraphs.join('\n\n');
                }
                // 4. 填充各段功能
                if (data.roleFns) {
                    state.mmRoleFns = {};
                    Object.keys(data.roleFns).forEach(k => { state.mmRoleFns[Number(k)] = data.roleFns[k]; });
                }
                // 5. 填充连线
                if (data.edges) {
                    state.mmEdges = data.edges.map(e => ({ from: Number(e.from), to: Number(e.to), type: e.type }));
                }
                // 6. 重置节点位置
                state.mmNodes = {};
            } finally {
                state.mmSilent = false;   // 关闭静默
            }
            // 7. 存盘（此时 discourse 已是目标题型，存到正确位置）
            saveMmAnalysisToHw();
            // 8. 重新渲染
            renderMmSubject();
            if (state.mmCustomText) renderMmParas(state.mmCustomText);
            notify('✓ Analysis applied! Check Steps 1-4.', 'success');
        } catch (err) {
            console.error('[AFR] applyDiscourseAnalysis unexpected error:', err);
            notify('Apply failed: ' + (err.message || 'unknown'), 'error');
        }
    }
    function renderMmBuild() {
        const canvas = document.getElementById('mmBuildCanvas');
        if (!canvas) return;
        if (!mmBuildResizeObs) {
            mmBuildResizeObs = new ResizeObserver(() => {
                clearTimeout(window.__mmBuildResizeTimer);
                window.__mmBuildResizeTimer = setTimeout(renderMmBuild, 100);
            });
        }
        mmBuildResizeObs.disconnect();
        mmBuildResizeObs.observe(canvas);
        renderMmBuildNow();
    }

    function renderMmBuildNow() {
        const canvas = document.getElementById('mmBuildCanvas');
        if (!canvas) return;
        const subj = state.mmSubject || {};
        const paras = state.mmCustomText ? state.mmCustomText.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean) : [];

        if (paras.length === 0) {
            canvas.innerHTML = '<div class="mm-empty-hint">Import text and complete Steps 1-3 first — the mind map will auto-generate here.</div>';
            return;
        }

        const total = paras.length;
        const introNums = total >= 1 ? [1] : [];
        const conclNums = total >= 2 ? [total] : [];
        const bodyNums = [];
        for (let i = 2; i <= total - 1; i++) bodyNums.push(i);

        // 配色
        const introColor = '#3b82f6';   // 蓝
        const conclColor = '#ef4444';   // 红
        const bodyColor = '#10b981';    // 绿

        // 中心节点（Subject Matter）
        let html = '';
        const centerSub = [subj.type, subj.tone].filter(Boolean).join(' · ');
        html += `<div class="mmb-center" style="background:${introColor};">
            <div class="mmb-center-title">${escapeHtml(subj.matter || 'Subject Matter')}</div>
            ${centerSub ? `<div class="mmb-center-sub">${escapeHtml(centerSub)}</div>` : ''}
            ${subj.idea ? `<div class="mmb-center-idea">${escapeHtml(subj.idea)}</div>` : ''}
        </div>`;

        // Introduction
        if (introNums.length) {
            html += renderMmPillArrow('Lead-in');
            html += `<div class="mmb-section">
                <div class="mmb-section-label" style="background:${introColor};">Introduction</div>
                <div class="mmb-cards">${introNums.map(n => renderMmCardRich(n, paras[n-1], introColor)).join('')}</div>
            </div>`;
        }
        // Body（段落纵向排列，段间用步骤3关系箭头）
        if (bodyNums.length) {
            html += renderMmPillArrow(getMmRelName(1, bodyNums[0]));
            html += `<div class="mmb-section">
                <div class="mmb-section-label" style="background:${bodyColor};">Body</div>
                <div class="mmb-cards">`;
            bodyNums.forEach((num, i) => {
                if (i > 0) {
                    html += renderMmPillArrow(getMmRelName(bodyNums[i-1], num));
                }
                html += renderMmCardRich(num, paras[num-1], bodyColor);
            });
            html += `</div></div>`;
        }
        // Conclusion
        if (conclNums.length) {
            html += renderMmPillArrow(getMmRelName(bodyNums[bodyNums.length-1] || 1, conclNums[0]));
            html += `<div class="mmb-section">
                <div class="mmb-section-label" style="background:${conclColor};">Conclusion</div>
                <div class="mmb-cards">${conclNums.map(n => renderMmCardRich(n, paras[n-1], conclColor)).join('')}</div>
            </div>`;
        }

        canvas.innerHTML = html;
    }

    // 关系 pill 箭头（ASI导图风格）
    function renderMmPillArrow(label) {
        return `<div class="mmb-pill-arrow"><div class="mmb-pill">↓ ${escapeHtml(label)}</div></div>`;
    }

    // 取两段间的关系名（中文→英文短词），无则返回 'next'
    function getMmRelName(from, to) {
        if (!from || !to) return 'next';
        const edge = state.mmEdges.find(e =>
            (e.from === from && e.to === to) || (e.from === to && e.to === from));
        if (!edge) return 'next';
        const type = MM_LINK_TYPES.find(t => t.key === edge.type);
        return type ? type.label.split(' ')[0] : 'next';
    }

    // 富内容卡片（ASI导图风格：seg + head + desc + kw）
    function renderMmCardRich(num, paraText, color) {
        const fn = (state.mmRoleFns && state.mmRoleFns[num]) || '';
        // head = 功能的主标题（取功能第一句或前几个词）
        const head = fn ? escapeHtml(fn.split(/[.;。；]/)[0].trim() || fn) : '<span style="color:#bbb">(no function set)</span>';
        // desc = 段落原文首句
        const desc = paraText ? escapeHtml((paraText.match(/^[^.!?\n]*[.!?]?/) || [''])[0].trim()) : '';
        // kw = 从功能里提取关键词（前2个实义词）
        const kwWords = (fn || '').toLowerCase().split(/[\s,.;:，。；]+/).filter(w =>
            w.length > 3 && !['with','that','this','from','about','into','supports'].includes(w)).slice(0, 2);
        const kwHtml = kwWords.map(w => `<span class="mmb-kw">${escapeHtml(w)}</span>`).join(' ');
        return `<div class="mmb-rcard" style="border-top-color:${color};">
            <span class="mmb-rseg" style="background:${color};">Para ${num}</span>
            <div class="mmb-rhead">${head}</div>
            <div class="mmb-rdesc">${desc}</div>
            ${kwHtml ? `<div class="mmb-rkw">${kwHtml}</div>` : ''}
        </div>`;
    }

    // 渲染单个段落卡片（旧版，保留兼容）
    function renderMmCard(num, color) {
        return renderMmCardRich(num, '', color);
    }

    // 渲染一个 section（旧版，保留兼容）
    function renderMmSection(title, color, nums) {
        return '';
    }

    // Body 段落按步骤3 连线关系组织布局，并提炼每行的"内容主题"
    //   parallel/example = 横向并排（同一行，同主题）
    //   其他 = 纵向换行，行间标关系箭头
    // 每行带 topic：从段落功能提炼的主题（如"safety issues"）
    function layoutMmBodyByEdges(bodyNums) {
        if (bodyNums.length === 0) return [];
        const layout = [{ nums: [bodyNums[0]], rel: '', topic: extractMmTopic(bodyNums[0]) }];
        for (let i = 1; i < bodyNums.length; i++) {
            const cur = bodyNums[i];
            const prev = bodyNums[i - 1];
            const edge = state.mmEdges.find(e =>
                (e.from === prev && e.to === cur) || (e.from === cur && e.to === prev));
            const type = edge ? (MM_LINK_TYPES.find(t => t.key === edge.type)) : null;
            const relName = type ? type.label.split(' ')[0] : '';
            const relColor = type ? type.color : '';
            if (edge && (edge.type === 'parallel' || edge.type === 'example')) {
                // 横向并排：加到当前行（同主题）
                layout[layout.length - 1].nums.push(cur);
            } else {
                // 纵向换行：新行，带主题和关系
                layout.push({ nums: [cur], rel: relName, relColor: relColor, topic: extractMmTopic(cur) });
            }
        }
        return layout;
    }

    // 从段落功能描述提炼主题（提取核心名词短语）
    function extractMmTopic(num) {
        const fn = (state.mmRoleFns && state.mmRoleFns[num]) || '';
        if (!fn) return '';
        // 取功能描述里 "—" 或 "-" 后的部分（通常是主题），否则取前几个词
        let topic = fn.split(/[—\-–:：]/)[1] || fn;
        topic = topic.trim();
        // 截到前6个词，避免太长
        const words = topic.split(/\s+/).slice(0, 6).join(' ');
        return words.replace(/\.$/, '');
    }



    // 选中关系类型
    function selectMmLinkType(key) {
        state.mmLinkType = key;
        renderMmLinkToolbar();
    }

    // 渲染所有段落节点（根据Passage段落数）
    function renderMmNodes() {
        const canvas = document.getElementById('mmLinkCanvas');
        if (!canvas) return;
        const paras = state.mmCustomText ? state.mmCustomText.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean) : [];
        if (paras.length === 0) {
            canvas.innerHTML = '<svg class="mm-link-svg" id="mmLinkSvg"></svg><div class="mm-empty-hint">Import or paste text first — paragraph nodes will appear here.</div>';
            return;
        }
        // 保留 SVG 层
        const svg = canvas.querySelector('#mmLinkSvg');
        canvas.innerHTML = '';
        const svgNew = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgNew.setAttribute('class', 'mm-link-svg');
        svgNew.id = 'mmLinkSvg';
        canvas.appendChild(svgNew);

        // 节点默认纵向错落排列（首次）
        paras.forEach((t, i) => {
            const num = i + 1;
            // 位置：未存过则默认排开
            if (!state.mmNodes[num]) {
                state.mmNodes[num] = { x: 40 + (i % 3) * 220, y: 30 + Math.floor(i / 3) * 160 };
            }
            const fn = (state.mmRoleFns && state.mmRoleFns[num]) || '';
            const node = document.createElement('div');
            node.className = 'mm-node';
            node.dataset.node = num;
            node.style.left = state.mmNodes[num].x + 'px';
            node.style.top = state.mmNodes[num].y + 'px';
            node.innerHTML = `
                <div class="mm-port port-top" data-port="top" data-node="${num}"></div>
                <div class="mm-node-body">
                    <span class="mm-node-num">Para ${num}</span>
                    <div class="mm-node-fn ${fn ? '' : 'empty'}">${fn ? escapeHtml(fn) : '(no function set)'}</div>
                </div>
                <div class="mm-port port-bottom" data-port="bottom" data-node="${num}"></div>
            `;
            canvas.appendChild(node);
        });
        renderMmEdges();
        setupMmNodeDrag();
        setupMmPortConnect();
    }

    // 节点拖动
    function setupMmNodeDrag() {
        document.querySelectorAll('.mm-node').forEach(node => {
            node.addEventListener('mousedown', (e) => {
                // 点圆点（连接桩）不触发拖动
                if (e.target.classList.contains('mm-port')) return;
                const num = Number(node.dataset.node);
                const canvas = document.getElementById('mmLinkCanvas');
                const rect = canvas.getBoundingClientRect();
                let startX = e.clientX, startY = e.clientY;
                let origX = state.mmNodes[num].x, origY = state.mmNodes[num].y;
                node.classList.add('dragging');

                function onMove(ev) {
                    let nx = origX + (ev.clientX - startX);
                    let ny = origY + (ev.clientY - startY);
                    nx = Math.max(0, nx);
                    ny = Math.max(0, ny);
                    node.style.left = nx + 'px';
                    node.style.top = ny + 'px';
                    state.mmNodes[num].x = nx;
                    state.mmNodes[num].y = ny;
                    renderMmEdges();
                }
                function onUp() {
                    node.classList.remove('dragging');
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    saveMmAnalysisToHw();   // 存位置
                }
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
                e.preventDefault();
            });
        });
    }

    // 计算圆点在画布中的中心坐标（用于画线起止点）
    function portCenter(num, which) {
        const node = document.querySelector(`.mm-node[data-node="${num}"]`);
        const canvas = document.getElementById('mmLinkCanvas');
        if (!node || !canvas) return null;
        const nr = node.getBoundingClientRect();
        const cr = canvas.getBoundingClientRect();
        // 节点宽180，圆点在中央。top在节点顶部，bottom在底部
        const x = nr.left - cr.left + canvas.scrollLeft + nr.width / 2;
        const y = which === 'top'
            ? nr.top - cr.top + canvas.scrollTop
            : nr.top - cr.top + canvas.scrollTop + nr.height;
        return { x, y };
    }

    // 画贝塞尔曲线路径（从上/下圆点出，自然弯曲）
    function edgePath(from, to) {
        const dy = Math.abs(to.y - from.y);
        const offset = Math.max(40, dy * 0.5);   // 控制点偏移，决定弯曲度
        return `M ${from.x} ${from.y} C ${from.x} ${from.y + offset}, ${to.x} ${to.y - offset}, ${to.x} ${to.y}`;
    }

    // 渲染所有连线（持久化的 edges）
    function renderMmEdges() {
        const svg = document.getElementById('mmLinkSvg');
        if (!svg) return;
        svg.innerHTML = '';
        state.mmEdges.forEach((edge, idx) => {
            // from用bottom，to用top（默认段落从上往下连）
            const from = portCenter(edge.from, 'bottom');
            const to = portCenter(edge.to, 'top');
            if (!from || !to) return;
            const type = MM_LINK_TYPES.find(t => t.key === edge.type) || MM_LINK_TYPES[0];
            const d = edgePath(from, to);
            // 透明粗hit-area：专门接收双击，线以外不挡节点
            const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            hit.setAttribute('class', 'mm-edge-hit');
            hit.setAttribute('d', d);
            hit.setAttribute('data-edge-idx', idx);
            hit.addEventListener('dblclick', (ev) => { ev.stopPropagation(); AFR.deleteMmEdge(idx); });
            svg.appendChild(hit);
            // 实际可见线
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('class', 'mm-edge');
            path.setAttribute('d', d);
            path.setAttribute('stroke', type.color);
            svg.appendChild(path);
            // 标签（中点）
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('class', 'mm-edge-label');
            text.setAttribute('x', midX);
            text.setAttribute('y', midY);
            text.setAttribute('fill', type.color);
            text.textContent = type.label.split(' ')[0];   // 只显示中文
            svg.appendChild(text);
        });
        // 更新圆点连接状态：每个圆点独立——from的bottom实心，to的top实心
        document.querySelectorAll('.mm-port').forEach(port => port.classList.remove('connected'));
        state.mmEdges.forEach(ed => {
            const fromBottom = document.querySelector(`.mm-port.port-bottom[data-node="${ed.from}"]`);
            const toTop = document.querySelector(`.mm-port.port-top[data-node="${ed.to}"]`);
            if (fromBottom) fromBottom.classList.add('connected');
            if (toTop) toTop.classList.add('connected');
        });
    }

    // 圆点连线：点圆点拖出曲线，松手命中另一圆点则建连
    function setupMmPortConnect() {
        document.querySelectorAll('.mm-port').forEach(port => {
            port.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                const fromNode = Number(port.dataset.node);
                const fromWhich = port.dataset.port;   // top/bottom
                const svg = document.getElementById('mmLinkSvg');
                const canvas = document.getElementById('mmLinkCanvas');
                if (!svg || !canvas) return;

                // 临时路径
                const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                tempPath.setAttribute('class', 'mm-edge-temp');
                const type = MM_LINK_TYPES.find(t => t.key === state.mmLinkType) || MM_LINK_TYPES[0];
                tempPath.setAttribute('stroke', type.color);
                svg.appendChild(tempPath);

                function fromXY() {
                    return portCenter(fromNode, fromWhich);
                }
                function onMove(ev) {
                    const from = fromXY();
                    if (!from) return;
                    const cr = canvas.getBoundingClientRect();
                    const to = { x: ev.clientX - cr.left + canvas.scrollLeft, y: ev.clientY - cr.top + canvas.scrollTop };
                    tempPath.setAttribute('d', edgePath(from, to));
                }
                function onUp(ev) {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    tempPath.remove();
                    // 命中检测：松手处的元素是否是另一个圆点
                    const target = document.elementFromPoint(ev.clientX, ev.clientY);
                    if (target && target.classList.contains('mm-port')) {
                        const toNode = Number(target.dataset.node);
                        if (toNode !== fromNode) {
                            // 避免重复连线
                            const exists = state.mmEdges.some(ed =>
                                (ed.from === fromNode && ed.to === toNode) || (ed.from === toNode && ed.to === fromNode));
                            if (!exists) {
                                state.mmEdges.push({ from: fromNode, to: toNode, type: state.mmLinkType });
                                renderMmEdges();
                                saveMmAnalysisToHw();
                            }
                        }
                    }
                }
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
                e.preventDefault();
            });
        });
    }

    // 删除连线（双击触发，直接删不弹框）
    function deleteMmEdge(idx) {
        state.mmEdges.splice(idx, 1);
        renderMmEdges();
        saveMmAnalysisToHw();
    }

    // 简易HTML转义，防注入
    function escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // 处理导入的.txt文件
    function handleMmTextFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            state.mmCustomText = e.target.result;
            state.mmRoleFns = {};   // 新文本，重置功能标注
            state.mmNodes = {};     // 重置节点位置
            state.mmEdges = [];     // 重置连线
            renderMmParas(state.mmCustomText);
            saveMmAnalysisToHw();   // 存到当前作业
            // 清空input，否则选同名文件不触发change
            event.target.value = '';
        };
        reader.readAsText(file, 'UTF-8');
    }

    // 打开粘贴弹框
    function openPasteTextDialog() {
        const overlay = document.getElementById('mmPasteOverlay');
        const area = document.getElementById('mmPasteArea');
        if (!overlay || !area) return;
        area.value = state.mmCustomText || '';
        overlay.classList.remove('hidden');
        setTimeout(() => area.focus(), 50);
    }

    // 关闭粘贴弹框
    function closePasteTextDialog() {
        const overlay = document.getElementById('mmPasteOverlay');
        if (overlay) overlay.classList.add('hidden');
    }

    // 确认粘贴：把文本框内容载入
    function confirmPasteText() {
        const area = document.getElementById('mmPasteArea');
        if (!area) return;
        const text = area.value;
        if (!text.trim()) {
            closePasteTextDialog();
            return;
        }
        state.mmCustomText = text;
        state.mmRoleFns = {};   // 新文本，重置功能标注
        state.mmNodes = {};     // 重置节点位置
        state.mmEdges = [];     // 重置连线
        renderMmParas(text);
        saveMmAnalysisToHw();   // 存到当前作业
        closePasteTextDialog();
    }

    // 删除当前文本：清空自定义文本，恢复占位演示
    function deleteMmText() {
        if (!state.mmCustomText) return;   // 没有自定义文本，无需删除
        if (!confirm('Clear the current passage text?')) return;
        state.mmCustomText = '';
        state.mmRoleFns = {};
        saveMmAnalysisToHw();   // 同步清除存档
        renderMmText(state.mmDiscourse || 'Passage A');   // 恢复占位演示文本
    }

    // 联动高亮：高亮左侧文本的指定段落（其他段落仍可见）
    function highlightMmPara(paraNum) {
        const body = document.getElementById('mmTextBody');
        if (!body) return;
        body.querySelectorAll('p').forEach(p => {
            p.classList.toggle('mm-highlight', Number(p.dataset.para) === paraNum);
        });
        // 滚动到高亮段落
        const target = body.querySelector(`p[data-para="${paraNum}"]`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // 可拖拽分隔条
    function setupMmSplitter() {
        const splitter = document.getElementById('mmSplitter');
        const textPanel = document.getElementById('mmTextPanel');
        const split = document.getElementById('mmSplit');
        if (!splitter || !textPanel || !split) return;

        let dragging = false;

        splitter.addEventListener('mousedown', (e) => {
            dragging = true;
            splitter.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const rect = split.getBoundingClientRect();
            // 鼠标相对分栏左边的位置 = 文本面板宽度
            let newWidth = e.clientX - rect.left;
            // 钳制范围
            newWidth = Math.max(200, Math.min(rect.width * 0.8, newWidth));
            textPanel.style.width = newWidth + 'px';
            textPanel.style.flex = 'none';   // 固定宽度，不被flex压缩
        });

        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            splitter.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        });
    }

    // 工具箱宽度可拖拽分隔条
    function setupMmToolboxSplitter() {
        const splitter = document.getElementById('mmToolboxSplitter');
        const toolbox = document.getElementById('mmToolbox');
        const view = document.getElementById('mindmapView');
        if (!splitter || !toolbox || !view) return;

        let dragging = false;

        splitter.addEventListener('mousedown', (e) => {
            dragging = true;
            splitter.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const rect = view.getBoundingClientRect();
            // 鼠标相对视图左边的位置 = 工具箱宽度
            let newWidth = e.clientX - rect.left;
            // 钳制范围：最小240，最大占视图60%
            newWidth = Math.max(240, Math.min(rect.width * 0.6, newWidth));
            toolbox.style.width = newWidth + 'px';
            toolbox.style.flex = 'none';
            syncDrawerTogglePos();   // 折叠按钮跟随工具箱宽度
        });

        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            splitter.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        });
    }

    // ===== Discourse Toolkit 笔记（可编辑/可折叠/持久化）=====
    // 笔记数据：[{id, title, body, collapsed}]，存 localStorage
    const MM_NOTES_KEY = 'afr-mm-toolkit-notes';
    state.mmNotes = null;   // 懒加载

    // 读取笔记（首次从 localStorage 加载）
    function loadMmNotes() {
        if (state.mmNotes) return state.mmNotes;
        try {
            const raw = localStorage.getItem(MM_NOTES_KEY);
            state.mmNotes = raw ? JSON.parse(raw) : [];
        } catch (e) {
            state.mmNotes = [];
        }
        return state.mmNotes;
    }

    // 保存笔记到 localStorage
    function saveMmNotes() {
        try {
            localStorage.setItem(MM_NOTES_KEY, JSON.stringify(state.mmNotes || []));
        } catch (e) { /* 忽略存储错误 */ }
    }

    // 生成笔记id
    function mmNoteId() {
        return 'n' + Math.random().toString(36).slice(2, 9);
    }

    // 六大语篇模块预设内容（首次空工具箱时种入）
    const MM_DEFAULT_NOTES = [
        {
            title: 'Discourse Type 文体识别',
            body: '四大高考核心文体：\n• 议论文 Argumentative：提出观点→分论点论证→总结\n• 说明文 Expository：介绍事物/原理，分点说明特征\n• 记叙文 Narrative：起因—经过—结果，情感/人物变化线\n• 应用文 Practical：广告/通知/新闻，侧重信息定位\n\n对应解题：主旨题、解题策略选择。\n类比：拿到菜单先认菜系（中餐/西餐），才知道用什么餐具吃。',
            collapsed: false
        },
        {
            title: 'Text Structure 段落逻辑',
            body: '整体框架：总分 / 分总 / 总分总 / 递进式 / 转折对比式\n\n段间关系（六种）：递进、转折、因果、并列、让步、举例\n段落功能（五种）：开篇引入、提出问题、分论点论证、过渡承上启下、总结升华\n\n⚠️区分：段落功能=这段自己干啥；段间关系=这段和邻段啥关系。\n对应解题：段落作用题、七选五。\n类比：结构像楼房图纸——框架是户型，段间关系是房间之间的门。',
            collapsed: true
        },
        {
            title: 'Cohesion & Coherence 衔接连贯',
            body: '三大衔接手段：\n• 逻辑连接词：转折 but/however、因果 therefore/thus、递进 besides/furthermore、对比 by contrast\n• 词汇衔接：同义替换、复现词（ASI/safety/cooperation 反复出现）\n• 指代衔接：it/this/these/that 指代前文\n\n对应解题：七选五、长难句理解、推理题。\n类比：衔接词是公路路标，告诉你行文走向；指代词是回指的手指。',
            collapsed: true
        },
        {
            title: 'Main Idea & Info Hierarchy 主旨与信息层级',
            body: '两级区分：\n• 主旨句（论点）vs 细节句（论据）\n• 核心信息 vs 次要举例信息\n\n识别首尾点题句：本文最后一句常为全文主旨。\n对应解题：标题题、主旨题、细节判断题。\n技巧：标题题先找首尾点题句，再用高频复现词当核心词。\n类比：信息层级像新闻播报——主播先说大事（主旨），再说细节，最后重申。',
            collapsed: true
        },
        {
            title: 'Rhetoric & Stance 修辞与立场',
            body: '三类知识：\n• 态度词：concerned / positive / critical / objective\n• 写作手法：对比、举例、下定义（如第一段给 AGI/ASI 下定义）\n• 隐含观点：区分客观陈述（事实）vs 主观评价（态度）\n\n对应解题：作者态度题、推断题、写作手法题。\n类比：修辞立场像朋友圈的语气——同样说"今天下雨"，加"真烦"是态度，只说事实是客观。',
            collapsed: true
        },
        {
            title: 'Contextual Knowledge 语境背景',
            body: '文本话题相关常识：人工智能、全球治理等背景，辅助理解长难句深层含义。\n\n对应解题：词义猜测题、深层推断题、长难句理解。\n⚠️提醒：背景知识是辅助理解，不是答题依据。答案必须回到原文证据，避免过度推断。\n类比：背景知识像看球赛的前置知识——懂规则的人能看出战术，不懂的只看到一群人追球。',
            collapsed: true
        }
    ];

    // 首次进入空工具箱时，种入六大预设笔记
    function initMmToolkitNotes() {
        const notes = loadMmNotes();
        if (notes.length > 0) return;   // 已有笔记（用户加过），不覆盖
        state.mmNotes = MM_DEFAULT_NOTES.map(n => ({ id: mmNoteId(), ...n }));
        saveMmNotes();
    }

    // 让笔记正文框自适应内容高度（内容多少撑多高，不在小框里滚）
    function autoResizeMmNote(textarea) {
        if (!textarea) return;
        textarea.style.height = 'auto';        // 先重置，才能正确重算
        textarea.style.height = Math.max(120, textarea.scrollHeight) + 'px';
    }

    // 渲染所有笔记后，把每个正文框撑开到内容高度
    function autoResizeAllMmNotes() {
        document.querySelectorAll('#mmToolboxBody .mm-note-area').forEach(autoResizeMmNote);
    }

    // 渲染所有笔记到工具箱
    function renderMmNotes() {
        const body = document.getElementById('mmToolboxBody');
        if (!body) return;
        const notes = loadMmNotes();
        if (notes.length === 0) {
            body.innerHTML = '<div class="mm-empty-hint">Click ＋ Add to create a note</div>';
            return;
        }
        body.innerHTML = notes.map(note => {
            // 正文：旧数据是纯文本（含\n），转成HTML显示；新数据已是HTML
            let bodyHtml = note.body || '';
            // 兼容旧纯文本：如果不含HTML标签，把换行转<br>，转义特殊字符
            if (bodyHtml && !/<[a-z!]/i.test(bodyHtml)) {
                bodyHtml = escapeHtml(bodyHtml).replace(/\n/g, '<br>');
            }
            return `
            <div class="mm-note ${note.collapsed ? 'collapsed' : ''}" data-id="${note.id}">
                <div class="mm-note-head" onclick="AFR.toggleMmNote('${note.id}', event)">
                    <span class="mm-note-toggle">▾</span>
                    <span class="mm-note-title" contenteditable="true" oninput="AFR.updateMmNote('${note.id}', 'title', this.textContent)" onblur="AFR.saveMmNotes()">${escapeHtml(note.title || 'Untitled')}</span>
                    <div class="mm-note-actions">
                        <button class="mm-note-del" onclick="AFR.deleteMmNote('${note.id}', event)" title="Delete">✕</button>
                    </div>
                </div>
                <div class="mm-note-body">
                    <div class="mm-note-area" contenteditable="true" data-id="${note.id}"
                         oninput="AFR.updateMmNoteBody('${note.id}', this.innerHTML)"
                         onblur="AFR.saveMmNotes()"
                         placeholder="Write discourse knowledge here...">${bodyHtml}</div>
                </div>
            </div>`;
        }).join('');
        // 渲染后撑开所有正文框到内容高度
        setTimeout(autoResizeAllMmNotes, 0);
    }

    // 添加新笔记
    function addToolkitNote() {
        const notes = loadMmNotes();
        notes.unshift({ id: mmNoteId(), title: 'New Note', body: '', collapsed: false });
        saveMmNotes();
        renderMmNotes();
    }

    // 删除笔记
    function deleteMmNote(id, ev) {
        if (ev) ev.stopPropagation();
        if (!confirm('Delete this note?')) return;
        state.mmNotes = state.mmNotes.filter(n => n.id !== id);
        saveMmNotes();
        renderMmNotes();
    }

    // 更新笔记字段（title/body）
    function updateMmNote(id, field, value) {
        const notes = loadMmNotes();
        const note = notes.find(n => n.id === id);
        if (note) {
            note[field] = value;
            // 输入时不立即存（onblur 才存），避免频繁写
        }
    }

    // 更新笔记正文（富文本HTML）
    function updateMmNoteBody(id, html) {
        const notes = loadMmNotes();
        const note = notes.find(n => n.id === id);
        if (note) note.body = html;
    }

    // 格式化：对选中的笔记正文应用格式（加粗/斜体/下划线/项目符号）
    function mmFmt(cmd) {
        // 找到当前聚焦的笔记正文框
        const area = document.activeElement;
        if (!area || !area.classList.contains('mm-note-area')) {
            // 没有聚焦的正文框，找第一个可见的
            const first = document.querySelector('.mm-note:not(.collapsed) .mm-note-area');
            if (first) { first.focus(); }
            else return;
        }
        document.execCommand(cmd, false, null);
        // 触发保存（富文本改动）
        const focused = document.activeElement;
        if (focused && focused.classList.contains('mm-note-area')) {
            updateMmNoteBody(focused.dataset.id, focused.innerHTML);
            saveMmNotes();
        }
    }

    // 首行缩进（稳定方案）：在当前光标处插入2个全角空格（视觉=4字符宽）
    // 用法：光标点到要缩进的位置 → 点 ⇥ → 自动插入缩进
    function mmIndent() {
        const area = document.activeElement;
        if (!area || !area.classList.contains('mm-note-area')) {
            const first = document.querySelector('.mm-note:not(.collapsed) .mm-note-area');
            if (first) first.focus(); else return;
        }
        const focused = document.activeElement;
        if (!focused || !focused.classList.contains('mm-note-area')) return;

        // 如果有选中文字：先把选中的删掉（变成光标），再插入缩进
        // 如果只是光标：直接在光标处插入
        document.execCommand('insertText', false, '　　');

        updateMmNoteBody(focused.dataset.id, focused.innerHTML);
        saveMmNotes();
    }

    // 给 HTML 的每个"逻辑行"行首加2个全角空格
    // 行 = 字符串开头、<br> 之后、<div>/<p> 开标签之后
    function indentMmHtml(html) {
        let result = html;
        // 1. <div> 或 <p> 开标签后加缩进（如果后面不是已缩进/不是另一个标签）
        result = result.replace(/(<(?:div|p)[^>]*>)(?!　　|<)/gi, '$1　　');
        // 2. 每个 <br> 后加缩进（如果后面不是 <br>/空/已缩进/标签结束）
        result = result.replace(/(<br\s*\/?>)(?!　　|<br\s*\/?>|<\s*\/)/gi, '$1　　');
        // 3. 整个字符串开头加缩进（如果开头不是已缩进/不是标签开头之外的内容）
        //    只在开头是纯文字（非<）时加
        if (result.length > 0 && !result.startsWith('　　') && !result.startsWith('<')) {
            result = '　　' + result;
        }
        return result;
    }

    // 折叠/展开笔记（点 head 区域，但点标题编辑/删除按钮时不折叠）
    function toggleMmNote(id, ev) {
        // 点标题(contenteditable)或删除按钮时不触发折叠
        if (ev && (ev.target.closest('.mm-note-title') || ev.target.closest('.mm-note-del'))) return;
        const notes = loadMmNotes();
        const note = notes.find(n => n.id === id);
        if (!note) return;
        note.collapsed = !note.collapsed;
        saveMmNotes();
        const el = document.querySelector(`.mm-note[data-id="${id}"]`);
        if (el) el.classList.toggle('collapsed', note.collapsed);
        // 展开后重算正文框高度（折叠态textarea无尺寸，展开需重算）
        if (el && !note.collapsed) {
            const area = el.querySelector('.mm-note-area');
            if (area) setTimeout(() => autoResizeMmNote(area), 0);
        }
    }


    // ===== Prelude 封面页 =====
    const PRELUDE_QUOTES = [
        { t: 'The expert in anything was once a beginner.', a: 'Helen Hayes' },
        { t: 'Education is the most powerful weapon which you can use to change the world.', a: 'Nelson Mandela' },
        { t: 'The beautiful thing about learning is that no one can take it away from you.', a: 'B.B. King' },
        { t: 'Success is the sum of small efforts repeated day in and day out.', a: 'Robert Collier' },
        { t: 'It always seems impossible until it is done.', a: 'Nelson Mandela' },
        { t: 'The only way to do great work is to love what you do.', a: 'Steve Jobs' },
        { t: 'Believe you can and you are halfway there.', a: 'Theodore Roosevelt' },
        { t: 'Practice does not make perfect. Only perfect practice makes perfect.', a: 'Vince Lombardi' },
        { t: 'A journey of a thousand miles begins with a single step.', a: 'Lao Tzu' },
        { t: 'Mistakes are proof that you are trying.', a: 'Unknown' },
        { t: 'The future depends on what you do today.', a: 'Mahatma Gandhi' },
        { t: 'Words are, of course, the most powerful drug used by mankind.', a: 'Rudyard Kipling' },
        { t: 'To have another language is to possess a second soul.', a: 'Charlemagne' },
        { t: 'Language is the dress of thought.', a: 'Samuel Johnson' },
        { t: 'Live as if you were to die tomorrow. Learn as if you were to live forever.', a: 'Mahatma Gandhi' },
    ];
    const PRELUDE_WORDS = [
        { w: 'serendipity', p: '/ˌserənˈdɪpəti/', pos: 'n.', m: 'the occurrence of events by chance in a happy way', e: 'Meeting her was pure serendipity.' },
        { w: 'resilient', p: '/rɪˈzɪliənt/', pos: 'adj.', m: 'able to recover quickly from difficulties', e: 'Children are often remarkably resilient.' },
        { w: 'eloquent', p: '/ˈeləkwənt/', pos: 'adj.', m: 'fluent and persuasive in speaking or writing', e: 'She gave an eloquent speech.' },
        { w: 'curiosity', p: '/ˌkjʊəriˈɒsəti/', pos: 'n.', m: 'a strong desire to learn or know', e: 'Curiosity drives scientific progress.' },
        { w: 'perseverance', p: '/ˌpɜːsɪˈvɪərəns/', pos: 'n.', m: 'persistence in doing something despite difficulty', e: 'Success requires perseverance.' },
        { w: 'vibrant', p: '/ˈvaɪbrənt/', pos: 'adj.', m: 'full of energy and life', e: 'The city has a vibrant culture.' },
        { w: 'profound', p: '/prəˈfaʊnd/', pos: 'adj.', m: 'very deep or intense', e: 'The book had a profound effect on me.' },
        { w: 'endeavor', p: '/ɪnˈdevə/', pos: 'v.', m: 'to try hard to do something', e: 'We endeavor to do our best.' },
        { w: 'meticulous', p: '/məˈtɪkjələs/', pos: 'adj.', m: 'showing great attention to detail', e: 'He is meticulous about his work.' },
        { w: 'epiphany', p: '/ɪˈpɪfəni/', pos: 'n.', m: 'a moment of sudden revelation', e: 'Then I had an epiphany.' },
    ];
    const PRELUDE_SONGS = [
        { t: 'Here Comes the Sun', s: 'The Beatles', d: 'A warm reminder that bright days lie ahead.' },
        { t: 'A Million Dreams', s: 'Ziv Zaifman', d: 'Dream big — every great journey starts with one.' },
        { t: 'Imagine', s: 'John Lennon', d: 'A timeless call for hope and unity.' },
        { t: 'Fight Song', s: 'Rachel Platten', d: 'Anthem for those who refuse to give up.' },
        { t: 'Brave', s: 'Sara Bareilles', d: 'Speak up — your voice matters.' },
        { t: 'Hall of Fame', s: 'The Script', d: 'You can be the greatest, you can be the best.' },
        { t: 'Rise Up', s: 'Andra Day', d: 'For the days when you need to stand tall.' },
        { t: 'Beautiful Day', s: 'U2', d: "It's a beautiful day — don't let it slip away." },
        { t: 'Count on Me', s: 'Bruno Mars', d: 'We learn better when we learn together.' },
        { t: 'Try Everything', s: 'Shakira', d: 'Mistakes are just steps on the way up.' },
    ];
    const PRELUDE_PERSONS = [
        { n: 'William Shakespeare', t: 'Playwright & Poet', d: 'Wrote 39 plays and 154 sonnets; shaped the English language itself.' },
        { n: 'Marie Curie', t: 'Physicist & Chemist', d: 'First woman to win a Nobel Prize — and the only person to win in two sciences.' },
        { n: 'Nelson Mandela', t: 'Statesman', d: 'Spent 27 years in prison, then led his country as its first Black president.' },
        { n: 'Jane Austen', t: 'Novelist', d: 'Her sharp social comedies — Pride and Prejudice — still delight readers two centuries on.' },
        { n: 'Albert Einstein', t: 'Physicist', d: 'Rewrote our understanding of space, time, and energy with E=mc².' },
        { n: 'Mother Teresa', t: 'Humanitarian', d: 'Devoted her life to the poorest of the poor in Calcutta.' },
        { n: 'Leonardo da Vinci', t: 'Polymath', d: 'Painter of the Mona Lisa, inventor centuries ahead of his time.' },
        { n: 'Florence Nightingale', t: 'Nurse & Reformer', d: 'Founded modern nursing with statistics and compassion.' },
        { n: 'Barack Obama', t: 'Statesman', d: 'The first African American president of the United States.' },
        { n: 'Malala Yousafzai', t: 'Activist', d: 'Youngest-ever Nobel laureate; shot for going to school, kept going.' },
    ];
    const PRELUDE_NEWS = [
        { h: 'AI Translates Languages in Real Time', d: 'New tools now bridge speakers of different tongues in seconds.' },
        { h: 'Global Push for Green Energy', d: 'Solar and wind now power a record share of the world.' },
        { h: 'Students Break Reading Record', d: 'A school in Shanghai read over 10,000 books this term.' },
        { h: 'Mars Sample Returns Home', d: 'Scientists prepare to study the first rocks ever brought back from Mars.' },
        { h: 'Wild Tigers Rebound in Asia', d: 'Conservation efforts show the population rising for the first time in a century.' },
        { h: 'Olympic Hopefuls Train Hard', d: 'Young athletes wake before dawn chasing their dreams.' },
        { h: 'New Whale Species Discovered', d: 'A deep-diving whale, hidden for millennia, is finally named.' },
        { h: 'City Bans Single-Use Plastics', d: 'A coastal town reports cleaner beaches within months.' },
        { h: 'Space Tourist Reaches Orbit', d: 'A private crew circles Earth for three days.' },
        { h: 'Ancient Library Reopens', d: 'After years of restoration, a 1,000-year-old library welcomes readers again.' },
    ];
    const PRELUDE_PAINTINGS = [
        { t: 'The Starry Night', a: 'Vincent van Gogh', y: '1889', d: 'Swirling skies over a quiet village — painted from a window of an asylum, it speaks of wonder inside turmoil.' },
        { t: 'Mona Lisa', a: 'Leonardo da Vinci', y: '1503', d: 'Her half-smile has puzzled the world for 500 years; the closer you look, the more she seems to change.' },
        { t: 'The Persistence of Memory', a: 'Salvador Dalí', y: '1931', d: 'Melting clocks in a desert dream — a surreal vision of time itself going soft.' },
        { t: 'The Great Wave off Kanagawa', a: 'Katsushika Hokusai', y: '1831', d: 'A towering wave looms over tiny boats, with Mount Fuji calm and small beyond — nature at its grandest.' },
        { t: 'Girl with a Pearl Earring', a: 'Johannes Vermeer', y: '1665', d: 'A single glance over the shoulder — so simple, so alive, she is called the "Mona Lisa of the North".' },
        { t: 'The Scream', a: 'Edvard Munch', y: '1893', d: 'A figure on a bridge, face wide with dread under a blood-red sky — a portrait of modern anxiety.' },
        { t: 'Water Lilies', a: 'Claude Monet', y: '1906', d: 'Endless reflections of light on a garden pond — Monet painted them over and over, chasing the moment.' },
        { t: 'The Birth of Venus', a: 'Sandro Botticelli', y: '1485', d: 'The goddess of love steps from a shell onto the shore — beauty born from the sea.' },
        { t: 'Las Meninas', a: 'Diego Velázquez', y: '1656', d: 'A royal painter paints himself painting — who is watching whom? A puzzle of a masterpiece.' },
        { t: 'The Kiss', a: 'Gustav Klimt', y: '1908', d: 'Two lovers wrapped in gold, suspended in a tender embrace — the height of golden glamour.' },
    ];
    const PRELUDE_FACTS = [
        'Honey found in ancient Egyptian tombs, over 3,000 years old, was still perfectly edible.',
        'Octopuses have three hearts and blue blood — and two of those hearts stop beating when they swim.',
        'A day on Venus is longer than a year on Venus; it spins slower than it orbits the Sun.',
        'Bananas are botanically berries, but strawberries are not.',
        'Sharks existed before trees did — they have been on Earth for about 400 million years.',
        'There are more possible games of chess than there are atoms in the observable universe.',
        'A jiffy is an actual unit of time: one hundredth of a second.',
        'Wombat poop is cube-shaped — the only known animal to produce cubic droppings.',
        'The unicorn is the national animal of Scotland.',
        'Hot water can freeze faster than cold water — a mystery physicists still call the Mpemba effect.',
        'A group of flamingos is called a "flamboyance".',
        'There are more stars in the universe than grains of sand on all of Earth\'s beaches.',
        'Sea otters hold hands while sleeping so they do not drift apart.',
        'The shortest war in history lasted just 38 to 45 minutes — Britain vs. Zanzibar, in 1896.',
        'Cows have best friends and get stressed when they are separated from them.',
        'A cloud can weigh more than a million pounds — yet it floats.',
        'Honeybees can recognize human faces.',
        'The Eiffel Tower grows taller in summer, as metal expands with heat.',
        'Your stomach gets a new lining every few days, or the acid would digest itself.',
        'Bananas are slightly radioactive — but you would need to eat about 10 million at once to be in danger.',
    ];
    const PRELUDE_RIDDLES = [
        { q: 'I speak without a mouth and hear without ears. I have no body, but I come alive with the wind. What am I?', a: 'An echo.' },
        { q: 'The more you take, the more you leave behind. What are they?', a: 'Footsteps.' },
        { q: 'What has keys but cannot open a single lock?', a: 'A piano.' },
        { q: 'I am tall when I am young, and short when I am old. What am I?', a: 'A pencil (or a candle).' },
        { q: 'What gets wetter the more it dries?', a: 'A towel.' },
        { q: 'What has hands but cannot clap?', a: 'A clock.' },
        { q: 'I have cities, but no houses; mountains, but no trees; and water, but no fish. What am I?', a: 'A map.' },
        { q: 'What can travel around the world while staying in one corner?', a: 'A stamp.' },
        { q: 'The more of me you have, the less you see. What am I?', a: 'Darkness.' },
        { q: 'What has a neck but no head?', a: 'A bottle.' },
        { q: 'What breaks yet never falls, and what falls yet never breaks?', a: 'Day breaks and night falls.' },
        { q: 'I shave every day, but my beard stays exactly the same. Who am I?', a: 'A barber.' },
        { q: 'What has many teeth but cannot bite?', a: 'A comb.' },
        { q: 'Forward I am heavy, but backward I am not. What am I?', a: 'The word "ton".' },
        { q: 'What can you hold in your right hand, but never in your left?', a: 'Your left hand (or elbow).' },
    ];
    const PRELUDE_BOOKS = [
        { t: 'The Little Prince', a: 'Antoine de Saint-Exupéry', d: 'A pilot meets a tiny prince from an asteroid — a fable about love, loss, and seeing with the heart.' },
        { t: 'To Kill a Mockingbird', a: 'Harper Lee', d: 'Through a child\'s eyes, a small town confronts racial injustice in the American South.' },
        { t: '1984', a: 'George Orwell', d: 'A chilling vision of total surveillance and a state that rewrites truth itself.' },
        { t: 'Pride and Prejudice', a: 'Jane Austen', d: 'Wit, pride, and slow-burning romance — Elizabeth Bennet vs. Mr. Darcy.' },
        { t: 'The Old Man and the Sea', a: 'Ernest Hemingway', d: 'An old fisherman battles a giant marlin alone — a spare tale of endurance and dignity.' },
        { t: 'Animal Farm', a: 'George Orwell', d: 'Farm animals rebel, then watch their revolution curdle into tyranny. A sharp political fable.' },
        { t: 'The Great Gatsby', a: 'F. Scott Fitzgerald', d: 'Gatsby throws lavish parties chasing one lost love — the glittering, tragic American dream.' },
        { t: 'Charlotte\'s Web', a: 'E. B. White', d: 'A clever spider saves her pig friend with words woven in silk — friendship and letting go.' },
        { t: 'Brave New World', a: 'Aldous Huxley', d: 'A "perfect" future of comfort and pills, where freedom and feeling are quietly gone.' },
        { t: 'The Diary of a Young Girl', a: 'Anne Frank', d: 'Two years hidden in an attic, told in a teenager\'s brave, hopeful voice.' },
    ];

    function renderPrelude() {
        // 日期：英文格式
        const today = new Date();
        const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        document.getElementById('preludeDate').textContent = '🎵  ' + dateStr;

        // 当前作业名
        const hw = getCurrentHomework();
        const assignEl = document.getElementById('preludeAssignment');
        if (assignEl) assignEl.textContent = '';

        // 随机选一条（同一天保持稳定：用日期作种子）
        const seed = Number('' + today.getFullYear() + (today.getMonth()+1) + today.getDate());
        const quote = PRELUDE_QUOTES[seed % PRELUDE_QUOTES.length];
        const word = PRELUDE_WORDS[seed % PRELUDE_WORDS.length];
        const song = PRELUDE_SONGS[(seed * 7) % PRELUDE_SONGS.length];
        const person = PRELUDE_PERSONS[(seed * 3) % PRELUDE_PERSONS.length];
        const news = PRELUDE_NEWS[(seed * 11) % PRELUDE_NEWS.length];
        const picture = PRELUDE_PAINTINGS[(seed * 5) % PRELUDE_PAINTINGS.length];
        const fact = PRELUDE_FACTS[(seed * 13) % PRELUDE_FACTS.length];
        const riddle = PRELUDE_RIDDLES[(seed * 17) % PRELUDE_RIDDLES.length];
        const book = PRELUDE_BOOKS[(seed * 19) % PRELUDE_BOOKS.length];

        document.getElementById('preludeQuote').innerHTML = `"${escapeHtml(quote.t)}"<br><span style="opacity:0.8;font-size:12px">— ${escapeHtml(quote.a)}</span>`;
        document.getElementById('preludeWord').innerHTML = `<b>${escapeHtml(word.w)}</b> <span style="opacity:0.8;font-size:12px">${escapeHtml(word.p)}</span> <span style="opacity:0.7">${escapeHtml(word.pos)}</span><br><span style="font-size:12px;opacity:0.85">${escapeHtml(word.m)}</span><br><span style="font-size:12px;font-style:italic;opacity:0.75">"${escapeHtml(word.e)}"</span>`;
        document.getElementById('preludeSong').innerHTML = `<b>${escapeHtml(song.t)}</b><br><span style="opacity:0.8;font-size:12px">${escapeHtml(song.s)}</span><br><span style="font-size:12px;opacity:0.85">${escapeHtml(song.d)}</span>`;
        document.getElementById('preludePerson').innerHTML = `<b>${escapeHtml(person.n)}</b><br><span style="opacity:0.7;font-size:11px;letter-spacing:0.3px">${escapeHtml(person.t)}</span><br><span style="font-size:12px;opacity:0.85">${escapeHtml(person.d)}</span>`;
        document.getElementById('preludeNews').innerHTML = `<b style="font-size:13px">${escapeHtml(news.h)}</b><br><span style="font-size:12px;opacity:0.85">${escapeHtml(news.d)}</span>`;
        document.getElementById('preludePainting').innerHTML = `<b>${escapeHtml(picture.t)}</b><br><span style="opacity:0.75;font-size:11px">${escapeHtml(picture.a)}, ${escapeHtml(picture.y)}</span><br><span style="font-size:12px;opacity:0.85;margin-top:4px;display:inline-block">${escapeHtml(picture.d)}</span>`;
        document.getElementById('preludeFact').innerHTML = `💡 <span style="font-size:13.5px;line-height:1.65">${escapeHtml(fact)}</span>`;
        document.getElementById('preludeRiddle').innerHTML = `<span style="font-size:13.5px;line-height:1.6">${escapeHtml(riddle.q)}</span><div class="riddle-answer" id="riddleAnswer" onclick="AFR.revealRiddleAnswer(this)" data-answer="${escapeHtml(riddle.a)}">👉 Tap to reveal answer</div>`;
        document.getElementById('preludeBook').innerHTML = `<b>${escapeHtml(book.t)}</b><br><span style="opacity:0.75;font-size:11px">${escapeHtml(book.a)}</span><br><span style="font-size:12px;opacity:0.85;margin-top:4px;display:inline-block">${escapeHtml(book.d)}</span>`;
    }

    // ===== Prelude 背景音乐 =====
    let preludeAudio = null;
    // 尝试加载的音乐文件（按优先级）：固定名 → 当天日期名
    function getPreludeMusicSrc() {
        const today = new Date();
        const d = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
        return [
            'Song of the Day/song-of-the-day.mp3',
            `Song of the Day/${d}.mp3`,
            'Song of the Day/' + encodeURI(song_of_the_day_fallback()),
        ];
    }
    function song_of_the_day_fallback() { return 'song.mp3'; }

    // 扫描 Song of the Day 文件夹的真实 mp3（服务器端 /list-songs 接口）
    // 返回 ['Song of the Day/歌名.mp3', ...]，失败返回 []（退回固定名逻辑）
    async function scanSongDir() {
        try {
            const resp = await fetch('list-songs', { cache: 'no-store' });
            if (!resp.ok) return [];
            const data = await resp.json();
            return (data.songs || []).map(name => 'Song of the Day/' + name + '.mp3');
        } catch (e) { return []; }  // file协议或服务器无此接口
    }

    // ===== 歌词显示（lrc 同名配对，播放时只显当前一句）=====
    let preludeLyrics = [];     // 解析后的歌词行 [{time, text}]，按 time 升序
    let currentLyricIdx = -1;   // 当前显示的行号

    // lrc 候选路径：复用 mp3 的文件名优先级，.mp3 换成 .lrc
    function getPreludeLyricSrc() {
        return getPreludeMusicSrc().map(mp3 => mp3.replace(/\.mp3$/i, '.lrc'));
    }

    // 解析 lrc 文本 → [{time:秒, text}] 升序数组
    // 支持 [mm:ss.xx] / [mm:ss]，一行多时间标签
    function parseLrc(text) {
        const lines = text.split(/\r?\n/);
        const out = [];
        const tagRe = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
        for (const line of lines) {
            tagRe.lastIndex = 0;
            const times = [];
            let m;
            while ((m = tagRe.exec(line)) !== null) {
                const mm = parseInt(m[1], 10);
                const ss = parseInt(m[2], 10);
                const frac = m[3] ? parseInt(m[3], 10) / (m[3].length === 2 ? 100 : 1000) : 0;
                times.push(mm * 60 + ss + frac);
            }
            if (times.length === 0) continue;
            // 歌词文本 = 去掉所有时间标签后的剩余
            const lyricText = line.replace(tagRe, '').trim();
            if (!lyricText) continue;
            for (const t of times) out.push({ time: t, text: lyricText });
        }
        out.sort((a, b) => a.time - b.time);
        return out;
    }

    // 找当前时间对应的那一句（currentTime ≥ line.time 的最后一行）
    function getCurrentLyricLine(lines, currentTime) {
        if (!lines.length) return -1;
        let idx = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].time <= currentTime) idx = i;
            else break;
        }
        return idx;
    }

    // timeupdate 回调：行号变了就更新浮窗
    function updateLyricDisplay() {
        if (!preludeLyrics.length || !preludeAudio) return;
        const idx = getCurrentLyricLine(preludeLyrics, preludeAudio.currentTime);
        if (idx !== currentLyricIdx) {
            currentLyricIdx = idx;
            const el = document.getElementById('lyricCurrent');
            if (el) el.textContent = idx >= 0 ? preludeLyrics[idx].text : '';
        }
    }

    // 异步加载 lrc：优先用实际播放 mp3 的同名 lrc（用audio.src的pathname，保留URL编码），再兜底固定名候选
    async function loadPreludeLyric(actualSrc) {
        const candidates = [];
        // 1. 实际播放文件的同名 lrc（最优先）——audio.src的pathname已正确编码(含'等特殊字符安全)
        if (actualSrc) {
            let path = actualSrc;
            try { path = new URL(actualSrc).pathname; } catch (e) {}
            path = path.replace(/^\//, '');
            candidates.push(path.replace(/\.mp3$/i, '.lrc'));
        }
        // 2. 固定名兜底
        candidates.push(...getPreludeLyricSrc());
        for (const lrcSrc of candidates) {
            try {
                const resp = await fetch(lrcSrc);
                if (resp.ok) {
                    const text = await resp.text();
                    if (text.startsWith('<!DOCTYPE')) continue;  // 回退的html不是歌词，跳过
                    preludeLyrics = parseLrc(text);
                    return;
                }
            } catch (e) { /* file协议或不存在，跳过 */ }
        }
        preludeLyrics = [];  // 没找到 lrc
        console.log('[AFR] 所有候选都失败,无歌词');
    }

    // 点击显示谜底
    function revealRiddleAnswer(el) {
        if (el.dataset.revealed === '1') return;
        el.dataset.revealed = '1';
        el.classList.add('revealed');
        el.textContent = '✅ ' + el.dataset.answer;
    }

    // 歌词诊断：播放后调 AFR.debugLyric() 查看歌词加载状态
    function debugLyric() {
        const overlay = document.getElementById('lyricOverlay');
        const lyricEl = document.getElementById('lyricCurrent');
        const info = {
            preludeLyrics行数: preludeLyrics ? preludeLyrics.length : 'undefined',
            preludeLyrics前3句: preludeLyrics ? preludeLyrics.slice(0,3) : null,
            overlay有show类: overlay ? overlay.classList.contains('show') : '无overlay',
            overlay的opacity: overlay ? getComputedStyle(overlay).opacity : null,
            lyricCurrent文字: lyricEl ? lyricEl.textContent : '无lyricCurrent',
            audio是否存在: !!preludeAudio,
            audio的src: preludeAudio ? preludeAudio.src : null,
            audio当前时间: preludeAudio ? preludeAudio.currentTime : null,
            currentLyricIdx: currentLyricIdx,
        };
        console.log('[AFR歌词诊断]', info);
        notify('歌词诊断已打印到控制台 (F12→Console)', 'info');
        return info;
    }

    function togglePreludeMusic() {
        const btn = document.getElementById('preludeMusicBtn');
        const overlay = document.getElementById('lyricOverlay');
        // 已在播放 → 暂停
        if (preludeAudio && !preludeAudio.paused) {
            preludeAudio.pause();
            btn.classList.remove('playing');
            if (overlay) overlay.classList.remove('show');  // 暂停时浮窗淡出
            return;
        }
        // 恢复暂停的
        if (preludeAudio && preludeAudio.paused && preludeAudio.readyState >= 2) {
            preludeAudio.play().catch(() => notify('Music file missing in "Song of the Day" folder', 'info'));
            btn.classList.add('playing');
            if (overlay && preludeLyrics.length) overlay.classList.add('show');  // 恢复时浮窗重现
            return;
        }
        // 首次播放：尝试加载文件
        preludeAudio = new Audio();
        preludeAudio.loop = true;
        let tryIdx = 0;
        let srcs = [];             // mp3 候选路径
        const tryNext = () => {
            if (tryIdx >= srcs.length) {
                notify('Put an MP3 in "Song of the Day" folder', 'info');
                btn.classList.remove('playing');
                return;
            }
            preludeAudio.src = srcs[tryIdx];
            tryIdx++;
        };
        preludeAudio.onerror = tryNext;
        preludeAudio.oncanplay = () => {
            preludeAudio.play().then(() => {
                btn.classList.add('playing');
                // 用实际播放的 mp3 路径配对同名 lrc
                loadPreludeLyric(preludeAudio.src).then(() => {
                    currentLyricIdx = -1;
                    if (overlay && preludeLyrics.length) overlay.classList.add('show');
                });
            }).catch(() => {});
        };
        preludeAudio.ontimeupdate = updateLyricDisplay;
        // 异步获取歌曲清单：服务器端扫描真实文件名，随机选一首放最前；失败则用原固定名逻辑
        (async () => {
            const scanned = await scanSongDir();
            if (scanned.length > 0) {
                // 随机打乱：第一首即为本次随机选中，其余作为兜底候选
                for (let i = scanned.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [scanned[i], scanned[j]] = [scanned[j], scanned[i]];
                }
            }
            srcs = scanned.concat(getPreludeMusicSrc());
            tryNext();
        })();
    }

    function stopPreludeMusic() {
        if (preludeAudio && !preludeAudio.paused) {
            preludeAudio.pause();
            const btn = document.getElementById('preludeMusicBtn');
            if (btn) btn.classList.remove('playing');
        }
        const overlay = document.getElementById('lyricOverlay');
        if (overlay) overlay.classList.remove('show');  // 切换视图时隐藏歌词
    }

    // ===== 学生成绩渲染 =====
    // 题型得分计算：按 TYPE_RANGES 汇总逐题得分
    // 返回 { listening: 12, reading: '—', ... }，未涉及题型返回 null
    const SCORE_TYPE_KEYS = ['listening', 'reading', 'sevenfive', 'cloze', 'grammar', 'applied', 'writing'];

    function calcTypeScores(student, validQuestions) {
        const result = {};

        // 没有逐题得分数据时，所有题型显示 —
        if (!student.questionScores || Object.keys(student.questionScores).length === 0) {
            SCORE_TYPE_KEYS.forEach(key => { result[key] = null; });
            return result;
        }

        const validSet = validQuestions ? new Set(validQuestions) : null;
        const qs = student.questionScores;

        SCORE_TYPE_KEYS.forEach(typeKey => {
            const range = TYPE_RANGES[typeKey];

            // 检查该题型是否有有效题
            let hasValid = false;
            if (validSet) {
                for (let q = range.min; q <= range.max; q++) {
                    if (validSet.has(q)) { hasValid = true; break; }
                }
            } else {
                for (let q = range.min; q <= range.max; q++) {
                    if (qs[q] !== undefined) { hasValid = true; break; }
                }
            }

            if (!hasValid) {
                result[typeKey] = null; // 未涉及
                return;
            }

            let sum = 0;
            for (let q = range.min; q <= range.max; q++) {
                if (qs[q] !== undefined && qs[q] !== null) {
                    sum += qs[q];
                }
            }
            result[typeKey] = sum;
        });

        return result;
    }

    function renderScores() {
        const tbody = document.getElementById('scoreTableBody');
        const title = document.getElementById('scoresTitle');
        if (!tbody) return;

        let students = [...getCurrentScores()];
        const hw = getCurrentHomework();
        title.textContent = hw ? `${hw.name} — ${state.currentClass === 'class9' ? '高三09班' : '高三11班'}` : 'Scores';

        const validQuestions = hw && hw.config ? hw.config.validQuestions : null;

        if (state.scoreSortMode === 'id') {
            students.sort((a, b) => a.id.localeCompare(b.id));
        } else if (state.scoreSortMode === 'score') {
            students.sort((a, b) => b.score - a.score);
        } else {
            // 按题型分数排序（降序，无数据的当0排最后）
            const typeKey = state.scoreSortMode;
            students.sort((a, b) => {
                const va = calcTypeScores(a, validQuestions)[typeKey];
                const vb = calcTypeScores(b, validQuestions)[typeKey];
                return (vb === null ? -1 : vb) - (va === null ? -1 : va);
            });
        }


        tbody.innerHTML = students.map((s, idx) => {
            const typeScores = calcTypeScores(s, validQuestions);
            const typeCells = SCORE_TYPE_KEYS.map(key => {
                const val = typeScores[key];
                // 设了A/B规则且未关闭标记→分数后加自动标记
                const tag = state.remarkMode !== 'off' ? getTypeRemarkTag(key, val) : '';
                return `<td class="score-type">${val === null ? '—' : val}${tag}</td>`;
            }).join('');

            // 按分数排序时，前9名表彰（前3金银铜，4-6荣誉奖，7-9庆祝）
            let rankCell;
            // 手动星标名单（老师指定的额外表彰学生，不管排名）
            const starredNames = (hw.starredNames && Array.isArray(hw.starredNames)) ? hw.starredNames : [];
            const isManuallyStarred = starredNames.some(n => n && s.name && s.name.includes(n));
            const isMedaled = isManuallyStarred || (state.scoreSortMode === 'score' && idx < 9);  // 有表彰标记
            if (state.scoreSortMode === 'score') {
                const medals = ['gold', 'silver', 'bronze', 'honor', 'honor', 'honor', 'celebrate', 'celebrate', 'celebrate'];
                const emojis = ['🥇', '🥈', '🥉', '🌟', '🌟', '🌟', '🎉', '🎉', '🎉'];
                if (idx < 9) {
                    const delay = idx * 0.10;
                    rankCell = `<td class="rank"><span class="rank-medal ${medals[idx]}" style="animation-delay:${delay}s"><span class="medal-emoji">${emojis[idx]}</span>${idx + 1}</span></td>`;
                } else if (isManuallyStarred) {
                    // 手动星标（不在前9）：显示大拇指
                    rankCell = `<td class="rank"><span class="rank-medal thumb"><span class="medal-emoji">👍</span>${idx + 1}</span></td>`;
                } else {
                    rankCell = `<td class="rank">${idx + 1}</td>`;
                }
            } else {
                // 非分数排序时，手动星标也显示
                if (isManuallyStarred) {
                    rankCell = `<td class="rank"><span class="rank-medal thumb"><span class="medal-emoji">👍</span>${s.rank}</span></td>`;
                } else {
                    rankCell = `<td class="rank">${s.rank}</td>`;
                }
            }

            // 隐私模式：只隐藏名字（准考证号/学号保留，学生据此识别自己分数）。有表彰标记(isMedaled)的不隐藏
            const hideThis = state.hideNames && !isMedaled;
            const showName = hideThis ? '—' : s.name;

            // 评价模式 edit：名字区变可编辑文本框；show：评语覆盖Exam ID列
            const remark = (hw.remarks && hw.remarks[s.id]) || '';
            const examIdText = s.examId ? String(s.examId).padStart(8, '0') : '-';
            let nameCell, examIdCell;
            if (state.remarkMode === 'edit') {
                nameCell = `<td class="student-name"><input type="text" class="remark-input" value="${escapeAttr(remark)}" placeholder="评语…" onchange="AFR.saveRemark('${s.id}', this.value)" title="评语"></td>`;
                examIdCell = `<td class="student-id">${examIdText}</td>`;
            } else if (state.remarkMode === 'show') {
                nameCell = `<td class="student-name">${escapeHtml(showName)}</td>`;
                // 有评语→覆盖ExamID列显示评语(带样式)；无评语→照常显示准考证号
                examIdCell = remark
                    ? `<td class="student-id remark-show">${escapeHtml(remark)}</td>`
                    : `<td class="student-id">${examIdText}</td>`;
            } else {
                nameCell = `<td class="student-name">${escapeHtml(showName)}</td>`;
                examIdCell = `<td class="student-id">${examIdText}</td>`;
            }

            return `<tr>
                ${rankCell}
                ${nameCell}
                ${examIdCell}
                <td class="student-no">${s.studentNo || s.id || '-'}</td>
                <td class="score-val ${getScoreColorClass(s.score)}">${s.score}</td>
                ${typeCells}
            </tr>`;
        }).join('');
    }

    function sortScores(mode) {
        state.scoreSortMode = mode;
        // 顶部 Sort by No./Score 按钮高亮
        document.querySelectorAll('[data-score-sort]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.scoreSort === mode);
        });
        // 表头箭头：开启排序模式时所有列都显示▼；否则只有当前列显示
        const sortModeBtn = document.getElementById('sortModeToggleBtn');
        const allOn = sortModeBtn && sortModeBtn.classList.contains('active');
        document.querySelectorAll('.sort-arrow').forEach(ar => {
            ar.textContent = (allOn || ar.dataset.arrow === mode) ? '▼' : '';
        });
        renderScores();
    }

    // 开启/关闭排序模式：开启后所有表头显示▼（一直显示），默认按总分排
    function toggleSortMode() {
        const btn = document.getElementById('sortModeToggleBtn');
        const isOn = btn && btn.classList.toggle('active');
        if (isOn) {
            // 开启：所有表头显示▼，按总分排序
            document.querySelectorAll('.sort-arrow').forEach(ar => { ar.textContent = '▼'; });
            state.scoreSortMode = 'score';
            document.querySelectorAll('[data-score-sort]').forEach(b => {
                b.classList.toggle('active', b.dataset.scoreSort === 'score');
            });
            renderScores();
        } else {
            // 关闭：清空所有箭头，回到按学号排
            document.querySelectorAll('.sort-arrow').forEach(ar => { ar.textContent = ''; });
            sortScores('id');
        }
    }

    // 隐私模式：隐藏学生名字/学号（有表彰标记的前9名不隐藏）
    function toggleHideNames() {
        state.hideNames = !state.hideNames;
        const btn = document.getElementById('hideNamesBtn');
        if (btn) {
            btn.classList.toggle('active', state.hideNames);
            btn.textContent = state.hideNames ? '🔒 Names Hidden' : '🔒 Hide Names';
        }
        renderScores();
    }

    // 评价模式菜单（Edit编辑 / Show展示 / Off关闭）
    function toggleRemarkMenu() {
        const menu = document.getElementById('remarkMenu');
        const btn = document.getElementById('remarkModeBtn');
        if (menu) menu.classList.toggle('show');
        if (btn) btn.classList.toggle('open');
    }

    function setRemarkMode(mode) {
        state.remarkMode = mode;  // false(默认开标记) | 'edit' | 'show' | 'off'(关闭标记)
        const menu = document.getElementById('remarkMenu');
        const btn = document.getElementById('remarkModeBtn');
        if (menu) menu.classList.remove('show');
        if (btn) btn.classList.toggle('active', mode && mode !== 'off');
        renderScores();
        if (mode === 'edit') notify('Edit mode: type remarks in name cells', 'info');
        else if (mode === 'show') notify('Show mode: remarks shown in Exam ID column', 'info');
        else if (mode === 'off') notify('Marks hidden', 'info');
    }

    // 保存某学生的评价到 hw.remarks[id]（独立于成绩，不随Excel导入丢失）
    function saveRemark(studentId, value) {
        const hw = getCurrentHomework();
        if (!hw) return;
        if (!hw.remarks) hw.remarks = {};
        if (value && value.trim()) {
            hw.remarks[studentId] = value.trim();
        } else {
            delete hw.remarks[studentId];  // 空值删除
        }
        saveHomework(hw.id);
    }

    // 总分按分数段返回颜色class（≥140红/≥130橙/≥120黄/≥110绿/≥100青/≥90蓝/<90紫）
    function getScoreColorClass(score) {
        if (score == null) return '';
        if (score >= 140) return 'score-red';
        if (score >= 130) return 'score-orange';
        if (score >= 120) return 'score-yellow';
        if (score >= 110) return 'score-green';
        if (score >= 100) return 'score-cyan';
        if (score >= 90) return 'score-blue';
        return 'score-purple';
    }

    // ===== 题型A/B阈值自动标记（Show Remark 模式下，分数后加 👍Well done / 💪Almost there）=====
    // 数据：hw.config.remarkRules = { [题型key]: {a: 上限, b: 下限} }，a/b 为空表示该方向不标记
    function getRemarkRules() {
        const hw = getCurrentHomework();
        if (!hw || !hw.config) return {};
        return hw.config.remarkRules || {};
    }

    // 打开A/B阈值配置弹窗
    function openRemarkRules() {
        // 关闭下拉菜单
        const menu = document.getElementById('remarkMenu');
        if (menu) menu.classList.remove('show');
        const btn = document.getElementById('remarkModeBtn');
        if (btn) btn.classList.remove('open');

        const rules = getRemarkRules();
        const overlay = document.createElement('div');
        overlay.className = 'remark-rules-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:99998;display:flex;align-items:center;justify-content:center';
        const dialog = document.createElement('div');
        dialog.style.cssText = 'position:relative;background:var(--bg-panel);border:1px solid var(--border-color);border-radius:12px;padding:24px 28px;box-shadow:var(--shadow-elevated);z-index:99999;max-width:520px;width:90%';
        const rows = Object.keys(TYPE_RANGES).map(key => {
            const t = TYPE_RANGES[key];
            const r = rules[key] || {};
            return `<div style="display:flex;align-items:center;gap:10px;margin:8px 0;font-size:13px">
                <span style="width:90px;text-align:right;color:var(--text-secondary)">${t.label}</span>
                <span style="color:var(--text-tertiary);font-size:11px">A≥</span>
                <input type="number" data-rule="${key}" data-field="a" value="${r.a != null ? r.a : ''}" placeholder="无" style="width:60px;padding:4px 6px;border:1px solid var(--border-color);border-radius:4px;font-size:13px">
                <span style="color:var(--diff-easy-text);font-size:11px">👍</span>
                <span style="color:var(--text-tertiary);font-size:11px;margin-left:8px">B≤</span>
                <input type="number" data-rule="${key}" data-field="b" value="${r.b != null ? r.b : ''}" placeholder="无" style="width:60px;padding:4px 6px;border:1px solid var(--border-color);border-radius:4px;font-size:13px">
                <span style="color:var(--diff-hard-text);font-size:11px">💪</span>
            </div>`;
        }).join('');
        dialog.innerHTML = `
            <div style="font-size:17px;font-weight:700;margin-bottom:6px">⚙ Remark Thresholds</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px;line-height:1.5">
                Set <b>A</b> (score ≥ A → 👍 Well done) and <b>B</b> (score ≤ B → 💪 Almost there) for each section.<br>
                Leave blank to skip. Applied in <b>Show Remark</b> mode.
            </div>
            ${rows}
            <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">
                <button id="rrClear" style="padding:8px 16px;background:var(--bg-panel);color:var(--text-secondary);border:1px solid var(--border-color);border-radius:6px;font-size:13px;cursor:pointer">Clear All</button>
                <button id="rrCancel" style="padding:8px 16px;background:var(--bg-panel);color:var(--text-secondary);border:1px solid var(--border-color);border-radius:6px;font-size:13px;cursor:pointer">Cancel</button>
                <button id="rrSave" style="padding:8px 22px;background:var(--color-primary);color:var(--text-on-primary);border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer">Save</button>
            </div>`;
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        dialog.querySelector('#rrCancel').onclick = close;
        dialog.querySelector('#rrSave').onclick = () => {
            const newRules = {};
            dialog.querySelectorAll('input[data-rule]').forEach(inp => {
                const key = inp.dataset.rule;
                const field = inp.dataset.field;
                const v = inp.value.trim();
                if (v !== '') {
                    if (!newRules[key]) newRules[key] = {};
                    newRules[key][field] = parseFloat(v);
                }
            });
            saveRemarkRules(newRules);
            close();
        };
        dialog.querySelector('#rrClear').onclick = () => { saveRemarkRules({}); close(); };
    }

    function saveRemarkRules(rules) {
        const hw = getCurrentHomework();
        if (!hw) return;
        if (!hw.config) hw.config = {};
        hw.config.remarkRules = rules;
        saveHomework(hw.id);
        notify('Remark thresholds saved', 'success');
        renderScores();  // 立即应用
    }

    // 给某题型分数生成标记（Show模式用）：≥A→👍Well done，≤B→💪Almost there
    function getTypeRemarkTag(key, score) {
        if (score === null || score === undefined) return '';
        const r = getRemarkRules()[key];
        if (!r) return '';
        if (r.a != null && score >= r.a) return '<span class="remark-tag tag-good">👍 Well done</span>';
        if (r.b != null && score <= r.b) return '<span class="remark-tag tag-almost">💪 Almost there</span>';
        return '';
    }

    function closeQuestionDetail() {
        state.activeQuestionId = null;
        renderQuestionDetail();
        // 取消网格中的高亮
        document.querySelectorAll('.circle-item').forEach(item => item.classList.remove('active'));
    }

    // ===== 题号网格渲染 =====
    function renderQuestionGrid() {
        const grid = document.getElementById('questionGrid');
        if (!grid) return;

        const questions = getCurrentQuestions();
        const hw = getCurrentHomework();

        // 构建有效题目集合
        const validSet = new Set();
        if (hw && hw.config && hw.config.validQuestions) {
            hw.config.validQuestions.forEach(id => validSet.add(id));
        }

        // 听力区间题号集合（用于显示▶角标）
        const rangeSet = new Set();
        if (hw && hw.listeningAudio && hw.listeningRanges) {
            Object.keys(hw.listeningRanges).map(Number).forEach(q => rangeSet.add(q));
        }

        // 构建 question map（按题号索引）
        const qMap = {};
        questions.forEach(q => { qMap[q.id] = q; });

        // 动态题型分组：题目带 typeKey（表头题型标签）时，按实际题目分组，不画固定范围灰圈
        const hasTypedQuestions = questions.length > 0 && questions.every(q => q.typeKey);
        let groups = null;
        if (hasTypedQuestions) {
            const groupMap = {};
            const typeOrder = Object.keys(TYPE_RANGES);
            questions.forEach(q => {
                if (!groupMap[q.typeKey]) groupMap[q.typeKey] = [];
                groupMap[q.typeKey].push(q);
            });
            groups = Object.keys(groupMap)
                .sort((a, b) => typeOrder.indexOf(a) - typeOrder.indexOf(b))
                .map(k => ({
                    key: k,
                    label: groupMap[k][0].type,           // 显示Excel表头的题型名（如"阅读"）
                    qNums: groupMap[k].map(q => q.id).sort((a, b) => a - b),
                }));
        }

        // 按题型分组渲染（有Excel题型标签→动态分组；否则固定七组范围）
        let html = '';

        const renderGroups = groups || Object.keys(TYPE_RANGES).map(k => ({
            key: k,
            label: TYPE_RANGES[k].label,
            qNums: Array.from({ length: TYPE_RANGES[k].max - TYPE_RANGES[k].min + 1 },
                (_, i) => TYPE_RANGES[k].min + i),
        }));

        renderGroups.forEach(group => {
            const typeKey = group.key;
            const items = [];

            group.qNums.forEach(qNum => {
                const isValid = validSet.has(qNum);
                const q = qMap[qNum];

                if (isValid && q) {
                    const diff = getDifficultyByRate(q.classRate || 0);
                    items.push({
                        id: q.id,
                        rate: q.classRate || 0,
                        diff: diff,
                        active: q.id === state.activeQuestionId,
                    });
                } else {
                    // 无效题目用灰色圆圈
                    items.push({
                        id: qNum,
                        rate: -1,
                        diff: 'inactive',
                        active: false,
                    });
                }
            });

            // 排序
            let sorted = [...items];
            if (state.gridSortMode === 'rate') {
                sorted.sort((a, b) => {
                    // 无效题排最后
                    if (a.diff === 'inactive' && b.diff !== 'inactive') return 1;
                    if (a.diff !== 'inactive' && b.diff === 'inactive') return -1;
                    return a.rate - b.rate;
                });
            }

            html += `<div class="type-group">
                <div class="type-group-header">
                    <div class="type-group-indicator ${typeKey}"></div>
                    <span>${group.label}</span>
                </div>
                <div class="type-group-grid">
                    ${sorted.map(item => {
                        const clickHandler = item.diff === 'inactive' ? '' : `onclick="AFR.selectQuestion(${item.id})"`;
                        const tooltip = item.diff === 'inactive'
                            ? 'N/A'
                            : `第${item.id}题 正确率 ${item.rate.toFixed(1)}%（${DIFFICULTY_LABELS[item.diff]}）`;
                        const hasRange = rangeSet.has(item.id);
                        const rangeBadge = hasRange
                            ? `<button class="q-range-badge" onclick="event.stopPropagation();AFR.playQuestionRangeFromGrid(${item.id})" title="Play Q${item.id} range">▶</button>`
                            : '';
                        return `<div class="circle-item ${item.diff} ${item.active ? 'active' : ''} ${hasRange ? 'has-range' : ''}"
                                     ${clickHandler}
                                     title="${tooltip}">
                                    ${item.id}
                                    ${rangeBadge}
                                </div>`;
                    }).join('')}
                </div>
            </div>`;
        });

        grid.innerHTML = html;
    }

    function filterByType(type) {
        state.activeTypeFilter = type;
        state.activeQuestionId = null;
        renderQuestionGrid();
        renderQuestionDetail();
    }

    function sortGrid(mode) {
        state.gridSortMode = mode;
        document.querySelectorAll('[data-sort]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sort === mode);
        });
        renderQuestionGrid();
    }

    // ===== 选择题目 =====
    function selectQuestion(qId) {
        state.activeQuestionId = qId;

        // 更新网格高亮
        document.querySelectorAll('.grid-item').forEach(item => {
            item.classList.remove('active');
        });
        const activeItem = document.querySelector(`.grid-item[onclick="AFR.selectQuestion(${qId})"]`);
        if (activeItem) activeItem.classList.add('active');

        renderQuestionDetail();

        // 统一定位流程：scrollToQuestion内部处理unit切换+滚动（无Pin锚点时按高考题号规则推断兜底）
        const hw = getCurrentHomework();
        const hasAnchor = hw && hw.config && hw.config.anchors && hw.config.anchors[qId];
        if (hasAnchor) {
            // 确保内容已渲染（首次进入评讲视图时）
            const container = document.getElementById('passageContent');
            if (!container.querySelector('.pdf-page') && !container.querySelector('.passage-text') && !container.querySelector('iframe')) {
                renderPassage();
                setTimeout(() => scrollToQuestion(qId), 120);
            } else {
                scrollToQuestion(qId);
            }
        } else {
            // 无Pin锚点：渲染后交给scrollToQuestion按高考题号规则推断（推断也失败才提示Pin）
            renderPassage();
            setTimeout(() => scrollToQuestion(qId), 120);
        }

        // 全屏模式下，点题号后自动收起抽屉（露出原文）—— 除非保持展开
        const review = document.getElementById('reviewView');
        if (review && review.classList.contains('passage-fullscreen') && !drawerPinned) {
            const qp = document.querySelector('.question-panel');
            if (qp) qp.classList.remove('drawer-open');
            const tBtn = document.getElementById('drawerToggleBtn');
            if (tBtn) tBtn.textContent = '◄';
        }
    }

    // 评讲原文区全屏切换（隐藏右栏，工具栏悬浮左下角）
    function togglePassageFullscreen() {
        const review = document.getElementById('reviewView');
        if (!review) return;
        const isFs = review.classList.contains('passage-fullscreen');
        const nav = document.getElementById('passageNav');
        const toolbar = document.querySelector('.drawing-toolbar');
        const header = document.querySelector('.passage-header');
        if (!isFs) {
            // 进入：加全屏类 + 请求浏览器全屏（连地址栏/标签栏都隐藏，如PPT放映）
            review.classList.add('passage-fullscreen');
            // 把翻页导航条移到工具栏最前面（左下角最左侧）
            if (nav && toolbar && nav.parentElement !== toolbar) {
                toolbar.insertBefore(nav, toolbar.firstChild);
            }
            const el = document.documentElement;
            const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
            if (req) {
                try { req.call(el); } catch (e) { /* 用户拒绝或不可用时，仍保留页面内全屏 */ }
            }
        } else {
            // 退出：把翻页导航条移回 header（title 之后）
            if (nav && header && nav.parentElement !== header) {
                header.insertBefore(nav, header.children[1] || null);
            }
            // 退出：去全屏类 + 退出浏览器全屏 + 清除保持展开状态
            review.classList.remove('passage-fullscreen');
            const qp = document.querySelector('.question-panel');
            if (qp) qp.classList.remove('drawer-open');
            drawerPinned = false;
            const pinBtn = document.getElementById('drawerPinBtn');
            if (pinBtn) pinBtn.classList.remove('pinned');
            if (document.fullscreenElement || document.webkitFullscreenElement) {
                const ex = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
                if (ex) { try { ex.call(document); } catch (e) {} }
            }
        }
        // 等CSS过渡+全屏切换后重算Canvas + 重渲染
        setTimeout(() => {
            if (splitMode) {
                renderPassage();
                resizeCanvasAfterSplit();
            } else {
                resizeCanvas();
                renderPassage();
            }
        }, 150);
        notify(isFs ? 'Fullscreen off' : 'Fullscreen on', 'info');
    }

    // 监听浏览器全屏状态变化（用户按Esc退出时，同步去掉页面全屏类）
    // 全局全屏（顶部Tab栏按钮）：评讲走专用passage-fullscreen，其他走通用app-fullscreen
    function toggleGlobalFullscreen() {
        // 评讲视图：复用专用全屏（原文区+左下工具栏+抽屉）
        if (state.currentView === 'review') {
            togglePassageFullscreen();
            return;
        }
        // 其他视图：通用全屏（隐藏header，内容撑满）
        const isFs = document.body.classList.contains('app-fullscreen');
        if (!isFs) {
            document.body.classList.add('app-fullscreen');
            const el = document.documentElement;
            const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
            if (req) { try { req.call(el); } catch (e) {} }
        } else {
            document.body.classList.remove('app-fullscreen');
            if (document.fullscreenElement || document.webkitFullscreenElement) {
                const ex = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
                if (ex) { try { ex.call(document); } catch (e) {} }
            }
        }
        notify(isFs ? 'Fullscreen off' : 'Fullscreen on', 'info');
    }

    if (!window.__afrFsListener) {
        window.__afrFsListener = true;
        const onFsChange = () => {
            const isBrowserFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
            if (!isBrowserFs) {
                // 浏览器退出全屏（如按Esc）→ 同步退出页面全屏
                const review = document.getElementById('reviewView');
                if (review && review.classList.contains('passage-fullscreen')) {
                    review.classList.remove('passage-fullscreen');
                    // 翻页导航条移回 header
                    const nav = document.getElementById('passageNav');
                    const header = document.querySelector('.passage-header');
                    if (nav && header && nav.parentElement !== header) {
                        header.insertBefore(nav, header.children[1] || null);
                    }
                    const qp = document.querySelector('.question-panel');
                    if (qp) qp.classList.remove('drawer-open');
                    setTimeout(() => {
                        if (splitMode) { renderPassage(); resizeCanvasAfterSplit(); }
                        else { resizeCanvas(); renderPassage(); }
                    }, 120);
                }
                // 通用全屏同步退出
                if (document.body.classList.contains('app-fullscreen')) {
                    document.body.classList.remove('app-fullscreen');
                }
            }
        };
        document.addEventListener('fullscreenchange', onFsChange);
        document.addEventListener('webkitfullscreenchange', onFsChange);
    }

    // 全屏时的题号网格抽屉开关
    let drawerPinned = false;   // 全屏时抽屉是否保持展开

    function toggleQuestionDrawer() {
        const qp = document.querySelector('.question-panel');
        const tBtn = document.getElementById('drawerToggleBtn');
        if (!qp) return;
        // 保持展开时，抽屉锁定为开，点击箭头不收
        if (drawerPinned) {
            qp.classList.add('drawer-open');
            if (tBtn) tBtn.textContent = '►';
            return;
        }
        const open = qp.classList.toggle('drawer-open');
        if (tBtn) tBtn.textContent = open ? '►' : '◄';
    }

    // 切换"保持抽屉展开"：开→抽屉锁定展开+点题号不收；关→恢复正常
    function toggleDrawerPin() {
        drawerPinned = !drawerPinned;
        const pinBtn = document.getElementById('drawerPinBtn');
        const qp = document.querySelector('.question-panel');
        const tBtn = document.getElementById('drawerToggleBtn');
        if (drawerPinned) {
            if (pinBtn) pinBtn.classList.add('pinned');
            if (qp) qp.classList.add('drawer-open');
            if (tBtn) tBtn.textContent = '►';
            notify('Drawer pinned open', 'success');
        } else {
            if (pinBtn) pinBtn.classList.remove('pinned');
            if (qp) qp.classList.remove('drawer-open');
            if (tBtn) tBtn.textContent = '◄';
            notify('Drawer unpinned', 'info');
        }
    }

    /* ===== ★高考卷题号→语篇板块规则（无Pin锚点时的自动定位兜底） =====
       正常高考卷结构固定：1-20听力 / 21-23 Passage A / 24-28 B / 29-32 C / 33-35 D /
       36-40七选五 / 41-55完形 / 56-65语法填空 / 66应用文 / 67读后续写。
       examIndex（导入试卷时自动切分）提供各板块 pageStart；真实锚点（自动识别或手动Pin）优先，
       本规则仅在锚点缺失时兜底——左栏跳板块文章起点，split模式右栏联动跳同板块试题区。 */
    const GAOKAO_Q_RULES = [
        { min: 1,  max: 20, key: null },                        // 听力：试卷开头（第0页）
        { min: 21, max: 23, key: 'Passage A' },
        { min: 24, max: 28, key: 'Passage B' },
        { min: 29, max: 32, key: 'Passage C' },
        { min: 33, max: 35, key: 'Passage D' },
        { min: 36, max: 40, key: '5 of 7' },
        { min: 41, max: 55, key: 'Cloze' },
        { min: 56, max: 65, key: 'Blank Filling' },
        { min: 66, max: 66, key: 'Application Writing' },       // examIndex无此key时回落续写板块（作文区相邻）
        { min: 67, max: 67, key: 'Continuation Writing' }
    ];

    function inferAnchorForQuestion(qId) {
        const hw = getCurrentHomework();
        const rule = GAOKAO_Q_RULES.find(r => qId >= r.min && qId <= r.max);
        if (!rule) return null;
        let pageIdx = null;
        if (rule.key) {
            const ei = (hw && hw.examIndex) || {};
            let hit = ei[rule.key] || null;
            if (!hit && rule.key === 'Application Writing') {
                // examIndex无应用文key：在续写板块前找应用文特征页。
                // 首选"词数80"指令（应用文独有；续写=150词）；"第一节+满分15分"会误中语言运用部分第一节（完形同满分15分），
                // 仅在附带"写作/书面表达"字样时才认
                const cw = ei['Continuation Writing'];
                const texts = (hw && hw.passages) || [];
                const lim = (cw && cw.pageStart != null) ? cw.pageStart : texts.length;
                for (let i = 0; i < lim; i++) {
                    const t = (texts[i] && texts[i].textContent) || '';
                    if (/词数.{0,8}80|80\s*词/.test(t) ||
                        (/第\s*一\s*节/.test(t) && /满分\s*15\s*分/.test(t) && /写\s*作|书面表达/.test(t))) { hit = { pageStart: i }; break; }
                }
                if (!hit && cw && cw.pageStart != null) hit = { pageStart: Math.max(0, cw.pageStart - 1) };   // 兜底：续写前一页
            }
            if (hit && hit.pageStart != null) pageIdx = hit.pageStart;
        } else {
            // 听力：试卷PDF首页（hw.passages[0]的id形如 pdf-page-N，作业多PDF时 pageIdx=0 未必是试卷）
            const fp = (hw.passages || [])[0];
            const fpN = fp ? parseInt(String(fp.id || '').replace('pdf-page-', ''), 10) : 1;
            pageIdx = (fpN >= 1 ? fpN - 1 : 0);
        }
        if (pageIdx == null) return null;
        return { pageIdx: pageIdx, yRatio: 0.05, inferred: true };
    }

    /**
     * 连续滚动模式下，根据题号锚点平滑滚动到对应位置
     * 锚点存储在 hw.config.anchors[qNum] = { pageIdx, yRatio }
     */
    function scrollToQuestion(qId) {
        const hw = getCurrentHomework();
        let anchor = (hw && hw.config && hw.config.anchors) ? hw.config.anchors[qId] : null;
        if (!anchor) {
            // ★高考卷题号规则兜底：无Pin锚点时按题号→板块起点推断（听感：点题必有反应）
            anchor = inferAnchorForQuestion(qId);
        }
        if (!anchor) {
            console.log('[AFR] 题号' + qId + '无锚点，无法定位。当前已有锚点:', Object.keys((hw.config && hw.config.anchors) || {}).sort((a,b)=>a-b).join(','));
            notify('Q' + qId + ' not pinned yet. Use 📍 Pin to set it', 'info');
            return;
        }

        // 两段式定位：先确认anchor所在unit已渲染，再滚动
        const units = buildMaterialUnits(hw);
        const targetUnit = findUnitByPageIdx(units, anchor.pageIdx);
        if (!targetUnit) {
            console.log('[AFR] 题号' + qId + '锚点pageIdx=' + anchor.pageIdx + '不属于任何unit');
            notify('Q' + qId + ' anchor invalid, please re-pin', 'error');
            return;
        }

        // 滚动左栏到锚点位置（常规模式/分栏回退共用）
        const doScroll = () => {
            // 用data-page属性精确查找目标图片（而非按索引取，因为只有当前unit的图片在DOM）
            const targetImg = document.querySelector('.pdf-page[data-page="' + anchor.pageIdx + '"]');
            if (!targetImg) {
                console.log('[AFR] 题号' + qId + '目标图片不在当前DOM（pageIdx=' + anchor.pageIdx + '）');
                return;
            }
            console.log('[AFR] 定位第' + qId + '题 → unit' + (targetUnit.unitIndex+1) + ' pageIdx=' + anchor.pageIdx + ' ' + Math.round(anchor.yRatio*100) + '%');

            const container = document.getElementById('passageContent');
            const imgTop = targetImg.offsetTop;
            const targetY = imgTop + anchor.yRatio * targetImg.offsetHeight;
            const scrollTo = targetY - container.clientHeight * 0.1;

            container.scrollTo({
                top: Math.max(0, scrollTo),
                behavior: 'smooth'
            });
        };

        // 分栏模式：题目在分隔线下方→右栏滚到该页；在上方→左栏滚到锚点
        if (splitMode) {
            const divider2 = hw.config.splitDivider;
            const isBelow = divider2 && (
                anchor.pageIdx > divider2.pageIdx ||
                (anchor.pageIdx === divider2.pageIdx && anchor.yRatio >= divider2.yRatio)
            );
            // 视口坐标系滚动（getBoundingClientRect差值，无视offsetParent链）
            // scrollDelta = 把目标点(el内yInEl处)滚到容器顶部+margin；滚动后画高亮线标记题目位置
            // lineId：左右栏各自独立指示线（同id会互相删除——左跳文章线曾把右题目线顶掉）
            const scrollToPos = (scroller, el, yInEl, margin, lineId) => {
                if (!scroller || !el) return;
                const scr = scroller.getBoundingClientRect();
                const er = el.getBoundingClientRect();
                // 目标点当前视口Y - 容器顶视口Y + 当前scrollTop = 目标在滚动内容里的绝对位置
                const targetAbs = (er.top + yInEl) - scr.top + scroller.scrollTop;
                scroller.scrollTo({ top: Math.max(0, targetAbs - margin), behavior: 'auto' });
                // 高亮指示线（挂滚动容器：img是替换元素不能有子节点，挂img内线不渲染；top=目标绝对位置，1.8秒后淡出）
                const lineId2 = lineId || 'anchorLocateLine';
                const old = document.getElementById(lineId2);
                if (old) old.remove();
                const line = document.createElement('div');
                line.id = lineId2;
                line.style.cssText = `position:absolute;left:0;right:0;height:2px;background:var(--color-primary,#1890ff);
                    box-shadow:0 0 0 1px rgba(24,144,255,0.4);z-index:4;pointer-events:none;
                    top:${targetAbs}px;transition:opacity 0.6s;`;
                if (getComputedStyle(scroller).position === 'static') scroller.style.position = 'relative';
                scroller.appendChild(line);
                setTimeout(() => { line.style.opacity = '0'; setTimeout(() => line.remove(), 700); }, 1800);
            };
            const doScrollLeft = (a) => {   // a=目标锚点（题目锚点或板块文章起点）
                const leftPane = document.querySelector('.split-left');
                if (!leftPane || !a) return;
                let el = null, yInEl = 0;
                if (a.pageIdx === divider2.pageIdx) {
                    // 分隔线页：左栏显示的是线上裁切段，yRatio按裁切段换算
                    el = document.getElementById('splitDivPage-top');
                    if (el && el.offsetHeight > 0) {
                        yInEl = (a.yRatio / divider2.yRatio) * el.offsetHeight;
                    }
                } else {
                    el = leftPane.querySelector(`.pdf-page[data-page="${a.pageIdx}"]`);
                    if (el) yInEl = a.yRatio * el.offsetHeight;
                }
                scrollToPos(leftPane, el, yInEl, 40, 'anchorLocateLine-L');
            };
            // ★锚点是否在分隔线上方（左栏DOM可见范围内）
            const isAboveDivider = (a) => !a || !divider2 ? false :
                (a.pageIdx < divider2.pageIdx || (a.pageIdx === divider2.pageIdx && a.yRatio < divider2.yRatio));
            // ★右栏滚动到锚点a（题目位置）：题目落视口中间高度（原margin=30/70偏高）；分隔线页按裁切段换算
            const doScrollRight = (a) => {
                const panel = document.getElementById('stripPanel');
                if (!panel || !a || !divider2) return;
                const el = (a.pageIdx === divider2.pageIdx)
                    ? document.getElementById('splitDivPage-bottom')
                    : document.querySelector(`.split-right .pdf-page[data-page="${a.pageIdx}"]`);
                if (!el) return;
                const yInEl = (a.pageIdx === divider2.pageIdx && el.offsetHeight > 0)
                    ? ((a.yRatio - divider2.yRatio) / (1 - divider2.yRatio)) * el.offsetHeight
                    : a.yRatio * el.offsetHeight;
                const mid = panel.clientHeight ? panel.clientHeight * 0.5 : 30;
                scrollToPos(panel, el, yInEl, mid, 'anchorLocateLine-R');
            };
            const doSplitScroll = () => {
                layoutStrips();
                // ★该题所属板块的文章起点（examIndex pageStart推断）：左栏联动目标
                const artAnchor = inferAnchorForQuestion(qId);
                if (isBelow && !anchor.inferred) {
                    // 真实锚点在线下方（题目在右栏）：右栏跳题目 + 左栏联动跳板块文章起点
                    // （文题分离卷：文章在前部、题目集中末部——左原文右题目）
                    doScrollRight(anchor);
                    if (artAnchor && isAboveDivider(artAnchor)) doScrollLeft(artAnchor);
                    return;
                }
                // 题目在线上方（文章区锚点）或找不到 → 左栏滚到锚点
                doScrollLeft(anchor);
                // ★规则推断锚点（阅读/七选五/完形等）：左栏已跳文章起点，右栏联动跳同板块试题区
                if (anchor.inferred && divider2) {
                    // 右栏目标优先=板块内首个在线下方的真实锚点（文题分离卷题目区与文章页相距远，
                    // 板块起始页=文章页不在右栏DOM）；找不到再回落板块起始页（文题混排卷：试题紧随文章）
                    const rule = GAOKAO_Q_RULES.find(r => qId >= r.min && qId <= r.max);
                    const ans = (hw.config && hw.config.anchors) || {};
                    let rel = null;
                    if (rule) {
                        for (let q = rule.min; q <= rule.max; q++) {
                            if (ans[q] && !isAboveDivider(ans[q])) { rel = ans[q]; break; }
                        }
                    }
                    if (rel) doScrollRight(rel);
                    else {
                        const el2 = (anchor.pageIdx === divider2.pageIdx)
                            ? document.getElementById('splitDivPage-bottom')
                            : document.querySelector(`.split-right .pdf-page[data-page="${anchor.pageIdx}"]`);
                        const panel2 = document.getElementById('stripPanel');
                        if (el2 && panel2) scrollToPos(panel2, el2, 0, panel2.clientHeight * 0.5, 'anchorLocateLine-R');   // ★落视口中间高度
                    }
                }
            };
            if (targetUnit.unitIndex !== currentUnitIndex) {
                currentUnitIndex = targetUnit.unitIndex;
                renderPassage();
                waitImgReady(anchor.pageIdx, doSplitScroll);   // ★等图片就绪（split同理）
            } else {
                waitImgReady(anchor.pageIdx, doSplitScroll);
            }
            return;
        }

        if (targetUnit.unitIndex !== currentUnitIndex) {
            currentUnitIndex = targetUnit.unitIndex;
            renderPassage();
            waitImgReady(anchor.pageIdx, doScroll); // ★等图片就绪再滚（未加载完时offsetHeight=0，滚动落空）
        } else {
            waitImgReady(anchor.pageIdx, doScroll);
        }
    }

    /* ★定位前等待目标页图片就绪：img未加载完时offsetHeight=0，滚动位置算成0=看起来"没反应"。
       轮询至高度>50px（最多约2.5s），超时仍尝试（兜底） */
    function waitImgReady(pageIdx, cb) {
        let tries = 0;
        const check = () => {
            const img = document.querySelector('.pdf-page[data-page="' + pageIdx + '"]');
            if ((img && img.offsetHeight > 50) || tries > 50) { cb(); return; }
            tries++;
            setTimeout(check, 50);
        };
        check();
    }

    // ===== 锚点编辑模式 =====
    let anchorEditMode = false;

    // ===== 左文右题分栏（Split View）=====
    let splitMode = false;        // 分栏开关
    let stripEditMode = false;    // 条带标记模式（两击：顶、底）
    let stripFirstClick = null;   // 第一击 {pageIdx, yRatio}

    // 惰性读取条带数据（旧作业无此字段返回[]）
    function getQuestionStrips() {
        const hw = getCurrentHomework();
        return (hw && hw.config && hw.config.questionStrips) || [];
    }

    // 保存条带（深拷贝入hw.config，随作业持久化）
    function saveQuestionStrips(strips) {
        const hw = getCurrentHomework();
        if (!hw) return;
        if (!hw.config) hw.config = { validQuestions: [] };
        hw.config.questionStrips = strips;
        saveHomework(hw.id);
    }

    // 分栏开关：分隔线以上→左栏原文，以下→右栏题目。
    // 无分隔线时进入"点击定界"模式：用户在文题交界处点一下即分栏
    function toggleSplitMode() {
        const hw = getCurrentHomework();
        if (!hw || !hw.passages || hw.passages.length === 0) {
            notify('Please import a PDF first', 'info');
            return;
        }
        const units = buildMaterialUnits(hw);
        const curUnit = units[currentUnitIndex];
        if (!curUnit || curUnit.type !== 'image') {
            notify('Split view works only on PDF', 'info');
            return;
        }
        // 已在定界模式：退出
        if (dividerPickMode) { exitDividerPickMode(); return; }

        const divider = hw.config && hw.config.splitDivider;
        if (!splitMode && !divider) {
            // 没有分隔线 → 进入点击定界模式
            enterDividerPickMode();
            return;
        }
        if (divider && (divider.pageIdx < curUnit.startIndex || divider.pageIdx > curUnit.endIndex)) {
            notify('Divider is in another document. Switch to that PDF first', 'info');
            return;
        }
        // 标记模式开着时分栏会冲突，先退出
        if (stripEditMode) toggleStripEditMode();
        splitMode = !splitMode;
        if (hw.config) { hw.config.splitOn = splitMode; saveHomework(hw.id); }   // ★持久化开关（防刷新静默丢失）
        const btn = document.getElementById('splitBtn');
        if (btn) btn.classList.toggle('active', splitMode);
        renderPassage();
        resizeCanvasAfterSplit();
        notify(splitMode ? 'Split view ON' : 'Split view OFF', 'success');
    }

    // ===== 点击定界模式：在文题交界处点一下，作为分栏分割点 =====
    let dividerPickMode = false;

    function enterDividerPickMode() {
        dividerPickMode = true;
        if (stripEditMode) toggleStripEditMode();
        setCanvasPointerEnabled(false);
        const container = document.getElementById('passageContent');
        container.classList.add('strip-editing');   // 复用橙色蒙层+十字光标样式
        container.addEventListener('click', handleDividerPickClick, true);
        const btn = document.getElementById('splitBtn');
        if (btn) btn.classList.add('active');
        notify('Click where QUESTIONS begin (just above the first question). Esc to cancel', 'info');
    }

    function exitDividerPickMode(keepBtnState) {
        dividerPickMode = false;
        const container = document.getElementById('passageContent');
        container.classList.remove('strip-editing');
        container.removeEventListener('click', handleDividerPickClick, true);
        clearStripMarker();
        if (!keepBtnState) {
            const btn = document.getElementById('splitBtn');
            if (btn) btn.classList.remove('active');
            setDrawTool(state.drawingTool || 'select');
        }
    }

    function handleDividerPickClick(e) {
        const container = document.getElementById('passageContent');
        if (!e.target.classList.contains('pdf-page') && !e.target.closest('.pdf-page')) return;
        const containerRect = container.getBoundingClientRect();
        const clickY = e.clientY - containerRect.top + container.scrollTop;
        const imgs = Array.from(container.querySelectorAll('.pdf-page'));
        let targetIdx = -1, yRatio = 0;
        for (let i = 0; i < imgs.length; i++) {
            const top = imgs[i].offsetTop;
            const bottom = top + imgs[i].offsetHeight;
            if (clickY >= top && clickY <= bottom) {
                targetIdx = i;
                yRatio = (clickY - top) / imgs[i].offsetHeight;
                break;
            }
        }
        if (targetIdx === -1) return;
        const pageIdx = parseInt(imgs[targetIdx].dataset.page);
        yRatio = parseFloat(Math.max(0.05, Math.min(0.95, yRatio)).toFixed(4));

        // 保存分隔点并直接分栏
        const hw = getCurrentHomework();
        if (!hw.config) hw.config = { validQuestions: [] };
        hw.config.splitDivider = { pageIdx, yRatio };
        hw.config.splitOn = true;   // ★定界即开分栏，随作业持久化（防刷新丢失）
        saveHomework(hw.id);
        exitDividerPickMode(true);
        splitMode = true;
        renderPassage();
        resizeCanvasAfterSplit();
        notify(`Split at P${pageIdx + 1} ${Math.round(yRatio * 100)}%. Drag the middle line to resize`, 'success');
    }

    // Esc取消定界
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && dividerPickMode) {
            exitDividerPickMode();
            notify('Divider picking cancelled', 'info');
        }
    });

    // 重定分隔点（✂ Re-split按钮）：清掉上次定界结果，重新进入点击定界模式
    function repickDivider() {
        const hw = getCurrentHomework();
        if (!hw || !hw.passages || hw.passages.length === 0) {
            notify('Please import a PDF first', 'info');
            return;
        }
        const units = buildMaterialUnits(hw);
        const curUnit = units[currentUnitIndex];
        if (!curUnit || curUnit.type !== 'image') {
            notify('Re-split works only on PDF. Switch to the PDF page first', 'info');
            return;
        }
        if (hw.config) delete hw.config.splitDivider;
        saveHomework(hw.id);
        splitMode = false;
        const btn = document.getElementById('splitBtn');
        if (btn) btn.classList.remove('active');
        renderPassage();
        setTimeout(() => enterDividerPickMode(), 200);
    }

    // 画布收缩到左栏（不动resizeCanvas本体，只在其后二次设宽高）
    function resizeCanvasAfterSplit() {
        resizeCanvas();
        setTimeout(() => {
            if (!splitMode || !fabricCanvas || !fabricCanvas.wrapperEl) return;
            const left = document.querySelector('.split-left');
            if (left && left.clientWidth > 0) {
                fabricCanvas.setDimensions({ width: left.clientWidth, height: left.clientHeight });
                fabricCanvas.renderAll();
            }
        }, 100);
    }

    // 分栏布局计算：分隔线页的线上/线下裁切 + 各栏滚动宽度
    function layoutStrips() {
        if (!splitMode) return;
        const hw = getCurrentHomework();
        const divider = hw && hw.config && hw.config.splitDivider;
        if (!divider) return;
        // 线上部分（左栏尾部）与线下部分（右栏头部）共用同一原图的裁切
        const topCrop = document.getElementById('splitDivPage-top');
        const bottomCrop = document.getElementById('splitDivPage-bottom');
        // 以左栏宽度为基准渲染该页
        const left = document.querySelector('.split-left');
        if (!left) return;
        // 原图宽高比
        const srcImg = topCrop ? topCrop.querySelector('img') : (bottomCrop ? bottomCrop.querySelector('img') : null);
        if (!srcImg || !srcImg.naturalWidth) return;
        const ratio = srcImg.naturalHeight / srcImg.naturalWidth;

        if (topCrop) {
            // 用内容容器的实际宽（含缩放），而非栏宽
            const leftInner = left.querySelector('.passage-scroll-inner');
            const W = (leftInner && leftInner.offsetWidth) || left.clientWidth;
            const fullH = W * ratio;
            topCrop.style.height = (divider.yRatio * fullH) + 'px';
            topCrop.style.overflow = 'hidden';
            topCrop.style.position = 'relative';
            const img = topCrop.querySelector('img');
            img.style.width = W + 'px';
            img.style.position = 'absolute';
            img.style.top = '0';
            img.style.left = '0';
        }
        if (bottomCrop) {
            const rightInner = document.querySelector('.split-right-inner');
            const W = (rightInner && rightInner.offsetWidth) || 400;
            const fullH = W * ratio;
            bottomCrop.style.height = ((1 - divider.yRatio) * fullH) + 'px';
            bottomCrop.style.overflow = 'hidden';
            bottomCrop.style.position = 'relative';
            const img = bottomCrop.querySelector('img');
            img.style.width = W + 'px';
            img.style.position = 'absolute';
            img.style.top = (-divider.yRatio * fullH) + 'px';
            img.style.left = '0';
        }
    }

    // ===== 条带标记模式（两击：题目块顶部 → 底部） =====
    function toggleStripEditMode() {
        const hw = getCurrentHomework();
        if (!hw || !hw.passages || hw.passages.length === 0) {
            notify('Please import a PDF first', 'info');
            return;
        }
        const units = buildMaterialUnits(hw);
        const curUnit = units[currentUnitIndex];
        if (!curUnit || curUnit.type !== 'image') {
            notify('Strips work only on PDF. Switch to the PDF page first', 'info');
            return;
        }
        stripEditMode = !stripEditMode;
        const btn = document.getElementById('stripEditBtn');
        const container = document.getElementById('passageContent');
        if (stripEditMode) {
            if (btn) btn.classList.add('active');
            if (splitMode) toggleSplitMode();   // 标记需在整页视图下做，先退出分栏
            setCanvasPointerEnabled(false);
            container.classList.add('strip-editing');
            container.addEventListener('click', handleStripClick, true);
            notify('Strip marking: click the TOP of a question block, then the BOTTOM', 'info');
        } else {
            if (btn) btn.classList.remove('active');
            container.classList.remove('strip-editing');
            container.removeEventListener('click', handleStripClick, true);
            clearStripMarker();
            stripFirstClick = null;
            // 恢复画笔交互（按当前工具）
            setDrawTool(state.drawingTool || 'select');
        }
    }

    // 清除第一击的横线标记
    function clearStripMarker() {
        document.querySelectorAll('.strip-marker-line').forEach(el => el.remove());
    }

    function handleStripClick(e) {
        const container = document.getElementById('passageContent');
        // 忽略点击在图片之外的
        if (!e.target.classList.contains('pdf-page') && !e.target.closest('.pdf-page')) return;

        // 与handleAnchorClick相同的数学：点击→pageIdx+yRatio
        const containerRect = container.getBoundingClientRect();
        const clickY = e.clientY - containerRect.top + container.scrollTop;
        const imgs = Array.from(container.querySelectorAll('.pdf-page'));
        let targetIdx = -1, yRatio = 0;
        for (let i = 0; i < imgs.length; i++) {
            const top = imgs[i].offsetTop;
            const bottom = top + imgs[i].offsetHeight;
            if (clickY >= top && clickY <= bottom) {
                targetIdx = i;
                yRatio = (clickY - top) / imgs[i].offsetHeight;
                break;
            }
        }
        if (targetIdx === -1) return;
        const pageIdx = parseInt(imgs[targetIdx].dataset.page);
        yRatio = parseFloat(Math.max(0, Math.min(1, yRatio)).toFixed(4));

        if (!stripFirstClick) {
            // 第一击：记录顶部 + 画横线标记
            stripFirstClick = { pageIdx, yRatio };
            clearStripMarker();
            const img = imgs[targetIdx];
            const marker = document.createElement('div');
            marker.className = 'strip-marker-line';
            marker.style.top = (img.offsetTop + yRatio * img.offsetHeight) + 'px';
            container.appendChild(marker);
            notify('Top marked. Now click the BOTTOM of the question block (Esc to cancel)', 'info');
            return;
        }

        // 第二击：同一页 + 合理高度 → 生成条带
        const first = stripFirstClick;
        stripFirstClick = null;
        clearStripMarker();
        if (first.pageIdx !== pageIdx) {
            notify('Two clicks must be on the SAME page. Start again', 'info');
            return;
        }
        if (yRatio <= first.yRatio + 0.01) {
            notify('Bottom must be below top. Start again', 'info');
            return;
        }

        const startY = first.yRatio, endY = yRatio;
        // qNums：区间内已有锚点的题号（联动滚动用）
        const hw = getCurrentHomework();
        const anchors = (hw.config && hw.config.anchors) || {};
        const qNums = Object.keys(anchors)
            .map(Number)
            .filter(q => anchors[q].pageIdx === pageIdx && anchors[q].yRatio >= startY && anchors[q].yRatio <= endY)
            .sort((a, b) => a - b);

        const strips = getQuestionStrips().slice();
        strips.push({ id: 's' + Date.now(), pageIdx, startY, endY, qNums, source: 'manual' });
        strips.sort((a, b) => a.pageIdx - b.pageIdx || a.startY - b.startY);
        saveQuestionStrips(strips);
        notify(`Strip added (P${pageIdx + 1} ${Math.round(startY * 100)}%–${Math.round(endY * 100)}%)${qNums.length ? ' · Q' + qNums.join(',') : ''}`, 'success');
    }

    // 删除单条条带
    function deleteStrip(id) {
        if (!confirm('Delete this question strip?')) return;
        saveQuestionStrips(getQuestionStrips().filter(s => s.id !== id));
        renderPassage();
        notify('Strip deleted', 'success');
    }

    // 清空所有条带
    function clearAllStrips() {
        if (!confirm('Delete ALL question strips of this homework?')) return;
        saveQuestionStrips([]);
        renderPassage();
        notify('All strips cleared', 'success');
    }

    // 点右栏条带 → 左栏滚到该条带位置并短暂高亮
    function locateStrip(id) {
        const s = getQuestionStrips().find(x => x.id === id);
        if (!s) return;
        const left = document.querySelector('.split-left');
        if (!left) return;
        const img = left.querySelector(`.pdf-page[data-page="${s.pageIdx}"]`);
        if (!img) return;
        // 滚到条带上缘（往上多留一点上下文）；瞬时跳转更可靠
        left.scrollTo({ top: Math.max(0, img.offsetTop + s.startY * img.offsetHeight - 40), behavior: 'auto' });
        // 高亮框：定位到条带区域，2秒淡出
        const old = document.getElementById('stripLocateBox');
        if (old) old.remove();
        const box = document.createElement('div');
        box.id = 'stripLocateBox';
        box.style.cssText = `position:absolute;left:0;right:0;z-index:4;pointer-events:none;
            top:${img.offsetTop + s.startY * img.offsetHeight}px;
            height:${(s.endY - s.startY) * img.offsetHeight}px;
            border:3px solid var(--color-primary);border-radius:4px;
            box-shadow:0 0 0 2000px rgba(0,0,0,0.15);
            transition:opacity 0.6s;`;
        // 挂到左栏滚动内容的定位参照层
        const anchorWrap = img.closest('.pdf-page-wrap') || left;
        anchorWrap.appendChild(box);
        setTimeout(() => { box.style.opacity = '0'; setTimeout(() => box.remove(), 700); }, 1800);
    }

    // 分隔线拖动调宽
    function setupSplitDivider() {
        const divider = document.getElementById('splitDivider');
        if (!divider) return;
        divider.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const wrap = document.querySelector('.split-wrap');
            const left = document.querySelector('.split-left');
            if (!wrap || !left) return;
            divider.classList.add('dragging');
            document.body.classList.add('split-resizing');
            const startX = e.clientX;
            const startLeftW = left.getBoundingClientRect().width;
            const wrapW = wrap.getBoundingClientRect().width;
            const onMove = (ev) => {
                // 左栏宽 = 初始 + 拖动量（钳制 25%~80%）
                let w = startLeftW + (ev.clientX - startX);
                w = Math.max(wrapW * 0.25, Math.min(wrapW * 0.8, w));
                left.style.flex = `0 0 ${w}px`;
                layoutStrips();
            };
            const onUp = () => {
                divider.classList.remove('dragging');
                document.body.classList.remove('split-resizing');
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                resizeCanvasAfterSplit();
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    // Esc取消标记第一击
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && stripEditMode && stripFirstClick) {
            stripFirstClick = null;
            clearStripMarker();
            notify('Strip marking cancelled', 'info');
        }
    });


    // ===== 原文缩放 =====
    let passageZoom = 1.0;  // 缩放比例，1.0=100%
    // 默认缩放（锁定后跨作业/刷新保留），存localStorage
    let defaultZoom = parseFloat(localStorage.getItem('afr-default-zoom')) || 1.0;
    const ZOOM_MIN = 0.5;
    const ZOOM_MAX = 3.0;

    /**
     * 调整原文缩放：通过改变 .pdf-page 的 width 实现
     * 容器高度自适应，滚动条自动更新
     */
    let zoomLocked = false;   // 缩放锁定状态：锁定后禁止➕/➖调节

    function zoomPassage(delta) {
        if (zoomLocked) { notify('🔒 Zoom is LOCKED — click the 🔒 button to unlock, then adjust', 'error'); return; }
        const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, passageZoom + delta));
        if (newZoom === passageZoom) {
            notify(delta > 0 ? 'Already at max zoom (300%)' : 'Already at min zoom (50%)', 'info');
            return;
        }
        passageZoom = newZoom;
        applyZoom();
    }

    function resetZoom() {
        if (zoomLocked) { notify('🔒 Zoom is LOCKED — click the 🔒 button to unlock, then adjust', 'error'); return; }
        // 有锁定的默认值则回到默认值，否则100%
        passageZoom = defaultZoom || 1.0;
        applyZoom();
        updateLockBtn();
    }

    /**
     * 锁定/解锁当前缩放：锁定后禁止调节，跨作业/刷新保持；再点解锁
     */
    function lockDefaultZoom() {
        zoomLocked = !zoomLocked;
        if (zoomLocked) {
            defaultZoom = passageZoom;
            localStorage.setItem('afr-default-zoom', String(defaultZoom));
            notify('Zoom locked: ' + Math.round(defaultZoom * 100) + '%', 'success');
        } else {
            // 解锁同时清掉默认值：否则残留的defaultZoom会在每次重渲染时劫持缩放
            defaultZoom = 1.0;
            localStorage.removeItem('afr-default-zoom');
            notify('Zoom unlocked (default zoom cleared)', 'info');
        }
        updateLockBtn();
    }

    /** 更新锁定按钮显示当前默认值 */
    function updateLockBtn() {
        const btn = document.getElementById('zoomLockBtn');
        if (btn) {
            btn.textContent = '🔒 ' + Math.round((defaultZoom || 1) * 100) + '%';
            btn.classList.toggle('locked', zoomLocked);
        }
    }

    // 工具栏左右箭头滑动（窄屏露出被截断的按钮）
    function scrollToolbar(dir) {
        const tb = document.getElementById('drawingToolbar');
        if (!tb) return;
        tb.scrollBy({ left: dir * 200, behavior: 'smooth' });
    }

    function applyZoom() {
        if (splitMode) {
            // 分栏模式：左右栏内容容器各自横向缩放（超宽时栏内横向滚动）
            const leftInner = document.querySelector('.split-left .passage-scroll-inner');
            const rightInner = document.querySelector('.split-right-inner');
            if (leftInner) leftInner.style.width = (passageZoom * 100) + '%';
            if (rightInner) rightInner.style.width = (passageZoom * 100) + '%';
        } else {
            const imgs = document.querySelectorAll('#passageContent .pdf-page');
            imgs.forEach(img => {
                img.style.width = (passageZoom * 100) + '%';
            });
        }
        const levelEl = document.getElementById('zoomLevel');
        if (levelEl) levelEl.textContent = Math.round(passageZoom * 100) + '%';
        // 分栏模式：裁切高度需随缩放重算
        if (splitMode) setTimeout(() => layoutStrips(), 60);
        // 缩放后重新同步Canvas尺寸
        setTimeout(() => resizeCanvas(), 50);
    }

    function toggleAnchorEditMode() {
        const hw = getCurrentHomework();
        if (!hw || !hw.passages || hw.passages.length === 0) {
            notify('No PDF in this homework yet. Wait until import finishes (see page progress), or import via ⚙Data', 'info');
            return;
        }
        // 锚点定位仅在image类型unit（PDF）下可用
        const units = buildMaterialUnits(hw);
        const curUnit = units[currentUnitIndex];
        if (!curUnit || curUnit.type !== 'image') {
            notify('Pin works only on PDF. Switch to the PDF page first', 'info');
            return;
        }
        anchorEditMode = !anchorEditMode;

        // 进入Pin时若在分栏状态：先退出分栏（分栏DOM是裁切段，点击数学会错位）
        if (anchorEditMode && splitMode) toggleSplitMode();

        const btn = document.getElementById('anchorEditBtn');
        if (anchorEditMode) {
            btn.classList.add('active');
            // 校准期间强制禁用Canvas交互，避免画笔层拦截点击
            setCanvasPointerEnabled(false);
            enterAnchorEditMode();
        } else {
            btn.classList.remove('active');
            exitAnchorEditMode();
            // 恢复Canvas交互状态（按当前工具）
            if (fabricCanvas) {
                const isDrawing = state.drawingTool !== 'select';
                setCanvasPointerEnabled(isDrawing);
            }
        }
    }

    /**
     * 统一控制Fabric.js Canvas的pointer-events
     * @param {boolean} enabled - true=可交互(绘画), false=穿透(选择/校准)
     */
    function setCanvasPointerEnabled(enabled) {
        if (!fabricCanvas || !fabricCanvas.wrapperEl) return;
        const wrapperEl = fabricCanvas.wrapperEl;
        const lower = wrapperEl.querySelector('.lower-canvas');
        const upper = wrapperEl.querySelector('.upper-canvas');
        wrapperEl.style.pointerEvents = enabled ? 'auto' : 'none';
        if (lower) lower.style.pointerEvents = enabled ? 'auto' : 'none';
        if (upper) upper.style.pointerEvents = enabled ? 'auto' : 'none';
        wrapperEl.style.cursor = enabled ? 'crosshair' : 'default';
    }

    function enterAnchorEditMode() {
        const container = document.getElementById('passageContent');
        if (!container) return;
        // 关闭已存在的弹窗（不清除class，保持模式）
        const oldDialog = document.getElementById('anchorPicker');
        if (oldDialog) oldDialog.remove();

        // 在容器上叠加校准状态：CSS提供十字光标+蒙层+顶部提示
        container.classList.add('anchor-editing');
        // 挂载点击监听（捕获阶段，确保在内容事件前触发）
        container.addEventListener('click', handleAnchorClick, true);
        notify('Click a question spot on the paper, then pick its number', 'info');
    }

    function exitAnchorEditMode() {
        const container = document.getElementById('passageContent');
        if (container) {
            container.classList.remove('anchor-editing');
            container.removeEventListener('click', handleAnchorClick, true);
        }
        // 关闭可能存在的题号选择弹窗
        const dialog = document.getElementById('anchorPicker');
        if (dialog) dialog.remove();
    }

    function handleAnchorClick(e) {
        const container = document.getElementById('passageContent');
        // 忽略点击到 pdf-page 之外的（如顶部提示文字、空白）
        if (!e.target.classList.contains('pdf-page') && !e.target.closest('.pdf-page')) {
            // 点在空白处：若是选择弹窗内的点击，不处理（弹窗在body层，不会触发此监听）
            return;
        }
        // 点击相对容器的位置（含滚动偏移）
        const containerRect = container.getBoundingClientRect();
        const clickY = e.clientY - containerRect.top + container.scrollTop;

        // 找到点击位置落在哪个 pdf-page 图片上，计算 pageIdx + yRatio
        const imgs = Array.from(container.querySelectorAll('.pdf-page'));
        let targetIdx = -1;
        let yRatio = 0;
        for (let i = 0; i < imgs.length; i++) {
            const top = imgs[i].offsetTop;
            const bottom = top + imgs[i].offsetHeight;
            if (clickY >= top && clickY <= bottom) {
                targetIdx = i;
                yRatio = (clickY - top) / imgs[i].offsetHeight;
                break;
            }
        }
        // 超出范围（点在最后一张图下方）归到最后一张
        if (targetIdx === -1 && imgs.length > 0) {
            targetIdx = imgs.length - 1;
            const last = imgs[targetIdx];
            yRatio = Math.min(1, (clickY - last.offsetTop) / last.offsetHeight);
        }
        if (targetIdx === -1) return;

        showAnchorPicker(targetIdx, parseFloat(yRatio.toFixed(4)), e.clientX, e.clientY);
    }

    /**
     * 弹出题号选择框，让用户选择要关联到该锚点的题号
     */
    function showAnchorPicker(pageIdx, yRatio, x, y) {
        const hw = getCurrentHomework();
        const existing = (hw.config && hw.config.anchors) ? hw.config.anchors : {};

        // 候选题号：优先validQuestions，否则用TYPE_RANGES全范围
        let candidates = [];
        if (hw.config && hw.config.validQuestions && hw.config.validQuestions.length) {
            candidates = hw.config.validQuestions;
        } else {
            Object.values(TYPE_RANGES).forEach(r => {
                for (let n = r.min; n <= r.max; n++) candidates.push(n);
            });
        }
        candidates.sort((a, b) => a - b);

        const old = document.getElementById('anchorPicker');
        if (old) old.remove();

        const dialog = document.createElement('div');
        dialog.id = 'anchorPicker';
        dialog.style.cssText = 'position:fixed;background:var(--bg-panel);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.2);padding:14px;z-index:10000;max-width:340px;max-height:60vh;overflow-y:auto;border:1px solid var(--border-color-light)';

        // 定位弹窗（避免超出屏幕）
        let left = x + 10, top = y + 10;
        if (left + 340 > window.innerWidth) left = window.innerWidth - 350;
        if (top + 200 > window.innerHeight) top = y - 210;
        dialog.style.left = left + 'px';
        dialog.style.top = top + 'px';

        let titleText = `Page ${pageIdx + 1} · ${Math.round(yRatio * 100)}%`;
        // 显示该位置已有锚点
        const matched = Object.keys(existing).find(k =>
            existing[k].pageIdx === pageIdx && Math.abs(existing[k].yRatio - yRatio) < 0.02
        );
        if (matched) titleText += `(now: Q${matched})`;

        dialog.innerHTML = `
            <div style="font-size:13px;font-weight:600;margin-bottom:10px;color:var(--text-primary)">📍 ${titleText}</div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:8px">Pick a question number for this spot (small text = current page):</div>
            <div id="anchorPickerGrid" style="display:grid;grid-template-columns:repeat(8,1fr);gap:4px;">
                ${candidates.map(q => {
                    const anchor = existing[q];
                    const has = anchor ? 'border-color:var(--color-success);color:var(--color-success);' : '';
                    const subPage = anchor ? `<div style="font-size:9px;color:var(--text-tertiary);font-weight:normal;margin-top:1px">→P${anchor.pageIdx+1}</div>` : '';
                    return `<div class="anchor-pick-item" data-q="${q}" style="padding:3px;text-align:center;border:1px solid var(--border-color);border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;background:var(--bg-panel);${has}">${q}${subPage}</div>`;
                }).join('')}
            </div>
            <div style="display:flex;gap:6px;margin-top:10px;justify-content:flex-end">
                <button id="anchorClearBtn" style="padding:4px 10px;border:1px solid var(--border-danger);border-radius:4px;background:var(--bg-panel);color:var(--color-danger-strong);cursor:pointer;font-size:12px">Clear</button>
                <button id="anchorCancelBtn" style="padding:4px 10px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-panel);cursor:pointer;font-size:12px">Cancel</button>
            </div>
        `;
        document.body.appendChild(dialog);

        // 题号点击：保存锚点
        dialog.querySelectorAll('.anchor-pick-item').forEach(item => {
            item.onclick = () => {
                const qNum = parseInt(item.dataset.q);
                if (!hw.config) hw.config = { validQuestions: [] };
                if (!hw.config.anchors) hw.config.anchors = {};
                hw.config.anchors[qNum] = { pageIdx, yRatio };
                saveHomework(hw.id);
                notify(`Q${qNum} pinned → Page ${pageIdx+1} @ ${Math.round(yRatio*100)}%`, 'success');
                dialog.remove();
            };
        });

        // 清除按钮：清除离该位置最近的锚点
        document.getElementById('anchorClearBtn').onclick = () => {
            if (matched && existing[matched]) {
                delete existing[matched];
                hw.config.anchors = existing;
                saveHomework(hw.id);
                notify(`已清除第${matched}题锚点`, 'success');
            } else {
                notify('No anchor set at this spot', 'info');
            }
            dialog.remove();
        };

        document.getElementById('anchorCancelBtn').onclick = () => dialog.remove();
    }

    // ===== 题目详情渲染 =====
    function renderQuestionDetail() {
        const container = document.getElementById('questionDetail');
        if (!container) return;

        if (!state.activeQuestionId) {
            container.innerHTML = '';
            container.classList.remove('has-content');
            return;
        }

        const questions = getCurrentQuestions();
        const q = questions.find(q => q.id === state.activeQuestionId);
        if (!q) {
            container.innerHTML = '';
            container.classList.remove('has-content');
            return;
        }

        container.classList.add('has-content');

        const diff = getDifficultyByRate(q.classRate || 0);
        const totalStudents = getCurrentScores().length || 1;

        container.innerHTML = `
            <div class="detail-resize-handle" title="拖动调整卡片高度"></div>
            <div class="detail-card">
                <div class="detail-header">
                    <div class="detail-title">Q${q.id} <span style="font-weight:400;color:var(--text-tertiary);font-size:12px">${q.type || ''} ${q.score || ''}pts</span></div>
                    <div style="display:flex;align-items:center;gap:8px">
                        <span class="detail-badge ${diff}">${DIFFICULTY_LABELS[diff]}</span>
                        <button onclick="AFR.closeQuestionDetail()" style="width:22px;height:22px;border:none;background:var(--border-color-lighter);border-radius:50%;cursor:pointer;font-size:13px;color:var(--text-tertiary);display:flex;align-items:center;justify-content:center;line-height:1" title="关闭">✕</button>
                    </div>
                </div>
                <div class="detail-stats">
                    <div class="stat-item">
                        <div class="stat-label">Class Rate</div>
                        <div class="stat-value" style="color:var(${diff === 'easy' ? '--diff-easy-text' : diff === 'medium' ? '--diff-medium-text' : diff === 'hard' ? '--diff-hard-text' : '--diff-difficult-text'})">${(q.classRate || 0).toFixed(1)}%</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">School Rate</div>
                        <div class="stat-value">${(q.schoolRate || 0).toFixed(1)}%</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Answer</div>
                        <div class="stat-value" style="color:var(--color-success)">${q.correctAnswer || '-'}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Error Rate</div>
                        <div class="stat-value">${(q.errorRate || 0).toFixed(1)}%</div>
                    </div>
                </div>
                <div class="option-bars">
                    ${renderOptionBars(q, totalStudents)}
                </div>
                ${q.aiAnalysis ? `<button class="btn btn-primary" style="width:100%;margin:2px 0 10px" onclick="AFR.openVariantPage(${q.id})">⚔ 变式训练（${Object.keys(q.aiAnalysis.options || {}).length} 个错误选项）</button>` : ''}
                <div class="detail-knowledge">
                    Knowledge: <span>${q.knowledgePoints || 'N/A'}</span>
                </div>
            </div>
        `;
    }

    // ===== 变式训练：双通道（通道②导出错题包/导入分析JSON；通道①内置AI后续接入，共用挂载结构） =====

    const escVariantText = s => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // 选项值防御性去前缀：数据若自带"A. xxx"则剥掉，避免渲染成"A. A. xxx"
    const cleanOptText = s => escVariantText(s).replace(/^\s*([A-G])[.、．:：]\s*/i, '');

    // 通道②·导出：当前班红黄题(<70%) + 每题TOP2错误选项(人数/名单) → 数据包JSON下载
    function exportErrorPackage() {
        const hw = getCurrentHomework();
        if (!hw) { notify('No current assignment', 'error'); return; }
        const questions = getCurrentQuestions();
        const redYellow = questions.filter(q => q.classRate != null && q.classRate < 70);
        if (redYellow.length === 0) { notify('当前班级没有红/黄题（正确率均≥70%），无需数据包', 'info'); return; }

        const pkg = {
            assignment: hw.name,
            class: state.currentClass,
            className: state.currentClass === 'class9' ? '高三09班' : '高三11班',
            exportedAt: new Date().toISOString().slice(0, 10),
            standard: { red: '<60% 详细评讲', yellow: '60%~70% 快速评讲', note: '请只为下列题目生成分析，每题只针对topWrongOptions列出的两个错误选项' },
            questions: redYellow.map(q => {
                const wrong = Object.entries(q.options || {})
                    .filter(([L, o]) => L !== q.correctAnswer && (o.count || 0) > 0)
                    .sort((a, b) => (b[1].count || 0) - (a[1].count || 0))
                    .slice(0, 2)
                    .map(([L, o]) => ({ letter: L, count: o.count || 0, names: o.names || [] }));
                return {
                    id: q.id,
                    type: q.type || '',
                    classRate: q.classRate,
                    schoolRate: q.schoolRate,
                    correctAnswer: q.correctAnswer,
                    answeredCount: q.answeredCount,
                    unanswered: (q.unanswered && q.unanswered.count) || 0,
                    topWrongOptions: wrong,
                };
            }),
        };

        const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `错题包-${hw.name}-${pkg.className}-${pkg.exportedAt}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        notify(`已导出 ${redYellow.length} 道红黄题数据包（每题含TOP2错误选项+名单）`, 'success');
    }

    // ===== 合并JSON导入（「考试名称-合并.json」，⚙→🤖 Import AI Analysis 入口） =====
    // 格式：{type:'afr-merged', exam, assignment, generatedAt,
    //        modules:{ analysis, mindmap, essay, bojian }}
    // analysis → 逐题AI分析挂到作业题目（同单板块JSON）；mindmap → 按题型并入 mmAnalysis；
    // essay → Composition 追加篇目（EssayReview._importMerged）；bojian → Extension 追加试卷（Bojian._importMerged）
    function importMergedJSON(data, curHw) {
        const normName = s => String(s || '').replace(/[-—–\s（）()]/g, '');
        let target = curHw, switched = false;
        const wantName = data.assignment || data.exam || '';
        if (wantName) {
            const na = normName(wantName), nb = normName(curHw && curHw.name);
            if (na !== nb && !nb.includes(na) && !na.includes(nb)) {
                const match = homeworkOrder.map(id => homeworks[id]).find(h => {
                    if (!h) return false;
                    const nh = normName(h.name);
                    return nh === na || nh.includes(na) || na.includes(nh);
                });
                if (match) { target = match; switched = true; }
            }
        }
        const M = data.modules || {};
        const done = [], failed = [];

        // ① Review：逐题AI分析（与单板块JSON同结构）
        if (M.analysis) {
            try {
                const a = M.analysis;
                const byClass = a.classes && (a.classes.class9 || a.classes.class11)
                    ? a.classes
                    : { [(a.class === 'class9' || a.class === 'class11') ? a.class : state.currentClass]: a.questions || [] };
                let attached = 0, miss = 0;
                Object.keys(byClass).forEach(cls => {
                    const qs = target.questions && target.questions[cls];
                    if (!qs || !qs.length) return;
                    (byClass[cls] || []).forEach(item => {
                        const q = qs.find(x => x.id === item.id);
                        if (!q) { miss++; return; }
                        const opts = {};
                        (item.options || []).forEach(o => { if (o && o.letter) opts[o.letter] = o; });
                        q.aiAnalysis = {
                            knowledgePoint: item.knowledgePoint || '',
                            source: a.source || 'merged',
                            generatedAt: a.generatedAt || data.generatedAt || new Date().toISOString().slice(0, 10),
                            options: opts,
                        };
                        attached++;
                    });
                });
                if (attached) done.push('Review AI分析 ' + attached + ' 题' + (miss ? '（' + miss + ' 题未匹配）' : ''));
                else failed.push('Review：未匹配到题目（需先导该练习成绩Excel）');
            } catch (e) { failed.push('Review：' + e.message); }
        }

        // ② MindMap：语篇研读按题型并入 mmAnalysis（text/roleFns/nodes/edges 逐题型合并）
        if (M.mindmap && typeof M.mindmap === 'object') {
            try {
                let n = 0;
                target.mmAnalysis = target.mmAnalysis || {};
                Object.keys(M.mindmap).forEach(d => {
                    if (!d || typeof M.mindmap[d] !== 'object' || !M.mindmap[d]) return;
                    target.mmAnalysis[d] = Object.assign({}, target.mmAnalysis[d], M.mindmap[d]);
                    n++;
                });
                if (n) done.push('MindMap 语篇 ' + n + ' 篇');
                else failed.push('MindMap：modules.mindmap 为空');
            } catch (e) { failed.push('MindMap：' + e.message); }
        }

        // ③ Composition：作文评讲篇目（静默追加，按 id 去重覆盖）
        if (M.essay) {
            try {
                if (window.EssayReview && typeof EssayReview._importMerged === 'function') {
                    const r = EssayReview._importMerged(M.essay);
                    if (r && r.ok) done.push('Composition ' + r.msg);
                    else failed.push('Composition：' + ((r && r.msg) || '导入失败'));
                } else failed.push('Composition：essay-review.js 未加载');
            } catch (e) { failed.push('Composition：' + e.message); }
        }

        // ④ Extension：博见试卷（单卷格式静默追加，同名覆盖）
        if (M.bojian) {
            try {
                if (window.Bojian && typeof Bojian._importMerged === 'function') {
                    const r = Bojian._importMerged(M.bojian);
                    if (r && r.ok) done.push('Extension ' + r.msg);
                    else failed.push('Extension：' + ((r && r.msg) || '导入失败'));
                } else failed.push('Extension：bojian.js 未加载');
            } catch (e) { failed.push('Extension：' + e.message); }
        }

        if (!done.length) throw new Error('合并JSON中没有成功导入任何板块' + (failed.length ? '——' + failed.join('；') : ''));
        saveHomework(target.id);
        if (switched) {
            state.currentHomework = target.id;
            saveAppState();
            renderHomeworkMenu();
            renderAll();
        }
        renderQuestionDetail();
        closeDataPanel();
        notify(`合并导入完成「${target.name}」${switched ? '（已自动切换到该作业）' : ''}：${done.join('；')}${failed.length ? '；⚠ ' + failed.join('；') : ''}`, 'success');
    }

    // 通道②·导入：分析JSON → 挂载到当前作业的题目（q.aiAnalysis）
    // 支持两种格式：双班合一 {classes:{class9:[...],class11:[...]}} 或 单班 {class:"class9",questions:[...]}
    function importAnalysis() {
        const input = document.getElementById('analysisFileInput');
        const file = input && input.files && input.files[0];
        if (!file) { notify('请先选择分析JSON文件', 'error'); return; }
        const hw = getCurrentHomework();
        if (!hw) { notify('No current assignment', 'error'); return; }

        const reader = new FileReader();
        reader.onload = e => {
            try {
                const data = JSON.parse(e.target.result);

                // 合并JSON（考试名称-合并.json）：type=afr-merged 且含 modules——分发到各板块后结束
                if (data && typeof data === 'object' && (data.type === 'afr-merged' || data.modules)) {
                    importMergedJSON(data, hw);
                    return;
                }

                // 作业自动定位：精确名→归一化模糊匹配（忽略连字符/空格/括号差异，
                // 兼容"2026-2027学年度"被历史版本切开成"2027学年度"的作业名）
                const normName = s => String(s || '').replace(/[-—–\s（）()]/g, '');
                let target = hw;
                let switched = false;
                if (data.assignment) {
                    const na = normName(data.assignment), nb = normName(hw.name);
                    const nameMatch = h => {
                        if (!h) return false;
                        const nh = normName(h.name);
                        return nh === na || nh.includes(na) || na.includes(nh);
                    };
                    if (na !== nb && !nb.includes(na) && !na.includes(nb)) {
                        const match = homeworkOrder.map(id => homeworks[id]).find(nameMatch);
                        if (match) { target = match; switched = true; }
                        else {
                            throw new Error(`此JSON对应《${data.assignment}》，当前作业是《${hw.name}》，找不到名称相符的作业——请先导入该练习的成绩Excel`);
                        }
                    }
                }

                // 归一为 {classKey: [题目...]}
                const byClass = data.classes && (data.classes.class9 || data.classes.class11)
                    ? data.classes
                    : { [(data.class === 'class9' || data.class === 'class11') ? data.class : state.currentClass]: data.questions || [] };

                let attached = 0;
                const report = [];
                const missing = [];
                Object.keys(byClass).forEach(cls => {
                    const qs = target.questions[cls];
                    if (!qs || !qs.length) { report.push(`${cls === 'class9' ? '9班' : '11班'}无题目数据，跳过`); return; }
                    let n = 0;
                    (byClass[cls] || []).forEach(item => {
                        const q = qs.find(x => x.id === item.id);
                        if (!q) { missing.push(`${cls === 'class9' ? '9班' : '11班'}Q${item.id}`); return; }
                        const opts = {};
                        (item.options || []).forEach(o => { if (o && o.letter) opts[o.letter] = o; });
                        q.aiAnalysis = {
                            knowledgePoint: item.knowledgePoint || '',
                            source: data.source || 'import',
                            generatedAt: data.generatedAt || new Date().toISOString().slice(0, 10),
                            options: opts,
                        };
                        n++; attached++;
                    });
                    if (n) report.push(`${cls === 'class9' ? '9班' : '11班'}${n}题`);
                });

                if (attached === 0) throw new Error('没有匹配到任何题目——请检查：①是否已导入该练习的成绩Excel ②浏览器是否为最新版（Ctrl+Shift+R强刷）');
                saveHomework(target.id);
                if (switched) {
                    state.currentHomework = target.id;
                    saveAppState();
                    renderHomeworkMenu();
                    renderAll();
                }
                renderQuestionDetail();
                closeDataPanel();
                notify(`AI分析已挂载「${target.name}」${switched ? '（已自动切换到该作业）' : ''}：${report.join('，')}${missing.length ? '；未找到: ' + missing.join(', ') : ''}`, 'success');
            } catch (err) {
                notify('导入失败: ' + err.message, 'error');
                console.error('[AFR] 分析导入失败:', err);
            }
        };
        reader.onerror = () => notify('文件读取失败', 'error');
        reader.readAsText(file, 'utf-8');
    }

    function clearAnalysisData() {
        const hw = getCurrentHomework();
        if (!hw) return;
        const qs = hw.questions[state.currentClass] || [];
        let n = 0;
        qs.forEach(q => { if (q.aiAnalysis) { delete q.aiAnalysis; n++; } });
        saveHomework(hw.id);
        renderQuestionDetail();
        notify(n ? `已清除 ${n} 题的AI分析` : '当前班无已挂载的AI分析', 'info');
    }

    // 变式弹窗页：TOP2错误选项 × (类型标签+错因+变式题)，答案默认隐藏点击揭示
    function openVariantPage(qId) {
        const questions = getCurrentQuestions();
        const q = questions.find(x => x.id === (qId || state.activeQuestionId));
        const overlay = document.getElementById('variantOverlay');
        const box = document.getElementById('variantContainer');
        if (!q || !q.aiAnalysis) { notify('该题暂无AI分析（先经「导入AI分析」或内置AI生成）', 'info'); return; }

        const a = q.aiAnalysis;
        const diff = getDifficultyByRate(q.classRate || 0);

        box.innerHTML = `
            <div class="variant-head">
                <div class="variant-title">Q${q.id} 变式训练 · ${escVariantText(q.type || '')}</div>
                <button class="btn clear-btn" onclick="AFR.closeVariantPage()">✕ 关闭 (Esc)</button>
            </div>
            <div class="variant-kp">
                考点：${escVariantText(a.knowledgePoint || '—')} ｜
                班级正确率 ${(q.classRate || 0).toFixed(1)}%（${DIFFICULTY_LABELS[diff]}）｜
                正确答案 ${escVariantText(q.correctAnswer || '—')}
            </div>
            ${Object.keys(a.options).map(L => {
                const o = a.options[L] || {};
                const dist = (q.options || {})[L] || { count: 0, names: [] };
                const names = dist.names || [];
                const v = o.variant || {};
                const vOpts = v.options || {};
                return `<div class="variant-block">
                    <div class="variant-block-head">
                        <span class="variant-opt-badge">错误选项 ${escVariantText(L)}</span>
                        <span class="variant-etype">${escVariantText(o.errorType || '')}</span>
                        <span class="variant-count">${dist.count || 0} 人选择${names.length ? ` · <span class="names-toggle" onclick="const el=this.closest('.variant-block').querySelector('.variant-names');el.style.display=el.style.display==='none'?'flex':'none'">名单</span>` : ''}</span>
                    </div>
                    ${names.length ? `<div class="variant-names option-names" style="display:none;margin:0 0 10px">${names.map(n => `<span class="name-chip">${escVariantText(n)}</span>`).join(' ')}</div>` : ''}
                    <div class="variant-cause">${escVariantText(o.cause || '')}</div>
                    ${v.stem ? `<div class="variant-q">
                        <div class="variant-q-label">变 式 题（同类陷阱 · 新语料）</div>
                        <div class="variant-stem">${escVariantText(v.stem)}</div>
                        <div class="variant-options">
                            ${Object.keys(vOpts).map(k => `<div class="variant-opt"><b>${escVariantText(k)}.</b> ${cleanOptText(vOpts[k])}</div>`).join('')}
                        </div>
                        <button class="btn btn-primary" onclick="this.nextElementSibling.classList.add('show');this.style.display='none'">显示答案与简析</button>
                        <div class="variant-answer"><b>答案：${escVariantText(v.answer || '—')}</b><br>${escVariantText(v.analysis || '')}</div>
                    </div>` : ''}
                </div>`;
            }).join('')}
        `;
        overlay.classList.add('open');
        overlay.scrollTop = 0;
        document.body.style.overflow = 'hidden';
    }

    function closeVariantPage() {
        document.getElementById('variantOverlay').classList.remove('open');
        document.body.style.overflow = '';
    }

    // ===== 详情卡顶部把手：拖拽调整高度（触屏可用，高度记入localStorage） =====
    (function initDetailCardResize() {
        const KEY = 'afr_detail_card_height';
        const card = document.getElementById('questionDetail');
        if (!card) return;

        // 恢复上次高度
        const saved = parseFloat(localStorage.getItem(KEY));
        if (saved >= 120) {
            card.style.height = saved + 'px';
            card.style.maxHeight = '85%';
        }

        let startY = 0, startH = 0, dragging = false;
        const pointY = e => (e.touches ? e.touches[0].clientY : e.clientY);

        const onDown = e => {
            const handle = e.target.closest('.detail-resize-handle');
            if (!handle) return;
            dragging = true;
            startY = pointY(e);
            startH = card.getBoundingClientRect().height;
            handle.classList.add('dragging');
            document.body.classList.add('detail-resizing');
            e.preventDefault();
        };
        const onMove = e => {
            if (!dragging) return;
            const panelH = card.parentElement ? card.parentElement.getBoundingClientRect().height : 800;
            const h = Math.min(Math.max(startH + (startY - pointY(e)), 120), panelH * 0.85);
            card.style.height = h + 'px';
            card.style.maxHeight = '85%';
            if (e.cancelable) e.preventDefault();
        };
        const onUp = () => {
            if (!dragging) return;
            dragging = false;
            card.querySelector('.detail-resize-handle')?.classList.remove('dragging');
            document.body.classList.remove('detail-resizing');
            localStorage.setItem(KEY, String(Math.round(card.getBoundingClientRect().height)));
        };

        card.addEventListener('mousedown', onDown);
        card.addEventListener('touchstart', onDown, { passive: false });
        window.addEventListener('mousemove', onMove);
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('mouseup', onUp);
        window.addEventListener('touchend', onUp);
    })();

    function renderOptionBars(q, total) {
        // 主观题分数段（语法填空三态 / 应用文·读后续写 L1–L5）：替代选项分布显示
        if (q.scoreBands && q.scoreBands.length) {
            const btotal = q.scoreBands.reduce((s, b) => s + b.count, 0) || 1;
            return q.scoreBands.map(b => {
                const pct = b.count / btotal * 100;
                const names = (b.names || []).filter(Boolean);
                const hasNames = names.length > 0;
                return `<div class="option-bar-block band">
                    <div class="option-bar-row ${hasNames ? 'clickable' : ''}" ${hasNames ? `onclick="this.parentElement.classList.toggle('names-open')" title="点击展开/收起学生名单"` : ''}>
                        <span class="option-label band">${escVariantText(b.label)}</span>
                        <div class="option-bar-track">
                            <div class="option-bar-fill ${b.cls}" style="width:${pct}%"></div>
                        </div>
                        <span class="option-count">${b.count}</span>
                    </div>
                    ${hasNames ? `<div class="option-names">${names.map(n => `<span class="name-chip">${escVariantText(n)}</span>`).join('')}</div>` : ''}
                </div>`;
            }).join('');
        }

        const options = q.options || {};
        // 动态选项字母：实际选项数据 ∪ 题型应有全集（听力A-C/七选五A-G/其余A-D）——0人选择的选项也显示
        const letterSet = new Set(Object.keys(options));
        if (q.correctAnswer) letterSet.add(q.correctAnswer);
        // 旧存储的主观题数据（无选项也无分数段）：不显示A-D空条，提示重导
        if (letterSet.size === 0) {
            return `<div style="font-size:12px;color:var(--text-tertiary);padding:4px 0 8px">主观题：用当前版本重新导入成绩Excel后，此处显示分数段统计</div>`;
        }
        if (q.typeKey === 'listening') ['A', 'B', 'C'].forEach(L => letterSet.add(L));
        else if (q.typeKey === 'sevenfive') ['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach(L => letterSet.add(L));
        else if (q.typeKey) ['A', 'B', 'C', 'D'].forEach(L => letterSet.add(L));   // 题型未知时保持数据驱动，不硬造选项
        const labels = [...letterSet].sort();
        const answered = q.answeredCount || total;
        const unans = (q.unanswered && q.unanswered.count > 0) ? q.unanswered : null;
        const base = answered + (unans ? unans.count : 0);   // 比例基准 = 有效人数（作答+未作答）

        let rows = labels.map(label => {
            const opt = options[label] || { count: 0, names: [] };
            const pct = base > 0 ? (opt.count / base * 100) : 0;
            const isCorrect = q.correctAnswer === label;
            const names = (opt.names || []).filter(Boolean);
            const hasNames = names.length > 0;
            // 名单默认收起，点击长条行展开/收起（正确项绿色✓，错误项红色）
            return `<div class="option-bar-block">
                <div class="option-bar-row ${hasNames ? 'clickable' : ''}" ${hasNames ? `onclick="this.parentElement.classList.toggle('names-open')" title="点击展开/收起学生名单"` : ''}>
                    <span class="option-label">${label}${isCorrect ? ' ✓' : ''}</span>
                    <div class="option-bar-track">
                        <div class="option-bar-fill ${isCorrect ? 'correct' : 'wrong'}" style="width:${pct}%"></div>
                    </div>
                    <span class="option-count">${opt.count}</span>
                </div>
                ${hasNames ? `<div class="option-names">${names.map(n => `<span class="name-chip">${n}</span>`).join('')}</div>` : ''}
            </div>`;
        }).join('');

        // 未作答行（仅在有人未作答时出现，灰色条，可点击看名单）
        if (unans) {
            const names = (unans.names || []).filter(Boolean);
            const hasNames = names.length > 0;
            const pct = base > 0 ? (unans.count / base * 100) : 0;
            rows += `<div class="option-bar-block">
                <div class="option-bar-row ${hasNames ? 'clickable' : ''}" ${hasNames ? `onclick="this.parentElement.classList.toggle('names-open')" title="点击展开/收起学生名单"` : ''}>
                    <span class="option-label">未作答</span>
                    <div class="option-bar-track">
                        <div class="option-bar-fill muted" style="width:${pct}%"></div>
                    </div>
                    <span class="option-count">${unans.count}</span>
                </div>
                ${hasNames ? `<div class="option-names">${names.map(n => `<span class="name-chip">${n}</span>`).join('')}</div>` : ''}
            </div>`;
        }
        return rows;
    }

    // ===== 原文渲染 + 题目联动 =====
    // 左侧原文翻页状态
    let currentPassagePage = 0;
    let currentUnitIndex = 0;        // 当前素材单元索引（导航主索引）
    let unitScrollMap = {};          // 各unit记忆的滚动位置 { unitIndex: scrollTop }

    function renderPassage() {
        const container = document.getElementById('passageContent');
        const titleEl = document.getElementById('passageTitle');
        const navEl = document.getElementById('passageNav');
        if (!container) return;

        const hw = getCurrentHomework();
        if (!hw || !hw.passages || hw.passages.length === 0) {
            container.innerHTML = '<div class="empty-state" style="height:100%"><div class="empty-icon">📝</div><div class="empty-text">No passage material yet</div></div>';
            titleEl.textContent = '原文与题目';
            if (navEl) navEl.classList.remove('show');
            return;
        }

        // ★恢复持久化的分栏状态：splitMode是内存变量，刷新即丢（divider持久化而开关不持久化，
        //   曾造成"split静默关闭"被误报为定位失效）。定界模式进行中不恢复（repickDivider中途的
        //   splitMode=false是流程临时态）
        if (!splitMode && !dividerPickMode && hw.config && hw.config.splitOn && hw.config.splitDivider) {
            splitMode = true;
            const sBtn = document.getElementById('splitBtn');
            if (sBtn) sBtn.classList.add('active');
        }

        // 按"素材单元"分组
        const units = buildMaterialUnits(hw);
        if (units.length === 0) {
            container.innerHTML = '<div class="empty-state" style="height:100%"><div class="empty-icon">📝</div><div class="empty-text">No passage material yet</div></div>';
            return;
        }

        // 如果有选中的题目，尝试跳到对应unit
        if (state.activeQuestionId && hw.config && hw.config.anchors) {
            const anchor = hw.config.anchors[state.activeQuestionId];
            if (anchor) {
                const u = findUnitByPageIdx(units, anchor.pageIdx);
                if (u) currentUnitIndex = u.unitIndex;
            }
        }

        // 限制unit索引范围
        if (currentUnitIndex >= units.length) currentUnitIndex = 0;
        if (currentUnitIndex < 0) currentUnitIndex = units.length - 1;

        const unit = units[currentUnitIndex];
        const totalUnits = units.length;
        const unitNum = currentUnitIndex + 1;

        // ===== 渲染顶部导航条（始终显示，含Prev/Next；标题在左侧passageTitle单独显示，此处不重复）=====
        if (navEl) {
            navEl.classList.add('show');
            const navBtnStyle = 'padding:4px 12px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-panel);cursor:pointer;font-size:13px;position:relative;z-index:10001;pointer-events:auto;';
            navEl.innerHTML = `
                <button onclick="AFR.prevPage()" style="${navBtnStyle}">◀ Prev</button>
                <span style="font-size:13px;color:var(--text-secondary);position:relative;z-index:10001">Page ${unitNum} / ${totalUnits}</span>
                <button onclick="AFR.nextPage()" style="${navBtnStyle}">Next ▶</button>
                <button onclick="AFR.deleteCurrentUnit()" style="${navBtnStyle}" title="Delete this material">✕ Delete</button>
            `;
        }

        // ===== 标题（可点击编辑，回车或失焦保存）=====
        titleEl.contentEditable = true;
        titleEl.textContent = unit.title;
        titleEl.title = '点击编辑名称，回车或点击空白保存';
        titleEl.style.cursor = 'text';
        titleEl.style.outline = 'none';
        titleEl.style.padding = '2px 6px';
        titleEl.style.borderRadius = '4px';
        titleEl.onblur = function() {
            const newTitle = this.textContent.trim();
            if (newTitle && newTitle !== unit.title) {
                // 写customTitle到首passage（buildMaterialUnits据此显示标题）
                unit.passages[0].customTitle = newTitle;
                unit.title = newTitle;
                saveHomework(hw.id);
                notify('Name updated', 'success');
            }
        };
        titleEl.onkeydown = function(e) {
            if (e.key === 'Enter') { e.preventDefault(); this.blur(); }
        };

        // ===== 按unit类型分发渲染 =====
        let html = '';
        if (unit.type === 'image') {
            const divider = hw.config && hw.config.splitDivider;
            if (splitMode && divider && divider.pageIdx >= unit.startIndex && divider.pageIdx <= unit.endIndex) {
                // ===== 左文右题分栏 v2：分隔线以上→左栏(原文)，以下→右栏(题目) =====
                const unitStart = unit.startIndex;
                const divLocal = divider.pageIdx - unitStart;   // 分隔线页在unit内的下标
                const divPage = unit.passages[divLocal];
                const cropPageId = 'splitDivPage';   // 分隔线页裁切容器（两栏共用同一原图）

                // 左栏：分隔线前的整页 + 分隔线页的线上部分
                html += '<div class="split-wrap"><div class="split-left"><div class="passage-scroll-inner">';
                unit.passages.forEach((p, i) => {
                    const globalIdx = unit.startIndex + i;
                    if (i < divLocal) {
                        html += `<div class="pdf-page-wrap"><img class="pdf-page" data-page="${globalIdx}" src="${p.imageUrl}" alt="${p.title || '原文图片'}"></div>`;
                    }
                });
                // 分隔线页线上部分：裁切容器（高度=线上比例，由layoutStrips算）
                html += `<div class="pdf-page-wrap"><div class="split-crop-top" id="${cropPageId}-top" data-full="1"><img class="pdf-page" data-page="${divider.pageIdx}" src="${divPage.imageUrl}" alt="article"></div></div>`;
                html += '</div></div>';

                // 中间可拖动分隔线
                html += '<div class="split-divider" id="splitDivider" title="Drag to resize"></div>';

                // 右栏：分隔线页的线下部分 + 之后的整页（内容包一层split-right-inner，供缩放整体调宽）
                html += '<div class="split-right" id="stripPanel">';
                html += `<div class="strip-panel-head"><span>Questions</span><span style="font-weight:400;font-size:11px">below the line</span></div>`;
                html += '<div class="split-right-inner">';
                html += `<div class="split-crop-bottom" id="${cropPageId}-bottom" data-full="1"><img src="${divPage.imageUrl}" alt="questions"></div>`;
                for (let i = divLocal + 1; i < unit.passages.length; i++) {
                    const p = unit.passages[i];
                    const globalIdx = unit.startIndex + i;
                    html += `<img class="pdf-page" data-page="${globalIdx}" src="${p.imageUrl}" alt="${p.title || '题目图片'}">`;
                }
                html += '</div></div></div>';
            } else {
                // 常规渲染：PDF整体，该unit内所有页首尾相连，data-page存全局索引（保证锚点一致）
                html += '<div class="passage-scroll-inner">';
                unit.passages.forEach((p, i) => {
                    const globalIdx = unit.startIndex + i; // 全局passages索引
                    html += `<img class="pdf-page" data-page="${globalIdx}" src="${p.imageUrl}" alt="${p.title || '原文图片'}">`;
                });
                html += '</div>';
            }
        } else if (unit.type === 'webpage') {
            const p = unit.passages[0];
            const frameUrl = p.url || '';
            const safeUrl = escapeAttr(frameUrl);
            // iframe + 醒目占位卡片（加载失败时显示）+ 常驻角落浮动按钮（拒绝嵌入时浏览器显示错误页也能点）
            html += `<div id="webpageWrap" style="position:relative">
                <iframe id="webpageFrame" src="${safeUrl}" referrerpolicy="no-referrer" style="width:100%;height:80vh;border:none;border-radius:4px;background:var(--bg-panel);display:block;"></iframe>
                <a href="${safeUrl}" target="_blank" title="Open in new tab" style="position:absolute;top:8px;right:8px;padding:6px 12px;background:var(--color-primary);color:var(--text-on-primary);border-radius:5px;text-decoration:none;font-size:12px;font-weight:600;box-shadow:var(--shadow-elevated);z-index:5;opacity:0.85" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.85">↗ New tab</a>
                <div id="webpageFallback" style="display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;height:80vh;background:var(--bg-panel);border:1px dashed var(--border-color);border-radius:4px;padding:30px;text-align:center">
                    <div style="font-size:48px">🔒</div>
                    <div style="font-size:18px;font-weight:600;color:var(--text-primary)">This site blocks embedding</div>
                    <div style="font-size:13px;color:var(--text-secondary);max-width:420px;line-height:1.5">For security, <b>${safeUrl}</b> does not allow being shown inside another page. Open it directly in a new tab.</div>
                    <div style="display:flex;gap:10px;margin-top:4px">
                        <a href="${safeUrl}" target="_blank" style="padding:9px 22px;background:var(--color-primary);color:var(--text-on-primary);border-radius:5px;text-decoration:none;font-size:14px;font-weight:600">↗ Open in new tab</a>
                        <button onclick="AFR.retryWebpage()" style="padding:9px 18px;border:1px solid var(--border-color);border-radius:5px;background:var(--bg-panel);color:var(--text-primary);font-size:14px;cursor:pointer">↻ Retry</button>
                    </div>
                </div>
            </div>`;
        } else {
            // text 类型
            const p = unit.passages[0];
            html += `<div class="passage-text">${p.content || ''}</div>`;
        }

        container.innerHTML = html;

        // 网页类型：iframe高度撑满容器可视区域 + 加载失败检测
        if (unit.type === 'webpage') {
            const frame = document.getElementById('webpageFrame');
            const fallback = document.getElementById('webpageFallback');
            if (frame) {
                frame.style.height = container.clientHeight + 'px';
                if (fallback) fallback.style.height = container.clientHeight + 'px';
                // 加载成功 = load事件触发 → 隐藏占位卡片，显示iframe
                // 加载失败/拒绝嵌入 = 6秒内load未触发 → 显示占位卡片，隐藏iframe
                let loaded = false;
                frame.onload = () => {
                    loaded = true;
                    // 能触发load说明网站允许嵌入
                    if (fallback) fallback.style.display = 'none';
                    frame.style.display = 'block';
                };
                setTimeout(() => {
                    if (!loaded) {
                        // 超时未加载 → 判定拒绝嵌入，显示占位卡片
                        frame.style.display = 'none';
                        if (fallback) fallback.style.display = 'flex';
                    }
                }, 6000);
            }
        }

        // 应用缩放：有锁定值就用锁定值，否则保持当前/100%
        if (defaultZoom && defaultZoom !== 1.0) {
            passageZoom = defaultZoom;
        }
        applyZoom();
        updateLockBtn();

        // 恢复该unit记忆的滚动位置
        if (unitScrollMap[currentUnitIndex] !== undefined) {
            container.scrollTop = unitScrollMap[currentUnitIndex];
        }

        // 等渲染后同步Canvas尺寸
        setTimeout(() => resizeCanvas(), 50);

        // 分栏模式：等左栏图片解码后计算右栏裁切高度
        if (splitMode) {
            // DOM重建会丢inline宽度——重设当前缩放
            const li = document.querySelector('.split-left .passage-scroll-inner');
            const ri = document.querySelector('.split-right-inner');
            if (li) li.style.width = (passageZoom * 100) + '%';
            if (ri) ri.style.width = (passageZoom * 100) + '%';
            const leftImgs = document.querySelectorAll('.split-left .pdf-page');
            leftImgs.forEach(img => { img.onload = () => layoutStrips(); });
            setTimeout(() => layoutStrips(), 120);   // 兜底（缓存图不再触发onload）
            setTimeout(() => layoutStrips(), 400);   // 二次兜底（慢解码）
            setupSplitDivider();
        }
    }

    // 双击导航条标题进入编辑：改当前unit的customTitle（存首passage），回车/失焦保存
    function editUnitTitle(spanEl) {
        const hw = getCurrentHomework();
        if (!hw || !hw.passages) return;
        const units = buildMaterialUnits(hw);
        const unit = units[currentUnitIndex];
        if (!unit) return;
        const firstPassage = unit.passages[0];
        if (!firstPassage) return;

        spanEl.contentEditable = true;
        spanEl.focus();
        // 选中全部文字
        const range = document.createRange();
        range.selectNodeContents(spanEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        const finish = () => {
            spanEl.contentEditable = false;
            const newName = spanEl.textContent.trim();
            window.getSelection().removeAllRanges();
            if (newName) {
                firstPassage.customTitle = newName;
                saveHomework(hw.id);
            }
            // 重渲导航条（更新标题，恢复显示态）
            renderPassage();
        };
        spanEl.onblur = finish;
        spanEl.onkeydown = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); spanEl.blur(); }
            if (e.key === 'Escape') { e.preventDefault(); spanEl.textContent = unit.title; spanEl.blur(); }
        };
    }

    // 重试加载网页：重新渲染当前unit（重新触发iframe加载）
    function retryWebpage() {
        renderPassage();
    }

    function nextPage() {
        const hw = getCurrentHomework();
        if (!hw || !hw.passages) return;
        const units = buildMaterialUnits(hw);
        if (units.length === 0) return;
        if (units.length <= 1) return;  // 单文档：Prev/Next点击无效，不跳转不重渲染
        // 保存当前滚动位置
        const container = document.getElementById('passageContent');
        if (container) unitScrollMap[currentUnitIndex] = container.scrollTop;
        currentUnitIndex++;
        if (currentUnitIndex >= units.length) currentUnitIndex = 0;
        renderPassage();
    }


    function prevPage() {
        const hw = getCurrentHomework();
        if (!hw || !hw.passages) return;
        const units = buildMaterialUnits(hw);
        if (units.length === 0) return;
        if (units.length <= 1) return;  // 单文档：Prev/Next点击无效
        // 保存当前滚动位置
        const container = document.getElementById('passageContent');
        if (container) unitScrollMap[currentUnitIndex] = container.scrollTop;
        currentUnitIndex--;
        if (currentUnitIndex < 0) currentUnitIndex = units.length - 1;
        renderPassage();
    }

    /**
     * 删除当前素材单元（整个PDF/单个文本/单个网页）
     * 并清理指向被删区间的锚点
     */
    function deleteCurrentUnit() {
        const hw = getCurrentHomework();
        if (!hw || !hw.passages || hw.passages.length === 0) return;
        const units = buildMaterialUnits(hw);
        if (units.length === 0 || currentUnitIndex >= units.length) return;
        const unit = units[currentUnitIndex];
        const count = unit.passages.length;
        if (!confirm(`Delete this material "${unit.title}"?${unit.type === 'image' ? ' (' + count + ' PDF pages)' : ''}`)) return;

        // 从passages中删除该unit覆盖的区间
        hw.passages.splice(unit.startIndex, count);

        // 清理锚点：指向被删区间的删除，区间之后的pageIdx前移count
        if (hw.config && hw.config.anchors) {
            const newAnchors = {};
            Object.keys(hw.config.anchors).forEach(qNum => {
                const a = hw.config.anchors[qNum];
                if (a.pageIdx < unit.startIndex) {
                    newAnchors[qNum] = a;  // 在区间前，不变
                } else if (a.pageIdx > unit.endIndex) {
                    newAnchors[qNum] = { pageIdx: a.pageIdx - count, yRatio: a.yRatio };  // 区间后，前移
                }
                // 落在区间内的，丢弃
            });
            hw.config.anchors = newAnchors;
        }

        // 清理该unit的滚动记忆
        delete unitScrollMap[currentUnitIndex];

        // 校正unit索引
        const newUnits = buildMaterialUnits(hw);
        currentUnitIndex = Math.min(currentUnitIndex, Math.max(0, newUnits.length - 1));

        saveHomework(hw.id);
        renderPassage();
        notify('Material deleted', 'success');
    }


    function deleteAllPassages() {
        const hw = getCurrentHomework();
        if (!hw || !hw.passages || hw.passages.length === 0) return;
        if (!confirm(`Delete ALL passages (${hw.passages.length} items)? This cannot be undone.`)) return;
        hw.passages = [];
        // 同步清除题号锚点（避免指向已删除的页面）
        if (hw.config) hw.config.anchors = {};
        currentPassagePage = 0;
        currentUnitIndex = 0;
        unitScrollMap = {};
        saveHomework(hw.id);
        renderPassage();
        notify('All passages deleted', 'success');
    }

    // ===== Fabric.js Canvas 初始化 =====
    function initFabricCanvas() {
        const canvasEl = document.getElementById('drawingCanvas');
        if (!canvasEl || typeof fabric === 'undefined') return;

        fabricCanvas = new fabric.Canvas('drawingCanvas', {
            isDrawingMode: false,
            selection: true,
            backgroundColor: 'transparent',
        });

        fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
        fabricCanvas.freeDrawingBrush.color = state.drawingColor;
        fabricCanvas.freeDrawingBrush.width = state.brushSize;

        // Fabric.js 初始化后，设置 wrapper 和内部 canvas 默认不可交互（选择模式）
        if (fabricCanvas.wrapperEl) {
            fabricCanvas.wrapperEl.style.pointerEvents = 'none';
            const upper = fabricCanvas.wrapperEl.querySelector('.upper-canvas');
            const lower = fabricCanvas.wrapperEl.querySelector('.lower-canvas');
            if (upper) upper.style.pointerEvents = 'none';
            if (lower) lower.style.pointerEvents = 'none';
        }

        resizeCanvas();
        window.addEventListener('resize', () => { resizeCanvas(); positionKnowledgeDrawerBtns(); });
    }

    function resizeCanvas() {
        if (!fabricCanvas) return;
        const container = document.getElementById('passageContent');
        if (!container) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w > 0 && h > 0) {
            fabricCanvas.setDimensions({ width: w, height: h });
            fabricCanvas.renderAll();
            // 同步 Fabric wrapper 定位到 passageContent 区域
            const wrapperEl = fabricCanvas.wrapperEl;
            if (wrapperEl) {
                const panel = container.closest('.passage-panel');
                if (panel) {
                    const headerEl = panel.querySelector('.passage-header');
                    const headerH = headerEl ? headerEl.offsetHeight : 0;
                    wrapperEl.style.position = 'absolute';
                    wrapperEl.style.top = headerH + 'px';
                    wrapperEl.style.left = '0';
                    wrapperEl.style.zIndex = '5';
                }
            }
        }
    }

    // ===== 圈画工具 =====
    function setDrawTool(tool) {
        state.drawingTool = tool;

        // 更新工具栏高亮
        document.querySelectorAll('.draw-tool-btn[data-tool]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });

        if (!fabricCanvas) return;

        const isDrawing = (tool !== 'select');
        const wrapperEl = fabricCanvas.wrapperEl;
        const lowerCanvas = wrapperEl ? wrapperEl.querySelector('.lower-canvas') : null;
        const upperCanvas = wrapperEl ? wrapperEl.querySelector('.upper-canvas') : null;

        // 控制 Fabric.js wrapper 及内部 canvas 的 pointer-events
        if (wrapperEl) {
            wrapperEl.style.pointerEvents = isDrawing ? 'auto' : 'none';
            wrapperEl.style.cursor = (tool === 'select') ? 'default' : 'crosshair';
        }
        if (upperCanvas) {
            upperCanvas.style.pointerEvents = isDrawing ? 'auto' : 'none';
            upperCanvas.style.cursor = (tool === 'select') ? 'default' : 'crosshair';
        }
        if (lowerCanvas) {
            lowerCanvas.style.pointerEvents = isDrawing ? 'auto' : 'none';
        }

        switch (tool) {
            case 'select':
                fabricCanvas.isDrawingMode = false;
                break;
            case 'pen':
                fabricCanvas.isDrawingMode = true;
                fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
                fabricCanvas.freeDrawingBrush.color = state.drawingColor;
                fabricCanvas.freeDrawingBrush.width = state.brushSize;
                break;
            case 'highlight':
                fabricCanvas.isDrawingMode = true;
                fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
                // 半透明高亮效果
                const r = parseInt(state.drawingColor.slice(1, 3), 16);
                const g = parseInt(state.drawingColor.slice(3, 5), 16);
                const b = parseInt(state.drawingColor.slice(5, 7), 16);
                fabricCanvas.freeDrawingBrush.color = `rgba(${r},${g},${b},0.35)`;
                fabricCanvas.freeDrawingBrush.width = Math.max(state.brushSize * 4, 16);
                break;
            case 'eraser':
                fabricCanvas.isDrawingMode = false;
                // 点击删除模式
                fabricCanvas.selection = false;
                fabricCanvas.on('mouse:down', eraseObject);
                break;
        }

        if (tool !== 'eraser') {
            fabricCanvas.off('mouse:down', eraseObject);
            fabricCanvas.selection = true;
        }
    }

    function eraseObject(opt) {
        if (state.drawingTool !== 'eraser' || !fabricCanvas) return;
        const target = fabricCanvas.findTarget(opt.e);
        if (target) {
            fabricCanvas.remove(target);
            fabricCanvas.renderAll();
        }
    }

    function setDrawColor(color) {
        state.drawingColor = color;
        document.getElementById('colorPickerWrapper').style.borderColor = color;
        if (fabricCanvas && fabricCanvas.freeDrawingBrush) {
            if (state.drawingTool === 'highlight') {
                const r = parseInt(color.slice(1, 3), 16);
                const g = parseInt(color.slice(3, 5), 16);
                const b = parseInt(color.slice(5, 7), 16);
                fabricCanvas.freeDrawingBrush.color = `rgba(${r},${g},${b},0.35)`;
            } else {
                fabricCanvas.freeDrawingBrush.color = color;
            }
        }
    }

    function setBrushSize(size) {
        state.brushSize = parseInt(size);
        if (fabricCanvas && fabricCanvas.freeDrawingBrush) {
            fabricCanvas.freeDrawingBrush.width = state.drawingTool === 'highlight'
                ? Math.max(state.brushSize * 4, 16)
                : state.brushSize;
        }
    }

    function clearCanvas() {
        if (fabricCanvas) {
            fabricCanvas.clear();
            fabricCanvas.setBackgroundColor('transparent', () => fabricCanvas.renderAll());
        }
    }

    // ===== 知识技能（富文本 + 图片 + 语音） =====
    let voiceRecognition = null;
    let isRecording = false;

    // 把旧格式（knowledge[class]是字符串）迁移为新三模式对象
    function ensureKnowledgeModeObj(hw, cls) {
        if (!hw.knowledge) hw.knowledge = {};
        const k = hw.knowledge[cls];
        if (typeof k === 'string') {
            // 旧数据 → 迁到 free
            hw.knowledge[cls] = { free: k, byType: '', byGrammar: '' };
        } else if (!k || typeof k !== 'object') {
            hw.knowledge[cls] = { free: '', byType: '', byGrammar: '' };
        } else {
            if (k.free === undefined) k.free = '';
            if (k.byType === undefined) k.byType = '';
            if (k.byGrammar === undefined) k.byGrammar = '';
        }
        return hw.knowledge[cls];
    }

    function renderKnowledge() {
        const editor = document.getElementById('knowledgeEditor');
        if (!editor) return;
        applyKnowledgeFontSize();   // 应用存过的字体大小
        applyMargin();               // 应用存过的页边距
        applyLineSpacing();          // 应用存过的行距
        renderExtEditors();          // 加载Skills/Points全局共享库
        setTimeout(positionKnowledgeDrawerBtns, 50);  // 定位抽屉按钮（等布局完成后）
        const hw = getCurrentHomework();
        let content = '';
        if (hw) {
            const modeObj = ensureKnowledgeModeObj(hw, state.currentClass);
            content = modeObj[state.knowledgeMode] || '';
            // 空内容且有模板 → 自动生成
            if (!content.trim()) {
                if (state.knowledgeMode === 'byType') content = getByTypeTemplate();
                else if (state.knowledgeMode === 'byGrammar') content = getByGrammarTemplate();
            }
        }
        editor.innerHTML = content;

        // 恢复页面标题
        const titleEl = document.getElementById('pageTitleArea');
        if (titleEl && hw) {
            const meta = hw.knowledgeMeta && hw.knowledgeMeta[state.currentClass];
            titleEl.textContent = (meta && meta.title) ? meta.title : '';
        }

        // 恢复页面背景（颜色或图片）
        const storedPageBg = hw && hw.knowledgeMeta && hw.knowledgeMeta[state.currentClass] && hw.knowledgeMeta[state.currentClass].pageBg;
        applyPageBg(storedPageBg);
        // 同步透明度滑块
        const opacitySlider = document.getElementById('knPageOpacitySlider');
        const opacityVal = document.getElementById('knPageOpacityVal');
        const op = (storedPageBg && storedPageBg.opacity != null) ? Math.round(storedPageBg.opacity * 100) : 100;
        if (opacitySlider) opacitySlider.value = op;
        if (opacityVal) opacityVal.textContent = op + '%';

        // 模式按钮高亮
        document.querySelectorAll('.mode-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.mode === state.knowledgeMode));

        // 绑定已有评论的点击（刷新/切换作业后恢复交互）
        bindComments();
        // 给所有已存在分栏绑定竖线拖动
        document.querySelectorAll('.kn-columns').forEach(c => bindColumnDividers(c));

        // Language Kit 按钮仅 byGrammar 模式显示
        const kitBtn = document.getElementById('langKitBtn');
        if (kitBtn) kitBtn.style.display = (state.knowledgeMode === 'byGrammar') ? 'flex' : 'none';

        renderOutline();
        renderPastNotes();
    }

    // ===== 往期笔记（跨作业链接）=====
    let viewingPastHwId = null;  // 当前预览的作业id（供insert用）

    function renderPastNotes() {
        const list = document.getElementById('pastNotesList');
        if (!list) return;
        const curId = state.currentHomework;
        // 收集其他作业，按日期倒序
        const others = homeworkOrder
            .filter(id => id !== curId)
            .map(id => homeworks[id])
            .filter(hw => hw)
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        if (others.length === 0) {
            list.innerHTML = '<div class="outline-empty">No other assignments</div>';
            return;
        }
        let html = '';
        others.forEach(hw => {
            // 检查该作业当前班级是否有笔记内容
            const k = hw.knowledge && hw.knowledge[state.currentClass];
            let hasContent = false;
            if (typeof k === 'string') hasContent = !!k.trim();
            else if (k) hasContent = !!(k.free || k.byType || k.byGrammar || '').trim();
            const fade = hasContent ? '' : 'opacity:0.5';
            const dot = hasContent ? '🟢' : '⚪';
            html += `<div class="past-note-item" style="${fade}">
                <span class="pn-name" title="${escapeHtml(hw.name||'')} (${hw.date||''})">${dot} ${escapeHtml(hw.name||'Untitled')}</span>
                <div class="pn-actions">
                    <button class="pn-btn" onclick="AFR.viewPastNote('${hw.id}')" title="Preview">👁</button>
                    <button class="pn-btn" onclick="AFR.insertPastNote('${hw.id}')" title="Insert to current">⬇</button>
                </div>
            </div>`;
        });
        list.innerHTML = html;
    }

    // 取某作业当前班级+当前模式的笔记内容（用于预览/插入）
    function getPastNoteContent(hwId) {
        const hw = homeworks[hwId];
        if (!hw || !hw.knowledge) return '';
        const k = hw.knowledge[state.currentClass];
        if (typeof k === 'string') return k;
        if (k && typeof k === 'object') {
            // 优先当前模式，否则取任一非空
            if (k[state.knowledgeMode] && k[state.knowledgeMode].trim()) return k[state.knowledgeMode];
            return k.free || k.byType || k.byGrammar || '';
        }
        return '';
    }

    function viewPastNote(hwId) {
        const hw = homeworks[hwId];
        if (!hw) return;
        const content = getPastNoteContent(hwId);
        viewingPastHwId = hwId;
        document.getElementById('pastNoteModalTitle').textContent = `📖 ${hw.name || 'Untitled'}  (${hw.date || ''})`;
        document.getElementById('pastNoteModalBody').innerHTML = content || '<div class="outline-empty">Empty note</div>';
        document.getElementById('pastNoteModal').classList.add('show');
    }

    function closePastNoteModal(e) {
        if (e && e.target !== e.currentTarget) return;
        document.getElementById('pastNoteModal').classList.remove('show');
        viewingPastHwId = null;
    }

    function insertPastNote(hwId) {
        const content = getPastNoteContent(hwId);
        if (!content.trim()) { notify('That note is empty', 'info'); return; }
        const editor = document.getElementById('knowledgeEditor');
        editor.focus();
        placeCaretAtEnd(editor);
        const hw = homeworks[hwId];
        const block = `<hr><p style="color:var(--text-tertiary);font-size:12px">📎 From <b>${escapeHtml(hw.name||'')}</b> (${hw.date||''})</p>${content}<p><br></p>`;
        document.execCommand('insertHTML', false, block);
        saveKnowledge(true);
        scheduleOutlineUpdate();
        notify('Past note inserted', 'success');
    }

    function insertPastNoteFromModal() {
        if (viewingPastHwId) insertPastNote(viewingPastHwId);
        closePastNoteModal();
    }

    function switchKnowledgeMode(mode) {
        if (state.knowledgeMode === mode) return;
        // 先保存当前模式内容
        saveKnowledge(true);
        state.knowledgeMode = mode;
        renderKnowledge();
    }

    // 切换"同步到另一班"菜单
    function toggleKnSyncMenu(e) {
        if (e) e.stopPropagation();
        const menu = document.getElementById('knSyncMenu');
        if (!menu) return;
        menu.classList.toggle('show');
    }

    // 同步当前班笔记到另一班：overwrite=覆盖, append=追加
    function syncKnowledge(mode) {
        const menu = document.getElementById('knSyncMenu');
        if (menu) menu.classList.remove('show');
        const hw = getCurrentHomework();
        if (!hw) { notify('No assignment', 'error'); return; }
        saveKnowledge(true);  // 先存当前编辑内容
        const fromCls = state.currentClass;
        const toCls = fromCls === 'class9' ? 'class11' : 'class9';
        const fromName = fromCls === 'class9' ? '高三09班' : '高三11班';
        const toName = toCls === 'class9' ? '高三09班' : '高三11班';
        const fromObj = ensureKnowledgeModeObj(hw, fromCls);
        const toObj = ensureKnowledgeModeObj(hw, toCls);
        const curMode = state.knowledgeMode;
        const src = fromObj[curMode] || '';
        if (!src || !src.trim()) {
            notify('当前班(' + fromName + ')的笔记为空，无法同步', 'error');
            return;
        }
        if (mode === 'overwrite') {
            if (!confirm('用 ' + fromName + ' 的笔记覆盖 ' + toName + '？\n' + toName + ' 现有内容会被替换（丢失）。')) return;
            toObj[curMode] = src;
        } else {
            // append：追加到另一班末尾
            const dst = toObj[curMode] || '';
            toObj[curMode] = dst ? (dst + '<p><br></p><p style="color:var(--text-tertiary);font-size:12px">— 同步自 ' + fromName + ' —</p>' + src) : src;
        }
        saveHomework(hw.id);
        notify('已同步 ' + fromName + ' → ' + toName + '（' + (mode === 'overwrite' ? '覆盖' : '追加') + '）', 'success');
    }


    // 题型模板：7个可折叠 details
    function getByTypeTemplate() {
        const types = ['Listening Comprehension', 'Reading Comprehension', '5 of 7', 'Cloze', 'Gap Filling', 'Application Writing', 'Continuation Writing'];
        return types.map(t =>
            `<details><summary>${t}</summary><p><br></p></details>`
        ).join('');
    }

    // 语法模板：4个可折叠 details
    function getByGrammarTemplate() {
        const items = ['Morphology', 'Syntax', 'Semantics', 'Pragmatics'];
        return items.map(t =>
            `<details><summary>${t}</summary><p><br></p></details>`
        ).join('');
    }

    // ===== 左侧大纲导航（提取标题，点击定位，实时更新+高亮当前）=====
    let outlineUpdateTimer = null;
    function scheduleOutlineUpdate() {
        clearTimeout(outlineUpdateTimer);
        outlineUpdateTimer = setTimeout(renderOutline, 300);
    }

    // 自动保存：防抖1秒后静默保存(避免每打一个字就存)，存完显示"已保存"提示
    let autoSaveTimer = null;
    function scheduleAutoSave() {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => {
            saveKnowledge(true);   // 静默保存(无提示)
            showAutoSaveIndicator();
        }, 1000);
    }
    // 显示"已自动保存"小提示(右下角，2秒后消失)
    function showAutoSaveIndicator() {
        let ind = document.getElementById('autoSaveIndicator');
        if (!ind) {
            ind = document.createElement('div');
            ind.id = 'autoSaveIndicator';
            ind.style.cssText = 'position:fixed;bottom:16px;right:16px;background:var(--color-success);color:#fff;padding:6px 14px;border-radius:20px;font-size:12px;z-index:9999;box-shadow:var(--shadow-pop);opacity:0;transition:opacity 0.3s;pointer-events:none';
            ind.textContent = '✓ Saved';
            document.body.appendChild(ind);
        }
        ind.style.opacity = '1';
        clearTimeout(ind._t);
        ind._t = setTimeout(() => { ind.style.opacity = '0'; }, 1500);
    }

    // ===== Emoji选择浮窗（分类标签）=====
    const EMOJI_CATEGORIES = [
        { icon: '😀', name: 'Faces', emojis: '😀 😄 😁 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😋 😜 🤪 😝 🤗 🤭 🤔 🤨 😐 😶 😏 😒 🙄 😬 😔 😟 🤔 🤓 😎 🥳 😴 🤤 😪 😷 🤒 🤕 🤢 🤮 😵 🥵 🥶 😨 😰 😱 😡 😠 🤬 😈 👿 💀 💩'.split(' ') },
        { icon: '👍', name: 'Gestures', emojis: '👍 👎 👊 ✊ 🤛 🤜 👏 🙌 👐 🤲 🙏 🤝 💪 👌 ✌ 🤞 🤟 🤘 👈 👉 👆 👇 ☝ ✋ 🤚 🖐 🖖 👋 🤙 💪 🦾 🦿 🦵 🦶 👂 👃 🧠 🦷 🦴 👀 👁 👅 👄 💋 🦷'.split(' ') },
        { icon: '❤️', name: 'Symbols', emojis: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮ ✨ ⭐ 🌟 💫 ⚡ 🔥 💧 🌈 ☀ ☁ ⛄ ⛄ 🎈 🎉 🎊 🎁 🏆 🥇 🥈 🥉 🏅 🎖 🎗 🎫 ✅ ❌ ❗ ❓ 💯 🔑 🔒 🔓 🔖 🔗'.split(' ') },
        { icon: '📚', name: 'School', emojis: '📚 📖 📒 📓 📔 📕 📗 📘 📙 📚 📝 ✏ ✒ 📌 🖊 🖊️ 🖋 🖍 📐 📏 ✂ 📎 🖇 📁 📂 🗂 📅 📆 📇 🗒 📊 📈 📉 💡 🔬 🔭 🧪 ⚗ 🧮 🎓 🏫 📋 🗃 🗄 🖥 💻 🖨 ⌨ 🖱'.split(' ') },
        { icon: '⚽', name: 'Activity', emojis: '⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🏓 🏸 🥅 🏒 🏑 🥍 🏏 ⛳ 🎯 🎗 🎮 🕹 🎲 🧩 🎸 🎹 🎺 🎻 🥁 🎤 🎧 🎵 🎶 🎚 🎛 🎤 🎬 🍿 🎭 🎨 🖌 🖍 📷 📸 🎥'.split(' ') },
        { icon: '🍔', name: 'Food', emojis: '🍔 🍟 🍕 🌭 🥪 🌮 🍜 🍝 🍣 🍱 🍙 🍚 🍘 🥟 🍤 🍳 🥘 🍲 🥗 🍞 🥐 🧀 🥓 🍗 🍖 🥩 🍰 🎂 🍫 🍬 🍭 🍩 🍪 🥧 🍦 🍧 🍵 ☕ 🍵 🍷 🍺 🥂 🍻 🥤 🧃'.split(' ') },
        { icon: '🌍', name: 'Travel', emojis: '🌍 🌎 🌏 🌐 🗺 🧭 🏔 ⛰ 🌋 🗾 🏕 🏖 🏝 🏜 🌅 🌄 🌃 🌆 🌇 🌉 🏙 🏰 🏯 🏟 🎡 🎢 🎠 ⛲ ⛱ 🚗 🚕 🚙 🚌 🏎 🚓 ✈ 🚀 🛸 ⛴ ⚓ 🚲 🛵 🏍 🚂'.split(' ') },
    ];
    let emojiActiveCat = 0;

    // 打开Emoji面板前保存选区(点面板项时editor失焦，光标会丢)
    let savedEmojiSelection = null;
    function toggleEmojiPicker() {
        const panel = document.getElementById('emojiPanel');
        if (!panel) return;
        const isOpen = panel.classList.contains('show');
        if (isOpen) { panel.classList.remove('show'); return; }
        // 保存当前选区
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) savedEmojiSelection = sel.getRangeAt(0).cloneRange();
        // 定位到按钮正下方
        const btn = document.getElementById('emojiPickerBtn');
        if (btn) {
            const r = btn.getBoundingClientRect();
            panel.style.top = (r.bottom + 4) + 'px';
            panel.style.left = r.left + 'px';
            panel.style.right = 'auto';
        }
        renderEmojiTabs();
        renderEmojiGrid(emojiActiveCat);
        panel.classList.add('show');
    }

    function renderEmojiTabs() {
        const tabs = document.getElementById('emojiTabs');
        if (!tabs) return;
        tabs.innerHTML = EMOJI_CATEGORIES.map((cat, i) =>
            `<button class="emoji-tab ${i === emojiActiveCat ? 'active' : ''}" onclick="AFR.selectEmojiCategory(${i})" title="${cat.name}">${cat.icon}</button>`
        ).join('');
    }

    function selectEmojiCategory(i) {
        emojiActiveCat = i;
        renderEmojiTabs();
        renderEmojiGrid(i);
    }

    function renderEmojiGrid(catIdx) {
        const grid = document.getElementById('emojiGrid');
        if (!grid) return;
        const emojis = EMOJI_CATEGORIES[catIdx].emojis;
        grid.innerHTML = emojis.map((em, i) =>
            `<span class="emoji-item" onmousedown="event.preventDefault();AFR.insertEmoji('${catIdx}','${i}')" title="${em}">${em}</span>`
        ).join('');
    }

    function insertEmoji(catIdx, itemIdx) {
        const editor = document.getElementById('knowledgeEditor');
        if (!editor) return;
        editor.focus();   // mousedown已preventDefault，editor焦点+光标仍在原位
        const em = EMOJI_CATEGORIES[catIdx].emojis[itemIdx];
        document.execCommand('insertText', false, em);
        scheduleAutoSave();
    }

    // 设置字体颜色：有选中→改选中文字颜色；无选中→后续输入用此色。空值清除
    function setKnTextColor(color) {
        const editor = document.getElementById('knowledgeEditor');
        if (!editor) return;
        editor.focus();
        if (color) {
            document.execCommand('foreColor', false, color);
        } else {
            document.execCommand('foreColor', false, 'inherit');
        }
        scheduleAutoSave();
    }

    // 设置背景高亮色：有选中→改选中文字背景；空值清除
    function setKnBgColor(color) {
        const editor = document.getElementById('knowledgeEditor');
        if (!editor) return;
        editor.focus();
        if (color) {
            document.execCommand('hiliteColor', false, color);
        } else {
            document.execCommand('hiliteColor', false, 'transparent');
        }
        scheduleAutoSave();
    }

    // 颜色菜单开关（定位到按钮下方）
    function toggleKnColorMenu() {
        const menu = document.getElementById('knColorMenu');
        if (!menu) return;
        const isOpen = menu.classList.contains('show');
        if (isOpen) { menu.classList.remove('show'); return; }
        const btn = document.getElementById('knColorBtn');
        const group = btn.parentElement;
        const r = group.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = (r.bottom + 4) + 'px';
        menu.style.left = r.left + 'px';
        menu.classList.add('show');
    }

    // ===== 字体风格选择（系统字体，离线可用）=====
    const FONT_STYLES = [
        { label: 'Default', name: '默认', family: 'inherit' },
        { label: 'Arial', name: '无衬线', family: 'Arial, sans-serif' },
        { label: 'Helvetica', name: '无衬线', family: 'Helvetica, Arial, sans-serif' },
        { label: 'Verdana', name: '无衬线', family: 'Verdana, sans-serif' },
        { label: 'Tahoma', name: '无衬线', family: 'Tahoma, sans-serif' },
        { label: 'Trebuchet MS', name: '无衬线', family: "'Trebuchet MS', sans-serif" },
        { label: 'Microsoft YaHei', name: '微软雅黑', family: "'Microsoft YaHei', sans-serif" },
        { label: 'Georgia', name: '优雅衬线', family: 'Georgia, serif' },
        { label: 'Times New Roman', name: '衬线', family: "'Times New Roman', serif" },
        { label: 'Garamond', name: '古典衬线', family: 'Garamond, serif' },
        { label: 'Palatino', name: '衬线', family: 'Palatino, serif' },
        { label: '宋体', name: '宋体', family: 'SimSun, serif' },
        { label: '楷体', name: '楷体', family: 'KaiTi, serif' },
        { label: '仿宋', name: '仿宋', family: 'FangSong, serif' },
        { label: '黑体', name: '黑体', family: 'SimHei, sans-serif' },
        { label: 'Courier', name: '打字机', family: "'Courier New', monospace" },
        { label: 'Consolas', name: '等宽', family: 'Consolas, monospace' },
        { label: 'Monaco', name: '等宽', family: 'Monaco, monospace' },
        { label: 'Comic Sans', name: '卡通', family: "'Comic Sans MS', cursive" },
        { label: 'Brush Script', name: '手写', family: "'Brush Script MT', cursive" },
        { label: 'Impact', name: '粗标题', family: 'Impact, sans-serif' },
        { label: 'Copperplate', name: '艺术', family: 'Copperplate, serif' },
        { label: 'Papyrus', name: '古朴', family: 'Papyrus, fantasy' },
        { label: 'Bradley Hand', name: '手写', family: "'Bradley Hand', cursive" },
    ];

    // 打开菜单前保存选区(点菜单项时editor失焦，选区会丢)
    let savedFontSelection = null;
    function toggleFontPicker() {
        const menu = document.getElementById('fontMenu');
        if (!menu) return;
        const isOpen = menu.classList.contains('show');
        if (isOpen) { menu.classList.remove('show'); return; }
        // 保存当前选区
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            savedFontSelection = sel.getRangeAt(0).cloneRange();
        }
        // 渲染菜单(每项用对应字体预览)
        menu.innerHTML = FONT_STYLES.map((f, i) =>
            `<div class="dropdown-item" style="font-family:${f.family}" onclick="AFR.applyFont(${i})"><span>${f.label}</span><span class="font-name">${f.name}</span></div>`
        ).join('');
        // 定位到按钮下方（用fixed相对视口，避免被dropdown-group的relative影响）
        const btn = document.getElementById('fontPickerBtn');
        if (btn) {
            const r = btn.getBoundingClientRect();
            menu.style.position = 'fixed';
            menu.style.top = (r.bottom + 4) + 'px';
            menu.style.left = r.left + 'px';
        }
        menu.classList.add('show');
    }

    // 应用字体：优先用打开菜单时保存的选区，否则当前块
    function applyFont(idx) {
        const menu = document.getElementById('fontMenu');
        if (menu) menu.classList.remove('show');
        const editor = document.getElementById('knowledgeEditor');
        if (!editor) return;
        editor.focus();
        const f = FONT_STYLES[idx];
        // 有保存的选区且非空 → 用span包裹选中文字
        if (savedFontSelection && !savedFontSelection.collapsed && editor.contains(savedFontSelection.commonAncestorContainer)) {
            const text = savedFontSelection.toString();
            savedFontSelection.deleteContents();
            const span = document.createElement('span');
            span.style.fontFamily = f.family;
            span.textContent = text;
            savedFontSelection.insertNode(span);
            savedFontSelection = null;
        } else {
            // 无选中：对当前所在块应用
            const sel = window.getSelection();
            let node = sel && sel.anchorNode ? sel.anchorNode : null;
            while (node && node !== editor) {
                if (['P','DIV','H1','H2','H3','H4','LI','BLOCKQUOTE'].includes(node.tagName)) {
                    node.style.fontFamily = f.family;
                    break;
                }
                node = node.parentElement;
            }
        }
        scheduleAutoSave();
    }

    // 页边距设置（Word风格4档，存localStorage）
    const MARGINS = {
        normal: { left: 0, right: 0, name: '普通' },        // 普通:无额外边距(编辑器默认)
        medium: { left: '8%', right: '8%', name: '适中' },   // 适中:两侧8%
        narrow: { left: '2%', right: '2%', name: '窄' },     // 窄:两侧2%
        wide: { left: '18%', right: '18%', name: '宽' },     // 宽:两侧18%
    };
    let curMargin = localStorage.getItem('afr-kn-margin') || 'normal';

    function toggleMarginMenu() {
        const menu = document.getElementById('marginMenu');
        if (!menu) return;
        const isOpen = menu.classList.contains('show');
        if (isOpen) { menu.classList.remove('show'); return; }
        // 定位到按钮下方
        const btn = document.getElementById('marginBtn');
        const group = btn.parentElement;
        const r = group.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = (r.bottom + 4) + 'px';
        menu.style.left = r.left + 'px';
        // 高亮当前
        menu.querySelectorAll('.dropdown-item').forEach((it, i) => {
            const key = ['normal','medium','narrow','wide'][i];
            it.style.fontWeight = key === curMargin ? '600' : '400';
            it.style.color = key === curMargin ? 'var(--color-primary)' : '';
        });
        menu.classList.add('show');
    }

    function setMargin(key) {
        const menu = document.getElementById('marginMenu');
        if (menu) menu.classList.remove('show');
        curMargin = key;
        localStorage.setItem('afr-kn-margin', key);
        applyMargin();
        notify('页边距: ' + MARGINS[key].name, 'success');
    }

    function applyMargin() {
        const editor = document.getElementById('knowledgeEditor');
        if (!editor) return;
        const m = MARGINS[curMargin] || MARGINS.normal;
        editor.style.paddingLeft = typeof m.left === 'number' ? m.left + 'px' : m.left;
        editor.style.paddingRight = typeof m.right === 'number' ? m.right + 'px' : m.right;
    }

    // 行距设置（0.5/1/1.5/2倍 + 自定义，存localStorage）
    let curLineSpacing = parseFloat(localStorage.getItem('afr-kn-linespacing')) || 1.8;
    function toggleLineSpacingMenu() {
        const menu = document.getElementById('lineSpacingMenu');
        if (!menu) return;
        const isOpen = menu.classList.contains('show');
        if (isOpen) { menu.classList.remove('show'); return; }
        const btn = document.getElementById('lineSpacingBtn');
        const group = btn.parentElement;
        const r = group.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = (r.bottom + 4) + 'px';
        menu.style.left = r.left + 'px';
        // 高亮当前
        menu.querySelectorAll('.dropdown-item').forEach(it => {
            const val = parseFloat(it.textContent.trim());
            it.style.fontWeight = val === curLineSpacing ? '600' : '400';
            it.style.color = val === curLineSpacing ? 'var(--color-primary)' : '';
        });
        menu.classList.add('show');
    }
    function setLineSpacing(val) {
        const menu = document.getElementById('lineSpacingMenu');
        if (menu) menu.classList.remove('show');
        curLineSpacing = Math.max(0.5, Math.min(5, val));
        localStorage.setItem('afr-kn-linespacing', String(curLineSpacing));
        applyLineSpacing();
        notify('Line spacing: ' + curLineSpacing + 'x', 'success');
    }
    function applyLineSpacing() {
        const editor = document.getElementById('knowledgeEditor');
        if (!editor) return;
        editor.style.lineHeight = curLineSpacing;
    }

    function renderOutline() {
        const editor = document.getElementById('knowledgeEditor');
        const list = document.getElementById('outlineList');
        if (!editor || !list) return;
        // 同时识别标题(h2/h3/h4)和可折叠小标题(summary)
        const items = editor.querySelectorAll('h2, h3, h4, details > summary');
        if (items.length === 0) {
            list.innerHTML = '<div class="outline-empty">Add headings or use By Type / By Grammar to build outline</div>';
            return;
        }
        // 给每个分配id
        items.forEach((h, i) => {
            if (!h.id) h.id = 'kh-' + Date.now() + '-' + i;
        });
        let html = '';
        items.forEach(h => {
            const tag = h.tagName;
            const lvl = (tag === 'H2' || tag === 'SUMMARY') ? 1 : (tag === 'H3' ? 2 : 3);
            const text = h.textContent.trim() || '(empty)';
            const icon = tag === 'SUMMARY' ? '📂 ' : '';
            html += `<div class="outline-item lvl-${lvl}" data-target="${h.id}" title="${escapeHtml(text)}" onclick="AFR.jumpToHeading('${h.id}')">${icon}${escapeHtml(text)}</div>`;
        });
        list.innerHTML = html;
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    }

    function jumpToHeading(id) {
        const editor = document.getElementById('knowledgeEditorWrapper');
        const target = document.getElementById(id);
        if (!target || !editor) return;
        // 若目标是 summary，展开其所属 details
        if (target.tagName === 'SUMMARY' && target.parentElement && target.parentElement.tagName === 'DETAILS') {
            target.parentElement.open = true;
        }
        // 高亮当前大纲项
        document.querySelectorAll('.outline-item').forEach(it => it.classList.remove('active'));
        const item = document.querySelector(`.outline-item[data-target="${id}"]`);
        if (item) item.classList.add('active');
        // 滚动编辑器容器到目标位置
        const editorRect = editor.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        editor.scrollTop += (targetRect.top - editorRect.top - 12);
        // 选中标题文字（轻微视觉反馈）
        const range = document.createRange();
        range.selectNodeContents(target);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        sel.collapseToStart();
        target.scrollIntoView({ block: 'nearest' });
    }

    // 滚动时高亮当前可见标题
    function setupOutlineScrollSpy() {
        const editor = document.getElementById('knowledgeEditorWrapper');
        if (!editor) return;
        let scrollTimer = null;
        editor.addEventListener('scroll', () => {
            clearTimeout(scrollTimer);
            scrollTimer = setTimeout(updateActiveOutline, 150);
        });
    }

    function updateActiveOutline() {
        const editor = document.getElementById('knowledgeEditorWrapper');
        const headings = document.querySelectorAll('#knowledgeEditor h2, #knowledgeEditor h3, #knowledgeEditor h4, #knowledgeEditor details > summary');
        if (!editor || headings.length === 0) return;
        // 找当前在编辑器顶部之上/最近的标题
        const editorTop = editor.getBoundingClientRect().top;
        let activeId = null;
        for (let i = 0; i < headings.length; i++) {
            const r = headings[i].getBoundingClientRect();
            if (r.top - editorTop <= 40) {
                activeId = headings[i].id;
            } else {
                break;
            }
        }
        if (!activeId && headings.length > 0) activeId = headings[0].id;
        document.querySelectorAll('.outline-item').forEach(it => {
            it.classList.toggle('active', it.dataset.target === activeId);
        });
        // 让激活项在大纲内可见
        if (activeId) {
            const activeItem = document.querySelector(`.outline-item[data-target="${activeId}"]`);
            if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
        }
    }


    function saveKnowledge(silent) {
        const editor = document.getElementById('knowledgeEditor');
        if (!editor) return;
        const hw = getCurrentHomework();
        if (!hw) {
            if (!silent) notify('Please select an assignment first', 'error');
            return;
        }
        const modeObj = ensureKnowledgeModeObj(hw, state.currentClass);
        modeObj[state.knowledgeMode] = editor.innerHTML;
        saveHomework(hw.id);
        if (!silent) notify('Notes saved', 'success');
    }

    // 撤回/重做（基于浏览器原生 contentEditable undo 栈）
    function undoKnowledge() {
        const editor = document.getElementById('knowledgeEditor');
        if (!editor) return;
        editor.focus();
        document.execCommand('undo', false, null);
        scheduleOutlineUpdate();
    }
    function redoKnowledge() {
        const editor = document.getElementById('knowledgeEditor');
        if (!editor) return;
        editor.focus();
        document.execCommand('redo', false, null);
        scheduleOutlineUpdate();
    }

    // knowledge编辑器字体大小调节（存localStorage跨作业保持，范围12-24px）
    let knowledgeFontSize = parseInt(localStorage.getItem('afr-knowledge-fontsize')) || 14;
    function applyKnowledgeFontSize() {
        const editor = document.getElementById('knowledgeEditor');
        if (editor) editor.style.fontSize = knowledgeFontSize + 'px';
    }
    function changeKnowledgeFontSize(delta) {
        knowledgeFontSize = Math.min(24, Math.max(12, knowledgeFontSize + delta));
        localStorage.setItem('afr-knowledge-fontsize', String(knowledgeFontSize));
        applyKnowledgeFontSize();
        notify('Font size: ' + knowledgeFontSize + 'px', 'info');
    }

    // 切换 knowledge 左/右侧栏抽屉收起（腾出中间空间）
    function toggleKnowledgeDrawer(side) {
        const el = document.getElementById(side === 'left' ? 'knowledgeOutline' : 'knowledgeExtensions');
        if (!el) return;
        const collapsed = el.classList.toggle('collapsed');
        const btn = document.getElementById(side === 'left' ? 'knDrawerLeft' : 'knDrawerRight');
        if (btn) {
            btn.textContent = collapsed ? (side === 'left' ? '›' : '‹') : (side === 'left' ? '‹' : '›');
        }
        positionKnowledgeDrawerBtns();
        // transition 0.2s，动画结束后再定位一次（收起后按钮贴到最终位置）
        setTimeout(positionKnowledgeDrawerBtns, 220);
    }

    // 动态定位抽屉按钮：贴在对应栏的边框上（栏宽变化后重算）
    function positionKnowledgeDrawerBtns() {
        const body = document.getElementById('knowledgeBody');
        const outline = document.getElementById('knowledgeOutline');
        const ext = document.getElementById('knowledgeExtensions');
        const leftBtn = document.getElementById('knDrawerLeft');
        const rightBtn = document.getElementById('knDrawerRight');
        if (!body || !outline || !ext || !leftBtn || !rightBtn) return;
        // 用offsetLeft/offsetWidth(相对body)，避免transition期间getBoundingClientRect滞后
        // 左按钮：贴outline右边缘（outline收起后offsetWidth=0，按钮自然到最左）
        leftBtn.style.left = (outline.offsetLeft + outline.offsetWidth - 11) + 'px';
        // 右按钮：贴extensions左边缘
        rightBtn.style.left = (ext.offsetLeft - 11) + 'px';
    }

    // ===== 导出笔记（图片/PDF）=====
    function toggleExportMenu(e) {
        if (e) { e.stopPropagation(); }
        const menu = document.getElementById('exportMenu');
        menu.classList.toggle('show');
    }

    async function exportNote(format) {
        document.getElementById('exportMenu').classList.remove('show');
        const hw = getCurrentHomework();
        if (!hw) { notify('No assignment selected', 'error'); return; }
        const editor = document.getElementById('knowledgeEditor');
        const titleEl = document.getElementById('pageTitleArea');

        notify('Generating ' + format.toUpperCase() + '...', 'info');

        // 构建临时导出容器（白底，固定宽度，含标题+内容）
        const tmp = document.createElement('div');
        const pageW = 760;
        tmp.style.cssText = `
            position: fixed; left: -9999px; top: 0;
            width: ${pageW}px; padding: 40px 48px;
            background: #ffffff; color: #262626;
            font-family: -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif;
            font-size: 14px; line-height: 1.8;
        `;
        const titleText = (titleEl && titleEl.textContent.trim()) || hw.name || 'Untitled';
        const meta = (hw.knowledgeMeta && hw.knowledgeMeta[state.currentClass]) || {};
        const className = state.currentClass === 'class9' ? 'Class 9' : 'Class 11';
        tmp.innerHTML = `
            <div style="font-size:24px;font-weight:800;color:#1890ff;margin-bottom:6px;word-break:break-word">${escapeHtml(titleText)}</div>
            <div style="font-size:12px;color:#8c8c8c;margin-bottom:24px;padding-bottom:14px;border-bottom:1px solid #f0f0f0">${escapeHtml(hw.name||'')} · ${className} · ${hw.date||''}</div>
            ${editor.innerHTML}
        `;
        document.body.appendChild(tmp);

        try {
            const canvas = await html2canvas(tmp, {
                scale: 2,
                backgroundColor: '#ffffff',
                useCORS: true,
            });
            const safeName = (titleText.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40));
            const fileName = `${safeName}_${className}_${state.knowledgeMode}`;

            if (format === 'png') {
                // 直接下载图片
                canvas.toBlob((blob) => {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = fileName + '.png';
                    a.click();
                    URL.revokeObjectURL(url);
                    notify('PNG exported', 'success');
                }, 'image/png');
            } else if (format === 'pdf') {
                // 截图转图片嵌入PDF（分页）
                const imgData = canvas.toDataURL('image/png');
                const { jsPDF } = window.jspdf;
                const pdf = new jsPDF('p', 'mm', 'a4');
                const pdfW = pdf.internal.pageSize.getWidth();   // 210
                const pdfH = pdf.internal.pageSize.getHeight();  // 297
                const margin = 8;
                const usableW = pdfW - margin * 2;
                // 图片按宽度缩放
                const imgH = canvas.height * usableW / canvas.width;
                let heightLeft = imgH;
                let position = margin;
                pdf.addImage(imgData, 'PNG', margin, position, usableW, imgH);
                heightLeft -= (pdfH - margin * 2);
                while (heightLeft > 0) {
                    position = margin - (imgH - heightLeft);
                    pdf.addPage();
                    pdf.addImage(imgData, 'PNG', margin, position, usableW, imgH);
                    heightLeft -= (pdfH - margin * 2);
                }
                pdf.save(fileName + '.pdf');
                notify('PDF exported', 'success');
            }
        } catch (err) {
            console.error('[AFR] export error:', err);
            notify('Export failed: ' + (err.message || 'unknown'), 'error');
        } finally {
            document.body.removeChild(tmp);
        }
    }

    // ===== Language Kit 弹窗 =====
    function toggleLanguageKit() {
        const panel = document.getElementById('langKitPanel');
        if (!panel) return;
        const willShow = !panel.classList.contains('show');
        if (willShow) {
            // 加载内容
            const hw = getCurrentHomework();
            const editor = document.getElementById('langKitEditor');
            if (hw && editor) {
                if (!hw.languageKit) hw.languageKit = {};
                editor.innerHTML = hw.languageKit[state.currentClass] || '';
            }
            panel.classList.add('show');
        } else {
            saveLanguageKit();
            panel.classList.remove('show');
        }
    }

    function saveLanguageKit() {
        const editor = document.getElementById('langKitEditor');
        const hw = getCurrentHomework();
        if (!editor || !hw) return;
        if (!hw.languageKit) hw.languageKit = {};
        hw.languageKit[state.currentClass] = editor.innerHTML;
        saveHomework(hw.id);
    }

    // 富文本格式命令
    function execFormat(command, value) {
        document.execCommand(command, false, value || null);
        document.getElementById('knowledgeEditor').focus();
    }

    // 对选中文字套前后标签（无选中则插入占位"文字"再套）。postEmpty为空表示纯包裹(footnote只加后缀)
    function wrapSelection(pre, post) {
        const editor = document.getElementById('knowledgeEditor');
        if (!editor) return;
        editor.focus();
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode) && sel.toString()) {
            const range = sel.getRangeAt(0);
            const text = sel.toString();
            range.deleteContents();
            const tmp = document.createElement('div');
            tmp.innerHTML = pre + text + (post || '');
            const frag = document.createDocumentFragment();
            while (tmp.firstChild) frag.appendChild(tmp.firstChild);
            range.insertNode(frag);
        } else {
            // 无选中：插入 pre + 零宽空格 + post，光标定位在标签内（接着输入就在格式里，不出现占位文字）
            document.execCommand('insertHTML', false, pre + '​' + (post || ''));
            // 把光标移到零宽空标后（标签内末尾）
            const sel2 = window.getSelection();
            if (sel2 && sel2.rangeCount > 0) {
                const r = sel2.getRangeAt(0);
                r.collapse(false);
                sel2.removeAllRanges();
                sel2.addRange(r);
            }
        }
        scheduleOutlineUpdate();
        saveKnowledge(true);
    }

    // 插入N列分栏（每列一个可编辑div，flex布局）
    function insertColumns(n) {
        // 栏之间插入.kn-col-divider竖线手柄(可拖动调宽)
        const parts = [];
        for (let i = 0; i < n; i++) {
            parts.push(`<div class="kn-col" contenteditable="true" data-col="${i}"><br></div>`);
            if (i < n - 1) parts.push(`<div class="kn-col-divider" data-divider="${i}"></div>`);
        }
        const container = document.createElement('div');
        container.className = 'kn-columns';
        container.innerHTML = `<span class="kn-col-del" title="Delete columns">✕</span>` + parts.join('');
        // 插入到光标处(若光标在<p>内,先移到p外,避免div嵌套进p致DOM错乱/Enter异常)
        const editor = document.getElementById('knowledgeEditor');
        editor.focus();
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            let range = sel.getRangeAt(0);
            // 找祖先<p>,若有则把插入点移到该p之后
            let node = range.startContainer;
            let p = node.nodeType === 3 ? node.parentElement : node;
            p = p && p.closest ? p.closest('p') : null;
            if (p && editor.contains(p)) {
                const newRange = document.createRange();
                newRange.setStartAfter(p);
                newRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(newRange);
                range = newRange;
            }
            range.insertNode(container);
            // 光标进第一栏
            const firstCol = container.querySelector('.kn-col');
            if (firstCol) {
                const r = document.createRange();
                r.selectNodeContents(firstCol);
                r.collapse(true);
                sel.removeAllRanges(); sel.addRange(r);
            }
        }
        bindColumnDividers(container);
        scheduleOutlineUpdate();
        saveKnowledge(true);
    }

    // 全局监听：光标在分栏.kn-col内时Enter软换行(防跳出栏破坏flex)
    // 绑在editor上(Enter target是editor,事件必经editor),用selection判断光标是否在col内
    let columnsEnterInited = false;
    function setupColumnsEnter() {
        if (columnsEnterInited) return;
        columnsEnterInited = true;
        const editor = document.getElementById('knowledgeEditor');
        if (!editor) return;
        editor.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== 'Backspace') return;
            const sel = window.getSelection();
            if (!sel || !sel.anchorNode) return;
            const node = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
            const col = node && node.closest ? node.closest('.kn-col') : null;
            if (!col) return;   // 光标不在栏内,放行
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                // 手动在光标处插入<br>(execCommand insertHTML在嵌套contentEditable会插到栏外)
                const br = document.createElement('br');
                const r = sel.getRangeAt(0);
                r.deleteContents();
                r.insertNode(br);
                // 光标移到<br>后
                r.setStartAfter(br);
                r.collapse(true);
                sel.removeAllRanges();
                sel.addRange(r);
            } else if (e.key === 'Backspace') {
                // 光标在栏开头时阻止Backspace(防跳出栏删分栏结构);栏中间/末尾正常删
                const r = sel.getRangeAt(0);
                if (!r.collapsed) return;   // 有选区,允许删
                // 判断光标是否在栏最开头:用Range从栏起点到光标的字符串为空
                const testRange = document.createRange();
                testRange.selectNodeContents(col);
                testRange.setEnd(r.startContainer, r.startOffset);
                if (testRange.toString().length === 0) {
                    // 光标在栏开头,阻止Backspace跳出栏
                    e.preventDefault();
                    e.stopPropagation();
                }
                // 否则放行,浏览器正常在栏内删
            }
        }, true);   // 捕获阶段,确保早于其他Enter监听
    }

    // 给分栏容器的所有竖线手柄绑定拖动调宽
    function bindColumnDividers(container) {
        if (!container) return;
        container.querySelectorAll('.kn-col-divider').forEach(div => {
            if (div.dataset.bound === '1') return;
            div.dataset.bound = '1';
            // 捕获阶段绑定,确保早于编辑器的selectionchange等监听
            div.addEventListener('mousedown', (e) => startColDrag(e, div, container), true);
        });
        // 删除按钮：点✕删除整个分栏容器(用mousedown捕获阶段,避免被编辑器抢事件)
        const del = container.querySelector('.kn-col-del');
        if (del && del.dataset.bound !== '1') {
            del.dataset.bound = '1';
            del.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                container.remove();
                saveKnowledge(true);
            }, true);
        }
    }

    // 拖动竖线调宽：改两侧栏的flex-basis
    function startColDrag(e, divider, container) {
        e.preventDefault();
        e.stopPropagation();
        const leftCol = divider.previousElementSibling;
        const rightCol = divider.nextElementSibling;
        if (!leftCol || !rightCol) return;
        divider.classList.add('col-dragging');
        const containerRect = container.getBoundingClientRect();
        const startX = e.clientX;
        // 记录起始两栏宽度
        const leftW = leftCol.getBoundingClientRect().width;
        const rightW = rightCol.getBoundingClientRect().width;
        const totalW = leftW + rightW;
        const onMove = (ev) => {
            const delta = ev.clientX - startX;
            let newLeft = leftW + delta;
            // 最小40px限制
            if (newLeft < 40) newLeft = 40;
            if (newLeft > totalW - 40) newLeft = totalW - 40;
            const newRight = totalW - newLeft;
            leftCol.style.flex = `0 0 ${newLeft}px`;
            rightCol.style.flex = `0 0 ${newRight}px`;
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            divider.classList.remove('col-dragging');
            saveKnowledge(true);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }


    // 工作流：竖线串联圆点 + 文本框（时间线/流程图风格）
    // 默认 n 个节点，回车可追加新节点，空节点 Backspace 删除
    function insertWorkflow(n) {
        const editor = document.getElementById('knowledgeEditor');
        editor.focus();
        n = Math.max(2, Math.min(8, n | 0));  // 2-8个节点
        const wf = document.createElement('div');
        wf.className = 'kn-workflow';
        for (let i = 0; i < n; i++) {
            wf.appendChild(buildWorkflowStep());
        }
        // 在当前光标处插入工作流DOM，并聚焦第一个文本框
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            range.insertNode(wf);
            const firstText = wf.querySelector('.wf-text');
            if (firstText) placeCaretAtEnd(firstText);
        }
        scheduleOutlineUpdate();
        saveKnowledge(true);
    }

    // 构建单个工作流节点（导轨圆点 + 文本框），绑定回车追加/退格删除
    function buildWorkflowStep() {
        const step = document.createElement('div');
        step.className = 'wf-step';
        const rail = document.createElement('div');
        rail.className = 'wf-rail';
        const dot = document.createElement('span');
        dot.className = 'wf-dot';
        rail.appendChild(dot);
        const text = document.createElement('div');
        text.className = 'wf-text';
        text.contentEditable = 'true';
        text.innerHTML = '<br>';
        // 回车：document 捕获阶段统一拦截（最可靠，不受其他监听干扰）
        // 判断光标是否落在本节点文本框内 → 是则拦截 Enter 追加新节点
        // 注：不在此绑定，统一在 setupWorkflowKeys 注册 document 级监听
        text.dataset.wfText = '1';
        // 删除按钮：悬停显现，点击删除该节点（无论有无文字）
        const del = document.createElement('span');
        del.className = 'wf-del';
        del.title = 'Delete this step';
        del.textContent = '✕';
        del.addEventListener('mousedown', (e) => {
            e.preventDefault();      // 防止文本框失焦/光标跳动
            e.stopPropagation();     // 阻止冒泡到 keydown 等
        });
        del.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const wf = step.parentElement;
            if (!wf) return;
            if (wf.childElementCount > 1) {
                const prev = step.previousElementSibling;
                const next = step.nextElementSibling;
                step.remove();
                const target = prev || next;
                if (target) placeCaretAtEnd(target.querySelector('.wf-text'));
                scheduleOutlineUpdate();
                saveKnowledge(true);
            } else {
                // 唯一节点 → 删整个工作流
                wf.remove();
                editorFocusEnd();
                scheduleOutlineUpdate();
                saveKnowledge(true);
            }
        });
        step.appendChild(rail);
        step.appendChild(text);
        step.appendChild(del);   // ✕挂在step上（非可编辑text内），避免污染内容
        return step;
    }

    // 工作流键盘：document 级捕获监听（最可靠，不受其他监听干扰）
    // 光标落在 .wf-text 内时：Enter→追加节点，空节点 Backspace→删除节点
    let workflowKeysInited = false;
    function setupWorkflowKeys() {
        if (workflowKeysInited) return;
        workflowKeysInited = true;
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== 'Backspace') return;
            const sel = window.getSelection();
            if (!sel || !sel.anchorNode) return;
            // 判断光标是否在工作流的 .wf-text 内
            const wfText = sel.anchorNode.nodeType === 1
                ? sel.anchorNode.closest('.wf-text')
                : (sel.anchorNode.parentElement && sel.anchorNode.parentElement.closest('.wf-text'));
            if (!wfText) return;   // 不在工作流文本框内，放行
            const step = wfText.closest('.wf-step');
            const wf = wfText.closest('.kn-workflow');
            if (!step || !wf) return;

            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();   // 关键：阻止浏览器默认（往右/换行的根因）
                const newStep = buildWorkflowStep();
                wf.appendChild(newStep);   // 追加到工作流末尾，向下
                const nt = newStep.querySelector('.wf-text');
                placeCaretAtEnd(nt);
                nt.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                scheduleOutlineUpdate();
                saveKnowledge(true);
            } else if (e.key === 'Backspace' && wfText.textContent.trim() === '') {
                e.preventDefault();
                if (wf.childElementCount > 1) {
                    const prev = step.previousElementSibling;
                    const next = step.nextElementSibling;
                    step.remove();
                    const t = (prev || next).querySelector('.wf-text');
                    if (t) placeCaretAtEnd(t);
                    scheduleOutlineUpdate();
                    saveKnowledge(true);
                } else {
                    wf.remove();
                    editorFocusEnd();
                    scheduleOutlineUpdate();
                    saveKnowledge(true);
                }
            }
        }, true);   // 捕获阶段，最早执行
    }

    // 聚焦编辑器并把光标放末尾（删除工作流后恢复光标）
    function editorFocusEnd() {
        const editor = document.getElementById('knowledgeEditor');
        if (!editor) return;
        editor.focus();
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }

    function formatBlock(tag) {
        if (!tag) return;
        document.execCommand('formatBlock', false, '<' + tag + '>');
        document.getElementById('knowledgeEditor').focus();
    }

    // 图片粘贴处理
    function handleKnowledgePaste(e) {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                e.preventDefault();
                const file = items[i].getAsFile();
                insertImageFile(file);
                return;
            }
        }
        // 纯文本粘贴：粘贴前自动格式化（语境：/A:/B:/C:/D:等标记前断行）
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        if (text && /语境[:：]|^[A-D][:．.]/m.test(text)) {
            e.preventDefault();
            const formatted = formatQuestionDetailText(text);
            document.execCommand('insertText', false, formatted);
            return;
        }
        // 其他文本粘贴由浏览器默认处理
    }

    /**
     * 题目详解文本自动断行：把 语境： A: B: C: D: 等标记前的内容断成新行
     * 适用粘贴自Word/PDF的详解文本（标记挤在一行时自动拆开）
     */
    function formatQuestionDetailText(text) {
        let t = text;
        // 统一换行符
        t = t.replace(/\r\n?/g, '\n');
        // 在各标记前断行（标记出现在行中间时）。标记前有内容才断（行首已断的不重复）
        t = t.replace(/([^\n])\s*(语境\s*[:：])/g, '$1\n$2');
        t = t.replace(/([^\n])\s+([A-D])\s*[:：]\s*/g, '$1\n$2: ');
        t = t.replace(/([^\n])\s*(答案\s*[:：])/g, '$1\n$2');
        t = t.replace(/([^\n])\s*(解析\s*[:：])/g, '$1\n$2');
        // A:后多余空格收敛为单个（上面的替换已统一为": "）
        // 清理行首尾多余空白但保留缩进结构
        t = t.split('\n').map(l => l.replace(/[ \t]+$/, '')).join('\n');
        return t;
    }

    /**
     * 一键整理编辑器里已粘贴的详解文本：选中范围（或全文）内的 语境：/A:/B:/C:/D: 自动断行
     * 控制台 AFR.formatEditorDetail() 调用
     */
    function formatEditorDetail() {
        const editor = document.getElementById('knowledgeEditor');
        if (!editor) return;
        const sel = window.getSelection();
        let range = null, targetText = '', node = null;
        if (sel && !sel.isCollapsed && editor.contains(sel.anchorNode)) {
            // 有选区：只处理选区文本
            targetText = sel.toString();
            range = sel.getRangeAt(0);
            node = range;
        } else {
            targetText = editor.innerText;
        }
        const formatted = formatQuestionDetailText(targetText);
        if (formatted === targetText) { notify('No changes needed (no 语境/A:/B:/C:/D: markers found in running text)', 'info'); return; }
        if (range) {
            // 替换选区
            range.deleteContents();
            const txt = document.createTextNode(formatted);
            range.insertNode(txt);
        } else {
            // 全文替换（保留编辑器，只换文本——图片等富内容会丢失，提示用户）
            const hasRich = editor.querySelector('img, table, .kn-workflow, .kn-columns');
            if (hasRich && !confirm('This will replace ALL content as plain text (images/tables will be lost). Continue?')) return;
            editor.innerText = formatted;
        }
        saveKnowledge();
        notify('Detail text formatted: 语境/A/B/C/D each on its own line', 'success');
    }

    // 插入图片文件
    function insertImageFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            // 用临时Image测原图尺寸，按比例设显示宽度(最大300px，避免铺满)
            const tmp = new Image();
            tmp.onload = () => {
                const dispW = Math.min(tmp.naturalWidth, 300);
                const img = `<img class="kn-img" src="${e.target.result}" style="width:${dispW}px;height:auto;border-radius:4px;margin:8px 0">`;
                document.getElementById('knowledgeEditor').focus();
                document.execCommand('insertHTML', false, img);
                notify('Image inserted (hover to resize, drag to move, click to zoom)', 'success');
            };
            tmp.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // 图片拖拽缩放：hover时显示固定定位的覆盖层(外框+8手柄)，拖手柄改width
    // 覆盖层是body直接子元素，z-index最高，避开contentEditable层叠问题
    let imgOverlay = null;
    let imgOverlayTarget = null;
    function attachImgResizeWrapper(img) {
        if (img.dataset.resizable === '1') return;
        img.dataset.resizable = '1';
        img.classList.add('kn-img');
        img.style.cursor = 'zoom-in';
        // 鼠标进入图片 → 显示覆盖层
        img.addEventListener('mouseenter', () => {
            if (imgViewerOpen) return;
            showImgOverlay(img);
        });
        // 图片本体拖动移动 / 点击全屏 / 双击删除
        img.addEventListener('mousedown', (e) => startImgMove(e));
        img.addEventListener('dblclick', (e) => {
            e.preventDefault();
            const range = document.createRange();
            range.selectNode(img);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            notify('图片已选中，按 Backspace/Delete 删除', 'info');
        });
    }

    // 显示固定覆盖层（外框+8手柄），定位到图片四角
    function showImgOverlay(img) {
        removeImgOverlay();
        imgOverlayTarget = img;
        imgOverlay = document.createElement('div');
        imgOverlay.className = 'kn-img-overlay';
        const positions = ['nw','n','ne','e','se','s','sw','w'];
        positions.forEach(pos => {
            const h = document.createElement('div');
            h.className = 'kn-ov-handle h-' + pos;
            h.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); startImgResize(e, img, pos); });
            imgOverlay.appendChild(h);
        });
        document.body.appendChild(imgOverlay);
        positionImgOverlay();
        // 覆盖层hover时保持，离开图片+覆盖层时移除
        img.addEventListener('mouseleave', onImgLeave);
        imgOverlay.addEventListener('mouseenter', () => {});  // 覆盖层上时算hover
        imgOverlay.addEventListener('mouseleave', onImgLeave);
    }
    function onImgLeave(e) {
        if (!imgOverlay) return;
        const r = imgOverlay.getBoundingClientRect();
        // 鼠标还在覆盖层或图片范围内 → 不移除
        const x = e.clientX !== undefined ? e.clientX : 0, y = e.clientY !== undefined ? e.clientY : 0;
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return;
        removeImgOverlay();
    }
    function removeImgOverlay() {
        if (imgOverlay) { imgOverlay.remove(); imgOverlay = null; }
        if (imgOverlayTarget) { imgOverlayTarget.removeEventListener('mouseleave', onImgLeave); }
        imgOverlayTarget = null;
    }
    // 覆盖层定位到图片四角（fixed，视口坐标）
    function positionImgOverlay() {
        if (!imgOverlay || !imgOverlayTarget) return;
        const r = imgOverlayTarget.getBoundingClientRect();
        const o = imgOverlay;
        o.style.left = r.left + 'px';
        o.style.top = r.top + 'px';
        o.style.width = r.width + 'px';
        o.style.height = r.height + 'px';
    }
    // 滚动/缩放时重定位覆盖层
    document.addEventListener('scroll', () => { if (imgOverlay) positionImgOverlay(); }, true);
    window.addEventListener('resize', () => { if (imgOverlay) positionImgOverlay(); });

    function startImgMove(e) {
        if (imgViewerOpen) return;
        const img = e.currentTarget;
        const startX = e.clientX, startY = e.clientY;
        let moved = false;
        const onMove = (ev) => {
            if (!moved && (Math.abs(ev.clientX - startX) > 5 || Math.abs(ev.clientY - startY) > 5)) {
                moved = true;
                img.style.opacity = '0.6';
            }
        };
        const onUp = (ev) => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            img.style.opacity = '';
            if (!moved) { openImgViewer(img.src, img); return; }
            // 拖动结束：定位松开处光标，把图片移过去
            const editor = document.getElementById('knowledgeEditor');
            const wrap = img.parentElement;
            const wrapHTML = (wrap && wrap.classList.contains('kn-img-wrap')) ? wrap.innerHTML : img.outerHTML;
            try {
                editor.focus();
                let range = null;
                if (document.caretRangeFromPoint) range = document.caretRangeFromPoint(ev.clientX, ev.clientY);
                if (!range && document.caretPositionFromPoint) {
                    const p = document.caretPositionFromPoint(ev.clientX, ev.clientY);
                    if (p) { range = document.createRange(); range.setStart(p.offsetNode, p.offset); range.collapse(true); }
                }
                if (range && editor.contains(range.startContainer)) {
                    if (wrap && wrap.classList.contains('kn-img-wrap')) wrap.remove();
                    const sel = window.getSelection();
                    sel.removeAllRanges(); sel.addRange(range);
                    document.execCommand('insertHTML', false, '<span class="kn-img-wrap">' + wrapHTML + '</span>');
                }
            } catch (err) { console.warn('img move failed:', err); }
            scheduleAutoSave();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    function startImgResize(e, img, pos) {
        e.preventDefault(); e.stopPropagation();
        const startX = e.clientX;
        const startW = img.offsetWidth;
        const ratio = img.naturalHeight / img.naturalWidth;
        imgResizing = { img, pos, startX, startW, ratio };
        document.body.style.cursor = (pos.includes('e') || pos.includes('w')) ? 'ew-resize' : 'ns-resize';
        document.addEventListener('mousemove', doImgResize);
        document.addEventListener('mouseup', endImgResize);
    }
    function doImgResize(e) {
        if (!imgResizing) return;
        const { img, pos, startX, startW } = imgResizing;
        const dx = e.clientX - startX;
        // 右侧手柄(e/se/ne):拖右变大；左侧(w/sw/nw):拖左变大(反向)。上下手柄用比例
        let delta = 0;
        if (pos.includes('e')) delta = dx;
        else if (pos.includes('w')) delta = -dx;
        else delta = dx; // 纯上下也按水平算
        let newW = Math.max(40, startW + delta);
        img.style.width = newW + 'px';
        img.style.height = 'auto';
    }
    function endImgResize() {
        if (imgResizing) { scheduleAutoSave(); imgResizing = null; }
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', doImgResize);
        document.removeEventListener('mouseup', endImgResize);
    }

    // 图片全屏查看器（点击图片打开，底部放大缩小按钮+滚轮缩放）
    let imgViewerOpen = false;
    let imgViewerCurrent = null;  // 全屏查看的当前图片元素(用于删除)
    function openImgViewer(src, imgEl) {
        if (imgViewerOpen) return;
        imgViewerOpen = true;
        imgViewerCurrent = imgEl || null;
        const overlay = document.createElement('div');
        overlay.id = 'imgViewer';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center';
        const img = document.createElement('img');
        img.src = src;
        img.style.cssText = 'max-width:88vw;max-height:78vh;transition:transform 0.15s;transform-origin:center;user-select:none;-webkit-user-drag:none';
        let zoom = 1;
        const bar = document.createElement('div');
        bar.style.cssText = 'margin-top:18px;display:flex;gap:10px;align-items:center;background:rgba(255,255,255,0.1);padding:8px 14px;border-radius:24px';
        const mkBtn = (txt, fn) => {
            const b = document.createElement('button');
            b.textContent = txt;
            b.style.cssText = 'width:38px;height:38px;border:none;border-radius:50%;background:#fff;color:#000;font-size:18px;cursor:pointer';
            b.onclick = fn;
            return b;
        };
        const apply = () => { img.style.transform = 'scale(' + zoom + ')'; };
        const zoomIn = () => { zoom = Math.min(5, zoom + 0.2); apply(); lbl.textContent = Math.round(zoom*100) + '%'; };
        const zoomOut = () => { zoom = Math.max(0.2, zoom - 0.2); apply(); lbl.textContent = Math.round(zoom*100) + '%'; };
        const reset = () => { zoom = 1; apply(); lbl.textContent = '100%'; };
        const lbl = document.createElement('span');
        lbl.textContent = '100%';
        lbl.style.cssText = 'color:#fff;font-size:14px;min-width:48px;text-align:center';
        bar.appendChild(mkBtn('−', zoomOut));
        bar.appendChild(lbl);
        bar.appendChild(mkBtn('+', zoomIn));
        bar.appendChild(mkBtn('↺', reset));
        // 删除图片按钮（带确认）
        const delBtn = mkBtn('🗑', () => {
            if (imgViewerCurrent && confirm('Delete this image?')) {
                const wrap = imgViewerCurrent.parentElement;
                if (wrap && wrap.classList.contains('kn-img-wrap')) wrap.remove();
                else imgViewerCurrent.remove();
                scheduleAutoSave();
                closeImgViewer();
            }
        });
        delBtn.style.background = '#e63946'; delBtn.style.color = '#fff';
        bar.appendChild(delBtn);
        const closeBtn = mkBtn('✕', () => closeImgViewer());
        closeBtn.style.background = '#e63946'; closeBtn.style.color = '#fff';
        bar.appendChild(closeBtn);
        overlay.appendChild(img);
        overlay.appendChild(bar);
        // 滚轮缩放
        overlay.addEventListener('wheel', (e) => { e.preventDefault(); e.deltaY < 0 ? zoomIn() : zoomOut(); }, { passive: false });
        // 点空白/ESC关闭
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeImgViewer(); });
        document.addEventListener('keydown', imgViewerEsc = (e) => { if (e.key === 'Escape') closeImgViewer(); });
        document.body.appendChild(overlay);
    }
    let imgViewerEsc = null;
    function closeImgViewer() {
        const ov = document.getElementById('imgViewer');
        if (ov) ov.remove();
        imgViewerOpen = false;
        if (imgViewerEsc) { document.removeEventListener('keydown', imgViewerEsc); imgViewerEsc = null; }
    }


    // 从文件选择器插入图片
    function insertKnowledgeImage() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
            if (e.target.files.length > 0) {
                insertImageFile(e.target.files[0]);
            }
        };
        input.click();
    }

    // 粘贴提示
    function pasteImageHint() {
        notify('Press Ctrl+V in the editor to paste an image', 'info');
    }

    // ===== ＋ 块插入菜单（FlowUs风格）=====
    const BLOCK_CATEGORIES = [
        {
            title: 'Basic',
            items: [
                { icon: '📝', name: 'Text', desc: 'Body paragraph', insert: () => insertFormatBlock('p') },
                { icon: '🔹', name: 'Heading 1', desc: 'Large title', insert: () => insertFormatBlock('h1') },
                { icon: '🔸', name: 'Heading 2', desc: 'Section title', insert: () => insertFormatBlock('h2') },
                { icon: '▫️', name: 'Heading 3', desc: 'Subsection', insert: () => insertFormatBlock('h3') },
                { icon: '◽', name: 'Heading 4', desc: 'Level 4', insert: () => insertFormatBlock('h4') },
                { icon: '◽', name: 'Heading 5', desc: 'Level 5', insert: () => insertFormatBlock('h5') },
                { icon: '◽', name: 'Heading 6', desc: 'Level 6', insert: () => insertFormatBlock('h6') },
            ],
        },
        {
            title: 'Inline',
            items: [
                { icon: 'B', name: 'Bold', desc: '**bold**', insert: () => wrapSelection('<b>', '</b>') },
                { icon: 'I', name: 'Italic', desc: '*italic*', insert: () => wrapSelection('<i>', '</i>') },
                { icon: 'BI', name: 'Bold + Italic', desc: '***text***', insert: () => wrapSelection('<b><i>', '</i></b>') },
                { icon: 'U', name: 'Underline', desc: 'underline', insert: () => wrapSelection('<u>', '</u>') },
                { icon: 'S', name: 'Strikethrough', desc: '~~text~~', insert: () => wrapSelection('<s>', '</s>') },
                { icon: '</>', name: 'Inline Code', desc: '`code`', insert: () => wrapSelection('<code>', '</code>') },
                { icon: '🖍', name: 'Highlight', desc: '==text==', insert: () => wrapSelection('<mark>', '</mark>') },
                { icon: '▭', name: 'Box', desc: 'boxed text', insert: () => wrapSelection('<span class="kn-box">', '</span>') },
            ],
        },
        {
            title: 'List',
            items: [
                { icon: '●', name: 'Bullet List', desc: 'Unordered list', insert: () => insertPlainList('ul') },
                { icon: '➤', name: 'Arrow', desc: 'Right-arrow bullets', insert: () => insertSymbolList('➤') },
                { icon: '◼', name: 'Square', desc: 'Square bullets', insert: () => insertSymbolList('◼') },
                { icon: '♦', name: 'Diamond', desc: 'Diamond bullets', insert: () => insertSymbolList('♦') },
                { icon: '♣', name: 'Club', desc: 'Club bullets', insert: () => insertSymbolList('♣') },
                { icon: '♥', name: 'Heart', desc: 'Heart bullets', insert: () => insertSymbolList('♥') },
                { icon: '1.', name: 'Numbered List', desc: 'Ordered list', insert: () => insertPlainList('ol') },
                { icon: '☐', name: 'To-do', desc: 'Task unchecked', insert: () => insertTodoBlock(false) },
                { icon: '☑', name: 'To-do Done', desc: 'Task checked', insert: () => insertTodoBlock(true) },
                { icon: '↳', name: 'Sub-list', desc: 'Nested list', insert: () => insertHtmlAtCursor('<ul><li>Parent<ul><li>Child item</li></ul></li></ul>') },
                { icon: '▾', name: 'Collapsible', desc: 'Foldable list (click to toggle)', insert: () => insertCollapsible() },
            ],
        },
        {
            title: 'Block',
            items: [
                { icon: '❝', name: 'Quote', desc: 'Blockquote', insert: () => insertFormatBlock('blockquote') },
                { icon: '—', name: 'Divider', desc: 'Horizontal line', insert: () => insertHtmlAtCursor('<hr>') },
                { icon: '🖨', name: 'Code Block', desc: 'Multi-line code', insert: insertCodeBlock },
                { icon: '📊', name: 'Table', desc: '2x2 table', insert: insertSimpleTable },
            ],
        },
        {
            title: 'Callout',
            items: [
                { icon: '💡', name: 'Info', desc: 'Blue note box', insert: () => insertCallout('info', '💡') },
                { icon: '✅', name: 'Tip', desc: 'Green tip box', insert: () => insertCallout('tip', '✅') },
                { icon: '⚠️', name: 'Warn', desc: 'Yellow warning', insert: () => insertCallout('warn', '⚠️') },
                { icon: '❗', name: 'Danger', desc: 'Red alert box', insert: () => insertCallout('danger', '❗') },
            ],
        },
        {
            title: 'Media',
            items: [
                { icon: '🔗', name: 'Link', desc: 'Hyperlink', insert: () => insertHyperlink() },
                { icon: '🖼', name: 'Image', desc: 'Image placeholder', insert: () => insertHtmlAtCursor('<img alt="image" src="">') },
            ],
        },
        {
            title: 'Other',
            items: [
                { icon: '¹', name: 'Footnote', desc: 'Add footnote to selection', insert: () => insertFootnote() },
                { icon: '💬', name: 'Comment', desc: 'Add comment to selection', insert: insertComment },
            ],
        },
        {
            title: 'Align',
            items: [
                { icon: '⬅', name: 'Align Left', desc: 'Left alignment', insert: () => execFormat('justifyLeft') },
                { icon: '⬌', name: 'Align Center', desc: 'Center alignment', insert: () => execFormat('justifyCenter') },
                { icon: '➡', name: 'Align Right', desc: 'Right alignment', insert: () => execFormat('justifyRight') },
            ],
        },
        {
            title: 'Columns',
            items: [
                { icon: '▤', name: '2 Columns', desc: 'Two-column layout', insert: () => insertColumns(2) },
                { icon: '▥', name: '3 Columns', desc: 'Three-column layout', insert: () => insertColumns(3) },
                { icon: '▦', name: '4 Columns', desc: 'Four-column layout', insert: () => insertColumns(4) },
            ],
        },
        {
            title: 'Workflow',
            items: [
                { icon: '●', name: 'Workflow', desc: 'Timeline: steps linked by a line', insert: () => insertWorkflow(3) },
            ],
        },
    ];

    // 行内+号的目标块：记录点击+时鼠标所在的块元素，插入时定位到它后面
    let inlineTargetBlock = null;

    function toggleBlockMenu(e) {
        if (e) { e.stopPropagation(); e.preventDefault(); }
        showBlockMenuAt(e ? e.clientX : 100, e ? e.clientY : 100);
    }

    // 行内+号触发：在+号右侧显示菜单 + 实时定位当前行块（不依赖hover记录）
    function openInlineBlockMenu(e) {
        if (e) { e.stopPropagation(); e.preventDefault(); }
        const btn = document.getElementById('inlineAddBtn');
        const r = btn.getBoundingClientRect();
        // 用+号位置精准定位当前行块（+号右侧偏移一点，落在编辑区文字上）
        const editor = document.getElementById('knowledgeEditor');
        if (editor) {
            const cx = r.right + 20;  // +号右侧20px(编辑区内文字区)
            const cy = r.top + r.height / 2;  // +号垂直中心
            const el = document.elementFromPoint(cx, cy);
            if (el && editor.contains(el)) {
                // 找最近的行块（p/h/li/callout等，或editor直接子元素）
                let block = el.closest('p, h2, h3, h4, h5, h6, li, pre, blockquote, hr, table, .callout, .todo-block, details, summary');
                if (!block || block === editor) {
                    // 退而找editor直接子元素
                    let n = el;
                    while (n && n.parentElement !== editor) n = n.parentElement;
                    block = n;
                }
                if (block && block !== editor) inlineTargetBlock = block;
            }
        }
        showBlockMenuAt(r.right + 4, r.top - 4);
    }

    function showBlockMenuAt(x, y) {
        const menu = document.getElementById('blockMenu');
        const isOpen = menu.classList.contains('show');
        closeAllDropdowns();
        if (isOpen) { menu.classList.remove('show'); return; }
        renderBlockMenu(menu, '');
        menu.classList.add('show');
        // 菜单打开时隐藏行内+号,避免+号与菜单交互冲突(碰+号菜单消失)
        if (lineBtnEl) lineBtnEl.style.display = 'none';
        let left = x, top = y;
        if (left + 370 > window.innerWidth) left = window.innerWidth - 380;
        if (top + 420 > window.innerHeight) top = Math.max(10, window.innerHeight - 430);
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
    }

    // 块菜单预览图：按name返回{cls,html}，用HTML/CSS画出块的样式缩影(英文标注)
    function getBlockPreview(name) {
        const L = '<div class="pv-line"></div>';
        const Lw = '<div class="pv-line w70"></div>';
        const Lb = '<div class="pv-line bold"></div>';
        const map = {
            // Basic
            'Text': { cls: '', html: L + Lw },
            'Heading 1': { cls: '', html: '<div class="pv-h h1">H1</div>' + Lw },
            'Heading 2': { cls: '', html: '<div class="pv-h">H2</div>' + Lw },
            'Heading 3': { cls: '', html: '<div class="pv-h" style="font-size:10px">H3</div>' + Lw },
            'Heading 4': { cls: '', html: '<div class="pv-h" style="font-size:9px">H4</div>' + Lw },
            'Heading 5': { cls: '', html: '<div class="pv-h" style="font-size:9px">H5</div>' + Lw },
            'Heading 6': { cls: '', html: '<div class="pv-h" style="font-size:9px">H6</div>' + Lw },
            // Inline
            'Bold': { cls: '', html: '<div class="pv-h" style="font-size:12px">B</div>' },
            'Italic': { cls: '', html: '<div class="pv-h" style="font-size:12px;font-style:italic">I</div>' },
            'Bold + Italic': { cls: '', html: '<div class="pv-h" style="font-size:11px;font-style:italic;font-weight:800">BI</div>' },
            'Underline': { cls: '', html: '<div class="pv-h" style="font-size:12px;text-decoration:underline">U</div>' },
            'Strikethrough': { cls: '', html: '<div class="pv-h" style="font-size:12px;text-decoration:line-through">S</div>' },
            'Inline Code': { cls: 'pv-code', html: '<div class="pv-h" style="font-size:10px;color:#e6c07b;font-family:monospace">code</div>' },
            'Highlight': { cls: '', html: '<div class="pv-h" style="font-size:11px;background:#fff176;padding:1px 4px;border-radius:2px">HL</div>' },
            'Box': { cls: '', html: '<div class="pv-h" style="font-size:10px;border:1px solid #333;padding:1px 4px;border-radius:2px">box</div>' },
            // List
            'Bullet List': { cls: '', html: '<div class="pv-bullet"><div class="pv-line w100"></div></div><div class="pv-bullet"><div class="pv-line w70"></div></div>' },
            'Arrow': { cls: '', html: '<div class="pv-bullet"><div class="pv-line w100"></div></div><div class="pv-bullet"><div class="pv-line w70"></div></div>' },
            'Square': { cls: '', html: '<div class="pv-bullet"><div class="pv-line w100"></div></div><div class="pv-bullet"><div class="pv-line w70"></div></div>' },
            'Diamond': { cls: '', html: '<div class="pv-bullet"><div class="pv-line w100"></div></div><div class="pv-bullet"><div class="pv-line w70"></div></div>' },
            'Club': { cls: '', html: '<div class="pv-bullet"><div class="pv-line w100"></div></div><div class="pv-bullet"><div class="pv-line w70"></div></div>' },
            'Heart': { cls: '', html: '<div class="pv-bullet"><div class="pv-line w100"></div></div><div class="pv-bullet"><div class="pv-line w70"></div></div>' },
            'Numbered List': { cls: '', html: '<div class="pv-num">1.<div class="pv-line w100"></div></div><div class="pv-num">2.<div class="pv-line w70"></div></div>' },
            'To-do': { cls: '', html: '<div class="pv-bullet"><div style="width:7px;height:7px;border:1.5px solid #999;border-radius:2px;flex-shrink:0"></div><div class="pv-line w70"></div></div>' },
            'To-do Done': { cls: '', html: '<div class="pv-bullet"><div style="width:7px;height:7px;border:1.5px solid var(--color-primary,#1890ff);border-radius:2px;background:var(--color-primary,#1890ff);flex-shrink:0">✓</div><div class="pv-line w70"></div></div>' },
            'Sub-list': { cls: '', html: '<div class="pv-bullet"><div class="pv-line w100"></div></div><div style="padding-left:12px"><div class="pv-bullet"><div class="pv-line w70"></div></div></div>' },
            'Collapsible': { cls: '', html: '<div class="pv-bullet"><span style="font-size:8px;color:var(--text-tertiary)">▾</span><div class="pv-line w70"></div></div>' },
            // Block
            'Quote': { cls: 'pv-quote', html: L + Lw },
            'Divider': { cls: 'pv-divider', html: '<div class="pv-line"></div>' },
            'Code Block': { cls: 'pv-code', html: L + '<div class="pv-line w70"></div>' },
            'Table': { cls: 'pv-table', html: '<div class="pv-grid"><div></div><div></div><div></div><div></div></div>' },
            // Callout
            'Info': { cls: 'pv-callout', html: '<span style="font-size:11px">💡</span><div class="pv-line w70"></div>' },
            'Tip': { cls: 'pv-callout', html: '<span style="font-size:11px">✅</span><div class="pv-line w70"></div>' },
            'Warn': { cls: 'pv-callout', html: '<span style="font-size:11px">⚠️</span><div class="pv-line w70"></div>' },
            'Danger': { cls: 'pv-callout', html: '<span style="font-size:11px">❗</span><div class="pv-line w70"></div>' },
            // Media
            'Link': { cls: '', html: '<div class="pv-h" style="font-size:9px;color:var(--color-primary,#1890ff);text-decoration:underline">link</div>' },
            'Image': { cls: '', html: '<div style="width:20px;height:16px;background:var(--bg-subtle,#eee);border:1px solid var(--border-color,#ddd);border-radius:2px;display:flex;align-items:center;justify-content:center;font-size:9px">🖼</div>' },
            // Other
            'Footnote': { cls: '', html: '<div class="pv-line w100"></div><div style="font-size:8px;color:var(--color-primary,#1890ff);align-self:flex-end;margin-top:-2px">¹ note</div>' },
            'Comment': { cls: '', html: '<div style="background:#ffd54f;padding:1px 4px;border-radius:2px"><div class="pv-line w70" style="background:#fff"></div></div>' },
            // Align
            'Align Left': { cls: 'pv-align', html: '<div class="pv-line w100"></div><div class="pv-line w70"></div>' },
            'Align Center': { cls: 'pv-align pv-center', html: '<div class="pv-line w70" style="margin:0 auto"></div><div class="pv-line w100" style="margin:0 auto"></div>' },
            'Align Right': { cls: 'pv-align', html: '<div class="pv-line w70" style="margin-left:auto"></div><div class="pv-line w100" style="margin-left:auto"></div>' },
            // Columns
            '2 Columns': { cls: 'pv-cols', html: '<div><div class="pv-line w100"></div><div class="pv-line w70"></div></div><div><div class="pv-line w100"></div><div class="pv-line w70"></div></div>' },
            '3 Columns': { cls: 'pv-cols', html: '<div><div class="pv-line w100"></div></div><div><div class="pv-line w100"></div></div><div><div class="pv-line w100"></div></div>' },
            '4 Columns': { cls: 'pv-cols', html: '<div><div class="pv-line w100"></div></div><div><div class="pv-line w100"></div></div><div><div class="pv-line w100"></div></div><div><div class="pv-line w100"></div></div>' },
            // Workflow
            'Workflow': { cls: 'pv-flow', html: '<div class="pv-dot"></div><div style="height:6px"></div><div class="pv-dot"></div>' },
        };
        return map[name] || { cls: '', html: '' };
    }

    function renderBlockMenu(menu, filter) {
        const fl = (filter || '').toLowerCase();
        let html = '';
        BLOCK_CATEGORIES.forEach(cat => {
            const items = cat.items.filter(it =>
                !fl || it.name.toLowerCase().includes(fl) || it.desc.toLowerCase().includes(fl));
            if (items.length === 0) return;
            html += `<div class="block-menu-category">${cat.title}</div>`;
            items.forEach((it, idx) => {
                // 用 data-cat + data-idx 定位回原数组
                const origIdx = cat.items.indexOf(it);
                const preview = getBlockPreview(it.name);
                html += `<div class="block-menu-item" onmousedown="AFR.insertBlockByIndex('${cat.title}', ${origIdx}); return false;">
                    <div class="bi-icon">${it.icon}</div>
                    <div><div class="bi-name">${it.name}</div><div class="bi-desc">${it.desc}</div></div>
                    <div class="bi-preview ${preview.cls}">${preview.html}</div>
                </div>`;
            });
        });
        if (!html) html = '<div class="block-menu-category">No match</div>';
        menu.innerHTML = html;
    }

    function insertBlockByIndex(catTitle, idx) {
        const cat = BLOCK_CATEGORIES.find(c => c.title === catTitle);
        if (!cat || !cat.items[idx]) return;
        closeBlockMenu();
        const editor = document.getElementById('knowledgeEditor');
        editor.focus();

        // Inline/Align类：对选中文字生效，保留当前选区，直接插入
        const isInlineOp = (catTitle === 'Inline' || catTitle === 'Align');
        // 其他类：用当前光标位置插入（不依赖inlineTargetBlock，光标在哪插哪）
        // 执行插入
        cat.items[idx].insert();
        scheduleOutlineUpdate();
    }

    function closeBlockMenu() {
        const menu = document.getElementById('blockMenu');
        if (menu) menu.classList.remove('show');
    }

    function placeCaretAtEnd(el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }

    // 用execCommand insertHTML在光标处插入HTML，并在其后放一个空段落方便继续编辑
    function insertHtmlAtCursor(html) {
        const editor = document.getElementById('knowledgeEditor');
        editor.focus();
        // 插入HTML(不加额外空行，避免光标跑到空行导致输入位置错乱)
        document.execCommand('insertHTML', false, html);
        // 把光标移到刚插入内容的末尾（而非新空行）
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            range.collapse(false);  // 折叠到末尾
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }

    // 插入超链接：弹框（显示文字+URL），保存选区→确认后恢复→插入到光标处
    function insertHyperlink() {
        const editor = document.getElementById('knowledgeEditor');
        editor.focus();
        // 保存当前选区（弹框焦点会转到输入框，光标丢失，需保存恢复）
        const sel = window.getSelection();
        let savedRange = null;
        if (sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
            savedRange = sel.getRangeAt(0).cloneRange();
        }
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);z-index:100003;display:flex;align-items:center;justify-content:center';
        const box = document.createElement('div');
        box.style.cssText = 'background:var(--bg-main,#fff);border-radius:10px;padding:16px 18px;box-shadow:0 8px 32px rgba(0,0,0,0.2);width:380px;font-family:inherit';
        box.innerHTML = `
            <div style="font-size:14px;font-weight:600;margin-bottom:10px;color:var(--text-primary,#333)">🔗 Insert Hyperlink</div>
            <label style="font-size:12px;color:var(--text-secondary,#666)">Display text</label>
            <input type="text" id="linkTextInput" placeholder="e.g. AI的发展和革命" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--border-color,#ddd);border-radius:6px;font-size:14px;outline:none;margin-top:4px">
            <label style="font-size:12px;color:var(--text-secondary,#666);margin-top:10px;display:block">URL</label>
            <input type="text" id="linkUrlInput" placeholder="https://example.com" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--border-color,#ddd);border-radius:6px;font-size:14px;outline:none;margin-top:4px">
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
                <button id="linkCancel" style="padding:6px 14px;border:1px solid var(--border-color,#ddd);border-radius:6px;background:var(--bg-main,#fff);cursor:pointer;font-size:13px">Cancel</button>
                <button id="linkOk" style="padding:6px 14px;border:none;border-radius:6px;background:var(--color-primary,#1890ff);color:#fff;cursor:pointer;font-size:13px">Insert</button>
            </div>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        const textInput = box.querySelector('#linkTextInput');
        const urlInput = box.querySelector('#linkUrlInput');
        setTimeout(() => textInput.focus(), 0);
        const close = () => overlay.remove();
        const confirm = () => {
            let url = urlInput.value.trim();
            const displayText = textInput.value.trim();
            if (!url) { urlInput.focus(); return; }   // URL必填
            // 补全协议
            if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) url = 'https://' + url;
            // 显示文字=用户输入,空则用URL本身
            const text = displayText || url;
            const safeUrl = url.replace(/"/g, '&quot;');
            const safeText = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            // 恢复选区→在光标处插入
            editor.focus();
            if (savedRange) {
                sel.removeAllRanges();
                sel.addRange(savedRange);
            }
            // 结构:div块,上行显示文字,下行网址链接(Ctrl+点击或直接点跳转),右上角✕删除
            const html = `<div class="kn-link-block"><span class="kn-link-del" title="Delete">✕</span><div class="kn-link-title">${safeText}</div><a href="${safeUrl}" target="_blank" rel="noopener">${safeUrl}</a></div><p><br></p>`;
            insertHtmlAtCursor(html);
            close();
        };
        box.querySelector('#linkOk').onclick = confirm;
        box.querySelector('#linkCancel').onclick = close;
        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
        // Enter确认(在任一输入框),Tab切换
        const onKey = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); confirm(); }
            else if (e.key === 'Escape') { e.preventDefault(); close(); }
        };
        textInput.addEventListener('keydown', onKey);
        urlInput.addEventListener('keydown', onKey);
    }

    // 插入脚注：选中文字→弹框填数字+内容→文字末尾右上标[数字]+文档末尾注脚区
    function insertFootnote() {
        const editor = document.getElementById('knowledgeEditor');
        editor.focus();
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
            notify('Select some text first', 'warn');
            return;
        }
        const range = sel.getRangeAt(0);
        if (!editor.contains(range.commonAncestorContainer)) {
            notify('Select text in the note area', 'warn');
            return;
        }
        // 保存选区(弹框会失焦)
        const savedRange = range.cloneRange();
        // 自动建议下一个数字(扫描已有上标最大值+1)
        const existing = [];
        editor.querySelectorAll('sup.kn-fn-ref').forEach(s => {
            const m = s.textContent.match(/\[(\d+)\]/);
            if (m) existing.push(parseInt(m[1]));
        });
        const suggestNum = (existing.length ? Math.max(...existing) : 0) + 1;

        // 弹框
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);z-index:100003;display:flex;align-items:center;justify-content:center';
        const box = document.createElement('div');
        box.style.cssText = 'background:var(--bg-main,#fff);border-radius:10px;padding:16px 18px;box-shadow:0 8px 32px rgba(0,0,0,0.2);width:380px;font-family:inherit';
        box.innerHTML = `
            <div style="font-size:14px;font-weight:600;margin-bottom:10px;color:var(--text-primary,#333)">¹ Add Footnote</div>
            <div style="display:flex;gap:10px;margin-bottom:10px">
                <div style="flex:0 0 80px">
                    <label style="font-size:12px;color:var(--text-secondary,#666)">Number</label>
                    <input type="number" id="fnNumInput" value="${suggestNum}" min="1" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--border-color,#ddd);border-radius:6px;font-size:14px;outline:none;margin-top:4px">
                </div>
                <div style="flex:1">
                    <label style="font-size:12px;color:var(--text-secondary,#666)">Footnote content</label>
                    <input type="text" id="fnTextInput" placeholder="Note content" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--border-color,#ddd);border-radius:6px;font-size:14px;outline:none;margin-top:4px">
                </div>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end">
                <button id="fnCancel" style="padding:6px 14px;border:1px solid var(--border-color,#ddd);border-radius:6px;background:var(--bg-main,#fff);cursor:pointer;font-size:13px">Cancel</button>
                <button id="fnOk" style="padding:6px 14px;border:none;border-radius:6px;background:var(--color-primary,#1890ff);color:#fff;cursor:pointer;font-size:13px">Insert</button>
            </div>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        const numInput = box.querySelector('#fnNumInput');
        const textInput = box.querySelector('#fnTextInput');
        setTimeout(() => textInput.focus(), 0);
        const close = () => overlay.remove();
        const confirm = () => {
            const num = parseInt(numInput.value) || suggestNum;
            const text = textInput.value.trim();
            if (!text) { textInput.focus(); return; }
            // 恢复选区,选中文字末尾插入上标[数字]
            editor.focus();
            sel.removeAllRanges();
            sel.addRange(savedRange);
            const safeText = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            // 选中文字后紧跟上标标记
            savedRange.collapse(false);   // 折叠到选中文字末尾
            sel.removeAllRanges();
            sel.addRange(savedRange);
            document.execCommand('insertHTML', false, `<sup class="kn-fn-ref">[${num}]</sup>`);
            // 文档末尾注脚区(若无则创建)
            ensureFootnoteSection(editor, num, safeText);
            close();
        };
        box.querySelector('#fnOk').onclick = confirm;
        box.querySelector('#fnCancel').onclick = close;
        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
        const onKey = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); confirm(); }
            else if (e.key === 'Escape') { e.preventDefault(); close(); }
        };
        numInput.addEventListener('keydown', onKey);
        textInput.addEventListener('keydown', onKey);
    }

    // 确保文档末尾有注脚区,并添加一条注脚(去重:同数字已存在则更新)
    function ensureFootnoteSection(editor, num, text) {
        let section = editor.querySelector('.kn-footnote-section');
        if (!section) {
            section = document.createElement('div');
            section.className = 'kn-footnote-section';
            const hr = document.createElement('hr');
            hr.className = 'kn-footnote-hr';
            const title = document.createElement('div');
            title.className = 'kn-footnote-title';
            title.textContent = 'Footnotes';
            editor.appendChild(hr);
            editor.appendChild(title);
            editor.appendChild(section);
        }
        // 同数字已存在→更新;否则添加
        const existing = section.querySelector(`.kn-fn-item[data-num="${num}"]`);
        if (existing) {
            existing.querySelector('.kn-fn-item-text').textContent = text;
        } else {
            const item = document.createElement('div');
            item.className = 'kn-fn-item';
            item.dataset.num = num;
            item.innerHTML = `<span class="kn-fn-item-num">[${num}]</span> <span class="kn-fn-item-text">${text}</span>`;
            section.appendChild(item);
        }
        saveKnowledge(true);
    }

    // ===== +号：跟随光标（caret），光标在哪行+号就在那行，永不消失 =====
    let lastMouseX = 0, lastMouseY = 0;
    let lineBtnEl = null;   // +号DOM元素（放wrapper里，不被editor.innerHTML冲掉）
    function setupInlineAddHover() {
        const wrapper = document.getElementById('knowledgeEditorWrapper');
        const editor = document.getElementById('knowledgeEditor');
        if (!wrapper || !editor) return;
        // 创建+号（放wrapper里，不在editor内，不会被innerHTML冲掉）
        if (!lineBtnEl) {
            lineBtnEl = document.createElement('div');
            lineBtnEl.className = 'line-add-btn';
            lineBtnEl.textContent = '+';
            lineBtnEl.title = '插入块';
            lineBtnEl.style.display = 'none';
            // mousedown弹菜单,click也拦截防全局监听关闭菜单(菜单闪退根因)
            lineBtnEl.onmousedown = (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.__plusJustClicked = Date.now();   // 标记:刚点+号,全局click别关菜单
                showBlockMenuAt(e.clientX, e.clientY);
            };
            lineBtnEl.onclick = (e) => { e.preventDefault(); e.stopPropagation(); };
            wrapper.appendChild(lineBtnEl);
        }
        // 光标位置变化 → +号跟随到光标所在行（用click/keyup/cursor活动触发，不靠selectionchange）
        const updateLineBtn = () => {
            const sel = window.getSelection();
            if (!sel || !sel.anchorNode || !editor.contains(sel.anchorNode)) {
                lineBtnEl.style.display = 'none';
                return;
            }
            let block = findLineBlockFromEl(editor, sel.anchorNode);
            // 光标落在editor本身(点击了编辑器空白/段落间空行)→用anchorOffset取对应子块
            if (!block && sel.anchorNode === editor && sel.anchorOffset < editor.children.length) {
                block = editor.children[sel.anchorOffset] || editor.lastElementChild;
            }
            if (!block) { lineBtnEl.style.display = 'none'; return; }
            inlineTargetBlock = block;
            // 取光标真实位置:用anchorNode+anchorOffset构造精确range
            // (sel.getRangeAt().getBoundingClientRect()在元素节点/空行时返回0或整个元素范围,不可靠)
            let caretRect = null;
            try {
                const node = sel.anchorNode;
                const offset = sel.anchorOffset;
                const probe = document.createRange();
                if (node.nodeType === 3) {
                    // 文本节点:直接在offset处取位置
                    probe.setStart(node, Math.min(offset, node.length));
                    probe.collapse(true);
                } else if (node.nodeType === 1) {
                    // 元素节点(SPAN/P):在offset位置的子节点前取位置
                    if (node.childNodes[offset]) {
                        probe.setStartBefore(node.childNodes[offset]);
                    } else if (node.lastChild) {
                        probe.setStartAfter(node.lastChild);
                    } else {
                        probe.setStart(node, 0);
                    }
                    probe.collapse(true);
                }
                caretRect = probe.getBoundingClientRect();
                // probe返回全0(元素节点边界range)→优先用anchorNode自身矩形(元素节点),再退回block
                if (caretRect.top === 0 && caretRect.left === 0 && caretRect.height === 0) {
                    const node2 = sel.anchorNode;
                    if (node2 && node2.nodeType === 1 && node2.getBoundingClientRect) {
                        const nr = node2.getBoundingClientRect();
                        if (nr.top !== 0 || nr.height !== 0) { caretRect = nr; }
                        else caretRect = block.getBoundingClientRect();
                    } else {
                        caretRect = block.getBoundingClientRect();
                    }
                }
            } catch (e) {
                caretRect = block.getBoundingClientRect();
            }
            const editorRect = editor.getBoundingClientRect();
            // 光标在可视区外(滚动后光标行不可见)→隐藏+号,避免显示在错误位置
            if (caretRect.top < editorRect.top - 30 || caretRect.top > editorRect.bottom - 5) {
                lineBtnEl.style.display = 'none';
                return;
            }
            // 用transform定位(不受top属性冲突影响,更稳)
            lineBtnEl.style.top = '0px';
            lineBtnEl.style.left = (editorRect.left - 36) + 'px';
            lineBtnEl.style.transform = 'translateY(' + (caretRect.top + 2) + 'px)';
            lineBtnEl.style.display = 'flex';
        };
        // mouseup延迟触发(点击行首时选区需几ms才建立,多次重试确保选区就绪)
        const retryUpdate = () => { setTimeout(updateLineBtn, 20); setTimeout(updateLineBtn, 80); };
        editor.addEventListener('mouseup', retryUpdate);
        editor.addEventListener('click', retryUpdate);
        // 链接跳转:点击.kn-link-block里的a→Ctrl+点击或直接点都打开新标签(contentEditable默认点链接是编辑,需拦截)
        // 删除按钮:点.kn-link-del→删除整个链接卡片块
        editor.addEventListener('click', (e) => {
            const del = e.target.closest('.kn-link-del');
            if (del) {
                e.preventDefault();
                e.stopPropagation();
                const block = del.closest('.kn-link-block');
                if (block) block.remove();
                saveKnowledge(true);
                return;
            }
            const a = e.target.closest('.kn-link-block a');
            if (a && a.href) {
                e.preventDefault();
                e.stopPropagation();
                window.open(a.href, '_blank', 'noopener');
            }
        });
        editor.addEventListener('keyup', updateLineBtn);
        editor.addEventListener('focus', updateLineBtn);
        // selectionchange:光标/选区变化即更新(不依赖activeElement,选区在editor内即可)
        document.addEventListener('selectionchange', () => {
            const sel = window.getSelection();
            if (sel && sel.anchorNode && editor.contains(sel.anchorNode)) {
                setTimeout(updateLineBtn, 10);
            }
        });
        // +号用fixed定位,滚动时与内容错位→滚动时隐藏,停止滚动300ms后重新定位
        let scrollTimer = null;
        wrapper.addEventListener('scroll', () => {
            lineBtnEl.style.display = 'none';
            if (scrollTimer) clearTimeout(scrollTimer);
            scrollTimer = setTimeout(updateLineBtn, 300);
        });
        document.addEventListener('mousemove', (e) => { lastMouseX = e.clientX; lastMouseY = e.clientY; });
    }

    function findLineBlockFromEl(editor, el) {
        if (!el || !editor.contains(el) || el === editor) return null;
        // 文本节点(nodeType=3)没有closest，取其父元素
        if (el.nodeType === 3) el = el.parentElement;
        if (!el || !editor.contains(el) || el === editor) return null;
        const sem = el.closest('p, h2, h3, h4, h5, h6, li, pre, blockquote, hr, table, .callout, .todo-block, details, summary');
        if (sem && editor.contains(sem) && sem !== editor) return sem;
        let n = el;
        while (n && n.parentElement && n.parentElement !== editor) n = n.parentElement;
        return (n && n !== editor && n.parentElement === editor) ? n : null;
    }

    function openInlineBlockMenu(e) {
        if (e) { e.stopPropagation(); e.preventDefault(); }
        showBlockMenuAt(e ? e.clientX : 200, e ? e.clientY : 200);
    }

    // ===== 页面标题保存 =====
    // 一键清除编辑器全部内容
    function clearKnowledgeEditor() {
        if (!confirm('Clear all content in this note?')) return;
        const editor = document.getElementById('knowledgeEditor');
        if (!editor) return;
        editor.innerHTML = '<p><br></p>';
        editor.focus();
        saveKnowledge(true);
        notify('Content cleared', 'success');
    }

    function savePageTitle() {
        const titleEl = document.getElementById('pageTitleArea');
        if (!titleEl) return;
        const hw = getCurrentHomework();
        if (!hw) return;
        if (!hw.knowledgeMeta) hw.knowledgeMeta = {};
        if (!hw.knowledgeMeta[state.currentClass]) hw.knowledgeMeta[state.currentClass] = {};
        hw.knowledgeMeta[state.currentClass].title = titleEl.textContent.trim();
        saveHomework(hw.id);
    }

    function pageTitleKeydown(e) {
        if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    }

    function insertFormatBlock(tag) {
        document.execCommand('formatBlock', false, '<' + tag + '>');
        document.getElementById('knowledgeEditor').focus();
    }

    function insertTodo() {
        insertHtmlAtCursor('<div class="todo-block"><input type="checkbox"><span>To-do item</span></div>');
    }

    // 插入待办块（done=true为已完成），光标定位到checkbox后的span内，直接打字
    function insertTodoBlock(done) {
        const editor = document.getElementById('knowledgeEditor');
        editor.focus();
        const cls = done ? 'todo-block done' : 'todo-block';
        // 直接DOM创建（execCommand会吞span），确保结构完整
        const div = document.createElement('div');
        div.className = cls;
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        if (done) cb.checked = true;
        const span = document.createElement('span');
        span.innerHTML = '<br>';
        div.appendChild(cb);
        div.appendChild(span);
        // 在当前光标处插入(div)
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            range.insertNode(div);
            // 光标定位到span内(checkbox后)
            const newRange = document.createRange();
            newRange.selectNodeContents(span);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
        }
    }

    // 插入普通列表(ul/ol)，DOM创建保证结构完整，光标精准进li内
    function insertPlainList(tag) {
        const editor = document.getElementById('knowledgeEditor');
        editor.focus();
        const list = document.createElement(tag);  // ul 或 ol
        const li = document.createElement('li');
        li.innerHTML = '<br>';
        list.appendChild(li);
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            range.insertNode(list);
            // 光标进li内
            const r2 = document.createRange();
            r2.selectNodeContents(li);
            r2.collapse(false);
            sel.removeAllRanges();
            sel.addRange(r2);
        }
    }

    // 插入符号列表（符号字符直接放li前，主色，回车自动延续符号）
    function insertSymbolList(symbol) {
        const editor = document.getElementById('knowledgeEditor');
        editor.focus();
        const ul = document.createElement('ul');
        ul.className = 'kn-sym-list';
        ul.dataset.symbol = symbol;
        const li = makeSymbolLi(symbol);
        ul.appendChild(li);
        // 在光标处插入ul
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            range.insertNode(ul);
            // 光标定位到li的br后（符号后面，直接打字）
            const r2 = document.createRange();
            r2.setStartAfter(li.querySelector('br') || li.lastChild);
            r2.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r2);
        }
        // 回车延续：由全局监听处理(避免重复注册多个监听器)
    }

    // 全局符号列表回车延续（只注册一次，用光标所在ul的data-symbol决定符号）
    let symbolListEnterInited = false;
    function initSymbolListEnter() {
        if (symbolListEnterInited) return;
        symbolListEnterInited = true;
        const editor = document.getElementById('knowledgeEditor');
        if (!editor) return;
        editor.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            const sel = window.getSelection();
            if (!sel || !sel.anchorNode) return;
            // 找光标所在的kn-sym-list
            let node = sel.anchorNode;
            let symUl = null;
            let currentLi = null;
            while (node && node !== editor) {
                if (node.classList && node.classList.contains('kn-sym-list')) { symUl = node; break; }
                if (node.tagName === 'LI' && node.parentElement && node.parentElement.classList.contains('kn-sym-list')) {
                    currentLi = node;
                }
                node = node.parentNode;
            }
            if (!symUl) return;  // 不在符号列表内，不管
            e.preventDefault();
            const symbol = symUl.dataset.symbol || '•';
            const newLi = makeSymbolLi(symbol);
            // 插在当前li后（而非ul末尾），避免跳行
            if (currentLi && currentLi.nextElementSibling) {
                symUl.insertBefore(newLi, currentLi.nextElementSibling);
            } else {
                symUl.appendChild(newLi);
            }
            const r = document.createRange();
            r.setStartAfter(newLi.querySelector('br') || newLi.lastChild);
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);
        });
    }
    function makeSymbolLi(symbol) {
        const li = document.createElement('li');
        li.style.listStyle = 'none';
        const sp = document.createElement('span');
        sp.className = 'kn-sym';
        sp.textContent = symbol;
        sp.style.color = 'var(--color-primary, #1890ff)';
        sp.style.fontWeight = '700';
        sp.style.marginRight = '1.5em';   // 符号后空开1.5个字符
        li.appendChild(sp);
        const br = document.createElement('br');
        li.appendChild(br);
        return li;
    }

    // 插入折叠列表（默认展开，占位文字输入时自动消失，标题字号>内容）
    function insertCollapsible() {
        const editor = document.getElementById('knowledgeEditor');
        editor.focus();
        const det = document.createElement('details');
        det.open = true;
        const sum = document.createElement('summary');
        sum.contentEditable = 'true';
        sum.dataset.placeholder = '1';  // 标记还有占位文字
        sum.innerHTML = '<span style="color:var(--text-tertiary);font-style:italic">click to add title</span>';
        const content = document.createElement('p');
        content.dataset.placeholder = '1';
        content.innerHTML = '<span style="color:var(--text-tertiary);font-style:italic">click to add text</span>';
        det.appendChild(sum);
        det.appendChild(content);
        // summary：点击箭头区域(左侧30px)切换展开/折叠，点击文字区域编辑
        sum.addEventListener('click', (e) => {
            const sumRect = sum.getBoundingClientRect();
            if (e.clientX < sumRect.left + 30) {
                e.preventDefault();
                det.open = !det.open;
                return;
            }
            // 点击文字区域：如果有占位文字，清除它
            if (sum.dataset.placeholder === '1') {
                e.preventDefault();
                sum.dataset.placeholder = '0';
                sum.innerHTML = '<br>';
                const range = document.createRange();
                range.selectNodeContents(sum);
                range.collapse(true);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });
        // 内容区：点击时清除占位文字
        content.addEventListener('click', (e) => {
            if (content.dataset.placeholder === '1') {
                e.preventDefault();
                content.dataset.placeholder = '0';
                content.innerHTML = '<br>';
                const range = document.createRange();
                range.selectNodeContents(content);
                range.collapse(true);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });
        // summary右侧加✕删除按钮
        const delBtn = document.createElement('span');
        delBtn.textContent = '✕';
        delBtn.style.cssText = 'margin-left:12px;color:var(--text-tertiary);cursor:pointer;font-size:14px;font-weight:400;opacity:0.4';
        delBtn.title = '删除';
        delBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            det.remove();
            scheduleAutoSave();
        });
        delBtn.addEventListener('mouseenter', () => { delBtn.style.opacity = '1'; delBtn.style.color = 'var(--color-danger)'; });
        delBtn.addEventListener('mouseleave', () => { delBtn.style.opacity = '0.4'; delBtn.style.color = 'var(--text-tertiary)'; });
        sum.appendChild(delBtn);
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            sel.getRangeAt(0).insertNode(det);
            // 光标进内容区（不进summary）
            const r = document.createRange();
            r.selectNodeContents(content);
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);
        }
    }

    function insertCodeBlock() {
        insertHtmlAtCursor('<pre><code>// code here</code></pre>');
    }

    function insertCallout(type, emoji) {
        const labels = { info: 'Note', tip: 'Tip', warn: 'Warning', danger: 'Important' };
        insertHtmlAtCursor(`<div class="callout callout-${type}"><span class="ci">${emoji}</span><div>${labels[type] || 'Note'}: type here...</div></div>`);
    }

    // ===== 评论/批注：选中文字→输入→高亮+💬，点击弹气泡（编辑/删除）=====
    let commentBubble = null;
    let _commentSeq = 0;

    // 生成唯一评论ID
    function genCommentId() {
        _commentSeq++;
        return 'c' + Date.now().toString(36) + _commentSeq;
    }

    // 获取当前作业+班级的评论列表
    function getCommentsArr() {
        const hw = getCurrentHomework();
        if (!hw) return null;
        const modeObj = ensureKnowledgeModeObj(hw, state.currentClass);
        if (!modeObj.comments) modeObj.comments = {};
        return modeObj.comments;   // {cid: text}
    }

    // 插入评论：选中文字→弹输入框→确认后包裹
    function insertComment() {
        const editor = document.getElementById('knowledgeEditor');
        editor.focus();
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
            notify('Select some text first', 'warn');
            return;
        }
        const range = sel.getRangeAt(0);
        const selectedText = range.toString();
        if (!selectedText.trim()) {
            notify('Select some text first', 'warn');
            return;
        }
        // 弹输入框
        showCommentInputDialog('', (text) => {
            if (!text || !text.trim()) return;   // 空评论取消
            const cid = genCommentId();
            // 存评论内容
            const comments = getCommentsArr();
            if (!comments) return;
            comments[cid] = text.trim();
            // 包裹选中文字为.kn-comment
            const span = document.createElement('span');
            span.className = 'kn-comment';
            span.dataset.cid = cid;
            span.title = 'Click to view comment';
            try {
                range.surroundContents(span);
            } catch (e) {
                // surroundContents对跨节点选区会抛错，降级用extract+insert
                const frag = range.extractContents();
                span.appendChild(frag);
                range.insertNode(span);
            }
            // 绑定点击
            span.addEventListener('click', (ev) => {
                ev.stopPropagation();
                openCommentBubble(span, cid);
            });
            saveKnowledge(true);
            notify('Comment added', 'success');
        });
    }

    // 评论输入对话框（新建用）
    function showCommentInputDialog(initial, onConfirm) {
        closeCommentBubble();
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);z-index:100003;display:flex;align-items:center;justify-content:center';
        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:var(--bg-main,#fff);border-radius:10px;padding:18px 20px;box-shadow:0 8px 32px rgba(0,0,0,0.2);width:320px;font-family:inherit';
        dialog.innerHTML = `
            <div style="font-size:14px;font-weight:600;margin-bottom:10px;color:var(--text-primary,#333)">💬 Add Comment</div>
            <textarea id="commentInput" placeholder="Type your comment..."></textarea>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
                <button id="commentCancel" class="kcb-btn" style="padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;border:1px solid var(--border-color,#ddd);background:var(--bg-main,#fff)">Cancel</button>
                <button id="commentOk" class="kcb-btn primary" style="padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;border:none;background:var(--color-primary,#1890ff);color:#fff">Add</button>
            </div>
        `;
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        const ta = dialog.querySelector('#commentInput');
        ta.value = initial;
        setTimeout(() => { ta.focus(); }, 0);
        const close = () => overlay.remove();
        dialog.querySelector('#commentCancel').onclick = close;
        overlay.onclick = (e) => { if (e.target === overlay) close(); };
        const confirm = () => { const v = ta.value; close(); onConfirm(v); };
        dialog.querySelector('#commentOk').onclick = confirm;
        ta.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); confirm(); }
            else if (e.key === 'Escape') { e.preventDefault(); close(); }
        });
    }

    // 打开评论气泡（点击高亮文字时）
    function openCommentBubble(span, cid) {
        closeCommentBubble();
        const comments = getCommentsArr();
        const text = (comments && comments[cid]) || '';
        const bubble = document.createElement('div');
        bubble.className = 'kn-comment-bubble';
        bubble.innerHTML = `
            <div class="kcb-head"><span>💬 Comment</span><span class="kcb-close" style="cursor:pointer;font-size:14px">✕</span></div>
            <div class="kcb-body"></div>
            <div class="kcb-actions">
                <button class="kcb-btn kcb-edit">✏️ Edit</button>
                <button class="kcb-btn danger kcb-del">🗑 Delete</button>
            </div>
        `;
        bubble.querySelector('.kcb-body').textContent = text;
        document.body.appendChild(bubble);
        commentBubble = bubble;
        // 定位到高亮文字附近
        const r = span.getBoundingClientRect();
        let left = r.left, top = r.bottom + 6;
        bubble.style.visibility = 'hidden';
        bubble.style.display = 'block';
        const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
        if (left + bw > window.innerWidth - 8) left = window.innerWidth - bw - 8;
        if (top + bh > window.innerHeight - 8) top = Math.max(8, r.top - bh - 6);
        bubble.style.left = left + 'px';
        bubble.style.top = top + 'px';
        bubble.style.visibility = '';
        // 绑定按钮
        bubble.querySelector('.kcb-close').onclick = closeCommentBubble;
        bubble.querySelector('.kcb-edit').onclick = () => {
            showCommentInputDialog(text, (newText) => {
                if (!newText || !newText.trim()) return;
                if (comments) {
                    comments[cid] = newText.trim();
                    saveKnowledge(true);
                }
                closeCommentBubble();
                notify('Comment updated', 'success');
            });
        };
        bubble.querySelector('.kcb-del').onclick = () => {
            if (!confirm('Delete this comment?')) return;
            // 删除评论数据
            if (comments) delete comments[cid];
            // 去掉高亮包裹（保留文字）
            unwrapComment(span);
            saveKnowledge(true);
            closeCommentBubble();
            notify('Comment deleted', 'success');
        };
    }

    function closeCommentBubble() {
        if (commentBubble) { commentBubble.remove(); commentBubble = null; }
    }

    // 去掉评论高亮包裹，保留内部文字
    function unwrapComment(span) {
        const parent = span.parentNode;
        while (span.firstChild) parent.insertBefore(span.firstChild, span);
        parent.removeChild(span);
        parent.normalize();   // 合并相邻文本节点
    }

    // 渲染后给所有.kn-comment绑定点击（刷新/切换作业后恢复交互）
    function bindComments() {
        const editor = document.getElementById('knowledgeEditor');
        if (!editor) return;
        editor.querySelectorAll('.kn-comment').forEach(span => {
            if (span.dataset.bound === '1') return;
            span.dataset.bound = '1';
            span.addEventListener('click', (ev) => {
                ev.stopPropagation();
                openCommentBubble(span, span.dataset.cid);
            });
        });
    }

    function insertSimpleTable() {
        const html = '<table class="block-table"><tr><td>Col 1</td><td>Col 2</td></tr><tr><td></td><td></td></tr></table>';
        document.execCommand('insertHTML', false, html);
        document.getElementById('knowledgeEditor').focus();
    }

    // ===== 表格交互：悬停显示右侧/底部✛按钮，点击加列/加行（覆盖层方案，不污染表格内容）=====
    let tableOverlay = null;        // 覆盖层DOM
    let tableOverlayTarget = null;  // 当前关联的表格
    let tableToolsInited = false;
    function setupTableTools() {
        if (tableToolsInited) return;
        tableToolsInited = true;
        const editor = document.getElementById('knowledgeEditor');
        if (!editor) return;

        // 创建覆盖层（body子元素，含两个✛按钮）
        tableOverlay = document.createElement('div');
        tableOverlay.className = 'table-tool-overlay';
        tableOverlay.style.display = 'none';
        const colBtn = document.createElement('div');
        colBtn.className = 'tt-btn';
        colBtn.title = 'Add column';
        colBtn.textContent = '✛';
        const rowBtn = document.createElement('div');
        rowBtn.className = 'tt-btn';
        rowBtn.title = 'Add row';
        rowBtn.textContent = '✛';
        // 整表宽度拖拽手柄（表格右边框）
        const widthHandle = document.createElement('div');
        widthHandle.className = 'tt-width-handle';
        widthHandle.title = 'Drag to resize table width';
        widthHandle.textContent = '⇔';
        tableOverlay.appendChild(colBtn);
        tableOverlay.appendChild(rowBtn);
        tableOverlay.appendChild(widthHandle);
        document.body.appendChild(tableOverlay);

        // 鼠标悬停表格 → 显示覆盖层（延时隐藏机制防闪烁）
        let tableHideTimer = null;
        const cancelTableHide = () => { if (tableHideTimer) { clearTimeout(tableHideTimer); tableHideTimer = null; } };
        const scheduleTableHide = () => {
            cancelTableHide();
            tableHideTimer = setTimeout(hideTableOverlay, 180);   // 延时隐藏，给鼠标移到按钮留时间
        };

        // 表格悬停：显示
        editor.addEventListener('mouseover', (e) => {
            const td = e.target.closest('.block-table td');
            if (!td) return;
            const table = td.closest('.block-table');
            if (!table) return;
            cancelTableHide();   // 在表格内，取消任何隐藏计划
            tableOverlayTarget = table;
            positionTableOverlay(table);
            tableOverlay.style.display = 'block';
        });
        // 鼠标离开表格单元格 → 计划隐藏（不立即，防移向按钮时闪烁）
        editor.addEventListener('mouseout', (e) => {
            const td = e.target.closest('.block-table td');
            if (!td) return;
            scheduleTableHide();
        });
        // 鼠标进入覆盖层（按钮）→ 取消隐藏，保持显示
        tableOverlay.addEventListener('mouseenter', cancelTableHide);
        // 鼠标离开覆盖层 → 计划隐藏
        tableOverlay.addEventListener('mouseleave', scheduleTableHide);

        // 点击按钮：加列/加行
        colBtn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
        colBtn.addEventListener('mouseenter', cancelTableHide);
        colBtn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            if (tableOverlayTarget) addTableColumn(tableOverlayTarget);
        });
        rowBtn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
        rowBtn.addEventListener('mouseenter', cancelTableHide);
        rowBtn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            if (tableOverlayTarget) addTableRow(tableOverlayTarget);
        });

        // ===== 整表宽度拖拽（右边框手柄）=====
        let tableWidthDragging = false;
        let tableWidthStartX = 0;
        let tableWidthStartW = 0;
        let tableWidthTarget = null;
        widthHandle.addEventListener('mousedown', (e) => {
            e.preventDefault(); e.stopPropagation();
            if (!tableOverlayTarget) return;
            tableWidthDragging = true;
            tableWidthStartX = e.clientX;
            tableWidthStartW = tableOverlayTarget.offsetWidth;
            tableWidthTarget = tableOverlayTarget;
            widthHandle.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });
        document.addEventListener('mousemove', (e) => {
            if (!tableWidthDragging || !tableWidthTarget) return;
            const delta = e.clientX - tableWidthStartX;
            // 最小 100px，最大不超过编辑器宽度
            const editor = document.getElementById('knowledgeEditor');
            const maxW = editor ? editor.clientWidth - 40 : 1000;
            const newW = Math.max(100, Math.min(maxW, tableWidthStartW + delta));
            tableWidthTarget.style.width = newW + 'px';
            tableWidthTarget.style.maxWidth = 'none';   // 解除max-width限制
            positionTableOverlay(tableWidthTarget);      // 手柄跟随
        });
        document.addEventListener('mouseup', () => {
            if (!tableWidthDragging) return;
            tableWidthDragging = false;
            tableWidthTarget = null;
            widthHandle.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            saveKnowledge();   // 存盘（保留宽度）
        });
        widthHandle.addEventListener('mouseenter', cancelTableHide);   // 手柄上不隐藏覆盖层
        widthHandle.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });

        // 滚动/resize 同步覆盖层位置（表格位置变了按钮要跟）
        editor.addEventListener('scroll', () => { if (tableOverlay.style.display !== 'none') positionTableOverlay(tableOverlayTarget); });
        window.addEventListener('scroll', () => { if (tableOverlay.style.display !== 'none') positionTableOverlay(tableOverlayTarget); }, true);
    }

    // 定位覆盖层：右侧按钮垂直居中于表格右边缘，底部按钮水平居中于表格底边缘
    function positionTableOverlay(table) {
        if (!table || !tableOverlay) return;
        const r = table.getBoundingClientRect();
        // 覆盖层覆盖表格整个矩形区域，按钮用绝对定位贴在右/底边
        tableOverlay.style.left = r.left + 'px';
        tableOverlay.style.top = r.top + 'px';
        tableOverlay.style.width = r.width + 'px';
        tableOverlay.style.height = r.height + 'px';
        const colBtn = tableOverlay.children[0];   // 右侧按钮（加列）
        const rowBtn = tableOverlay.children[1];   // 底部按钮（加行）
        // 右侧按钮：贴在表格右边缘外，垂直居中
        colBtn.style.left = (r.width - 11) + 'px';   // 圆心对齐右边缘
        colBtn.style.top = (r.height / 2 - 11) + 'px';
        // 底部按钮：贴在表格底边缘外，水平居中
        rowBtn.style.left = (r.width / 2 - 11) + 'px';
        rowBtn.style.top = (r.height - 11) + 'px';
        // 宽度手柄：贴在表格右边框（右上角），竖条状
        const widthHandle = tableOverlay.children[2];
        if (widthHandle) {
            widthHandle.style.left = (r.width - 4) + 'px';   // 紧贴右边缘
            widthHandle.style.top = '0px';
            widthHandle.style.height = r.height + 'px';
        }
    }

    function hideTableOverlay() {
        if (tableOverlay) tableOverlay.style.display = 'none';
        tableOverlayTarget = null;
    }

    // 给表格加一列（每行末尾追加空td）
    function addTableColumn(table) {
        table.querySelectorAll('tr').forEach(tr => {
            const td = document.createElement('td');
            td.innerHTML = '<br>';
            tr.appendChild(td);
        });
        positionTableOverlay(table);
        saveKnowledge(true);
    }

    // 给表格加一行（按首行列数生成空td）
    function addTableRow(table) {
        const firstRow = table.querySelector('tr');
        const cols = firstRow ? firstRow.children.length : 2;
        const tr = document.createElement('tr');
        for (let i = 0; i < cols; i++) {
            const td = document.createElement('td');
            td.innerHTML = '<br>';
            tr.appendChild(td);
        }
        table.appendChild(tr);
        positionTableOverlay(table);
        saveKnowledge(true);
    }

    // ===== 表格右键菜单（需求2）=====
    // ===== 单元格选中色块：光标/选区在表格内时，给相关td加.cell-selected（主色块填满）=====
    let cellSelInited = false;
    let manualSelection = false;   // 手动选整列/行标志，期间跳过自动更新
    function setupTableCellSelection() {
        if (cellSelInited) return;
        cellSelInited = true;
        const editor = document.getElementById('knowledgeEditor');
        if (!editor) return;
        // selectionchange：选区变化时更新高亮（防重入）。手动选中期间跳过
        let updating = false;
        document.addEventListener('selectionchange', () => {
            if (updating || manualSelection) return;
            updating = true;
            requestAnimationFrame(() => {
                updating = false;
                updateCellSelection();
            });
        });
        // 点击表格内单元格→退出手动选中模式，恢复自动跟随
        // 点击工具栏/调色盘/菜单等UI→保留手动选中（方便Select后去调色盘设色）
        // 点击编辑区其他内容/页面空白→清除选中
        document.addEventListener('mousedown', (e) => {
            if (e.target.closest('.block-table')) {
                manualSelection = false;   // 重新点格子，恢复自动模式
            } else if (e.target.closest('.knowledge-toolbar') ||
                       e.target.closest('.dropdown-menu') ||
                       e.target.closest('.table-ctx-menu') ||
                       e.target.closest('.toolbar-btn')) {
                // 点击工具栏/调色盘/菜单，保留手动选中
            } else {
                manualSelection = false;
                clearCellSelection();
            }
        });
    }

    function updateCellSelection() {
        if (manualSelection) return;   // 手动选中期间不自动更新
        const sel = window.getSelection();
        clearCellSelection();
        if (!sel || sel.rangeCount === 0) return;
        const anchor = sel.anchorNode;
        if (!anchor) return;
        // anchor不在表格内→不高亮
        const anchorTd = anchor.nodeType === 3 ? anchor.parentElement : anchor;
        const inTable = anchorTd && anchorTd.closest && anchorTd.closest('.block-table');
        if (!inTable) return;
        // 单光标(无拖选)→只高亮anchor所在td
        if (sel.isCollapsed) {
            const td = anchorTd.closest('.block-table td');
            if (td) td.classList.add('cell-selected');
            return;
        }
        // 有选区→高亮选区覆盖的所有td
        const range = sel.getRangeAt(0);
        const tables = document.querySelectorAll('.block-table');
        tables.forEach(table => {
            table.querySelectorAll('td').forEach(td => {
                if (range.intersectsNode(td)) td.classList.add('cell-selected');
            });
        });
    }

    function clearCellSelection() {
        document.querySelectorAll('.block-table td.cell-selected').forEach(td => td.classList.remove('cell-selected'));
    }

    // ===== 列宽调节（需求3）：悬停竖线→拖动改列宽 =====
    let colResizeInited = false;
    let colResizeGuide = null;   // 高亮竖线覆盖层
    let resizeColTd = null;      // 当前要调宽的列的代表td（首行对应列）
    let resizeTable = null;
    let resizeStartX = 0;
    let resizeStartW = 0;
    function setupTableColumnResize() {
        if (colResizeInited) return;
        colResizeInited = true;
        const editor = document.getElementById('knowledgeEditor');
        if (!editor) return;

        // 创建高亮竖线
        colResizeGuide = document.createElement('div');
        colResizeGuide.className = 'col-resize-guide';
        document.body.appendChild(colResizeGuide);

        const EDGE = 6;   // 离td右边缘多少px内算"悬停竖线"
        let isColDragging = false;   // 独立的"正在拖动"标志（区别于悬停）

        // mousemove：检测鼠标是否在某列的右边缘（即竖线）附近
        editor.addEventListener('mousemove', (e) => {
            if (isColDragging) return;   // 正在拖动，document级监听接管，不重复检测
            const td = e.target.closest('.block-table td');
            if (!td) { clearHover(); return; }
            const table = td.closest('.block-table');
            // 最后一列的右边缘=表格右边界，不调（调它无意义）
            const tr = td.parentElement;
            const isLastCol = td === tr.lastElementChild;
            if (isLastCol) { clearHover(); return; }
            const r = td.getBoundingClientRect();
            // 鼠标靠近td右边缘 → 显示高亮竖线 + col-resize光标
            if (Math.abs(e.clientX - r.right) < EDGE) {
                resizeColTd = td;
                resizeTable = table;
                showColGuide(r);
                table.style.cursor = 'col-resize';
            } else {
                clearHover();
            }
        });
        // 清除悬停状态（隐藏竖线+光标+resizeColTd），不影响拖动
        function clearHover() {
            resizeColTd = null;
            if (resizeTable) resizeTable.style.cursor = '';
            hideColGuide();
        }
        editor.addEventListener('mouseleave', () => { if (!isColDragging) clearHover(); });

        // mousedown：开始拖动
        editor.addEventListener('mousedown', (e) => {
            if (!resizeColTd) return;
            e.preventDefault();   // 阻止文本选区
            isColDragging = true;
            resizeStartX = e.clientX;
            resizeStartW = resizeColTd.getBoundingClientRect().width;
            resizeTable.classList.add('col-resizing');
            document.addEventListener('mousemove', onColDrag);
            document.addEventListener('mouseup', onColDragEnd);
        });
        function onColDrag(e) {
            if (!resizeColTd) return;
            const delta = e.clientX - resizeStartX;
            let newW = resizeStartW + delta;
            if (newW < 40) newW = 40;   // 最小列宽40px
            // 设该列所有td的width（用colIdx定位）
            const colIdx = Array.from(resizeColTd.parentElement.children).indexOf(resizeColTd);
            resizeTable.querySelectorAll('tr').forEach(tr => {
                if (tr.children[colIdx]) tr.children[colIdx].style.width = newW + 'px';
            });
            // 竖线跟随
            const r = resizeColTd.getBoundingClientRect();
            showColGuide(r);
        }
        function onColDragEnd() {
            document.removeEventListener('mousemove', onColDrag);
            document.removeEventListener('mouseup', onColDragEnd);
            isColDragging = false;   // 关键：清拖动标志，mousemove恢复悬停检测
            if (resizeTable) resizeTable.classList.remove('col-resizing');
            // 拖动结束立即清除悬停高亮（鼠标此时通常还在竖线上，需主动清）
            clearHover();
            saveKnowledge(true);
        }
    }

    function showColGuide(tdRect) {
        if (!colResizeGuide) return;
        // 竖线覆盖整行高度（取表格高度）
        const tableRect = resizeTable ? resizeTable.getBoundingClientRect() : tdRect;
        colResizeGuide.style.display = 'block';
        colResizeGuide.style.left = (tdRect.right - 1) + 'px';
        colResizeGuide.style.top = tableRect.top + 'px';
        colResizeGuide.style.height = tableRect.height + 'px';
    }
    function hideColGuide() {
        if (colResizeGuide) colResizeGuide.style.display = 'none';
    }

    // ===== 行高调节：悬停横线（行底边）→拖动改行高（与列宽对称）=====
    let rowResizeInited = false;
    let rowResizeGuide = null;    // 高亮横线覆盖层
    let resizeRowTr = null;       // 当前要调高的行(tr)
    let resizeRowTable = null;
    let rowIsDragging = false;
    let rowStartY = 0;
    let rowStartH = 0;
    function setupTableRowResize() {
        if (rowResizeInited) return;
        rowResizeInited = true;
        const editor = document.getElementById('knowledgeEditor');
        if (!editor) return;

        rowResizeGuide = document.createElement('div');
        rowResizeGuide.className = 'row-resize-guide';
        document.body.appendChild(rowResizeGuide);

        const EDGE = 6;   // 离td底边缘多少px内算"悬停横线"

        editor.addEventListener('mousemove', (e) => {
            if (rowIsDragging) return;
            const td = e.target.closest('.block-table td');
            if (!td) { clearRowHover(); return; }
            const table = td.closest('.block-table');
            const tr = td.parentElement;
            const rows = table.querySelectorAll('tr');
            const isLastRow = tr === rows[rows.length - 1];
            if (isLastRow) { clearRowHover(); return; }   // 最后一行底边=表格边界，不调
            const r = td.getBoundingClientRect();
            // 鼠标靠近td底边缘 → 高亮横线 + row-resize光标
            if (Math.abs(e.clientY - r.bottom) < EDGE) {
                resizeRowTr = tr;
                resizeRowTable = table;
                showRowGuide(r);
                table.style.cursor = 'row-resize';
            } else {
                clearRowHover();
            }
        });
        function clearRowHover() {
            resizeRowTr = null;
            if (resizeRowTable && !resizeColTd) resizeRowTable.style.cursor = '';   // 列宽未占用才清光标
            hideRowGuide();
        }
        editor.addEventListener('mouseleave', () => { if (!rowIsDragging) clearRowHover(); });

        editor.addEventListener('mousedown', (e) => {
            if (!resizeRowTr) return;
            e.preventDefault();
            rowIsDragging = true;
            rowStartY = e.clientY;
            rowStartH = resizeRowTr.getBoundingClientRect().height;
            resizeRowTable.classList.add('row-resizing');
            document.addEventListener('mousemove', onRowDrag);
            document.addEventListener('mouseup', onRowDragEnd);
        });
        function onRowDrag(e) {
            if (!resizeRowTr) return;
            const delta = e.clientY - rowStartY;
            let newH = rowStartH + delta;
            if (newH < 24) newH = 24;   // 最小行高24px
            // 设该行所有td的height
            Array.from(resizeRowTr.children).forEach(td => { td.style.height = newH + 'px'; });
            const r = resizeRowTr.getBoundingClientRect();
            showRowGuide({ bottom: r.bottom, left: r.left, right: r.right });
        }
        function onRowDragEnd() {
            document.removeEventListener('mousemove', onRowDrag);
            document.removeEventListener('mouseup', onRowDragEnd);
            rowIsDragging = false;
            if (resizeRowTable) resizeRowTable.classList.remove('row-resizing');
            clearRowHover();
            saveKnowledge(true);
        }
    }

    function showRowGuide(rect) {
        if (!rowResizeGuide) return;
        const tableRect = resizeRowTable ? resizeRowTable.getBoundingClientRect() : rect;
        rowResizeGuide.style.display = 'block';
        rowResizeGuide.style.top = (rect.bottom - 1) + 'px';
        rowResizeGuide.style.left = tableRect.left + 'px';
        rowResizeGuide.style.width = tableRect.width + 'px';
    }
    function hideRowGuide() {
        if (rowResizeGuide) rowResizeGuide.style.display = 'none';
    }

    let tableCtxMenu = null;
    let ctxCell = null;   // 右键时的目标单元格
    function setupTableContextMenu() {
        const editor = document.getElementById('knowledgeEditor');
        if (!editor) return;
        editor.addEventListener('contextmenu', (e) => {
            const td = e.target.closest('.block-table td');
            if (!td) return;
            e.preventDefault();
            ctxCell = td;
            showTableCtxMenu(e.clientX, e.clientY, td);
        });
        // 点击别处关闭菜单
        document.addEventListener('mousedown', (e) => {
            if (tableCtxMenu && !tableCtxMenu.contains(e.target)) hideTableCtxMenu();
        });
        document.addEventListener('scroll', hideTableCtxMenu, true);
    }

    function showTableCtxMenu(x, y, td) {
        const table = td.closest('.block-table');
        const tr = td.parentElement;
        const rows = table.querySelectorAll('tr');
        const colCount = rows[0] ? rows[0].children.length : 0;
        const rowCount = rows.length;

        // 合并/拆分：检测当前是否有矩形多格选区 / ctxCell是否已合并
        const rectSelection = getRectSelection(table);   // 返回{cells,rows,cols,isRect}或null
        const canMerge = rectSelection && rectSelection.isRect && rectSelection.cells.length > 1;
        const canSplit = (parseInt(td.getAttribute('colspan')||'1') > 1) || (parseInt(td.getAttribute('rowspan')||'1') > 1);

        if (!tableCtxMenu) {
            tableCtxMenu = document.createElement('div');
            tableCtxMenu.className = 'table-ctx-menu';
            document.body.appendChild(tableCtxMenu);
        }
        tableCtxMenu.innerHTML = `
            <div class="tcm-item" data-act="selCol">📊 Select Entire Column</div>
            <div class="tcm-item" data-act="selRow">📋 Select Entire Row</div>
            <div class="tcm-item" data-act="selTable">🎯 Select Entire Table</div>
            <div class="tcm-sep"></div>
            <div class="tcm-item ${canMerge ? '' : 'disabled'}" data-act="merge">🔗 Merge Cells</div>
            <div class="tcm-item ${canSplit ? '' : 'disabled'}" data-act="split">✂️ Split Cell</div>
            <div class="tcm-sep"></div>
            <div class="tcm-item" data-act="insRowAbove">⬆ Insert Row Above</div>
            <div class="tcm-item" data-act="insRowBelow">⬇ Insert Row Below</div>
            <div class="tcm-item" data-act="insColLeft">⬅ Insert Column Left</div>
            <div class="tcm-item" data-act="insColRight">➡ Insert Column Right</div>
            <div class="tcm-sep"></div>
            <div class="tcm-item danger ${rowCount <= 1 ? 'disabled' : ''}" data-act="delRow">🗑 Delete Row</div>
            <div class="tcm-item danger ${colCount <= 1 ? 'disabled' : ''}" data-act="delCol">🗑 Delete Column</div>
            <div class="tcm-item danger" data-act="delTable">🗑 Delete Table</div>
            <div class="tcm-sep"></div>
            <div class="tcm-item" data-act="clearText">🧹 Clear Text</div>
            <div class="tcm-sep"></div>
            <div class="tcm-label">Text Align</div>
            <div class="tcm-align-row">
                <div class="tcm-align-btn" data-align="left">⬅ Left</div>
                <div class="tcm-align-btn" data-align="center">⬌ Center</div>
                <div class="tcm-align-btn" data-align="right">➡ Right</div>
            </div>
            <div class="tcm-label">Vertical Align</div>
            <div class="tcm-align-row">
                <div class="tcm-valign-btn" data-valign="top">⬆ Top</div>
                <div class="tcm-valign-btn" data-valign="middle">⬍ Middle</div>
                <div class="tcm-valign-btn" data-valign="bottom">⬇ Bottom</div>
            </div>
        `;
        // 绑定动作（非禁用项）
        tableCtxMenu.querySelectorAll('.tcm-item').forEach(el => {
            if (el.classList.contains('disabled')) return;
            el.addEventListener('mousedown', (ev) => { ev.preventDefault(); ev.stopPropagation(); });
            el.addEventListener('click', (ev) => {
                ev.preventDefault(); ev.stopPropagation();
                doTableAction(el.dataset.act);
            });
        });
        tableCtxMenu.querySelectorAll('.tcm-align-btn').forEach(el => {
            el.addEventListener('mousedown', (ev) => { ev.preventDefault(); ev.stopPropagation(); });
            el.addEventListener('click', (ev) => {
                ev.preventDefault(); ev.stopPropagation();
                alignTableCells(el.dataset.align);
            });
        });
        // 垂直对齐按钮
        tableCtxMenu.querySelectorAll('.tcm-valign-btn').forEach(el => {
            el.addEventListener('mousedown', (ev) => { ev.preventDefault(); ev.stopPropagation(); });
            el.addEventListener('click', (ev) => {
                ev.preventDefault(); ev.stopPropagation();
                valignTableCells(el.dataset.valign);
            });
        });
        // 定位（防溢出屏幕）
        tableCtxMenu.style.display = 'block';
        const mw = tableCtxMenu.offsetWidth, mh = tableCtxMenu.offsetHeight;
        let left = x, top = y;
        if (left + mw > window.innerWidth) left = window.innerWidth - mw - 8;
        if (top + mh > window.innerHeight) top = window.innerHeight - mh - 8;
        tableCtxMenu.style.left = left + 'px';
        tableCtxMenu.style.top = top + 'px';
    }

    function hideTableCtxMenu() {
        if (tableCtxMenu) tableCtxMenu.style.display = 'none';
    }

    // 执行菜单动作（基于ctxCell的行/列位置）
    function doTableAction(act) {
        if (!ctxCell) return;
        const table = ctxCell.closest('.block-table');
        if (!table) { hideTableCtxMenu(); return; }
        const tr = ctxCell.parentElement;
        const colIdx = Array.from(tr.children).indexOf(ctxCell);

        // 选整列/整行：只设高亮，不改结构，不关菜单（可接着操作如对齐）
        if (act === 'selCol') {
            manualSelection = true;
            clearCellSelection();
            table.querySelectorAll('tr').forEach(row => {
                if (row.children[colIdx]) row.children[colIdx].classList.add('cell-selected');
            });
            return;
        } else if (act === 'selRow') {
            manualSelection = true;
            clearCellSelection();
            Array.from(tr.children).forEach(td => td.classList.add('cell-selected'));
            return;
        } else if (act === 'selTable') {
            // 选整个表格：所有td加.cell-selected，便于批量设色/对齐/清文字
            manualSelection = true;
            clearCellSelection();
            table.querySelectorAll('td').forEach(td => td.classList.add('cell-selected'));
            return;
        } else if (act === 'merge') {
            hideTableCtxMenu();
            mergeCells(table);
            return;
        } else if (act === 'split') {
            hideTableCtxMenu();
            splitCell(ctxCell);
            return;
        } else if (act === 'clearText') {
            // 清空选中格子的文字（保留结构/颜色/对齐）。无选中→ctxCell
            const cells = getSelectedTableCells();
            cells.forEach(td => { td.innerHTML = '<br>'; });
            hideTableCtxMenu();
            saveKnowledge(true);
            return;
        }

        if (act === 'insRowAbove' || act === 'insRowBelow') {
            const colCount = tr.children.length;
            const newTr = document.createElement('tr');
            for (let i = 0; i < colCount; i++) {
                const td = document.createElement('td');
                td.innerHTML = '<br>';
                newTr.appendChild(td);
            }
            if (act === 'insRowAbove') tr.parentNode.insertBefore(newTr, tr);
            else tr.parentNode.insertBefore(newTr, tr.nextSibling);
        } else if (act === 'insColLeft' || act === 'insColRight') {
            table.querySelectorAll('tr').forEach(row => {
                const ref = row.children[colIdx];
                const td = document.createElement('td');
                td.innerHTML = '<br>';
                if (act === 'insColLeft') row.insertBefore(td, ref);
                else row.insertBefore(td, ref.nextSibling);
            });
        } else if (act === 'delRow') {
            if (table.querySelectorAll('tr').length > 1) tr.remove();
        } else if (act === 'delCol') {
            const firstRow = table.querySelector('tr');
            if (firstRow && firstRow.children.length > 1) {
                table.querySelectorAll('tr').forEach(row => {
                    if (row.children[colIdx]) row.children[colIdx].remove();
                });
            }
        } else if (act === 'delTable') {
            table.remove();
            hideTableCtxMenu();
            saveKnowledge(true);
            return;
        }
        hideTableCtxMenu();
        saveKnowledge(true);
    }

    // 文字对齐：作用于当前选中的所有单元格，无多选则只对ctxCell
    function alignTableCells(align) {
        const cells = getSelectedTableCells();
        cells.forEach(td => { td.style.textAlign = align; });
        hideTableCtxMenu();
        saveKnowledge(true);
    }

    // 垂直对齐选中单元格（top/middle/bottom）
    function valignTableCells(valign) {
        const cells = getSelectedTableCells();
        cells.forEach(td => { td.style.verticalAlign = valign; });
        hideTableCtxMenu();
        saveKnowledge(true);
    }

    // 获取"活动"单元格（调色盘用）：优先.cell-selected(手动选),否则光标所在td
    function getActiveTableCells() {
        const selected = document.querySelectorAll('.block-table td.cell-selected');
        if (selected.length > 0) return Array.from(selected);
        // 光标所在td
        const sel = window.getSelection();
        if (sel && sel.anchorNode) {
            const n = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
            const td = n && n.closest && n.closest('.block-table td');
            if (td) return [td];
        }
        return [];
    }

    // 设置选中单元格边框色（Frame）
    function setTableCellFrame(color) {
        const cells = getActiveTableCells();
        if (cells.length === 0) { notify('Select a table cell first', 'warn'); return; }
        cells.forEach(td => {
            if (color) td.style.borderColor = color;
            else td.style.borderColor = '';   // None→恢复默认
        });
        clearCellSelection();   // 清选中，让用户看到真实边框色
        scheduleAutoSave();
    }

    // 设置选中单元格背景色（Background）
    function setTableCellBg(color) {
        const cells = getActiveTableCells();
        if (cells.length === 0) { notify('Select a table cell first', 'warn'); return; }
        cells.forEach(td => {
            if (color) td.style.backgroundColor = color;
            else td.style.backgroundColor = '';   // None→恢复默认
        });
        clearCellSelection();   // 清选中，避免.cell-selected的!important蓝盖住新设背景
        scheduleAutoSave();
    }

    // ===== Page 背景：给Knowledge页面设背景色/图片，存knowledgeMeta[class].pageBg =====
    function setPageBgMetaAndApply(pageBg) {
        const hw = getCurrentHomework();
        if (!hw) return;
        if (!hw.knowledgeMeta) hw.knowledgeMeta = {};
        if (!hw.knowledgeMeta[state.currentClass]) hw.knowledgeMeta[state.currentClass] = {};
        if (pageBg) hw.knowledgeMeta[state.currentClass].pageBg = pageBg;
        else delete hw.knowledgeMeta[state.currentClass].pageBg;
        applyPageBg(pageBg);
        saveKnowledge(true);
    }

    // 应用pageBg到背景层：{type:'color'/'image',value,opacity}
    // 用独立.kn-page-bg-layer，opacity只调背景不影响内容
    function applyPageBg(pageBg) {
        const wrapper = document.getElementById('knowledgeEditorWrapper');
        if (!wrapper) return;
        // 获取或创建背景层
        let layer = wrapper.querySelector('.kn-page-bg-layer');
        if (!layer) {
            layer = document.createElement('div');
            layer.className = 'kn-page-bg-layer';
            wrapper.insertBefore(layer, wrapper.firstChild);
        }
        // 重置
        layer.style.backgroundColor = '';
        layer.style.backgroundImage = '';
        layer.style.opacity = '1';
        if (!pageBg) return;
        if (pageBg.type === 'color') {
            layer.style.backgroundColor = pageBg.value;
        } else if (pageBg.type === 'image') {
            layer.style.backgroundImage = `url("${pageBg.value}")`;
            layer.style.backgroundSize = 'cover';
            layer.style.backgroundPosition = 'center';
            layer.style.backgroundRepeat = 'no-repeat';
        }
        if (pageBg.opacity != null) layer.style.opacity = pageBg.opacity;
    }

    function setPageBgColor(color) {
        setPageBgMetaAndApply({ type: 'color', value: color });
    }

    function setPageBgImage(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => setPageBgMetaAndApply({ type: 'image', value: e.target.result });
        reader.readAsDataURL(file);
    }

    function setPageBgNone() {
        setPageBgMetaAndApply(null);
    }

    // 调背景透明度（0-100），只改opacity不重设背景。无背景时忽略
    function setPageBgOpacity(percent) {
        const hw = getCurrentHomework();
        if (!hw) return;
        const meta = hw.knowledgeMeta && hw.knowledgeMeta[state.currentClass];
        if (!meta || !meta.pageBg) return;   // 无背景，透明度无意义
        const opacity = Math.max(0, Math.min(100, parseInt(percent) || 100)) / 100;
        meta.pageBg.opacity = opacity;
        const layer = document.querySelector('.kn-page-bg-layer');
        if (layer) layer.style.opacity = opacity;
        const valEl = document.getElementById('knPageOpacityVal');
        if (valEl) valEl.textContent = Math.round(opacity * 100) + '%';
        saveKnowledge(true);
    }

    // 获取当前选区涉及的表格单元格（无选区或选区不在表格内→返回ctxCell）
    function getSelectedTableCells() {
        // 优先：手动选中的格子(.cell-selected)，适用于Clear Text/对齐等批量操作
        const manualSel = document.querySelectorAll('.block-table td.cell-selected');
        if (manualSel.length > 0) return Array.from(manualSel);
        // 其次：文字选区覆盖的格子
        if (ctxCell) {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
                const cells = [];
                const range = sel.getRangeAt(0);
                tableWalkerCells(ctxCell.closest('.block-table')).forEach(td => {
                    if (range.intersectsNode(td)) cells.push(td);
                });
                if (cells.length > 1) return cells;
            }
        }
        return ctxCell ? [ctxCell] : [];
    }

    // 遍历表格所有td
    function tableWalkerCells(table) {
        return Array.from(table.querySelectorAll('td'));
    }

    // ===== 单元格合并/拆分（核心算法）=====

    // 计算表格网格坐标：返回每个td的{td,row,col,rowspan,colspan}
    // 处理colspan/rowspan占位，col是网格列号(非DOM索引)
    function computeGridMap(table) {
        const rows = Array.from(table.querySelectorAll('tr'));
        const grid = [];   // grid[r][c] = td 或 null(被跨格占用)
        const cellInfo = [];   // 每个td的信息
        rows.forEach((tr, r) => {
            if (!grid[r]) grid[r] = [];
            let c = 0;
            Array.from(tr.children).forEach(td => {
                // 跳过被上方rowspan占用的列
                while (grid[r][c]) c++;
                const rowspan = parseInt(td.getAttribute('rowspan') || '1');
                const colspan = parseInt(td.getAttribute('colspan') || '1');
                cellInfo.push({ td, row: r, col: c, rowspan, colspan });
                // 标记占位
                for (let i = 0; i < rowspan; i++) {
                    if (!grid[r + i]) grid[r + i] = [];
                    for (let j = 0; j < colspan; j++) grid[r + i][c + j] = td;
                }
                c += colspan;
            });
        });
        return { cellInfo, grid, rowCount: rows.length };
    }

    // 检测当前选区(或手动选中)覆盖的格子是否构成矩形
    // 返回 {cells:[td...], minRow,maxRow,minCol,maxCol, isRect, totalGrid } 或 null
    function getRectSelection(table) {
        // 优先用手动选中(.cell-selected)的格子
        let selected = Array.from(table.querySelectorAll('td.cell-selected'));
        // 无手动选中→用文字选区覆盖的格子
        if (selected.length === 0) {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
            const range = sel.getRangeAt(0);
            selected = tableWalkerCells(table).filter(td => range.intersectsNode(td));
        }
        if (selected.length < 2) return null;

        const map = computeGridMap(table);
        // 找选中格子的网格范围
        let minR = Infinity, maxR = -1, minC = Infinity, maxC = -1;
        const selSet = new Set(selected);
        map.cellInfo.forEach(info => {
            if (selSet.has(info.td)) {
                if (info.row < minR) minR = info.row;
                if (info.row + info.rowspan - 1 > maxR) maxR = info.row + info.rowspan - 1;
                if (info.col < minC) minC = info.col;
                if (info.col + info.colspan - 1 > maxC) maxC = info.col + info.colspan - 1;
            }
        });
        const expectRows = maxR - minR + 1;
        const expectCols = maxC - minC + 1;
        const totalGrid = expectRows * expectCols;
        // 矩形判定：选中格子占的网格总数 == 矩形面积
        let selGridCount = 0;
        map.cellInfo.forEach(info => {
            if (selSet.has(info.td)) selGridCount += info.rowspan * info.colspan;
        });
        return {
            cells: selected,
            minRow: minR, maxRow: maxR, minCol: minC, maxCol: maxC,
            isRect: (selGridCount === totalGrid),
            totalGrid, selGridCount
        };
    }

    // 合并：矩形选区→保留左上格，设colspan/rowspan，删其余格
    function mergeCells(table) {
        const rect = getRectSelection(table);
        if (!rect || !rect.isRect || rect.cells.length < 2) {
            notify('Select a rectangular area first', 'warn');
            return;
        }
        const map = computeGridMap(table);
        // 找左上格(最小row,同row最小col)
        let topLeft = null;
        map.cellInfo.forEach(info => {
            if (rect.cells.includes(info.td)) {
                if (!topLeft || info.row < topLeft.row || (info.row === topLeft.row && info.col < topLeft.col)) {
                    topLeft = info;
                }
            }
        });
        if (!topLeft) return;
        const rowspan = rect.maxRow - rect.minRow + 1;
        const colspan = rect.maxCol - rect.minCol + 1;
        // 收集被合并格的文字，拼到左上格
        const texts = [];
        rect.cells.forEach(td => {
            if (td !== topLeft.td) {
                const t = td.textContent.trim();
                if (t) texts.push(t);
                td.remove();
            }
        });
        topLeft.td.setAttribute('rowspan', rowspan);
        topLeft.td.setAttribute('colspan', colspan);
        if (texts.length) {
            const existing = topLeft.td.textContent.trim();
            topLeft.td.innerHTML = (existing ? existing + '<br>' : '') + texts.join('<br>');
        }
        clearCellSelection();
        topLeft.td.classList.add('cell-selected');
        manualSelection = false;
        saveKnowledge(true);
        notify('Cells merged', 'success');
    }

    // 拆分：弹框让用户设行数×列数（默认=原colspan×rowspan），确认后按指定拆分
    function splitCell(td) {
        const rowspan = parseInt(td.getAttribute('rowspan') || '1');
        const colspan = parseInt(td.getAttribute('colspan') || '1');
        if (rowspan === 1 && colspan === 1) {
            notify('Select a merged cell to split', 'warn');
            return;
        }
        showSplitDialog(td, colspan, rowspan);
    }

    // 拆分弹框：rows/cols输入，默认显示原合并范围
    function showSplitDialog(td, defCols, defRows) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.45);z-index:99998;display:flex;align-items:center;justify-content:center';
        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:var(--bg-main,#fff);border-radius:10px;padding:20px 24px;box-shadow:0 8px 32px rgba(0,0,0,0.2);min-width:280px;font-family:inherit';
        dialog.innerHTML = `
            <div style="font-size:15px;font-weight:600;margin-bottom:14px;color:var(--text-primary,#333)">✂️ Split Cell</div>
            <div style="display:flex;gap:14px;margin-bottom:16px">
                <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary,#666)">
                    Columns
                    <input type="number" id="splitCols" min="1" max="10" value="${defCols}" style="width:80px;padding:6px 8px;border:1px solid var(--border-color,#ddd);border-radius:5px;font-size:14px">
                </label>
                <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary,#666)">
                    Rows
                    <input type="number" id="splitRows" min="1" max="10" value="${defRows}" style="width:80px;padding:6px 8px;border:1px solid var(--border-color,#ddd);border-radius:5px;font-size:14px">
                </label>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end">
                <button id="splitCancel" style="padding:7px 16px;border:1px solid var(--border-color,#ddd);border-radius:6px;background:var(--bg-main,#fff);cursor:pointer;font-size:13px">Cancel</button>
                <button id="splitOk" style="padding:7px 16px;border:none;border-radius:6px;background:var(--color-primary,#1890ff);color:#fff;cursor:pointer;font-size:13px">Split</button>
            </div>
        `;
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        const colsInput = dialog.querySelector('#splitCols');
        const rowsInput = dialog.querySelector('#splitRows');
        colsInput.focus();
        colsInput.select();
        const close = () => overlay.remove();
        dialog.querySelector('#splitCancel').onclick = close;
        overlay.onclick = (e) => { if (e.target === overlay) close(); };
        const confirm = () => {
            const cols = Math.max(1, Math.min(10, parseInt(colsInput.value) || 1));
            const rows = Math.max(1, Math.min(10, parseInt(rowsInput.value) || 1));
            close();
            doSplitCell(td, cols, rows);
        };
        dialog.querySelector('#splitOk').onclick = confirm;
        const onKey = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); confirm(); }
            else if (e.key === 'Escape') { e.preventDefault(); close(); }
        };
        colsInput.addEventListener('keydown', onKey);
        rowsInput.addEventListener('keydown', onKey);
    }

    // 实际拆分：把td按cols×rows拆分，原大格内容保留在左上格
    function doSplitCell(td, cols, rows) {
        const tr = td.parentElement;
        const table = td.closest('.block-table');
        const oldRows = Array.from(table.querySelectorAll('tr'));
        const trIdx = oldRows.indexOf(tr);

        // 清除原合并属性
        td.removeAttribute('rowspan');
        td.removeAttribute('colspan');
        // 当前行：td右侧补 (cols-1) 个空td
        for (let j = 1; j < cols; j++) {
            const newTd = document.createElement('td');
            newTd.innerHTML = '<br>';
            tr.insertBefore(newTd, td.nextSibling);
        }
        // 下面 (rows-1) 行：每行补 cols 个空td（末尾追加保证列数一致）
        for (let i = 1; i < rows; i++) {
            let targetTr = oldRows[trIdx + i];
            if (!targetTr) {
                // 不够行→新建行（列数=首行列数）
                targetTr = document.createElement('tr');
                const firstRowCols = table.querySelector('tr').children.length;
                for (let k = 0; k < firstRowCols; k++) {
                    const ft = document.createElement('td');
                    ft.innerHTML = '<br>';
                    targetTr.appendChild(ft);
                }
                table.appendChild(targetTr);
            }
            for (let j = 0; j < cols; j++) {
                const newTd = document.createElement('td');
                newTd.innerHTML = '<br>';
                targetTr.appendChild(newTd);
            }
        }
        clearCellSelection();
        saveKnowledge(true);
        notify(`Split into ${cols}×${rows}`, 'success');
    }

    // 待办勾选交互 + 大纲实时更新
    // ===== Skills / Knowledge Points 全局共享库（跨作业，存meta store）=====
    async function loadGlobalExt(key) {
        try {
            await openDB();
            const row = await dbGet('meta', key);
            return (row && row.value) || '';
        } catch (e) { return ''; }
    }
    async function saveGlobalExt(key, value) {
        try { await dbPut('meta', { key, value }); } catch (e) {}
    }

    // 渲染Skills/Points编辑区（加载已存内容 + 绑定保存）
    async function renderExtEditors() {
        const skills = document.getElementById('skillsEditor');
        const points = document.getElementById('pointsEditor');
        if (skills) {
            skills.innerHTML = await loadGlobalExt('globalSkills');
            skills.oninput = () => saveGlobalExt('globalSkills', skills.innerHTML);
        }
        if (points) {
            points.innerHTML = await loadGlobalExt('globalPoints');
            points.oninput = () => saveGlobalExt('globalPoints', points.innerHTML);
        }
    }

    function setupTodoToggle() {
        const editor = document.getElementById('knowledgeEditor');
        if (!editor) return;
        editor.addEventListener('click', (e) => {
            if (e.target.matches('.todo-block input[type="checkbox"]')) {
                const block = e.target.closest('.todo-block');
                if (block) block.classList.toggle('done', e.target.checked);
            }
        });
        // 鼠标悬停图片 → 包裹层显示手柄（用于拖拽缩放）
        editor.addEventListener('mouseover', (e) => {
            if (e.target.tagName === 'IMG' && !e.target.classList.contains('pdf-page') && editor.contains(e.target)) {
                attachImgResizeWrapper(e.target);
            }
        });
        // 编辑时防抖更新大纲 + 自动保存
        let isComposing = false;
        editor.addEventListener('compositionstart', () => { isComposing = true; });
        editor.addEventListener('compositionend', () => { isComposing = false; scheduleOutlineUpdate(); scheduleAutoSave(); });
        editor.addEventListener('input', () => { if (isComposing) return; scheduleOutlineUpdate(); scheduleAutoSave(); });
        // Shift+Enter → 沿用上一行所有样式；普通Enter → 不沿用（清除样式恢复默认）
        editor.addEventListener('keyup', (e) => {
            if (e.key !== 'Enter') return;
            const sel = window.getSelection();
            if (!sel || !sel.anchorNode) return;
            let cur = sel.anchorNode;
            while (cur && cur !== editor) {
                if (cur.nodeType === 1 && ['P','DIV','LI','H1','H2','H3','H4','H5','H6','BLOCKQUOTE'].includes(cur.tagName)) break;
                cur = cur.parentNode;
            }
            if (!cur || cur === editor) return;
            if (e.shiftKey) {
                // Shift+Enter：沿用上一行样式
                const prev = cur.previousElementSibling;
                if (!prev || prev === editor) return;
                const pcs = getComputedStyle(prev);
                const ccs = getComputedStyle(cur);
                const styles = ['color','fontFamily','fontSize','fontWeight','fontStyle',
                               'backgroundColor','textDecoration','lineHeight','textAlign'];
                styles.forEach(prop => {
                    if (pcs[prop] && pcs[prop] !== ccs[prop]) {
                        cur.style[prop] = pcs[prop];
                    }
                });
            } else {
                // 普通Enter：清除所有样式（含颜色/背景/字体/粗体等）
                cur.removeAttribute('style');
                cur.querySelectorAll('*').forEach(child => child.removeAttribute('style'));
                // 清除浏览器内部的typing style（颜色/背景/粗体/字体等）
                try {
                    document.execCommand('removeFormat', false, null);
                    document.execCommand('foreColor', false, '#000000');        // 字体颜色恢复黑色
                    document.execCommand('hiliteColor', false, 'transparent'); // 背景色清除
                } catch(e) {}
            }
        });
        // 分栏内回车：拦截默认(会复制kn-col增列)，改成插入<br>软换行
        // todo内回车：跳出todo-block，在后面新建空p（正常换行，不在span内软换行）
        editor.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            const sel = window.getSelection();
            let node = sel && sel.anchorNode ? sel.anchorNode : null;
            // 先判断是否在kn-col内
            let inCol = false;
            let n = node;
            while (n && n !== editor) {
                if (n.classList && n.classList.contains('kn-col')) { inCol = true; break; }
                n = n.parentNode;
            }
            if (inCol) { e.preventDefault(); document.execCommand('insertHTML', false, '<br>'); return; }
            // 判断是否在todo-block内
            let todoBlock = null;
            n = node;
            while (n && n !== editor) {
                if (n.classList && n.classList.contains('todo-block')) { todoBlock = n; break; }
                n = n.parentNode;
            }
            if (todoBlock) {
                e.preventDefault();
                // 在todo-block后插入新空p，光标进新p
                const newP = document.createElement('p');
                newP.innerHTML = '<br>';
                todoBlock.parentNode.insertBefore(newP, todoBlock.nextSibling);
                const range = document.createRange();
                range.setStart(newP, 0);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });
        // 限制只能单行选中：选区跨块(多行)时，收缩到起始块内
        const BLOCK_TAGS = ['P','DIV','H1','H2','H3','H4','H5','H6','LI','BLOCKQUOTE','TD','TH'];
        const getBlock = (node) => {
            let n = node;
            while (n && n !== editor) {
                if (n.nodeType === 1 && BLOCK_TAGS.includes(n.tagName)) return n;
                n = n.parentNode;
            }
            return null;
        };
        let collapsingSelection = false;  // 防止selectionchange重入死循环
        document.addEventListener('selectionchange', () => {
            if (collapsingSelection) return;  // 自己触发的，跳过
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
            if (!editor.contains(sel.anchorNode) || !editor.contains(sel.focusNode)) return;
            const range = sel.getRangeAt(0);
            // startContainer/endContainer是文档顺序(无论从哪头拖)，用它俩判断块
            const startBlock = getBlock(range.startContainer);
            const endBlock = getBlock(range.endContainer);
            // 同一块 → 不处理(不触发死循环)
            if (!startBlock || !endBlock || startBlock === endBlock) return;
            // 跨块 → 收缩到文档顺序起点所在块(start到startBlock末尾)
            collapsingSelection = true;
            const newRange = document.createRange();
            newRange.setStart(range.startContainer, range.startOffset);
            newRange.setEnd(startBlock, startBlock.childNodes.length);
            sel.removeAllRanges();
            sel.addRange(newRange);
            setTimeout(() => { collapsingSelection = false; }, 50);
        });
    }

    // 语音输入（Web Speech API）
    function toggleVoiceInput() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            notify('Voice input unsupported. Use Chrome or Edge', 'error');
            return;
        }

        const btn = document.getElementById('voiceBtn');
        const indicator = document.getElementById('voiceIndicator');

        if (isRecording) {
            // 停止录音
            if (voiceRecognition) voiceRecognition.stop();
            isRecording = false;
            btn.classList.remove('active');
            indicator.classList.remove('recording');
            return;
        }

        // 开始录音
        voiceRecognition = new SpeechRecognition();
        voiceRecognition.lang = 'zh-CN';
        voiceRecognition.continuous = true;
        voiceRecognition.interimResults = true;

        voiceRecognition.onresult = (e) => {
            let transcript = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                transcript += e.results[i][0].transcript;
            }
            if (transcript) {
                // 将语音文本插入到编辑区光标位置
                document.getElementById('knowledgeEditor').focus();
                document.execCommand('insertText', false, transcript);
            }
        };

        voiceRecognition.onerror = (e) => {
            console.warn('语音识别错误:', e.error);
            if (e.error !== 'no-speech') {
                notify('Voice error: ' + e.error, 'error');
            }
        };

        voiceRecognition.onend = () => {
            if (isRecording) {
                // 自动重启（continuous模式下可能意外停止）
                try { voiceRecognition.start(); } catch (e) { /* ignore */ }
            }
        };

        try {
            voiceRecognition.start();
            isRecording = true;
            btn.classList.add('active');
            indicator.classList.add('recording');
            notify('Voice input started. Click the mic to stop', 'success');
        } catch (e) {
            notify('Voice input failed to start', 'error');
        }
    }

    // ===== 数据管理 =====
    function openDataPanel() {
        document.getElementById('dataPanelOverlay').classList.add('show');
    }

    function closeDataPanel(e) {
        if (e && e.target !== e.currentTarget) return;
        document.getElementById('dataPanelOverlay').classList.remove('show');
    }

    function handleFileSelect(type) {
        const inputId = type === 'pdf' ? 'pdfFileInput' : type + 'FileInput';
        const input = document.getElementById(inputId);
        const info = document.getElementById(type + 'FileInfo');
        if (input && input.files.length > 0) {
            info.textContent = 'Selected: ' + input.files[0].name;
        }
    }

    // ===== 听力音频导入 + 播放器 =====
    function handleAudioFileSelect() {
        const input = document.getElementById('audioFileInput');
        const info = document.getElementById('audioFileInfo');
        if (input && input.files.length > 0) {
            const f = input.files[0];
            info.textContent = 'Selected: ' + f.name + ' (' + (f.size/1024/1024).toFixed(1) + ' MB)';
        }
    }

    async function importListeningAudio() {
        const input = document.getElementById('audioFileInput');
        if (!input || input.files.length === 0) {
            notify('Please choose an audio file first', 'error');
            return;
        }
        const hw = getCurrentHomework();
        if (!hw) { notify('Please select an assignment first', 'error'); return; }
        const file = input.files[0];
        notify('Importing audio...', 'info');
        try {
            const dataUrl = await fileToDataURL(file);
            hw.listeningAudio = dataUrl;
            await saveHomework(hw.id);
            closeDataPanel();
            notify('Listening audio imported!', 'success');
            // 若播放器开着，加载新音频
            loadListeningAudio();
        } catch (err) {
            notify('Audio import failed: ' + err.message, 'error');
        }
    }

    function clearListeningAudio() {
        const hw = getCurrentHomework();
        if (!hw) return;
        if (!hw.listeningAudio) { notify('No audio to clear', 'info'); return; }
        if (!confirm('Clear the listening audio for this assignment?')) return;
        delete hw.listeningAudio;
        delete hw.listeningRanges;          // 区间随音频一并清除
        currentQuestionRange = null;        // 重置当前播放区间
        pendingRangeRows = null;
        saveHomework(hw.id);
        // 停止播放并清空
        const audio = document.getElementById('listeningAudio');
        if (audio) { audio.pause(); audio.src = ''; }
        const panel = document.getElementById('audioPlayerPanel');
        if (panel) panel.classList.remove('show');
        renderQuestionGrid();               // 刷新网格，去掉▶角标
        notify('Audio cleared', 'success');
    }

    // 移除Excel成绩数据（清空当前作业的scores/questions）
    function clearScoresData() {
        const hw = getCurrentHomework();
        if (!hw) return;
        if (!hw.scores || (hw.scores.class9.length === 0 && hw.scores.class11.length === 0)) {
            notify('No scores to clear', 'info'); return;
        }
        if (!confirm('Clear all scores and question stats for this assignment?')) return;
        hw.scores = { class9: [], class11: [] };
        hw.questions = { class9: [], class11: [] };
        saveHomework(hw.id);
        renderAll();
        notify('Scores cleared', 'success');
    }

    // 移除PDF/所有原文素材（清空passages + 锚点）
    function clearPassagesData() {
        const hw = getCurrentHomework();
        if (!hw) return;
        if (!hw.passages || hw.passages.length === 0) { notify('No passages to clear', 'info'); return; }
        if (!confirm('Clear all passages (PDF/text/web) for this assignment?')) return;
        hw.passages = [];
        if (hw.config) hw.config.anchors = {};
        currentUnitIndex = 0;
        unitScrollMap = {};
        saveHomework(hw.id);
        renderPassage();
        notify('Passages cleared', 'success');
    }

    // 移除DOCX（DOCX是passages里的text类型，等同clearPassagesData）
    function clearDocxData() {
        const hw = getCurrentHomework();
        if (!hw) return;
        const hasText = hw.passages && hw.passages.some(p => p.type === 'text');
        if (!hasText) { notify('No Word document to clear', 'info'); return; }
        if (!confirm('Clear Word/Text passages for this assignment?')) return;
        hw.passages = hw.passages.filter(p => p.type !== 'text');
        saveHomework(hw.id);
        renderPassage();
        notify('Word document cleared', 'success');
    }


    function fileToDataURL(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = e => resolve(e.target.result);
            r.onerror = () => reject(new Error('read failed'));
            r.readAsDataURL(file);
        });
    }

    // ===== 播放器逻辑 =====
    let audioRangeLoop = false;
    let audioRangeStart = 0;   // 秒
    let audioRangeEnd = 0;     // 秒，0表示不限
    // 按题号播放的当前区间（与上面的手动 Range 互斥；非空时播完自动停）
    let currentQuestionRange = null;  // { qNum, start, end, twice, pass, busy }
    let secondPassTimer = null;       // 两遍之间间隔的定时器
    // 题号两遍间隔等待标志：屏蔽间隔期内timeupdate的停止判断
    let questionRangeWaiting = false;
    // 上方旧Range的两遍播放追踪（独立于题号区间）
    let manualRangeTwice = null;      // { pass } 非空表示正在两遍播放
    let manualSecondTimer = null;
    // 上方单遍▶播放标志：true时到audioRangeEnd自动停（避免普通从头听被误停）
    let manualRangeActive = false;
    // 两遍之间间隔等待标志：true时屏蔽timeupdate的停止判断，避免pause后cur仍>=end误判第二遍完
    let manualRangeWaiting = false;
    // 两遍之间的间隔秒数（可自定义，localStorage 持久化）
    let twiceGapSec = parseFloat(localStorage.getItem('afr-twice-gap')) || 2;

    // 答案Key默认模板（题型标题加粗）
    const ANSWER_KEY_TEMPLATE = `<b>I. Listening</b>
1.

<b>II. Reading</b>

<b>III. 5 of 7</b>

<b>IV. Cloze</b>

<b>V. Gap-filling</b>
`;

    // 切换答案Key浮窗：打开时加载该作业已存答案（无则用模板）
    function toggleAnswerKey() {
        const panel = document.getElementById('answerKeyPanel');
        if (!panel) return;
        const isOpen = panel.classList.contains('show');
        if (isOpen) {
            panel.classList.remove('show');
            return;
        }
        // 打开：加载已存答案或模板
        const hw = getCurrentHomework();
        const ta = document.getElementById('answerKeyTextarea');
        if (ta) {
            ta.innerHTML = (hw && hw.answerKey) ? hw.answerKey : ANSWER_KEY_TEMPLATE;
        }
        panel.classList.add('show');
    }

    // 保存答案到当前作业
    function saveAnswerKey() {
        const hw = getCurrentHomework();
        if (!hw) { notify('No assignment selected', 'error'); return; }
        const ta = document.getElementById('answerKeyTextarea');
        hw.answerKey = ta ? ta.innerHTML : '';
        saveHomework(hw.id);
        notify('Answer key saved', 'success');
    }

    function toggleAudioPlayer() {
        const hw = getCurrentHomework();
        const panel = document.getElementById('audioPlayerPanel');
        if (!panel) return;
        const isOpen = panel.classList.contains('show');
        if (isOpen) {
            // 关闭：暂停音频 + 清除两遍播放定时器与状态
            const audio = document.getElementById('listeningAudio');
            if (audio) audio.pause();
            if (secondPassTimer) { clearTimeout(secondPassTimer); secondPassTimer = null; }
            if (manualSecondTimer) { clearTimeout(manualSecondTimer); manualSecondTimer = null; }
            currentQuestionRange = null;
            manualRangeTwice = null;
            questionRangeWaiting = false;
            manualRangeWaiting = false;
            manualRangeActive = false;
            panel.classList.remove('show');
            return;
        }
        // 打开：检查是否有音频
        if (!hw || !hw.listeningAudio) {
            notify('No listening audio. Import one via Data panel', 'info');
            return;
        }
        panel.classList.add('show');
        loadListeningAudio();
        pendingRangeRows = null;          // 重置临时编辑态
        renderQuestionRangeRows();        // 回填已存区间行
        const gapInp = document.getElementById('twiceGapInput');
        if (gapInp) gapInp.value = twiceGapSec;  // 回填间隔秒数
    }

    function loadListeningAudio() {
        const hw = getCurrentHomework();
        const audio = document.getElementById('listeningAudio');
        if (!hw || !hw.listeningAudio || !audio) return;
        if (audio.src !== hw.listeningAudio) {
            audio.src = hw.listeningAudio;
        }
    }

    function toggleAudioPlay() {
        const audio = document.getElementById('listeningAudio');
        if (!audio || !audio.src) { notify('No audio loaded', 'info'); return; }
        loadListeningAudio();
        if (audio.paused) {
            // 若设置了区间起点，从起点开始
            if (audioRangeEnd > 0 && audio.currentTime >= audioRangeEnd) audio.currentTime = audioRangeStart;
            else if (audioRangeStart > 0 && audio.currentTime < audioRangeStart) audio.currentTime = audioRangeStart;
            audio.play();
        } else {
            audio.pause();
        }
    }

    function toggleAudioLoop() {
        audioRangeLoop = !audioRangeLoop;
        document.getElementById('audioLoopBtn').classList.toggle('active', audioRangeLoop);
    }

    // 解析 "0:30" 或 "30" → 秒
    function parseTime(str) {
        if (!str) return 0;
        str = String(str).trim();
        if (str.includes(':')) {
            const parts = str.split(':').map(Number);
            if (parts.length === 2) return parts[0] * 60 + parts[1];
            if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
        const n = parseFloat(str);
        return isNaN(n) ? 0 : n;
    }

    // 题号区间专用：始终输4位数字，按 MMSS 解析（1230=12:30=750秒，0012=0:12=12秒）
    // 带":"的兼容老格式；其余回落 parseTime（秒数）
    function parseTimeCode(str) {
        if (!str) return 0;
        str = String(str).trim();
        if (str.includes(':')) return parseTime(str);
        if (/^\d{4,}$/.test(str)) {
            const min = parseInt(str.slice(0, -2), 10);
            const sec = parseInt(str.slice(-2), 10);
            return min * 60 + sec;
        }
        return parseTime(str);
    }

    function updateAudioRange() {
        const sEl = document.getElementById('audioStartInput');
        const eEl = document.getElementById('audioEndInput');
        audioRangeStart = parseTimeCode(sEl.value);
        audioRangeEnd = parseTimeCode(eEl.value);
        // 回显为 m:ss 格式（输1230回车后显示12:30）
        if (sEl.value.trim()) sEl.value = fmtTime(audioRangeStart);
        if (eEl.value.trim()) eEl.value = fmtTime(audioRangeEnd);
        // 更新区间标记
        const audio = document.getElementById('listeningAudio');
        const mark = document.getElementById('audioRangeMark');
        const dur = audio && audio.duration ? audio.duration : 0;
        if (dur > 0 && audioRangeEnd > audioRangeStart && audioRangeEnd > 0) {
            const leftPct = (audioRangeStart / dur) * 100;
            const widthPct = ((audioRangeEnd - audioRangeStart) / dur) * 100;
            mark.style.left = leftPct + '%';
            mark.style.width = widthPct + '%';
            mark.classList.add('show');
        } else {
            mark.classList.remove('show');
        }
    }

    // 播放区间一次
    function playAudioRange() {
        const audio = document.getElementById('listeningAudio');
        if (!audio || !audio.src) { notify('No audio loaded', 'info'); return; }
        updateAudioRange();
        if (audioRangeEnd <= audioRangeStart) { notify('Set a valid range (start < end)', 'error'); return; }
        manualRangeTwice = null;  // 单遍播放，清除两遍标志
        manualRangeActive = true; // 标记：到 audioRangeEnd 自动停
        audio.currentTime = audioRangeStart;
        audio.play();
    }

    // 上方旧Range：连放两遍（停2秒后播第二遍）
    function playAudioRangeTwice() {
        const audio = document.getElementById('listeningAudio');
        if (!audio || !audio.src) { notify('No audio loaded', 'info'); return; }
        updateAudioRange();
        if (audioRangeEnd <= audioRangeStart) { notify('Set a valid range (start < end)', 'error'); return; }
        audioRangeLoop = false;
        const loopBtn = document.getElementById('audioLoopBtn');
        if (loopBtn) loopBtn.classList.remove('active');
        manualRangeTwice = { pass: 1 };
        manualRangeActive = false; // 两遍模式由 manualRangeTwice 管，清掉单遍标志
        manualRangeWaiting = false;
        audio.currentTime = audioRangeStart;
        audio.play();
    }

    // 设置两遍之间的间隔秒数（持久化到 localStorage）
    function setTwiceGap(val) {
        let n = parseFloat(val);
        if (isNaN(n) || n < 0.5) n = 0.5;
        if (n > 10) n = 10;
        n = Math.round(n * 10) / 10;  // 保留1位小数
        twiceGapSec = n;
        localStorage.setItem('afr-twice-gap', String(n));
        const inp = document.getElementById('twiceGapInput');
        if (inp) inp.value = n;
        notify('Gap set to ' + n + 's', 'success');
    }

    // 清空上方Range行的起止输入框
    function clearAudioRangeInputs() {
        const sInput = document.getElementById('audioStartInput');
        const eInput = document.getElementById('audioEndInput');
        if (sInput) sInput.value = '';
        if (eInput) eInput.value = '';
        audioRangeStart = 0;
        audioRangeEnd = 0;
        audioRangeLoop = false;
        manualRangeTwice = null;
        manualRangeActive = false;
        manualRangeWaiting = false;
        if (manualSecondTimer) { clearTimeout(manualSecondTimer); manualSecondTimer = null; }
        const loopBtn = document.getElementById('audioLoopBtn');
        if (loopBtn) loopBtn.classList.remove('active');
        const mark = document.getElementById('audioRangeMark');
        if (mark) mark.classList.remove('show');
    }

    function seekAudio(event) {
        const audio = document.getElementById('listeningAudio');
        const progress = document.getElementById('audioProgress');
        if (!audio || !audio.duration || !progress) return;
        const rect = progress.getBoundingClientRect();
        const pct = (event.clientX - rect.left) / rect.width;
        audio.currentTime = Math.max(0, Math.min(audio.duration, pct * audio.duration));
    }

    // 音频时间更新（进度条+区间循环）— 绑定一次
    function setupAudioEvents() {
        const audio = document.getElementById('listeningAudio');
        if (!audio) return;
        audio.addEventListener('timeupdate', () => {
            const fill = document.getElementById('audioProgressFill');
            const disp = document.getElementById('audioTimeDisplay');
            const dur = audio.duration || 0;
            const cur = audio.currentTime || 0;
            if (fill && dur > 0) fill.style.width = (cur / dur * 100) + '%';
            if (disp) disp.textContent = fmtTime(cur) + ' / ' + fmtTime(dur);
            // 按题号播放：到终点处理（间隔等待期跳过）
            if (!questionRangeWaiting && currentQuestionRange && cur >= currentQuestionRange.end) {
                // 两遍模式且刚播完第一遍 → 进入间隔等待，2秒后播第二遍
                if (currentQuestionRange.twice && currentQuestionRange.pass === 1) {
                    audio.pause();
                    currentQuestionRange.pass = 2;
                    questionRangeWaiting = true;  // 屏蔽间隔期内的停止判断
                    const r2 = currentQuestionRange;
                    secondPassTimer = setTimeout(() => {
                        if (currentQuestionRange === r2) {
                            questionRangeWaiting = false;  // 解除屏蔽，开始第二遍
                            audio.currentTime = r2.start;
                            audio.play();
                        }
                    }, twiceGapSec * 1000);
                } else {
                    // 第二遍播完或单遍模式 → 彻底停并解锁
                    audio.pause();
                    currentQuestionRange = null;
                }
            }
            // 手动区间循环或两遍（与题号播放互斥）；间隔等待期跳过，避免pause后cur仍>=end误判
            else if (!manualRangeWaiting && audioRangeEnd > 0 && cur >= audioRangeEnd) {
                if (audioRangeLoop) {
                    // 循环模式
                    audio.currentTime = audioRangeStart;
                } else if (manualRangeTwice && manualRangeTwice.pass === 1) {
                    // 两遍模式：第一遍完，进入间隔等待，2秒后播第二遍
                    audio.pause();
                    manualRangeTwice.pass = 2;
                    manualRangeWaiting = true;  // 屏蔽间隔期内的停止判断
                    manualSecondTimer = setTimeout(() => {
                        if (manualRangeTwice && manualRangeTwice.pass === 2) {
                            manualRangeWaiting = false;  // 解除屏蔽，开始第二遍
                            audio.currentTime = audioRangeStart;
                            audio.play();
                        }
                    }, twiceGapSec * 1000);
                } else if (manualRangeTwice && manualRangeTwice.pass === 2) {
                    // 第二遍完，彻底停
                    audio.pause();
                    manualRangeTwice = null;
                } else if (manualRangeActive) {
                    // 单遍▶播放：到结束时间停
                    audio.pause();
                    manualRangeActive = false;
                }
            }
        });
        // 播放/暂停按钮文案同步
        audio.addEventListener('play', () => {
            const btn = document.getElementById('audioPlayBtn');
            if (btn) btn.textContent = '⏸';
        });
        audio.addEventListener('pause', () => {
            const btn = document.getElementById('audioPlayBtn');
            if (btn) btn.textContent = '▶';
        });
        // 元数据加载后更新时长显示+区间标记
        audio.addEventListener('loadedmetadata', () => {
            const disp = document.getElementById('audioTimeDisplay');
            if (disp) disp.textContent = '0:00 / ' + fmtTime(audio.duration);
            updateAudioRange();
        });
    }

    function fmtTime(sec) {
        if (!sec || isNaN(sec)) return '0:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return m + ':' + String(s).padStart(2, '0');
    }

    // 解析 Q 框文本为题号数组：5→[5], 4&7→[4,7], 12-14→[12,13,14]
    // 返回 { qNums, qText } 或 null（非法）
    function parseQField(text) {
        if (!text) return null;
        text = String(text).trim();
        const qNums = [];
        // 用 & 分割（也兼容逗号、空格）
        const groups = text.split(/[&,，\s]+/).filter(s => s).map(s => s.trim());
        for (const g of groups) {
            const dash = g.match(/^(\d+)-(\d+)$/);  // 区间 12-14
            if (dash) {
                const a = parseInt(dash[1], 10), b = parseInt(dash[2], 10);
                if (a < 1 || b < 1 || a > b) return null;
                for (let i = a; i <= b; i++) qNums.push(i);
            } else {
                const n = parseInt(g, 10);
                if (!n || n < 1 || String(n) !== g) return null;  // 纯数字校验
                qNums.push(n);
            }
        }
        if (qNums.length === 0) return null;
        // 规范化 qText：4&7、12-14、5
        const norm = [...new Set(qNums)].sort((a, b) => a - b);
        return { qNums: norm, qText: text };
    }

    // ===== 按题号的听力区间（课前录入，上课点▶即播）=====
    // 数据模型：hw.listeningRanges = { [题号]: { start, end } }，秒
    function getListeningRanges() {
        const hw = getCurrentHomework();
        return (hw && hw.listeningRanges) ? hw.listeningRanges : {};
    }

    // 渲染管理区行（打开面板或保存后调用）
    function renderQuestionRangeRows() {
        const rows = rowsFromRanges(getListeningRanges());
        renderRows(rows);
    }

    // 把 hw.listeningRanges（按题号）合并为行：同 start+end 的连续/相邻题号还原成 4&7 或 12-14
    function rowsFromRanges(ranges) {
        const entries = Object.keys(ranges).map(Number).filter(q => ranges[q] && ranges[q].end > ranges[q].start);
        if (entries.length === 0) return [];
        // 按 start,end 分组
        const groupMap = {};  // key="start|end" → [题号]
        entries.forEach(q => {
            const r = ranges[q];
            const key = r.start + '|' + r.end;
            (groupMap[key] = groupMap[key] || []).push(q);
        });
        return Object.keys(groupMap).map(key => {
            const nums = groupMap[key].sort((a, b) => a - b);
            const [s, e] = key.split('|').map(Number);
            return { qText: numsToText(nums), qNums: nums, start: s, end: e };
        }).sort((a, b) => a.qNums[0] - b.qNums[0]);
    }

    // 题号数组 → 显示文本：[4,7]→"4&7", [12,13,14]→"12-14", [5]→"5"
    function numsToText(nums) {
        if (nums.length === 1) return String(nums[0]);
        const parts = [];
        let i = 0;
        while (i < nums.length) {
            let j = i;
            while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;  // 连续段
            if (j > i && j - i >= 2) parts.push(nums[i] + '-' + nums[j]);   // ≥3连续用区间
            else if (j > i) { parts.push(nums[i]); parts.push(nums[j]); }   // 2连续用&
            else parts.push(nums[i]);
            i = j + 1;
        }
        return parts.join('&');
    }

    // 增加空行（暂存到临时态，保存时才入库）
    let pendingRangeRows = null;  // null=跟随已存数据；数组=临时编辑态
    function addRangeRow() {
        const rows = pendingRangeRows ? pendingRangeRows.map(r => ({ ...r, qNums: [...r.qNums] })) : rowsFromRanges(getListeningRanges());
        rows.push({ qText: '', qNums: [], start: 0, end: 0 });
        pendingRangeRows = rows;
        renderRows(pendingRangeRows);
        // 聚焦新行的题号框
        const list = document.getElementById('audioQRangesList');
        if (list) {
            const inputs = list.querySelectorAll('.q-num');
            if (inputs.length) inputs[inputs.length - 1].focus();
        }
    }

    // 从行数组渲染
    function renderRows(rows) {
        const list = document.getElementById('audioQRangesList');
        if (!list) return;
        if (!rows || rows.length === 0) {
            list.innerHTML = '<div class="audio-q-empty">No question ranges yet. Click ＋ Add</div>';
            return;
        }
        list.innerHTML = rows.map((r, idx) => {
            return `<div class="audio-q-range-row" data-idx="${idx}">
                <label>Q</label>
                <input type="text" class="q-num" value="${escapeAttr(r.qText)}" data-field="q" onchange="AFR.editRangeRow(this)" placeholder="4&7 / 12-14 / 5">
                <input type="text" value="${fmtTime(r.start)}" data-field="start" onchange="AFR.editRangeRow(this)" title="Start (0:00)">
                <span class="arrow">→</span>
                <input type="text" value="${fmtTime(r.end)}" data-field="end" onchange="AFR.editRangeRow(this)" title="End (0:00)">
                <button class="audio-q-test-btn" onclick="AFR.testRangeRow(this)" title="Play this range once">▶</button>
                <button class="audio-q-twice-btn" onclick="AFR.testRangeRowTwice(this)" title="Play this range twice (with 2s gap)">×2</button>
                <button class="audio-q-del-btn" onclick="AFR.deleteRangeRow(this)" title="Delete">🗑</button>
            </div>`;
        }).join('');
    }

    function escapeAttr(s) {
        return String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    // 兼容旧调用名
    function renderQuestionRangeRowsFrom(rows) { renderRows(rows); }

    // 编辑某行字段（实时同步到 pendingRangeRows）
    function editRangeRow(inputEl) {
        const row = inputEl.closest('.audio-q-range-row');
        if (!row) return;
        const idx = Number(row.dataset.idx);
        if (pendingRangeRows === null) pendingRangeRows = rowsFromRanges(getListeningRanges());
        if (!pendingRangeRows[idx]) return;
        const field = inputEl.dataset.field;
        if (field === 'q') {
            const parsed = parseQField(inputEl.value);
            if (!parsed) { notify('Invalid Q. Use 5, 4&7, or 12-14', 'error'); inputEl.value = pendingRangeRows[idx].qText; return; }
            pendingRangeRows[idx].qText = parsed.qText;
            pendingRangeRows[idx].qNums = parsed.qNums;
        } else {
            const parsed = parseTimeCode(inputEl.value);
            pendingRangeRows[idx][field] = parsed;
            // 回显为 m:ss 格式（输1230回车后显示12:30）
            if (inputEl.value.trim()) inputEl.value = fmtTime(parsed);
        }
    }

    // 删除某行
    function deleteRangeRow(btnEl) {
        const row = btnEl.closest('.audio-q-range-row');
        if (!row) return;
        const idx = Number(row.dataset.idx);
        if (pendingRangeRows === null) pendingRangeRows = rowsFromRanges(getListeningRanges());
        pendingRangeRows.splice(idx, 1);
        renderRows(pendingRangeRows);
    }

    // 试听某行区间一次（不入库，不依赖保存）
    function testRangeRow(btnEl) {
        const row = btnEl.closest('.audio-q-range-row');
        if (!row) return;
        const item = getRowItem(row);
        if (!item || !(item.end > item.start)) { notify('Set a valid range (start < end) for Q' + (item ? item.qText : ''), 'error'); return; }
        playQuestionRange(item.qNums[0], buildRangesSource(), false);
    }

    // 试听某行区间两遍（停2秒后播第二遍）
    function testRangeRowTwice(btnEl) {
        const row = btnEl.closest('.audio-q-range-row');
        if (!row) return;
        const item = getRowItem(row);
        if (!item || !(item.end > item.start)) { notify('Set a valid range (start < end) for Q' + (item ? item.qText : ''), 'error'); return; }
        playQuestionRange(item.qNums[0], buildRangesSource(), true);
    }

    // 取某行的数据项（从 pendingRangeRows 或已存数据）
    function getRowItem(row) {
        const idx = Number(row.dataset.idx);
        const src = pendingRangeRows !== null ? pendingRangeRows : rowsFromRanges(getListeningRanges());
        return src[idx];
    }

    // 把当前行数组转成 {题号:{start,end}} 供播放用
    function buildRangesSource() {
        const src = pendingRangeRows !== null ? pendingRangeRows : rowsFromRanges(getListeningRanges());
        const out = {};
        src.forEach(r => { r.qNums.forEach(q => { out[q] = { start: r.start, end: r.end }; }); });
        return out;
    }

    // 保存全部行到 hw.listeningRanges
    function saveQuestionRanges() {
        const hw = getCurrentHomework();
        if (!hw) { notify('No homework selected', 'error'); return; }
        const src = pendingRangeRows !== null ? pendingRangeRows : rowsFromRanges(getListeningRanges());
        const cleaned = {};
        let invalid = 0;
        src.forEach(r => {
            if (r.qNums.length && r.end > r.start) {
                r.qNums.forEach(q => { cleaned[q] = { start: r.start, end: r.end }; });
            } else invalid++;
        });
        hw.listeningRanges = cleaned;
        pendingRangeRows = null;
        saveHomework(hw.id);
        renderQuestionRangeRows();
        renderQuestionGrid();
        notify(invalid > 0 ? `Saved (${invalid} invalid row(s) skipped)` : 'Question ranges saved', 'success');
    }

    // 上课：按题号播放区间（停掉旧的，从起点播到终点自动停）
    // twice=true 时连放两遍，中间停顿1秒；两遍未完期间拒绝接受新的题号点击
    function playQuestionRange(qNum, rangesSource, twice) {
        const audio = document.getElementById('listeningAudio');
        // 两遍未完保护：正在放两遍（含1秒间隔）时，不接受新点击
        if (currentQuestionRange && currentQuestionRange.busy && currentQuestionRange.qNum !== qNum) {
            notify('Still playing Q' + currentQuestionRange.qNum + ' twice, please wait', 'info');
            return;
        }
        if (!audio || !audio.src) {
            // 尝试加载
            loadListeningAudio();
            if (!audio.src) { notify('No listening audio. Import one via Data panel', 'info'); return; }
        }
        const ranges = rangesSource || getListeningRanges();
        const r = ranges[qNum];
        if (!r || !(r.end > r.start)) { notify('No range set for Q' + qNum, 'error'); return; }
        // 同一题再点=切换暂停/继续
        if (currentQuestionRange && currentQuestionRange.qNum === qNum && !audio.paused && !twice) {
            audio.pause();
            return;
        }
        audioRangeLoop = false;  // 关闭手动循环，避免冲突
        const loopBtn = document.getElementById('audioLoopBtn');
        if (loopBtn) loopBtn.classList.remove('active');
        currentQuestionRange = {
            qNum, start: r.start, end: r.end,
            twice: !!twice,      // 是否连放两遍
            pass: 1,             // 当前第几遍
            busy: !!twice        // 两遍播放期间锁定（含1秒间隔）
        };
        audio.currentTime = r.start;
        audio.play();
    }

    // 连放两遍的便捷入口
    function playQuestionRangeTwice(qNum, rangesSource) {
        playQuestionRange(qNum, rangesSource, true);
    }


    // 网格▶角标入口：确保面板已开、音频已加载，再播
    function playQuestionRangeFromGrid(qNum) {
        const hw = getCurrentHomework();
        if (!hw || !hw.listeningAudio) { notify('No listening audio. Import one via Data panel', 'info'); return; }
        const panel = document.getElementById('audioPlayerPanel');
        if (!panel.classList.contains('show')) {
            panel.classList.add('show');
        }
        loadListeningAudio();
        playQuestionRange(qNum);
    }

    // ===== PDF 导入（互斥锁：防止连续导入并发竞态） =====
    async function importPdf() {
        if (window.__pdfImporting) { notify('上一个文件仍在处理中，请等完成提示后再导入', 'error'); return; }
        window.__pdfImporting = true;
        try { await importPdfCore(); } finally { window.__pdfImporting = false; }
    }
    async function importPdfCore() {
        const input = document.getElementById('pdfFileInput');
        if (!input || input.files.length === 0) {
            notify('Please select a PDF file', 'error');
            return;
        }

        const hw = getCurrentHomework();
        if (!hw) {
            notify('Import Excel scores first, then the PDF', 'error');
            return;
        }

        const files = Array.from(input.files);
        let totalPages = 0, totalNewAnchors = 0, totalNewStrips = 0, okCount = 0;
        const examDetected = [];
        const examSamples = [];
        const pracJoined = [];   // ★应用文联动：每份PDF的全文文本（题干/范文识别用，与续写examSamples平行，互不影响）
           // 答案PDF范文HTML（收尾回填Composition步骤⑧）    // 本次导入识别到的语篇key（收尾提示用）
        let answerKeyHint = false;  // PDF含答案册警告
        for (let fi = 0; fi < files.length; fi++) {
            const file = files[fi];
            notify(`Importing PDF ${fi+1}/${files.length}: ${file.name}`, 'info');
        try {
            // 步骤1: 加载PDF.js库
            notify('Step 1/4: Loading PDF parser...', 'info');
            let pdfjsLib;
            try {
                pdfjsLib = await window.loadPdfJs();
                console.log('[AFR] PDF.js loaded, version:', pdfjsLib.version);
            } catch (loadErr) {
                console.error('[AFR] PDF.js load error:', loadErr);
                throw new Error('PDF解析库加载失败: ' + loadErr.message);
            }

            // 步骤2: 读取文件
            notify('Step 2/4: Reading PDF...', 'info');
            let arrayBuffer;
            try {
                arrayBuffer = await file.arrayBuffer();
                console.log('[AFR] PDF file read, size:', arrayBuffer.byteLength, 'bytes');
            } catch (readErr) {
                console.error('[AFR] File read error:', readErr);
                throw new Error('文件读取失败: ' + readErr.message);
            }

            if (arrayBuffer.byteLength === 0) {
                throw new Error('PDF文件为空（0字节），请确认文件是否损坏');
            }

            // 步骤3: 解析PDF
            notify('Step 3/4: Parsing pages...', 'info');
            let pdf;
            try {
                const loadingTask = pdfjsLib.getDocument({
                    data: new Uint8Array(arrayBuffer),
                    cMapUrl: 'libs/pdfjs-cmaps/', cMapPacked: true,   // 中文CID字体解码必需
                });
                pdf = await loadingTask.promise;
                console.log('[AFR] PDF parsed, pages:', pdf.numPages);
            } catch (parseErr) {
                console.error('[AFR] PDF parse error:', parseErr);
                // 如果是worker问题，尝试不用worker重试
                if (parseErr.message && parseErr.message.includes('worker')) {
                    console.log('[AFR] 尝试禁用Worker重试...');
                    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
                    const loadingTask2 = pdfjsLib.getDocument({
                        data: new Uint8Array(arrayBuffer),
                        cMapUrl: 'libs/pdfjs-cmaps/', cMapPacked: true,
                    });
                    try {
                        pdf = await loadingTask2.promise;
                        console.log('[AFR] PDF parsed without worker, pages:', pdf.numPages);
                    } catch (retryErr) {
                        throw new Error('PDF解析失败（Worker不可用）: ' + retryErr.message);
                    }
                } else {
                    throw new Error('PDF解析失败: ' + parseErr.message);
                }
            }

            // 逐页渲染为图片 + OCR识别题号位置
            // baseOffset：追加位置（全局pageIdx偏移），sourceId：本PDF来源标识（文件名）
            if (!hw.passages) hw.passages = [];
            const baseOffset = hw.passages.length;
            // sourceId加导入序号前缀，保证每次导入唯一（同名PDF也能拆成不同unit）
            const importSeq = Date.now().toString(36);
            const sourceId = (file.name || 'PDF').replace(/\.pdf$/i, '').slice(0, 40) + '_' + importSeq;
            const passages = [];
            const anchors = { __candidates: [] };  // 先收集所有候选，最后跨页去重
            const examPages = [];   // 本文件逐页文字层（语篇自动识别用）
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                notify(`Page ${pageNum}/${pdf.numPages}: rendering & detecting... (a few seconds each)`, 'info');
                const page = await pdf.getPage(pageNum);
                const viewport = page.getViewport({ scale: 2.0 }); // 2x 清晰度

                // 创建Canvas渲染PDF页面
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext('2d');

                await page.render({ canvasContext: ctx, viewport }).promise;

                // 转为base64图片
                const imageUrl = canvas.toDataURL('image/png');

                // 提取本页文字层（供MindMap语篇自动识别）；失败不影响导入
                let pageText = '';
                try {
                    pageText = await extractPdfPageText(page);
                } catch (txErr) {
                    console.warn('[AFR] 第' + pageNum + '页文字层提取失败:', txErr);
                }
                examPages.push({ pageIdx: baseOffset + pageNum - 1, text: pageText });

                passages.push({
                    id: `pdf-page-${baseOffset + pageNum}`,
                    title: `${sourceId} 第${pageNum}页`,
                    type: 'image',
                    imageUrl: imageUrl,
                    content: '',
                    textContent: pageText,   // 文字层纯文本（无文字层的扫描版为空串）
                    questions: [],
                    questionData: [],
                    sourceId,   // PDF来源标识，用于buildMaterialUnits拆分不同PDF
                });

                // OCR识别题号位置（基于文本层），pageIdx加baseOffset偏移
                try {
                    const pageCandidates = await detectQuestionAnchors(page, viewport, baseOffset + pageNum - 1);
                    pageCandidates.forEach(c => anchors.__candidates.push(c));
                } catch (ocrErr) {
                    console.warn('[AFR] 第' + pageNum + '页题号识别失败:', ocrErr);
                }

                // 检测横贯页面的分隔线（用户画的文题分界线，Split用）。找到第一条就停
                if (!hw.config) hw.config = { validQuestions: [] };
                if (hw.config.splitDivider === undefined || hw.config.splitDivider === null) {
                    const divY = await detectDividerLine(page, viewport);
                    if (divY !== null) {
                        hw.config.splitDivider = { pageIdx: baseOffset + pageNum - 1, yRatio: divY };
                        console.log('[AFR] 检测到分隔线: 第' + (baseOffset + pageNum) + '页 ' + Math.round(divY * 100) + '%');
                    }
                }
            }

            // 跨页去重：对每个题号，选择题干质量最高的候选
            const finalAnchors = deduplicateAnchors(anchors.__candidates);

            // 保存到当前作业：追加（不覆盖已有PDF），让多个PDF共存为不同素材单元
            hw.passages = hw.passages.concat(passages);
            // ★答案册检测（去空格匹配：PDF字距致"答 案"拆开，原连续词全部失灵；
            //   答案串如 1-5CBAAC 是铁证）。答案册的题号锚点是解析引用，位置无意义——不写入
            const bjBare = examPages.map(p => p.text || '').join('').replace(/\s+/g, '');
            const isAnsPdf = /参考答案|答案解析|英语答案|听力原文/.test(bjBare) || /\d{1,2}-\d{1,2}[A-E]{3,}/.test(bjBare);
            // 锚点合并：保护已有锚点（人工Pin或前一个PDF的），仅补充新题号
            if (!hw.config) hw.config = { validQuestions: [] };
            if (!hw.config.anchors) hw.config.anchors = {};
            let newCount = 0;
            if (!isAnsPdf) Object.keys(finalAnchors).forEach(qNum => {
                if (!hw.config.anchors[qNum]) {  // 已存在的不覆盖（保护人工Pin）
                    hw.config.anchors[qNum] = finalAnchors[qNum];
                    newCount++;
                }
            });

            // 题目条带自动检测（左文右题用）：只对本次导入的页且无已有条带的页填充
            if (!hw.config.questionStrips) hw.config.questionStrips = [];
            const existingPages = new Set(hw.config.questionStrips.map(s => s.pageIdx));
            const autoStrips = autoDetectStrips(anchors.__candidates)
                .filter(s => !existingPages.has(s.pageIdx));  // 已有条带(人工调整过)的页不覆盖
            hw.config.questionStrips = hw.config.questionStrips.concat(autoStrips)
                .sort((a, b) => a.pageIdx - b.pageIdx || a.startY - b.startY);
            totalNewStrips += autoStrips.length;

            // 试卷语篇自动识别：切分 Passage A-D / 七选五 / 完形 / 语法填空 / 读后续写
            try {
                const tIdx0 = performance.now();
                // joined先声明再使用（原行序在下方首次引用后才const，TDZ报错导致examIndex整体写入被跳过=阅读题定位失灵根因）
                const joined = examPages.map(p => p.text || '').join('\n');
                const examIdx = buildExamIndexFromPages(examPages, sourceId);
                console.info('[AFR] 语篇识别·结构切分 ' + Math.round(performance.now() - tIdx0) + 'ms（' + examPages.length + '页）');
                const keys = Object.keys(examIdx);
                if (keys.length) {
                    if (!hw.examIndex) hw.examIndex = {};
                    // 答案PDF的范文版CW（无Paragraph标记）不覆盖已有试卷正题CW；首导（无已有时）照常收
                    if (examIdx['Continuation Writing'] && hw.examIndex['Continuation Writing']) {
                        const tNew = examIdx['Continuation Writing'].text || '';
                        if (!/Paragraph\s*[12]\s*[:：]/i.test(tNew) && !/(注意|续写词数)/.test(tNew)) delete examIdx['Continuation Writing'];
                    }
                    const ekJoined = joined.replace(/\s+/g, '');
                    const ekIsAns = /参考答案|答案解析|英语答案|听力原文/.test(ekJoined) || /\d{1,2}-\d{1,2}[A-E]{3,}/.test(ekJoined);
                    if (!ekIsAns) Object.assign(hw.examIndex, examIdx);   // ★答案册不写语篇索引（防覆盖试卷板块位置）
                    examDetected.push(...keys);
                }
                const cwParsed = parseContinuationRaw(joined);
                if (cwParsed && (cwParsed.openers.length === 2 || !window.__cwParsed)) window.__cwParsed = cwParsed;   // 有段首句的结果优先（防答案流的范文区垃圾覆盖试卷正解）
                const sampleHtml = extractSampleFromPages(joined);
                if (sampleHtml) examSamples.push(sampleHtml);   // 答案PDF范文，收尾回填Composition步骤⑧
                pracJoined.push(joined);   // ★应用文联动：收全文（含题干/范文特征检测，收尾统一处理）
                if (/参考答案|答案解析|试题参考答案/.test(joined)) answerKeyHint = true;
            } catch (idxErr) {
                console.warn('[AFR] 语篇自动识别失败(不影响导入):', idxErr);
            }

            await saveHomework(hw.id);
            totalPages += pdf.numPages;
            totalNewAnchors += newCount;
            okCount++;

        } catch (err) {
            console.error('[AFR] PDF导入错误(' + file.name + '):', err);
            notify('PDF import failed (' + file.name + '): ' + (err.message || '未知错误'), 'error');
        }
        } // end for files

        // 全部文件处理完，统一收尾
        if (okCount > 0) {
            closeDataPanel();
            const anchorCount = hw.config && hw.config.anchors ? Object.keys(hw.config.anchors).length : 0;
            const unitCount = buildMaterialUnits(getCurrentHomework()).length;
            notify(`Imported ${okCount} PDF(s), ${totalPages} pages, ${totalNewAnchors} new anchors (total ${anchorCount}), ${unitCount} document(s) — use ◀ ▶ to switch`, 'success');
            // 无论当前在哪个视图，都重置渲染状态，确保评讲视图拿到新数据
            currentUnitIndex = 0;
            unitScrollMap = {};
            renderAll();          // 全视图刷新（含评讲导航条重建），杜绝"内存旧数据不显示新文档"
            if (state.currentView === 'review') {
                renderPassage();
            }
            if (examDetected.length) {
                notify('📄 已自动识别语篇：' + Array.from(new Set(examDetected)).join('、') + ' — MindMap 语篇下拉直读', 'success');
                refreshMmDiscourseBadges();
                // 读后续写语篇 → 自动转入 Composition 新建篇目（去重）
                try {
                    const cwHw = getCurrentHomework();
                    // __cwParsed（独立解析）只有段首句齐全(2条)才优先——不齐时openers缺失会连带范文锚定切分失效；
                    // 走examIndex路径（trimExamSlice已把答题卡式段首句标准化为Paragraph N:格式，识别更稳）
                    const cwOk = window.__cwParsed && window.__cwParsed.story
                        && window.__cwParsed.openers && window.__cwParsed.openers.filter(Boolean).length === 2;
                    const cw = cwOk ? { text: window.__cwParsed.story.join('\n') + '\n' + window.__cwParsed.openers.map((o, oi) => 'Paragraph ' + (oi + 1) + ': ' + o).join('\n') } : (cwHw && cwHw.examIndex && cwHw.examIndex['Continuation Writing']);
                    if (cw && cw.text && window.EssayReview && typeof EssayReview.ingestFromExam === 'function') {
                        const res = EssayReview.ingestFromExam(cw.text, cwHw.name || '试卷');
                        if (res && res.ok) setTimeout(() => notify('✍ 读后续写已自动转入 Composition：原文' + res.paras + '段 · 段首句' + res.openers + '/2', 'success'), 1600);
                        else if (res && res.dupe) setTimeout(() => notify('✍ Composition 已有该卷续写篇目，未重复创建', 'info'), 1600);
                    }
                } catch (cwErr) { console.warn('[AFR] 续写语篇联动Composition失败(不影响导入):', cwErr); }
                // 参考范文（答案PDF）→ 回填 Composition 步骤⑧
                // 用试卷侧已识别的段首句定位切分：段首句1前全弃（剔除应用文范文）· 段首句2处分两段 · 听力/中文处截尾
                try {
                    if (examSamples.length && window.EssayReview && typeof EssayReview.fillSampleFromExam === 'function') {
                        const fsHw = getCurrentHomework();
                        const groups = examSamples[examSamples.length - 1];   // ★组数组（答案册可能两篇续写范文）
                        // 段首句来源与建篇来源对齐：__cwParsed不齐时，从examIndex路径文本（trimExamSlice已标准化Paragraph N:）提取
                        const ops = (() => {
                            const fp = (window.__cwParsed && window.__cwParsed.openers || []).filter(o => o && !String(o).includes('未识别'));
                            if (fp.length === 2) return fp;
                            const eiCw = fsHw && fsHw.examIndex && fsHw.examIndex['Continuation Writing'];
                            const src2 = eiCw ? eiCw.text : '';
                            const mm2 = [];
                            let pm;
                            const pre = /para(?:graph)?\s*[12]\s*[:：]\s*([A-Z][^.!?\n]{10,})/gi;
                            while ((pm = pre.exec(src2)) !== null && mm2.length < 2) mm2.push(pm[1].trim());
                            return mm2;
                        })();
                        let sampleHtml = '';
                        if (ops.length === 2 && Array.isArray(groups)) {
                            const k1 = ops[0].split(/\s+/).slice(0, 4).join(' ');
                            const k2 = ops[1].split(/\s+/).slice(0, 4).join(' ');
                            groups.forEach((rawParas, gi) => {
                                const full = rawParas.join('\n');
                                const i1 = full.indexOf(k1), i2 = full.indexOf(k2);
                                if (i1 < 0 || i2 <= i1) return;
                                const p1 = full.slice(i1, i2).replace(/\n/g, ' ').trim();
                                // 段2：优先按段落边界（\n）截——隔离范文块后粘连的其他内容（完形解析等）；再做听力/中文兜底
                                const nl2 = full.indexOf('\n', i2);
                                let p2raw = full.slice(i2, nl2 >= 0 ? nl2 : undefined);
                                const stopM = p2raw.match(/Text\s*\d|[一-龥]{3,}/);
                                if (stopM && stopM.index > 0) p2raw = p2raw.slice(0, stopM.index);
                                const p2 = p2raw.replace(/\n/g, ' ').trim();
                                if ((p1.match(/[A-Za-z]/g) || []).length > 60 && (p2.match(/[A-Za-z]/g) || []).length > 60) {
                                    // 段前保留Paragraph N:标注（教师要求：范文段落带标注显示）
                                    sampleHtml += (groups.length > 1 ? '<p><b>范文' + (gi + 1) + '</b></p>' : '')
                                        + '<p><b>Paragraph 1:</b> ' + escapeHtml(p1) + '</p><p><b>Paragraph 2:</b> ' + escapeHtml(p2) + '</p>';
                                }
                            });
                        }
                        // 兜底：段首句缺失或切分全败 → 第一组原样回填；粘连的"Paragraph N:"字样处自动换行分段；旧数据兼容（examSamples历史存段数组）
                        const fallbackParas = Array.isArray(groups) ? groups[0] : groups;
                        if (!sampleHtml && fallbackParas && fallbackParas.length) {
                            sampleHtml = fallbackParas
                                .flatMap(p => String(p).split(/(?=[Pp]aragraph\s*\d\s*[:：])/))
                                .map(p => '<p>' + escapeHtml(p.trim()) + '</p>').join('');
                        }
                        const fsRes = EssayReview.fillSampleFromExam((fsHw && fsHw.name) || '试卷', sampleHtml);
                        if (fsRes && fsRes.ok) setTimeout(() => notify('📖 参考范文已自动回填 Composition 步骤⑧', 'success'), 3200);
                        else if (fsRes && fsRes.noArt) setTimeout(() => notify('ℹ 检测到范文但无对应续写篇——请先导入含读后续写原题的试卷PDF', 'info'), 3200);
                    }
                } catch (fsErr) { console.warn('[AFR] 范文回填失败(不影响导入):', fsErr); }
            }
            // ★应用文联动（与上方续写联动平级独立、零侵入续写逻辑；应用文卷无续写板块时 examDetected 为空，故不放在其内）
            try {
                if (pracJoined.length && window.EssayReview && typeof EssayReview.ingestPracticalFromExam === 'function') {
                    const ph = getCurrentHomework();
                    const pr = EssayReview.ingestPracticalFromExam(pracJoined.join('\n\n'), (ph && ph.name) || '试卷');
                    if (pr && pr.ok) setTimeout(() => notify('✉ 应用文已自动转入 Composition：题干 ' + pr.lines + ' 行——步骤①看题干，八步评讲内容可发AI生成', 'success'), 2000);
                }
                if (pracJoined.length && window.EssayReview && typeof EssayReview.extractPracticalSample === 'function' && typeof EssayReview.fillPracticalSampleFromExam === 'function') {
                    const ph2 = getCurrentHomework();
                    const appHtml = EssayReview.extractPracticalSample(pracJoined.join('\n\n'));
                    if (appHtml) {
                        const fr = EssayReview.fillPracticalSampleFromExam((ph2 && ph2.name) || '试卷', appHtml);
                        if (fr && fr.ok) setTimeout(() => notify('📖 应用文范文已自动回填步骤⑧', 'success'), 3600);
                    }
                }
            } catch (prErr) { console.warn('[AFR] 应用文联动失败(不影响导入):', prErr); }
            if (answerKeyHint) {
                setTimeout(() => notify('⚠ 本PDF含答案/解析部分：识别到的语篇可能混入答案内容，建议以试卷原卷为准', 'error'), examDetected.length ? 2800 : 0);
            }
        }
        // 清空input，允许再次选择相同文件
        input.value = '';
    }

    /**
     * OCR识别PDF某页的题号位置，建立题号→页面锚点映射
     * 通过PDF.js的文本层(getTextContent)定位题号，无需外部OCR服务
     * @param {Object} pdfPage - PDF.js的page对象
     * @param {Object} viewport - 该页的viewport（已设scale）
     * @param {number} pageIdx - 该页在passages数组中的索引(0-based)
     * @returns {Array} 候选列表 [{ qNum, pageIdx, yRatio, stem }]，供跨页去重
     */
    /**
     * 检测PDF某页中横贯页面的水平分隔线（用户在原文/题目交界处画的线）
     * 原理：读页面绘图指令(constructPath)，找横向跨度≥75%页宽的水平线段。
     * 试卷天然内容（表格线短、文字不连成线）不会误报。
     * @returns {number|null} 分隔线的yRatio（0-1，页面顶部为0），无则null
     */
    async function detectDividerLine(pdfPage, viewport) {
        try {
            const opList = await pdfPage.getOperatorList();
            const pageWidth = viewport.width / viewport.scale;
            const pageHeight = viewport.height / viewport.scale;
            const ops = opList.fnArray, args = opList.argsArray;
            let curX = 0, curY = 0;   // 当前路径点（PDF坐标系，左下原点）
            let dividerY = null;

            for (let i = 0; i < ops.length; i++) {
                if (ops[i] === pdfjsLib.OPS.constructPath) {
                    const [opsArr, coordsArr] = args[i];
                    // 遍历路径子指令：M=moveto L=lineto C=cubic R=rect等
                    let x = 0, y = 0;
                    for (let j = 0; j < opsArr.length; j++) {
                        const sub = opsArr[j];
                        if (sub === pdfjsLib.OPS.moveTo) {
                            x = coordsArr[j * 2]; y = coordsArr[j * 2 + 1];
                        } else if (sub === pdfjsLib.OPS.lineTo) {
                            const nx = coordsArr[j * 2], ny = coordsArr[j * 2 + 1];
                            // 水平线段：y相同，横向跨度≥75%页宽
                            if (Math.abs(ny - y) < 1 && Math.abs(nx - x) >= pageWidth * 0.75) {
                                // PDF坐标y（底部为0）→ 顶部为0的ratio
                                const ratio = 1 - (ny / pageHeight);
                                // 排除页眉/页脚区（试卷每页页眉有横线，y<12%是页眉、y>90%是页脚）
                                if (ratio > 0.12 && ratio < 0.90) dividerY = ratio;
                            }
                            x = nx; y = ny;
                        } else if (sub === pdfjsLib.OPS.rectangle) {
                            // 矩形：宽≥75%页宽且高很小（细横条）
                            const rx = coordsArr[j * 2], ry = coordsArr[j * 2 + 1];
                            const rw = coordsArr[j * 2 + 2], rh = coordsArr[j * 2 + 3];
                            if (rw >= pageWidth * 0.75 && rh <= 4) {
                                const ratio = 1 - ((ry + rh / 2) / pageHeight);
                                if (ratio > 0.12 && ratio < 0.90) dividerY = ratio;
                            }
                        }
                    }
                }
            }
            return dividerY;
        } catch (err) {
            console.warn('[AFR] 分隔线检测失败:', err);
            return null;
        }
    }

    async function detectQuestionAnchors(pdfPage, viewport, pageIdx) {
        const candidates = [];
        const textContent = await pdfPage.getTextContent();
        const pdfHeight = viewport.height / viewport.scale;

        // 1. 按行合并文本项：相同Y坐标(transform[5])的项归为同一行
        const lineMap = new Map();
        textContent.items.forEach(item => {
            const str = item.str || '';
            if (!str) return;
            const y = item.transform[5]; // PDF坐标系Y（左下原点，向上为正）
            const yKey = Math.round(y);
            if (!lineMap.has(yKey)) {
                lineMap.set(yKey, { text: '', y: y });
            }
            lineMap.get(yKey).text += str;
        });

        const seen = new Set(); // 同一页内同一题号只取第一次出现

        // 2. 遍历每一行，匹配行首题号
        Array.from(lineMap.values()).forEach(line => {
            const text = line.text.trim();
            // ★题号区间标注（"36-40 A. This..."）：七选五等题号不在行首的题型，
            //   教师在题目区标注区间字样→锚定区间内全部题号。排除答案串（"1-5 CBAAC"区间后紧跟连续选项字母组）
            const rangeM = text.match(/^(\d{1,2})\s*[-–—~]\s*(\d{1,2})\b(?!\s*[A-E]{3})/);
            if (rangeM) {
                const ra = parseInt(rangeM[1]), rb = parseInt(rangeM[2]);
                if (ra >= 1 && rb <= 67 && rb > ra && rb - ra >= 2) {
                    const yr = 1 - (line.y / pdfHeight);
                    if (yr >= 0 && yr <= 1) {
                        for (let q = ra; q <= rb; q++) {
                            if (!seen.has(q)) {
                                candidates.push({ qNum: q, pageIdx, yRatio: parseFloat(yr.toFixed(4)), stem: '标注' + ra + '-' + rb + ' ' + text.slice(0, 40) });
                                seen.add(q);
                            }
                        }
                    }
                }
                return;
            }
            // 匹配行首题号：1~2位数字 + 句点 + 后续内容
            const match = text.match(/^(\d{1,2})\s*[.．、]\s*(.+)/);
            if (!match) return;

            const qNum = parseInt(match[1]);
            if (qNum < 1 || qNum > 67) return;
            if (seen.has(qNum)) return;

            const stem = match[2].trim();
            // 排除明显干扰：纯中文（写作要求"1.续写词数..."）、过短、纯数字
            // 真实题干通常以英文字母开头或包含英文单词
            const hasEnglish = /[A-Za-z]{2,}/.test(stem);
            const isPureChinese = /^[一-龥]/.test(stem) && !hasEnglish;
            if (isPureChinese) return;
            // 排除写作要求类："词数应为"/"按如下格式"
            if (/词数|格式|答题卡|注意/.test(stem)) return;

            const yRatio = 1 - (line.y / pdfHeight);
            if (yRatio < 0 || yRatio > 1) return;

            candidates.push({
                qNum,
                pageIdx,
                yRatio: parseFloat(yRatio.toFixed(4)),
                stem: stem.slice(0, 80),  // 截断用于质量评分
            });
            seen.add(qNum);
        });

        return candidates;
    }

    /**
     * 跨页去重：对每个题号，选择题干质量最高的候选
     * 质量评分依据：英文单词数量越多、长度越长，越可能是真实题干
     * @param {Array} candidates - 所有页面的候选列表
     * @returns {Object} { 题号: { pageIdx, yRatio } }
     */
    function deduplicateAnchors(candidates) {
        const byQuestion = {}; // qNum -> [候选...]
        candidates.forEach(c => {
            if (!byQuestion[c.qNum]) byQuestion[c.qNum] = [];
            byQuestion[c.qNum].push(c);
        });

        const result = {};
        Object.keys(byQuestion).forEach(qNum => {
            const list = byQuestion[qNum];
            // 评分：英文单词数 + 题干长度
            const scored = list.map(c => {
                const englishWords = (c.stem.match(/[A-Za-z]{2,}/g) || []).length;
                const score = englishWords * 10 + c.stem.length;
                return { c, score };
            });
            scored.sort((a, b) => b.score - a.score);
            const best = scored[0].c;
            result[qNum] = { pageIdx: best.pageIdx, yRatio: best.yRatio };
        });

        return result;
    }

    /**
     * 从锚点候选自动检测题目条带（OCR预填，左文右题用）
     * 策略：同页按y排序，相邻题号y间距<0.28合并为一块；
     *       startY=首题上移0.015；endY=下块首题上移0.015或末题下延（按块长度估）。
     * @param {Array} candidates - detectQuestionAnchors的原始候选（含qNum/pageIdx/yRatio）
     * @returns {Array} 条带 [{id,pageIdx,startY,endY,qNums,source:'auto'}]
     */
    function autoDetectStrips(candidates) {
        const strips = [];
        // 按页分组
        const byPage = {};
        candidates.forEach(c => {
            if (!byPage[c.pageIdx]) byPage[c.pageIdx] = [];
            byPage[c.pageIdx].push(c);
        });
        Object.keys(byPage).map(Number).forEach(pageIdx => {
            const list = byPage[pageIdx].sort((a, b) => a.yRatio - b.yRatio);
            // 分块：y间距>=0.28断开
            const blocks = [[list[0]]];
            for (let i = 1; i < list.length; i++) {
                const prev = blocks[blocks.length - 1];
                if (list[i].yRatio - prev[prev.length - 1].yRatio < 0.28) {
                    prev.push(list[i]);
                } else {
                    blocks.push([list[i]]);
                }
            }
            blocks.forEach((block, bi) => {
                const firstY = block[0].yRatio;
                const lastY = block[block.length - 1].yRatio;
                const nextBlockFirst = (bi + 1 < blocks.length) ? blocks[bi + 1][0].yRatio : null;
                const startY = Math.max(0, firstY - 0.015);
                // endY：优先用下一块首题位置；否则按块内题数估长度
                const estEnd = lastY + block.length * 0.06 + 0.02;
                let endY = nextBlockFirst !== null
                    ? Math.min(nextBlockFirst - 0.015, estEnd)
                    : Math.min(1, lastY + 0.25);
                endY = Math.min(1, Math.max(endY, lastY + 0.03));  // 至少盖住末题
                if (endY - startY < 0.02) return;  // 太薄跳过
                strips.push({
                    id: 'auto-' + pageIdx + '-' + bi,
                    pageIdx,
                    startY: parseFloat(startY.toFixed(4)),
                    endY: parseFloat(endY.toFixed(4)),
                    qNums: block.map(c => c.qNum).sort((a, b) => a - b),
                    source: 'auto',
                });
            });
        });
        return strips;
    }

    /**
     * 判断当前作业是否处于连续滚动模式
     * 条件：有passages 且 全部为 type:'image'（PDF导入的图片）
     */
    /**
     * 把 passages 数组按"素材单元"分组（渲染期虚拟分组，不改数据）
     * 规则：连续的 image passages 合并为1个unit（一个PDF整体）；text/webpage 各自独立
     * @returns {Array} [{ unitIndex, startIndex, endIndex, type, title, passages:[] }]
     */
    function buildMaterialUnits(hw) {
        if (!hw || !hw.passages || hw.passages.length === 0) return [];
        const units = [];
        let i = 0;
        while (i < hw.passages.length) {
            const p = hw.passages[i];
            if (p.type === 'image') {
                // 收集连续的 image passages，且 sourceId 相同（不同PDF拆成不同unit）
                const start = i;
                const srcId = p.sourceId;
                while (i < hw.passages.length
                       && hw.passages[i].type === 'image'
                       && hw.passages[i].sourceId === srcId) i++;
                const groupPassages = hw.passages.slice(start, i);
                const first = groupPassages[0];
                // 优先用自定义标题，否则自动生成（文件名+页数）
                const autoLabel = srcId ? `${srcId} (${groupPassages.length}p)` : `PDF (${groupPassages.length} pages)`;
                const label = (first && first.customTitle) ? first.customTitle : autoLabel;
                units.push({
                    unitIndex: units.length,
                    startIndex: start,
                    endIndex: i - 1,
                    type: 'image',
                    title: label,
                    passages: groupPassages,
                });
            } else {
                // text / webpage 各自独立成unit
                const autoLabel = p.title || (p.type === 'webpage' ? '网页链接' : '文本原文');
                units.push({
                    unitIndex: units.length,
                    startIndex: i,
                    endIndex: i,
                    type: p.type,
                    title: p.customTitle || autoLabel,
                    passages: [p],
                });
                i++;
            }
        }
        return units;
    }

    /**
     * 根据全局passages索引，反查属于哪个unit
     * @returns {Object|null} unit对象 或 null
     */
    function findUnitByPageIdx(units, pageIdx) {
        return units.find(u => pageIdx >= u.startIndex && pageIdx <= u.endIndex) || null;
    }

    // ===== 空白新建作业（无成绩场景：审题训练等） =====
    // ===== header创建练习快捷入口 =====
    function openCreateHwModal() {
        const ov = document.getElementById('createHwOverlay');
        if (!ov) return;
        ov.classList.add('show');
        const inp = document.getElementById('createHwInput');
        if (inp) { inp.value = ''; setTimeout(() => inp.focus(), 60); }
    }
    function closeCreateHwModal() {
        const ov = document.getElementById('createHwOverlay');
        if (ov) ov.classList.remove('show');
    }
    function confirmCreateHw() {
        const inp = document.getElementById('createHwInput');
        const name = (inp && inp.value.trim()) || ('练习 ' + new Date().toISOString().slice(5, 10));
        const hidden = document.getElementById('blankHwNameInput');
        if (hidden) hidden.value = name;   // 复用createBlankHomework的读值逻辑
        createBlankHomework();
        closeCreateHwModal();
        setTimeout(() => { openDataPanel(); }, 250);   // 创建后直达导入面板
    }

    function createBlankHomework() {
        const input = document.getElementById('blankHwNameInput');
        const name = (input && input.value.trim()) || '练习 ' + new Date().toISOString().slice(5, 10);
        const hwId = 'hw-' + Date.now();
        const hw = {
            id: hwId,
            name,
            date: new Date().toISOString().slice(0, 10),
            scores: { class9: [], class11: [] },
            questions: { class9: [], class11: [] },
            passages: [],
            knowledge: {},
            config: { validQuestions: [] },
        };
        homeworks[hwId] = hw;
        homeworkOrder.unshift(hwId);
        state.currentHomework = hwId;
        saveAppState();
        saveHomework(hwId);
        renderHomeworkMenu();
        renderAll();
        if (input) input.value = '';
        notify(`已创建"${name}"——现在可以导入PDF/文本/音频了`, 'success');
    }

    // ===== 文本原文导入 =====
    function importText() {
        const textarea = document.getElementById('textInputArea');
        if (!textarea) return;

        const rawText = textarea.value.trim();
        if (!rawText) {
            notify('Please paste or type the passage first', 'error');
            return;
        }

        const hw = getCurrentHomework();
        if (!hw) {
            notify('Import Excel scores first', 'error');
            return;
        }

        // 按空行分段
        const paragraphs = rawText.split(/\n\s*\n/).filter(p => p.trim());
        if (paragraphs.length === 0) {
            notify('No valid content found', 'error');
            return;
        }

        const timestamp = Date.now();
        const passages = paragraphs.map((text, i) => {
            // 将段落内的单个换行转为 <br>，段落整体用 <p> 包裹
            const htmlContent = '<p>' + text.trim().replace(/\n/g, '<br>') + '</p>';
            return {
                id: 'text-' + timestamp + '-' + i,
                title: '文本段落 ' + (i + 1),
                type: 'text',
                content: htmlContent,
                imageUrl: '',
                questions: [],
                questionData: [],
            };
        });

        // 追加到已有 passages 末尾
        if (!hw.passages) hw.passages = [];
        hw.passages = hw.passages.concat(passages);

        saveHomework(hw.id);
        closeDataPanel();

        const totalPassages = hw.passages.length;
        const addedCount = passages.length;
        notify(`Text saved! ${addedCount} new, ${totalPassages} total`, 'success');

        if (state.currentView === 'review') {
            // 跳到第一段新文本对应的unit
            const units = buildMaterialUnits(hw);
            const u = findUnitByPageIdx(units, totalPassages - addedCount);
            if (u) currentUnitIndex = u.unitIndex;
            renderPassage();
        }
    }

    function clearText() {
        const textarea = document.getElementById('textInputArea');
        if (textarea) {
            textarea.value = '';
            notify('Text cleared', 'info');
        }
    }

    // ===== 网页链接导入 =====
    async function importUrl() {
        const input = document.getElementById('urlInput');
        const titleInput = document.getElementById('urlTitleInput');
        if (!input) return;
        const url = input.value.trim();
        const customTitle = titleInput ? titleInput.value.trim() : '';
        if (!url) {
            notify('Please enter a URL', 'error');
            return;
        }

        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            notify('URL must start with http:// or https://', 'error');
            return;
        }

        const hw = getCurrentHomework();
        if (!hw) {
            notify('Import Excel scores first', 'error');
            return;
        }

        try {
            notify('Web link added, loading...', 'info');

            // 直接用iframe加载原网页（不依赖CORS代理，稳定可靠）
            // 注意：部分网站设了X-Frame-Options/CSP防嵌入，会显示空白，属正常限制
            const passage = {
                id: 'url-' + Date.now(),
                title: customTitle || url,
                type: 'webpage',
                url: url,
                content: '',  // iframe直接用src加载，不需要抓取HTML
                imageUrl: '',
                questions: [],
                questionData: [],
            };

            if (!hw.passages) hw.passages = [];
            hw.passages.push(passage);

            await saveHomework(hw.id);
            closeDataPanel();

            currentPassagePage = hw.passages.length - 1;
            // 跳到新加网页对应的unit
            const units = buildMaterialUnits(hw);
            const u = findUnitByPageIdx(units, hw.passages.length - 1);
            if (u) currentUnitIndex = u.unitIndex;
            notify('Web content fetched and saved!', 'success');

            if (state.currentView === 'review') {
                renderPassage();
            }

        } catch (err) {
            console.error('[AFR] URL导入错误:', err);
            notify('Web fetch failed: ' + (err.message || '未知错误'), 'error');
        }
    }

    function clearUrlInput() {
        const titleInput = document.getElementById('urlTitleInput');
        const urlInput = document.getElementById('urlInput');
        if (titleInput) titleInput.value = '';
        if (urlInput) urlInput.value = '';
    }

    // ===== DOCX 导入 =====
    async function importDocx() {
        const input = document.getElementById('docxFileInput');
        if (!input || input.files.length === 0) {
            notify('Please select a .docx file', 'error');
            return;
        }

        const file = input.files[0];
        const hw = getCurrentHomework();
        if (!hw) {
            notify('Import Excel scores first', 'error');
            return;
        }

        try {
            // 加载 JSZip
            if (typeof JSZip === 'undefined') {
                try { await loadScript('libs/jszip.min.js'); }
                catch { try { await loadScript('https://cdn.jsdelivr.net/npm/jszip@3/dist/jszip.min.js'); }
                catch { throw new Error('JSZip库加载失败'); } }
            }

            notify('Parsing DOCX...', 'info');

            const arrayBuffer = await file.arrayBuffer();
            const zip = await JSZip.loadAsync(arrayBuffer);

            // 优先尝试 word/htmlDocument.html（WPS 特有）
            let htmlContent = null;
            const htmlFile = zip.file('word/htmlDocument.html');
            if (htmlFile) {
                htmlContent = await htmlFile.async('string');
            }

            // 回退：解析 word/document.xml
            if (!htmlContent) {
                const xmlFile = zip.file('word/document.xml');
                if (!xmlFile) throw new Error('无法读取文档内容');
                const xml = await xmlFile.async('string');
                htmlContent = parseDocxXml(xml);
            }

            if (!htmlContent || !htmlContent.trim()) {
                throw new Error('文档内容为空');
            }

            // 按段落分段（<p> 标签）
            const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
            const paragraphs = [];
            let match;
            while ((match = pRegex.exec(htmlContent)) !== null) {
                const text = match[1].replace(/<[^>]+>/g, '').trim();
                if (text) paragraphs.push('<p>' + match[1] + '</p>');
            }

            // 如果没有 <p> 标签，按换行分段
            if (paragraphs.length === 0) {
                const lines = htmlContent.split(/\n+/).filter(l => l.trim());
                paragraphs.push(...lines.map(l => '<p>' + l.trim() + '</p>'));
            }

            // 将所有段落合并为一个 passage
            const passage = {
                id: 'docx-' + Date.now(),
                title: file.name.replace(/\.docx$/i, ''),
                type: 'text',
                content: paragraphs.join(''),
                imageUrl: '',
                questions: [],
                questionData: [],
            };

            if (!hw.passages) hw.passages = [];
            hw.passages.push(passage);

            await saveHomework(hw.id);
            closeDataPanel();

            const totalPassages = hw.passages.length;
            currentPassagePage = totalPassages - 1; // 跳到新导入的页面
            const units = buildMaterialUnits(hw);
            const u = findUnitByPageIdx(units, totalPassages - 1);
            if (u) currentUnitIndex = u.unitIndex;
            notify(`DOCX imported! ${paragraphs.length} paragraphs`, 'success');

            if (state.currentView === 'review') {
                renderPassage();
            }

        } catch (err) {
            console.error('[AFR] DOCX导入错误:', err);
            notify('DOCX import failed: ' + (err.message || '未知错误'), 'error');
        }
    }

    /**
     * 导入 PPT(.pptx)：每页渲染成图片，逐页显示在评讲视图
     * 原理：pptx 是 OOXML 压缩包，JSZip 解压 → 读 slideN.xml 提取文字+图片关系
     * → 拼成 DOM → html2canvas 转 PNG → 复用 image passage 流程
     */
    async function importPptx() {
        const input = document.getElementById('pptxFileInput');
        if (!input || input.files.length === 0) {
            notify('Please select a .pptx file', 'error');
            return;
        }
        const file = input.files[0];
        if (!file.name.toLowerCase().endsWith('.pptx')) {
            notify('Only .pptx is supported (not .ppt)', 'error');
            return;
        }
        const hw = getCurrentHomework();
        if (!hw) { notify('Import Excel scores first', 'error'); return; }

        try {
            // 加载 JSZip
            if (typeof JSZip === 'undefined') {
                try { await loadScript('libs/jszip.min.js'); }
                catch { try { await loadScript('https://cdn.jsdelivr.net/npm/jszip@3/dist/jszip.min.js'); }
                catch { throw new Error('JSZip library load failed'); } }
            }
            if (typeof html2canvas === 'undefined') {
                throw new Error('html2canvas library not loaded');
            }

            notify('Parsing PPTX...', 'info');
            const arrayBuffer = await file.arrayBuffer();
            const zip = await JSZip.loadAsync(arrayBuffer);

            // 收集所有 slide 文件，按页号排序
            const slideFiles = Object.keys(zip.files)
                .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
                .sort((a, b) => slideNum(a) - slideNum(b));

            if (slideFiles.length === 0) {
                notify('No slides found in this .pptx', 'error');
                return;
            }

            const passages = [];
            for (let i = 0; i < slideFiles.length; i++) {
                const slidePath = slideFiles[i];
                const num = slideNum(slidePath);
                notify(`Rendering slide ${num}/${slideFiles.length}...`, 'info');
                const imageUrl = await renderSlideToImage(zip, slidePath);
                passages.push({
                    id: `pptx-slide-${num}`,
                    title: `Slide ${num}`,
                    type: 'image',
                    imageUrl: imageUrl,
                    content: '',
                    questions: [],
                    questionData: [],
                });
            }

            if (!hw.passages) hw.passages = [];
            passages.forEach(p => hw.passages.push(p));
            await saveHomework(hw.id);
            closeDataPanel();

            const totalPassages = hw.passages.length;
            currentPassagePage = totalPassages - passages.length; // 跳到PPT首页
            const units = buildMaterialUnits(hw);
            const u = findUnitByPageIdx(units, totalPassages - passages.length);
            if (u) currentUnitIndex = u.unitIndex;
            notify(`PPTX imported! ${passages.length} slides`, 'success');

            if (state.currentView === 'review') {
                renderPassage();
            }
        } catch (err) {
            console.error('[AFR] PPTX导入错误:', err);
            notify('PPTX import failed: ' + (err.message || 'unknown error'), 'error');
        }
    }

    // 从路径 "ppt/slides/slide3.xml" 提取页号 3
    function slideNum(path) {
        const m = path.match(/slide(\d+)\.xml$/);
        return m ? parseInt(m[1], 10) : 0;
    }

    // 渲染单页 slide 为 PNG dataURL
    async function renderSlideToImage(zip, slidePath) {
        const slideXml = await zip.file(slidePath).async('string');
        const slideDir = slidePath.replace(/slide\d+\.xml$/, '');
        const num = slideNum(slidePath);

        // 1. 提取文字（<a:t> 标签内容，按段落）
        const texts = [];
        const textRe = /<a:t>([\s\S]*?)<\/a:t>/g;
        let tm;
        while ((tm = textRe.exec(slideXml)) !== null) {
            const t = decodeXmlEntities(tm[1]).trim();
            if (t) texts.push(t);
        }

        // 2. 提取图片关系：先从 slide rels 找 rId → media 文件
        const relsPath = `${slideDir}_rels/slide${num}.xml.rels`;
        const relsFile = zip.file(relsPath);
        const rIdToMedia = {};
        if (relsFile) {
            const relsXml = await relsFile.async('string');
            const relRe = /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g;
            let rm;
            while ((rm = relRe.exec(relsXml)) !== null) {
                if (rm[2].includes('media/')) {
                    // Target 形如 ../media/image1.png
                    rIdToMedia[rm[1]] = 'ppt/' + rm[2].replace(/^\.\.\//, '');
                }
            }
        }
        // 从 slideXml 找 <a:blip r:embed="rIdX">
        const embedRe = /<a:blip[^>]*r:embed="([^"]+)"/g;
        const mediaPaths = [];
        let em;
        while ((em = embedRe.exec(slideXml)) !== null) {
            const mp = rIdToMedia[em[1]];
            if (mp && !mediaPaths.includes(mp)) mediaPaths.push(mp);
        }

        // 3. 读取媒体为 dataURL
        const imageUrls = [];
        for (const mp of mediaPaths) {
            const mf = zip.file(mp);
            if (mf) {
                const ext = (mp.match(/\.(\w+)$/) || [,'png'])[1].toLowerCase();
                const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
                    : ext === 'png' ? 'image/png'
                    : ext === 'gif' ? 'image/gif'
                    : 'image/png';
                const b64 = await mf.async('base64');
                imageUrls.push(`data:${mime};base64,${b64}`);
            }
        }

        // 4. 拼成 DOM，html2canvas 转图（白底、16:9、文字+图片自上而下）
        const tmp = document.createElement('div');
        tmp.style.cssText = 'position:fixed;left:-9999px;top:0;width:960px;min-height:540px;background:#fff;padding:40px;box-sizing:border-box;font-family:"Microsoft YaHei",Arial,sans-serif;';
        if (texts.length === 0 && imageUrls.length === 0) {
            tmp.innerHTML = '<div style="color:#999;font-size:24px;text-align:center;margin-top:200px">(Empty slide)</div>';
        } else {
            // 第一条文字作标题（大号），其余作正文
            if (texts.length > 0) {
                const h = document.createElement('div');
                h.textContent = texts[0];
                h.style.cssText = 'font-size:32px;font-weight:700;color:#222;margin-bottom:20px;';
                tmp.appendChild(h);
            }
            texts.slice(1).forEach(t => {
                const p = document.createElement('div');
                p.textContent = t;
                p.style.cssText = 'font-size:20px;color:#333;margin:8px 0;line-height:1.5;';
                tmp.appendChild(p);
            });
            imageUrls.forEach(u => {
                const img = document.createElement('img');
                img.src = u;
                img.style.cssText = 'max-width:100%;margin:12px 0;border-radius:4px;';
                tmp.appendChild(img);
            });
        }
        document.body.appendChild(tmp);
        // 等图片加载
        await Promise.all([...tmp.querySelectorAll('img')].map(img =>
            img.complete ? Promise.resolve() : new Promise(res => { img.onload = res; img.onerror = res; })
        ));
        const canvas = await html2canvas(tmp, { scale: 2, backgroundColor: '#fff', useCORS: true });
        document.body.removeChild(tmp);
        return canvas.toDataURL('image/png');
    }

    function decodeXmlEntities(s) {
        return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
                .replace(/&amp;/g, '&');
    }

    // 清除 PPT 数据
    function clearPptxData() {
        const hw = getCurrentHomework();
        if (!hw) return;
        if (!hw.passages || hw.passages.length === 0) { notify('No passage data', 'info'); return; }
        const before = hw.passages.length;
        hw.passages = hw.passages.filter(p => !p.id || !p.id.startsWith('pptx-slide-'));
        const removed = before - hw.passages.length;
        if (removed === 0) { notify('No PPT data to clear', 'info'); return; }
        saveHomework(hw.id);
        currentPassagePage = 0;
        if (state.currentView === 'review') renderPassage();
        notify(`Cleared ${removed} slide(s)`, 'success');
    }

    /**
     * 从 docx 的 document.xml 提取文本并转为 HTML
     * 保留段落结构、加粗、斜体、下划线
     */
    function parseDocxXml(xml) {
        // 提取 <w:body> 内容
        const bodyMatch = xml.match(/<w:body>([\s\S]*?)<\/w:body>/);
        if (!bodyMatch) return '';
        const body = bodyMatch[1];

        // 按 <w:p> 分段
        const pBlocks = body.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || [];
        const htmlParts = [];

        pBlocks.forEach(pBlock => {
            // 提取 <w:r> 块（run）
            const rBlocks = pBlock.match(/<w:r[\s>][\s\S]*?<\/w:r>/g) || [];
            let paraText = '';
            let isBold = false;
            let isItalic = false;
            let isUnderline = false;
            let hasContent = false;

            rBlocks.forEach(rBlock => {
                // 检查格式
                const rPrMatch = rBlock.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
                const rPr = rPrMatch ? rPrMatch[1] : '';
                const bold = rPr.includes('<w:b') || rPr.includes('<w:bCs');
                const italic = rPr.includes('<w:i') || rPr.includes('<w:iCs');
                const underline = rPr.includes('<w:u ');

                // 提取文本
                const tMatch = rBlock.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/);
                const text = tMatch ? tMatch[1] : '';

                // 检查换行
                const hasBreak = rBlock.includes('<w:br');

                if (text) {
                    let formatted = text;
                    if (bold) formatted = '<strong>' + formatted + '</strong>';
                    if (italic) formatted = '<em>' + formatted + '</em>';
                    if (underline) formatted = '<u>' + formatted + '</u>';
                    paraText += formatted;
                    hasContent = true;
                }

                if (hasBreak) {
                    paraText += '<br>';
                }
            });

            // 检查段落级对齐
            const pPrMatch = pBlock.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/);
            let align = '';
            if (pPrMatch) {
                const jcMatch = pPrMatch[1].match(/<w:jc w:val="([^"]+)"/);
                if (jcMatch) {
                    const jcVal = jcMatch[1];
                    if (jcVal === 'center') align = ' style="text-align:center"';
                    else if (jcVal === 'right') align = ' style="text-align:right"';
                }
                // 段落级加粗
                if (pPrMatch[1].includes('<w:b') || pPrMatch[1].includes('<w:bCs')) {
                    paraText = '<strong>' + paraText + '</strong>';
                }
            }

            if (hasContent) {
                htmlParts.push('<p' + align + '>' + paraText + '</p>');
            }
        });

        return htmlParts.join('');
    }

    // ===== Excel 导入（importData(true)=Replace模式：只换当前作业成绩，笔记/PDF/锚点全保留） =====
    function importData(replace) {
        const scoresInput = document.getElementById('scoresFileInput');
        const questionsInput = document.getElementById('questionsFileInput');

        // 优先使用成绩文件（可自动计算题目统计）
        const file = scoresInput.files[0] || questionsInput.files[0];

        if (!file) {
            notify('Please select a file first', 'error');
            return;
        }

        // 计算有效题目范围（新建/替换共用）
        const buildValidQuestions = (questions, validFromExcel) => {
            if (validFromExcel && validFromExcel.length > 0) return validFromExcel;
            const allQIds = new Set();
            ['class9', 'class11'].forEach(cls => {
                (questions[cls] || []).forEach(q => allQIds.add(q.id));
            });
            return Array.from(allQIds).sort((a, b) => a - b);
        };

        if (replace) {
            // ===== Replace模式：替换当前作业的成绩，其余字段原封不动 =====
            const curHw = getCurrentHomework();
            if (!curHw) {
                notify('No current assignment. Use Import to create one first', 'error');
                return;
            }
            readExcelFile(file).then(result => {
                curHw.scores = result.scores;
                curHw.questions = result.questions;
                if (!curHw.config) curHw.config = { validQuestions: [] };
                curHw.config.validQuestions = buildValidQuestions(result.questions, result.validQuestions);
                saveHomework(curHw.id);
                renderAll();
                closeDataPanel();
                notify(`Scores replaced! Class9 ${curHw.scores.class9.length}, Class11 ${curHw.scores.class11.length} — notes/PDF/anchors all kept`, 'success');
            }).catch(err => {
                notify('Replace failed: ' + err.message, 'error');
                console.error(err);
            });
            return;
        }

        // ===== Import模式：永远导入当前作业（绝不新建练习）；作业名保持用户创建时命名 =====
        let curHw2 = getCurrentHomework();
        if (!curHw2) curHw2 = ensureCurrentHomework('练习 ' + new Date().toISOString().slice(5, 10));   // 空库兜底
        readExcelFile(file).then(result => {
            curHw2.scores = result.scores;
            curHw2.questions = result.questions;
            if (!curHw2.config) curHw2.config = { validQuestions: [] };
            curHw2.config.validQuestions = buildValidQuestions(result.questions, result.validQuestions);
            saveHomework(curHw2.id);
            renderHomeworkMenu();
            renderAll();
            closeDataPanel();
            notify(`导入成功！已存入"${curHw2.name}"——9班${curHw2.scores.class9.length}人，11班${curHw2.scores.class11.length}人，有效题${curHw2.config.validQuestions.length}道`, 'success');
        }).catch(err => {
            notify('Import failed: ' + err.message, 'error');
            console.error(err);
        });
    }

    function ensureCurrentHomework(name) {
        if (!state.currentHomework) {
            const id = 'hw-' + Date.now();
            homeworks[id] = {
                id,
                name: name,
                date: new Date().toISOString().slice(0, 10),
                scores: { class9: [], class11: [] },
                questions: { class9: [], class11: [] },
                passages: [],
                knowledge: {},
                config: { validQuestions: [] },
            };
            homeworkOrder.unshift(id);
            state.currentHomework = id;
        }
        return homeworks[state.currentHomework];
    }

    function readExcelFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    if (typeof XLSX === 'undefined') {
                        throw new Error('SheetJS库未加载，请刷新页面重试');
                    }
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });

                    // ====== 答题明细格式（网上阅卷导出：客观题填涂/学生明细）自动识别，走独立解析器 ======
                    if (workbook.SheetNames.some(n => n.includes('客观题填涂') || n.includes('学生明细'))) {
                        resolve(parseAnswerDetailWorkbook(workbook));
                        return;
                    }

                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

                    // ====== 读取字体颜色，识别红色有效题目 ======
                    const redQuestionNums = await detectRedQuestions(data);
                    console.log('[AFR] 红色题号（有效题）:', redQuestionNums);

                    // 方案：用 header:1 获取二维数组，手动定位表头行
                    const allRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });

                    // 找到表头行（包含"姓名"关键字的行）
                    let headerRowIndex = -1;
                    for (let i = 0; i < Math.min(allRows.length, 10); i++) {
                        const rowStr = (allRows[i] || []).join(',');
                        if (rowStr.includes('姓名') && rowStr.includes('班级')) {
                            headerRowIndex = i;
                            break;
                        }
                    }

                    if (headerRowIndex === -1) {
                        throw new Error('Header row not found（需包含"姓名"和"班级"列）');
                    }

                    // 提取标题行（表头之前的行）
                    let titleText = '';
                    for (let i = 0; i < headerRowIndex; i++) {
                        const row = allRows[i] || [];
                        if (row[0] && String(row[0]).length > 5) {
                            titleText = String(row[0]);
                            break;
                        }
                    }
                    // 兜底：表头行第一格也常是标题（合并单元格的考试名）
                    if (!titleText) {
                        const headerFirstCell = String((allRows[headerRowIndex] || [])[0] || '');
                        // 表头第一格如果不像"序号/姓名/班级"等表头词，且长度>5，当标题
                        if (headerFirstCell.length > 5 && !/^(序号|姓名|班级|学号|考号|总分)/.test(headerFirstCell)) {
                            titleText = headerFirstCell;
                        }
                    }

                    // 构建列索引（基于找到的表头行）
                    const header = allRows[headerRowIndex] || [];
                    const colIdx = buildColumnIndex(header);

                    // 数据行从表头下一行开始
                    const dataRows = allRows.slice(headerRowIndex + 1);
                    // 确保每行都是数组
                    const cleanData = dataRows.map(row => Array.isArray(row) ? row : []);

                    const result = parseScoreDetailExcelRows(cleanData, colIdx, titleText);
                    // 将红色题号作为有效题目传递
                    if (redQuestionNums.length > 0) {
                        result.validQuestions = redQuestionNums;
                    }
                    resolve(result);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * 检测Excel中红色字体的题号（有效题目）
     * 通过JSZip解压xlsx，用正则解析XML中的字体颜色
     */
    async function detectRedQuestions(data) {
        try {
            // 动态加载 JSZip
            if (typeof JSZip === 'undefined') {
                try { await loadScript('libs/jszip.min.js'); }
                catch { try { await loadScript('https://cdn.jsdelivr.net/npm/jszip@3/dist/jszip.min.js'); }
                catch { console.warn('[AFR] JSZip加载失败'); return []; } }
            }

            const zip = await JSZip.loadAsync(data);

            // 1. 解析 styles.xml（用正则，避免DOMParser命名空间问题）
            const stylesFile = zip.file('xl/styles.xml');
            if (!stylesFile) return [];
            const stylesXml = await stylesFile.async('text');

            // 字体颜色
            const fontBlocks = stylesXml.match(/<font\b[^>]*>[\s\S]*?<\/font>/g) || [];
            const fontColors = [];
            fontBlocks.forEach(block => {
                const m = block.match(/<color[^>]*rgb="([^"]*)"/);
                fontColors.push(m ? m[1].toUpperCase() : null);
            });

            // cellXfs: 只匹配 <cellXfs> 内部的 <xf>
            const xfsMatch = stylesXml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/);
            const xfItems = xfsMatch ? (xfsMatch[1].match(/<xf\b[^>]*>/g) || []) : [];
            const xfToFont = [];
            xfItems.forEach(xf => {
                const m = xf.match(/fontId="(\d+)"/);
                xfToFont.push(m ? parseInt(m[1]) : 0);
            });

            // 2. 解析 sharedStrings
            const ssFile = zip.file('xl/sharedStrings.xml');
            const sharedStrings = [];
            if (ssFile) {
                const ssXml = await ssFile.async('text');
                const siBlocks = ssXml.match(/<si>[\s\S]*?<\/si>/g) || [];
                siBlocks.forEach(block => {
                    const m = block.match(/<t[^>]*>([\s\S]*?)<\/t>/);
                    sharedStrings.push(m ? m[1] : '');
                });
            }

            // 3. 解析 sheet（用正则）
            const sheetFile = zip.file('xl/worksheets/sheet1.xml');
            if (!sheetFile) return [];
            const sheetXml = await sheetFile.async('text');

            // 找表头行（前5行中数字列最多的行）
            const rowMatches = sheetXml.match(/<row r="\d+"[^>]*>[\s\S]*?<\/row>/g) || [];
            let headerCells = null;
            let maxNums = 0;
            for (const rowXml of rowMatches) {
                const rowNum = parseInt((rowXml.match(/<row r="(\d+)"/) || [])[1] || '0');
                if (rowNum > 5) break;
                const cells = rowXml.match(/<c\b[^>]*>[\s\S]*?<\/c>/g) || [];
                let numCount = 0;
                for (const cXml of cells) {
                    const vM = cXml.match(/<v>([^<]*)<\/v>/);
                    const tAttr = (cXml.match(/<c[^>]*\bt="([^"]*)"/) || [])[1] || '';
                    if (vM) {
                        let v = vM[1];
                        if (tAttr === 's') v = sharedStrings[parseInt(v)] || v;
                        if (!isNaN(parseInt(v)) && parseInt(v) >= 1) numCount++;
                    }
                }
                if (numCount > maxNums) { maxNums = numCount; headerCells = cells; }
            }
            if (!headerCells) return [];

            // 4. 遍历表头单元格，找红色字体题号
            const redQuestions = [];
            for (const cXml of headerCells) {
                const styleIdx = parseInt((cXml.match(/<c[^>]*\bs="(\d+)"/) || [])[1] || '0');
                const tAttr = (cXml.match(/<c[^>]*\bt="([^"]*)"/) || [])[1] || '';
                const vM = cXml.match(/<v>([^<]*)<\/v>/);
                if (!vM) continue;
                let val = vM[1];
                if (tAttr === 's') val = sharedStrings[parseInt(val)] || val;
                const numVal = parseInt(val);
                if (isNaN(numVal) || numVal < 1) continue;

                const fontId = (styleIdx < xfToFont.length) ? (xfToFont[styleIdx] || 0) : 0;
                const color = (fontId < fontColors.length) ? (fontColors[fontId] || '') : '';
                if (color.includes('FF0000')) {
                    redQuestions.push(numVal);
                }
            }

            console.log('[AFR] 检测到红色题号:', redQuestions.sort((a, b) => a - b));
            return redQuestions.sort((a, b) => a - b);
        } catch (err) {
            console.warn('[AFR] 检测红色题号失败:', err);
            return [];
        }
    }

    /**
     * 动态加载脚本
     */
    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    /**
     * 解析数据行（已分离表头和数据）
     */
    /**
     * 解析"答题明细"格式Excel（网上阅卷系统导出，如"高三上补充练习05-答题明细.xlsx"）
     * 工作表结构：
     *   学生明细-题号排序：题号|题型|作答人数|难度描述|区分度系数|区分度描述|年级正确率|班级正确率|答对人数(C：54)|答错人数(A：1)|答错学生名单
     *     —— 每题占多行（每个错误选项一行），"答对人数"列给出正确答案
     *   客观题填涂：校内准考证号|姓名|科目|1|2|3...（每生每题所选字母，题目选项数不定：听力A-C/七选五A-G）
     * 产出与全品格式同构的结果对象，并额外填充 options(含名单)/correctAnswer/schoolRate/题型标签
     */
    function parseAnswerDetailWorkbook(workbook) {
        const sheetName = kw => workbook.SheetNames.find(s => s.includes(kw));

        // ---------- 0. 学生答题总览（导出版本表名不一：答题总览/班级小题得分/学生得分明细）：每生 学号/总分/逐题得分 ----------
        const ovSheetName = sheetName('答题总览') || sheetName('班级小题得分') || sheetName('学生得分明细');
        const ovRows = ovSheetName
            ? XLSX.utils.sheet_to_json(workbook.Sheets[ovSheetName], { header: 1, defval: '' })
            : [];
        let ovTitleText = '';
        const overview9 = {};     // {准考证号: {...}}（09班）
        const overview11 = {};    // {准考证号: {...}}（11班）
        const ovQTypes = {};      // {题号: 题型}（来自表头前缀）
        const ovMaxScore = {};    // {题号: 该题满分}（取该列最大得分）
        if (ovRows.length) {
            let ovHeaderIdx = -1;
            for (let i = 0; i < Math.min(ovRows.length, 6); i++) {
                const s = (ovRows[i] || []).join(',');
                if (s.includes('姓名') && (s.includes('准考证号') || s.includes('总分'))) { ovHeaderIdx = i; break; }
            }
            if (ovHeaderIdx === -1) throw new Error('答题总览表头未识别（需含"姓名"和"准考证号/总分"列）');
            const titleRow = ovRows.find((r, i) => i < ovHeaderIdx && String((r || [])[0] || '').length > 5);
            ovTitleText = titleRow ? String(titleRow[0]) : '';

            const ovHead = ovRows[ovHeaderIdx] || [];
            const col = {};
            const ovQCols = [];
            ovHead.forEach((h, i) => {
                const s = String(h).trim();
                if (['姓名', '校内准考证号', '学号', '总分', '班级'].includes(s)) {
                    col[s] = i;
                } else if (s === '客观题得分' || s === '客观题') {
                    col['客观题得分'] = i;
                } else if (s === '主观题得分' || s === '主观题') {
                    col['主观题得分'] = i;
                } else if (/^\d+$/.test(s)) {
                    ovQCols.push({ col: i, qNum: parseInt(s) });          // 纯数字题号
                } else {
                    const m = s.match(/^(.*?)(\d+)$/);                     // "阅读理解1"题型+题号
                    if (m && m[1].trim() && !['序号', '总', '客观题', '主观题'].some(k => m[1].includes(k))) {
                        ovQCols.push({ col: i, qNum: parseInt(m[2]) });
                        ovQTypes[parseInt(m[2])] = m[1].trim();
                    }
                }
            });

            for (let i = ovHeaderIdx + 1; i < ovRows.length; i++) {
                const row = ovRows[i] || [];
                const name = String(row[col['姓名']] || '').trim();
                const clsField = String(row[col['班级']] || '');
                if (!name || clsField.includes('均分') || clsField.includes('0分')) continue;
                if (clsField && !clsField.includes('高三') && !clsField.includes('高二')) continue;
                const totalRaw = String(row[col['总分']] || '');
                if (totalRaw === '-' || totalRaw.includes('未扫描')) continue;   // 未扫描学生不计入
                const examId = String(row[col['校内准考证号']] || '').trim();
                const questionScores = {};
                ovQCols.forEach(({ col: c, qNum }) => {
                    const v = row[c];
                    if (v !== '' && v !== undefined && String(v) !== '-') {
                        const sc = parseFloat(v);
                        if (!isNaN(sc)) {
                            questionScores[qNum] = sc;
                            if (sc > (ovMaxScore[qNum] || 0)) ovMaxScore[qNum] = sc;
                        }
                    }
                });
                (clsField.includes('11') ? overview11 : overview9)[examId || name] = {
                    examId,
                    studentNo: String(row[col['学号']] || '').trim(),
                    name,
                    totalScore: parseFloat(row[col['总分']]) || 0,
                    questionScores,
                };
            }
        }

        // ---------- 1. 学生明细：题目元数据（题型/正确答案/年级正确率/各错误选项人数与名单） ----------
        const metaSheetName = sheetName('学生明细');
        const metaRows = metaSheetName
            ? XLSX.utils.sheet_to_json(workbook.Sheets[metaSheetName], { header: 1, defval: '' })
            : [];

        let titleText = '';
        for (let i = 0; i < Math.min(metaRows.length, 3); i++) {
            const v = String((metaRows[i] || [])[0] || '');
            if (v.length > 5 && !v.includes('题号')) { titleText = v; break; }
        }

        // 定位表头行（含"题号"和"答对人数"），按表头名定位各列——兼容旧版11列(题号|题型|…)与新版20列(key|题号|题型|…|年级得分率|班级得分率|…)
        let metaHeaderIdx = -1;
        let metaCol = null;
        for (let i = 0; i < metaRows.length; i++) {
            const s = (metaRows[i] || []).join(',');
            if (s.includes('题号') && s.includes('答对人数')) {
                metaHeaderIdx = i;
                metaCol = {};
                (metaRows[i] || []).forEach((h, c) => {
                    const t = String(h || '').trim();
                    if (!t) return;
                    if (t === '题号' && metaCol.q === undefined) metaCol.q = c;
                    else if (t === '题型') metaCol.type = c;
                    else if (t === '满分') metaCol.full = c;
                    else if (t === '作答人数') metaCol.answered = c;
                    else if (t === '难度描述') metaCol.diff = c;
                    else if (t === '区分度系数') metaCol.disc = c;
                    else if (t.includes('年级') && t.includes('率')) metaCol.grade = c;
                    else if (t.includes('班级') && t.includes('率')) metaCol.cls = c;
                    else if (t === '答对人数') metaCol.ok = c;
                    else if (t === '答错人数') metaCol.bad = c;
                    else if (t.includes('答错学生名单')) metaCol.names = c;
                });
                break;
            }
        }
        if (metaHeaderIdx === -1 && metaRows.length === 0) {
            throw new Error('答题明细解析失败：未找到"学生明细"工作表');
        }
        // 得分率解析：'94.74%'→94.74；新版小数0.6724→67.24
        const parseRateVal = v => {
            const s = String(v == null ? '' : v).trim();
            if (!s || s === '-') return 0;
            if (s.includes('%')) return parseFloat(s) || 0;
            const n = parseFloat(s);
            if (isNaN(n)) return 0;
            return n <= 1 ? parseFloat((n * 100).toFixed(2)) : n;
        };

        const metaByQ9 = {};    // 09班逐题元数据
        const metaByQ11 = {};   // 11班逐题元数据
        if (metaHeaderIdx >= 0) {
            let metaClass = 'class9';
            for (let i = 0; i < metaRows.length; i++) {
                const row = metaRows[i] || [];
                const first = String(row[0] || '').trim();
                // 分班标题行（如"…-高三11班物化地-英语-答题明细"）切换班级段
                if (first.includes('班') && first.length > 8) {
                    metaClass = /11班/.test(first) ? 'class11' : 'class9';
                    continue;
                }
                const qNum = parseInt(row[metaCol.q]);
                if (isNaN(qNum)) continue;   // 表头行/空行自动跳过
                const metaByQ = metaClass === 'class11' ? metaByQ11 : metaByQ9;

                const m = metaByQ[qNum] || (metaByQ[qNum] = {
                    type: '', answered: 0, difficulty: '', discrimination: 0,
                    gradeRate: 0, classRate: 0, correctAnswer: '', correctCount: 0,
                    wrongCounts: {}, wrongNames: {}, unansweredCount: 0,
                });

                if (row[metaCol.type] !== undefined && row[metaCol.type] !== '') m.type = String(row[metaCol.type]).trim();
                if (metaCol.full !== undefined && row[metaCol.full] !== '' && row[metaCol.full] !== undefined) m.fullScore = parseFloat(row[metaCol.full]) || m.fullScore;
                if (row[metaCol.answered] !== undefined && row[metaCol.answered] !== '') m.answered = parseInt(row[metaCol.answered]) || m.answered;
                if (metaCol.diff !== undefined && row[metaCol.diff]) m.difficulty = String(row[metaCol.diff]).trim();
                if (metaCol.disc !== undefined && row[metaCol.disc] !== '' && row[metaCol.disc] !== undefined) m.discrimination = parseFloat(row[metaCol.disc]) || m.discrimination;
                if (metaCol.grade !== undefined) m.gradeRate = parseRateVal(row[metaCol.grade]) || m.gradeRate;
                if (metaCol.cls !== undefined) m.classRate = parseRateVal(row[metaCol.cls]) || m.classRate;

                // 答对人数列 "C：54" / "C:39" → 正确答案及答对人数
                const okM = String(row[metaCol.ok] || '').match(/^([A-G])[：:]\s*(\d+)$/);
                if (okM) { m.correctAnswer = okM[1]; m.correctCount = parseInt(okM[2]); }

                // 答错人数列 "A：1" / "A: 8" + 名单列 → 错误选项人数与学生（填涂矩阵缺失时的兜底）
                const badM = String(row[metaCol.bad] || '').match(/^([A-G])[：:]\s*(\d+)$/);
                if (badM) {
                    m.wrongCounts[badM[1]] = parseInt(badM[2]);
                    const namesRaw = String(metaCol.names !== undefined ? (row[metaCol.names] || '') : '');
                    m.wrongNames[badM[1]] = (namesRaw === '无' || !namesRaw) ? [] :
                        namesRaw.split(/[、,，\s]+/).filter(Boolean);
                }

                // 答错人数列的"未作答：N"行
                const unrM = String(row[metaCol.bad] || '').match(/^未作答[：:]\s*(\d+)$/);
                if (unrM) m.unansweredCount = parseInt(unrM[1]);
            }
        }

        // ---------- 2. 客观题填涂：学生×题目答案矩阵（支持双班分段，各班各自归属） ----------
        const fillSheetName = sheetName('客观题填涂');
        const fillRows = fillSheetName
            ? XLSX.utils.sheet_to_json(workbook.Sheets[fillSheetName], { header: 1, defval: '' })
            : [];

        // 题号列结构从首个表头行识别（两段表头结构一致）
        const qCols = [];   // [{col, qNum}]
        for (let i = 0; i < Math.min(fillRows.length, 5); i++) {
            const row = fillRows[i] || [];
            if (String(row[0] || '').includes('准考证号') || String(row[1] || '').includes('姓名')) {
                for (let c = 0; c < row.length; c++) {
                    const qn = parseInt(row[c]);
                    if (!isNaN(qn) && qn >= 1) qCols.push({ col: c, qNum: qn });
                }
                break;
            }
        }

        // 分段解析：标题行（"…-高三XX班物化地-…"）切换班级；表头行（含第二段表头）跳过
        const fillStudents9 = [];
        const fillStudents11 = [];
        let fillClass = 'class9';
        for (let i = 0; i < fillRows.length; i++) {
            const row = fillRows[i] || [];
            const first = String(row[0] || '').trim();
            if (first.includes('班') && first.length > 8) {
                fillClass = /11班/.test(first) ? 'class11' : 'class9';
                continue;
            }
            if (first.includes('准考证号') || String(row[1] || '').includes('姓名')) continue;   // 表头行
            const name = String(row[1] || '').trim();
            if (!name) continue;
            const answers = {};
            qCols.forEach(({ col, qNum }) => {
                const v = String(row[col] || '').trim().toUpperCase();
                if (/^[A-G]$/.test(v)) answers[qNum] = v;   // 空/异常值 = 未作答
            });
            (fillClass === 'class11' ? fillStudents11 : fillStudents9)
                .push({ examId: String(row[0] || ''), name, answers });
        }

        // ---------- 3. 分班填涂归属（填涂表已按分段解析：fillStudents9 / fillStudents11） ----------

        // ---------- 4. 分班合并：逐班构建选项分布（人数+名单）+ 题目统计 + 学生成绩 ----------
        const allQNums = [...new Set([
            ...Object.keys(metaByQ9).map(Number),
            ...Object.keys(metaByQ11).map(Number),
            ...Object.keys(ovQTypes).map(Number),
            ...qCols.map(c => c.qNum),
        ])].sort((a, b) => a - b);
        if (allQNums.length === 0) throw new Error('答题明细解析失败：未识别到题目数据');

        const classMetas = { class9: metaByQ9, class11: metaByQ11 };
        const classOverviews = { class9: overview9, class11: overview11 };
        const classFills = { class9: fillStudents9, class11: fillStudents11 };
        const questionsByClass = {};
        const studentsByClass = {};

        ['class9', 'class11'].forEach(ck => {
            const metaMap = classMetas[ck];
            const fillList = classFills[ck];
            const hasMatrix = fillList.length > 0;
            // 有效作答学生（整卷至少作答一题；整卷全空=未扫描，不计入未作答）
            const activeFills = hasMatrix ? fillList.filter(s => Object.keys(s.answers).length > 0) : [];
            // 总览学生（带真实逐题得分——主观题分数段统计的数据源）
            const ovStudentList = Object.values(classOverviews[ck]);
            const questions = [];

            allQNums.forEach(qNum => {
                const meta = metaMap[qNum] || {};
                const answeredStudents = hasMatrix ? fillList.filter(s => s.answers[qNum]) : [];

                // 选项全集 = 明细的正确答案+错误选项 ∪ 填涂中实际出现的字母
                const letterSet = new Set(Object.keys(meta.wrongCounts || {}));
                if (meta.correctAnswer) letterSet.add(meta.correctAnswer);
                answeredStudents.forEach(s => letterSet.add(s.answers[qNum]));

                // 选项分布：有填涂矩阵→人数名单从矩阵推导（权威）；无矩阵→用明细表兜底
                const options = {};
                [...letterSet].sort().forEach(L => {
                    if (hasMatrix) {
                        const names = answeredStudents.filter(s => s.answers[qNum] === L).map(s => s.name);
                        options[L] = { count: names.length, names };
                    } else {
                        options[L] = meta.correctAnswer === L
                            ? { count: meta.correctCount || 0, names: [] }
                            : { count: meta.wrongCounts[L] || 0, names: meta.wrongNames[L] || [] };
                    }
                });

                const answered = hasMatrix ? answeredStudents.length : (meta.answered || 0);
                const correctAnswer = meta.correctAnswer || '';
                const correctCount = correctAnswer ? (options[correctAnswer] ? options[correctAnswer].count : 0) : 0;

                // 班级正确率一律以明细表为准（矩阵自算仅作明细缺失时的兜底）
                const classRate = meta.classRate
                    ? meta.classRate
                    : (answered > 0 ? parseFloat((correctCount / answered * 100).toFixed(2)) : 0);

                // 未作答：矩阵路径=有效学生中该题空白者（带名单）；无矩阵用明细表"未作答：N"
                const unanswered = hasMatrix
                    ? (() => {
                        const names = activeFills.filter(s => !s.answers[qNum]).map(s => s.name);
                        return { count: names.length, names };
                    })()
                    : { count: meta.unansweredCount || 0, names: [] };

                // 满分识别：明细"满分"列优先；旧版明细（11列）无满分列时按题型兜底（应用文15/续写25），其余用总览最高分
                const tLbl = meta.type || ovQTypes[qNum] || '';
                let full = meta.fullScore || 0;
                if (!full) {
                    if (tLbl.includes('应用文')) full = 15;
                    else if (tLbl.includes('续写')) full = 25;
                    else full = ovMaxScore[qNum] || 0;
                }

                // 主观题（无字母选项：语法填空/应用文/读后续写）→ 错误选项统计不适用，改按分数段统计
                // 数据源=总览表逐题真实得分；未作答=在班但该题无得分记录
                let scoreBands = null;
                let unansweredFinal = unanswered;
                if (Object.keys(options).length === 0) {
                    unansweredFinal = { count: 0, names: [] };   // 修复：主观题不再全员计成"未作答"
                    const bandsDef = full === 15
                        ? [[13, 15, 'L5 13–15分'], [10, 12, 'L4 10–12分'], [7, 9, 'L3 7–9分'], [4, 6, 'L2 4–6分'], [1, 3, 'L1 1–3分'], 'unans']
                        : full === 25
                            ? [[21, 25, 'L5 21–25分'], [16, 20, 'L4 16–20分'], [11, 15, 'L3 11–15分'], [6, 10, 'L2 6–10分'], [1, 5, 'L1 1–5分'], 'unans']
                            : (full > 0 && full <= 2)
                                ? [[full, full, `答对${full}分`], [0, 0, '答错0分'], 'unans']
                                : null;
                    if (bandsDef && ovStudentList.length) {
                        scoreBands = [];
                        for (const def of bandsDef) {
                            if (def === 'unans') {
                                const names = ovStudentList.filter(s => s.questionScores[qNum] === undefined).map(s => s.name);
                                scoreBands.push({ label: '未作答', count: names.length, names, cls: 'muted' });   // 0人也显示
                            } else {
                                const [lo, hi, label] = def;
                                const names = ovStudentList.filter(s => {
                                    const v = s.questionScores[qNum];
                                    return v !== undefined && v >= lo && v <= hi;
                                }).map(s => s.name);
                                scoreBands.push({
                                    label, count: names.length, names,   // 0人的档位同样显示
                                    cls: label.startsWith('L5') || label.startsWith('答对') ? 'correct'
                                        : label.startsWith('L4') ? 'band-l4'
                                        : label.startsWith('L3') ? 'band-l3'
                                        : 'wrong',
                                });
                            }
                        }
                    }
                }

                const typeLabel = meta.type || ovQTypes[qNum] || '';

                questions.push({
                    id: qNum,
                    type: typeLabel,
                    typeKey: typeLabel ? normalizeQuestionTypeKey(typeLabel) : null,
                    score: full || 1,   // 满分=明细满分列→题型兜底→总览最高分（主观题15/25分制靠它识别）
                    classRate,
                    schoolRate: meta.gradeRate || 0,   // 年级正确率
                    correctAnswer,
                    errorRate: parseFloat((100 - classRate).toFixed(2)),
                    knowledgePoints: '',
                    options,
                    unanswered: unansweredFinal,   // {count, names} 未作答人数与名单（主观题恒为0，见scoreBands）
                    scoreBands,        // 主观题分数段 [{label, count, names, cls}]
                    answeredCount: answered,
                    difficultyDesc: meta.difficulty || '',
                    discrimination: meta.discrimination || 0,
                });
            });
            questionsByClass[ck] = questions;

            const qMap = {};
            questions.forEach(q => { qMap[q.id] = q; });

            // 学生成绩：优先用总览表（真实总分/学号/逐题得分）；该班无总览但有填涂时用矩阵兜底（总分=答对数）
            const ovKeys = Object.keys(classOverviews[ck]);
            let list;
            if (ovKeys.length > 0) {
                list = ovKeys.map(k => {
                    const r = classOverviews[ck][k];
                    return {
                        examId: r.examId,
                        studentNo: r.studentNo,
                        id: r.studentNo || r.examId,
                        name: r.name,
                        score: r.totalScore,
                        rank: 0,
                        questionScores: r.questionScores,
                    };
                });
            } else if (hasMatrix) {
                list = fillList.map(s => {
                    const questionScores = {};
                    let correctTotal = 0;
                    allQNums.forEach(qNum => {
                        const a = s.answers[qNum];
                        if (!a) return;
                        const q = qMap[qNum];
                        const ok = (q && q.correctAnswer && a === q.correctAnswer) ? 1 : 0;
                        questionScores[qNum] = ok;
                        correctTotal += ok;
                    });
                    return {
                        examId: s.examId,
                        studentNo: '',
                        id: s.examId,
                        name: s.name,
                        score: correctTotal,
                        rank: 0,
                        questionScores,
                    };
                });
            } else {
                list = [];
            }
            list.sort((a, b) => b.score - a.score);
            list.forEach((s, i) => { s.rank = i + 1; });
            studentsByClass[ck] = list;
        });

        // ---------- 5. 作业名：总览表末段（如"高三英语上学期补充练习（5）"）优先，否则明细表首段去校名 ----------
        let homeworkName = '';
        if (ovTitleText) {
            const segs = ovTitleText.split('-');
            let name = segs.pop().trim();
            // 修复"2026-2027学年度"被连字符切开：末段以数字开头且前段为纯4位数字时拼回
            if (/^\d/.test(name) && segs.length && /^\d{4}$/.test(segs[segs.length - 1].trim())) {
                name = segs.pop().trim() + '-' + name;
            }
            if (name.length >= 4) homeworkName = name;
        }
        if (!homeworkName && titleText) {
            const first = titleText.split('-')[0]
                .replace(/^[一-龥]{2,10}?(高中|中学)/, '')
                .trim();
            homeworkName = first || titleText;
        }

        return {
            homeworkName,
            scores: { class9: studentsByClass.class9, class11: studentsByClass.class11 },
            questions: { class9: questionsByClass.class9, class11: questionsByClass.class11 },
            validQuestions: allQNums,
        };
    }

    function parseScoreDetailExcelRows(dataRows, colIdx, titleText) {
        // 从标题提取作业名（空则返回空，让外层用file.name兜底）
        const homeworkName = titleText.split('-').pop()?.trim() || titleText || '';

        const class9Students = [];
        const class11Students = [];
        const class9QuestionScores = {};
        const class11QuestionScores = {};

        for (let i = 0; i < dataRows.length; i++) {
            const row = dataRows[i];
            if (!row || row.length === 0) continue;

            const classField = String(row[colIdx.classField] || '');
            if (classField.includes('均分') || classField.includes('0分') || classField === '班级') continue;
            if (!classField.includes('高二') && !classField.includes('高三')) continue;

            const isClass11 = classField.includes('11');
            const isClass9 = classField.includes('09') || classField.includes('9');
            if (!isClass9 && !isClass11) continue;

            const totalScoreRaw = row[colIdx.totalScore];
            if (String(totalScoreRaw) === '未扫描') continue;

            // 收集逐题得分（qNum取表头真实题号，如21-40）
            const questionScores = {};
            for (let q = 0; q < colIdx.questionCount; q++) {
                const qNum = colIdx.questionNums ? colIdx.questionNums[q] : q + 1;
                const scoreVal = row[colIdx.firstQuestionCol + q];
                if (scoreVal !== undefined && scoreVal !== '' && String(scoreVal) !== '-') {
                    questionScores[qNum] = parseFloat(scoreVal);
                }
            }

            const student = {
                examId: String(row[colIdx.examId] || ''),
                studentNo: String(row[colIdx.studentNo] || ''),
                id: String(row[colIdx.studentNo] || row[colIdx.examId] || ''),
                name: String(row[colIdx.name] || ''),
                score: parseFloat(totalScoreRaw || 0),
                rank: parseInt(row[colIdx.classRank] || 0),
                questionScores: questionScores, // 逐题得分
            };

            if (isClass9) {
                class9Students.push(student);
            } else {
                class11Students.push(student);
            }

            for (let q = 0; q < colIdx.questionCount; q++) {
                const qNum = colIdx.questionNums ? colIdx.questionNums[q] : q + 1;
                const scoreVal = row[colIdx.firstQuestionCol + q];
                const target = isClass9 ? class9QuestionScores : class11QuestionScores;
                if (!target[qNum]) target[qNum] = [];
                if (scoreVal !== undefined && scoreVal !== '' && String(scoreVal) !== '-') {
                    target[qNum].push(parseFloat(scoreVal));
                } else {
                    target[qNum].push(-1);
                }
            }
        }

        // 重新计算排名
        class9Students.sort((a, b) => b.score - a.score);
        class9Students.forEach((s, i) => s.rank = i + 1);
        class11Students.sort((a, b) => b.score - a.score);
        class11Students.forEach((s, i) => s.rank = i + 1);

        const class9Questions = computeQuestionStats(class9QuestionScores, class9Students.length, colIdx.questionTypes);
        const class11Questions = computeQuestionStats(class11QuestionScores, class11Students.length, colIdx.questionTypes);

        return {
            homeworkName,
            scores: { class9: class9Students, class11: class11Students },
            questions: { class9: class9Questions, class11: class11Questions },
        };
    }

    /**
     * 解析"学生得分明细"格式的Excel
     * 格式说明：
     *   第1行: 标题（含作业名称）
     *   第2行: 表头
     *   第3行起: 学生数据，列A-J为基本信息，列11起为每题得分
     *   班级通过B列区分（包含"09"或"11"）
     *   统计行（班级均分/年级均分/0分人数）自动跳过
     */
    // 构建列索引
    function buildColumnIndex(header) {
        const idx = {
            classField: 1,     // B列: 班级
            name: 2,           // C列: 姓名
            examId: 3,         // D列: 校内准考证号
            studentNo: 4,      // E列: 学号
            totalScore: 5,     // F列: 总分
            schoolRank: 6,     // G列: 校次
            classRank: 7,      // H列: 班次
            objective: 8,      // I列: 客观题
            subjective: 9,     // J列: 主观题
            firstQuestionCol: 10, // 第11列(index=10)开始是题目
        };

        // 智能查找：如果表头匹配上了就用默认位置，否则动态搜索
        header.forEach((h, i) => {
            const s = String(h);
            if (s === '班级') idx.classField = i;
            else if (s === '姓名') idx.name = i;
            else if (s === '校内准考证号') idx.examId = i;
            else if (s === '学号') idx.studentNo = i;
            else if (s === '总分') idx.totalScore = i;
            else if (s === '校次') idx.schoolRank = i;
            else if (s === '班次') idx.classRank = i;
            else if (s === '客观题') idx.objective = i;
            else if (s === '主观题') idx.subjective = i;
        });

        // 找题号列 + 记录真实题号和题型标签（表头支持"21"纯数字 或 "阅读21"题型+题号混合格式）
        idx.questionNums = [];
        idx.questionTypes = {};  // {题号: '阅读'}，来自表头前缀，无前缀则不设
        for (let i = 0; i < header.length; i++) {
            const h = String(header[i]).trim();
            const mPure = h.match(/^\d+$/);                    // 纯数字：21
            const mMix = h.match(/^(.*?)\s*(\d+)$/);           // 题型+题号：阅读21 / 七选五36
            if (mPure) {
                if (idx.questionNums.length === 0) idx.firstQuestionCol = i;
                idx.questionNums.push(parseInt(h));
            } else if (mMix && mMix[1].trim()) {
                // 前缀必须是文字题型（排除"总分45"这类列：前缀若匹配已知信息列名则跳过）
                const prefix = mMix[1].trim();
                const isInfoCol = ['总分', '学号', '校次', '班次', '客观题', '主观题', '序号'].includes(prefix)
                    || prefix.includes('正确率') || prefix.includes('得分');
                if (!isInfoCol) {
                    if (idx.questionNums.length === 0) idx.firstQuestionCol = i;
                    const qn = parseInt(mMix[2]);
                    idx.questionNums.push(qn);
                    idx.questionTypes[qn] = prefix;
                }
            }
        }

        // 计算题目数量
        idx.questionCount = idx.questionNums.length;

        return idx;
    }

    // 从每题得分列表计算统计数据（excelTypes: 表头带的题型标签{题号:'阅读'}，优先于固定范围）
    function computeQuestionStats(questionScores, totalStudents, excelTypes) {
        const questions = [];
        const qNums = Object.keys(questionScores).map(Number).sort((a, b) => a - b);

        qNums.forEach(qNum => {
            const scores = questionScores[qNum];
            const validScores = scores.filter(s => s >= 0);
            const answered = validScores.length;
            const fullScore = Math.max(...validScores, 0); // 该题满分
            const correctCount = validScores.filter(s => s > 0).length;

            // 正确率 = 得分人数 / 已作答人数
            const rate = answered > 0 ? (correctCount / answered * 100) : 0;

            // 题型：表头标签优先（归入系统题型组），否则按题号固定范围
            const excelLabel = excelTypes ? excelTypes[qNum] : null;
            const normKey = excelLabel ? normalizeQuestionTypeKey(excelLabel) : null;
            const fallbackType = getQuestionType(qNum);
            const typeKey = normKey || (Object.keys(TYPE_RANGES).find(k =>
                qNum >= TYPE_RANGES[k].min && qNum <= TYPE_RANGES[k].max) || null);

            questions.push({
                id: qNum,
                type: excelLabel || fallbackType,
                typeKey: typeKey,   // 系统题型组key（listening/reading/...），网格分组用
                score: fullScore || 1.5,
                classRate: parseFloat(rate.toFixed(2)),
                schoolRate: 0, // 暂无校级数据
                correctAnswer: '', // 需要后续补充
                errorRate: parseFloat((100 - rate).toFixed(2)),
                knowledgePoints: '',
                options: {}, // 选项分布需要更多信息，暂留空
            });
        });

        return questions;
    }

    // 中文/英文题型标签 → 系统题型key（表头"阅读21"的前缀按此归组，题号范围不限）
    function normalizeQuestionTypeKey(label) {
        const s = String(label || '').toLowerCase();
        if (s.includes('听力') || s.includes('listen')) return 'listening';
        if (s.includes('七选五') || s.includes('信息匹配')) return 'sevenfive';   // 信息匹配=学校系统对七选五的称呼
        if (s.includes('阅读') || s.includes('read')) return 'reading';
        if (s.includes('完型') || s.includes('完形') || s.includes('cloze')) return 'cloze';
        if (s.includes('语法') || s.includes('填空') || s.includes('短填') || s.includes('gap')) return 'grammar';
        if (s.includes('应用文')) return 'applied';
        if (s.includes('续写') || s.includes('continu')) return 'writing';
        if (s.includes('writing')) return 'applied';
        return null;
    }

    // 根据题号判断题型
    function getQuestionType(qNum) {
        if (qNum >= 1 && qNum <= 20) return 'Listening';
        if (qNum >= 21 && qNum <= 35) return 'Reading';
        if (qNum >= 36 && qNum <= 40) return '5 of 7';
        if (qNum >= 41 && qNum <= 55) return 'Cloze';
        if (qNum >= 56 && qNum <= 65) return 'Gap-fill';
        if (qNum === 66) return 'Writing';
        if (qNum === 67) return 'Continuation';
        return '其他';
    }

    function findColumn(keys, candidates) {
        for (const candidate of candidates) {
            const found = keys.find(k => k.includes(candidate) || candidate.includes(k));
            if (found) return found;
        }
        return candidates[0]; // 默认返回第一个候选
    }

    // ===== 导出备份 =====
    async function exportData() {
        const backup = {
            version: '1.1',   // 1.1: 新增 composition 字段（作文评讲数据）
            exportDate: new Date().toISOString(),
            homeworks: homeworkOrder.map(id => homeworks[id]),
            appState: {
                currentClass: state.currentClass,
                currentHomework: state.currentHomework,
            },
        };
        // [Composition] 作文评讲数据（localStorage）随主备份一并导出
        try {
            const erRaw = localStorage.getItem('AFR-composition-v2');
            if (erRaw) backup.composition = JSON.parse(erRaw);
        } catch (err) { console.warn('[AFR] composition export skipped:', err); }
        const json = JSON.stringify(backup, null, 2);
        const defaultName = `AFR-backup-${new Date().toISOString().slice(0, 10)}.json`;

        // 优先用 showSaveFilePicker（http 协议，可默认存项目文件夹）
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: defaultName,
                    types: [{ description: 'JSON backup', accept: { 'application/json': ['.json'] } }],
                });
                const writable = await handle.createWritable();
                await writable.write(json);
                await writable.close();
                notify('Backup saved to project folder', 'success');
                return;
            } catch (err) {
                if (err.name === 'AbortError') return;  // 用户取消
                // 其他错误 fallback 到下载方式
            }
        }
        // Fallback：传统下载（file 协议或不支持 showSaveFilePicker）
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = defaultName;
        a.click();
        URL.revokeObjectURL(url);
        notify('Backup exported (downloads)', 'success');
    }

    // ===== 导入备份 =====
    // 应用备份对象到内存+IndexedDB（Worker 与 fallback 共用）
    function applyBackup(backup) {
        if (!backup || !backup.homeworks) {
            notify('Invalid backup file (no homeworks)', 'error');
            return;
        }
        homeworks = {};
        homeworkOrder = [];
        backup.homeworks.forEach(hw => {
            homeworks[hw.id] = hw;
            homeworkOrder.push(hw.id);
        });
        if (backup.appState) {
            state.currentClass = backup.appState.currentClass || 'class9';
            state.currentHomework = backup.appState.currentHomework || homeworkOrder[0];
        }
        homeworkOrder.forEach(id => saveHomework(id));
        saveAppState();
        renderHomeworkMenu();
        renderAll();
        // [Composition] 还原作文评讲数据（写入 localStorage 并通知模块热重载）
        if (backup.composition) {
            try {
                const erJson = typeof backup.composition === 'string'
                    ? backup.composition : JSON.stringify(backup.composition);
                localStorage.setItem('AFR-composition-v2', erJson);
                if (window.EssayReview && typeof EssayReview._reloadFromStorage === 'function') {
                    EssayReview._reloadFromStorage();
                }
            } catch (err) { console.warn('[AFR] composition restore skipped:', err); }
        }
        notify('Backup restored', 'success');
    }

    function importBackup() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const sizeMB = (file.size / 1024 / 1024).toFixed(1);
            notify(`Reading ${sizeMB}MB backup...`, 'info');
            const reader = new FileReader();
            reader.onload = (ev) => {
                const text = ev.target.result;
                // 优先用 Web Worker 后台解析（大文件不卡主线程）；Worker 不可用(file协议)则回退主线程
                let worker = null;
                try {
                    worker = new Worker('libs/importWorker.js');
                } catch (err) { worker = null; }

                if (worker) {
                    notify(`Parsing ${sizeMB}MB in background... (please wait)`, 'info');
                    worker.onmessage = (msg) => {
                        const d = msg.data;
                        if (d.type === 'progress') notify(d.msg, 'info');
                        else if (d.type === 'done') {
                            applyBackup(d.backup);
                            worker.terminate();
                        } else if (d.type === 'error') {
                            notify(d.msg, 'error');
                            worker.terminate();
                        }
                    };
                    worker.onerror = () => {
                        // Worker 出错，回退主线程解析
                        worker.terminate();
                        notify('Worker failed, parsing in main thread...', 'info');
                        try { applyBackup(JSON.parse(text)); }
                        catch (err) { notify('Invalid backup: ' + err.message, 'error'); }
                    };
                    worker.postMessage({ text: text });
                } else {
                    // file:// 协议无 Worker，主线程解析（小文件够用）
                    notify('Parsing in main thread...', 'info');
                    setTimeout(() => {
                        try { applyBackup(JSON.parse(text)); }
                        catch (err) {
                            console.error('[AFR] import error:', err);
                            notify('Invalid backup: ' + err.message, 'error');
                        }
                    }, 50);
                }
            };
            reader.onerror = () => notify('Failed to read file', 'error');
            reader.readAsText(file);
        };
        input.style.display = 'none';
        document.body.appendChild(input);
        input.click();
        setTimeout(() => input.remove(), 1000);
    }

    // ===== 重置数据 =====
    function resetData() {
        if (!confirm('Reset ALL data? This clears every assignment.')) return;
        indexedDB.deleteDatabase(DB_NAME);
        homeworks = {};
        homeworkOrder = [];
        state.currentHomework = null;
        renderHomeworkMenu();
        renderAll();
        notify('All data cleared', 'info');
    }

    // ===== 通知 =====
    function notify(msg, type) {
        const el = document.getElementById('notification');
        if (!el) return;
        el.textContent = msg;
        el.className = `notification ${type || 'info'} show`;
        setTimeout(() => el.classList.remove('show'), 2500);
    }

    // ===== 启动 =====
    document.addEventListener('DOMContentLoaded', init);

    // 公共API
    return {
        toggleDropdown,
        selectHomework,
        renameCurrentHomework,
        promptRenameHomework,
        setStarredNames,
        addStarredNames,
        deleteHomework,
        selectClass,
        switchView,
        scrollTabs,
        toggleMindmapDrawer,
        debugLyric,
        switchMindmapStep,
        toggleDiscourseMenu,
        selectDiscourse,
        tryAutoLoadExamText, refreshMmDiscourseBadges,
        debugExamIndex: () => {
            const hw = getCurrentHomework();
            const idx = (hw && hw.examIndex) || {};
            Object.keys(idx).forEach(k => console.log(`[AFR] 📄 ${k}: ${idx[k].text.length}字 P${(idx[k].pageStart || 0) + 1}起 (${idx[k].sourceId})`));
            return Object.keys(idx);
        },
        handleMmTextFile,
        setMmTextEditable,
        commitMmTextEdit,
        openPasteTextDialog,
        closePasteTextDialog,
        confirmPasteText,
        deleteMmText,
        popMmPara,
        updateMmRoleFn,
        showMmRoleFn,
        hideMmRoleFn,
        selectMmLinkType,
        deleteMmEdge,
        clearMmEdges,
        setMmSubjectMode,
        updateMmSubject,
        updateMmLevel,
        applyDiscourseAnalysis,
        addToolkitNote,
        deleteMmNote,
        updateMmNote,
        updateMmNoteBody,
        mmFmt,
        mmIndent,
        toggleMmNote,
        saveMmNotes,
        autoResizeMmNote,
        sortScores,
        toggleSortMode,
        toggleHideNames,
        toggleRemarkMenu,
        setRemarkMode,
        openRemarkRules,
        saveRemark,
        filterByType,
        sortGrid,
        selectQuestion,
        exportErrorPackage,
        importAnalysis,
        clearAnalysisData,
        openVariantPage,
        closeVariantPage,
        togglePassageFullscreen,
        toggleQuestionDrawer,
        toggleGlobalFullscreen,
        closeQuestionDetail,
        nextPage,
        prevPage,

        editUnitTitle,
        retryWebpage,
        deleteCurrentUnit,
        deleteAllPassages,
        setDrawTool,
        setDrawColor,
        setBrushSize,
        clearCanvas,
        toggleAnchorEditMode,
        toggleSplitMode,
        repickDivider,
        toggleStripEditMode,
        deleteStrip,
        clearAllStrips,
        locateStrip,
        zoomPassage,
        resetZoom,
        lockDefaultZoom,
        scrollToolbar,
        // 调试用：在控制台输入 AFR.debugAnchors() 查看当前作业所有锚点
        debugAnchors: () => {
            const hw = getCurrentHomework();
            if (!hw) return '无当前作业';
            const a = (hw.config && hw.config.anchors) || {};
            console.table(Object.keys(a).sort((x,y)=>x-y).map(k => ({
                题号: k,
                页码: parseInt(a[k].pageIdx)+1,
                位置: Math.round(a[k].yRatio*100)+'%'
            })));
            return '共' + Object.keys(a).length + '个锚点（见上表）';
        },
        // 调试用：在控制台输入 AFR.debugStrips() 查看当前作业所有题目条带
        debugStrips: () => {
            const s = getQuestionStrips();
            if (!s.length) return '无条带。导入PDF自动检测，或用✂ Strips手动标记';
            console.table(s.map(x => ({
                id: x.id,
                页码: x.pageIdx + 1,
                范围: Math.round(x.startY*100) + '%–' + Math.round(x.endY*100) + '%',
                题号: x.qNums && x.qNums.length ? x.qNums.join(',') : '-',
                来源: x.source
            })));
            return '共' + s.length + '条题目条带（见上表）';
        },
        saveKnowledge,
        undoKnowledge,
        changeKnowledgeFontSize,
        toggleKnowledgeDrawer,
        toggleDrawerPin,
        toggleEmojiPicker,
        selectEmojiCategory,
        insertEmoji,
        setKnTextColor,
        setKnBgColor,
        insertComment,
        insertHyperlink,
        insertFootnote,
        setTableCellFrame,
        setTableCellBg,
        setPageBgColor,
        setPageBgImage,
        setPageBgNone,
        setPageBgOpacity,
        toggleKnColorMenu,
        toggleFontPicker,
        applyFont,
        toggleMarginMenu,
        setMargin,
        toggleLineSpacingMenu,
        setLineSpacing,
        clearKnowledgeEditor,
        redoKnowledge,
        toggleExportMenu,
        exportNote,
        togglePreludeMusic,
        revealRiddleAnswer,
        switchKnowledgeMode,
        toggleKnSyncMenu,
        syncKnowledge,
        toggleLanguageKit,
        saveLanguageKit,
        viewPastNote,
        insertPastNote,
        closePastNoteModal,
        insertPastNoteFromModal,
        execFormat,
        formatBlock,
        handleKnowledgePaste,
        formatEditorDetail,
        insertKnowledgeImage,
        pasteImageHint,
        toggleVoiceInput,
        toggleBlockMenu,
        insertBlockByIndex,
        openInlineBlockMenu,
        savePageTitle,
        pageTitleKeydown,
        jumpToHeading,
        openDataPanel,
        openCreateHwModal, closeCreateHwModal, confirmCreateHw,
        closeDataPanel,
        toggleThemeMenu,
        selectTheme,
        handleFileSelect,
        importData,
        importPdf,
        importDocx,
        importPptx,
        handleAudioFileSelect,
        importListeningAudio,
        clearListeningAudio,
        clearScoresData,
        clearPassagesData,
        clearDocxData,
        clearPptxData,
        toggleAudioPlayer,
        toggleAnswerKey,
        saveAnswerKey,
        toggleAudioPlay,
        toggleAudioLoop,
        updateAudioRange,
        playAudioRange,
        playAudioRangeTwice,
        setTwiceGap,
        clearAudioRangeInputs,
        seekAudio,
        // 按题号的听力区间
        renderQuestionRangeRows,
        addRangeRow,
        editRangeRow,
        deleteRangeRow,
        testRangeRow,
        testRangeRowTwice,
        saveQuestionRanges,
        playQuestionRange,
        playQuestionRangeTwice,
        playQuestionRangeFromGrid,
        importUrl,
        clearUrlInput,
        createBlankHomework,
        importText,
        clearText,
        exportData,
        importBackup,
        checkAutoImport,
        resetData,
    };
})();
