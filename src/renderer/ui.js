// ==================== UI 模块 ====================
// 依赖: window.CONFIG, window.STATE, window.DEPENDENCIES

let currentEmotionType = null;
let emotionTimer = null;
let customInputDiv = null;
let uiAttachments = []; // 📎 用户选择的图片/文档（仅在输入框打开期间有效）

// 计算气泡最佳位置，尽量避免遮挡 girl 元素
function getBestBubblePosition(girl, bubble) {
    const girlRect = girl.getBoundingClientRect();
    // 用固定估计值代替实时测量，避免测量误差
    const bubbleW = 260;   // 略小于 max-width: 280px
    const bubbleH = 80;    // 估计高度
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    const margin = 10;

    let bestLeft, bestTop, bestNoOverlap = false;

    const positions = [
        { x: girlRect.left + girlRect.width / 2 - bubbleW / 2, y: girlRect.top - bubbleH - margin },
        { x: girlRect.left + girlRect.width / 2 - bubbleW / 2, y: girlRect.bottom + margin },
        { x: girlRect.left - bubbleW - margin, y: girlRect.top + girlRect.height / 2 - bubbleH / 2 },
        { x: girlRect.right + margin, y: girlRect.top + girlRect.height / 2 - bubbleH / 2 },
    ];

    for (const pos of positions) {
        let left = pos.x;
        let top = pos.y;
        left = Math.max(margin, Math.min(left, viewW - bubbleW - margin));
        top = Math.max(margin, Math.min(top, viewH - bubbleH - margin));

        const bubbleLeft = left, bubbleRight = left + bubbleW;
        const bubbleTop = top, bubbleBottom = top + bubbleH;
        const overlap = !(
            bubbleRight < girlRect.left + margin ||
            bubbleLeft > girlRect.right - margin ||
            bubbleBottom < girlRect.top + margin ||
            bubbleTop > girlRect.bottom - margin
        );
        if (!overlap) {
            bestLeft = left;
            bestTop = top;
            bestNoOverlap = true;
            break;
        }
    }

    if (!bestNoOverlap) {
        bestLeft = girlRect.left + girlRect.width / 2 - bubbleW / 2;
        bestTop = girlRect.top - bubbleH - margin;
        bestLeft = Math.max(margin, Math.min(bestLeft, viewW - bubbleW - margin));
        bestTop = Math.max(margin, Math.min(bestTop, viewH - bubbleH - margin));
    }

    return { left: bestLeft, top: bestTop };
}

function showBubble(text, duration = 2000, emotionType = 'neutral', speakIt = true) {
    const bubble = window.DEPENDENCIES.bubble;
    const girl = window.DEPENDENCIES.girl;
    if (!bubble || !girl) return;
    
     bubble.style.display = 'block';
    // 位置将在 speak 分支中通过 getBestBubblePosition 设置
    
    currentEmotionType = emotionType;
    if (emotionTimer) clearTimeout(emotionTimer);
    emotionTimer = setTimeout(() => {
        if (currentEmotionType) {
            window.STORAGE.updateEmotionPreference(currentEmotionType, false);
            currentEmotionType = null;
        }
    }, duration);

    let hideTimer = null;
    const originalText = text;

    if (speakIt && text && !text.includes('思考中')) {
        // ===== 修复：先显示气泡，再通过 TTS 控制隐藏 =====
        bubble.innerText = text;
        bubble.style.display = 'block';
    
        // ✅ 使用最佳位置计算，避免遮挡人物
        const pos = getBestBubblePosition(girl, bubble);
        bubble.style.left = pos.left + 'px';
        bubble.style.top = pos.top + 'px';
    
        // 始终保留原有的情绪反馈逻辑（不影响修改）
        currentEmotionType = emotionType;
        if (emotionTimer) clearTimeout(emotionTimer);
        emotionTimer = setTimeout(() => {
            if (currentEmotionType) {
                window.STORAGE.updateEmotionPreference(currentEmotionType, false);
                currentEmotionType = null;
            }
        }, duration);
    
        // 兜底隐藏定时器：60 秒后若仍未隐藏则强制隐藏，避免 TTS 彻底失败时气泡残留
        let hideTimer = TimerManager.setTimeout('bubbleHide', () => {
            if (bubble.innerText === text) bubble.style.display = 'none';
        }, 60000);

        // 调用 TTS，只负责控制隐藏时机
        window.TTS.speak(text, {
            onStart: () => {
                // 重置兜底定时器，防止语音播放期间提前隐藏
                if (hideTimer) {
                    TimerManager.clearTimeout('bubbleHide', hideTimer);
                    hideTimer = TimerManager.setTimeout('bubbleHide', () => {
                        if (bubble.innerText === text) bubble.style.display = 'none';
                    }, 60000);
                }
            },
            onEnd: () => {
                // 语音结束，立即隐藏气泡
                if (hideTimer) TimerManager.clearTimeout('bubbleHide', hideTimer);
                if (bubble.innerText === text) bubble.style.display = 'none';
            }
        });
    }

    else {
        bubble.innerText = text;
        bubble.style.display = 'block';
        
        // ✅ 获取最佳位置
        const pos = getBestBubblePosition(girl, bubble);
        bubble.style.left = pos.left + 'px';
        bubble.style.top = pos.top + 'px';
        hideTimer = TimerManager.setTimeout('bubbleHide', () => {
            if (bubble.innerText === text) bubble.style.display = 'none';
        }, duration);

    }
}

function reactToDiaryView() {
    const reactions = window.CONFIG.EMOTION_REACTIONS.diary;
    const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
    showBubble(randomReaction, 4000, 'neutral', true);
}

async function handleViewDiary() {
    const diaryContent = window.STORAGE.readDiary();
    const preview = diaryContent.length > 200 ? diaryContent.substring(0, 200) + '...' : diaryContent;
    showBubble(`📔 我的日记：\n${preview}`, 8000, 'neutral', false);
    reactToDiaryView();
    window.DEPENDENCIES.ipcRenderer.send('reply-to-mobile', `日记内容：\n${diaryContent}`);
}

function onUserInteract() {
    if (currentEmotionType) {
        window.STORAGE.updateEmotionPreference(currentEmotionType, true);
        currentEmotionType = null;
        clearTimeout(emotionTimer);
    }
}

// ==================== 自定义输入框 ====================

function createCustomInput() {
    if (customInputDiv) return;
    const div = document.createElement('div');
    div.id = 'customInput';
    div.style.position = 'fixed';
    div.style.backgroundColor = 'rgba(30,30,40,0.95)';
    div.style.border = '2px solid #ff99cc';
    div.style.borderRadius = '16px';
    div.style.padding = '10px 15px';
    div.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    div.style.zIndex = '10000';
    div.style.display = 'none';
    div.style.fontFamily = 'system-ui, "Segoe UI", "Noto Sans CJK SC", sans-serif';
    div.innerHTML = `
        <div id="customInputHeaderRow" style="display: flex; justify-content: space-between; align-items: center; color: white; margin-bottom: 6px; font-size: 13px; cursor: grab;">
            <span>💬 对寻慧说：</span>
            <span id="inputHeaderTools" style="display: flex; gap: 12px;">
                <span id="memoryUsage" style="font-size:11px; opacity:0.7; margin-right:6px;"></span>
                <span id="attachBtn" title="附带图片/文档" style="cursor:pointer; font-size:18px;">📎</span>
                <span id="diaryTrigger" title="看日记" style="cursor:pointer; font-size:18px;">📖</span>
                <span id="settingsTrigger" title="打开设置" style="cursor:pointer; font-size:18px;">⚙️</span>
            </span>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
            <input type="text" id="customInputText" placeholder="工作、睡觉、玩、几点了、搜索 天气..." style="flex: 1; padding: 6px 10px; border-radius: 20px; border: none; font-size: 14px; outline: none;">
            <button id="voiceInputBtn" style="background: #ff99cc; border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 16px; display: inline-flex; align-items: center; justify-content: center;">🎤</button>
        </div>
        <div id="attachChips" style="margin-top: 6px; display: none; color: #fff; font-size: 12px;"></div>
        <div style="margin-top: 8px; text-align: right;">
            <button id="customInputOk" style="background: #ff99cc; border: none; padding: 4px 14px; border-radius: 20px; margin-right: 6px; cursor: pointer; font-size: 12px;">发送</button>
            <button id="customInputCancel" style="background: #ccc; border: none; padding: 4px 14px; border-radius: 20px; cursor: pointer; font-size: 12px;">取消</button>
        </div>
    `;
    document.body.appendChild(div);

    // 内存监测（异步版本）
    const memSpan = div.querySelector('#memoryUsage');
    if (memSpan) {
        const update = async () => {   // ← 改为 async
            const os = window.DEPENDENCIES.os;

            // 异步获取系统内存
            const totalSystem = await os.totalmem();
            const freeSystem = await os.freemem();
            const usedSystem = totalSystem - freeSystem;
            const systemRatio = usedSystem / totalSystem;
            const usedSystemMB = (usedSystem / 1048576).toFixed(0);
            const totalSystemMB = (totalSystem / 1048576).toFixed(0);

            // 寻慧自身的内存
            const mem = performance.memory;
            let selfUsedMB = '?';
            let selfTotalMB = '?';
            if (mem) {
                selfUsedMB = (mem.usedJSHeapSize / 1048576).toFixed(1);
                selfTotalMB = (mem.totalJSHeapSize / 1048576).toFixed(1);
            }

            let statusText = '';
            let color = '#fff';
            if (systemRatio < 0.5) {
                statusText = '✅ 正常';
                color = '#90EE90';
            } else if (systemRatio < 0.8) {
                statusText = '⚠️ 偏高';
                color = '#FFD700';
            } else if (systemRatio < 0.95) {
                statusText = '🔥 危险';
                color = '#FF8C00';
            } else {
                statusText = '💀 崩溃';
                color = '#FF4444';
            }

            // 内存偏高吐槽（保持原有逻辑）
            if (!window._lastMemoryWarnTime) window._lastMemoryWarnTime = 0;
            const memoryWarnCooldown = 10 * 60 * 1000;
            const now = Date.now();
            if (systemRatio >= 0.8 && (now - window._lastMemoryWarnTime > memoryWarnCooldown)) {
                window._lastMemoryWarnTime = now;
                if (window.STATE && window.STATE.state !== 'sleeping' && !window.STATE.isSpeaking) {
                    let affectionHint = '';
                    if (window.AFFECTION) {
                        const av = window.AFFECTION.getValue();
                        const ap = window.AFFECTION.getPhase();
                        affectionHint = `当前好感度：${av}/100（${ap}阶段）。`;
                    }
                    const severity = systemRatio >= 0.95 ? '极度危险' : '偏高';
                    const prompt = `（系统内存使用率${(systemRatio*100).toFixed(0)}%，${severity}。${affectionHint}用1句傲娇吐槽，不超过15个字。只输出那句。）`;
                    setTimeout(() => {
                        if (window.CHAT && window.CHAT.talkToOllama) {
                            window.CHAT.talkToOllama(prompt, { skipLearning: true, skipDiary: true });
                        }
                    }, 2000);
                }
            }

            memSpan.innerHTML =
                `<span>💻 系统 ${usedSystemMB}/${totalSystemMB} MB</span>` +
                `<span style="color:${color}; font-weight:bold;"> ${statusText}</span>` +
                `<br>` +
                `<span>🐣 寻慧 ${selfUsedMB}/${selfTotalMB} MB</span>`;
        };

        update();
        div._memoryTimer = setInterval(update, 2000);
    }

    customInputDiv = div;

    // 在输入框头部挂工具箱入口（✉ 传话信箱 / 📱 手机遥控），点击才展开
    const toolsHost = div.querySelector('#inputHeaderTools');
    if (toolsHost && window.XHTools && window.XHTools.mountHeaderLauncher) {
      window.XHTools.mountHeaderLauncher(toolsHost);
    }

    // ===== 窗口拖拽手柄：拖输入框标题栏移动整个 Electron 窗口 =====
    // 眼睛只动人物（用户设定），窗口移动改走这条标题栏；用 move-window IPC
    // 增量 setPosition，不会触发系统 Aero 贴边/半屏最大化。
    const headerRow = div.querySelector('#customInputHeaderRow');
    if (headerRow) {
      let winDragging = false, lastWX = 0, lastWY = 0;
      headerRow.addEventListener('mousedown', (e) => {
        // 点中右侧工具区（🧰📖⚙️）或任何按钮时不启动窗口拖拽，避免误触
        if (e.target.closest('#inputHeaderTools') || e.target.tagName === 'BUTTON') return;
        winDragging = true;
        lastWX = e.clientX; lastWY = e.clientY;
        headerRow.style.cursor = 'grabbing';
        e.preventDefault();
      });
      window.addEventListener('mousemove', (e) => {
        if (!winDragging) return;
        const dx = e.clientX - lastWX;
        const dy = e.clientY - lastWY;
        lastWX = e.clientX; lastWY = e.clientY;
        if (window.electronAPI && window.electronAPI.send) {
          window.electronAPI.send('move-window', dx, dy);
        }
      });
      window.addEventListener('mouseup', () => {
        if (winDragging) {
          winDragging = false;
          headerRow.style.cursor = 'grab';
        }
      });
    }

    document.getElementById('customInputOk').onclick = () => {
        const msg = document.getElementById('customInputText').value.trim();
        const atts = (window.CHAT && window.CHAT.getAttachments) ? window.CHAT.getAttachments() : [];
        div.style.display = 'none';
        if (div._memoryTimer) {
            clearInterval(div._memoryTimer);
            div._memoryTimer = null;
        }
        if (msg || atts.length) window.ACTIONS.handleUserInput(msg, atts);
    };
    document.getElementById('customInputCancel').onclick = () => {
        div.style.display = 'none';
        window.STATE.startIdleTimer();
        if (window.CHAT && window.CHAT.clearAttachments) window.CHAT.clearAttachments();
        uiAttachments = [];
        if (div._memoryTimer) {
            clearInterval(div._memoryTimer);
            div._memoryTimer = null;
        }
    };
    document.getElementById('customInputText').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('customInputOk').click();
    });
    document.getElementById('voiceInputBtn').addEventListener('click', window.VOICE.startVoiceInput);

    // ===== 📎 附件选择（图片/文档） =====
    const chipsEl = div.querySelector('#attachChips');
    const renderChips = () => {
        if (!chipsEl) return;
        if (!uiAttachments.length) { chipsEl.style.display = 'none'; chipsEl.innerHTML = ''; return; }
        chipsEl.style.display = 'block';
        chipsEl.innerHTML = uiAttachments.map((a, i) =>
            `<span style="display:inline-block; background:rgba(255,153,204,0.25); border:1px solid #ff99cc; border-radius:10px; padding:1px 6px; margin:2px;">${a.kind==='unsupported'||a.kind==='error'?'⚠️':'📎'} ${a.name} <span data-idx="${i}" style="cursor:pointer; color:#ff99cc;">✕</span></span>`
        ).join(' ') + ` <span id="clearAtts" style="cursor:pointer; color:#ccc;">🗑清除</span>`;
        chipsEl.querySelectorAll('[data-idx]').forEach(el => {
            el.addEventListener('click', () => {
                uiAttachments.splice(parseInt(el.getAttribute('data-idx')), 1);
                if (window.CHAT && window.CHAT.setAttachments) window.CHAT.setAttachments(uiAttachments);
                renderChips();
            });
        });
        const clearBtn = chipsEl.querySelector('#clearAtts');
        if (clearBtn) clearBtn.addEventListener('click', () => {
            uiAttachments = [];
            if (window.CHAT && window.CHAT.clearAttachments) window.CHAT.clearAttachments();
            renderChips();
        });
    };
    const attachBtn = div.querySelector('#attachBtn');
    if (attachBtn) {
        attachBtn.addEventListener('click', async () => {
            if (!window.electronAPI || !window.electronAPI.pickFile) {
                window.UI.showBubble('⚠️ 文件选择不可用', 2000, 'neutral', true);
                return;
            }
            try {
                const files = await window.electronAPI.pickFile();
                if (!files || !files.length) return;
                let warned = false;
                for (const f of files) {
                    if (f.kind === 'unsupported' || f.kind === 'error') {
                        warned = true;
                        window.UI.showBubble(`⚠️ ${f.name}：${f.error || '不支持'}`, 2500, 'neutral', true);
                    } else {
                        uiAttachments.push(f);
                    }
                }
                if (window.CHAT && window.CHAT.setAttachments) window.CHAT.setAttachments(uiAttachments);
                renderChips();
                if (uiAttachments.length && !warned) window.UI.showBubble(`📎 已附加 ${uiAttachments.length} 个文件`, 1500, 'neutral', false);
            } catch (e) {
                console.warn('[附件] 选择失败:', e);
                window.UI.showBubble('⚠️ 选择文件失败', 2000, 'neutral', true);
            }
        });
    }

    const settingsTrigger = document.getElementById('settingsTrigger');
    if (settingsTrigger) {
        settingsTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            window.SETTINGS_PANEL.show();
        });
    }

    const diaryTrigger = document.getElementById('diaryTrigger');
    if (diaryTrigger) {
        diaryTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            window.DIARY_BOOK.show();
        });
    }
}

function showCustomInput() {
    createCustomInput();
    const girl = window.DEPENDENCIES.girl;
    const girlRect = girl.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let left = girlRect.right + 10;
    let top = girlRect.top;
    if (left + 260 > viewportWidth) left = girlRect.left - 270;
    if (top + 100 > viewportHeight) top = viewportHeight - 110;
    if (top < 10) top = 10;
    if (left < 10) left = 10;
    customInputDiv.style.left = left + 'px';
    customInputDiv.style.top = top + 'px';
    customInputDiv.style.display = 'block';
    document.getElementById('customInputText').value = '';
    document.getElementById('customInputText').focus();
    // 重新打开输入框时清空上次遗留的附件
    uiAttachments = [];
    const chips = document.getElementById('attachChips');
    if (chips) { chips.style.display = 'none'; chips.innerHTML = ''; }
    if (window.CHAT && window.CHAT.clearAttachments) window.CHAT.clearAttachments();
}

// ==================== 内心戏气泡 ====================
function showInnerThought(text, duration = 5000) {
    const bubble = window.DEPENDENCIES.bubble;
    const girl = window.DEPENDENCIES.girl;
    if (!bubble || !girl) return;

    // 创建专属内心戏气泡元素（只创建一次，添加 id 避免重复）
    let innerBubble = document.getElementById('innerThoughtBubble');
    if (!innerBubble) {
        innerBubble = document.createElement('div');
        innerBubble.id = 'innerThoughtBubble';
        innerBubble.style.position = 'absolute';
        innerBubble.style.background = '#f0e6f6';  // 浅紫色背景
        innerBubble.style.border = '1px dashed #a0a0a0';
        innerBubble.style.borderRadius = '10px';
        innerBubble.style.padding = '4px 10px';
        innerBubble.style.maxWidth = '200px';
        innerBubble.style.fontSize = '12px';
        innerBubble.style.color = '#555';
        innerBubble.style.boxShadow = '1px 1px 5px rgba(0,0,0,0.1)';
        innerBubble.style.zIndex = '101';
        innerBubble.style.whiteSpace = 'normal';
        document.body.appendChild(innerBubble);
    }

    // 设置文本
    innerBubble.innerText = '💭 ' + text;
    innerBubble.style.display = 'block';

    // 定位在主角气泡的右上方（如果主角气泡可见）
    if (bubble.style.display === 'block') {
        const mainBubbleRect = bubble.getBoundingClientRect();
        innerBubble.style.left = (mainBubbleRect.right + 5) + 'px';
        innerBubble.style.top = (mainBubbleRect.top - 10) + 'px';
    } else {
        // 如果主角气泡没显示，就放在女孩头顶
        const girlRect = girl.getBoundingClientRect();
        innerBubble.style.left = (girlRect.left + girlRect.width / 2 - 50) + 'px';
        innerBubble.style.top = (girlRect.top - 50) + 'px';
    }

    // 自动隐藏
    clearTimeout(innerBubble._timeout);
    innerBubble._timeout = setTimeout(() => {
        innerBubble.style.display = 'none';
    }, duration);
}

// 导出 UI 模块
window.UI = {
    showBubble,
    reactToDiaryView,
    handleViewDiary,
    onUserInteract,
    createCustomInput,
    showCustomInput,
    showInnerThought
};