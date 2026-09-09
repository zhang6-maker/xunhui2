# 调试笔记：四个典型问题及其解决方案

本文档记录开发过程中遇到的 4 个典型问题及其修复方案，供后续排查参考。

---

## 问题一：重复声明导致语法错误

### 错误信息
```
Uncaught SyntaxError: Identifier '_sleepAudio' has already been declared (at index.js:1:1)
```

### 问题描述
重构后出现运行时错误，变量 `_sleepAudio` 被重复声明。

### 原因分析
将 `_sleepAudio` 变量和相关函数从 `state.js` 移到 `index.js` 时，原始声明未从 `state.js` 中删除，导致同一变量在两个文件中被声明。

### 修复方案
从 `state.js` 中移除以下内容：
- `let _sleepAudio = null;`
- `function _startSleepAudio() { ... }`
- `function _stopSleepAudio() { ... }`

### 涉及文件
- `src/renderer/state.js`
- `src/renderer/index.js`

### 预防措施
- 重构时使用全局搜索确认变量/函数的的所有位置
- 遵循模块职责边界：音频相关功能应集中在 `index.js` 或单独模块

---

## 问题二：状态转换逻辑分散

### 问题描述
状态转换的定时器和回调散落在 `setState()`、`moveStep()`、`actions.js` 等多处，导致：
- 时间参数硬编码在多处
- 新增/修改状态需要改多个文件
- 逻辑难以追踪和调试

### 原因分析
采用命令式编程风格，每个状态的持续时间、转换目标、副作用都写成独立的 `setTimeout` 代码块。

### 修复方案
引入**声明式状态转换配置表**：

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

配合统一引擎 `_scheduleAutoTransition()` 和回调执行器 `_runTransitionCallback()`。

### 涉及文件
- `src/renderer/state.js`（配置表 + 引擎）
- `src/renderer/actions.js`（移除散落的 setTimeout）

### 效果
- 新增状态：只需在配置表添加一行
- 修改时长：只需改一处
- 状态转换逻辑可追溯

---

## 问题三：喂食反应重复触发

### 问题描述
用户只喂了一次食物，角色却反复触发喂食反应。

### 原因分析
缺少动作冷却机制，每次调用 `feed()` 都会执行完整的喂食逻辑，没有防抖措施。

### 修复方案
在 `actions.js` 中实现**动作冷却系统**：

```javascript
// 动作冷却记录
let actionCooldown = false;

function feed() {
    if (actionCooldown) return;  // 冷却中，跳过

    actionCooldown = true;
    setState('eating');

    setTimeout(() => {
        actionCooldown = false;
    }, 5000);  // 5秒冷却
}
```

### 涉及文件
- `src/renderer/actions.js`

### 效果
- 5秒内重复喂食无效
- 防止状态机被意外重置

---

## 问题四：角色记忆混乱

### 问题描述
角色经常记不住和用户玩的是什么游戏（跳棋/五子棋），或者混淆自己说的话和用户说的话。

### 原因分析
- 对话历史没有去重机制
- 只使用精确匹配触发记忆
- 游戏类型没有单独跟踪

### 修复方案

**1. 对话历史去重**（`chat.js`）
```javascript
function addToHistory(role, content) {
    // 相似内容去重（与最后一条比较）
    if (history.length > 0) {
        const last = history[history.length - 1];
        if (last.role === role && similar(last.content, content) > 0.8) {
            return;  // 跳过
        }
    }
    history.push({ role, content, timestamp: Date.now() });
}
```

**2. 记忆模糊匹配**（`storage.js`）
```javascript
function addMemory(content) {
    // 相似度 > 50% 跳过
    for (const m of memories) {
        if (similar(m.content, content) > 0.5) {
            return;  // 已存在相似记忆
        }
    }
    memories.push({ content, timestamp: Date.now() });
}
```

**3. 游戏类型单独跟踪**（`storage.js`）
```javascript
let lastGame = null;  // 'checkers' | 'gomoku' | null

function setLastGame(game) {
    lastGame = game;
    saveLearning();
}
```

### 涉及文件
- `src/renderer/chat.js`（历史去重）
- `src/renderer/storage.js`（记忆模糊匹配 + 游戏跟踪）

### 效果
- 相似对话不会重复记录
- 记忆匹配支持语义相似
- 游戏类型跨对话保留

---

## 调试技巧总结

| 问题类型 | 排查方法 | 预防措施 |
|---------|---------|---------|
| 重复声明 | 全局搜索变量名 | 遵循模块职责边界 |
| 状态异常 | 打开 STATE_DEBUG 日志 | 声明式配置集中管理 |
| 动作重复 | 检查 actionCooldown 状态 | 添加冷却机制 |
| 记忆丢失 | 检查 storage.js 日志 | 模糊匹配 + 持久化 |

---

## 日志关键词

调试时可全局搜索以下关键词：

- `STATE_DEBUG`: 状态转换日志
- `💕 好感度`: 好感度变化日志
- `记忆`: 记忆操作日志
- `[TTS]`: 语音合成日志
- `setTimeout.*setState`: 检查残留的手动定时器

---

*最后更新: 2026-05-24*
