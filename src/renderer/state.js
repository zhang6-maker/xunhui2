/**
 * state.js - 状态机（使用 TimerManager 统一管理定时器）
 */

// ==================== 事件系统 ====================
const STATE_EVENTS = {
    STATE_WILL_CHANGE: 'stateWillChange',
    STATE_CHANGED: 'stateChanged'
};

function _emitStateWillChange(oldState, newState) {
    window.dispatchEvent(new CustomEvent(STATE_EVENTS.STATE_WILL_CHANGE, {
        detail: { oldState, newState }
    }));
}

function _emitStateChanged(newState, oldState) {
    window.dispatchEvent(new CustomEvent(STATE_EVENTS.STATE_CHANGED, {
        detail: { newState, oldState }
    }));
}

// ==================== 声明式状态转换配置 ====================
const STATE_TRANSITIONS = {
    waking:     { duration: 2500, next: 'stretching', onEnter: 'showStretchBubble' },
    stretching: { duration: 2000, next: 'idle',       onExit: 'startIdleRoutines' },
    dancing:    { duration: 4000, next: 'idle',       onExit: 'startIdleRoutines' },
    working:    { duration: 3000, next: 'stretching', onEnter: 'showWorkBubble' },
    playing:    { duration: 5000, next: 'idle',       onExit: 'startIdleRoutines' },
    eating:     { duration: 3000, next: 'idle',       onExit: 'startIdleRoutines' }
};

// ==================== 内部状态变量 ====================
let _state = 'idle';
let _isSpeaking = false;
let _currentX = 200, _currentY = 200;
let _targetX = 200, _targetY = 200;
let _animationFrameId = null;
let _lastStateChangeTime = 0;
let _lastAutoActionTime = 0;
let _lastWakeUpTime = 0;
let _isHidden = false;
let _workPos = { x: 300, y: 300 };
let _bedPos = { x: 200, y: 400 };

// 各定时器 ID（由 TimerManager 返回）
let _idleTimer = null;
let _randomPlayTimer = null;
let _sleepCheckInterval = null;
let _idleAnimationTimer = null;
let _stateAutoEndTimer = null;

// 安静模式
let _silentUntil = 0;   // 安静模式结束时间戳（毫秒），0 表示不在安静模式

// ==================== 辅助函数 ====================
function _getGirl() {
    return window.DEPENDENCIES?.girl ?? null;
}

// 清除当前状态的自动结束定时器
function _clearAutoEndTimer() {
    if (_stateAutoEndTimer !== null) {
        TimerManager.clearTimeout(`state_${_state}`, _stateAutoEndTimer);
        _stateAutoEndTimer = null;
    }
    // 额外清除所有可能残留的状态组（安全）
    TimerManager.clearGroup('state_waking');
    TimerManager.clearGroup('state_stretching');
    TimerManager.clearGroup('state_dancing');
    TimerManager.clearGroup('state_working');
    TimerManager.clearGroup('state_playing');
    TimerManager.clearGroup('state_eating');
}

// ==================== 安静模式 ====================
function setSilentMode(durationMinutes) {
    if (durationMinutes <= 0) {
        _silentUntil = 0;
        console.log('[State] 安静模式已关闭');
        return;
    }
    _silentUntil = Date.now() + durationMinutes * 60 * 1000;
    console.log(`[State] 进入安静模式，持续 ${durationMinutes} 分钟，至 ${new Date(_silentUntil).toLocaleTimeString()}`);

    // 自动解除定时器
    TimerManager.setTimeout('silentMode', () => {
        if (_silentUntil && Date.now() >= _silentUntil) {
            _silentUntil = 0;
            console.log('[State] 安静模式已自动解除');
            window.UI?.showBubble('😤 时间到了，我又可以吵你了！', 3000);
            window.TTS?.speak('哼，时间到了，我又可以吵你了！');
        }
    }, durationMinutes * 60 * 1000);
}

function isSilentMode() {
    return _silentUntil > Date.now();
}

// ==================== 统一的自动推进引擎 ====================
function _scheduleAutoTransition(newState) {
    const config = STATE_TRANSITIONS[newState];
    if (!config?.duration) return;

    _clearAutoEndTimer();

    if (config.onEnter) {
        _runTransitionCallback(config.onEnter);
    }

    const groupName = `state_${newState}`;
    _stateAutoEndTimer = TimerManager.setTimeout(groupName, () => {
        _stateAutoEndTimer = null;
        if (_state === newState) {
            if (config.onExit) {
                _runTransitionCallback(config.onExit);
            }
            if (config.next) {
                setState(config.next);
            }
        }
    }, config.duration);
}

function _runTransitionCallback(callbackName) {
    switch (callbackName) {
        case 'showStretchBubble':
            window.UI?.showBubble('🙆 伸个懒腰～', 2500, 'neutral', false);
            break;
        case 'showWorkBubble':
            window.UI?.showBubble('💻 开始工作...');
            break;
        case 'startIdleRoutines':
            startIdleTimer();
            startRandomPlay();
            break;
    }
}

// ==================== 核心：setState ====================
function setState(newState) {
    const oldState = _state;
    if (_state === newState) return;

    const now = Date.now();
    const minDuration = window.CONFIG.STATE_CONFIG.minDuration;

    const isWakeUp                 = (_state === 'sleeping'   && newState === 'idle');
    const isWakingEnd              = (_state === 'waking'     && newState === 'idle');
    const isStartWaking            = (newState === 'waking');
    const isTemporaryState         = ['eating','working','playing','walking','stretching','dancing'].includes(newState);
    const isWalkingToSleep         = (_state === 'walking'    && newState === 'sleeping');
    const isEatingToIdle           = (_state === 'eating'     && newState === 'idle');
    const shortStates              = ['eating','working','playing','walking','stretching','dancing'];
    const isShortStateReturnToIdle = shortStates.includes(_state) && newState === 'idle';

    const bypassLock = isWakeUp || isWakingEnd || isStartWaking || isTemporaryState
                     || isWalkingToSleep || isEatingToIdle || isShortStateReturnToIdle;

    if (!bypassLock && now - _lastStateChangeTime < minDuration) {
        console.log(`[State] 切换被阻止: ${_state}→${newState}，距上次切换仅 ${now - _lastStateChangeTime}ms`);
        return;
    }

    _clearAutoEndTimer();

    console.log(`[State] ${_state} → ${newState}`);

    _emitStateWillChange(_state, newState);

    _state = newState;
    _lastStateChangeTime = now;

    _emitStateChanged(newState, oldState);

    // idle 相关定时器清理
    if (newState !== 'idle') {
        if (_idleTimer) {
            TimerManager.clearTimeout('idle', _idleTimer);
            _idleTimer = null;
        }
        if (_randomPlayTimer) {
            TimerManager.clearTimeout('randomPlay', _randomPlayTimer);
            _randomPlayTimer = null;
        }
        if (_idleAnimationTimer) {
            TimerManager.clearTimeout('idleAnimation', _idleAnimationTimer);
            _idleAnimationTimer = null;
        }
    } else {
        // 进入 idle 时重新启动相关定时器
        startIdleTimer();
        startRandomPlay();
        startIdleAnimationTimer();
    }

    // 睡眠相关：由视图层监听 stateChanged 事件处理，不再在此直接操作 DOM

    // 节日检查：sleeping→idle 时
    if (oldState === 'sleeping' && newState === 'idle') {
        TimerManager.setTimeout('festival', () => window.ACTIONS?.festivalGreet?.(), 1000);
    }

    _scheduleAutoTransition(newState);
}

// ==================== dispatch（内部流转用） ====================
const TRANSITIONS = {
    idle:       { startWalking: 'walking', startSleeping: 'sleeping', startPlaying: 'playing',
                  startWorking: 'working', startEating: 'eating', startDancing: 'dancing', startStretching: 'stretching' },
    walking:    { arrive: 'idle', arriveWork: 'working', arriveBed: 'sleeping' },
    working:    { finish: 'stretching' },
    stretching: { finish: 'idle' },
    sleeping:   { wake: 'waking' },
    waking:     { finish: 'stretching' },
    playing:    { finish: 'idle' },
    eating:     { finish: 'idle' },
    dancing:    { finish: 'idle' }
};

function dispatch(action) {
    const allowed = TRANSITIONS[_state];
    if (!allowed || !allowed[action]) {
        console.warn(`[State] 非法动作: "${action}" 在状态 "${_state}" 下不允许`);
        return false;
    }
    setState(allowed[action]);
    return true;
}

// ==================== 位置控制 ====================
function updatePosition() {
    const girl = _getGirl();
    if (!girl) return;
    girl.style.left = _currentX + 'px';
    girl.style.top = _currentY + 'px';
}

function moveStep() {
    if (_animationFrameId) {
        cancelAnimationFrame(_animationFrameId);
        _animationFrameId = null;
    }

    if (Math.abs(_currentX - _targetX) < 2 && Math.abs(_currentY - _targetY) < 2) {
        _currentX = _targetX;
        _currentY = _targetY;
        updatePosition();

        if (_state === 'walking') {
            const wp = _workPos;
            const bp = _bedPos;
            if (Math.abs(_targetX - wp.x) < 2 && Math.abs(_targetY - wp.y) < 2) {
                setState('working');
            } else if (Math.abs(_targetX - bp.x) < 2 && Math.abs(_targetY - bp.y) < 2) {
                console.log('💤 到达床位，进入睡觉状态');
                if (_randomPlayTimer) {
                    TimerManager.clearTimeout('randomPlay', _randomPlayTimer);
                    _randomPlayTimer = null;
                }
                setState('sleeping');
                window.STORAGE?.addEventForDiary('sleep', '睡觉了');
                window.STORAGE?.generateDailySummary?.();
            } else {
                setState('idle');
                startIdleTimer();
            }
        }
        return;
    }

    _currentX += (_targetX - _currentX) * 0.1;
    _currentY += (_targetY - _currentY) * 0.1;
    updatePosition();
    _animationFrameId = requestAnimationFrame(moveStep);
}

// ==================== 定时器管理 ====================
function startIdleTimer() {
    if (_idleTimer) {
        TimerManager.clearTimeout('idle', _idleTimer);
        _idleTimer = null;
    }
    if (_state !== 'idle' || _isSpeaking) return;

    const timeout = window.CONFIG.STATE_CONFIG.idleTimeout;
    _idleTimer = TimerManager.setTimeout('idle', () => {
        _idleTimer = null;
        if (_state === 'idle' && !_isSpeaking) {
            window.AFFECTION?.change(-1, '冷落太久');
            window.ACTIONS?.goToBed(true);
        }
    }, timeout);
}

function startRandomPlay() {
    if (_randomPlayTimer) {
        TimerManager.clearTimeout('randomPlay', _randomPlayTimer);
        _randomPlayTimer = null;
    }
    if (window.STATE.isSilentMode()) {
        // 安静模式下，延迟1分钟再检查
        _randomPlayTimer = TimerManager.setTimeout('randomPlay', startRandomPlay, 60000);
        return;
    }
    if (_state !== 'idle') return;

    const min = window.CONFIG.STATE_CONFIG.randomPlayMin;
    const max = window.CONFIG.STATE_CONFIG.randomPlayMax;
    const innerThoughtChance = window.CONFIG.STATE_CONFIG.innerThoughtChance || 0.25;
    
    _randomPlayTimer = TimerManager.setTimeout('randomPlay', () => {
        _randomPlayTimer = null;
        if (_state === 'idle' && !_isSpeaking) {
            const rand = Math.random();
            if (rand < 0.5) {
                window.ACTIONS?.play();
            } else if (rand < 0.5 + innerThoughtChance) {
                window.CHAT?.triggerInnerThought();
            }
        }
        startRandomPlay(); // 递归调用，重新注册
    }, min + Math.random() * (max - min));
}

function startIdleAnimationTimer() {
    if (_idleAnimationTimer) {
        TimerManager.clearTimeout('idleAnimation', _idleAnimationTimer);
        _idleAnimationTimer = null;
    }
    const interval = 30000;

    function switchAnimation() {
        if (_state === 'idle' && !_isSpeaking) {
            const girl = _getGirl();
            if (!girl) return;

            const rand = Math.random();
            if (rand < 0.1) {
                girl.src = window.CONFIG.imgMap.think + '?t=' + Date.now();
                const now = Date.now();
                const cooldown = 4 * 60 * 1000 + Math.random() * 2 * 60 * 1000;
                if (!window._lastMusingTime || (now - window._lastMusingTime > cooldown)) {
                    window._lastMusingTime = now;
                    window.CHAT?.generateMusing('').then(musing => {
                        if (musing && _state === 'idle' && !_isSpeaking) {
                            window.UI?.showInnerThought(musing, 5000);
                        } else if (!musing && _state === 'idle' && !_isSpeaking) {
                            const fallbacks = ['唔…去哪了？','好困啊，发会儿呆…','有点无聊呢…','哼，我才没有在想你呢…'];
                            window.UI?.showInnerThought(fallbacks[Math.floor(Math.random() * fallbacks.length)], 4000);
                        }
                    }).catch(() => {
                        if (_state === 'idle' && !_isSpeaking) {
                            window.UI?.showInnerThought('网络好像不太好…算了，不想说话…', 4000);
                        }
                    });
                }
            } else if (rand < 0.55) {
                girl.src = window.CONFIG.imgMap.idle;
            } else {
                girl.src = window.CONFIG.imgMap.idle2;
            }
        }
        _idleAnimationTimer = TimerManager.setTimeout('idleAnimation', switchAnimation, interval);
    }

    _idleAnimationTimer = TimerManager.setTimeout('idleAnimation', switchAnimation, interval);
}

// ==================== 自动睡眠检查 ====================
function checkAutoSleep() {
    const now = Date.now();
    if (now - _lastAutoActionTime < 3000000) return;

    const WAKE_UP_GRACE = 30 * 60 * 1000;
    if (_lastWakeUpTime > 0 && now - _lastWakeUpTime < WAKE_UP_GRACE) return;
    if (_isSpeaking) return;

    const userSettings = window.SETTINGS_STORE?.getAll() || {};
    const sleepHour   = userSettings.sleepTimeHour   ?? window.CONFIG.SLEEP_CONFIG.sleepTime.hour;
    const sleepMinute = userSettings.sleepTimeMinute ?? window.CONFIG.SLEEP_CONFIG.sleepTime.minute;
    const wakeHour    = userSettings.wakeTimeHour    ?? window.CONFIG.SLEEP_CONFIG.wakeTime.hour;
    const wakeMinute  = userSettings.wakeTimeMinute  ?? window.CONFIG.SLEEP_CONFIG.wakeTime.minute;
    const sleepValue  = sleepHour * 60 + sleepMinute;
    const wakeValue   = wakeHour * 60 + wakeMinute;

    const current = new Date();
    const currentValue = current.getHours() * 60 + current.getMinutes();
    console.log(`[Sleep] 当前 ${current.getHours()}:${current.getMinutes()}, 状态: ${_state}`);

    if (sleepValue === wakeValue) return;

    let isSleepTime = sleepValue > wakeValue
        ? (currentValue >= sleepValue || currentValue < wakeValue)
        : (currentValue >= sleepValue && currentValue < wakeValue);

    if (isSleepTime && _state === 'idle') {
        console.log('[Sleep] 自动去睡觉');
        _lastAutoActionTime = now;
        const girl = _getGirl();
        const maxX = window.innerWidth - (girl?.offsetWidth ?? 150);
        const maxY = window.innerHeight - (girl?.offsetHeight ?? 150);
        const targetPos = {
            x: Math.min(window.CONFIG.baseBedPos.x, maxX),
            y: Math.min(window.CONFIG.baseBedPos.y, maxY)
        };
        _bedPos = targetPos;
        _targetX = targetPos.x;
        _targetY = targetPos.y;
        setState('walking');
        moveStep();
    } else if (_state === 'sleeping' && !isSleepTime
               && Date.now() - _lastStateChangeTime >= window.CONFIG.STATE_CONFIG.minDuration) {
        console.log('[Sleep] 自动醒来');
        _lastAutoActionTime = now;
        setState('waking');
        window.UI?.showBubble('🌞 我醒啦~', 3500, 'neutral', false);
        window.STORAGE?.autoDiary('wake');
        setTimeout(() => {
            if (_state === 'idle') {
                _lastAutoActionTime = Date.now();
                _lastWakeUpTime = Date.now();
                window.STATE.lastWakeUpTime = _lastWakeUpTime;
            }
        }, 5000);
    }
}

function startAutoSleepCheck() {
    if (_sleepCheckInterval) {
        TimerManager.clearInterval('sleepCheck', _sleepCheckInterval);
        _sleepCheckInterval = null;
    }
    const interval = window.CONFIG.SLEEP_CONFIG.checkInterval;
    _sleepCheckInterval = TimerManager.setInterval('sleepCheck', checkAutoSleep, interval);
}

// ==================== 导出 ====================
window.STATE = {
    get state()               { return _state; },
    get isSpeaking()          { return _isSpeaking; },
    set isSpeaking(val)       { _isSpeaking = val; },
    get currentX()            { return _currentX; },
    set currentX(val)         { _currentX = val; },
    get currentY()            { return _currentY; },
    set currentY(val)         { _currentY = val; },
    get targetX()             { return _targetX; },
    set targetX(val)          { _targetX = val; },
    get targetY()             { return _targetY; },
    set targetY(val)          { _targetY = val; },
    get idleTimer()           { return _idleTimer; },
    get randomPlayTimer()     { return _randomPlayTimer; },
    get lastStateChangeTime() { return _lastStateChangeTime; },
    get isHidden()            { return _isHidden; },
    set isHidden(val)         { _isHidden = val; },
    get lastWakeUpTime()      { return _lastWakeUpTime; },
    set lastWakeUpTime(val)   { _lastWakeUpTime = val; },
    get workPos()             { return _workPos; },
    set workPos(val)          { _workPos = val; },
    get bedPos()              { return _bedPos; },
    set bedPos(val)           { _bedPos = val; },

    setState,
    dispatch,
    clearAutoEndTimer: _clearAutoEndTimer,
    updatePosition,
    moveStep,
    startIdleTimer,
    startRandomPlay,
    startIdleAnimationTimer,
    stopIdleAnimationTimer: () => {
        if (_idleAnimationTimer) {
            TimerManager.clearTimeout('idleAnimation', _idleAnimationTimer);
            _idleAnimationTimer = null;
        }
    },
    startAutoSleepCheck,
    checkAutoSleep,
    resetAutoActionTime() { _lastAutoActionTime = Date.now(); },
    
    // 安静模式
    setSilentMode,
    isSilentMode,
    get silentUntil() { return _silentUntil; }
};