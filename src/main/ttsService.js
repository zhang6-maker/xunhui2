/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  模块墓志铭
 * ═══════════════════════════════════════════════════════════════════════════
 * 模块名称: ttsService.js - TTS 服务管理模块
 * 模块职责: 启动和管理 TTS 语音合成服务（基于 Edge-TTS）
 * 
 * 依赖模块:
 *   - fs: 文件系统操作
 *   - path: 路径处理
 *   - child_process.spawn: 启动子进程
 *   - node-fetch: HTTP 请求
 * 
 * 生命周期:
 *   - startTTSService(options): 启动 TTS 服务
 * 
 * 注意事项:
 *   - ✅ 需要传入 app.isPackaged 和 __dirname
 *   - ⚠️ 绝不能操作 DOM，绝不能操作渲染进程逻辑
 *   - ⚠️ 服务启动后会轮询检查就绪状态（最多 10 次）
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const fetch = require('node-fetch');

let ttsProcess = null;

function startTTSService({ isPackaged, dirname }) {
  const pythonExe = isPackaged
    ? path.join(process.resourcesPath, 'python_portable', 'python.exe')
    : path.join(dirname, 'python_portable', 'python.exe');
  const scriptPath = isPackaged
    ? path.join(process.resourcesPath, 'edge_tts_service.py')
    : path.join(dirname, 'edge_tts_service.py');

  if (!fs.existsSync(pythonExe) || !fs.existsSync(scriptPath)) {
    console.error('❌ TTS 依赖文件不存在，跳过启动');
    return;
  }

  ttsProcess = spawn(pythonExe, [scriptPath], { windowsHide: true });
  ttsProcess.stdout.on('data', d => console.log(`[TTS] ${d}`));
  ttsProcess.stderr.on('data', d => console.error(`[TTS 错误] ${d}`));
  ttsProcess.on('close', code => console.log(`[TTS] 进程退出 ${code}`));
  ttsProcess.on('error', err => console.error('启动 TTS 失败:', err));

  // 轮询等待就绪
  let attempts = 0;
  const check = setInterval(async () => {
    attempts++;
    try {
      const res = await fetch('http://127.0.0.1:8001/health', {
        signal: AbortSignal.timeout(2000)
      });
      if (res.ok) { console.log('✅ TTS 服务就绪'); clearInterval(check); }
    } catch (_) {
      if (attempts >= 10) { console.error('❌ TTS 服务启动超时'); clearInterval(check); }
    }
  }, 1000);
}

function getTtsProcess() {
  return ttsProcess;
}

module.exports = { startTTSService, getTtsProcess };
