# 单元测试文档

## 概述

本文档记录了 GirlPet v2 项目的单元测试框架搭建、核心模块测试覆盖情况，以及 pre-commit hook 配置。

## 1. 测试框架

### 1.1 技术栈

- **Jest** - JavaScript 测试框架
- **Husky** - Git hooks 管理

### 1.2 安装

```bash
npm install --save-dev jest husky
```

### 1.3 配置文件

**jest.config.js**
```javascript
module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/renderer/timerManager.js',
    'src/renderer/state.js',
    'src/renderer/actions.js'
  ],
  coverageDirectory: 'coverage',
  verbose: true
};
```

**tests/setup.js**
```javascript
global.window = global;
global.document = {
  readyState: 'complete',
  addEventListener: () => {}
};
```

### 1.4 运行命令

```bash
npm test              # 运行所有测试
npm run test:watch    # 监听模式（开发时用）
```

---

## 2. Pre-commit Hook

### 2.1 配置

已配置 Husky pre-commit hook，每次 `git commit` 时自动运行测试。

**.husky/pre-commit**
```bash
npm test
```

### 2.2 效果

- 测试通过 → 提交成功
- 测试失败 → 提交被阻止，需修复后重新提交

---

## 3. 测试覆盖

### 3.1 总览

| 模块 | 测试数 | 文件 |
|------|--------|------|
| TimerManager | 9 | tests/timerManager.test.js |
| state.js | 18 | tests/state.test.js |
| actions.js | 17 | tests/actions.test.js |
| **总计** | **44** | |

### 3.2 TimerManager 测试

**覆盖内容：**
- setTimeout 创建与注册
- setInterval 创建与持续触发
- clearTimeout 清除指定 timeout
- clearInterval 清除指定 interval
- clearGroup 清除分组下所有 timers
- clearAll 清除所有 timers
- debug 打印定时器信息

**关键测试示例：**
```javascript
test('clearGroup 应清除指定 group 下的所有 timers', () => {
  const callback1 = jest.fn();
  const callback2 = jest.fn();

  TimerManager.setTimeout('group1', callback1, 1000);
  TimerManager.setInterval('group1', callback2, 1000);

  TimerManager.clearGroup('group1');

  jest.advanceTimersByTime(1000);

  expect(callback1).not.toHaveBeenCalled();
  expect(callback2).not.toHaveBeenCalled();
});
```

### 3.3 state.js 测试

**覆盖内容：**
- STATE_TRANSITIONS 配置验证
  - waking: duration=2500ms, next=stretching
  - stretching: duration=2000ms, next=idle
  - dancing: duration=4000ms, next=idle
  - working: duration=3000ms, next=stretching
  - playing: duration=5000ms, next=idle
  - eating: duration=3000ms, next=idle
- TRANSITIONS 动作映射验证
- 状态守卫逻辑验证（豁免条件、minDuration 锁）
- 定时器时长合理性验证

**关键配置验证：**
```javascript
test('所有状态都有 duration 和 next', () => {
  Object.entries(STATE_TRANSITIONS).forEach(([state, config]) => {
    expect(typeof config.duration).toBe('number');
    expect(config.duration).toBeGreaterThan(0);
    expect(typeof config.next).toBe('string');
  });
});
```

### 3.4 actions.js 测试

**覆盖内容：**

#### generatePPT 函数（8 个测试）
- 成功时调用 clearGroup('pptProgress')
- 异常时调用 clearGroup('pptProgress')
- 空主题直接返回不设置定时器
- 开始时调用 clearAutoEndTimer
- 开始时调用 setState('working')
- 异常后只调用 clearGroup 一次（finally）
- 并发调用时 clearGroup 被正确调用

**关键测试示例：**
```javascript
test('generatePPT 异常时应调用 clearGroup("pptProgress")', async () => {
  mockWindow.TimerManager.setInterval.mockImplementation((group, cb, ms) => {
    return setInterval(cb, ms);
  });

  mockWindow.DEPENDENCIES.ipcRenderer.invoke.mockRejectedValueOnce(
    new Error('网络错误')
  );

  await generatePPT('测试主题');

  expect(mockWindow.TimerManager.clearGroup).toHaveBeenCalledWith('pptProgress');
});
```

#### play 函数（4 个测试）
- isSpeaking 时设置 TimerManager.setTimeout 延迟重试
- idle 状态时调用 TTS.speak
- walking 状态时直接返回不设置定时器
- sleeping 状态时直接返回不设置定时器

#### goToWork 函数（2 个测试）
- idle 状态时调用 dispatch('startWalking')
- working 状态时直接返回

#### feed 函数（3 个测试）
- idle 状态时设置状态为 eating
- walking 状态时直接返回不设置状态
- sleeping 状态时直接返回不设置状态

---

## 4. 解决的问题

### 4.1 progressTimer 内存泄漏

**问题：** generatePPT 函数中 progressTimer 在异常时未被清理

**修复：** 使用 TimerManager.setInterval 并在 finally 中调用 clearGroup

**验证：** 测试确保成功和异常路径都调用 clearGroup

### 4.2 测试覆盖不足

**问题：** 修改代码后无法自动发现问题

**修复：**
1. 搭建 Jest 测试框架
2. 为核心模块编写单元测试
3. 配置 pre-commit hook 自动运行测试

---

## 5. 最佳实践

### 5.1 TDD 开发流程

1. **写测试** - 先写一个会失败的测试
2. **写代码** - 写最少代码让测试通过
3. **重构** - 优化代码，确保测试仍通过

### 5.2 测试命名规范

```javascript
// 好的命名
test('generatePPT 异常时应调用 clearGroup("pptProgress")', () => {});

// 不好的命名
test('test1', () => {});
```

### 5.3 Mock 使用原则

- 只 mock 外部依赖（window、ipcRenderer、TTS 等）
- 不 mock 被测函数本身
- 每个 test 独立设置 mock，避免相互影响

### 5.4 覆盖率目标

不要追求 100% 覆盖率，优先覆盖：
1. 内存管理（定时器清理）
2. 状态转换（状态机逻辑）
3. 异步清理（Promise finally）
4. 边界条件（空值、异常）

---

## 6. 文件结构

```
e:\GirlPet\v2\
├── jest.config.js           # Jest 配置
├── package.json             # 包含 test 脚本
├── .husky/
│   └── pre-commit           # Git pre-commit hook
└── tests/
    ├── setup.js             # 测试环境初始化
    ├── timerManager.test.js # TimerManager 测试
    ├── state.test.js        # state.js 测试
    └── actions.test.js      # actions.js 测试
```

---

## 7. 常见问题

### Q: 测试失败但代码看起来没问题？

检查 mock 是否正确设置：
```javascript
// 确保 mock 返回值
mockWindow.TimerManager.setInterval.mockImplementation((group, cb, ms) => {
  return setInterval(cb, ms);
});
```

### Q: 如何调试单个测试？

```bash
npm test -- tests/actions.test.js --verbose
```

### Q: 如何跳过 pre-commit hook？

```bash
git commit --no-verify
```
（不推荐，除非明确知道自己在做什么）

---

## 8. 更新记录

| 日期 | 变更 |
|------|------|
| 2026-05-30 | 初始搭建测试框架，配置 Husky pre-commit hook |
| 2026-05-30 | 添加 TimerManager、state.js、actions.js 测试 |
| 2026-05-30 | 添加 play、goToWork、feed 函数测试 |
