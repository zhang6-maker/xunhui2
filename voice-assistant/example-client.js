const VoiceAssistantClient = require('./client');

const client = new VoiceAssistantClient('ws://localhost:8080');

client.on('connected', () => {
  console.log('🎉 客户端已连接到服务器');
});

client.on('disconnected', () => {
  console.log('😢 客户端已断开连接');
});

client.on('voice_result', (text) => {
  console.log('🎤 识别结果:', text);
  
  if (text.includes('你好')) {
    client.sendTTS('你好！我是你的语音助手');
  } else if (text.includes('时间')) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN');
    client.sendTTS(`现在是 ${timeStr}`);
  } else if (text.includes('天气')) {
    client.sendTTS('今天天气不错，适合出门');
  } else if (text.includes('停止')) {
    client.sendCommand('stop_listening');
  } else if (text.includes('开始')) {
    client.sendCommand('start_listening');
  }
});

client.on('tts_finished', () => {
  console.log('🔊 TTS播放完成');
});

client.on('error', (error) => {
  console.error('❌ 客户端错误:', error);
});

console.log('🚀 启动语音助手客户端...');
client.connect();

process.on('SIGINT', () => {
  console.log('\n👋 正在关闭客户端...');
  client.disconnect();
  process.exit(0);
});
