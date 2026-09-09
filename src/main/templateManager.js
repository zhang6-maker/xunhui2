/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  模块墓志铭
 * ═══════════════════════════════════════════════════════════════════════════
 * 模块名称: templateManager.js - 模板管理模块
 * 模块职责: 管理PPT模板的保存、获取、删除和选择
 * 
 * 依赖模块:
 *   - fs: 文件系统操作
 *   - path: 路径处理
 *   - pythonUtils: Python工具函数
 *   - node-fetch: HTTP请求
 * 
 * 生命周期:
 *   - saveTemplate(sourcePath, ollamaUrl, isPackaged, dirname, templatesRoot): 保存模板
 *   - getTemplates(templatesRoot): 获取所有模板
 *   - deleteTemplate(templateId, templatesRoot): 删除模板
 *   - selectBestTemplate(topic, templatesRoot): 选择最佳模板
 * 
 * 注意事项:
 *   - ✅ 需要传入必要的路径参数
 *   - ⚠️ 绝不能操作DOM，绝不能操作渲染进程逻辑
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { extractTemplateText, analyzeTemplateContent } = require('./pythonUtils');

async function saveTemplate(sourcePath, ollamaUrl, isPackaged, dirname, templatesRoot) {
  // 安全增强：严格校验文件类型
  if (!sourcePath.toLowerCase().endsWith('.pptx')) throw new Error('只接受 .pptx 文件');
  
  // 安全增强：检查文件大小（最大 50MB）
  const stats = fs.statSync(sourcePath);
  if (stats.size > 50 * 1024 * 1024) throw new Error('文件大小不能超过 50MB');
  
  // 安全增强：严格过滤文件夹名称中的危险字符
  const baseName = path.basename(sourcePath, '.pptx').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5\-]/g, '_');
  const folderName = `${baseName}_${Date.now()}`;
  
  const templateDir = path.join(templatesRoot, folderName);
  fs.mkdirSync(templateDir, { recursive: true });
  
  const targetPath = path.join(templateDir, 'template.pptx');
  fs.copyFileSync(sourcePath, targetPath);
  
  const extractedText = await extractTemplateText(targetPath, isPackaged, dirname);
  const description = await analyzeTemplateContent(extractedText, ollamaUrl);
  const info = { name: baseName, description: description || '通用模板', createdAt: new Date().toISOString() };
  fs.writeFileSync(path.join(templateDir, 'info.json'), JSON.stringify(info, null, 2), 'utf8');
  return { id: folderName, name: info.name, description: info.description };
}

async function getTemplates(templatesRoot) {
  if (!fs.existsSync(templatesRoot)) return [];
  return fs.readdirSync(templatesRoot)
    .map(dir => {
      const infoPath = path.join(templatesRoot, dir, 'info.json');
      if (!fs.existsSync(infoPath)) return null;
      const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
      return { id: dir, name: info.name, description: info.description };
    })
    .filter(Boolean);
}

async function deleteTemplate(templateId, templatesRoot) {
  const templateDir = path.join(templatesRoot, templateId);
  if (fs.existsSync(templateDir)) { fs.rmSync(templateDir, { recursive: true }); return true; }
  return false;
}

async function selectBestTemplate(topic, templatesRoot) {
  if (!fs.existsSync(templatesRoot)) return null;
  const templates = fs.readdirSync(templatesRoot)
    .map(dir => {
      const infoPath = path.join(templatesRoot, dir, 'info.json');
      if (!fs.existsSync(infoPath)) return null;
      const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
      return { id: dir, name: info.name, description: info.description };
    })
    .filter(Boolean);
  if (!templates.length) return null;
  if (templates.length === 1) return templates[0].id;

  const descList = templates.map((t, i) => `${i+1}. ${t.description}`).join('\n');
  const prompt = `用户要生成一个关于"${topic}"的PPT。现有模板：\n${descList}\n请只输出最合适的模板序号（数字），不要输出其他内容。`;
  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST', body: JSON.stringify({ model: 'qwen2:7b', prompt, stream: false })
    });
    const data = await response.json();
    const index = parseInt(data.response.trim()) - 1;
    return (templates[index]?.id) || templates[0].id;
  } catch (_) { return templates[0].id; }
}

module.exports = { saveTemplate, getTemplates, deleteTemplate, selectBestTemplate };