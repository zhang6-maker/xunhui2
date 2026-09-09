/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  模块墓志铭
 * ═══════════════════════════════════════════════════════════════════════════
 * 模块名称: windowManager.js - 窗口管理模块
 * 模块职责: 创建和管理主应用窗口
 * 
 * 依赖模块:
 *   - path: 路径处理
 *   - electron.BrowserWindow: 窗口创建
 * 
 * 生命周期:
 *   - createWindow(screen, preloadPath): 创建主窗口并返回实例
 * 
 * 注意事项:
 *   - ✅ 需要传入 screen 和 preloadPath 参数
 *   - ⚠️ 绝不能操作 DOM，绝不能操作渲染进程逻辑
 *   - ⚠️ 返回的窗口实例由调用方管理生命周期
 * ═══════════════════════════════════════════════════════════════════════════
 */

const path = require('path');
const { BrowserWindow } = require('electron');

function createWindow(screen, preloadPath) {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const winWidth = 400, winHeight = 500;

  const win = new BrowserWindow({
    width: winWidth, height: winHeight,
    transparent: true, frame: false, alwaysOnTop: true,
    resizable: false, skipTaskbar: true, title: '寻慧 - 桌面小精灵',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      preload: preloadPath
    }
  });

  win.loadURL('app://index.html');
  win.setPosition(width - winWidth, height - winHeight);
  
  return win;
}

module.exports = { createWindow };
