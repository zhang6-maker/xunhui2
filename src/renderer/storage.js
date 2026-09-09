/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  模块墓志铭
 * ═══════════════════════════════════════════════════════════════════════════
 * 模块名称: storage.js - 本地存储模块
 * 模块职责: 持久化数据（用户画像、对话历史、学习数据、日记）
 * 
 * 依赖模块:
 *   - window.DEPENDENCIES: 系统能力（fs, path, os.homedir）
 *   - window.CONFIG: 配置信息（FILE_PATHS）
 * 
 * 生命周期:
 *   - loadLearning(): 加载学习数据（好感度、记忆）
 *   - saveLearning(): 保存学习数据
 *   - loadHistory(): 加载对话历史
 *   - saveHistory(): 保存对话历史
 *   - writeDiary(content): 写入日记
 *   - 模块初始化时自动注入 window.STORAGE
 * 
 * 注意事项:
 *   - ✅ 文件路径: ~/${CONFIG.FILE_PATHS.*}（用户主目录）
 *   - ✅ 记忆去重: addMemory() 自动去重（相似度 > 50% 跳过）
 *   - ✅ 对话历史上限: 最近 20 条
 *   - ⚠️ getHistory() 返回裁剪后的历史（保留首尾上下文）
 * ═══════════════════════════════════════════════════════════════════════════
 */
// ==================== 本地存储模块 ====================
// 依赖: window.CONFIG, window.DEPENDENCIES

// 获取文件完整路径
function getFilePath(filename) {
    return window.DEPENDENCIES.path.join(window.DEPENDENCIES.os.homedir(), filename);
}

// ==================== 日记功能 ====================

// 当日事件数组（用于每日总结）
let todayEvents = [];

function writeDiary(content) {
    const timestamp = new Date().toLocaleString('zh-CN', { hour12: false });
    const entry = `[${timestamp}] ${content}\n`;
    const filePath = getFilePath(window.CONFIG.FILE_PATHS.diary);
    try {
        window.DEPENDENCIES.fs.appendFileSync(filePath, entry, 'utf8');
        console.log('日记记录:', entry);
    } catch (err) {
        console.error('写入日记失败:', err);
    }
}

function readDiary() {
    const filePath = getFilePath(window.CONFIG.FILE_PATHS.diary);
    try {
        if (window.DEPENDENCIES.fs.existsSync(filePath)) {
            return window.DEPENDENCIES.fs.readFileSync(filePath, 'utf8');
        } else {
            return '还没有日记记录呢～';
        }
    } catch (err) {
        console.error('读取日记失败:', err);
        return '日记读取失败';
    }
}

// 添加事件到当日事件数组（用于每日总结）
function addEventForDiary(eventType, detail = '') {
    todayEvents.push({
        type: eventType,
        detail: detail,
        timestamp: Date.now()
    });
    console.log(`[STORAGE] 添加日记事件: ${eventType} - ${detail}`);
}

// 清空当日事件
function clearTodayEvents() {
    todayEvents = [];
}

// 获取当日事件
function getTodayEvents() {
    return [...todayEvents];
}

// 生成每日总结日记（由AI生成）
async function generateDailySummary() {
    const events = getTodayEvents();
    if (events.length === 0) {
        console.log('[STORAGE] 今日无事件，跳过日记总结');
        return;
    }

    const affValue = window.AFFECTION?.getValue() ?? 50;
    const affPhase = window.AFFECTION?.getPhase() ?? '接受';
    const profile = learningData.userProfile || {};
    const userName = profile.name || '笨蛋';

    // 构建事件摘要
    const summary = events.map(e => `- ${e.detail}`).join('\n');

    const prompt = `你是寻慧，一个傲娇毒舌的桌面精灵。
时间：${new Date().toLocaleDateString('zh-CN')}
用户：${userName}
好感度：${affValue}（${affPhase}）
今天发生的事：
${summary}

请用第一人称写一篇80-150字的日记，傲娇地总结今天的心情和感受。要带点小情绪，不要太正经。只输出日记正文。`;

    try {
        const diary = await callOllamaSilent(prompt);
        if (diary && diary.trim()) {
            writeDiary(diary.trim());
            console.log('[STORAGE] 每日总结日记已生成');
        }
    } catch (e) {
        console.error('[STORAGE] 生成每日总结失败:', e);
        // 降级到简单总结
        const simpleSummary = `${userName}今天和我互动了${events.length}次。${affPhase === '喜欢' ? '哼，其实...还不错啦。' : '也就那样吧。'}`;
        writeDiary(simpleSummary);
    }

    clearTodayEvents();
}

// 静默调用Ollama（不显示UI）
async function callOllamaSilent(prompt) {
    const cfg = window.SETTINGS_STORE?.getAll?.() || { ollamaUrl: 'http://localhost:11435', ollamaModel: 'qwen2:7b' };
    try {
        const res = await fetch(`${cfg.ollamaUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: cfg.ollamaModel,
                prompt: prompt,
                stream: false,
                options: { temperature: 0.7 }
            })
        });
        const data = await res.json();
        return data.response?.trim();
    } catch (e) {
        console.error('[callOllamaSilent] 调用失败:', e);
        return null;
    }
}

function autoDiary(action, detail = '') {
    const userName = '姐姐';
    const diaryActions = window.CONFIG.DIARY_ACTIONS;
    let content = '';
    
    if (diaryActions[action]) {
        content = diaryActions[action](userName, detail);
    } else {
        content = diaryActions.default(userName);
    }
    writeDiary(content);
}

// ==================== 歌词功能 ====================
function loadLyrics() {
    const filePath = getFilePath(window.CONFIG.FILE_PATHS.lyrics);
    try {
        if (window.DEPENDENCIES.fs.existsSync(filePath)) {
            return JSON.parse(window.DEPENDENCIES.fs.readFileSync(filePath, 'utf8'));
        }
    } catch(e) { 
        console.error('加载歌词库失败', e); 
    }
    return {};
}

function saveLyrics(lyricsDB) {
    const filePath = getFilePath(window.CONFIG.FILE_PATHS.lyrics);
    try {
        window.DEPENDENCIES.fs.writeFileSync(filePath, JSON.stringify(lyricsDB, null, 2), 'utf8');
    } catch(e) { 
        console.error('保存歌词失败', e); 
    }
}

// ==================== 学习功能 ====================
let learningData = {
    dialog: {},
    gomoku: { winning_moves: [], losing_moves: [], player_style: 'normal', stats: { wins: 0, losses: 0, draws: 0 } },
    checkers: { winning_moves: [], losing_moves: [], stats: { wins: 0, losses: 0, draws: 0 } },
    emotion: { stats: {}, taunt_frequency: 0.5, comfort_frequency: 0.3 },
    userProfile: {                  //  用户画像
        name: '',                   // 用户名字
        gender: '',                 // 'male' 或 'female'
        hasLover: false,
        loverGender: '',
        birthday: ''                //  新增生日字段，格式 'MM-DD'
    },

    girlProfile: {          // 角色画像
        gender: 'female',  // 角色性别：female（女性）
        birthday: ''       // 角色生日
    },

    affection: {
        value: 50,          // 初始好感度
        lastChange: 0,      // 上次变化时间戳(毫秒)
        cooldown: 60000     // 冷却1分钟
    },

    lastGame: {             // 新增：最近玩的游戏记录
        game: null,         // 'gomoku' 或 'checkers'
        result: null,       // 'player', 'ai', 'draw'
        timestamp: 0        // 时间戳
    }
};

function loadLearning() {
    const filePath = getFilePath(window.CONFIG.FILE_PATHS.learning);
    try {
        if (window.DEPENDENCIES.fs.existsSync(filePath)) {
            const data = window.DEPENDENCIES.fs.readFileSync(filePath, 'utf8');
            Object.assign(learningData, JSON.parse(data));
        }
    } catch(e) { 
        console.error('加载学习数据失败', e); 
    }
    
    const nameQuestion = normalizeQuestion('你叫什么名字');
    if (!learningData.dialog[nameQuestion]) {
        learningData.dialog[nameQuestion] = {
            count: 5,
            preferred_responses: ['我叫寻慧呀！是你给我起的名字～', '我是寻慧，你的桌面小精灵'],
            last_reply: '我叫寻慧呀！'
        };
    }
    saveLearning();
}

function saveLearning() {
    const filePath = getFilePath(window.CONFIG.FILE_PATHS.learning);
    try {
        window.DEPENDENCIES.fs.writeFileSync(filePath, JSON.stringify(learningData, null, 2), 'utf8');
        console.log(`[STORAGE] ✅ 学习数据已保存到: ${filePath}`);
        console.log(`[STORAGE] 📋 用户画像: ${JSON.stringify(learningData.userProfile)}`);
        console.log(`[STORAGE] 👧 寻慧画像: ${JSON.stringify(learningData.girlProfile)}`);
        console.log(`[STORAGE] 📊 记忆对话数: ${Object.keys(learningData.dialog).length}`);
    } catch(e) { 
        console.error('[STORAGE] ❌ 保存学习数据失败:', e); 
    }
}

function normalizeQuestion(text) {
    return text.toLowerCase().replace(/[^\w\u4e00-\u9fa5]/g, '');
}

function recordDialog(userMsg, assistantReply) {
    const normalized = normalizeQuestion(userMsg);
    if (!learningData.dialog[normalized]) {
        learningData.dialog[normalized] = { count: 0, preferred_responses: [], last_reply: '' };
    }
    const entry = learningData.dialog[normalized];
    entry.count++;
    if (!entry.preferred_responses.includes(assistantReply)) {
        entry.preferred_responses.unshift(assistantReply);
        if (entry.preferred_responses.length > 5) entry.preferred_responses.pop();
    }
    entry.last_reply = assistantReply;
    saveLearning();
}

function getCannedReply(userMsg) {
    const normalized = normalizeQuestion(userMsg);
    console.log(`[STORAGE] 🔍 查找预设回复: "${userMsg}" (标准化: "${normalized}")`);
    
    // 1. 精确匹配
    const entry = learningData.dialog[normalized];
    if (entry && entry.preferred_responses.length > 0) {
        const reply = entry.preferred_responses[Math.floor(Math.random() * entry.preferred_responses.length)];
        console.log(`[STORAGE] ✅ 精确匹配成功: "${reply}"`);
        return reply;
    }
    
    // 2. 模糊匹配：检查是否有包含相同关键词的问题
    for (const [key, value] of Object.entries(learningData.dialog)) {
        if (key.length < 2 || normalized.length < 2) continue;
        
        // 检查关键词重叠
        const keyWords = key.split('');
        const inputWords = normalized.split('');
        const commonWords = keyWords.filter(w => inputWords.includes(w));
        
        // 如果有50%以上的关键词重叠，认为是相似问题
        if (commonWords.length / Math.max(key.length, normalized.length) >= 0.5) {
            if (value.preferred_responses.length > 0) {
                const reply = value.preferred_responses[Math.floor(Math.random() * value.preferred_responses.length)];
                console.log(`[STORAGE] ✅ 模糊匹配成功 (相似度: ${Math.round(commonWords.length / Math.max(key.length, normalized.length) * 100)}%): "${reply}"`);
                return reply;
            }
        }
    }
    
    console.log(`[STORAGE] ❌ 未找到匹配的预设回复`);
    return null;
}

function updateEmotionPreference(emotion, positive) {
    if (!learningData.emotion.stats[emotion]) {
        learningData.emotion.stats[emotion] = { positive: 0, total: 0 };
    }
    const stat = learningData.emotion.stats[emotion];
    stat.total++;
    if (positive) stat.positive++;
    const likeRate = stat.positive / stat.total;
    if (emotion === 'taunt') learningData.emotion.taunt_frequency = Math.min(0.9, likeRate + 0.2);
    if (emotion === 'comfort') learningData.emotion.comfort_frequency = Math.min(0.9, likeRate + 0.2);
    saveLearning();
}

function recordGameResult(game, result) {
    if (!learningData[game]) return;
    if (!learningData[game].stats) learningData[game].stats = { wins: 0, losses: 0, draws: 0 };
    
    const stats = learningData[game].stats;
    if (result === 'player') stats.losses++; // AI 输了 = 玩家赢了
    else if (result === 'ai') stats.wins++;
    else if (result === 'draw') stats.draws++;
    
    learningData.lastGame = {
        game: game,
        result: result,
        timestamp: Date.now()
    };
    
    saveLearning();
}

function getGameStats(game) {
    if (!learningData[game]) return null;
    return learningData[game].stats || { wins: 0, losses: 0, draws: 0 };
}

function getLastGame() {
    return learningData.lastGame || { game: null, result: null, timestamp: 0 };
}

// ==================== 历史记录 ====================
let chatHistory = [];
const MAX_HISTORY_TURNS = 10;

function _generateMessageId(role, content) {
    let hash = 0;
    const str = `${role}:${content}`;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16).substring(0, 16);
}

function loadHistory() {
    const filePath = getFilePath(window.CONFIG.FILE_PATHS.history);
    try {
        if (window.DEPENDENCIES.fs.existsSync(filePath)) {
            chatHistory = JSON.parse(window.DEPENDENCIES.fs.readFileSync(filePath, 'utf8'));
            if (chatHistory.length > MAX_HISTORY_TURNS * 2)
                chatHistory = chatHistory.slice(-MAX_HISTORY_TURNS * 2);
        }
    } catch(e) { 
        console.error('加载历史失败', e); 
    }
}

function saveHistory() {
    const filePath = getFilePath(window.CONFIG.FILE_PATHS.history);
    try {
        window.DEPENDENCIES.fs.writeFileSync(filePath, JSON.stringify(chatHistory, null, 2), 'utf8');
    } catch(e) { 
        console.error('保存历史失败', e); 
    }
}

function addToHistory(role, content) {
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
        console.warn('[addToHistory] 跳过空内容');
        return false;
    }
    
    const normalizedContent = content.trim();
    const messageId = _generateMessageId(role, normalizedContent);
    
    const recentMessages = chatHistory.slice(-5);
    const isDuplicate = recentMessages.some(msg => {
        if (msg.id && msg.id === messageId) {
            return true;
        }
        if (msg.role === role && msg.content && msg.content.trim() === normalizedContent) {
            return true;
        }
        return false;
    });
    
    if (isDuplicate) {
        console.warn(`[addToHistory] 检测到重复消息，已跳过: [${role}] ${normalizedContent.substring(0, 30)}...`);
        return false;
    }
    
    const message = {
        id: messageId,
        role: role,
        content: normalizedContent,
        timestamp: Date.now()
    };
    
    chatHistory.push(message);
    
    if (chatHistory.length > MAX_HISTORY_TURNS * 2) {
        chatHistory = chatHistory.slice(-MAX_HISTORY_TURNS * 2);
    }
    
    saveHistory();
    console.log(`[addToHistory] 成功添加消息: [${role}] ${normalizedContent.substring(0, 30)}...`);
    return true;
}

function clearHistory() {
    chatHistory = [];
    saveHistory();
    console.log('[clearHistory] 历史记录已清空');
}

function getHistory() {
    return chatHistory.map(msg => ({
        role: msg.role,
        content: msg.content
    }));
}

// 导出存储模块
window.STORAGE = {
    // 日记
    writeDiary,
    readDiary,
    autoDiary,
    addEventForDiary,
    clearTodayEvents,
    getTodayEvents,
    generateDailySummary,
    // 歌词
    loadLyrics,
    saveLyrics,
    // 学习
    loadLearning,
    saveLearning,
    recordDialog,
    getCannedReply,
    updateEmotionPreference,
    recordGameResult,
    getGameStats,
    getLastGame,
    // 历史
    loadHistory,
    saveHistory,
    addToHistory,
    clearHistory,
    getHistory,
    // 数据访问
    getLearningData: () => learningData,
    getChatHistory: () => chatHistory,
    // 用户画像更新
    updateUserProfile: (updates) => {
        Object.assign(learningData.userProfile, updates);
        saveLearning();
        console.log(`[STORAGE] 用户画像已更新: ${JSON.stringify(updates)}`);
    },

        // 节日祝福状态管理
    getFestivalLastDate: function() {
        const filePath = getFilePath('.girlpet_festival.txt');
        try {
            if (window.DEPENDENCIES.fs.existsSync(filePath)) {
                return window.DEPENDENCIES.fs.readFileSync(filePath, 'utf8').trim();
            }
        } catch(e) { console.error('读取节日状态失败', e); }
        return '';
    },
    setFestivalLastDate: function(dateStr) {
        const filePath = getFilePath('.girlpet_festival.txt');
        try {
            window.DEPENDENCIES.fs.writeFileSync(filePath, dateStr, 'utf8');
        } catch(e) { console.error('保存节日状态失败', e); }
    },

    getLastBootDate: function() {
        const filePath = getFilePath('.girlpet_lastboot.txt');
        try {
            if (window.DEPENDENCIES.fs.existsSync(filePath)) {
                return window.DEPENDENCIES.fs.readFileSync(filePath, 'utf8').trim();
            }
        } catch(e) { console.error('读取最后重启日期失败', e); }
        return '';
    },
    setLastBootDate: function(dateStr) {
        const filePath = getFilePath('.girlpet_lastboot.txt');
        try {
            window.DEPENDENCIES.fs.writeFileSync(filePath, dateStr, 'utf8');
        } catch(e) { console.error('保存最后重启日期失败', e); }
    }
};