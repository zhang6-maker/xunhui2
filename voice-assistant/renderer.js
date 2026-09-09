const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

let ws = null;
let voskModel = null;
let recognizer = null;
let audioContext = null;
let mediaStream = null;
let scriptProcessor = null;
let isListening = false;
let wsConnected = false;

// 动态获取当前访问地址
const WS_URL = `ws://${window.location.host}`;

function init() {
  initWaveVisualizer();
  initWebSocket();
  initVosk();
  setupIPCListeners();
}

function initWebSocket() {
  try {
    ws = new WebSocket(WS_URL);
    
    ws.onopen = () => {
      wsConnected = true;
      updateStatus('ws', true);
      addLog('WebSocket连接成功', 'success');
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      } catch (error) {
        console.error('解析WebSocket消息失败:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket错误:', error);
      addLog('WebSocket连接错误', 'error');
    };
    
    ws.onclose = () => {
      wsConnected = false;
      updateStatus('ws', false);
      addLog('WebSocket连接断开', 'info');
      
      setTimeout(initWebSocket, 3000);
    };
  } catch (error) {
    console.error('初始化WebSocket失败:', error);
    addLog('WebSocket初始化失败: ' + error.message, 'error');
  }
}

function handleWebSocketMessage(data) {
  switch (data.type) {
    case 'voice_result':
      updateResultText(data.text);
      addLog('识别结果: ' + data.text, 'success');
      break;
      
    case 'tts_play':
      speakText(data.text);
      break;
      
    case 'tts_finished':
      addLog('TTS播放完成', 'info');
      break;
      
    default:
      console.log('未知消息类型:', data.type);
  }
}

async function initVosk() {
  try {
    const { Model } = require('vosk');
    
    const modelPath = path.join(__dirname, 'model');
    
    if (!fs.existsSync(modelPath)) {
      addLog('Vosk模型不存在，请下载模型到 model 目录', 'error');
      addLog('下载地址: https://alphacephei.com/vosk/models', 'info');
      return;
    }
    
    voskModel = new Model(modelPath);
    updateStatus('vosk', true);
    addLog('Vosk模型加载成功', 'success');
  } catch (error) {
    console.error('初始化Vosk失败:', error);
    addLog('Vosk初始化失败: ' + error.message, 'error');
  }
}

async function startListening() {
  if (isListening) return;
  
  try {
    if (!voskModel) {
      addLog('Vosk模型未加载，无法开始识别', 'error');
      return;
    }
    
    mediaStream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        sampleRate: 16000,
        channelCount: 1
      }
    });
    
    audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 16000
    });
    
    const source = audioContext.createMediaStreamSource(mediaStream);
    scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
    
    recognizer = new voskModel.KaldiRecognizer(16000);
    
    scriptProcessor.onaudioprocess = (event) => {
      const inputData = event.inputBuffer.getChannelData(0);
      
      if (recognizer.acceptWaveform(inputData)) {
        const result = JSON.parse(recognizer.result());
        if (result.text) {
          processVoiceResult(result.text);
        }
      }
      
      updateWaveVisualizer(inputData);
    };
    
    source.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination);
    
    isListening = true;
    updateStatus('mic', true);
    updateButtons(true);
    addLog('开始语音识别', 'success');
    
    sendWebSocketMessage({ type: 'command', command: 'start_listening' });
  } catch (error) {
    console.error('开始语音识别失败:', error);
    addLog('开始语音识别失败: ' + error.message, 'error');
  }
}

function stopListening() {
  if (!isListening) return;
  
  try {
    if (scriptProcessor) {
      scriptProcessor.disconnect();
      scriptProcessor = null;
    }
    
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
    
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }
    
    if (recognizer) {
      recognizer.free();
      recognizer = null;
    }
    
    isListening = false;
    updateStatus('mic', false);
    updateButtons(false);
    resetWaveVisualizer();
    addLog('停止语音识别', 'info');
    
    sendWebSocketMessage({ type: 'command', command: 'stop_listening' });
  } catch (error) {
    console.error('停止语音识别失败:', error);
    addLog('停止语音识别失败: ' + error.message, 'error');
  }
}

function processVoiceResult(text) {
  if (!text || text.trim() === '') return;
  
  ipcRenderer.send('voice-result', text);
  
  if (wsConnected) {
    sendWebSocketMessage({ type: 'voice', text: text });
  }
}

function speakText(text) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  
  utterance.onstart = () => {
    addLog('开始TTS播放: ' + text, 'info');
  };
  
  utterance.onend = () => {
    ipcRenderer.send('tts-finished');
  };
  
  utterance.onerror = (error) => {
    console.error('TTS错误:', error);
    addLog('TTS播放失败: ' + error.error, 'error');
  };
  
  window.speechSynthesis.speak(utterance);
}

function sendWebSocketMessage(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function setupIPCListeners() {
  ipcRenderer.on('start-listening', () => {
    if (!isListening) {
      startListening();
    }
  });
  
  ipcRenderer.on('stop-listening', () => {
    if (isListening) {
      stopListening();
    }
  });
  
  ipcRenderer.on('tts-play', (event, text) => {
    speakText(text);
  });
}

function initWaveVisualizer() {
  const container = document.getElementById('waveContainer');
  container.innerHTML = '';
  
  for (let i = 0; i < 30; i++) {
    const bar = document.createElement('div');
    bar.className = 'wave-bar';
    bar.style.height = '5px';
    container.appendChild(bar);
  }
}

function updateWaveVisualizer(audioData) {
  if (!isListening) return;
  
  const bars = document.querySelectorAll('.wave-bar');
  const step = Math.floor(audioData.length / bars.length);
  
  bars.forEach((bar, index) => {
    const value = Math.abs(audioData[index * step]);
    const height = Math.max(5, Math.min(60, value * 60));
    bar.style.height = height + 'px';
  });
}

function resetWaveVisualizer() {
  const bars = document.querySelectorAll('.wave-bar');
  bars.forEach(bar => {
    bar.style.height = '5px';
  });
}

function updateStatus(type, active) {
  const dot = document.getElementById(type + 'Status');
  const text = document.getElementById(type + 'StatusText');
  
  if (active) {
    dot.classList.add('active');
    text.textContent = type === 'ws' ? '已连接' : type === 'mic' ? '运行中' : '已加载';
  } else {
    dot.classList.remove('active');
    text.textContent = type === 'ws' ? '未连接' : type === 'mic' ? '未启动' : '未加载';
  }
}

function updateButtons(listening) {
  document.getElementById('startBtn').disabled = listening;
  document.getElementById('stopBtn').disabled = !listening;
}

function updateResultText(text) {
  document.getElementById('resultText').textContent = text || '等待语音输入...';
}

function addLog(message, type = 'info') {
  const container = document.getElementById('logContainer');
  const logItem = document.createElement('div');
  logItem.className = `log-item ${type}`;
  
  const time = new Date().toLocaleTimeString();
  logItem.innerHTML = `<span class="log-time">[${time}]</span>${message}`;
  
  container.appendChild(logItem);
  container.scrollTop = container.scrollHeight;
}

window.addEventListener('DOMContentLoaded', init);
