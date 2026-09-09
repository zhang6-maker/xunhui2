/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  模块墓志铭
 * ═══════════════════════════════════════════════════════════════════════════
 * 模块名称: deps.js - 依赖注入模块（安全版）
 * 模块职责: 提供跨环境的统一 API 访问（Electron / Browser）
 * 
 * 依赖模块:
 *   - 无外部依赖，直接通过 window.electronAPI 访问
 * 
 * 生命周期:
 *   - 本模块为纯静态，提供以下对象的引用:
 *     - ipcRenderer: Electron IPC 调用
 *     - shell: 外部链接打开
 *     - fs: 文件系统操作
 *     - path: 路径操作
 *     - os: 操作系统信息
 *     - girl: DOM 元素引用
 *   - 模块初始化时自动注入 window.DEPENDENCIES
 * 
 * 注意事项:
 *   - ⚠️ Electron 环境: API 来自 preload.js 的 window.electronAPI
 *   - ⚠️ 浏览器环境: 使用模拟对象（mocked APIs）
 *   - ⚠️ fs.existsSync 等同步方法在渲染进程受限，按需使用
 * ═══════════════════════════════════════════════════════════════════════════
 */

const ipcRenderer = {
  invoke: (channel, ...args) => window.electronAPI.invoke(channel, ...args),
  send:   (channel, ...args) => window.electronAPI.send(channel, ...args),
  on:     (channel, callback) => window.electronAPI.on(channel, callback),
  removeAllListeners: (channel) => window.electronAPI.removeAllListeners(channel)
};

const shell = {
  openExternal: (url) => window.electronAPI.invoke('shell-open-external', url)
};

const fs = {
  existsSync:    (filePath) => window.electronAPI.fsExistsSync(filePath),
  readFileSync:  (filePath, encoding) => window.electronAPI.fsReadFileSync(filePath, encoding),
  writeFileSync: (filePath, data, encoding) => window.electronAPI.fsWriteFileSync(filePath, data, encoding),
  appendFileSync:(filePath, data, encoding) => window.electronAPI.fsAppendFileSync(filePath, data, encoding),
  promises: {
    writeFile: (filePath, data) => window.electronAPI.invoke('fs-writeFile', filePath, data)
  }
};

const path = {
  join:     (...args) => window.electronAPI.pathJoin(...args),
  basename: (filePath, ext) => window.electronAPI.pathBasename(filePath, ext)
};

const os = {
  homedir: () => window.electronAPI.homedir(),
  tmpdir:  () => window.electronAPI.tmpdir(),
  totalmem: async () => await window.electronAPI.invoke('os-totalmem'),
  freemem:  async () => await window.electronAPI.invoke('os-freemem')
};

let _girl = null;
let _bubble = null;

window.DEPENDENCIES = {
  ipcRenderer,
  shell,
  fs,
  path,
  os,
  get PptxGenJS() { return window.PptxGenJS; },
  get girl()   { return _girl   || (_girl   = document.getElementById('girl')); },
  get bubble() { return _bubble || (_bubble = document.getElementById('bubble')); }
};
