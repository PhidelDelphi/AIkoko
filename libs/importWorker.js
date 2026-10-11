// AFR 备份导入 Worker：后台线程解析大 JSON，避免主线程卡死
// 接收: {text} 备份文件文本; 回传: {type, ...}
self.onmessage = function(e) {
    const text = e.data.text;
    try {
        self.postMessage({ type: 'progress', msg: 'Parsing JSON...' });
        const backup = JSON.parse(text);
        if (!backup.homeworks) {
            self.postMessage({ type: 'error', msg: 'Invalid backup file (no homeworks)' });
            return;
        }
        self.postMessage({ type: 'progress', msg: 'Parsed. Writing ' + backup.homeworks.length + ' assignments...' });
        // 直接把整个 backup 传回主线程（数据已在 worker 内存，postMessage 会结构化克隆，主线程接收后写入 IndexedDB）
        self.postMessage({ type: 'done', backup: backup });
    } catch (err) {
        self.postMessage({ type: 'error', msg: 'Parse failed: ' + err.message });
    }
};
