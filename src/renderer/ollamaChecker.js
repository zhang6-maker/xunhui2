// ==================== Ollama 服务检测与重连模块 ====================
// 依赖: window.SETTINGS_STORE, window.UI, window.DEPENDENCIES

let ollamaStatus = 'unknown';   // 'online' | 'offline' | 'checking'
let lastCheckTime = 0;
let checkPromise = null;        // 避免并发检查
let offlineNotified = false;    // 避免重复弹离线气泡
let onlineNotified = false;

/**
 * 获取当前 Ollama 地址和模型
 */
function getOllamaConfig() {
    const cfg = window.SETTINGS_STORE.getAll();
    return {
        url: cfg.ollamaUrl || 'http://localhost:11435',
        model: cfg.ollamaModel || 'qwen2:7b'
    };
}

/**
 * 检测 Ollama 服务是否可达（仅测试连通性，不加载模型）
 */
async function checkOllamaHealth(url) {
    try {
        const response = await fetch(`${url}/api/tags`, {
            method: 'GET',
            signal: AbortSignal.timeout(3000)   // 3秒超时
        });
        return response.ok;
    } catch (e) {
        return false;
    }
}

/**
 * 检测指定模型是否已拉取（可选）
 */
async function checkModelExists(url, model) {
    try {
        const res = await fetch(`${url}/api/show`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: model }),
            signal: AbortSignal.timeout(3000)
        });
        return res.ok;
    } catch (e) {
        return false;
    }
}

/**
 * 主动触发一次完整检测（启动时调用）
 */
async function performStartupCheck() {
    const { url, model } = getOllamaConfig();
    ollamaStatus = 'checking';
    const isHealthy = await checkOllamaHealth(url);
    if (isHealthy) {
        const hasModel = await checkModelExists(url, model);
        if (!hasModel) {
            console.warn(`模型 ${model} 尚未拉取，Ollama 服务在线但可能无法正常对话`);
            // 仍然认为在线，但提示用户
            window.UI.showBubble(`⚠️ 模型 "${model}" 可能未下载，请先在 Ollama 中拉取`, 5000);
        }
        ollamaStatus = 'online';
        offlineNotified = false;
        if (!onlineNotified) {
            // 可选：恢复时提示
            // window.UI.showBubble('✅ Ollama 服务已连接', 2000);
            onlineNotified = true;
        }
    } else {
        ollamaStatus = 'offline';
        onlineNotified = false;
        if (!offlineNotified) {
            window.UI.showBubble('😵 未检测到 Ollama 服务，请确认已启动并运行在 ' + url, 5000);
            offlineNotified = true;
        }
    }
    lastCheckTime = Date.now();
    return ollamaStatus === 'online';
}

/**
 * 带缓存的连接检查：距离上次检查不足 30 秒且状态已知时直接返回结果
 */
async function ensureOllamaReady(forceCheck = false) {
    const { url } = getOllamaConfig();
    const now = Date.now();
    // 如果已有缓存且未过期，直接返回
    if (!forceCheck && ollamaStatus === 'online' && (now - lastCheckTime < 30000)) {
        return true;
    }
    if (checkPromise) {
        return checkPromise;
    }
    checkPromise = (async () => {
        const healthy = await checkOllamaHealth(url);
        if (healthy) {
            ollamaStatus = 'online';
            offlineNotified = false;
        } else {
            ollamaStatus = 'offline';
            if (!offlineNotified) {
                window.UI.showBubble('😵 Ollama 连接失败，请检查服务是否启动', 4000);
                offlineNotified = true;
            }
        }
        lastCheckTime = Date.now();
        checkPromise = null;
        return healthy;
    })();
    return checkPromise;
}

/**
 * 带重试的 fetch 包装器（用于 chat 调用）
 */

// 在 ollamaChecker.js 里，修改 fetchWithRetry 函数
async function fetchWithRetry(url, options, maxRetries = 2, baseDelay = 1000) {
    const totalTimeout = 30000; // 总超时 30 秒
    const startTime = Date.now();
    
    for (let i = 0; i <= maxRetries; i++) {
        // 检查总超时
        if (Date.now() - startTime > totalTimeout) {
            throw new Error('请求超时：AI 服务响应过慢');
        }
        
        try {
            const response = await fetch(url, options);
            if (response.ok) return response;
            if (response.status >= 400 && response.status < 500) {
                return response;
            }
        } catch (err) {
            if (i === maxRetries) throw err;
        }
        await new Promise(resolve => {
            TimerManager.setTimeout('ollamaRetry', resolve, baseDelay * Math.pow(2, i));
        });
    }
}

// 导出模块
window.OLLAMA_CHECKER = {
    performStartupCheck,
    ensureOllamaReady,
    fetchWithRetry,
    getStatus: () => ollamaStatus
};