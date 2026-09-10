/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  模块墓志铭
 * ═══════════════════════════════════════════════════════════════════════════
 * 模块名称: drag.js - 拖拽与交互模块
 * 模块职责: 处理角色拖拽、投喂交互、饥饿检测
 * 
 * 依赖模块:
 *   - window.CONFIG: 配置信息
 *   - window.STATE: 状态管理（getState, setState）
 *   - window.UI: UI 交互
 *   - window.ACTIONS: 动作执行（doAction, feed）
 *   - window.DEPENDENCIES: 系统能力（girl 元素引用）
 * 
 * 生命周期:
 *   - initGirlDrag(): 初始化角色拖拽
 *   - initDragDrop(): 初始化文件/图片拖放
 *   - startHungerTimer(): 启动饥饿检测（每 60 秒）
 *   - 模块初始化时自动注入 window.DRAG
 * 
 * 注意事项:
 *   - ✅ 拖拽边界: 限制在视口内
 *   - ✅ 投喂冷却: 5 秒内不能重复投喂（actionCooldown）
 *   - ✅ 饥饿触发: 每 60 秒检测，饥饿时显示食物图标
 *   - ⚠️ 投喂触发的状态转换由 STATE_TRANSITIONS 配置驱动
 * ═══════════════════════════════════════════════════════════════════════════
 */
// ==================== 拖拽模块 ====================
// 依赖: window.CONFIG, window.STATE, window.UI, window.ACTIONS, window.DEPENDENCIES

let isDraggingGirl = false;
let dragStartX = 0, dragStartY = 0, girlStartLeft = 0, girlStartTop = 0;
let hungerTimer = null;
let foodIcon = null;

// ==================== 人物拖拽 ====================
function initGirlDrag() {
    const girl = window.DEPENDENCIES.girl;
    if (!girl) return;
    
    girl.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        isDraggingGirl = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        girlStartLeft = window.STATE.currentX;
        girlStartTop = window.STATE.currentY;
        girl.style.cursor = 'grabbing';
        e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDraggingGirl) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        let newLeft = girlStartLeft + dx;
        let newTop = girlStartTop + dy;
        const maxX = window.innerWidth - girl.offsetWidth;
        const maxY = window.innerHeight - girl.offsetHeight;
        newLeft = Math.min(Math.max(newLeft, 0), maxX);
        newTop = Math.min(Math.max(newTop, 0), maxY);
        window.STATE.currentX = newLeft;
        window.STATE.currentY = newTop;
        window.STATE.targetX = newLeft;
        window.STATE.targetY = newTop;
        window.STATE.updatePosition();
    });

    window.addEventListener('mouseup', () => {
        if (isDraggingGirl) {
            isDraggingGirl = false;
            girl.style.cursor = 'pointer';
        }
    });
}

// ==================== 食物图标 ====================
function showFoodIcon() {
    if (!foodIcon) foodIcon = document.getElementById('foodIcon');
    if (!foodIcon) return;
    const foods = window.CONFIG.FOOD_ICONS;
    foodIcon.innerText = foods[Math.floor(Math.random() * foods.length)];
    const girl = window.DEPENDENCIES.girl;
    if (!girl) return;
    const girlRect = girl.getBoundingClientRect();
    let left = girlRect.left + 40 + (Math.random() * 60 - 30);
    let top = girlRect.top - 40 + (Math.random() * 40);
    left = Math.min(Math.max(left, 10), window.innerWidth - 60);
    top = Math.min(Math.max(top, 10), window.innerHeight - 60);
    foodIcon.style.left = left + 'px';
    foodIcon.style.top = top + 'px';
    foodIcon.style.display = 'flex';
    TimerManager.setTimeout('foodIcon', () => {
        if (foodIcon.style.display === 'flex') {
            foodIcon.style.display = 'none';
            window.ACTIONS.rejectFood();
            TimerManager.setTimeout('hunger', startHungerTimer, 5000);
        }
    }, 20000);
}

function hideFoodIcon() {
    if (foodIcon) foodIcon.style.display = 'none';
}

function onFeedByDrag() {
    hideFoodIcon();
    window.ACTIONS.feed();
    
    if (window.CHAT?.recordAction) {
        window.CHAT.recordAction('feed');
    }
    
    TimerManager.clearGroup('hunger');
    startHungerTimer();
}

// ==================== 饥饿定时器（TimerManager 版） ====================
function startHungerTimer() {
    TimerManager.clearGroup('hunger');
    hungerTimer = null;

    if (window.STATE.isSilentMode()) {
        console.log('🍽️ 安静模式下不启动饥饿定时器，1分钟后重试');
        TimerManager.setTimeout('hunger', startHungerTimer, 60000);
        return;
    }

    if (window.STATE.state === 'sleeping') {
        console.log('🍽️ 睡眠中，不启动饥饿定时器');
        return;
    }

    const config = window.CONFIG?.STATE_CONFIG || {};
    // 自言自语频率：默认 8–14 分钟提醒一次（比原先 5–10 分稍微少一点，不删除自发闲聊）
    const min = config.hungerMin || 480000;
    const max = config.hungerMax || 840000;
    const delay = min + Math.random() * (max - min);

    hungerTimer = TimerManager.setTimeout('hunger', () => {
        if (window.STATE.state === 'sleeping' || window.STATE.isSpeaking) {
            console.log('🍽️ 睡眠或说话中，跳过本次饥饿提醒');
            hungerTimer = null;
            return;
        }
        window.ACTIONS.begForFood();
        showFoodIcon();
        startHungerTimer();
    }, delay);

    console.log(`🍽️ 饥饿定时器已启动，将在 ${Math.round(delay/60000)} 分钟后提醒`);
}

// ==================== 拖拽喂食初始化 ====================
function initDragDrop() {
    foodIcon = document.getElementById('foodIcon');
    if (!foodIcon) return;
    const girl = window.DEPENDENCIES.girl;
    if (!girl) return;
    girl.setAttribute('dropzone', 'move');
    girl.addEventListener('dragover', (e) => e.preventDefault());
    girl.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.getData('text/plain') === 'food') onFeedByDrag();
    });
    foodIcon.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', 'food');
        e.dataTransfer.effectAllowed = 'copy';
        foodIcon.style.opacity = '0.6';
    });
    foodIcon.addEventListener('dragend', () => foodIcon.style.opacity = '1');
}

// 导出拖拽模块
window.DRAG = {
    initGirlDrag,
    initDragDrop,
    showFoodIcon,
    hideFoodIcon,
    startHungerTimer,
    stopHungerTimer: () => {
        TimerManager.clearGroup('hunger');
        hungerTimer = null;
        console.log('🍽️ 饥饿定时器已停止');
    }
};