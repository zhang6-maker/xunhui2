# 语音助手骨架项目

基于 Electron + Vosk + TTS + WebSocket 的语音助手完整骨架，可直接运行。

## 📋 项目结构

```
voice-assistant/
├── package.json           # 项目配置和依赖
├── main.js                # Electron主进程（WebSocket服务器）
├── index.html             # 主界面HTML
├── renderer.js            # 渲染进程逻辑（Vosk + TTS）
├── client.js              # WebSocket客户端类
├── example-client.js      # 客户端使用示例
├── model/                 # Vosk模型目录（需下载）
└── README.md              # 本文档
```

## 🚀 快速开始

### 1. 安装依赖

```bash
cd voice-assistant
npm install
```

### 2. 下载Vosk模型

访问 [Vosk Models](https://alphacephei.com/vosk/models) 下载中文模型：

推荐下载：
- `vosk-model-small-cn-0.22` (约40MB，适合快速测试)
- `vosk-model-cn-0.22` (约1.2GB，识别率更高)

下载后解压到 `model/` 目录，确保目录结构如下：
```
voice-assistant/
└── model/
    ├── am/
    ├── graph/
    ├── README
    └── ...
```

### 3. 启动应用

```bash
npm start
```

## 📖 功能说明

### 核心功能

1. **语音识别 (Vosk)**
   - 支持中文语音识别
   - 实时音频处理
   - 可配置识别参数

2. **语音合成 (TTS)**
   - 使用浏览器内置TTS引擎
   - 支持中文语音合成
   - 可调节语速和音调

3. **WebSocket通信**
   - 主进程运行WebSocket服务器（端口8080）
   - 支持多客户端连接
   - 实时双向通信

4. **可视化界面**
   - 实时音频波形显示
   - 状态监控（WebSocket、麦克风、Vosk）
   - 日志输出

### WebSocket消息协议

#### 客户端 → 服务器

```javascript
// 语音识别结果
{
  "type": "voice",
  "text": "识别到的文本"
}

// TTS播放请求
{
  "type": "tts",
  "text": "要播放的文本"
}

// 命令
{
  "type": "command",
  "command": "start_listening" | "stop_listening"
}
```

#### 服务器 → 客户端

```javascript
// 语音识别结果广播
{
  "type": "voice_result",
  "text": "识别到的文本",
  "timestamp": 1234567890
}

// TTS播放完成
{
  "type": "tts_finished",
  "timestamp": 1234567890
}
```

## 💻 使用示例

### 1. 启动主应用

```bash
npm start
```

### 2. 使用WebSocket客户端

```bash
node example-client.js
```

### 3. 自定义客户端

```javascript
const VoiceAssistantClient = require('./client');

const client = new VoiceAssistantClient('ws://localhost:8080');

client.on('connected', () => {
  console.log('已连接');
});

client.on('voice_result', (text) => {
  console.log('识别结果:', text);
  
  // 根据识别结果执行相应操作
  if (text.includes('你好')) {
    client.sendTTS('你好！');
  }
});

client.connect();
```

## 🔧 配置说明

### WebSocket端口

在 `main.js` 中修改：

```javascript
const PORT = 8080; // 修改为你需要的端口
```

### 音频采样率

在 `renderer.js` 中修改：

```javascript
mediaStream = await navigator.mediaDevices.getUserMedia({ 
  audio: {
    sampleRate: 16000, // 采样率（Hz）
    channelCount: 1    // 声道数
  }
});
```

### Vosk模型路径

在 `renderer.js` 中修改：

```javascript
const modelPath = path.join(__dirname, 'model');
```

## 🎯 界面操作

### 开始/停止语音识别

1. 点击"开始识别"按钮启动麦克风
2. 对着麦克风说话
3. 识别结果会实时显示在界面上
4. 点击"停止识别"按钮关闭麦克风

### 查看日志

左侧面板显示所有操作日志：
- 蓝色：信息日志
- 绿色：成功日志
- 红色：错误日志

### 状态监控

顶部状态栏显示：
- WebSocket连接状态
- 麦克风状态
- Vosk模型加载状态

## 🐛 常见问题

### 1. Vosk模型加载失败

**问题**：显示"Vosk模型不存在"

**解决**：
- 确保已下载Vosk模型
- 将模型解压到 `model/` 目录
- 检查目录结构是否正确

### 2. 麦克风权限被拒绝

**问题**：显示"开始语音识别失败"

**解决**：
- 检查浏览器/应用是否允许麦克风权限
- 在系统设置中启用麦克风权限
- 尝试使用其他麦克风设备

### 3. WebSocket连接失败

**问题**：显示"WebSocket连接错误"

**解决**：
- 确保主应用正在运行
- 检查端口8080是否被占用
- 检查防火墙设置

### 4. 识别率低

**问题**：语音识别不准确

**解决**：
- 使用更大的Vosk模型（如 `vosk-model-cn-0.22`）
- 确保环境安静，减少背景噪音
- 调整麦克风位置和音量

## 📝 扩展开发

### 添加自定义命令

在 `example-client.js` 中添加：

```javascript
client.on('voice_result', (text) => {
  if (text.includes('自定义命令')) {
    // 执行你的自定义逻辑
    client.sendTTS('执行自定义命令');
  }
});
```

### 集成其他AI服务

```javascript
client.on('voice_result', async (text) => {
  // 调用OpenAI API
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_API_KEY'
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: text }]
    })
  });
  
  const data = await response.json();
  client.sendTTS(data.choices[0].message.content);
});
```

### 添加更多TTS引擎

```javascript
function speakText(text) {
  // 使用浏览器TTS
  const utterance = new SpeechSynthesisUtterance(text);
  window.speechSynthesis.speak(utterance);
  
  // 或使用其他TTS服务
  // 例如：百度TTS、阿里云TTS等
}
```

## 📚 技术栈

- **Electron**: 跨平台桌面应用框架
- **Vosk**: 离线语音识别引擎
- **WebSocket**: 实时双向通信
- **Web Audio API**: 音频处理
- **Speech Synthesis API**: 语音合成

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 📧 联系方式

如有问题，请提交Issue。
