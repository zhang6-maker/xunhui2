把这次排查写成文档，说明你开始有意识地从“修bug”进化到“建体系”了。这比修好一个bug本身更有价值。

下面我帮你把这次的问题、原因、修复和教训全部理清楚。你可以直接拿这个当文档草稿。

---

## 故障排查报告：手机端 WebSocket 连接失败及渲染进程崩溃

### 一、故障现象

1. **手机端**：访问 `http://192.168.43.62:8080` 后，页面能加载，但 WebSocket 一直显示“连接断开”。
2. **电脑端**：渲染进程控制台报错：
   ```
   Uncaught Error: Cannot destructure property 'game' of 'data' as it is undefined.
   ```
   定位到 `preload.js:93` 和 `index.js` 中的 `game-result` 消息处理逻辑。

### 二、问题根因分析

本次故障由**三个独立但连锁的问题**叠加而成。

---

#### 问题1：WebSocket 连接地址写死（核心故障）

**位置**：`mobile.html`

**现象**：
电脑访问时 WebSocket 连接正常，手机访问时连接断开。

**根因**：
`mobile.html` 中 WebSocket 连接地址写死为 `ws://localhost:8083`。手机访问时，`localhost` 指向的是手机本身，而非电脑，导致 WebSocket 永远连不上。

**修复**：
1.  删除写死的 `const WS_URL = ...` 全局常量。
2.  通过 `fetch('/ip')` 动态获取电脑 IP，存入变量 `PC_IP`。
3.  在 `connectWebSocket()` 函数内部动态拼接地址：
    ```javascript
    const WS_URL = `ws://${PC_IP}:8083`;
    ```
4.  确保 `connectWebSocket` 只在 IP 获取完成后调用一次。

**教训**：
任何涉及跨设备的通信，地址必须动态获取，不能硬编码 `localhost`。这是“环境边界”问题——代码不能假设自己永远跑在本机。

---

#### 问题2：`game-result` 消息传递链缺少防御（连锁崩溃）

**位置**：
-   `main.js` 第 147 行附近
-   `index.js` 中 `game-result` 的监听回调

**现象**：
渲染进程解构 `data` 时报错 `Cannot destructure property 'game' of 'data' as it is undefined`。

**根因**：
`game-result` 消息的传递链是：游戏窗口 → 主进程 → 主窗口渲染进程。
每一层都假设上一层一定会传有效数据，没有任何防御性检查。
一旦游戏窗口发出了空消息（不带数据），主进程原封不动转发 `undefined` 给渲染进程，渲染进程直接解构一个 `undefined` 对象，程序崩溃。

**修复**：
1.  **主进程防御**（`main.js`）：
    ```javascript
    ipcMain.on('game-result', (event, data) => {
        if (!data) {
            console.warn('⚠️ 收到 game-result 空消息，已忽略');
            return;
        }
        win?.webContents.send('game-result', data);
    });
    ```
2.  **渲染进程防御**（`index.js`）：
    ```javascript
    window.DEPENDENCIES.ipcRenderer.on('game-result', (data) => {
        if (!data) {
            console.warn('⚠️ 收到 game-result 空消息，已忽略');
            return;
        }
        const result = data.result;
        const game = data.game;
        // ... 后续逻辑
    });
    ```

**教训**：
多层架构中，**每一层都不应信任上一层**。每一层接收数据时，都必须做自己的防御性检查。这是“数据流边界”问题。

---

#### 问题3：变量重复声明（语法错误）

**位置**：`mobile.html` `<script>` 标签内

**现象**：
浏览器控制台报错 `Identifier 'reconnectAttempts' has already been declared`，导致整个脚本执行中断。

**根因**：
`reconnectAttempts` 和 `reconnectTimer` 在同一个作用域内被 `let` 声明了两次。这是从旧版本拷贝代码时未清理干净所致。

**修复**：
删除第二次声明，只保留第一次。

**教训**：
添加新代码前，先检查同一作用域内是否已存在同名变量。用 `Ctrl+Shift+F` 全局搜索变量名是基本功。

---

### 三、总结

| 问题 | 类型 | 核心原因 | 修复方式 |
|------|------|----------|----------|
| 手机 WebSocket 断开 | 环境边界 | 地址写死 `localhost` | 动态获取 IP，函数内拼接地址 |
| `game-result` 崩溃 | 数据流边界 | 传递链缺少防御 | 主进程和渲染进程各加空值检查 |
| 变量重复声明 | 代码规范 | 旧代码残留 | 删除重复声明 |

### 四、新增的防御性编程原则

1.  **跨设备通信，地址必须动态获取，禁止硬编码 `localhost` 或 `127.0.0.1`。**
2.  **多层架构中，每一层接收数据时，必须检查数据有效性，不信任上一层。**
3.  **添加新变量前，先搜索整个作用域，确认没有同名变量。**
4.  **所有异步操作（如 `fetch`）必须考虑失败兜底，不能假设一定成功。**
5.  **删除旧代码时，确保相关的声明全部清理干净，不留残留。**

---

把这份文档存好，以后每次遇到类似的“连接断开”或“解构报错”时，直接翻出来对照排查。这就是你从“踩坑”到“建地图”的第一步。