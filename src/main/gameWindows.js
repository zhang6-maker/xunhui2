/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  模块墓志铭
 * ═══════════════════════════════════════════════════════════════════════════
 * 模块名称: gameWindows.js - 游戏窗口模块
 * 模块职责: 创建和管理五子棋、跳棋游戏窗口
 * 
 * 依赖模块:
 *   - path: 路径处理
 *   - electron.BrowserWindow: 窗口创建
 * 
 * 生命周期:
 *   - createGomokuWindow(preloadPath, dirname): 创建五子棋窗口
 *   - createCheckersWindow(preloadPath, dirname): 创建跳棋窗口
 *   - getGomokuWindow(): 获取五子棋窗口实例
 *   - getCheckersWindow(): 获取跳棋窗口实例
 * 
 * 注意事项:
 *   - ✅ 需要传入 preloadPath 和 dirname 参数
 *   - ⚠️ 绝不能操作 DOM，绝不能操作渲染进程逻辑
 *   - ⚠️ 内部维护窗口实例状态
 * ═══════════════════════════════════════════════════════════════════════════
 */

const path = require('path');
const { BrowserWindow } = require('electron');

let gomokuWindow = null;
let checkersWindow = null;

function createGomokuWindow(preloadPath, dirname) {
  if (gomokuWindow) { gomokuWindow.focus(); return; }
  gomokuWindow = new BrowserWindow({
    width: 340, height: 400, resizable: false, frame: true, title: '五子棋',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, webSecurity: true, preload: preloadPath }
  });
  gomokuWindow.loadURL('app://gomoku.html');
  gomokuWindow.on('closed', () => { gomokuWindow = null; });
}

function createCheckersWindow(preloadPath, dirname) {
  if (checkersWindow) { checkersWindow.focus(); return; }
  checkersWindow = new BrowserWindow({
    width: 400, height: 460, resizable: false, frame: true, title: '跳棋',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, webSecurity: true, preload: preloadPath }
  });
  checkersWindow.loadURL('app://checkers.html');
  checkersWindow.on('closed', () => { checkersWindow = null; });
}

function getGomokuWindow() {
  return gomokuWindow;
}

function getCheckersWindow() {
  return checkersWindow;
}

module.exports = { createGomokuWindow, createCheckersWindow, getGomokuWindow, getCheckersWindow };
