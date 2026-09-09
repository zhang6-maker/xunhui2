/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  模块墓志铭
 * ═══════════════════════════════════════════════════════════════════════════
 * 模块名称: pythonUtils.js - Python 工具模块
 * 模块职责: 提供 Python 相关工具函数（执行脚本、提取PPT文本、分析模板内容）
 * 
 * 依赖模块:
 *   - path: 路径处理
 *   - child_process.exec: 执行命令
 *   - node-fetch: HTTP 请求
 * 
 * 生命周期:
 *   - getPythonExe(isPackaged, dirname): 获取 Python 可执行文件路径
 *   - extractTemplateText(templatePath, isPackaged, dirname): 提取PPT模板文本
 *   - analyzeTemplateContent(text, ollamaUrl): 分析模板内容
 * 
 * 注意事项:
 *   - ✅ 需要传入 isPackaged 和 dirname 参数
 *   - ⚠️ 绝不能操作 DOM，绝不能操作渲染进程逻辑
 *   - ⚠️ extractTemplateText 有 30 秒超时限制
 * ═══════════════════════════════════════════════════════════════════════════
 */

const path = require('path');
const { exec } = require('child_process');
const fetch = require('node-fetch');

function getPythonExe(isPackaged, dirname) {
  return isPackaged
    ? path.join(process.resourcesPath, 'python_portable', 'python.exe')
    : path.join(dirname, 'python_portable', 'python.exe');
}

function extractTemplateText(templatePath, isPackaged, dirname) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(dirname, 'extract_ppt_text.py');
    exec(`"${getPythonExe(isPackaged, dirname)}" "${scriptPath}" "${templatePath}"`, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) reject(err); else resolve(stdout.trim());
    });
  });
}

async function analyzeTemplateContent(text, ollamaUrl = 'http://localhost:11434') {
  const url = ollamaUrl || 'http://localhost:11434';
  const prompt = `请根据以下PPT模板的文字内容，用一句简短中文描述该模板的风格和适用场景。信息：\n${text}`;
  try {
    const response = await fetch(`${url}/api/generate`, {
      method: 'POST',
      body: JSON.stringify({ model: 'qwen2:7b', prompt, stream: false })
    });
    const data = await response.json();
    return data.response.replace(/[\n\r]/g, '').trim();
  } catch (_) { return '通用模板'; }
}

module.exports = { getPythonExe, extractTemplateText, analyzeTemplateContent };
