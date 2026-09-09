/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  模块墓志铭
 * ═══════════════════════════════════════════════════════════════════════════
 * 模块名称: pptGenerator.js - PPT生成模块
 * 模块职责: 负责生成PPT内容和填充PPT模板
 * 
 * 依赖模块:
 *   - fs: 文件系统操作
 *   - path: 路径处理
 *   - os: 操作系统信息
 *   - child_process: 执行Python脚本
 *   - node-fetch: HTTP请求
 *   - pythonUtils: Python工具函数
 * 
 * 生命周期:
 *   - getOllamaModel(ollamaUrl): 获取可用的Ollama模型
 *   - generatePPTContent(topic, ollamaUrl): 生成PPT内容
 *   - fillPPTTemplate(templatePath, topic, slides, isPackaged, dirname): 填充PPT模板
 * 
 * 注意事项:
 *   - ✅ 最大的一个模块，200+ 行代码
 *   - ⚠️ 绝不能操作DOM，绝不能操作渲染进程逻辑
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const fetch = require('node-fetch');
const { getPythonExe } = require('./pythonUtils');

async function getOllamaModel(ollamaUrl) {
  try {
    const res = await fetch(`${ollamaUrl}/api/tags`);
    const data = await res.json();
    if (data.models && data.models.length > 0) {
      const qwen = data.models.find(m => m.name.toLowerCase().includes('qwen'));
      return qwen ? qwen.name : data.models[0].name;
    }
  } catch (e) {}
  return 'qwen2:7b';
}

async function generatePPTContent(topic, ollamaUrl) {
  const model = await getOllamaModel(ollamaUrl);
  console.log(`[PPT] 正在启动分布式深度撰写引擎 V8, 模型: ${model}, 主题: ${topic}`);

  const fetchWithTimeout = async (url, options, timeout = 120000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      return response;
    } catch (e) {
      clearTimeout(id);
      throw e;
    }
  };

  try {
    const outlinePrompt = `你是一个各行业资深战略咨询专家（麦肯锡/波士顿咨询风格）。
    请为主题为"${topic}"的专业调研报告规划一个包含8-10页的极详尽大纲。
    要求：
    1. 逻辑必须极其严密：包含现状深度分析、底层技术原理/商业本质拆解、多维度解决方案（如架构、流程、生态）、定量/定性风险评估、未来3-5年趋势预判。
    2. 拒绝任何虚头巴脑的词汇，每页必须聚焦一个具体的"硬核"问题。
    
    输出格式：JSON数组，每项包含: "title"(标题), "focus"(该页要探讨的核心深度问题)。
    示例：[{"title": "XX行业现状：从高增长转向存量博弈的底层动因", "focus": "分析资本效率下降与技术边际效应递减的耦合关系"}]
    只输出纯JSON，不要Markdown标签，不要解释。`;

    const outlineRes = await fetchWithTimeout(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      body: JSON.stringify({ model, prompt: outlinePrompt, stream: false })
    });
    const outlineData = await outlineRes.json();
    let outlineText = outlineData.response.trim();
    const jsonMatch = outlineText.match(/\[[\s\S]*\]/);
    if (jsonMatch) outlineText = jsonMatch[0];
    const outline = JSON.parse(outlineText);

    const finalSlides = [];
    for (let i = 0; i < outline.length; i += 2) {
      const batch = outline.slice(i, i + 2);
      console.log(`[PPT] 正在深度撰写批次: ${i/2 + 1}, 包含: ${batch.map(b => b.title).join(', ')}`);
      
      const batchPrompt = `你是一个深耕"${topic}"领域的首席分析师。请为PPT中以下页面编写专业文稿：
      ${batch.map((p, idx) => `页面${idx+1}: 标题《${p.title}》, 核心关注点: ${p.focus}`).join('\n')}
      
      编写要求（严格执行）：
      1. 正文(body)：字数400-600字。禁止使用"总之"、"综上所述"、"关键阶段"等废话。必须包含：具体的行业术语、逻辑推导链条、实操性建议。
      2. 核心点(points)：4个极具实操性的干货结论，每个20-40字。
      3. 视觉建议：themeColor(深色系HEX), emotion(根据内容选: thinking/working/warning/success)。
      4. 布局建议：根据内容密度选 points(要点多) 或 content(文字多)。
      
      输出格式：JSON数组，包含两个对象，顺序与输入一致。
      格式：[{"body": "...", "points": ["...", "..."], "layout": "...", "themeColor": "...", "emotion": "..."}, {...}]
      只输出纯JSON，严禁任何废话。`;

      try {
        const detailRes = await fetchWithTimeout(`${ollamaUrl}/api/generate`, {
          method: 'POST',
          body: JSON.stringify({ model, prompt: batchPrompt, stream: false })
        }, 180000);
        const detailData = await detailRes.json();
        let detailText = detailData.response.trim();
        const arrMatch = detailText.match(/\[[\s\S]*\]/);
        if (arrMatch) detailText = arrMatch[0];
        
        const details = JSON.parse(detailText);
        batch.forEach((page, idx) => {
          if (details[idx]) {
            finalSlides.push({
              title: page.title,
              subtitle: page.focus,
              ...details[idx]
            });
          }
        });
      } catch (e) {
        console.warn(`[PPT] 批次 ${i/2 + 1} 撰写失败，应用单页补救`, e);
        batch.forEach(page => {
          finalSlides.push({
            title: page.title, subtitle: page.focus,
            body: `关于"${page.title}"的深度分析：在${topic}的当前语境下，${page.focus}涉及到的核心矛盾在于效率与成本的平衡。我们需要从底层架构出发，重新审视资源分配逻辑，通过引入更具弹性的反馈机制来应对市场波动...`,
            points: ["核心矛盾拆解", "资源分配重构", "弹性反馈机制"],
            layout: "content", themeColor: "#2d3436", emotion: "thinking"
          });
        });
      }
    }

    return finalSlides;

  } catch (err) {
    console.error('Ollama V8 Distributed PPT generation failed:', err);
    return [
      { 
        layout: "cover", title: topic, subtitle: "深度产业逻辑与未来增长范式调研", themeColor: "#1e272e", emotion: "working", 
        body: `本报告旨在穿透"${topic}"的市场表象，从底层技术演进与商业本质出发，构建一套完整的认知框架。在存量博弈与增量创新的交汇点，唯有深刻理解生产力重构的逻辑，方能锚定未来的确定性增长机会。`, 
        points: ["产业图谱与价值链条重构", "核心驱动因子与边际效应分析", "从单点突破到系统协同的演进路径"] 
      },
      { 
        layout: "content", title: "核心运行机制：非线性增长的驱动引擎", subtitle: "底层变量与耦合关系拆解", themeColor: "#0fbcf9", emotion: "thinking", 
        body: `${topic}的核心价值不在于工具性的替代，而在于对原有业务流的深度重组。通过对关键变量的敏感度分析，我们发现行业正处于从"规模驱动"向"效率驱动"转化的临界点。必须建立基于实时数据流的反馈矩阵，将不确定性内化为系统的自我进化动力，从而实现跨越周期的增长。`, 
        points: ["变量耦合分析：识别核心影响权重", "反馈矩阵构建：从被动响应到自适应进化", "临界点突破：跨越非连续性的战略抉择"] 
      },
      { 
        layout: "points", title: "三大战略锚点：构建差异化竞争壁垒", subtitle: "资源配置与生态协同的高效模型", themeColor: "#3c40c6", emotion: "success", 
        body: `在${topic}的竞争格局中，单一的技术优势已难以维持长期领先。我们提炼出"技术护城河、运营矩阵、价值锚点"三位一体的增长模型。这要求组织从线性管理向网络化协同进化，通过全生命周期的深度连接，实现从"交付产品"到"交付价值"的根本性转变。`, 
        points: ["技术领先逻辑：构建不可复制的算法/数据闭环", "运营协同矩阵：打破组织烟囱实现高效资源流转", "价值深度连接：重塑用户心智与全生命周期管理"] 
      },
      { 
        layout: "content", title: "风险矩阵评估：合规红线与技术瓶颈", subtitle: "建立敏捷的容错与对冲机制", themeColor: "#f53b57", emotion: "warning", 
        body: `推进${topic}的过程中，必须警惕"创新者的窘境"与"合规性陷阱"。通过对全球监管趋势与技术伦理的扫描，我们建议建立一套"灰度测试+实时预警"的双轨制风险管理体系。通过低成本的敏捷试错，在保持创新的同时，将合规风险与市场噪声有效隔离在核心业务之外。`, 
        points: ["合规性预判：前瞻性布局全球监管红线", "对冲方案设计：多元化技术栈与备份策略", "敏捷反馈机制：构建低成本的试错与优化回路"] 
      },
      { 
        layout: "content", title: "未来展望：范式转移后的产业终局", subtitle: "从工具替代到文明形态的演进预判", themeColor: "#05c46b", emotion: "relax", 
        body: `展望未来3-5年，${topic}将完成从"外部赋能"到"内在原生"的转变。届时，行业边界将进一步瓦解，全新的商业生态将在废墟之上重建。对于决策者而言，现在的每一分投入都是在购买未来的入场券。唯有坚持长期主义，在波动的迷雾中寻找第一性原理，方能成为新秩序的定义者。`, 
        points: ["边界瓦解：跨界融合产生的新商业物种", "原生进化：从数字化转型到数字原生组织的飞跃", "终局预判：构建共生共赢的行业生态网络"] 
      },
      { 
        layout: "summary", title: "战略行动建议：立即启动的蓝图规划", subtitle: "从认知到落地的关键第一步", themeColor: "#ffa801", emotion: "working", 
        body: `知易行难。针对"${topic}"的落地，我们建议立即采取"顶层设计先行、小步快跑迭代"的方针。通过设定可追溯的阶段性KPI，确保每一项投入都能转化为可见的业务增量。未来已来，行动是消除焦虑的唯一解。`, 
        points: ["立即启动顶层规划：明确未来三年的战略愿景", "建立跨领域工作专班：打破部门隔阂实现业务协同", "量化考核指标设定：确保战略意图的不折不扣执行"] 
      }
    ];
  }
}

async function fillPPTTemplate(templatePath, topic, slides, isPackaged, dirname) {
  const scriptPath = path.join(dirname, 'fill_ppt.py');
  if (!fs.existsSync(scriptPath)) throw new Error('fill_ppt.py 未找到');
  if (!fs.existsSync(templatePath)) throw new Error(`模板文件不存在：${templatePath}`);

  // 安全增强：严格过滤文件名中的危险字符
  const safeTopic = topic.replace(/[/\\?%*:|"<>;&$`]/g, '_');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outputPath = path.join(os.homedir(), 'Desktop', `关于${safeTopic}_${timestamp}.pptx`);
  
  const tempJsonPath = path.join(os.tmpdir(), `ppt_fill_${Date.now()}.json`);
  fs.writeFileSync(tempJsonPath, JSON.stringify({ slides }, null, 2), 'utf8');

  return new Promise((resolve, reject) => {
    // 安全增强：使用 spawn + 参数数组，避免命令注入
    const proc = spawn(getPythonExe(isPackaged, dirname), [scriptPath, templatePath, outputPath, tempJsonPath], {
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });
    
    let stderr = '';
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', data => { stderr += data; });
    
    proc.on('close', code => {
      try { fs.unlinkSync(tempJsonPath); } catch (_) {}
      if (code !== 0) reject(new Error(stderr || `子进程退出码 ${code}`));
      else resolve(outputPath);
    });
    
    proc.on('error', err => {
      try { fs.unlinkSync(tempJsonPath); } catch (_) {}
      reject(new Error(`启动子进程失败: ${err.message}`));
    });
  });
}

module.exports = { generatePPTContent, fillPPTTemplate };
