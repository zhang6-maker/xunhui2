const { app, BrowserWindow, ipcMain, protocol, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');//作用：这行代码让你能在 Node.js 里执行外部系统命令
const os = require('os');
const http = require('http');
const url = require('url');
const WebSocket = require('ws');

// ==================== 模块引入 ====================
const { generatePPTContent, fillPPTTemplate } = require('./src/main/pptGenerator');
const { createWebSocketServer, getWss, setAccessToken, broadcast } = require('./src/main/websocketServer');

// ==================== 全局变量 ====================
let win = null;
let ACCESS_TOKEN = '';
let ttsProcess = null;
let httpServer = null;
let cleanupTimers = [];

// ==================== Python 工具函数 ====================
function getPythonExe(isPackaged, dirname) {
  if (isPackaged) {
    return path.join(process.resourcesPath, 'python_portable', 'python.exe');
  }
  return path.join(dirname, 'python_portable', 'python.exe');
}

// ==================== 手机遥控：鉴权与回执 ====================
function getLanIp() {
  const os = require('os');
  const ifaces = os.networkInterfaces();
  // 虚拟/隧道网卡名特征，必须排除（VirtualBox/VMware/Docker/Hyper-V/蓝牙/VPN/Tailscale 等）
  // 否则会返回 192.168.56.1 这类 host-only 虚拟地址，手机根本不在该网段 → 连不上
  const VIRTUAL = /virtualbox|vmware|vmnet|vethernet|hyper-?v|docker|loopback|bluetooth|isatap|teredo|\bvpn\b|tap-|tun-|zerotier|tailscale|utun|ppp/i;
  const candidates = [];
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name] || []) {
      if (net.family !== 'IPv4' || net.internal) continue;
      if (net.address.startsWith('169.254.')) continue; // 跳过 APIPA 链路本地地址
      const isVirtual = VIRTUAL.test(name) || VIRTUAL.test(net.mac || '');
      candidates.push({ name, address: net.address, virtual: isVirtual });
    }
  }
  // 物理网卡按优先级排序：WLAN/WiFi > 以太网 > 其他
  const score = (n) => {
    const s = n.toLowerCase();
    if (/wlan|wi-?fi|wireless/.test(s)) return 3;
    if (/ethernet|eth\d|本地连接|以太网/.test(s)) return 2;
    return 1;
  };
  const phys = candidates.filter(c => !c.virtual).sort((a, b) => score(b.name) - score(a.name));
  if (phys.length) return phys[0].address;
  if (candidates.length) return candidates[0].address; // 兜底：任意非 APIPA
  return '127.0.0.1';
}

function ensureAccessToken() {
  if (!ACCESS_TOKEN) {
    ACCESS_TOKEN = require('crypto').randomBytes(16).toString('hex');
    setAccessToken(ACCESS_TOKEN);
    console.log('[SECURITY] 遥控访问令牌已生成');
  }
  return ACCESS_TOKEN;
}

// 渲染进程 -> 手机（寻慧的回复广播给所有遥控端）
ipcMain.on('reply-to-mobile', (event, text) => {
  try {
    broadcast({ type: 'reply', text: text == null ? '' : String(text) });
  } catch (e) {
    console.error('[MOBILE] 广播失败:', e);
  }
});

// 桌面端「手机遥控」按钮：实时返回扫码连接地址（DHCP 换 IP 也不怕）
ipcMain.handle('get-remote-url', () => {
  return 'http://' + getLanIp() + ':8080/mobile';
});

// ==================== 窗口管理 ====================
function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const winWidth = 320;
  const winHeight = 450;

  win = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: width - winWidth - 20,
    y: height - winHeight - 100,
    frame: false,
    resizable: false,
    transparent: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      devTools: true
    }
  });

  // 双保险1：运行期显式禁止拉伸/最大化（透明无边框窗口在部分系统上 resizable:false 仍可能被角部拉伸）
  try { win.setResizable(false); win.setMaximizable(false); } catch (e) {}

  // 双保险2：物理熔断 —— 任何让窗口变成非原始尺寸（半屏/全屏/被拉伸）的路径，立刻拉回 320x450
  // 透明无边框窗口在部分 Windows 上，拖到屏幕边缘松手仍会被 DWM 的 Aero Snap 接管，
  // resizable:false 挡不住，所以在这里硬拉回，确保“半个屏幕”在物理上不可能出现。
  const lockWindowSize = () => {
    if (!win) return;
    const [w, h] = win.getSize();
    if (w === winWidth && h === winHeight) return;
    try {
      win.setResizable(true);
      const [px, py] = win.getPosition();
      win.setBounds({ x: px, y: py, width: winWidth, height: winHeight });
      win.setResizable(false);
    } catch (e) {}
  };
  win.on('maximize', () => { try { win.unmaximize(); } catch (e) {} lockWindowSize(); });
  win.on('restore', lockWindowSize);
  win.on('resize', lockWindowSize);

  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log('[RENDER]', message);
  });
  win.webContents.on('render-process-gone', (event, details) => {
    console.log('[RENDER-GONE]', JSON.stringify(details));
  });
  win.webContents.on('did-fail-load', (event, code, desc) => {
    console.log('[FAIL-LOAD]', code, desc);
  });

  win.loadURL('app://index.html');
  // 不再自动打开开发者工具（每次启动都要手动关，很烦）
  // 需要调试时：把下面这行的注释去掉，或在窗口里按 Ctrl+Shift+I / F12 手动打开
  // win.webContents.openDevTools();

  win.on('closed', () => {
    win = null;
  });
}

// ==================== 自定义协议处理 ====================
function registerProtocol() {
  console.log('[PROTOCOL] __dirname:', __dirname);

  protocol.registerFileProtocol('app', (request, callback) => {
    let url = request.url.replace('app://', '');
    const queryIndex = url.indexOf('?');
    if (queryIndex !== -1) {
      url = url.substring(0, queryIndex);
    }

    if (url.startsWith('index.html/')) {
      url = url.substring('index.html/'.length);
    }

    const filePath = path.join(__dirname, url);
    console.log('[PROTOCOL] 请求:', request.url, '→ 文件路径:', filePath);

    if (filePath.includes('..')) {
      console.warn('[PROTOCOL] 拒绝路径遍历:', filePath);
      callback({ error: -6 });
      return;
    }

    if (!fs.existsSync(filePath)) {
      console.warn('[PROTOCOL] 文件不存在:', filePath);
      callback({ error: -6 });
      return;
    }

    callback({ path: filePath });
  });
}

// ==================== 启动 TTS 服务 ====================
function startTTSService() {
  const scriptPath = path.join(__dirname, 'edge_tts_service.py');
  if (!fs.existsSync(scriptPath)) {
    console.error('[TTS] 脚本未找到:', scriptPath);
    return;
  }

  ttsProcess = spawn(getPythonExe(app.isPackaged, __dirname), [scriptPath], {
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
  });

  ttsProcess.stdout.on('data', (data) => {
    console.log('[TTS Service]', data.toString().trim());
  });

  ttsProcess.stderr.on('data', (data) => {
    console.error('[TTS Service Error]', data.toString().trim());
  });

  ttsProcess.on('close', (code) => {
    console.log('[TTS] 服务已停止，退出码:', code);
    ttsProcess = null;
  });
}

// ==================== 启动 HTTP 服务（使用纯 Node.js 内置模块） ====================
function startHttpServer() {
  httpServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const parsedUrl = url.parse(req.url);
    let pathname = parsedUrl.pathname;

    // 手机端靠这个接口拿到电脑局域网 IP 和访问令牌
    if (pathname === '/ip') {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(JSON.stringify({ ip: getLanIp(), port: 8083, token: ensureAccessToken() }));
      return;
    }

    if (pathname === '/mobile' || pathname === '/mobile/') {
      const mobilePath = path.join(__dirname, 'mobile.html');
      fs.readFile(mobilePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
        } else {
          res.setHeader('Content-Type', 'text/html');
          res.writeHead(200);
          res.end(data);
        }
      });
      return;
    }

    // PWA 静态资源（手机“添加到主屏幕”所需）
    if (pathname === '/manifest.webmanifest') {
      res.setHeader('Content-Type', 'application/manifest+json');
      res.writeHead(200);
      res.end(fs.readFileSync(path.join(__dirname, 'manifest.webmanifest')));
      return;
    }
    if (pathname === '/sw.js') {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.writeHead(200);
      res.end(fs.readFileSync(path.join(__dirname, 'sw.js')));
      return;
    }
    if (pathname === '/icon-192.png' || pathname === '/icon-512.png') {
      res.setHeader('Content-Type', 'image/png');
      res.writeHead(200);
      res.end(fs.readFileSync(path.join(__dirname, pathname.slice(1))));
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  }).listen(8080, '0.0.0.0', () => {
    console.log('[HTTP] 服务已启动: http://0.0.0.0:8080');
  });
}

// ==================== 游戏窗口 ====================
let gomokuWin = null;
let checkersWin = null;

function createGomokuWindow() {
  if (gomokuWin) {
    gomokuWin.focus();
    return;
  }

  gomokuWin = new BrowserWindow({
    width: 340,
    height: 400,
    resizable: false,
    frame: true,
    title: '五子棋',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  gomokuWin.loadURL(`file://${__dirname}/gomoku.html`);
  // 不再自动打开开发者工具，需要时手动 Ctrl+Shift+I
  // gomokuWin.webContents.openDevTools();

  gomokuWin.on('closed', () => {
    gomokuWin = null;
  });
}

function createCheckersWindow() {
  if (checkersWin) {
    checkersWin.focus();
    return;
  }

  checkersWin = new BrowserWindow({
    width: 340,
    height: 400,
    resizable: false,
    frame: true,
    title: '跳棋',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  checkersWin.loadURL(`file://${__dirname}/checkers.html`);
  // 不再自动打开开发者工具，需要时手动 Ctrl+Shift+I
  // checkersWin.webContents.openDevTools();

  checkersWin.on('closed', () => {
    checkersWin = null;
  });
}

// ==================== 路径和文件操作 IPC（供 sandbox 环境调用） ====================
const ALLOWED_BASE_DIRS = [os.homedir(), os.tmpdir()];

function isPathAllowed(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  const resolved = path.resolve(filePath);
  return ALLOWED_BASE_DIRS.some(base => resolved.startsWith(path.resolve(base)));
}

// ========== 同步 IPC handler（支持 sendSync） ==========
ipcMain.on('path-join', (event, args) => {
  event.returnValue = path.join(...args);
});

ipcMain.on('path-basename', (event, filePath, ext) => {
  event.returnValue = path.basename(filePath, ext);
});

ipcMain.on('os-tmpdir', (event) => {
  event.returnValue = os.tmpdir();
});

ipcMain.on('os-homedir', (event) => {
  event.returnValue = os.homedir();
});

ipcMain.handle('os-totalmem', () => os.totalmem());
ipcMain.handle('os-freemem', () => os.freemem());

ipcMain.on('fs-exists', (event, filePath) => {
  if (!isPathAllowed(filePath)) {
    console.warn('[IPC] 拒绝访问路径:', filePath);
    event.returnValue = false;
    return;
  }
  event.returnValue = fs.existsSync(filePath);
});

ipcMain.on('fs-read', (event, filePath, encoding) => {
  if (!isPathAllowed(filePath)) {
    console.warn('[IPC] 拒绝读取路径:', filePath);
    event.returnValue = null;
    return;
  }
  try {
    event.returnValue = fs.readFileSync(filePath, encoding);
  } catch (e) {
    console.error('[IPC] 读取文件失败:', e);
    event.returnValue = null;
  }
});

ipcMain.on('fs-write', (event, filePath, data, encoding) => {
  if (!isPathAllowed(filePath)) {
    console.warn('[IPC] 拒绝写入路径:', filePath);
    event.returnValue = false;
    return;
  }
  try {
    fs.writeFileSync(filePath, data, encoding);
    event.returnValue = true;
  } catch (e) {
    console.error('[IPC] 写入文件失败:', e);
    event.returnValue = false;
  }
});

ipcMain.on('fs-append', (event, filePath, data, encoding) => {
  if (!isPathAllowed(filePath)) {
    console.warn('[IPC] 拒绝追加写入路径:', filePath);
    event.returnValue = false;
    return;
  }
  try {
    fs.appendFileSync(filePath, data, encoding);
    event.returnValue = true;
  } catch (e) {
    console.error('[IPC] 追加写入失败:', e);
    event.returnValue = false;
  }
});

// ==================== 传话信箱 IPC（便携版新增） ====================
// 列目录（仅允许 homedir / tmpdir 内）
ipcMain.on('fs-readdir', (event, dirPath) => {
  if (!isPathAllowed(dirPath)) {
    console.warn('[IPC] 拒绝列目录:', dirPath);
    event.returnValue = [];
    return;
  }
  try {
    event.returnValue = fs.readdirSync(dirPath).filter(f => f.toLowerCase().endsWith('.json'));
  } catch (e) {
    event.returnValue = [];
  }
});

// 确保信箱目录结构存在
ipcMain.on('mailbox-ensure', (event) => {
  try {
    const base = path.join(os.homedir(), 'mailbox');
    console.log('[MAILBOX] ensure base =', base);
    const dirs = {
      root: base,
      outbox: path.join(base, 'outbox'),
      inbox: path.join(base, 'inbox'),
      sent: path.join(base, 'sent')
    };
    Object.keys(dirs).forEach(k => {
      if (!fs.existsSync(dirs[k])) fs.mkdirSync(dirs[k], { recursive: true });
    });
    event.returnValue = { success: true, ...dirs };
  } catch (e) {
    console.error('[MAILBOX] ensure 失败:', e);
    event.returnValue = { success: false, error: e.message };
  }
});

// ==================== 模板管理 IPC ====================
ipcMain.handle('save-template', async (event, templateData) => {
  try {
    const templatesDir = path.join(os.homedir(), '.girlpet_templates');
    if (!fs.existsSync(templatesDir)) {
      fs.mkdirSync(templatesDir, { recursive: true });
    }

    const fileName = `${Date.now()}_template.pptx`;
    const filePath = path.join(templatesDir, fileName);
    fs.writeFileSync(filePath, Buffer.from(templateData, 'base64'));

    return { success: true, path: filePath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-templates', async () => {
  try {
    const templatesDir = path.join(os.homedir(), '.girlpet_templates');
    if (!fs.existsSync(templatesDir)) {
      return { success: true, templates: [] };
    }

    const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.pptx'));
    const templates = files.map(f => ({
      name: f,
      path: path.join(templatesDir, f),
      size: fs.statSync(path.join(templatesDir, f)).size
    }));

    return { success: true, templates };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('delete-template', async (event, templatePath) => {
  try {
    if (fs.existsSync(templatePath)) {
      fs.unlinkSync(templatePath);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ==================== PPT 模板选择 IPC ====================
ipcMain.handle('select-ppt-template', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'PPT Templates', extensions: ['pptx'] }],
      defaultPath: path.join(os.homedir(), '.girlpet_templates')
    });
    
    if (result.canceled || !result.filePaths.length) {
      return { success: false, error: '用户取消选择' };
    }
    
    return { success: true, path: result.filePaths[0] };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('select-ppt-file', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'PPT Files', extensions: ['pptx'] }]
    });
    
    if (result.canceled || !result.filePaths.length) {
      return { success: false, error: '用户取消选择' };
    }
    
    return { success: true, path: result.filePaths[0] };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ==================== PPT 生成 IPC ====================
// 生成幻灯片数据（调用 AI）
ipcMain.handle('generate-ppt-content', async (event, { topic, ollamaUrl }) => {
  try {
    const slides = await generatePPTContent(topic, ollamaUrl);
    return slides;
  } catch (err) {
    console.error('[PPT] 生成内容失败:', err);
    return [
      { title: topic, body: '内容生成失败，请检查 Ollama 服务', points: ['重试', '检查网络'] }
    ];
  }
});

// 填充PPT模板
ipcMain.handle('fill-ppt-template', async (event, { templatePath, topic, slides }) => {
  try {
    const outputPath = await fillPPTTemplate(templatePath, topic, slides, app.isPackaged, __dirname);
    return outputPath;
  } catch (err) {
    console.error('[PPT] 填充模板失败:', err);
    throw new Error('PPT 生成失败: ' + err.message);
  }
});

// ==================== 语音录音 API ====================
let recordingFilePath = '';

ipcMain.handle('start-recording', async () => {
  try {
    const tempDir = os.tmpdir();
    recordingFilePath = path.join(tempDir, `voice_${Date.now()}.wav`);

    const scriptPath = path.join(__dirname, 'record_audio.py');
    if (!fs.existsSync(scriptPath)) {
      return { success: false, error: '录音脚本未找到' };
    }

    console.log('[VOICE] 开始录音:', recordingFilePath);

    return new Promise((resolve) => {
      const proc = spawn(getPythonExe(app.isPackaged, __dirname), [scriptPath, recordingFilePath], {
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      });

      proc.on('close', (code) => {
        console.log('[VOICE] 录音进程结束，退出码:', code);
        if (code === 0 && fs.existsSync(recordingFilePath)) {
          const stats = fs.statSync(recordingFilePath);
          console.log('[VOICE] 录音文件生成，大小:', stats.size, 'bytes');
          resolve({ success: true, filePath: recordingFilePath });
        } else {
          console.error('[VOICE] 录音失败，退出码:', code, '文件存在:', fs.existsSync(recordingFilePath));
          resolve({ success: false, error: code !== 0 ? `录音进程异常退出 (${code})` : '录音文件未生成' });
        }
      });

      proc.on('error', (err) => {
        console.error('[VOICE] 录音进程启动失败:', err);
        resolve({ success: false, error: `启动录音失败: ${err.message}` });
      });
    });

  } catch (e) {
    console.error('录音异常:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('check-recording', async () => {
  if (recordingFilePath && fs.existsSync(recordingFilePath)) {
    return { exists: true };
  }
  return { exists: false };
});

ipcMain.handle('stop-recording', async () => {
  try {
    if (!recordingFilePath || !fs.existsSync(recordingFilePath)) {
      return { success: false, error: '没有录音或录音文件不存在' };
    }

    const scriptPath = app.isPackaged
      ? path.join(process.resourcesPath, 'vosk_stt.py')
      : path.join(__dirname, 'vosk_stt.py');

    if (!fs.existsSync(scriptPath)) {
      try { if (fs.existsSync(recordingFilePath)) fs.unlinkSync(recordingFilePath); } catch (_) {}
      recordingFilePath = '';
      return { success: false, error: '识别脚本未找到' };
    }

    const proc = spawn(getPythonExe(app.isPackaged, __dirname), [scriptPath, recordingFilePath], {
      windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    return new Promise((resolve) => {
      let stdout = '';
      proc.stdout.setEncoding('utf8');
      proc.stdout.on('data', d => { stdout += d; });
      proc.on('close', (code) => {
        try { if (fs.existsSync(recordingFilePath)) fs.unlinkSync(recordingFilePath); } catch (_) {}
        recordingFilePath = '';

        if (code === 0 && stdout.trim()) {
          resolve({ success: true, text: stdout.trim() });
        } else {
          resolve({ success: false, error: code !== 0 ? `识别失败，退出码 ${code}` : '未识别到语音' });
        }
      });
      proc.on('error', () => {
        try { if (fs.existsSync(recordingFilePath)) fs.unlinkSync(recordingFilePath); } catch (_) {}
        recordingFilePath = '';
        resolve({ success: false, error: '启动识别失败' });
      });
    });
  } catch (e) {
    console.error('识别异常:', e);
    try { if (fs.existsSync(recordingFilePath)) fs.unlinkSync(recordingFilePath); } catch (_) {}
    recordingFilePath = '';
    return { success: false, error: e.message };
  }
});

// ==================== 窗口移动 IPC ====================
ipcMain.on('move-window', (event, deltaX, deltaY) => {
  if (!win) return;
  // 防御：delta 非有限数字直接忽略，避免 setPosition(NaN) 崩溃
  if (typeof deltaX !== 'number' || typeof deltaY !== 'number' || !isFinite(deltaX) || !isFinite(deltaY)) return;
  const p = win.getPosition();
  let cx = 0, cy = 0;
  if (Array.isArray(p)) { cx = p[0]; cy = p[1]; }
  else if (p && typeof p === 'object') { cx = p.x; cy = p.y; }
  cx = Number(cx); cy = Number(cy);
  // 关键防御：typeof NaN === 'number'，必须用 isFinite 兜底，
  // 否则窗口位置未稳定时 getPosition() 返回的 [NaN,NaN] 会穿透 typeof 检查直达 setPosition 崩溃
  if (!isFinite(cx) || !isFinite(cy)) return;
  win.setPosition(Math.round(cx + deltaX), Math.round(cy + deltaY));
});

// 渲染端拖拽前取窗口当前位置（绝对坐标算法需要，避免累积误差）
// 兼容 getPosition() 返回数组或 {x,y} 对象两种形态，强制转数字，杜绝 undefined/NaN 下传
ipcMain.handle('get-window-position', () => {
  if (!win) return { x: 0, y: 0 };
  const p = win.getPosition();
  let x = 0, y = 0;
  if (Array.isArray(p)) { x = p[0]; y = p[1]; }
  else if (p && typeof p === 'object') { x = p.x; y = p.y; }
  return { x: Number(x) || 0, y: Number(y) || 0 };
});

// ==================== 游戏 IPC ====================
ipcMain.on('open-gomoku', () => {
  createGomokuWindow();
});

ipcMain.on('open-checkers', () => {
  createCheckersWindow();
});

ipcMain.on('close-gomoku', () => {
  if (gomokuWin) {
    gomokuWin.close();
    gomokuWin = null;
  }
});

ipcMain.on('close-checkers', () => {
  if (checkersWin) {
    checkersWin.close();
    checkersWin = null;
  }
});

// ==================== 打开浏览器（IPC 通道） ====================
ipcMain.handle('shell-open-external', async (event, url) => {
    console.log('[Shell] 收到打开请求:', url);
    
    // 校验 URL 是否合法（防止注入）
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
        console.warn('[Shell] 非法 URL 被拦截:', url);
        return { success: false, error: 'URL 格式不合法' };
    }

    return new Promise((resolve) => {
        const { spawn } = require('child_process');
        // 使用 Windows 的 start 命令，无需设置默认浏览器关联
        const proc = spawn('cmd', ['/c', 'start', url], {
            windowsHide: true,   // 不显示黑框
            detached: true       // 让浏览器独立于主进程运行
        });

        proc.on('close', (code) => {
            console.log('[Shell] 命令执行完成，退出码:', code);
            resolve({ success: code === 0 });
        });

        proc.on('error', (err) => {
            console.error('[Shell] 启动失败:', err);
            resolve({ success: false, error: err.message });
        });

        // 超时保护：5秒后没返回就认为失败
        setTimeout(() => {
            resolve({ success: false, error: '打开超时' });
        }, 5000);
    });
});

// ==================== 统一清理函数 ====================
function cleanupAllServices() {
  console.log('[CLEANUP] 开始清理所有服务...');

  cleanupTimers.forEach(clearTimeout);
  cleanupTimers = [];

  // 1. 关闭 TTS 子进程（Windows 下只能强杀）
  if (ttsProcess) {
    console.log('[CLEANUP] 正在关闭 TTS 服务...');
    ttsProcess.kill();
    ttsProcess.on('exit', () => {
      console.log('[CLEANUP] TTS 服务已关闭');
    });
  }

  // 2. 关闭 HTTP 服务器
  if (httpServer) {
    console.log('[CLEANUP] 正在关闭 HTTP 服务...');
    httpServer.close(() => {
      console.log('[CLEANUP] HTTP 服务已关闭');
    });
    const httpTimer = setTimeout(() => {
      console.warn('[CLEANUP] HTTP 关闭超时，可能残留');
    }, 3000);
    cleanupTimers.push(httpTimer);
  }

  // 3. 关闭 WebSocket 服务器
  const wss = getWss();
  if (wss) {
    console.log('[CLEANUP] 正在关闭 WebSocket 服务...');
    wss.clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Server shutting down');
      }
    });
    wss.close(() => {
      console.log('[CLEANUP] WebSocket 服务已关闭');
    });
    const wsTimer = setTimeout(() => {
      console.warn('[CLEANUP] WebSocket 关闭超时，可能残留');
    }, 3000);
    cleanupTimers.push(wsTimer);
  }

  console.log('[CLEANUP] 清理请求已发送，等待服务完全关闭...');

  ttsProcess = null;
  httpServer = null;
}

// ==================== 应用生命周期 ====================
app.whenReady().then(() => {
  registerProtocol();
  createWindow();
  startTTSService();
  startHttpServer();
  ensureAccessToken();
  createWebSocketServer(win);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    cleanupAllServices();
    app.quit();
  }
});

app.on('will-quit', (event) => {
  cleanupAllServices();
});
