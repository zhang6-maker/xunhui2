// ==================== 日记本模块 ====================
// 依赖: window.STORAGE, window.DEPENDENCIES

let diaryBookDiv = null;
//let currentOverlay = null;   // 用于关闭时也能移除遮罩

function showDiaryBook() {
    // 如果已存在则先移除
    if (diaryBookDiv) {
        diaryBookDiv.remove();
        diaryBookDiv = null;
    }
    //if (currentOverlay) {
    //    currentOverlay.remove();
    //    currentOverlay = null;
    //}

    // 读取日记内容
    const diaryContent = window.STORAGE.readDiary();
    const entries = diaryContent
        .split('\n')
        .filter(line => line.trim() !== '')
        .map(line => {
            const match = line.match(/^\[(.*?)\]\s*(.*)/);
            if (match) {
                return { time: match[1], content: match[2] };
            }
            return { time: '', content: line };
        });

    if (entries.length === 0) {
        window.UI.showBubble('📔 还没有日记记录呢～', 2000);
        return;
    }

    // 创建弹窗容器
    diaryBookDiv = document.createElement('div');
    diaryBookDiv.id = 'diaryBook';
    diaryBookDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 10003;
        width: 90vw;
        max-width: 680px;
        height: 70vh;
        max-height: 500px;
        perspective: 1500px;
    `;

    // 书的结构
    diaryBookDiv.innerHTML = `
        <div id="diaryBookInner" style="
            width: 100%;
            height: 100%;
            position: relative;
            transform-style: preserve-3d;
            transition: transform 0.8s;
            transform: rotateY(0deg);
        ">
            <!-- 左页（目录） -->
            <div style="
                position: absolute;
                width: 50%;
                height: 100%;
                left: 0;
                background: #fef9e7;
                border-radius: 15px 0 0 15px;
                box-shadow: inset -5px 0 15px rgba(0,0,0,0.1);
                padding: 20px 15px;
                box-sizing: border-box;
                overflow-y: auto;
                backface-visibility: hidden;
                transform-origin: right center;
                border: 2px solid #d4a373;
                border-right: 1px solid #d4a373;
                font-family: 'Georgia', 'Noto Sans CJK SC', serif;
                color: #5c4033;
            ">
                <h3 style="margin-top:0; text-align:center; color:#b07d62;">📖 寻慧的日记</h3>
                <div id="diaryList" style="font-size: 14px; line-height: 2;"></div>
            </div>
            <!-- 右页（日记详情） -->
            <div style="
                position: absolute;
                width: 50%;
                height: 100%;
                right: 0;
                background: #fef9e7;
                border-radius: 0 15px 15px 0;
                box-shadow: inset 5px 0 15px rgba(0,0,0,0.1);
                padding: 20px 15px;
                box-sizing: border-box;
                overflow-y: auto;
                backface-visibility: hidden;
                transform-origin: left center;
                border: 2px solid #d4a373;
                border-left: 1px solid #d4a373;
                font-family: 'Georgia', 'Noto Sans CJK SC', serif;
                color: #5c4033;
            ">
                <div id="diaryDetail" style="font-size: 16px; line-height: 1.8; white-space: pre-wrap;"></div>
                <div id="diaryTime" style="text-align:right; color:#b07d62; font-size:12px; margin-top:20px;"></div>
            </div>
            <!-- 关闭按钮（右页右上角） -->
            <button id="diaryCloseBtn" style="
                position: absolute;
                top: 10px;
                right: 10px;
                width: 32px;
                height: 32px;
                background: #ff99cc;
                border: none;
                border-radius: 50%;
                font-size: 18px;
                cursor: pointer;
                color: white;
                line-height: 32px;
                text-align: center;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                z-index: 10;
            ">✕</button>
        </div>
    `;

    document.body.appendChild(diaryBookDiv);

     //创建遮罩层（点击空白关闭日记本）
    //currentOverlay = document.createElement('div');
    //currentOverlay.id = 'diaryOverlay';
    //currentOverlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.3); z-index: 10002;';
    //currentOverlay.addEventListener('click', () => {
    //    if (diaryBookDiv) {
    //        diaryBookDiv.remove();
    //        diaryBookDiv = null;
    //    }
    //    if (currentOverlay) {
    //        currentOverlay.remove();
    //        currentOverlay = null;
    //    }
    //});
    //document.body.appendChild(currentOverlay);

    // 填充左页（列表）
    const listDiv = document.getElementById('diaryList');
    entries.forEach((entry, index) => {
        const item = document.createElement('div');
        item.style.cssText = 'cursor: pointer; padding: 4px 8px; border-radius: 5px;';
        item.innerHTML = `<span style="color:#b07d62;">${entry.time}</span> ${entry.content.substring(0, 15)}...`;
        item.addEventListener('click', (e) => {
            e.stopPropagation();  // 防止事件冒泡到外层导致意外关闭
            showEntry(index, entries);
        });
        listDiv.appendChild(item);
    });

    // 默认显示最后一篇
    showEntry(entries.length - 1, entries);

    // ========== 当面偷看日记触发毒舌吐槽 + 好感度变化（含高好感豁免） ==========
    if (window.STATE && window.STATE.state !== 'sleeping') {
        const now = Date.now();
        if (!window._lastDiaryRoastTime) window._lastDiaryRoastTime = 0;
        if (now - window._lastDiaryRoastTime > 5 * 60 * 1000) {
            window._lastDiaryRoastTime = now;
            if (window.CHAT && window.CHAT.talkToOllama) {
    
                // ===== 好感度变化（带高好感频繁豁免） =====
                if (window.AFFECTION) {
                    const affectionValue = window.AFFECTION.getValue();
                    const highThreshold = 75;             // 高好感阈值
                    const frequentWindow = 5 * 60 * 1000; // 5 分钟内算频繁
    
                    // 初始化记录变量（只在第一次时创建）
                    if (!window._lastDiaryPenaltyTime) window._lastDiaryPenaltyTime = 0;
                    if (!window._consecutiveDiaryViews) window._consecutiveDiaryViews = 0;
    
                    const timeSinceLastPenalty = now - window._lastDiaryPenaltyTime;
                    const isFrequent = timeSinceLastPenalty < frequentWindow && window._consecutiveDiaryViews >= 2;
    
                    if (affectionValue >= highThreshold && isFrequent) {
                        // 好感度高 + 近期频繁看：不扣分
                        console.log(`💕 高好感豁免：好感度 ${affectionValue}，频繁偷看日记，不扣分`);
                    } else {
                        // 正常扣分
                        window.AFFECTION.change(-1, '偷看日记');
                        window._lastDiaryPenaltyTime = now;
                    }
    
                    // 更新“连续查看”计数
                    window._consecutiveDiaryViews++;
                    if (timeSinceLastPenalty > frequentWindow) {
                        window._consecutiveDiaryViews = 1; // 超过间隔，重新计数
                    }
                }
    
                // ===== 根据状态选择 Prompt 并让 AI 吐槽 =====
                let prompt;
                const state = window.STATE.state;
                if (state === 'waking' || state === 'stretching') {
                    prompt = '（那个笨蛋趁你还没完全睡醒，偷看了你的日记本。你现在很困、有起床气、很不耐烦。用带着困意和怒气的傲娇语气吐槽他，比如"我还没睡醒你就偷看！烦不烦啊！"、"眼睛闭上！不许看！等我醒了再说……"等。只输出吐槽，不要解释。）';
                } else {
                    prompt = '（那个笨蛋刚刚当着你的面打开了你的日记本偷看。你已经清醒了，但还是很傲娇。请用1-2句毒舌、傲娇的话吐槽他，比如"喂！谁让你偷看我日记的！"、"哼，既然看了就要负责哦"、"我的小秘密都被你知道了，你怎么赔？"等。只输出吐槽，不要解释。）';
                }
    
                window.CHAT.talkToOllama(prompt,{ skipLearning: true });
            }
        }
    }
    
        // 关闭按钮事件
        document.getElementById('diaryCloseBtn').addEventListener('click', () => {
            if (diaryBookDiv) {
                diaryBookDiv.remove();
                diaryBookDiv = null;
            }
            //if (currentOverlay) {
            //    currentOverlay.remove();
            //    currentOverlay = null;
            //}
        });
}

function showEntry(index, entries) {
    const entry = entries[index];
    document.getElementById('diaryDetail').innerText = entry.content;
    document.getElementById('diaryTime').innerText = `🕒 ${entry.time}`;

    // 高亮当前选中
    const items = document.querySelectorAll('#diaryList div');
    items.forEach((item, i) => {
        item.style.background = i === index ? '#f5e6d3' : '';
    });
}

// 导出日记本模块
window.DIARY_BOOK = {
    show: showDiaryBook
};