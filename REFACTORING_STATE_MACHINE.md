# 重构记录：状态机与视图层解耦

**日期**: 2026-05-22
**类型**: 架构重构
**状态**: ✅ 已完成

---

## 一、重构目标

### 问题描述
`state.js` 中的 `setState` 函数同时承担了两种职责：
1. **状态管理**：记录状态变更、维护状态转换规则
2. **UI 控制**：直接操作 DOM（`girl.src`、`girl.style.opacity`）、控制音频

这违反了**单一职责原则**，导致：
- 状态机依赖 DOM，难以测试
- UI 逻辑分散，难以维护
- 模块间耦合度高，扩展困难

### 重构目标
将 `state.js` 重构为**纯状态管理器**，通过事件通知让视图层处理 DOM 更新。

---

## 二、重构方案

### 设计模式：观察者模式 + 事件驱动

```
┌─────────────────────────────────────────────────────────────┐
│  state.js (状态机)                                          │
│                                                             │
│  ┌─────────────┐     ┌─────────────────┐                   │
│  │ setState() │ ──→ │ emitStateChange │                   │
│  └─────────────┘     └────────┬────────┘                   │
│                                │                            │
│                                ↓                            │
│                     ┌─────────────────────┐                │
│                     │ window.dispatchEvent│                │
│                     └────────┬────────────┘                │
└────────────────────────────────┼────────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    ↓                         ↓
┌───────────────────────────┐    ┌───────────────────────────┐
│ index.js (视图层)          │    │ 其他监听器                 │
│                            │    │                            │
│ addEventListener(          │    │ (可扩展)                   │
│   'stateChanged',         │    │                            │
│   (e) => { DOM 操作 }     │    │                            │
│ )                          │    │                            │
└───────────────────────────┘    └────────────────────────────┘
```

---

## 三、具体修改

### 3.1 state.js 修改

#### 新增：事件系统

```javascript
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
```

#### 修改：setState 函数

**移除的 DOM 操作**：
- `girl.src = newSrc` - 动画切换
- `girl.style.opacity` - 透明度控制
- `_startSleepAudio()` / `_stopSleepAudio()` - 音频控制
- `window.DRAG?.hideFoodIcon?.()` - 食物图标隐藏
- `window.DRAG?.stopHungerTimer?.()` - 饥饿定时器停止

**新增的事件通知**：
```javascript
function setState(newState) {
    // ... 验证逻辑 ...

    // 触发状态即将变更事件
    _emitStateWillChange(_state, newState);

    _state = newState;

    // 触发状态已变更事件
    _emitStateChanged(newState, oldState);

    // ... 定时器逻辑保持不变 ...
}
```

---

### 3.2 index.js 修改

#### 新增：状态变更监听器

```javascript
// ==================== 状态变更监听器（视图层） ====================
let _sleepAudio = null;

function _initStateListeners() {
    // 监听状态即将变更
    window.addEventListener('stateWillChange', (e) => {
        const { oldState, newState } = e.detail;
        console.log(`[UI] 状态即将变更: ${oldState} → ${newState}`);
    });

    // 监听状态已变更
    window.addEventListener('stateChanged', (e) => {
        const { newState, oldState } = e.detail;
        const girl = window.DEPENDENCIES?.girl;
        if (!girl) return;

        // ===== 动画切换 =====
        const FORCE_RELOAD_STATES = ['waking', 'stretching', 'playing', 'dancing', 'eating', 'working'];
        let newSrc;
        if (newState === 'idle') {
            newSrc = Math.random() < 0.5 ? window.CONFIG.imgMap.idle2 : window.CONFIG.imgMap.idle;
        } else if (newState === 'playing') {
            newSrc = Math.random() < 0.5 ? window.CONFIG.imgMap.playing2 : window.CONFIG.imgMap.playing;
        } else {
            newSrc = window.CONFIG.imgMap[newState] || window.CONFIG.imgMap.idle;
        }

        if (FORCE_RELOAD_STATES.includes(newState)) {
            girl.src = newSrc + '?t=' + Date.now();
        } else {
            girl.src = newSrc;
        }

        // ===== 透明度 =====
        girl.style.opacity = newState === 'sleeping' ? '0.8' : '1';

        // ===== 睡眠音频 =====
        if (newState === 'sleeping') {
            window.DRAG?.hideFoodIcon?.();
            window.DRAG?.stopHungerTimer?.();
            _startSleepAudio();
        } else if (oldState === 'sleeping') {
            _stopSleepAudio();
        }
    });
}
```

#### 新增：音频控制函数

```javascript
function _startSleepAudio() {
    if (!_sleepAudio) {
        _sleepAudio = new Audio('sleep.wav');
        _sleepAudio.loop = true;
    }
    _sleepAudio.currentTime = 0;
    _sleepAudio.play().catch(err => console.warn('播放 sleep.wav 失败:', err));
}

function _stopSleepAudio() {
    if (_sleepAudio) {
        _sleepAudio.pause();
        _sleepAudio.currentTime = 0;
        _sleepAudio = null;
    }
}
```

---

## 四、事件说明

### 事件列表

| 事件名 | 触发时机 | detail 内容 | 用途 |
|--------|----------|-------------|------|
| `stateWillChange` | 状态变更前 | `{ oldState, newState }` | 预留给其他监听器做准备工作 |
| `stateChanged` | 状态变更后 | `{ oldState, newState }` | 视图层更新 DOM |

### 使用示例

```javascript
// 监听状态变更
window.addEventListener('stateChanged', (e) => {
    console.log(`状态从 ${e.detail.oldState} 变为 ${e.detail.newState}`);
});

// 获取当前状态
console.log(window.STATE.state);
```

---

## 五、架构对比

### 重构前

```
┌────────────────────────────────────────────────┐
│ state.js                                       │
│                                                │
│ setState(newState) {                           │
│     _state = newState;                        │
│     girl.src = ...    ← 直接操作 DOM ❌        │
│     girl.style.opacity = ... ← 直接操作 DOM ❌ │
│     _startSleepAudio() ← 直接控制音频 ❌       │
│ }                                              │
└────────────────────────────────────────────────┘
```

**问题**：
- ❌ 状态机依赖 DOM 元素
- ❌ 无法单独测试状态逻辑
- ❌ DOM 变更散落在各处
- ❌ 修改 UI 需要动状态机

### 重构后

```
┌────────────────────────────────────────────────┐
│ state.js                                       │
│                                                │
│ setState(newState) {                          │
│     _state = newState;                        │
│     emitStateChanged() ← 只发事件 ✅           │
│ }                                              │
└────────────────────────────────────────────────┘
                        ↓ 事件通知
┌────────────────────────────────────────────────┐
│ index.js (视图层)                              │
│                                                │
│ addEventListener('stateChanged', (e) => {     │
│     girl.src = ...    ← DOM 操作 ✅          │
│     girl.style.opacity = ... ← DOM 操作 ✅    │
│     _startSleepAudio() ← 音频控制 ✅          │
│ });                                            │
└────────────────────────────────────────────────┘
```

**优势**：
- ✅ 状态机职责单一
- ✅ 状态逻辑可独立测试
- ✅ DOM 变更集中在视图层
- ✅ UI 修改不影响状态机
- ✅ 可添加多个监听器

---

## 六、其他模块说明

### chat.js 的 DOM 操作

chat.js 中也有少量 DOM 操作（如思考表情），但这些是**对话流程中的短暂 UI 反馈**，不是全局状态机的一部分，因此**保留在原处**。

| 位置 | 操作 | 原因 |
|------|------|------|
| 第 358-361 行 | `girl.src = disgust` | 毒舌表情（临时1.5秒） |
| 第 446-447 行 | `girl.src = think` | 对话思考状态 |
| 第 478、484 行 | `girl.src = previousSrc` | 恢复原图 |

**判断标准**：如果一个 DOM 操作的生命周期跟随某个特定功能（如对话），且不需要被其他模块监听，则保留在该功能模块中。

---

## 七、扩展建议

### 添加新的状态监听器

```javascript
// 示例：添加日志监听器
window.addEventListener('stateChanged', (e) => {
    const { newState, oldState } = e.detail;
    window.STORAGE.recordStateChange(oldState, newState);
});

// 示例：添加统计监听器
window.addEventListener('stateChanged', (e) => {
    if (e.detail.newState === 'sleeping') {
        analytics.track('进入睡眠状态');
    }
});
```

### 未来优化方向

1. **引入状态机框架**：如 XState，提供更严谨的状态管理
2. **引入 Redux/MobX**：集中管理应用状态
3. **引入虚拟 DOM**：提高渲染性能

---

## 八、测试清单

- [ ] 状态切换正常（idle ↔ sleeping ↔ working 等）
- [ ] 动画切换正常（每个状态对应正确的 GIF）
- [ ] 睡眠音频正常播放/停止
- [ ] 食物图标在睡眠时隐藏
- [ ] 饥饿定时器在睡眠时停止
- [ ] 节日问候在睡眠→idle 时触发
- [ ] 自动睡眠检查正常
- [ ] 随机玩耍定时器正常
- [ ] 手机遥控功能正常

---

## 九、相关文件

| 文件 | 修改类型 | 说明 |
|------|----------|------|
| `src/renderer/state.js` | 重构 | 添加事件系统，移除 DOM 操作 |
| `src/renderer/index.js` | 新增 | 添加状态变更监听器 |

---

## 十、重构：声明式状态转换配置

**日期**: 2026-05-22

### 10.1 目标

将散落在 `setState`、`moveStep`、`actions.js` 中的手动 `setTimeout` 调用，改为集中管理的声明式配置。

### 10.2 问题

**重构前**：状态转换逻辑分散在多处
```javascript
// state.js setState() 中
if (newState === 'waking') {
    _stateAutoEndTimer = setTimeout(() => {
        setState('stretching');
        window.UI?.showBubble('🙆 伸个懒腰～', 2500, 'neutral', false);
    }, 2500);
} else if (newState === 'stretching') {
    // ... 另一个 setTimeout
}

// moveStep() 中
setState('working');
_stateAutoEndTimer = setTimeout(() => {
    setState('stretching');
    // ...
}, 3000);

// actions.js 中
setTimeout(() => {
    s.setState('idle');
}, 5000);
```

**问题**：
- 状态转换逻辑分散，难以维护
- 时间参数硬编码，无法统一调整
- 定时器清理逻辑不统一，容易遗漏

### 10.3 解决方案

**引入 STATE_TRANSITIONS 配置表**：
```javascript
const STATE_TRANSITIONS = {
    waking:     { duration: 2500, next: 'stretching', onEnter: 'showStretchBubble' },
    stretching: { duration: 2000, next: 'idle',       onExit: 'startIdleRoutines' },
    dancing:    { duration: 4000, next: 'idle',       onExit: 'startIdleRoutines' },
    working:    { duration: 3000, next: 'stretching', onEnter: 'showWorkBubble' },
    playing:    { duration: 5000, next: 'idle',       onExit: 'startIdleRoutines' },
    eating:     { duration: 3000, next: 'idle',       onExit: 'startIdleRoutines' }
};
```

**统一引擎**：
```javascript
function _scheduleAutoTransition(newState) {
    const config = STATE_TRANSITIONS[newState];
    if (!config?.duration) return;

    _clearAutoEndTimer();

    if (config.onEnter) {
        _runTransitionCallback(config.onEnter);
    }

    _stateAutoEndTimer = setTimeout(() => {
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
```

### 10.4 修改文件

| 文件 | 修改内容 |
|------|----------|
| `state.js` | 新增 `STATE_TRANSITIONS` 配置表、`_scheduleAutoTransition` 引擎、`_runTransitionCallback` 执行器 |
| `state.js` | `setState()` 中的手动定时器替换为 `_scheduleAutoTransition(newState)` |
| `state.js` | `moveStep()` 中移除 working 状态的手动定时器 |
| `actions.js` | `play()` 中移除 playing 状态的 5 秒手动定时器 |
| `actions.js` | `searchWeb()` 中移除搜索后手动转换状态的定时器 |

### 10.5 效果

| 指标 | 重构前 | 重构后 |
|------|--------|--------|
| 状态转换代码位置 | 分散在 3 个文件 | 集中在 `state.js` |
| 时间参数 | 硬编码多处 | 统一在配置表 |
| 新增状态 | 需要修改多处 | 只需修改配置表 |
| 定时器清理 | 容易遗漏 | 统一在引擎 |

### 10.6 注意事项

1. **playing 和 eating 的结束仍由调用方控制**：`play()` 通过 TTS onStart，`feed()` 通过 AI onEnd 或安全定时器
2. **working 状态的转换**：现在完全由 `STATE_TRANSITIONS.working` 控制
3. **离线模式**：`feed()` 的 2 秒回退定时器保留，用于模拟 AI 响应时间

---

## 十一、Bug 修复记录

### Bug #1: 重复声明 `_sleepAudio`

**日期**: 2026-05-22

**问题描述**:
重构后出现运行时错误：
```
Uncaught SyntaxError: Identifier '_sleepAudio' has already been declared (at index.js:1:1)
```

**原因**:
重构时将 `_sleepAudio` 变量和相关函数从 `state.js` 移到 `index.js`，但 `state.js` 中的原始声明未删除，导致变量重复声明。

**修复方案**:
从 `state.js` 中移除以下内容：
- `let _sleepAudio = null;`
- `function _startSleepAudio() { ... }`
- `function _stopSleepAudio() { ... }`

**涉及文件**:
- `src/renderer/state.js` - 删除重复声明
- `src/renderer/index.js` - 音频逻辑已正确迁移

**教训**:
重构时应使用编辑器的"查找所有引用"功能，确保所有相关的代码片段都被正确迁移，而不仅仅是简单删除。

---

**文档版本**: v1.2
**更新日期**: 2026-05-22
