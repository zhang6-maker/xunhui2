/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  模块墓志铭
 * ═══════════════════════════════════════════════════════════════════════════
 * 模块名称: reminders.js - 提醒模块
 * 模块职责: 管理定时提醒（加载/保存/检查/触发）
 * 
 * 依赖模块:
 *   - window.DEPENDENCIES: 系统能力（fs, path, os.homedir）
 *   - window.UI: UI 交互（showBubble）
 *   - window.TTS: 语音合成（speak）
 *   - window.CHAT: 对话系统（talkToOllama）
 * 
 * 生命周期:
 *   - startReminderCheck(): 启动定时检查（每 30 秒）
 *   - stopReminderCheck(): 停止检查
 *   - addReminder(text, datetime): 添加提醒
 *   - 模块初始化时自动注入 window.REMINDERS
 * 
 * 注意事项:
 *   - ✅ 提醒文件: ~/.girlpet_reminders.json
 *   - ✅ 定时检查: setInterval 每 30 秒检查一次
 *   - ✅ 触发条件: 当前时间 >= 提醒时间时触发
 *   - ⚠️ 提醒触发后会从文件中删除
 * ═══════════════════════════════════════════════════════════════════════════
 */
// ==================== 提醒模块 ====================
// 依赖: window.DEPENDENCIES, window.UI, window.TTS, window.CHAT

const REMINDER_FILE = window.DEPENDENCIES.path.join(
    window.DEPENDENCIES.os.homedir(),
    '.girlpet_reminders.json'
);

let reminderCheckInterval = null;

function loadReminders() {
    try {
        if (window.DEPENDENCIES.fs.existsSync(REMINDER_FILE)) {
            const data = window.DEPENDENCIES.fs.readFileSync(REMINDER_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('⚠️ 加载提醒失败:', e);
    }
    return [];
}

function saveReminders(reminders) {
    try {
        window.DEPENDENCIES.fs.writeFileSync(REMINDER_FILE, JSON.stringify(reminders, null, 2), 'utf8');
    } catch (e) {
        console.error('⚠️ 保存提醒失败:', e);
    }
}

function addReminder(triggerTime, content) {
    const reminders = loadReminders();
    reminders.push({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 6),
        time: triggerTime,
        content: content,
        fired: false,
        ackTime: null   // 用户确认时间，null 表示未确认
    });
    saveReminders(reminders);
    console.log(`⏰ 已添加提醒: [${new Date(triggerTime).toLocaleString()}] ${content}`);
}

// ==================== 触发提醒（AI 生成话语 + 重复提醒） ====================
function _fireReminder(reminder) {
    if (window.STATE.isSilentMode()) {
        console.log(`🔔 安静模式下跳过提醒: ${reminder.content}`);
        return;
    }
    
    console.log(`🔔 触发提醒: ${reminder.content}`);

    // 如果在睡觉，先唤醒
    if (window.STATE && window.STATE.state === 'sleeping') {
        window.STATE.setState('waking');
        window.UI.showBubble('⏰ 有提醒啦，先醒醒！', 2000, 'neutral', false);
    }

    // 构建 AI 提醒话语的 prompt
    const affectionValue = window.AFFECTION?.getValue() ?? 50;
    const affectionPhase = window.AFFECTION?.getPhase() ?? '接受';
    const prompt = `（我是寻慧，现在需要提醒那个笨蛋：「${reminder.content}」。
当前好感度：${affectionValue}/100（${affectionPhase}阶段）。
请用1~2句傲娇、毒舌但带着关心的话提醒他，语气要有紧迫感，让他注意到。
要求：
- 必须把提醒内容「${reminder.content}」完整说出来
- 可以加上吐槽（比如"你这个健忘鬼"、"早说了你不听"）
- 如果好感度高，语气更粘人；如果低，语气更冷淡但仍然提醒
- 只输出那句话，不要任何解释）`;

    // 延迟一点，避免和唤醒气泡冲突
    const delay = (window.STATE?.state === 'waking') ? 3000 : 500;

    TimerManager.setTimeout(`reminder_${reminder.id}_init`, () => {
        // 先显示气泡（不等 AI，确保用户立刻看到）
        window.UI.showBubble(`⏰ 提醒：${reminder.content}`, 15000, 'neutral', false);

        // 用 AI 生成有感情的提醒话语并朗读
        if (window.CHAT?.talkToOllama) {
            window.CHAT.talkToOllama(prompt, {
                skipLearning: true,
                skipIntercept: true,
                skipDiary: true
            });
        } else {
            // 降级：直接朗读提醒内容
            const fallback = `喂！该${reminder.content}了，你没忘吧？`;
            window.UI.showBubble(`⏰ ${fallback}`, 10000, 'neutral', false);
            window.TTS.speak(fallback);
        }

        // ===== 重复提醒机制：30秒后如果未确认，再提醒一次 =====
        TimerManager.setTimeout(`reminder_${reminder.id}_first`, () => {
            // 重新读取，检查是否已被确认
            const current = loadReminders().find(r => r.id === reminder.id);
            if (current && current.fired && !current.ackTime) {
                console.log(`🔔 重复提醒: ${reminder.content}`);
                const repeatMsg = `喂！你还没处理「${reminder.content}」！别忘了！`;
                window.UI.showBubble(`⏰ ${repeatMsg}`, 10000, 'neutral', false);
                window.TTS.speak(repeatMsg);

                // 再过60秒最后提醒一次
                TimerManager.setTimeout(`reminder_${reminder.id}_final`, () => {
                    const final = loadReminders().find(r => r.id === reminder.id);
                    if (final && final.fired && !final.ackTime) {
                        const finalMsg = `最后提醒你一次：${reminder.content}，之后我不管了！`;
                        window.UI.showBubble(`⏰ ${finalMsg}`, 10000, 'neutral', false);
                        window.TTS.speak(finalMsg);
                        // 标记为已确认，不再重复
                        _ackReminder(reminder.id);
                    }
                }, 60000);
            }
        }, 30000);

    }, delay);
}

// 标记提醒为已确认（用户点击气泡或手动确认）
function _ackReminder(id) {
    const reminders = loadReminders();
    const r = reminders.find(r => r.id === id);
    if (r) {
        r.ackTime = Date.now();
        saveReminders(reminders);
    }
}

// ==================== 每秒检查 ====================
function checkReminders() {
    const now = Date.now();
    const reminders = loadReminders();
    let changed = false;

    for (const r of reminders) {
        if (!r.fired && r.time <= now) {
            r.fired = true;
            changed = true;
            _fireReminder(r);
        }
    }

    if (changed) {
        saveReminders(reminders);
    }
}

function startReminderCheck() {
    if (reminderCheckInterval) return;
    reminderCheckInterval = TimerManager.setInterval('reminders', checkReminders, 1000);
    checkReminders(); // 启动时立即检查一次
    console.log('⏰ 提醒检查已启动');
}

// 导出模块
window.REMINDERS = {
    addReminder,
    loadReminders,
    startReminderCheck,
    ackReminder: _ackReminder,
    getPending: () => loadReminders().filter(r => !r.fired)
};
