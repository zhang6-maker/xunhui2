# 寻慧 v2 问题修复指南

## 概述

本文档详细记录了寻慧 v2 开发过程中遇到的各种问题及其修复方法。所有内容都用通俗易懂的语言解释，即使你是编程小白也能看懂。

---

## 目录

1. [问题1：麦克风无法访问](#问题1麦克风无法访问)
2. [问题2：录音文件未生成](#问题2录音文件未生成)
3. [问题3：Express模块缺失](#问题3express模块缺失)
4. [问题4：Preload脚本加载失败](#问题4preload脚本加载失败)
5. [问题5：资源文件加载失败](#问题5资源文件加载失败)
6. [问题6：眼睛按钮无法移动窗口](#问题6眼睛按钮无法移动窗口)
7. [问题7：PPT生成失败](#问题7ppt生成失败)
8. [问题8：缺少文件选择功能](#问题8缺少文件选择功能)

---

## 安全加固指南

### 为什么需要安全加固？

Electron应用同时具备Web和Node.js的能力，如果不做好安全防护，可能会被恶意代码利用，导致：
- 电脑文件被篡改或删除
- 敏感信息泄露
- 被用来执行恶意命令

### 安全加固措施

#### 1. 启用Web安全设置

在 `main.js` 的 `webPreferences` 中设置：

```javascript
webPreferences: {
nodeIntegration: false,  // 禁止渲染进程直接访问Node.js
contextIsolation: true,  // 隔离渲染进程和主进程
webSecurity: true,       // 启用Web安全策略
devTools: false          // 发布时关闭开发者工具
}
```

**简单解释**：
- `nodeIntegration: false`：不让网页直接操作电脑文件
- `contextIsolation: true`：让渲染进程和主进程分开，防止互相干扰
- `webSecurity: true`：阻止不安全的网络请求

#### 2. IPC通道白名单

在 `preload.js` 中，只允许特定的IPC通道：

```javascript
// 允许的invoke通道
const ALLOWED_INVOKE_CHANNELS = new Set([
'get-templates',
'save-template',
'select-ppt-file',
'generate-ppt-content'
// ... 只添加需要的通道
]);

// 调用前检查
invoke(channel, ...args) {
if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
    return Promise.reject(new Error(`不允许的通道: ${channel}`));
}
return ipcRenderer.invoke(channel, ...args);
}
```

**为什么需要白名单？**

防止恶意代码通过未知的IPC通道发送危险命令。

#### 3. 路径遍历攻击防护

在 `main.js` 中，对文件操作进行路径检查：

```javascript
const ALLOWED_BASE_DIRS = [os.homedir(), os.tmpdir()];

function isPathAllowed(filePath) {
const resolved = path.resolve(filePath);
return ALLOWED_BASE_DIRS.some(base => resolved.startsWith(base));
}

// 使用示例
ipcMain.on('fs-read', (event, filePath, encoding) => {
if (!isPathAllowed(filePath)) {
    console.warn('拒绝访问路径:', filePath);
    event.returnValue = null;
    return;
}
event.returnValue = fs.readFileSync(filePath, encoding);
});
```

**什么是路径遍历攻击？**

如果用户输入 `../../../../etc/passwd`，可能会读取系统敏感文件。通过白名单检查，可以只允许访问特定目录。

#### 4. 命令注入防护

使用 `spawn` 替代 `exec`，并使用参数数组：

```javascript
// ❌ 不安全
exec(`python script.py ${userInput}`, (err, stdout) => {});

// ✅ 安全
spawn('python', ['script.py', userInput]);
```

**为什么这样更安全？**

`exec` 会将整个字符串作为命令执行，如果用户输入恶意代码（如 `; rm -rf /`），可能会造成严重破坏。而 `spawn` 会将参数作为独立项传递，不会被解析为命令。

#### 5. 自定义协议安全

注册自定义协议时，进行路径验证：

```javascript
protocol.registerFileProtocol('app', (request, callback) => {
let url = request.url.replace('app://', '');

// 防止路径遍历
if (url.includes('..')) {
    callback({ error: -6 });
    return;
}

const filePath = path.join(__dirname, url);

if (!fs.existsSync(filePath)) {
    callback({ error: -6 });
    return;
}

callback({ path: filePath });
});
```

#### 6. 内容安全策略（CSP）

在 `index.html` 中设置CSP：

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' app: data:; script-src 'self'; style-src 'self'">
```

**CSP的作用**：
- 限制只能加载自己服务器的资源
- 防止加载恶意脚本
- 防止XSS攻击

### 安全检查清单

| 检查项 | 安全状态 | 说明 |
|-------|---------|------|
| nodeIntegration | ❌ 关闭 | 防止渲染进程直接访问Node.js |
| contextIsolation | ✅ 开启 | 隔离主进程和渲染进程 |
| webSecurity | ✅ 开启 | 启用Web安全策略 |
| IPC白名单 | ✅ 已配置 | 只允许特定通道 |
| 路径验证 | ✅ 已实现 | 防止路径遍历攻击 |
| 命令注入防护 | ✅ 已实现 | 使用spawn替代exec |
| CSP配置 | ✅ 已配置 | 限制资源加载 |
| 开发者工具 | ⚠️ 发布时关闭 | 生产环境不应开启 |

### 常见安全问题

#### Q1：为什么不能用 `file://` 协议？

`file://` 协议没有安全限制，网页可以访问电脑上的任何文件，非常危险。使用自定义协议（如 `app://`）可以更好地控制访问权限。

#### Q2：什么是XSS攻击？

XSS（跨站脚本攻击）是指攻击者在网页中注入恶意脚本，当用户访问时执行。通过开启 `contextIsolation` 和设置CSP，可以有效防止XSS攻击。

#### Q3：为什么需要IPC白名单？

如果不限制IPC通道，恶意代码可能会通过IPC发送危险命令，比如删除文件、执行系统命令等。

### 安全最佳实践

1. **最小权限原则**：只给应用最低限度的权限
2. **输入验证**：对所有用户输入进行检查和过滤
3. **日志记录**：记录所有重要操作，便于安全审计
4. **定期更新**：及时更新Electron和依赖库的版本
5. **代码审查**：定期检查代码中的安全隐患

---

## 问题1：麦克风无法访问

### 问题现象

点击麦克风按钮时，控制台报错：
```
TypeError: Cannot read properties of undefined (reading 'getUserMedia')
```

### 原因分析

这是一个**安全限制**问题。Electron应用使用 `app://` 协议，但这个协议不被浏览器视为"安全上下文"，导致 `navigator.mediaDevices` 无法使用。

简单来说：浏览器不信任这个协议，不让它访问麦克风。

### 修复方案

**思路**：让主进程（Node.js）来处理录音，渲染进程通过 IPC 调用主进程的录音功能。

**修改的文件**：

1. **preload.js** - 暴露录音API给渲染进程：
```javascript
contextBridge.exposeInMainWorld('voiceAPI', {
startRecording: () => ipcRenderer.invoke('start-recording'),
stopRecording: () => ipcRenderer.invoke('stop-recording'),
checkRecording: () => ipcRenderer.invoke('check-recording')
});
```

2. **main.js** - 实现录音IPC处理器：
```javascript
ipcMain.handle('start-recording', async () => {
const tempDir = os.tmpdir();
const recordingFilePath = path.join(tempDir, `voice_${Date.now()}.wav`);
const scriptPath = path.join(__dirname, 'record_audio.py');

return new Promise((resolve) => {
    const proc = spawn(getPythonExe(app.isPackaged, __dirname), [scriptPath, recordingFilePath], {
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    proc.on('close', (code) => {
    if (code === 0 && fs.existsSync(recordingFilePath)) {
        resolve({ success: true, filePath: recordingFilePath });
    } else {
        resolve({ success: false, error: code !== 0 ? `录音进程异常退出 (${code})` : '录音文件未生成' });
    }
    });
});
});
```

3. **record_audio.py** - 创建Python录音脚本：
```python
import sounddevice as sd
import sys

RATE = 16000
CHANNELS = 1
RECORD_DURATION = 5

def record(output_path):
frames = []
def callback(indata, frames_count, time_info, status):
    frames.append(indata.copy())

with sd.InputStream(samplerate=RATE, channels=CHANNELS, dtype='int16', callback=callback):
    sd.sleep(RECORD_DURATION * 1000)

# 保存文件
import wave
wf = wave.open(output_path, 'wb')
wf.setnchannels(CHANNELS)
wf.setsampwidth(2)  # int16 = 2 bytes
wf.setframerate(RATE)
wf.writeframes(b''.join(frames))
wf.close()

if __name__ == '__main__':
if len(sys.argv) >= 2:
    record(sys.argv[1])
```

---

## 问题2：录音文件未生成

### 问题现象

录音完成后，报错：`录音文件未生成`

### 原因分析

有两个可能的原因：
1. **Python脚本路径错误** - 找不到 record_audio.py 文件
2. **缺少音频库** - Python没有安装 sounddevice 或 pyaudio

### 修复方案

**步骤1：检查并修复脚本路径**
```javascript
// main.js 中确保路径正确
const scriptPath = path.join(__dirname, 'record_audio.py');

// 添加文件存在性检查
if (!fs.existsSync(scriptPath)) {
return { success: false, error: '录音脚本未找到' };
}
```

**步骤2：安装 sounddevice 库**
打开命令提示符（CMD），运行：
```
e:\GirlPet\v2\python_portable\python.exe -m pip install sounddevice
```

---

## 问题3：Express模块缺失

### 问题现象

启动应用时报错：
```
Cannot find module 'express'
```

### 原因分析

项目代码使用了 Express.js 框架，但没有安装这个依赖包。

### 修复方案

**方案A：安装Express（不推荐）**
```
npm install express
```

**方案B：使用纯Node.js（推荐）**
修改 `main.js`，用 Node.js 内置的 `http` 模块替代 Express：

```javascript
const http = require('http');
const url = require('url');

function startHttpServer() {
httpServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
    }

    const parsedUrl = url.parse(req.url);
    
    if (parsedUrl.pathname === '/mobile') {
    // 返回移动端页面
    }
    
    res.writeHead(404);
    res.end('Not found');
}).listen(8080, '0.0.0.0', () => {
    console.log('[HTTP] 服务已启动: http://0.0.0.0:8080');
});
}
```

---

## 问题4：Preload脚本加载失败

### 问题现象

启动时报错：
```
Unable to load preload script: E:\GirlPet\v2\preload.js
Error: module not found: path
```

### 原因分析

在 Electron 的 sandbox 模式下，preload.js 不能直接使用 Node.js 的核心模块（如 `path`、`fs`、`os`）。

### 修复方案

**思路**：所有文件操作通过 IPC 委托给主进程处理。

**修改 preload.js**：
```javascript
// 暴露给渲染进程的API
contextBridge.exposeInMainWorld('electronAPI', {
// 文件操作（通过IPC调用主进程）
fsExistsSync(filePath) {
    return ipcRenderer.sendSync('fs-exists', filePath);
},

fsReadFileSync(filePath, encoding) {
    return ipcRenderer.sendSync('fs-read', filePath, encoding);
},

fsWriteFileSync(filePath, data, encoding) {
    return ipcRenderer.sendSync('fs-write', filePath, data, encoding);
},

// 路径工具
pathJoin: (...args) => ipcRenderer.sendSync('path-join', args),
pathBasename: (filePath, ext) => ipcRenderer.sendSync('path-basename', filePath, ext),

// 系统信息
tmpdir: () => ipcRenderer.sendSync('os-tmpdir'),
homedir: () => ipcRenderer.sendSync('os-homedir'),
});
```

**修改 main.js**（添加IPC处理器）：
```javascript
// 同步IPC处理器 - 使用 ipcMain.on + event.returnValue
ipcMain.on('path-join', (event, args) => {
event.returnValue = path.join(...args);
});

ipcMain.on('os-tmpdir', (event) => {
event.returnValue = os.tmpdir();
});

ipcMain.on('fs-exists', (event, filePath) => {
event.returnValue = fs.existsSync(filePath);
});
```

> **为什么用 sendSync 而不是 invoke？**
> 
> 因为 `storage.js` 等模块使用的是同步 API（如 `fs.existsSync`），如果改成异步会导致整个模块崩溃。

---

## 问题5：资源文件加载失败

### 问题现象

控制台显示多个资源加载失败：
```
Failed to load resource: net::ERR_FILE_NOT_FOUND
```

### 原因分析

自定义协议处理函数错误地将 `index.html/` 当作路径的一部分。

例如，请求 `app://index.html/images/idle.gif` 被解析成了错误的路径。

### 修复方案

修改 `main.js` 中的协议处理函数：

```javascript
protocol.registerFileProtocol('app', (request, callback) => {
let url = request.url.replace('app://', '');

// 移除 index.html/ 前缀
if (url.startsWith('index.html/')) {
    url = url.substring('index.html/'.length);
}

const filePath = path.join(__dirname, url);

// 安全检查：防止路径遍历攻击
if (filePath.includes('..')) {
    callback({ error: -6 });
    return;
}

if (!fs.existsSync(filePath)) {
    callback({ error: -6 });
    return;
}

callback({ path: filePath });
});
```

---

## 问题6：眼睛按钮无法移动窗口

### 问题现象

拖动右下角的眼睛按钮时，窗口不会移动。

### 原因分析

眼睛按钮的拖拽逻辑在 `index.html` 中实现，但 `main.js` 中缺少对应的 IPC 处理器。

### 修复方案

在 `main.js` 中添加 `move-window` 的 IPC 处理器：

```javascript
ipcMain.on('move-window', (event, deltaX, deltaY) => {
if (!win) return;
const [currentX, currentY] = win.getPosition();
win.setPosition(currentX + deltaX, currentY + deltaY);
});
```

**工作原理**：
1. 用户拖动眼睛按钮时，`index.html` 中的 JavaScript 计算出鼠标移动的距离（deltaX, deltaY）
2. 通过 IPC 发送 `move-window` 消息给主进程
3. 主进程调用 `win.setPosition()` 移动窗口

---

## 问题7：PPT生成失败

### 问题现象

点击生成PPT后，报错：
```
AI 返回的数据结构异常，无法解析为幻灯片列表
```

### 原因分析

这是一个**接口语义不匹配**的问题：

| 调用方（actions.js） | 实际实现（main.js） |
|---------------------|---------------------|
| 期望传入 `{topic, ollamaUrl}` | 期望接收 `{templatePath, content}` |
| 期望返回幻灯片数组 | 实际返回文件路径 |

简单说：调用方想要苹果，但实现方给了香蕉。

### 修复方案

修改 `main.js` 中的 handler：

```javascript
// 1. 生成PPT内容（调用AI）
ipcMain.handle('generate-ppt-content', async (event, { topic, ollamaUrl }) => {
try {
    // 调用专门的PPT生成模块
    const { generatePPTContent } = require('./src/main/pptGenerator');
    const slides = await generatePPTContent(topic, ollamaUrl);
    return slides;  // 返回幻灯片数组
} catch (err) {
    console.error('[PPT] 生成内容失败:', err);
    // 返回保底数据，避免崩溃
    return [{ title: topic, body: '生成失败', points: ['检查网络', '重试'] }];
}
});

// 2. 填充PPT模板
ipcMain.handle('fill-ppt-template', async (event, { templatePath, topic, slides }) => {
try {
    const { fillPPTTemplate } = require('./src/main/pptGenerator');
    const outputPath = await fillPPTTemplate(templatePath, topic, slides, app.isPackaged, __dirname);
    return outputPath;
} catch (err) {
    throw new Error('PPT生成失败: ' + err.message);
}
});
```

**正确的PPT生成流程**：
1. `actions.js` 调用 `generate-ppt-content` → 获取AI生成的幻灯片数据
2. `actions.js` 调用 `fill-ppt-template` → 将数据填充到模板生成PPT文件

---

## 问题8：缺少文件选择功能

### 问题现象

调用文件选择功能时报错：
```
No handler registered for 'select-ppt-file'
```

### 原因分析

`preload.js` 中声明了 `select-ppt-file` 和 `select-ppt-template` 通道，但 `main.js` 中没有实现对应的 handler。

### 修复方案

在 `main.js` 中添加文件选择的 IPC 处理器：

```javascript
// 需要先引入 dialog 模块
const { dialog } = require('electron');

// 选择PPT模板
ipcMain.handle('select-ppt-template', async () => {
const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'PPT模板', extensions: ['pptx'] }],
    defaultPath: path.join(os.homedir(), '.girlpet_templates')
});

if (result.canceled || !result.filePaths.length) {
    return { success: false, error: '用户取消选择' };
}

return { success: true, path: result.filePaths[0] };
});

// 选择PPT文件
ipcMain.handle('select-ppt-file', async () => {
const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'PPT文件', extensions: ['pptx'] }]
});

if (result.canceled || !result.filePaths.length) {
    return { success: false, error: '用户取消选择' };
}

return { success: true, path: result.filePaths[0] };
});
```

---

## 总结：常见问题排查清单

| 问题现象 | 可能原因 | 排查步骤 |
|---------|---------|---------|
| 麦克风无法使用 | sandbox限制 | 检查preload.js是否正确暴露voiceAPI |
| 录音失败 | Python库缺失 | 运行 `python -c "import sounddevice"` |
| 资源加载失败 | 协议处理错误 | 检查控制台的文件路径输出 |
| 按钮点击无反应 | 事件监听失效 | 在事件处理函数中加 `console.log` |
| 控制台打不开 | DevTools未开启 | 在createWindow中添加 `win.webContents.openDevTools()` |
| 眼睛按钮消失 | CSS样式问题 | 控制台执行 `document.getElementById('toggleVisibilityBtn').style.display = 'block'` |
| PPT生成失败 | Ollama未启动 | 访问 `http://localhost:11434/api/tags` |

---

## 工具推荐

如果你遇到问题，可以使用以下工具排查：

1. **开发者工具**：按 F12 打开，查看 Console 面板的错误信息
2. **终端日志**：启动应用时的终端会输出详细日志
3. **文件检查**：确保所有 `.js`、`.py` 文件都存在

---

## 联系我们

如果遇到无法解决的问题，可以：
1. 查看控制台的错误信息
2. 检查终端日志
3. 确保所有依赖都已安装

---

*文档版本：v1.0*  
*最后更新：2026年5月27日*