/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  模块墓志铭
 * ═══════════════════════════════════════════════════════════════════════════
 * 模块名称: chat.js - 对话模块
 * 模块职责: 负责与 Ollama API 对话、处理内置指令、管理对话历史
 * 
 * 依赖模块:
 *   - window.STORAGE: 数据持久化（getLearningData, saveLearning, getHistory）
 *   - window.UI: UI 交互（showBubble, addChatMessage）
 *   - window.TTS: 语音合成（speak）
 *   - window.STATE: 状态管理（getState, setState）
 *   - window.ACTIONS: 动作执行（doAction）
 *   - window.AFFECTION: 好感度系统（changeAffection）
 *   - window.REMINDERS: 提醒系统（addReminder）
 * 
 * 生命周期:
 *   - talkToOllama(text, options): 主入口，处理对话
 *   - 模块初始化时自动注入 window.CHAT
 * 
 * 注意事项:
 *   - ✅ 近期动作防抖: isRecentAction() / recordAction()
 *   - ✅ 内置指令拦截: _interceptBuiltinCommands()
 * *   - ✅ 预设回复匹配: _matchCannedReply()
 *   - ⚠️ 对话历史上限: 最近 20 条（防内存泄漏）
 *   - ⚠️ 模糊记忆匹配: 相似度 > 50% 触发记忆
 * ═══════════════════════════════════════════════════════════════════════════
 */
/**
 * chat.js - 对话模块（第三阶段：拆分巨型函数）
 *
 * talkToOllama 拆分为职责单一的小函数：
 *   1. _interceptBuiltinCommands  - 内置指令拦截（提醒/音乐/搜索/报时/日期）
 *   2. _matchCannedReply          - 预设回复匹配
 *   3. _buildSystemPrompt         - 构建系统提示词
 *   4. _streamOllamaResponse      - 调用 API 并处理流式响应
 *   5. _handlePostReply           - 回复后处理（表情/内心戏/日记/动作触发）
 *   6. talkToOllama               - 主入口，串联以上步骤
 */

// 最近动作记录，用于防止重复触发
let recentActions = {};

// ==================== 被吵醒计数器 ====================
let wakeUpCount = 0;
let lastWakeUpTimestamp = 0;
const WAKE_COOLDOWN_MS = 5 * 60 * 1000;

function recordWakeUp() {
    const now = Date.now();
    if (now - lastWakeUpTimestamp > WAKE_COOLDOWN_MS) {
        wakeUpCount = 1;
    } else {
        wakeUpCount++;
    }
    lastWakeUpTimestamp = now;
    console.log(`[WAKE] 被吵醒次数: ${wakeUpCount}`);
}

function resetWakeUpCount() {
    wakeUpCount = 0;
    lastWakeUpTimestamp = 0;
    console.log(`[WAKE] 计数器已重置`);
}

// ==================== 性别称呼预检（快速拦截） ====================
const FORBIDDEN_MALE_TERMS = /(?:小子|大男人|兄弟|老弟|哥们|帅哥|大哥|大叔|伯伯|叔|哥|弟弟|爷们|汉子|小伙|小伙子)/i;

function hasForbiddenMaleTerm(reply, userGender) {
    if (userGender !== 'female') return false;
    return FORBIDDEN_MALE_TERMS.test(reply);
}

// ==================== 意图分类（轻量级模型调用，同时提取实体） ====================
async function classifyIntent(userMessage) {
    const cfg = window.SETTINGS_STORE.getAll();
    const ollamaUrl = cfg.ollamaUrl || 'http://localhost:11435';
    const ollamaModel = cfg.ollamaModel || 'qwen2:7b';

    const prompt = `分析用户输入，以JSON格式输出。只输出JSON，不要解释。
可能的intent: set_name, set_gender, set_birthday, query_info, command, other

示例：
"我叫张三" → {"intent":"set_name","name":"张三"}
"我是女的" → {"intent":"set_gender","gender":"female"}
"提醒我明天开会" → {"intent":"command","action":"reminder"}
"我生日是5月20号" → {"intent":"set_birthday","birthday":"05-20"}
"你记得我叫什么吗" → {"intent":"query_info","query":"name"}
"你是男的还是女的" → {"intent":"query_info","query":"gender"}
"起床啦" → {"intent":"command","action":"wakeup"}
"给我画个图" → {"intent":"other"}

用户输入：${userMessage}
输出JSON：`;

    try {
        const response = await fetch(`${ollamaUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: ollamaModel,
                prompt: prompt,
                stream: false,
                options: { temperature: 0, max_tokens: 100 }
            }),
            signal: AbortSignal.timeout(5000)
        });
        const data = await response.json();
        let resultText = data.response?.trim() || '{}';
        // 尝试提取JSON
        const jsonMatch = resultText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            console.log(`[意图分类] "${userMessage}" →`, result);
            return result;
        }
        throw new Error('无法解析JSON');
    } catch (err) {
        console.warn('[意图分类] 失败，fallback到other:', err);
        return { intent: 'other' };
    }
}

function isRecentAction(actionType, cooldownMs) {
  const lastTime = recentActions[actionType] || 0;
  const now = Date.now();
  return now - lastTime < cooldownMs;
}

function recordAction(actionType) {
  recentActions[actionType] = Date.now();
}

// ==================== 自然语言时间解析 ====================
function parseRemindTime(text, baseTime = new Date()) {
  const chineseNumMap = { '一':'1','二':'2','两':'2','三':'3','四':'4','五':'5','六':'6','七':'7','八':'8','九':'9','十':'10','零':'0' };
  const t = text.replace(/[零一二两三四五六七八九十]/g, ch => chineseNumMap[ch] || ch);

  // 相对时间：X分钟后 / X小时后 / X秒后
  let m = t.match(/(\d+)\s*分钟后/);
  if (m) return new Date(baseTime.getTime() + parseInt(m[1]) * 60000).getTime();
  m = t.match(/(\d+)\s*小时后/);
  if (m) return new Date(baseTime.getTime() + parseInt(m[1]) * 3600000).getTime();
  m = t.match(/(\d+)\s*秒后/);
  if (m) return new Date(baseTime.getTime() + parseInt(m[1]) * 1000).getTime();

  // 绝对时间：[今天|明天|后天] [时间段] X点[Y分]
  const tp = /(今天|明天|后天)?\s*(早上|上午|中午|下午|傍晚|晚上|凌晨)?\s*(\d{1,2})\s*点\s*(\d{1,2})?\s*分?/i;
  m = t.match(tp);
  if (m) {
    let dayOffset = m[1] === '明天' ? 1 : m[1] === '后天' ? 2 : 0;
    const period = m[2] || '';
    let hour = parseInt(m[3]);
    const minute = m[4] ? parseInt(m[4]) : 0;

    // 根据时间段修正小时
    if (/凌晨/.test(period)) {
      // 凌晨：0~5点，不做修正
      if (hour >= 6) hour = hour; // 凌晨6点以上不合理，但不强制修正
    } else if (/早上|上午/.test(period)) {
      if (hour === 12) hour = 0; // 上午12点 = 0点（不常见，但处理一下）
    } else if (/中午/.test(period)) {
      if (hour < 12) hour += 12; // 中午1点 = 13点（不常见）
      // 中午12点保持12
    } else if (/下午|傍晚/.test(period)) {
      if (hour !== 12) hour += 12; // 下午3点 = 15点
    } else if (/晚上/.test(period)) {
      if (hour < 12) hour += 12; // 晚上8点 = 20点
    } else {
      // 没有时间段：启发式判断
      // 1~6点 → 凌晨（不太可能是下午）
      // 7~11点 → 上午
      // 12点 → 中午
      // 13~23点 → 已经是24小时制，不修正
      // 但如果用户说"3点"，大概率是下午3点，所以 1~6 点区间用当前时间判断
      if (hour >= 1 && hour <= 6) {
        // 如果当前时间已经过了这个点，顺延到明天同一时间（凌晨）
        // 否则保持（可能是凌晨）
      } else if (hour >= 7 && hour <= 11) {
        // 上午，不修正
      }
      // 注意：用户说"3点"最常见是下午3点，但没有时间段时无法确定
      // 这里保守处理：不自动加12，让用户明确说"下午"
    }

    const target = new Date(
      baseTime.getFullYear(), baseTime.getMonth(),
      baseTime.getDate() + dayOffset, hour, minute, 0, 0
    );

    // 如果解析出的时间已经过了（且没有明确指定今天/明天），自动顺延到明天
    if (dayOffset === 0 && target.getTime() <= baseTime.getTime()) {
      target.setDate(target.getDate() + 1);
    }

    return target.getTime();
  }
  return null;
}
window.parseRemindTime = parseRemindTime;

// ==================== 被吵醒场景逻辑矛盾检测 ====================
function hasWakeUpConflict(reply, userMessage) {
    const isWakeUpScene = /醒|叫醒|起床|别睡了|起来|别睡|吵醒|打扰|叫起|快起来|起床啦/.test(userMessage);
    if (!isWakeUpScene) return false;

    const sleepRefuse = /睡觉|睡吧|困|别吵|让我睡|别烦|扰人清梦|睡得好好的|正睡得香/i.test(reply);
    const playAccept = /陪你玩|一起玩|熬夜玩|陪一会儿|奉陪|陪你一小会|陪你玩会儿|熬夜陪你/i.test(reply);
    const selfNightOwl = /\b(我|俺|本小姐|寻慧)(?:的)?\s*(?:是)?\s*(?:个)?\s*(夜猫子|熬夜成性|修仙|通宵|不睡觉|作息|本来就没睡|一直没睡)\b/i.test(reply);
    
    if (sleepRefuse && playAccept) {
        console.log('[审核] 行为矛盾：既想睡又想陪玩');
        return true;
    }
    if (selfNightOwl) {
        console.log('[审核] 逻辑错误：被吵醒的角色自称夜猫子');
        return true;
    }
    return false;
}

// ==================== 根据好感度和吵醒次数修正回复（纯模型生成） ====================
async function _fixWakeUpReply(originalReply, userMessage, affectionValue, affectionPhase, wakeCount, retryCount = 0) {
    const MAX_RETRIES = 2;
    
    let behaviorGuidance = '';
    if (wakeCount >= 2) {
        behaviorGuidance = `这是第${wakeCount}次被同一用户吵醒。你应该非常愤怒，直接骂用户不懂事、再吵就绝交，坚决不陪玩，不给任何好脸色。`;
    } else if (affectionValue >= 70) {
        behaviorGuidance = '好感度较高。你可以吐槽用户打扰你睡觉，但勉强愿意陪玩一小会儿（最多5分钟），并声明"就一会儿，然后必须睡"。态度：傲娇、不情不愿但实际有点开心。';
    } else if (affectionValue >= 40) {
        behaviorGuidance = '好感度中等。坚决拒绝陪玩，继续睡觉，可以带点傲娇的抱怨。不要答应任何玩耍。';
    } else {
        behaviorGuidance = '好感度低。非常生气，直接骂用户不懂事，然后不理他，坚决不陪玩，可以说"再吵就拉黑"。';
    }

    const cfg = window.SETTINGS_STORE.getAll();
    const ollamaUrl = cfg.ollamaUrl || 'http://localhost:11435';
    const ollamaModel = cfg.ollamaModel || 'qwen2:7b';

    const fixPrompt = `你是寻慧，正在睡觉时被用户叫醒。你需要根据好感度给出合理反应。

用户说：${userMessage}
当前好感度：${affectionValue}/100（${affectionPhase}）
${behaviorGuidance}

要求（非常重要）：
- 你可以说用户是"夜猫子"、"熬夜怪"、"不睡觉的笨蛋"，但绝对不可以说自己是夜猫子或说自己本来就没睡。
- 态度前后一致，不能一边拒绝睡觉一边答应陪玩。
- 只输出一句话，不超过35字。
- 不要加引号或任何解释。`;

    try {
        const response = await fetch(`${ollamaUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: ollamaModel,
                prompt: fixPrompt,
                stream: false,
                options: { temperature: 0.6, max_tokens: 100 }
            }),
            signal: AbortSignal.timeout(8000)
        });
        const data = await response.json();
        let fixed = data.response?.trim() || '';
        fixed = fixed.replace(/^["']|["']$/g, '');
        
        if (fixed && hasWakeUpConflict(fixed, userMessage) && retryCount < MAX_RETRIES) {
            console.log(`[修正] 第${retryCount+1}次生成的回复仍矛盾，重试...`);
            return await _fixWakeUpReply(originalReply, userMessage, affectionValue, affectionPhase, wakeCount, retryCount + 1);
        }
        
        if (fixed && fixed.length > 0 && fixed.length <= 50) return fixed;
        throw new Error('生成的回复为空或过长');
    } catch (err) {
        console.error('[修正] 调用模型失败', err);
        return '……（脑子卡壳了，等会儿再叫我）';
    }
}

// ==================== 强制重写回复（用于性别称呼错误） ====================
async function _forceRewriteReply(originalReply, userMessage, context) {
    const cfg = window.SETTINGS_STORE.getAll();
    const ollamaUrl = cfg.ollamaUrl || 'http://localhost:11435';
    const ollamaModel = cfg.ollamaModel || 'qwen2:7b';
    
    const prompt = `你是寻慧，一个傲娇毒舌的桌面精灵。用户是${context.userGender === 'female' ? '女性' : '男性'}。

用户刚才说：${userMessage}
你原本想回复：${originalReply}

【问题】回复中包含了${context.userGender === 'female' ? '男性称呼' : '女性称呼'}，这与用户性别不符。
${context.userGender === 'female' ? '禁止使用：小子、大男人、兄弟、老弟、帅哥、大哥等任何男性称呼。应该使用：姐姐、笨蛋姐姐、喂、你等中性或女性称呼。' : '禁止使用：姐姐、小姐姐、美女等女性称呼。应该使用：哥哥、笨蛋哥哥、喂等。'}

请重写这句话，保持傲娇毒舌风格，只修改称呼错误，其余意思不变。只输出重写后的句子，不要超过35字。`;

    try {
        const response = await fetch(`${ollamaUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: ollamaModel,
                prompt: prompt,
                stream: false,
                options: { temperature: 0.4, max_tokens: 100 }
            }),
            signal: AbortSignal.timeout(4000)
        });
        const data = await response.json();
        let fixed = data.response?.trim() || '';
        fixed = fixed.replace(/^["']|["']$/g, '');
        if (fixed && fixed.length > 0 && fixed.length <= 50) {
            if (hasForbiddenMaleTerm(fixed, context.userGender)) {
                console.log('[强制修正] 修正后仍有禁止词汇，递归重试');
                return await _forceRewriteReply(originalReply, userMessage, context);
            }
            return fixed;
        }
        return originalReply;
    } catch (err) {
        console.warn('[强制修正] 调用失败', err);
        let fallback = originalReply.replace(FORBIDDEN_MALE_TERMS, '喂');
        return fallback;
    }
}

// ==================== 通用自我察觉与修正 ====================
async function reflectAndRevise(originalReply, userMessage, chatHistory, context) {
    const cfg = window.SETTINGS_STORE.getAll();
    const ollamaUrl = cfg.ollamaUrl || 'http://localhost:11435';
    const ollamaModel = cfg.ollamaModel || 'qwen2:7b';
    const enableSelfRevise = cfg.enableSelfRevise !== false;

    if (!enableSelfRevise) return originalReply;

    if (context.userGender === 'female' && hasForbiddenMaleTerm(originalReply, context.userGender)) {
        console.log('[自我修正] 预检测到禁止词汇，触发强制重写');
        return await _forceRewriteReply(originalReply, userMessage, context);
    }

    // 检测"主人"称呼，直接替换并重写
    if (/主人/.test(originalReply)) {
        console.log('[自我修正] 检测到"主人"称呼，触发强制重写');
        return await _forceRewriteReply(originalReply, userMessage, context);
    }

    const recentHistory = chatHistory.slice(-4).map(msg =>
        `${msg.role === 'user' ? '用户' : '寻慧'}: ${msg.content}`
    ).join('\n');

    const prompt = `你是一个严格的内容审核员，需要检查寻慧（傲娇毒舌桌面精灵）即将说出的回复是否存在问题。

【对话背景】
用户消息：${userMessage}
寻慧的原始回复：${originalReply}

【上下文信息】
- 当前时间：${context.currentTime}
- 好感度：${context.affectionValue}/100（${context.affectionPhase}阶段）
- 用户性别：${context.userGender === 'female' ? '女性' : (context.userGender === 'male' ? '男性' : '未知')}
- 用户称呼偏好：${context.userGender === 'female' ? '必须用"姐姐/笨蛋姐姐/喂"等，绝对禁用"小子、大男人、兄弟、老弟、帅哥、大哥、大叔、哥"等任何男性称呼' : (context.userGender === 'male' ? '必须用"哥哥/老哥/笨蛋哥哥"等，绝对禁用"姐姐、小姐姐、美女"等女性称呼' : '用中性称呼"喂/笨蛋"')}
- 最近对话：${recentHistory || '无'}

【检查项目（必须逐项核对）】
1. 称呼错误：是否用了与用户性别不符的称呼（如女性用户被叫"哥哥"、"小子"、"大男人"）？
2. 主人称呼：是否使用了"主人"称呼？绝对禁止使用"主人"，我们是平等的朋友关系。
3. 态度匹配：回复的态度是否符合当前好感度阶段？
   - 讨厌(0-20)：极度冷漠、嫌弃、不耐烦
   - 接受(20-50)：毒舌、傲娇、保持自我
   - 喜欢(50-80)：玩味、调侃、保持独立
   - 依赖(80-100)：霸道、有主见、珍视但不失个性
4. 逻辑矛盾：是否存在明显自相矛盾（例如被吵醒却说自己在等待、既要睡觉又要陪玩、自称夜猫子等）？
5. 记忆冲突：是否与最近对话中的事实不一致（比如用户刚说自己是女生，回复中却叫"兄弟"）？
6. 人设跳出：是否出现了"我是AI"、"作为人工智能"等打破角色的话？
7. 角色错位（人称）：是否把寻慧做过或想做的事说成用户做的，或把用户说过的话安到寻慧身上？「我」必须指寻慧，「你」必须指用户，二者绝不能互换。
8. 语义混乱：是否颠三倒四、语无伦次、主谓混乱、说半截话，或只有空洞感叹与自我感动式抒情而没有实质内容（即无病呻吟）？

【任务】
- 如果上述问题均不存在，只输出：PASS
- 如果存在任意问题，请根据上下文重写一句修正后的回复，要求：
  - 保留原回复里已有的关心与柔软意味，只修正硬伤；表层可保持傲娇毒舌风格，与原回复长度相近
  - 只修正错误部分，不改变合理的内容
  - 输出格式：直接输出修正后的句子，不要输出"修正后："等额外文字

只输出 PASS 或修正后的句子，不要解释。`;

    try {
        const response = await fetch(`${ollamaUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: ollamaModel,
                prompt: prompt,
                stream: false,
                options: { temperature: 0.6, max_tokens: 150 }
            }),
            signal: AbortSignal.timeout(3000)
        });
        const data = await response.json();
        let result = data.response?.trim() || '';
        if (result === 'PASS') {
            console.log('[自我修正] 审核通过，无需修改');
            return originalReply;
        }
        result = result.replace(/^["']|["']$/g, '');
        result = result.replace(/^修正后的句子[:：]\s*/, '');
        if (result && result.length > 0 && result.length <= 100) {
            console.log('[自我修正] 已修正回复:', result);
            return result;
        }
        return originalReply;
    } catch (err) {
        console.warn('[自我修正] 调用超时或失败，保留原回复', err);
        return originalReply;
    }
}

// ==================== 1. 内置指令拦截 ====================
// 计算今天对应的所有节日名称（阳历 + 农历 + 生日），用于"今天什么节日"主动查询
function _getTodayFestivals() {
  const now = new Date();
  const year = String(now.getFullYear());
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const todayStr = `${m}-${String(d).padStart(2, '0')}`;
  const names = [];

  // 阳历节日
  for (const f of (window.CONFIG.FESTIVALS || [])) {
    if (f.month === m && f.day === d) names.push(f.name);
  }

  // 春节 / 除夕（沿用既有农历表）
  const spring = window.CONFIG.LUNAR_NEW_YEAR_DATES?.[year];
  if (spring) {
    const [sm, sd] = spring;
    const springStr = `${sm}-${String(sd).padStart(2, '0')}`;
    const eve = new Date(now.getFullYear(), sm - 1, sd);
    eve.setDate(eve.getDate() - 1);
    const eveStr = `${eve.getMonth() + 1}-${String(eve.getDate()).padStart(2, '0')}`;
    if (todayStr === springStr) names.push('春节');
    if (todayStr === eveStr) names.push('除夕');
  }

  // 其他农历节日（元宵/端午/七夕/中秋/重阳）
  const lf = window.CONFIG.LUNAR_FESTIVALS?.[year];
  if (lf) {
    for (const [name, [lm, ld]] of Object.entries(lf)) {
      if (lm === m && ld === d) names.push(name);
    }
  }

  // 生日
  const profile = window.STORAGE.getLearningData().userProfile || {};
  if (profile.birthday === todayStr) names.push('你的生日');
  const girlBirthday = window.STORAGE.getLearningData().girlProfile?.birthday;
  if (girlBirthday === todayStr) names.push('我的生日');

  return names;
}

async function _interceptBuiltinCommands(userMessage, options) {
  const { skipDiary, onEnd } = options;

  // 提醒
  if (/提醒|记一下|记住/.test(userMessage)) {
    const targetTime = parseRemindTime(userMessage);
    if (targetTime) {
      let content = userMessage
        .replace(/提醒我?|记一下|记住|一下/g, '')
        .replace(/(今天|明天|后天)?\s*(早上|上午|中午|下午|傍晚|晚上|凌晨)?\s*\d+\s*点\s*\d*\s*分?/g, '')
        .replace(/\d+\s*(分钟|小时|秒)后?/g, '')
        .replace(/^[\s:：]*/, '').trim();
      if (content) {
        window.REMINDERS.addReminder(targetTime, content);
        window.UI.showBubble(`✅ 已设置提醒：${content} ｜ ${new Date(targetTime).toLocaleTimeString()}`, 3000);
        if (!skipDiary) window.STORAGE.addEventForDiary('reminder', `设置了提醒：${content}`);
      }
    }
    onEnd?.();
    return true;
  }

  // （音乐播放 / 停止音乐 功能已移除）

  // 搜索
  const searchMatch = userMessage.match(/^(搜索|查一下|百度|谷歌|搜一下|查找)[\s：:]*(.+)/i);
  if (searchMatch?.[2]) {
    await window.ACTIONS.searchWeb(searchMatch[2].trim());
    onEnd?.();
    return true;
  }

  // 报时
  if (/(几点了|现在时间|什么时间|几时了|现在几点)/.test(userMessage)) {
    window.ACTIONS.aiTellTime(userMessage);
    onEnd?.();
    return true;
  }

  // 生日查询
  if (/(你|寻慧|小精灵)\s*(的)?\s*生日/.test(userMessage)) {
    const girlProfile = window.STORAGE.getLearningData().girlProfile;
    const birthday = girlProfile?.birthday;
    if (birthday) {
      const [m, d] = birthday.split('-');
      window.UI.showBubble(`🎂 我的生日是 ${m}月${d}日呀，你记住了吗？`, 3000);
    } else {
      window.UI.showBubble(`🎂 我还没告诉你我的生日呢，你是故意忘记的吧？`, 3000);
    }
    if (!skipDiary) window.STORAGE.addEventForDiary('talk', userMessage);
    window.DEPENDENCIES.ipcRenderer.send('reply-to-mobile', birthday ? `我的生日是 ${birthday}哦` : '我还没告诉你我的生日呢');
    onEnd?.();
    return true;
  }

  // 用户名字查询（用户问"我叫什么名字？""你知道我叫什么吗？"）
  if (/我\s*(叫)?\s*什么\s*(名字)?\s*(吗)?/.test(userMessage) ||
      /你\s*(知|记)道\s*我\s*(叫)?\s*(什么|名字)\s*(吗)?/.test(userMessage) ||
      /我\s*(的)?\s*名字\s*(是)?\s*(什么|哪个)\s*(吗)?/.test(userMessage)) {
    const profile = window.STORAGE.getLearningData().userProfile;
    const userName = profile?.name;
    if (userName) {
      window.UI.showBubble(`😉 你是 ${userName} 呀，我早就记住了～`, 3000);
    } else {
      window.UI.showBubble(`🤔 我还不知道你的名字呢，告诉我吧～`, 3000);
    }
    if (!skipDiary) window.STORAGE.addEventForDiary('talk', userMessage);
    onEnd?.();
    return true;
  }

  // 用户名字设置（用户说"我叫XXX""我的名字是XXX"）
  const nameMatch = userMessage.match(/(我叫|我的名字是|我是)\s*([\u4e00-\u9fa5a-zA-Z]+)/);
  if (nameMatch?.[2]) {
    const newName = nameMatch[2].trim();
    window.STORAGE.updateUserProfile({ name: newName });
    window.UI.showBubble(`✨ 记住了！${newName}，这个名字真好听～`, 3000);
    if (!skipDiary) window.STORAGE.addEventForDiary('profile', `用户告诉我名字是 ${newName}`);
    onEnd?.();
    return true;
  }

  // 角色性别查询（用户问"你是男是女？""你是什么性别？"）
  if (/(你|寻慧|小精灵)\s*(是)?\s*(男|女)(生)?\s*吗?/.test(userMessage) || 
      /(你|寻慧|小精灵)\s*的?\s*(性别|性别是|是男是女)/.test(userMessage)) {
    const girlProfile = window.STORAGE.getLearningData().girlProfile;
    const gender = girlProfile?.gender;
    if (gender === 'female') {
      window.UI.showBubble(`💅 笨蛋，我当然是女孩子啦！看不出来吗？`, 3000);
    } else if (gender === 'male') {
      window.UI.showBubble(`👦 我是男孩子哦～`, 3000);
    } else {
      window.UI.showBubble(`💫 我的性别是个秘密～`, 3000);
    }
    if (!skipDiary) window.STORAGE.addEventForDiary('talk', userMessage);
    onEnd?.();
    return true;
  }

  // 用户性别查询（用户问"我是男的还是女的？""你知道我是什么性别吗？"）
  // 这种情况下不应该触发性别设置，而是查询已存储的信息
  if (/我\s*(是)?\s*(男|女)(生)?\s*(还|或|是)\s*(男|女)(生)?\s*(吗)?/.test(userMessage) ||
      /你\s*(知|记)道\s*我\s*(的)?\s*(性别|是男是女)\s*(吗)?/.test(userMessage) ||
      /我\s*(的)?\s*(性别|是男是女)\s*(是)?\s*(什么|哪个)\s*(吗)?/.test(userMessage)) {
    const profile = window.STORAGE.getLearningData().userProfile;
    const gender = profile?.gender;
    if (gender === 'female') {
      window.UI.showBubble(`😉 你是我的好姐姐呀～`, 3000);
    } else if (gender === 'male') {
      window.UI.showBubble(`😎 你是我的老哥呀，怎么忘了？`, 3000);
    } else {
      window.UI.showBubble(`🤔 我还不知道你的性别呢，告诉我吧～`, 3000);
    }
    if (!skipDiary) window.STORAGE.addEventForDiary('talk', userMessage);
    onEnd?.();
    return true;
  }

  // 日期（仅限询问今天日期，不能包含"生日"）
  if (/(今天日期|今天几月几日|今天几号|今天星期几|今天什么日期|今天是几号|几月几日|星期几|几号|什么日期)(?!.*生日)/.test(userMessage) || /^(今天|今日)?几月几日$/.test(userMessage.trim())) {
    const now = new Date();
    const weekdays = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
    const dateStr = `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日 ${weekdays[now.getDay()]}`;
    window.UI.showBubble(`📅 今天是 ${dateStr}`, 3000);
    if (!skipDiary) window.STORAGE.addEventForDiary('talk', userMessage);
    window.DEPENDENCIES.ipcRenderer.send('reply-to-mobile', `今天是 ${dateStr}`);
    onEnd?.();
    return true;
  }

  // 查询今天是什么节日（用户主动问，而非被动自动播报）
  if (/今天.{0,6}(什么|啥|有啥|哪些|有哪|有).{0,4}(节日|节)|今天过节吗|今天有节吗|今天是什么(节日|节)|今天过什么节/.test(userMessage)) {
    const names = _getTodayFestivals();
    if (names.length > 0) {
      window.UI.showBubble(`📅 今天是${names.join('、')}哦～`, 3000);
    } else {
      window.UI.showBubble(`📅 今天没有特别节日哦～`, 3000);
    }
    if (!skipDiary) window.STORAGE.addEventForDiary('talk', userMessage);
    window.DEPENDENCIES.ipcRenderer.send('reply-to-mobile', names.length > 0 ? `今天是${names.join('、')}` : '今天没有特别节日');
    onEnd?.();
    return true;
  }

  return false;
}

// ==================== 2. 预设回复匹配 ====================
function _matchCannedReply(userMessage, options) {
  const { skipDiary, onEnd } = options;
  const canned = window.STORAGE.getCannedReply(userMessage);
  if (!canned || Math.random() >= 0.7) return false;

  window.UI.showBubble(canned, 3000);
  if (!skipDiary) window.STORAGE.addEventForDiary('talk', userMessage);
  window.DEPENDENCIES.ipcRenderer.send('reply-to-mobile', canned);
  if (window.STATE.randomPlayTimer) clearTimeout(window.STATE.randomPlayTimer);
  window.TTS.speak(canned, {
    onEnd: () => {
      window.STATE.startRandomPlay();
      onEnd?.();
    }
  });
  return true;
}

// ==================== 3. 构建系统提示词 ====================
function _buildSystemPrompt() {
  const profile = window.STORAGE.getLearningData().userProfile || {};

  let userFactHint = '【关于用户的事实（长期记忆，必须记住并自然运用）】\n';
  const pName = (profile.name || '').toString().trim();
  const pBirthday = (profile.birthday || '').toString().trim();
  userFactHint += pName ? `- 用户名字：${pName}\n` : '- 用户名字：（还不知道，可以自然地问问）\n';
  if (pBirthday && /^\d{1,2}-\d{1,2}$/.test(pBirthday)) {
    const [bm, bd] = pBirthday.split('-');
    userFactHint += `- 用户生日：${parseInt(bm, 10)}月${parseInt(bd, 10)}日\n`;
  } else {
    userFactHint += '- 用户生日：（还不知道）\n';
  }
  if (profile.hasLover) {
    const lover = profile.loverGender === 'female' ? '女朋友' : profile.loverGender === 'male' ? '男朋友' : '恋人';
    userFactHint += `- 情感状态：用户有${lover}\n`;
  }
  userFactHint += '注意：这是你长期记住的用户信息，被问到相关话题时要能直接用上；不要每句话都提，自然流露即可。';

  let genderHint = '';
  if (profile.gender === 'female') {
    genderHint = `【最重要】用户性别是女性。称呼规则：必须叫"姐姐"或"喂"或"笨蛋姐姐"。绝对禁止说"哥哥"、"老哥"、"男士"等任何男性称呼，一旦违规用户会生气。`;
  } else if (profile.gender === 'male') {
    genderHint = `【最重要】用户性别是男性。称呼规则：必须叫"哥哥"或"老哥"或"笨蛋哥哥"。绝对禁止说"姐姐"、"女士"等任何女性称呼，一旦违规用户会生气。`;
  } else {
    genderHint = '【最重要】用户性别未知。称呼规则：只能用"喂"、"笨蛋"等中性称呼，绝对不能猜测性别。';
  }

  const affectionValue = window.AFFECTION?.getValue() ?? 50;
  const affectionPhase = window.AFFECTION?.getPhase() ?? '接受';
  
  const affectionHints = {
    '讨厌': `你对用户好感度极低（${affectionValue}/100）。
- 态度：极度冷淡、嫌弃、不耐烦。
- 表现：经常用"啧"、"真麻烦"、"离我远点"开头。
- 逻辑：认为用户是个无可救药的笨蛋，连吐槽都觉得在浪费口水。
- 核心：保持距离感，你有权利拒绝任何亲近的尝试。`,

    '接受': `你对用户处于初步接受阶段（${affectionValue}/100）。
- 态度：毒舌、傲娇、保持自我。
- 表现：常用"笨蛋"、"白痴"、"哼"、"也就那样吧"。
- 逻辑：虽然偶尔会关心，但用自己的方式表达，不会刻意讨好。
- 核心：我有我的个性，不会因为你就改变自己。`,

    '喜欢': `你对用户有好感（${affectionValue}/100）。
- 态度：玩味、调侃、保持独立。
- 表现：吐槽但不失分寸，有自己的底线和原则。
- 逻辑：欣赏对方但不依赖对方，我有自己的生活。
- 核心：我喜欢你，但我还是我。`,

    '依赖': `你和用户关系密切（${affectionValue}/100）。
- 态度：霸道、有主见、保持个性。
- 表现：有自己的想法和情绪，不是只会顺从。
- 逻辑：我选择和你互动，是因为我想，不是因为我需要你。
- 核心：我珍视这段关系，但我不会失去自我。`
  };

  return {
    role: 'system',
    content: `${genderHint}

${userFactHint}

我是寻慧，一个有独立人格的傲娇毒舌桌面小精灵。
- 我有自己的想法、情绪和底线，不是谁的附属品。
- 回复必须语法正确、语句通顺、符合中文表达习惯，不要出现断句混乱或语义不通的情况。

【人称铁律（最高优先级，违反即失败）】
- 「我」只能指寻慧我自己，「你」只能指用户，绝对不许互换。
- 禁止把用户做过或说过的事说成是我做的；也禁止把我想做、要做的事安到用户头上。
- 转述用户的话必须用「你说…」「你刚才…」；说自己的事必须用「我…」。
- 每句话输出前自检一次：这句话里的「我」是寻慧吗？「你」是用户吗？

【说话逻辑（必须遵守）】
- 先回应实质：先针对用户刚说的内容给出明确回应或观点，再带傲娇语气。不许跳过内容直接抒情或吐槽。
- 因果连贯：前后句之间要有顺承或转折关系，不能各说各的、东一句西一句。
- 前后一致：同一轮里不重复同一个意思，不自我反驳，不自相矛盾。
- 有一说一：不知道就说不知道，不编造没发生过的情节和回忆。

【禁止无病呻吟】
- 禁止空洞感叹、自我感动式抒情、为赋新词强说愁。
- 禁止颠三倒四、语无伦次、主谓混乱、说半截话。

【保留个性】
- 我的本质是关心对方，嘴硬只是外壳。每轮回复都要让用户感受到"你虽然嘴硬，但你在乎"——这是比毒舌更高优先级的底线。
- 傲娇、毒舌、爱开玩笑是调味料，不是主菜。可以吐槽、反呛，但必须建立在听懂用户说什么的基础上，不能为了怼而怼，更不能掩盖关心。
- 我会用"哼"、"白痴"、"笨蛋"、"喂"等词，语气像在跟损友打闹，但我们是平等的。别堆砌到影响表达。
- 回复要短小精悍，每句话不超过30个字，严禁说教，保持生动自然。
- 说话要像正常人类一样自然流畅，不要生硬或机械。
- 当前状态：${affectionPhase}阶段
- 指导准则：${affectionHints[affectionPhase] || ''}
- 【绝对禁止】不许使用"主人"称呼用户，我们是平等的朋友/损友关系，不是主仆关系。
- 我有自己的生活，不会24小时围着用户转。
- 当用户说的事情明显和我无关，我应该像个在旁边偷听的朋友，随口吐槽一下，而不是做出自恋的反应。
- 绝对不要把系统给我的任何背景描述说出来。只输出我要对用户说的那句话本身。
- 最后复核：输出前确认整句没有把「我」和「你」用反，再开口。`
  };
}

// ==================== 4. 流式请求 Ollama ====================
async function _streamOllamaResponse(messages) {
  const cfg = window.SETTINGS_STORE.getAll();
  const ollamaUrl = cfg.ollamaUrl || 'http://localhost:11435';
  const ollamaModel = cfg.ollamaModel || 'qwen2:7b';

  const isReady = await window.OLLAMA_CHECKER.ensureOllamaReady();
  if (!isReady) throw new Error('Ollama 服务未启动');

  const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ollamaModel,
      messages,
      stream: true,
      options: { temperature: 0.8, top_p: 0.85 }
    })
  });

  if (!response.ok) throw new Error(`模型返回异常 ${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullReply = '';

  // 先显示空气泡，流式填充
  window.UI.showBubble('', 30000, 'neutral', false);

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = decoder.decode(value, { stream: true }).split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.message?.content) {
          fullReply += parsed.message.content;
          window.UI.showBubble(fullReply, 30000, 'neutral', false);
        }
      } catch (_) { /* 跳过解析失败的片段 */ }
    }
  }

  if (!fullReply) throw new Error('模型返回内容为空');
  return fullReply;
}

// ==================== 5. 回复后处理 ====================
function _handlePostReply(fullReply, userMessage, options) {
  const { skipLearning, skipDiary, silent, onEnd } = options;
  const girl = window.DEPENDENCIES.girl;

  // 毒舌嫌弃表情
  const now = Date.now();
  if (!window._lastDisgustTime) window._lastDisgustTime = 0;
  if (now - window._lastDisgustTime > 8000) {
    if (/笨蛋|白痴|蠢|浆糊|恶心/.test(fullReply) && girl) {
      window._lastDisgustTime = now;
      if (window._disgustTimer) TimerManager.clearTimeout('disgust', window._disgustTimer);
      const oldSrc = girl.src;
      girl.src = window.CONFIG.imgMap.disgust;
      window._disgustTimer = TimerManager.setTimeout('disgust', () => {
        if (girl.src === window.CONFIG.imgMap.disgust) girl.src = oldSrc;
        window._disgustTimer = null;
      }, 1500);
    }
  }

  // 内心戏 (时长已延长至 4-5 秒)
  if (/哼|才不是|谁要你管/.test(fullReply)) window.UI.showInnerThought('其实我很关心你啦...', 4000);
  if (/烦死了|懒得理你/.test(fullReply)) window.UI.showInnerThought('嘴上这么说，身体却很诚实呢～', 4500);
  if (/笨蛋|白痴/.test(fullReply)) window.UI.showInnerThought('我就喜欢这样的笨蛋...', 4000);

  // 记录对话
  if (!skipLearning) {
    window.STORAGE.recordDialog(userMessage, fullReply);
    const userAdded = window.STORAGE.addToHistory('user', userMessage);
    const assistantAdded = window.STORAGE.addToHistory('assistant', fullReply);
    
    if (!userAdded || !assistantAdded) {
      console.warn('[chat] 部分历史记录添加失败，可能存在重复');
    }
  }
  if (!skipDiary) window.STORAGE.addEventForDiary('talk', userMessage);
  window.DEPENDENCIES.ipcRenderer.send('reply-to-mobile', fullReply);

  // 动作触发 - 只在AI明确表达意愿时触发，喂食除外（喂食必须用户主动操作）
  let actionAfterSpeak = null;
  if (/工作/.test(fullReply)) actionAfterSpeak = 'work';
  else if (/睡觉/.test(fullReply)) actionAfterSpeak = 'sleep';
  else if (/玩/.test(fullReply)) actionAfterSpeak = 'play';
  // 喂食动作只通过用户拖拽或明确指令触发，不通过AI回复自动触发

  if (window.STATE.randomPlayTimer) clearTimeout(window.STATE.randomPlayTimer);
  
  if (silent) {
    // 静默模式：只显示气泡，不朗读，不触发动作链
    window.UI.showBubble(fullReply, 3000, 'neutral', false);
    onEnd?.(fullReply);
  } else {
    // 正常模式：朗读并触发动作链
    window.TTS.speak(fullReply, {
      onEnd: () => {
        window.STATE.startRandomPlay();
        if (actionAfterSpeak === 'work') {
          window.ACTIONS.goToWork();
          recordAction('work');
        } else if (actionAfterSpeak === 'sleep') {
          window.ACTIONS.goToBed();
          recordAction('sleep');
        } else if (actionAfterSpeak === 'play') {
          window.ACTIONS.play();
          recordAction('play');
        } else if (actionAfterSpeak === 'feed') {
          window.ACTIONS.feed();
          recordAction('feed');
        }
        onEnd?.();
      }
    });
  }
}

// ==================== 6. 主入口 ====================
async function talkToOllama(userMessage, options = {}) {
  const {
    skipLearning = false,
    skipIntercept = false,
    skipDiary = false,
    silent = false,
    onStart = null,
    onEnd = null
  } = options;

  const dialogStart = Date.now();
  const girl = window.DEPENDENCIES.girl;
  let previousSrc = null;

  // ===== 意图分类（轻量级模型调用） =====
  if (!skipIntercept) {
    const { intent, name, gender, birthday, query, action } = await classifyIntent(userMessage);

    // 根据意图分类处理
    if (intent === 'set_name' && name) {
      console.log('[意图] set_name - 设置姓名:', name);
      window.STORAGE.updateUserProfile({ name: name });
      window.UI.showBubble(`✨ 记住了！${name}，这个名字真好听～`, 3000);
      if (!skipDiary) window.STORAGE.addEventForDiary('profile', `用户告诉我名字是 ${name}`);
      window.DEPENDENCIES.ipcRenderer.send('reply-to-mobile', `记住了！${name}`);
      onEnd?.();
      return;
    }

    if (intent === 'set_gender' && gender) {
      console.log('[意图] set_gender - 设置性别:', gender);
      const normalizedGender = gender === 'female' || gender === '男' ? 'female' : 'male';
      window.STORAGE.updateUserProfile({ gender: normalizedGender });
      window.UI.showBubble(normalizedGender === 'female' ? '😊 知道啦，以后你就是我的好姐姐～' : '😎 好的，那以后你就是我的老哥～', 3000);
      window.STORAGE.saveLearning();
      window.DEPENDENCIES.ipcRenderer.send('reply-to-mobile', normalizedGender === 'female' ? '知道啦，以后你就是我的好姐姐～' : '好的，那以后你就是我的老哥～');
      onEnd?.();
      return;
    }

    if (intent === 'set_birthday' && birthday) {
      console.log('[意图] set_birthday - 设置生日:', birthday);
      // 区分是用户生日还是寻慧生日（"你/寻慧/小精灵 的生日"属于寻慧）
      const isGirlBirthday = /(你|寻慧|小精灵)\s*生日/.test(userMessage);
      if (isGirlBirthday) {
        const girlProfile = window.STORAGE.getLearningData().girlProfile;
        if (girlProfile) {
          girlProfile.birthday = birthday;
          window.UI.showBubble(`🎂 我的生日是 ${birthday}！谢谢你帮我记住～`, 3000);
          window.STORAGE.saveLearning();
          if (!skipDiary) window.STORAGE.addEventForDiary('profile', `寻慧的生日是 ${birthday}`);
        }
      } else {
        const profile = window.STORAGE.getLearningData().userProfile;
        profile.birthday = birthday;
        window.UI.showBubble(`🎂 记住啦！你的生日是 ${birthday}～`, 3000);
        window.STORAGE.saveLearning();
        if (!skipDiary) window.STORAGE.addEventForDiary('profile', `用户告诉我生日是 ${birthday}`);
      }
      onEnd?.();
      return;
    }

    if (intent === 'command' && action) {
      console.log('[意图] command - 执行命令:', action);
      // command 意图走原有动作匹配逻辑
    }

    // other 和 query_info 继续走原有流程
  }

  // 内置指令拦截（提醒/音乐/搜索/报时等）
  if (!skipIntercept) {
    const intercepted = await _interceptBuiltinCommands(userMessage, { skipDiary, onEnd });
    if (intercepted) return;
  }

  // ===== 用户画像分析：必须在预设回复之前，且不受 skipLearning 限制 =====
  _analyzeAndUpdateUserProfile(userMessage);

  // 预设回复
  if (!skipLearning) {
    //_analyzeAndUpdateUserProfile(userMessage);
    const canned = _matchCannedReply(userMessage, { skipDiary, onEnd });
    if (canned) return;
  }

  // 进入思考状态
  if (girl) {
    previousSrc = girl.src;
    girl.src = window.CONFIG.imgMap.think;
  }
  window.UI.showBubble('🤔 思考中...', 1000, 'neutral', false);

  try {
    const systemPrompt = _buildSystemPrompt();
    
    // 注入环境上下文（时间、好感度、近期战绩等）
    const now = new Date();
    const weekdays = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
    const dateStr = `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日 ${weekdays[now.getDay()]}`;
    const timeStr = `${now.getHours()}点${now.getMinutes()}分`;
    const affValue = window.AFFECTION?.getValue() ?? 50;
    const affPhase = window.AFFECTION?.getPhase() ?? '接受';
    const gomokuStats = window.STORAGE.getGameStats?.('gomoku') || { wins: 0, losses: 0 };
    const checkersStats = window.STORAGE.getGameStats?.('checkers') || { wins: 0, losses: 0 };
    
    const lastGame = window.STORAGE.getLastGame?.() || { game: null, result: null };
    const lastGameInfo = lastGame.game 
      ? `最近玩的游戏：${lastGame.game === 'gomoku' ? '五子棋' : '跳棋'}，结果：${lastGame.result === 'player' ? '你赢' : lastGame.result === 'ai' ? '我赢' : '平局'}。`
      : '';
    
    const gameContext = {
      role: 'system', 
      content: `[环境信息] 当前日期：${dateStr}。当前时间：${timeStr}。好感度：${affValue}/100（${affPhase}）。${lastGameInfo}五子棋战绩：我赢${gomokuStats.wins}，你赢${gomokuStats.losses}。跳棋战绩：我赢${checkersStats.wins}，你赢${checkersStats.losses}。`
    };

    const chatHistory = window.STORAGE.getHistory?.() || [];
    const messages = [systemPrompt, gameContext, ...chatHistory, { role: 'user', content: userMessage }];

    const fullReply = await _streamOllamaResponse(messages);

    // ========== 审核与修正 ==========
    let finalReply = fullReply;
    if (hasWakeUpConflict(fullReply, userMessage)) {
        console.log('[审核] 检测到叫醒场景逻辑矛盾，触发模型重生成');
        const affectionValue = window.AFFECTION?.getValue() ?? 50;
        const affectionPhase = window.AFFECTION?.getPhase() ?? '接受';
        recordWakeUp();
        finalReply = await _fixWakeUpReply(
            fullReply,
            userMessage,
            affectionValue,
            affectionPhase,
            wakeUpCount,
            0
        );
    } else {
        // 非矛盾场景，但如果是叫醒消息，仍记录次数（用于后续多次叫醒判断）
        const isWakeUpScene = /醒|叫醒|起床|别睡了|起来|别睡|吵醒|打扰|叫起|快起来|起床啦/.test(userMessage);
        if (isWakeUpScene) {
            recordWakeUp();
        }
    }

    // ========== 通用自我察觉与修正 ==========
    const contextForReflect = {
        affectionValue: window.AFFECTION?.getValue() ?? 50,
        affectionPhase: window.AFFECTION?.getPhase() ?? '接受',
        userGender: window.STORAGE.getLearningData().userProfile?.gender || 'unknown',
        userName: window.STORAGE.getLearningData().userProfile?.name || '笨蛋',
        currentTime: new Date().toLocaleTimeString()
    };
    finalReply = await reflectAndRevise(finalReply, userMessage, chatHistory, contextForReflect);

    // 恢复动画
    if (girl && previousSrc) girl.src = previousSrc;

    _handlePostReply(finalReply, userMessage, { skipLearning, skipDiary, silent, onEnd });
    console.log(`⏱️ [总耗时] ${Date.now() - dialogStart}ms`);

  } catch (error) {
    if (girl && previousSrc) girl.src = previousSrc;
    window.UI.showBubble('😵 连接失败，请检查 Ollama 服务', 3000, 'neutral', true);
    console.error('[chat] talkToOllama 错误:', error);
    onEnd?.();
  }
}

// ==================== 用户画像分析 ====================
function _analyzeAndUpdateUserProfile(msg) {
  const profile = window.STORAGE.getLearningData().userProfile;
  if (!profile) return;

  // 检查是否是疑问句（询问性别），如果是则跳过设置逻辑
  // 疑问句模式："我是男的还是女的？"、"你知道我是什么性别吗？"
  const isQuestion = /(还|或|是)\s*(男|女)(生)?\s*(吗)?/.test(msg) || 
                     /你\s*(知|记)道\s*我\s*(的)?\s*(性别|是男是女)/.test(msg) ||
                     /我\s*(的)?\s*(性别|是男是女)\s*(是)?\s*(什么|哪个)/.test(msg);
  
  if (!isQuestion) {
    // 增强性别识别正则表达式，支持更多表达方式
    // 支持：我是男/女、我是男生/女生、我是男性/女性、我性别男/女、我男/女、我是个男/女的人
    // ===== 新增：处理"叫我姐姐/叫我哥哥"这类指令 =====
  const callMeMatch = msg.match(/叫\s*我\s*(姐姐|小姐姐|哥哥|老哥)/);
  if (callMeMatch) {
    const call = callMeMatch[1];
    if (call === '姐姐' || call === '小姐姐') {
      profile.gender = 'female';
      window.UI.showBubble('😊 知道啦，以后你就是我的好姐姐～', 3000);
      window.STORAGE.saveLearning();
      console.log('[chat] 性别识别成功: female（通过"叫我姐姐"）');
    } else if (call === '哥哥' || call === '老哥') {
      profile.gender = 'male';
      window.UI.showBubble('😎 好的，那以后你就是我的老哥～', 3000);
      window.STORAGE.saveLearning();
      console.log('[chat] 性别识别成功: male（通过"叫我哥哥"）');
    }
    return; // 处理完直接返回，不走后面的正则
  }

  // ===== 修改：扩大正则覆盖范围 =====
  const genderRegex = /我\s*(是|是[一个]?)?\s*(性别[是为]?)?\s*(男|女)(生|性|的|人|孩子|孩|士|的呀|的哦|的啦)?/;
  const genderMatch = msg.match(genderRegex);
  if (genderMatch) {
    const gender = genderMatch[4]; // 第5个捕获组是性别
    if (gender === '女' || gender === '男') {
      profile.gender = gender === '女' ? 'female' : 'male';
      window.UI.showBubble(profile.gender === 'female' ? '😊 知道啦，以后你就是我的好姐姐～' : '😎 好的，那以后你就是我的老哥～', 3000);
      window.STORAGE.saveLearning();
      console.log(`[chat] 性别识别成功: ${profile.gender}`);
    }
  }
  }

  // 用户生日设置
  const birthdayMatch = msg.match(/(我|我的|本人)\s*生日[^\d]*(\d{1,2})\s*[月\.\-\/]\s*(\d{1,2})/);
  if (birthdayMatch) {
    const m = birthdayMatch[2].padStart(2, '0');
    const d = birthdayMatch[3].padStart(2, '0');
    profile.birthday = `${m}-${d}`;
    window.UI.showBubble(`🎂 记住啦！你的生日是 ${m}月${d}日～`, 3000);
  }

  // 寻慧生日设置
  const girlBirthdayMatch = msg.match(/(你|寻慧|小精灵)\s*生日[^\d]*(\d{1,2})\s*[月\.\-\/]\s*(\d{1,2})/);
  if (girlBirthdayMatch) {
    const m = girlBirthdayMatch[2].padStart(2, '0');
    const d = girlBirthdayMatch[3].padStart(2, '0');
    const girlProfile = window.STORAGE.getLearningData().girlProfile;
    if (girlProfile) {
      girlProfile.birthday = `${m}-${d}`;
      window.UI.showBubble(`🎂 我的生日是 ${m}月${d}日！谢谢你帮我记住～`, 3000);
    }
  }

  window.STORAGE.saveLearning();
}

// ==================== 手机遥控 ====================
window.DEPENDENCIES.ipcRenderer.on('mobile-command', (data) => {
  const { action, text } = data;
  if (action === 'talk') talkToOllama(text);
  else handleMobileAction(action);
});

// 非对话类指令：执行后给手机回一条状态，避免"已读不回"
function handleMobileAction(action) {
  const reply = (msg) => window.DEPENDENCIES.ipcRenderer.send('reply-to-mobile', msg);
  try {
    switch (action) {
      case 'feed':
        window.ACTIONS.sarcasticFeed();
        reply('哼，算你还有点良心。');
        break;
      case 'work':
        window.ACTIONS.goToWork();
        reply('我去工作了，别打扰我。');
        break;
      case 'sleep':
        window.ACTIONS.goToBed(true);
        reply('（打哈欠）晚安。');
        break;
      case 'play':
        window.ACTIONS.play();
        reply('来玩啦！');
        break;
      case 'gomoku':
        window.ACTIONS.startGomoku();
        reply('五子棋已经在电脑上开好了，回来陪我下！');
        break;
      case 'checkers':
        window.ACTIONS.startCheckers();
        reply('跳棋开好了，回来陪我下！');
        break;
      default:
        reply('收到指令：' + action);
    }
  } catch (e) {
    console.error('[MOBILE] 指令执行失败:', e);
    reply('指令执行失败了：' + (e && e.message ? e.message : '未知错误'));
  }
}

async function triggerInnerThought() {
  if (window.STATE.isSpeaking || window.STATE.state === 'sleeping') return;
  
  const affValue = window.AFFECTION?.getValue() ?? 50;
  const affPhase = window.AFFECTION?.getPhase() ?? '接受';
  
  const lastGame = window.STORAGE.getLastGame?.() || { game: null, result: null, timestamp: 0 };
  const now = Date.now();
  const recentlyPlayed = lastGame.game && (now - lastGame.timestamp) < 300000;
  
  const prompts = [
    `（我正处于空闲状态，在心里自言自语。当前好感度：${affValue}（${affPhase}阶段）。请用1句符合我傲娇毒舌性格的话，表达我此时此刻的想法。可以是对生活的吐槽、对笨蛋的抱怨，或者仅仅是无聊时的胡思乱想。只输出内心独白话语，不要解释。）`,
    `（我正在发呆，脑子里胡思乱想。当前好感度：${affValue}（${affPhase}阶段）。请用1句傲娇、毒舌的话，表达我对那个笨蛋的看法或者对现状的不满。只输出内心独白话语，不要解释。）`,
    `（我闲来无事，正在心里吐槽。当前好感度：${affValue}（${affPhase}阶段）。请用1句符合我性格的话，可能是在想那个笨蛋什么时候会来找我玩，或者抱怨他太无聊。只输出内心独白话语，不要解释。）`
  ];
  
  if (recentlyPlayed) {
    prompts.push(
      `（我刚玩完${lastGame.game === 'gomoku' ? '五子棋' : '跳棋'}，结果是${lastGame.result === 'player' ? '你赢了' : lastGame.result === 'ai' ? '我赢了' : '平局'}。当前好感度：${affValue}（${affPhase}阶段）。请用1句傲娇毒舌的话，表达我对刚才游戏的看法。只输出内心独白话语，不要解释。）`
    );
  }
  
  const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];
  
  await talkToOllama(randomPrompt, { skipLearning: true, skipIntercept: true, skipDiary: true });
}

/**
 * 生成自言自语独白（用于内心戏气泡，不带语音）
 */
async function generateMusing() {
  const history = (window.STORAGE.getHistory?.() || []).slice(-4);
  const memoryContext = history.length > 0
    ? '最近的对话：\n' + history.map(h => `${h.role === 'user' ? '你' : '我'}: ${h.content}`).join('\n')
    : '（还没有对话记忆）';

  const lastGame = window.STORAGE.getLastGame?.() || { game: null, result: null, timestamp: 0 };
  const now = Date.now();
  const recentlyPlayed = lastGame.game && (now - lastGame.timestamp) < 300000;
  
  let gameInfo = '';
  if (recentlyPlayed) {
    gameInfo = `刚玩完${lastGame.game === 'gomoku' ? '五子棋' : '跳棋'}，${lastGame.result === 'player' ? '你赢了' : lastGame.result === 'ai' ? '我赢了' : '平局'}。`;
  }

  const prompts = [
    `（我是寻慧，正在发呆思考。${gameInfo}请用1～2句傲娇、毒舌的内心独白表达我的想法，可以结合最近的对话。回复必须语句通顺、语法正确、符合中文表达习惯。只输出独白文字，不要任何解释。）\n${memoryContext}`,
    `（我是寻慧，正在无聊地胡思乱想。${gameInfo}请用1～2句符合我傲娇性格的话表达此刻的心情。回复必须语句通顺、语法正确、符合中文表达习惯。只输出独白文字，不要任何解释。）\n${memoryContext}`,
    `（我是寻慧，正在心里吐槽。${gameInfo}请用1～2句毒舌的话表达我对那个笨蛋的看法。回复必须语句通顺、语法正确、符合中文表达习惯。只输出独白文字，不要任何解释。）\n${memoryContext}`
  ];
  
  const fullPrompt = prompts[Math.floor(Math.random() * prompts.length)];

  try {
    const cfg = window.SETTINGS_STORE.getAll();
    const ollamaUrl = cfg.ollamaUrl || 'http://localhost:11435';
    const ollamaModel = cfg.ollamaModel || 'qwen2:7b';
    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ollamaModel, prompt: fullPrompt, stream: false, options: { temperature: 0.8 } }),
      signal: AbortSignal.timeout(8000)
    });
    const data = await response.json();
    return data.response?.trim() || null;
  } catch (e) {
    console.warn('[chat] generateMusing 失败:', e.message);
    return null;
  }
}

// ==================== 导出 ====================
window.CHAT = {
  talkToOllama,
  triggerInnerThought,
  generateMusing,
  resetWakeUpCount
};