const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const WebSocket = require('ws');
const fs = require('fs');

let mainWindow;
let wsServer;
let wsClients = new Set();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    }
  });

  mainWindow.loadFile('index.html');
  
  if (process.env.NODE_ENV === 'dev') {
    mainWindow.webContents.openDevTools();
  }
}

function startWebSocketServer() {
  const PORT = 8080;
  wsServer = new WebSocket.Server({ port: PORT });
  
  console.log(`WebSocket服务器已启动，监听端口: ${PORT}`);
  
  wsServer.on('connection', (ws) => {
    console.log('新的WebSocket客户端连接');
    wsClients.add(ws);
    
    ws.on('message', (message) => {
      console.log('收到消息:', message.toString());
      
      try {
        const data = JSON.parse(message);
        handleWebSocketMessage(ws, data);
      } catch (error) {
        console.error('解析消息失败:', error);
      }
    });
    
    ws.on('close', () => {
      console.log('WebSocket客户端断开连接');
      wsClients.delete(ws);
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket错误:', error);
      wsClients.delete(ws);
    });
  });
}

function handleWebSocketMessage(ws, data) {
  switch (data.type) {
    case 'voice':
      broadcastToAll({
        type: 'voice_result',
        text: data.text,
        timestamp: Date.now()
      });
      break;
      
    case 'tts':
      mainWindow?.webContents.send('tts-play', data.text);
      break;
      
    case 'command':
      handleCommand(data.command, ws);
      break;
      
    default:
      console.log('未知消息类型:', data.type);
  }
}

function handleCommand(command, ws) {
  console.log('执行命令:', command);
  
  switch (command) {
    case 'start_listening':
      mainWindow?.webContents.send('start-listening');
      break;
      
    case 'stop_listening':
      mainWindow?.webContents.send('stop-listening');
      break;
      
    default:
      console.log('未知命令:', command);
  }
}

function broadcastToAll(data) {
  const message = JSON.stringify(data);
  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  startWebSocketServer();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.on('voice-result', (event, text) => {
  broadcastToAll({
    type: 'voice_result',
    text: text,
    timestamp: Date.now()
  });
});

ipcMain.on('tts-finished', (event) => {
  broadcastToAll({
    type: 'tts_finished',
    timestamp: Date.now()
  });
});
