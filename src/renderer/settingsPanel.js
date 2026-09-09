// ==================== 设置面板模块 ====================
// 依赖: window.SETTINGS_STORE, window.UI

function showSettingsPanel() {
    // 如果已存在则先移除再重建（确保每次打开都是最新值）
    let panel = document.getElementById('settingsPanel');
    if (panel) {
        panel.remove();
    }

    panel = document.createElement('div');
    panel.id = 'settingsPanel';
    panel.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 10002;
        background: rgba(30,30,40,0.95);
        border: 2px solid #ff99cc;
        border-radius: 16px;
        padding: 20px;
        width: 350px;
        max-height: 80vh;
        overflow-y: auto;
        color: white;
        font-family: system-ui, "Segoe UI", "Noto Sans CJK SC", sans-serif;
        font-size: 14px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    `;

    const cfg = window.SETTINGS_STORE.getAll();

    panel.innerHTML = `
        <h3 style="margin: 0 0 15px 0; text-align: center;">⚙️ 寻慧设置</h3>
        
        <label style="display: block; margin-bottom: 10px;">
            🤖 Ollama 服务地址
            <input id="setOllamaUrl" type="text" value="${cfg.ollamaUrl}" 
                   style="width: 100%; padding: 6px; border-radius: 8px; border: none; margin-top: 4px; box-sizing: border-box;">
        </label>

        <label style="display: block; margin-bottom: 10px;">
            🧠 对话模型
            <input id="setOllamaModel" type="text" value="${cfg.ollamaModel}" 
                   style="width: 100%; padding: 6px; border-radius: 8px; border: none; margin-top: 4px; box-sizing: border-box;">
        </label>

        <label style="display: block; margin-bottom: 10px;">
            🔊 TTS 服务地址
            <input id="setTtsUrl" type="text" value="${cfg.ttsUrl}" 
                   style="width: 100%; padding: 6px; border-radius: 8px; border: none; margin-top: 4px; box-sizing: border-box;">
        </label>

        <label style="display: block; margin-bottom: 10px;">
            🎤 TTS 发音人
            <input id="setTtsVoice" type="text" value="${cfg.ttsVoice}" 
                   style="width: 100%; padding: 6px; border-radius: 8px; border: none; margin-top: 4px; box-sizing: border-box;">
        </label>

        <div style="display: flex; gap: 10px; margin-bottom: 10px;">
            <label style="flex: 1;">
                😴 睡觉时间
                <input id="setSleepTime" type="time" 
                       value="${String(cfg.sleepTimeHour).padStart(2,'0')}:${String(cfg.sleepTimeMinute).padStart(2,'0')}" 
                       style="width: 100%; padding: 6px; border-radius: 8px; border: none; margin-top: 4px; box-sizing: border-box;">
            </label>
            <label style="flex: 1;">
                🌅 起床时间
                <input id="setWakeTime" type="time" 
                       value="${String(cfg.wakeTimeHour).padStart(2,'0')}:${String(cfg.wakeTimeMinute).padStart(2,'0')}" 
                       style="width: 100%; padding: 6px; border-radius: 8px; border: none; margin-top: 4px; box-sizing: border-box;">
            </label>
        </div>

        <div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">
            <button id="saveSettingsBtn" style="
                background: #ff99cc; border: none; padding: 8px 24px; 
                border-radius: 20px; cursor: pointer; font-size: 14px; font-weight: bold;">
                💾 保存并生效
            </button>
            <button id="closeSettingsBtn" style="
                background: #666; border: none; padding: 8px 24px; 
                border-radius: 20px; cursor: pointer; font-size: 14px; color: white;">
                关闭
            </button>
        </div>
        <div id="settingsMsg" style="text-align: center; margin-top: 10px; color: #ff99cc; font-size: 13px;"></div>
    `;

    document.body.appendChild(panel);

    // 保存按钮事件
    document.getElementById('saveSettingsBtn').onclick = () => {
        // 更新常规设置
        window.SETTINGS_STORE.update('ollamaUrl', document.getElementById('setOllamaUrl').value.trim());
        window.SETTINGS_STORE.update('ollamaModel', document.getElementById('setOllamaModel').value.trim());
        window.SETTINGS_STORE.update('ttsUrl', document.getElementById('setTtsUrl').value.trim());
        window.SETTINGS_STORE.update('ttsVoice', document.getElementById('setTtsVoice').value.trim());

        // 读取睡眠时间
        const sleepParts = document.getElementById('setSleepTime').value.split(':');
        const sleepHour = parseInt(sleepParts[0]) || 22;
        const sleepMinute = parseInt(sleepParts[1]) || 0;

        // 读取起床时间
        const wakeParts = document.getElementById('setWakeTime').value.split(':');
        const wakeHour = parseInt(wakeParts[0]) || 7;
        const wakeMinute = parseInt(wakeParts[1]) || 0;

        // 验证：睡觉时间和起床时间不能完全相同
        if (sleepHour === wakeHour && sleepMinute === wakeMinute) {
            document.getElementById('settingsMsg').innerText = '⚠️ 睡觉时间和起床时间不能相同';
            return;
        }

        // 保存睡眠和起床时间
        window.SETTINGS_STORE.update('sleepTimeHour', sleepHour);
        window.SETTINGS_STORE.update('sleepTimeMinute', sleepMinute);
        window.SETTINGS_STORE.update('wakeTimeHour', wakeHour);
        window.SETTINGS_STORE.update('wakeTimeMinute', wakeMinute);

        document.getElementById('settingsMsg').innerText = '✅ 设置已保存！下次启动继续生效';
        setTimeout(() => {
            document.getElementById('settingsMsg').innerText = '';
        }, 3000);
    };

    // 关闭按钮事件
    document.getElementById('closeSettingsBtn').onclick = () => {
        panel.remove();
    };
}

// 导出设置面板模块
window.SETTINGS_PANEL = {
    show: showSettingsPanel
};