# 代码改动记录

本文档记录最近对项目代码的重要改动，包含改动目的、方法和具体位置。

---

## 目录

1. [声明式状态转换配置](#1-声明式状态转换配置)
2. [WebSocket 服务模块拆分](#2-websocket-服务模块拆分)
3. [讨食回复 AI 生成](#3-讨食回复-ai-生成)

---

## 1. 声明式状态转换配置

### 1.1 改动目的

将分散在多处的状态转换逻辑集中管理，消除硬编码的 `setTimeout`，便于维护和扩展。

### 1.2 改动方法

采用**声明式配置表**模式，将状态转换规则集中定义，配合统一的状态推进引擎。

### 1.3 改动位置

**文件**: `src/renderer/state.js`

#### 1.3.1 新增配置表（第 26-36 行）

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

#### 1.3.2 新增状态推进引擎（第 207-237 行）

```javascript
// 统一的自动推进引擎
function _scheduleAutoTransition(newState) {
    const config = STATE_TRANSITIONS[newState];
    if (!config?.duration) return;
    _clearAutoEndTimer();
    if (config.onEnter) {
        _runTransitionCallback(config.onEnter);
    }
    _stateAutoEndTimer = setTimeout(() => {
        // ... 自动切换逻辑
    }, config.duration);
}

// 回调执行器
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
```

#### 1.3.3 简化 setState 函数（第 140-142 行）

**改动前**（约 30 行）:
```javascript
if (newState === 'waking') {
    _stateAutoEndTimer = setTimeout(() => { ... }, 2500);
} else if (newState === 'stretching') {
    _stateAutoEndTimer = setTimeout(() => { ... }, 2000);
} else if (newState === 'dancing') {
    _stateAutoEndTimer = setTimeout(() => { ... }, 4000);
}
```

**改动后**（1 行）:
```javascript
_scheduleAutoTransition(newState);
```

#### 1.3.4 清理 moveStep 手动定时器（第 185-195 行）

**改动前**:
```javascript
if (Math.abs(_targetX - wp.x) < 2 && Math.abs(_targetY - wp.y) < 2) {
    setState('working');
    window.UI?.showBubble('💻 开始工作...');
    _stateAutoEndTimer = setTimeout(() => { ... }, 3000);
}
```

**改动后**:
```javascript
if (Math.abs(_targetX - wp.x) < 2 && Math.abs(_targetY - wp.y) < 2) {
    setState('working');
    // working 的自动推进已在 STATE_TRANSITIONS.working 里声明
}
```

### 1.4 效果

| 维度 | 改动前 | 改动后 |
|------|--------|--------|
| 状态配置位置 | 分散在 3 个文件 | 集中在配置表 |
| 新增状态 | 修改多处代码 | 修改配置表一行 |
| 时间参数 | 硬编码多处 | 配置表统一管理 |

---

## 2. WebSocket 服务模块拆分

### 2.1 改动目的

将 WebSocket 服务逻辑从 `main.js` 中分离，遵循单一职责原则，便于测试和维护。

### 2.2 改动方法

新建独立模块 `websocketServer.js`，将 WebSocket 相关逻辑封装为独立函数。

### 2.3 改动位置

#### 2.3.1 新建文件 `src/main/websocketServer.js`

```javascript
/**
 * WebSocket 服务模块
 * 职责：管理 WebSocket 服务，接收手机端消息并转发给渲染进程
 * 认识谁：只认识主进程的 win 对象
 * 绝不能：操作 DOM，操作渲染进程逻辑
 */

const WebSocket = require('ws');

let wss = null;

function createWebSocketServer(win) {
    wss = new WebSocket.Server({ port: 8083 });
    wss.on('connection', ws => {
        ws.on('message', message => {
            try {
                const data = JSON.parse(message);
                if (win) win.webContents.send('mobile-command', data);
            } catch (_) {}
        });
    });
    console.log('✅ WebSocket 服务已启动，端口 8083');
}

function getWss() {
    return wss;
}

module.exports = { createWebSocketServer, getWss };
```

#### 2.3.2 修改 `main.js`

**顶部引入**（第 14 行）:
```javascript
const { createWebSocketServer, getWss } = require('./src/main/websocketServer');
```

**删除全局变量声明**（第 16 行）:
```javascript
// 之前: let win, wss, gomokuWindow, ...
// 之后: let win, gomokuWindow, ...
```

**删除内联函数**（第 113-128 行）:
```javascript
// 删除整个 createWebSocketServer 函数定义
```

**修改 IPC handler**（第 166-171 行）:
```javascript
ipcMain.on('reply-to-mobile', (event, reply) => {
    const wss = getWss();  // 使用 getter 获取实例
    wss?.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) 
            client.send(JSON.stringify({ type: 'reply', text: reply }));
    });
});
```

### 2.4 模块边界

```
websocketServer.js
├── 输入: win (BrowserWindow 对象)
├── 输出: createWebSocketServer(), getWss()
└── 限制: 仅处理 WebSocket，不操作 DOM 或渲染进程逻辑
```

---

## 3. 讨食回复 AI 生成

### 3.1 改动目的

将讨食时的硬编码回复改为调用 AI 模型生成，增加回复多样性，避免重复。

### 3.2 改动方法

新增 `begForFood()` 和 `rejectFood()` 函数，根据好感度动态生成 prompt 调用 AI。

### 3.3 改动位置

**文件**: `src/renderer/actions.js`

#### 3.3.1 新增 `begForFood()` 函数（第 157-187 行）

```javascript
function begForFood() {
    const s = window.STATE;
    if (['walking', 'sleeping', 'eating'].includes(s.state)) return;
    if (s.isSpeaking) return;

    const affectionValue = window.AFFECTION?.getValue() ?? 50;
    const affectionPhase = window.AFFECTION?.getPhase() ?? '接受';

    const attitude = affectionValue < 30
        ? '你很嫌弃地表示饿了，但绝不承认自己需要被照顾。'
        : affectionValue < 60
        ? '你傲娇地抱怨肚子饿，嘴上不饶人但其实在撒娇。'
        : '你带着小期待表示饿了，语气中可以透露一点点开心。';

    const prompt = `（你饿了，肚子在咕咕叫。${attitude}当前好感度：${affectionValue}/100（${affectionPhase}阶段）。请用1-2句话傲娇地讨食，要求：1）突出你的独立人格，不是谁的食物都能收买 2）可以傲娇、毒舌、带点小委屈 3）不要过于卑微或物化自己 4）只输出话语，不要任何解释或动作描述。）`;

    if (window.CHAT?.talkToOllama) {
        window.CHAT.talkToOllama(prompt, {
            skipLearning: true,
            skipIntercept: true
        });
    } else {
        // fallback 气泡
    }
}
```

#### 3.3.2 新增 `rejectFood()` 函数（第 189-219 行）

```javascript
function rejectFood() {
    const s = window.STATE;
    if (['sleeping'].includes(s.state)) return;

    const affectionValue = window.AFFECTION?.getValue() ?? 50;

    const attitude = affectionValue < 30
        ? '你很不爽地表示不稀罕，嘴硬说本来就不饿。'
        : affectionValue < 60
        ? '你傲娇地表示不在乎，假装自己本来就不想吃。'
        : '你有点小委屈地嘟囔，但其实也不是真的生气。';

    const prompt = `（你刚才讨食，但那个人类没有给你吃的。${attitude}请用1-2句话傲娇地表示"才不稀罕"，要求：1）嘴硬但不要太刻薄 2）可以有点小委屈但要马上恢复傲娇 3）不要过于卑微 4）只输出话语，不要任何解释。）`;

    // ... AI 调用逻辑
}
```

#### 3.3.3 导出新函数（第 730 行）

```javascript
window.ACTIONS = {
    // ... 其他函数
    begForFood,
    rejectFood,
    // ...
};
```

**文件**: `src/renderer/drag.js`

#### 3.3.4 修改饥饿提醒逻辑（第 147-156 行）

**改动前**:
```javascript
const hungryBubbles = [
    '喂！你是想饿死我吗？快投食！',
    '本小姐的肚子在抗议了，你耳朵聋了吗？',
    // ... 共 5 句
];
const msg = hungryBubbles[Math.floor(Math.random() * hungryBubbles.length)];
window.UI.showBubble(msg, 3000);
```

**改动后**:
```javascript
window.ACTIONS.begForFood();
```

#### 3.3.5 修改食物图标超时逻辑（第 96-104 行）

**改动前**:
```javascript
const timeoutBubbles = [
    '切，不吃就不吃，我又不饿！',
    // ... 共 4 句
];
const msg = timeoutBubbles[Math.floor(Math.random() * timeoutBubbles.length)];
window.UI.showBubble(msg, 2000);
```

**改动后**:
```javascript
window.ACTIONS.rejectFood();
```

### 3.4 效果

| 场景 | 改动前 | 改动后 |
|------|--------|--------|
| 讨食提醒 | 5 句固定气泡循环 | AI 生成多样化回复 |
| 被拒回复 | 4 句固定气泡循环 | AI 生成多样化回复 |
| 个性化 | 无 | 根据好感度调整语气 |
| 降级机制 | 无 | 无 AI 时使用 fallback |

---

## 统计摘要

| 文件 | 新增行数 | 删除行数 | 净变化 |
|------|---------|---------|--------|
| `src/renderer/state.js` | ~50 | ~30 | +20 |
| `src/renderer/actions.js` | ~60 | 0 | +60 |
| `src/renderer/drag.js` | 2 | ~13 | -11 |
| `src/main/websocketServer.js` | 40 | 0 | +40 |
| `main.js` | 1 | ~15 | -14 |

---

*最后更新: 2026-05-24*
