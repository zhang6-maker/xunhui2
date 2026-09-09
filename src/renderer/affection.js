/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  模块墓志铭
 * ═══════════════════════════════════════════════════════════════════════════
 * 模块名称: affection.js - 好感度系统
 * 模块职责: 管理角色对用户的好感度，影响对话态度和互动反应
 * 
 * 依赖模块:
 *   - window.STORAGE: 数据持久化（getLearningData, saveLearning）
 *   - window.CHAT: 对话系统（talkToOllama）
 * 
 * 生命周期:
 *   - changeAffection(delta, reason): 修改好感度
 *   - getAffectionLevel(): 获取当前好感度等级
 *   - getAffectionText(): 获取好感度描述
 *   - 模块初始化时自动注入 window.AFFECTION
 * 
 * 注意事项:
 *   - ✅ 好感度范围: 0-100
 *   - ✅ 冷却机制: 每次修改有 cooldown 限制（防止频繁波动）
 *   - ✅ 阈值触发: 20（嫌弃→勉强接受）/ 50（接受→喜欢）触发傲娇对话
 *   - ⚠️ 好感度低于 0 或高于 100 会被截断
 * ═══════════════════════════════════════════════════════════════════════════
 */
// ==================== 好感度管理模块 ====================
// 依赖: window.STORAGE, window.CHAT

function changeAffection(delta, reason = '') {
    const data = window.STORAGE.getLearningData();
    if (!data.affection) return;
    
    const aff = data.affection;
    const now = Date.now();
    
    if (now - aff.lastChange < aff.cooldown) return;
    aff.lastChange = now;
    
    const oldValue = aff.value;
    aff.value = Math.max(0, Math.min(100, aff.value + delta));
    const newValue = aff.value;
    
    if (oldValue !== newValue) {
        console.log(`💕 好感度 ${oldValue} → ${newValue} (${reason})`);
        
        // 阈值突破触发对话
        if (oldValue < 20 && newValue >= 20) {
            TimerManager.setTimeout('affectionThreshold', () => {
                if (window.CHAT) window.CHAT.talkToOllama(
                    '（你对用户的态度从“嫌弃”转为“勉强接受”。请用1-2句傲娇的话，表达虽然还是很嫌弃他，但勉强可以让他待在你身边，只输出话语。）',
                    { skipLearning: true }
                );
            }, 1500);
        } else if (oldValue < 50 && newValue >= 50) {
            TimerManager.setTimeout('affectionThreshold', () => {
                if (window.CHAT) window.CHAT.talkToOllama(
                    '（你对用户的态度从“接受”升到了“喜欢”。请用1-2句毒舌中带点害羞的话，表达其实觉得他也没那么无可救药，只输出话语。）',
                    { skipLearning: true }
                );
            }, 1500);
        } else if (oldValue < 80 && newValue >= 80) {
            TimerManager.setTimeout('affectionThreshold', () => {
                if (window.CHAT) window.CHAT.talkToOllama(
                    '（你对用户的态度升到了“依赖”。请用1-2句极其傲娇又粘人的话，抱怨他让你变得奇怪了，并命令他不准离开，只输出话语。）',
                    { skipLearning: true }
                );
            }, 1500);
        } else if (oldValue >= 50 && newValue < 50) {
            TimerManager.setTimeout('affectionThreshold', () => {
                if (window.CHAT) window.CHAT.talkToOllama(
                    '（你对用户的态度从“喜欢”降回“接受”。请用1-2句毒舌且带点失望的话，嘲讽他果然还是那个让人头疼的笨蛋，只输出话语。）',
                    { skipLearning: true }
                );
            }, 1500);
        }
    }
    
    window.STORAGE.saveLearning();
}

function getAffectionPhase() {
    const data = window.STORAGE.getLearningData();
    const value = data.affection?.value ?? 50;
    if (value <= 20) return '讨厌';
    if (value <= 50) return '接受';
    if (value <= 80) return '喜欢';
    return '依赖';
}

function getAffectionValue() {
    const data = window.STORAGE.getLearningData();
    return data.affection?.value ?? 50;
}

window.AFFECTION = {
    change: changeAffection,
    getPhase: getAffectionPhase,
    getValue: getAffectionValue
};