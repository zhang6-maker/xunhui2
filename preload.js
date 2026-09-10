/**
 * preload.js - 安全预加载脚本
 *
 * 重要：使用 sendSync 保持同步语义，确保 storage.js 等模块正常工作
 */

const { contextBridge, ipcRenderer } = require('electron');

// ==================== IPC 通道白名单 ====================
const ALLOWED_INVOKE_CHANNELS = new Set([
  // 已移除：PPT 模板/生成相关通道(get-templates / save-template / delete-template /
  // select-best-template / generate-ppt-content / fill-ppt-template /
  // select-ppt-template / select-ppt-file) 与音乐搜索通道(search-and-play-song)
  'get-user-data-path',
  'transcribe-audio',
  'shell-open-external',
  'os-totalmem',
  'os-freemem',
  'fs-writeFile',
  'mailbox-ensure',
  'get-remote-url',
  'start-recording',
  'stop-recording',
  'check-recording',
  'get-window-position',
  'capture-screen',
  'pick-file'
]);

const ALLOWED_SEND_CHANNELS = new Set([
  'open-gomoku',
  'open-checkers',
  'close-gomoku',
  'close-checkers',
  'game-result',
  'toggle-visibility',
  'reply-to-mobile',
  'move-window'
]);

const ALLOWED_ON_CHANNELS = new Set([
  'mobile-command',
  'game-result',
  'force-show-girl'
]);

// ==================== 暴露安全 API ====================
contextBridge.exposeInMainWorld('electronAPI', {

  // ---------- IPC ----------
  invoke(channel, ...args) {
    if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
      return Promise.reject(new Error(`[preload] 不允许的 invoke 通道: ${channel}`));
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  // 截图：返回当前主屏 PNG 的 base64
  captureScreen: () => ipcRenderer.invoke('capture-screen'),

  // 文件选择 + 抽取：返回附件数组 [{name,kind,ext,base64?/text?/error?}]
  pickFile: () => ipcRenderer.invoke('pick-file'),

  send(channel, ...args) {
    if (!ALLOWED_SEND_CHANNELS.has(channel)) {
      console.warn(`[preload] 不允许的 send 通道: ${channel}`);
      return;
    }
    ipcRenderer.send(channel, ...args);
  },

  on(channel, callback) {
    if (!ALLOWED_ON_CHANNELS.has(channel)) {
      console.warn(`[preload] 不允许的 on 通道: ${channel}`);
      return;
    }
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  },

  removeAllListeners(channel) {
    ipcRenderer.removeAllListeners(channel);
  },

  // ---------- 路径工具（使用 sendSync 保持同步语义） ----------
  pathJoin: (...args) => ipcRenderer.sendSync('path-join', args),
  pathBasename: (filePath, ext) => ipcRenderer.sendSync('path-basename', filePath, ext),

  // ---------- 系统信息（使用 sendSync 保持同步语义） ----------
  tmpdir: () => ipcRenderer.sendSync('os-tmpdir'),
  homedir: () => ipcRenderer.sendSync('os-homedir'),

  // ---------- 文件操作（使用 sendSync 保持同步语义） ----------
  fsExistsSync(filePath) {
    return ipcRenderer.sendSync('fs-exists', filePath);
  },

  fsReadFileSync(filePath, encoding) {
    return ipcRenderer.sendSync('fs-read', filePath, encoding);
  },

  fsWriteFileSync(filePath, data, encoding) {
    return ipcRenderer.sendSync('fs-write', filePath, data, encoding);
  },

  fsAppendFileSync(filePath, data, encoding) {
    return ipcRenderer.sendSync('fs-append', filePath, data, encoding);
  },

  // ---------- 传话信箱（便携版新增） ----------
  fsReaddirSync(dirPath) {
    return ipcRenderer.sendSync('fs-readdir', dirPath);
  },

  mailboxEnsure: () => ipcRenderer.sendSync('mailbox-ensure')
  // 已移除：音乐搜索 searchSong（通道 search-and-play-song 随音乐功能删除）
});

// 安全增强
contextBridge.exposeInMainWorld('security', {
  getAccessToken: () => ipcRenderer.invoke('get-access-token')
});

// 语音输入 API
contextBridge.exposeInMainWorld('voiceAPI', {
  startRecording: () => ipcRenderer.invoke('start-recording'),
  stopRecording: () => ipcRenderer.invoke('stop-recording'),
  checkRecording: () => ipcRenderer.invoke('check-recording')
});
