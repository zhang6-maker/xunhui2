# 快速入门指南

## 🎯 5分钟快速开始

### 第一步：安装依赖

```bash
cd voice-assistant
npm install
```

### 第二步：下载Vosk模型

1. 访问：https://alphacephei.com/vosk/models
2. 下载中文模型（推荐：`vosk-model-small-cn-0.22`）
3. 解压到 `model/` 目录

### 第三步：启动应用

**Windows:**
```bash
start.bat
```

**Mac/Linux:**
```bash
chmod +x start.sh
./start.sh
```

或直接运行：
```bash
npm start
```

### 第四步：测试语音识别

1. 点击界面上的"开始识别"按钮
2. 对着麦克风说："你好"
3. 查看识别结果

### 第五步：测试WebSocket客户端

打开新终端，运行：
```bash
node example-client.js
```

然后对着麦克风说：
- "你好" → 会回复"你好！我是你的语音助手"
- "时间" → 会播报当前时间
- "天气" → 会播报天气信息

## 📋 常用命令

| 命令 | 说明 |
|------|------|
| `npm install` | 安装依赖 |
| `npm start` | 启动应用 |
| `node example-client.js` | 运行示例客户端 |

## 🎤 语音命令

| 命令 | 功能 |
|------|------|
| "你好" | 问候 |
| "时间" | 播报时间 |
| "天气" | 播报天气 |
| "开始" | 开始识别 |
| "停止" | 停止识别 |

## 🔧 自定义开发

### 修改WebSocket端口

编辑 `main.js`：
```javascript
const PORT = 8080; // 改为你需要的端口
```

### 添加自定义命令

编辑 `example-client.js`：
```javascript
client.on('voice_result', (text) => {
  if (text.includes('你的自定义命令')) {
    // 执行你的逻辑
    client.sendTTS('回复内容');
  }
});
```

### 集成AI服务

```javascript
client.on('voice_result', async (text) => {
  // 调用AI API
  const response = await callAIAPI(text);
  client.sendTTS(response);
});
```

## ❓ 遇到问题？

1. **Vosk模型加载失败**
   - 确保模型已下载到 `model/` 目录
   - 检查目录结构是否正确

2. **麦克风权限被拒绝**
   - 在系统设置中允许麦克风权限
   - 检查是否有其他应用占用麦克风

3. **WebSocket连接失败**
   - 确保主应用正在运行
   - 检查端口8080是否被占用

## 📚 更多文档

详细文档请查看 [README.md](README.md)
