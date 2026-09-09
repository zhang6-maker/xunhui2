/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  模块墓志铭
 * ═══════════════════════════════════════════════════════════════════════════
 * 模块名称: musicService.js - 音乐 API 服务模块
 * 模块职责: 启动和管理网易云音乐 API 服务
 * 
 * 依赖模块:
 *   - fs: 文件系统操作
 *   - path: 路径处理
 *   - child_process.spawn: 启动子进程
 * 
 * 生命周期:
 *   - startMusicApiService(dirname): 启动音乐 API 服务
 *   - getMusicApiProcess(): 获取音乐 API 进程实例
 * 
 * 注意事项:
 *   - ✅ 需要传入 dirname 参数
 *   - ⚠️ 绝不能操作 DOM，绝不能操作渲染进程逻辑
 *   - ⚠️ 依赖 NeteaseCloudMusicApi 目录
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let musicApiProcess = null;

function startMusicApiService(dirname) {
  const apiDir = path.join(dirname, 'NeteaseCloudMusicApi');
  const apiEntry = path.join(apiDir, 'app.js');
  if (!fs.existsSync(apiEntry)) { console.warn('⚠️ 未找到音乐API服务'); return; }

  musicApiProcess = spawn('node', [apiEntry], { cwd: apiDir, stdio: 'ignore', windowsHide: true });
  musicApiProcess.on('error', err => { console.error('❌ 音乐API启动失败:', err); musicApiProcess = null; });
  musicApiProcess.on('exit', code => { console.log(`🎵 音乐API退出 ${code}`); musicApiProcess = null; });
}

function getMusicApiProcess() {
  return musicApiProcess;
}

module.exports = { startMusicApiService, getMusicApiProcess };
