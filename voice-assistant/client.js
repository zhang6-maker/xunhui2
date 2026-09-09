const WebSocket = require('ws');

class VoiceAssistantClient {
  constructor(url = 'ws://localhost:8080') {
    this.url = url;
    this.ws = null;
    this.reconnectInterval = 3000;
    this.messageHandlers = {};
  }

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      console.log('✅ 已连接到语音助手服务器');
      this.emit('connected');
    });

    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        this.handleMessage(message);
      } catch (error) {
        console.error('解析消息失败:', error);
      }
    });

    this.ws.on('error', (error) => {
      console.error('❌ WebSocket错误:', error.message);
      this.emit('error', error);
    });

    this.ws.on('close', () => {
      console.log('🔌 连接已断开，3秒后重连...');
      this.emit('disconnected');
      setTimeout(() => this.connect(), this.reconnectInterval);
    });
  }

  handleMessage(message) {
    console.log('📨 收到消息:', message);

    switch (message.type) {
      case 'voice_result':
        this.emit('voice_result', message.text);
        break;

      case 'tts_finished':
        this.emit('tts_finished');
        break;

      default:
        console.log('未知消息类型:', message.type);
    }
  }

  sendTTS(text) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'tts',
        text: text
      }));
      console.log('🔊 发送TTS请求:', text);
    } else {
      console.error('❌ WebSocket未连接');
    }
  }

  sendCommand(command) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'command',
        command: command
      }));
      console.log('⚡ 发送命令:', command);
    } else {
      console.error('❌ WebSocket未连接');
    }
  }

  on(event, handler) {
    this.messageHandlers[event] = handler;
  }

  emit(event, data) {
    const handler = this.messageHandlers[event];
    if (handler) {
      handler(data);
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

module.exports = VoiceAssistantClient;
