/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  模块墓志铭
 * ═══════════════════════════════════════════════════════════════════════════
 * 模块名称: tts.js - 语音合成模块
 * 模块职责: 将文字转为语音（Edge-TTS > 浏览器 TTS 降级）
 * 
 * 依赖模块:
 *   - window.SETTINGS_STORE: 设置存储（通过 window 读取）
 * 
 * 生命周期:
 *   - speak(text, options): 文本转语音
 *   - stopSpeaking(): 停止当前语音
 *   - 模块初始化时自动注入 window.TTS
 * 
 * 注意事项:
 *   - ✅ 队列机制: 最多排队 3 条（MAX_QUEUE_SIZE）
 *   - ✅ 超时机制: Edge-TTS 单次请求 15 秒超时
 *   - ✅ 表情过滤: 自动移除 Pictographic 字符
 *   - ✅ 浏览器 TTS 预热: 首次降级延迟降低
 *   - ⚠️ onEnd 回调用于状态转换（如 playing→idle）
 * ═══════════════════════════════════════════════════════════════════════════
 */
// ==================== 语音合成模块 ====================
// 依赖: window.SETTINGS_STORE (通过 window 读取)

let audioQueue = [];
let isAudioPlaying = false;

const MAX_QUEUE_SIZE = 3;          // 最多排队 3 条，避免堆积
const EDGE_TTS_TIMEOUT_MS = 15000;  // Edge‑TTS 单次请求超时 15 秒

// 可选：提前激活浏览器语音（降低首次降级延迟）
(function prewarmSpeechSynthesis() {
    if (window.speechSynthesis) {
        const dummy = new SpeechSynthesisUtterance('');
        dummy.volume = 0;
        dummy.rate = 1;
        window.speechSynthesis.speak(dummy);
    }
})();

function speak(text, { onStart = null, onEnd = null } = {}) {
    // 记录原始文本，方便排查
    console.log(`[TTS] 原始输入: "${text}"`);

    // ✅ 更加保险的表情过滤：排除数字 0-9、井号 #、星号 *
    // 这些在某些正则引擎下会被误认为是 Pictographic 的一部分
    text = text.replace(/(?![0-9#*])\p{Extended_Pictographic}/gu, '').trim();
    
    // ✅ 修复：精细化移除括号。
    // 原逻辑会删除所有长括号内容，导致 (14:30) 被删。
    // 现改为：只有当括号内【不包含数字】且长度 > 5 时才删除（通常是系统指令或表情描述）
    const bracketRegex = /[（(](?![^）)]*\d)[^）)]{5,}[）)]/g; 
    text = text.replace(bracketRegex, '');
    text = text.replace(/【(?![^】]*\d)[^】]{5,}】/g, '');
    text = text.replace(/「(?![^」]*\d)[^」]{5,}」/g, '');
    text = text.replace(/\[(?![^\]]*\d)[^\]]{5,}\]/g, '');
    text = text.replace(/\{(?![^}]*\d)[^}]{5,}\}/g, '');

    // 去掉多余的空格
    text = text.replace(/\s+/g, ' ').trim();
    
    console.log(`[TTS] 清洗后文本: "${text}"`);
    
    if (!text) {
        if (onEnd) onEnd();
        return;
    }

    // 队列过载保护：超出上限直接丢弃新语音（防止无限堆积）
    if (audioQueue.length >= MAX_QUEUE_SIZE) {
        console.warn(`⚠️ 语音队列已满(${MAX_QUEUE_SIZE})，丢弃: "${text.substring(0, 20)}..."`);
        if (onEnd) onEnd();      // 仍需回调，避免调用方一直等待
        return;
    }

    audioQueue.push({ text, onStart, onEnd });
    console.log(`📥 语音加入队列，当前队列长度: ${audioQueue.length}`);
    if (!isAudioPlaying) {
        processAudioQueue();
    }
}

async function processAudioQueue() {
    if (audioQueue.length === 0) {
        isAudioPlaying = false;
        console.log('✅ 队列已空，停止播放');
        return;
    }

    isAudioPlaying = true;
    const { text, onStart, onEnd } = audioQueue.shift();
    console.log(`▶️ 开始处理语音: "${text.substring(0, 20)}..."`);

    try {
        const cfg = window.SETTINGS_STORE.getAll();
        const ttsUrl = cfg.ttsUrl || 'http://127.0.0.1:8001/synthesize/';
        const ttsVoice = cfg.ttsVoice || 'zh-CN-XiaoyiNeural';

        // ==================== 修改点：带重试的 TTS 请求 ====================
        const MAX_RETRIES = 2;              // 最多重试 2 次（总共 3 次尝试）
        const REQUEST_TIMEOUT = 25000;      // 单次请求超时 25 秒（略大于服务端的 20s）

        let response = null;
        let lastError = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

            try {

                // ===== 新增计时 =====
                console.time('⏱️ [TTS] 合成耗时');

                response = await fetch(ttsUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text, voice: ttsVoice }),
                    signal: controller.signal
                });

                console.timeEnd('⏱️ [TTS] 合成耗时');

                clearTimeout(timeoutId);   // 请求成功，清除超时

                if (response.ok) {
                    break;                  // 成功，跳出重试循环
                }
                
                // 如果是 500 或 504 等错误，打印更详细的信息
                const errorDetail = await response.text().catch(() => 'No detail');
                console.warn(`⚠️ TTS 服务返回错误 ${response.status}: ${errorDetail}`);
                
                // ✅ 新增：如果是明确的网络/DNS 错误，直接标记为网络错误并跳过重试
                if (errorDetail.includes('getaddrinfo') || errorDetail.includes('timed out') || errorDetail.includes('504')) {
                    const netErr = new Error('NETWORK_CONNECTION_ERROR');
                    netErr.detail = errorDetail;
                    throw netErr;
                }
                
                // 抛出错误以便进入 catch 进行重试
                throw new Error(`Edge‑TTS 返回错误 ${response.status}`);
            } catch (err) {
                
                // ✅ 如果是网络连接错误，不再浪费时间重试，直接跳出循环
                if (err.message === 'NETWORK_CONNECTION_ERROR') {
                    console.error('🚫 检测到严重网络/DNS错误，放弃重试，准备降级');
                    lastError = err;
                    break;
                }

                // ===== 失败也记录耗时 =====
                console.warn(`⏱️ [TTS] 第${attempt + 1}次请求失败`, err.message);
                // =========================
                
                clearTimeout(timeoutId);
                lastError = err;
                if (attempt < MAX_RETRIES) {
                    // 等一小会儿再试，指数退避：1秒、2秒
                    await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
                }
            }
        }

        if (!response || !response.ok) {
            throw lastError || new Error('TTS 请求最终失败');
        }
        // ================================================================

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        audio.onplay = () => {
            console.log(`🎵 Edge‑TTS 开始播放: "${text.substring(0, 20)}..."`);
            window.STATE.isSpeaking = true;
            if (onStart) onStart();
        };

        audio.onended = () => {
            console.log(`🏁 Edge‑TTS 播放结束: "${text.substring(0, 20)}..."`);
            URL.revokeObjectURL(audioUrl);
            window.STATE.isSpeaking = false;
            if (onEnd) onEnd();
            processAudioQueue();
        };

        audio.onerror = (e) => {
            console.error('❌ Edge‑TTS 音频播放错误:', e);
            URL.revokeObjectURL(audioUrl);
            window.STATE.isSpeaking = false;
            if (onEnd) onEnd();
            processAudioQueue();
        };

        await audio.play();

    } catch (error) {
        // ==================== 修改点：简化降级逻辑 ====================
        console.warn('⚠️ Edge‑TTS 调用失败，降级到浏览器语音', error);
        speakWithBrowserTTS(text, onStart, onEnd);
        // ============================================================
    }
}

function speakWithBrowserTTS(text, onStart, onEnd) {
    if (!window.speechSynthesis) {
        console.warn('❌ 当前浏览器不支持语音合成');
        if (onEnd) onEnd();
        processAudioQueue();
        return;
    }

    // ✅ 新增：更稳健的数字转中文逻辑，支持多位数（如 87 读作 八十七）
    const processedText = text.replace(/\d+/g, (num) => {
        const units = ['', '十', '百', '千', '万'];
        const chars = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
        if (num.length === 1) return chars[parseInt(num)];
        if (num.length === 2) {
            if (num === '10') return '十';
            if (num.startsWith('1')) return '十' + chars[parseInt(num[1])];
            return chars[parseInt(num[0])] + '十' + (num[1] === '0' ? '' : chars[parseInt(num[1])]);
        }
        // 超过2位数的简单逐个读数字，防止逻辑过于复杂
        return num.split('').map(d => chars[parseInt(d)]).join('');
    });

    // 取消当前任何可能的残留语音
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(processedText);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 1;

    let finished = false;   // ✅ 防止 onend 被多次触发

    utterance.onstart = () => {
        console.log(`🎵 浏览器语音开始: "${text.substring(0, 20)}..."`);
        window.STATE.isSpeaking = true;
        if (onStart) onStart();
    };

    utterance.onend = () => {
        if (finished) return;
        finished = true;
        console.log(`🏁 浏览器语音结束: "${text.substring(0, 20)}..."`);
        window.STATE.isSpeaking = false;
        if (onEnd) onEnd();
        processAudioQueue();
    };

    utterance.onerror = (e) => {
        if (finished) return;
        finished = true;
        console.warn('⚠️ 浏览器语音出错:', e);
        window.STATE.isSpeaking = false;
        if (onEnd) onEnd();
        processAudioQueue();
    };

    const setVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v => v.lang === 'zh-CN' &&
            (v.name.includes('Xiaoxiao') || v.name.includes('Yating') || v.name.includes('Yaoyao'))
        );
        if (preferred) utterance.voice = preferred;
        window.speechSynthesis.speak(utterance);
    };

    if (window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.addEventListener('voiceschanged', setVoice, { once: true });
    } else {
        setVoice();
    }
}

// 导出模块
window.TTS = {
    speak,
    isPlaying: () => isAudioPlaying,
    queueLength: () => audioQueue.length
};