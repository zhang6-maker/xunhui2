/**
 * actions.js - 动作模块（第三阶段：统一冗余逻辑）
 *
 * 变更：
 * 1. PPT 生成统一为"模板优先，无模板降级到 pptxgenjs"，删除两套并存方案
 * 2. 意图匹配 matchCommand 保留，handleUserInput 精简
 * 3. 所有状态切换通过 STATE.dispatch() 进行
 */

// ==================== 工作 ====================
function goToWork() {
  const s = window.STATE;
  const girl = window.DEPENDENCIES.girl;
  if (!girl) return;
  if (['walking', 'working', 'sleeping', 'waking'].includes(s.state)) return;

  const maxX = window.innerWidth - girl.offsetWidth;
  const maxY = window.innerHeight - girl.offsetHeight;
  const targetPos = { x: Math.min(window.CONFIG.baseWorkPos.x, maxX), y: Math.min(window.CONFIG.baseWorkPos.y, maxY) };

  s.workPos = targetPos;
  s.targetX = targetPos.x;
  s.targetY = targetPos.y;
  s.dispatch('startWalking');
  s.moveStep();
  window.UI.showBubble('💼 去工作...', 1500, 'neutral', false);
}

// ==================== 睡觉 ====================
function goToBed(skipCooldown = false) {
  const s = window.STATE;
  const girl = window.DEPENDENCIES.girl;
  if (!girl) return;
  if (['walking', 'sleeping', 'waking'].includes(s.state)) return;

  const maxX = window.innerWidth - girl.offsetWidth;
  const maxY = window.innerHeight - girl.offsetHeight;
  const targetPos = { x: Math.min(window.CONFIG.baseBedPos.x, maxX), y: Math.min(window.CONFIG.baseBedPos.y, maxY) };

  s.bedPos = targetPos;
  s.targetX = targetPos.x;
  s.targetY = targetPos.y;
  s.dispatch('startWalking');
  s.moveStep();
  window.UI.showBubble('😴 睡觉啦...', 1500, 'neutral', false);
}

// ==================== 玩耍 ====================
function play(skipCooldown = false) {
  const s = window.STATE;
  if (['walking', 'sleeping', 'waking'].includes(s.state)) return;
  if (s.isSpeaking) {
    TimerManager.setTimeout('play', () => play(skipCooldown), 1000);
    return;
  }
  if (!skipCooldown && Date.now() - s.lastStateChangeTime < window.CONFIG.STATE_CONFIG.minDuration) return;
  if (Math.random() < 0.2) { dance(); return; }

  const actions = window.CONFIG.PLAY_ACTIONS;
  const randomAction = actions[Math.floor(Math.random() * actions.length)];
  const animFile = Math.random() < 0.5 ? window.CONFIG.imgMap.playing2 : window.CONFIG.imgMap.playing;

  // 原版：在 TTS onStart 里才切换状态，避免与 onEnter 钩子冲突
  window.TTS.speak(randomAction.sound, {
    onStart: () => {
      s.setState('playing');
      window.UI.showBubble(randomAction.text, 2000, 'neutral', false);
      window.STORAGE.addEventForDiary('play', '玩耍了一会儿');
      // playing 的自动推进已在 STATE_TRANSITIONS.playing 里声明
    }
  });
}

// ==================== 喂食 ====================
function feed() {
  const s = window.STATE;
  if (['walking', 'sleeping'].includes(s.state)) return;
  s.setState('eating');

  // 用一个本地 flag 防止安全定时器和 onEnd 双重触发 finish
  let finished = false;
  function finishEating() {
    if (finished) return;
    finished = true;
    if (s.state === 'eating') {
      s.setState('idle');
      s.startIdleTimer();
    }
  }

  const FEED_TIMEOUT = 15000;
  const safetyTimer = TimerManager.setTimeout('feedSafety', () => {
    console.warn('⚠️ 喂食超时未恢复，强制切回 idle');
    finishEating();
    window.UI.showBubble('……吃完了，该干嘛干嘛吧。', 2000);
  }, FEED_TIMEOUT);

  const affectionValue = window.AFFECTION?.getValue() ?? 50;
  const affectionPhase = window.AFFECTION?.getPhase() ?? '接受';
  
  // 根据好感度决定态度
  let attitude = '';
  if (affectionValue < 30) {
    attitude = '你不太想接受，但也不好意思直接拒绝。';
  } else if (affectionValue < 60) {
    attitude = '你勉为其难地接受了，嘴上不饶人但心里其实有点开心。';
  } else {
    attitude = '你很乐意接受这份心意，但傲娇的你绝对不会表现出来。';
  }
  
  const prompt = `（那个笨蛋递来一份食物。${attitude}当前好感度：${affectionValue}/100（${affectionPhase}阶段）。请用1句傲娇、毒舌的话回应，表现出你的独立态度——你是出于自己的意愿接受的，不是谁的宠物，绝对不许叫主人。好感度越高，话语中隐藏的开心应越明显，但嘴上绝不承认。只输出话语。）`;

  window.UI.showBubble('🍔 嗯...那我就勉强收下了…', 2000, 'neutral', false);

  if (window.CHAT?.talkToOllama) {
    window.CHAT.talkToOllama(prompt, {
      skipLearning: true,
      skipIntercept: true,
      onEnd: () => {
        clearTimeout(safetyTimer);
        finishEating();
      }
    });
  } else {
    clearTimeout(safetyTimer);
    const fallbacks = [
      '哼，看在你这么殷勤的份上，我就勉为其难收下了！',
      '马马虎虎吧，也就一般般好吃...下次换个花样！',
      '啧，你以为这样就能收买我吗？...不过味道还可以。'
    ];
    window.UI.showBubble(fallbacks[Math.floor(Math.random() * fallbacks.length)], 2000);
    setTimeout(finishEating, 2000);
  }

  window.STORAGE.addEventForDiary('feed', '吃了一份食物');
  window.AFFECTION?.change(+2, '喂食');
}

// ==================== 毒舌喂食 ====================
function sarcasticFeed() {
  const s = window.STATE;
  if (['walking', 'sleeping'].includes(s.state)) return;
  
  // ========== 1. 先执行实际喂食逻辑（核心） ==========
  feed();  // 包含: setState('eating'), AFFECTION.change(+2), STORAGE.addEventForDiary('feed')
  window.AFFECTION?.change(+3, '毒舌喂食');
  
  // ========== 2. 随机决定响应模式（傲娇反馈） ==========
  const affectionValue = window.AFFECTION?.getValue() ?? 50;
  const rand = Math.random();
  
  if (rand < 0.4) {   // 40% 沉默：只显示省略号，不朗读
    window.UI.showBubble('…', 1500, 'neutral', false);
  }
  else if (rand < 0.7) {  // 30% 内心戏：AI 生成但不朗读
    const reaction = affectionValue < 30
      ? '你觉得被当成宠物一样对待，有点不爽。'
      : '你觉得这种投喂行为很幼稚，但也有点小期待。';
    
    const prompt = `（那个笨蛋喂你吃东西。${reaction}请用1句傲娇的内心独白表达你的想法，不超过15个字。只输出话语。）`;
    
    window.CHAT.talkToOllama(prompt, {
      skipLearning: true,
      skipIntercept: true,
      skipDiary: true,
      silent: true   // ✅ 使用静默模式
    });
  }
  else {  // 30% 出声：AI 生成并朗读
    const reaction = affectionValue < 30
      ? '你觉得被当成宠物一样对待，有点不爽。'
      : '你觉得这种投喂行为很幼稚，但也有点小期待。';
    
    const prompt = `（那个笨蛋喂你吃东西。${reaction}请用1句傲娇毒舌的话回应，不超过15个字。只输出话语。）`;
    
    window.CHAT.talkToOllama(prompt, {
      skipLearning: true,
      skipIntercept: true,
      skipDiary: true
    });
  }
}

// ==================== 讨食被拒（AI 生成） ====================
function rejectFood() {
  const s = window.STATE;
  if (['sleeping'].includes(s.state)) return;

  // ========== 1. 先记录事件 ==========
  window.STORAGE.addEventForDiary('reject', '讨食被拒（嘴硬：才不稀罕）');

  // ========== 2. 随机决定响应模式（傲娇反馈） ==========
  const affectionValue = window.AFFECTION?.getValue() ?? 50;
  const rand = Math.random();
  
  if (rand < 0.4) {   // 40% 沉默：只显示省略号，不朗读
    window.UI.showBubble('…', 1500, 'neutral', false);
  }
  else if (rand < 0.7) {  // 30% 内心戏：AI 生成但不朗读
    const attitude = affectionValue < 30
      ? '你很不爽地表示不稀罕，嘴硬说本来就不饿。'
      : affectionValue < 60
      ? '你傲娇地表示不在乎，假装自己本来就不想吃。'
      : '你有点小委屈地嘟囔，但其实也不是真的生气。';
    
    const prompt = `（你刚才讨食，但那个人类没有给你吃的。${attitude}请用1句话傲娇地表示"才不稀罕"，不超过15个字。只输出话语。）`;
    
    if (window.CHAT?.talkToOllama) {
      window.CHAT.talkToOllama(prompt, {
        skipLearning: true,
        skipIntercept: true,
        skipDiary: true,
        silent: true   // ✅ 使用静默模式
      });
    } else {
      const fallbacks = [
        '切，不吃就不吃！',
        '哼，谁稀罕！',
        '算了，我自己找！'
      ];
      window.UI.showBubble(fallbacks[Math.floor(Math.random() * fallbacks.length)], 2000, 'neutral', false);
    }
  }
  else {  // 30% 出声：AI 生成并朗读
    const attitude = affectionValue < 30
      ? '你很不爽地表示不稀罕，嘴硬说本来就不饿。'
      : affectionValue < 60
      ? '你傲娇地表示不在乎，假装自己本来就不想吃。'
      : '你有点小委屈地嘟囔，但其实也不是真的生气。';
    
    const prompt = `（你刚才讨食，但那个人类没有给你吃的。${attitude}请用1句话傲娇地表示"才不稀罕"，不超过15个字。只输出话语。）`;
    
    if (window.CHAT?.talkToOllama) {
      window.CHAT.talkToOllama(prompt, {
        skipLearning: true,
        skipIntercept: true,
        skipDiary: true
      });
    } else {
      const fallbacks = [
        '切，不吃就不吃，我又不稀罕！',
        '哼，谁稀罕你的东西...才不饿呢！',
        '算了，我自己会找东西吃！'
      ];
      window.UI.showBubble(fallbacks[Math.floor(Math.random() * fallbacks.length)], 2000);
    }
  }
}

// ==================== 讨食（AI 生成） ====================
function begForFood() {
  const s = window.STATE;
  if (['walking', 'sleeping', 'eating'].includes(s.state)) return;
  if (s.isSpeaking) return;

  // ========== 1. 先记录事件 ==========
  window.STORAGE.addEventForDiary('beg', '讨食（内心：才不是想吃呢）');

  // ========== 2. 随机决定响应模式（傲娇反馈） ==========
  const affectionValue = window.AFFECTION?.getValue() ?? 50;
  const affectionPhase = window.AFFECTION?.getPhase() ?? '接受';
  const rand = Math.random();
  
  if (rand < 0.4) {   // 40% 沉默：只显示省略号，不朗读
    window.UI.showBubble('…', 1500, 'neutral', false);
  }
  else if (rand < 0.7) {  // 30% 内心戏：AI 生成但不朗读
    const attitude = affectionValue < 30
      ? '你很嫌弃地表示饿了，但绝不承认自己需要被照顾。'
      : affectionValue < 60
      ? '你傲娇地抱怨肚子饿，嘴上不饶人但其实在撒娇。'
      : '你带着小期待表示饿了，语气中可以透露一点点开心。';
    
    const prompt = `（你饿了，肚子在咕咕叫。${attitude}请用1句话傲娇地讨食，不超过15个字。注意：你不是宠物，不许叫主人。只输出话语。）`;
    
    if (window.CHAT?.talkToOllama) {
      window.CHAT.talkToOllama(prompt, {
        skipLearning: true,
        skipIntercept: true,
        skipDiary: true,
        silent: true   // ✅ 使用静默模式
      });
    } else {
      const fallbacks = [
        '饿了...',
        '肚子叫了...',
        '想吃东西...'
      ];
      window.UI.showBubble(fallbacks[Math.floor(Math.random() * fallbacks.length)], 2000, 'neutral', false);
    }
  }
  else {  // 30% 出声：AI 生成并朗读
    const attitude = affectionValue < 30
      ? '你很嫌弃地表示饿了，但绝不承认自己需要被照顾。'
      : affectionValue < 60
      ? '你傲娇地抱怨肚子饿，嘴上不饶人但其实在撒娇。'
      : '你带着小期待表示饿了，语气中可以透露一点点开心。';
    
    const prompt = `（你饿了，肚子在咕咕叫。${attitude}请用1句话傲娇地讨食，不超过15个字。注意：你不是宠物，不许叫主人。只输出话语。）`;
    
    if (window.CHAT?.talkToOllama) {
      window.CHAT.talkToOllama(prompt, {
        skipLearning: true,
        skipIntercept: true,
        skipDiary: true
      });
    } else {
      const fallbacks = [
        '饿了...（才不是想让你喂我呢）',
        '本小姐的肚子在叫了，你看着办吧！',
        '再不给我吃的，我可要生气了...'
      ];
      window.UI.showBubble(fallbacks[Math.floor(Math.random() * fallbacks.length)], 3000);
    }
  }
}

// ==================== 毒舌叫醒 ====================
function sassyWakeUp() {
  const now = new Date();
  const hour = now.getHours();
  const timeStr = `${hour}点${String(now.getMinutes()).padStart(2,'0')}分`;
  const affectionValue = window.AFFECTION?.getValue() ?? 50;
  const affectionPhase = window.AFFECTION?.getPhase() ?? '接受';
  const affectionHint = `当前好感度 ${affectionValue}/100（${affectionPhase}阶段）。`;

  const prompts = {
    night:   `现在是凌晨${timeStr}，那个笨蛋突然把你叫醒。你极度不爽，用最毒舌的话吐槽他。${affectionHint}要求：只输出吐槽，不要解释。`,
    morning: `现在是早上${timeStr}，那个笨蛋把你叫醒了。你还有点起床气，嫌弃他太早叫你。${affectionHint}要求：根据好感度决定关心和毒舌的比例，只输出吐槽，不要解释。`,
    noon:    `现在是上午${timeStr}，那个笨蛋把你叫醒。你觉得时间还行，但还是想调侃他打扰了你的美梦。${affectionHint}要求：语气傲娇带刺，只输出吐槽，不要解释。`,
    afternoon:`现在是下午${timeStr}，那个笨蛋终于来叫醒你了。你觉得他让你等了大半天，又气又委屈。${affectionHint}要求：根据好感度决定表现（越高越委屈粘人），只输出吐槽，不要解释。`,
    evening: `现在是晚上${timeStr}，那个笨蛋突然叫醒你。你觉得这个时间很离谱。${affectionHint}要求：吐槽他昼夜颠倒，但依然根据好感度表现出关心，只输出吐槽，不要解释。`
  };
  const key = hour < 6 ? 'night' : hour < 8 ? 'morning' : hour < 12 ? 'noon' : hour < 18 ? 'afternoon' : 'evening';
  window.CHAT.talkToOllama(prompts[key], { skipLearning: true, skipIntercept: true, skipDiary: true });
}

// ==================== 跳舞 ====================
function dance() {
  const s = window.STATE;
  if (['walking', 'sleeping', 'waking'].includes(s.state)) return;
  if (s.isSpeaking) { setTimeout(() => dance(), 1000); return; }
  // setState('dancing') 内部会注册 4秒后自动回 idle 的定时器
  s.setState('dancing');
  window.UI.showBubble('💃 啦啦啦~', 2000);
  window.STORAGE.addEventForDiary('dance', '跳了一支舞');
}

// ==================== 智能报时 ====================
async function aiTellTime(userMessage) {
  const now = new Date();
  const hour = now.getHours();
  const timeText = `${hour}点${String(now.getMinutes()).padStart(2,'0')}分`;
  const timeOfDay = hour < 6 ? '凌晨' : hour < 9 ? '早上' : hour < 12 ? '上午' : hour < 14 ? '中午' : hour < 18 ? '下午' : hour < 22 ? '晚上' : '深夜';
  const affectionHint = window.AFFECTION ? `当前好感度 ${window.AFFECTION.getValue()}/100（${window.AFFECTION.getPhase()}阶段）。` : '';
  const prompt = `（那个笨蛋问你现在几点了。当前时间是${timeOfDay} ${timeText}。请用一句傲娇、毒舌的话包含这个精确时间"${timeText}"，并吐槽他。${affectionHint}要求：只说一句话，不要解释。）`;

  try {
    await window.CHAT.talkToOllama(prompt, { skipLearning: true, skipIntercept: true, skipDiary: true });
  } catch {
    const fallback = `${timeText}了，你还不去吃饭，是想让我担心吗？笨蛋。`;
    window.UI.showBubble(fallback, 3000);
    window.TTS.speak(fallback);
  }
}

// ==================== 搜索 ====================
async function searchWeb(keyword) {
  if (!keyword?.trim()) { window.UI.showBubble('你想搜索什么呀？', 2000); return; }
  const s = window.STATE;
  s.setState('working');
  window.UI.showBubble(`🔍 正在搜索"${keyword}"...`, 2000, 'neutral', false);
  const searchUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(keyword)}`;
  TimerManager.setTimeout('search', async () => {
    try {
      const result = await window.electronAPI.invoke('shell-open-external', searchUrl);
      if (!result.success) {
        window.UI.showBubble('😵 打开浏览器失败：' + (result.error || '未知错误'), 3000);
      }
    } catch (err) {
      console.error('打开浏览器失败:', err);
      window.UI.showBubble('😵 打开浏览器失败，请检查网络设置', 3000);
    }
  }, 800);
  window.STORAGE.addEventForDiary('search', `搜索了 "${keyword}"`);
  // working 的自动推进已在 STATE_TRANSITIONS.working 里声明
}

// ==================== 音乐播放 ====================
let _currentAudio = null;
let _currentSongName = null;

function stopCurrentMusic() {
  if (_currentAudio) {
    _currentAudio.pause();
    _currentAudio.src = '';
    _currentAudio = null;
    _currentSongName = null;
  }
}

function _playOnlineMusic(playUrl, songName, artist) {
  stopCurrentMusic();
  const audio = new Audio(playUrl);
  _currentAudio = audio;
  _currentSongName = songName;
  audio.onended = () => { if (_currentAudio === audio) { _currentAudio = null; _currentSongName = null; } };
  audio.onerror = () => {
    window.UI.showBubble('😵 播放失败，链接可能失效了', 2000);
    if (_currentAudio === audio) { _currentAudio = null; _currentSongName = null; }
  };
  audio.play().catch(() => window.UI.showBubble('🎵 点击一下桌面，然后再说"播放"就可以自动放了', 3000));
}

async function playMusicOnline(songName) {
  if (window.STATE.state === 'sleeping') { window.UI.showBubble('😴 我在睡觉呢，别吵！', 2000); return; }
  if (!songName?.trim()) { window.UI.showBubble('你想听什么歌呀？', 2000); return; }

  window.UI.showBubble(`🔍 正在搜索《${songName}》...`, 2000, 'neutral', false);
  try {
    const result = await window.electronAPI.searchSong(songName);
    if (!result.success) { window.UI.showBubble(`😢 ${result.message}`, 3000); return; }

    const displayName = `${result.songName}${result.artist ? ' - ' + result.artist : ''}`;
    const affectionValue = window.AFFECTION?.getValue() ?? 50;
    const affectionPhase = window.AFFECTION?.getPhase() ?? '接受';
    const prompt = `（用户让你播放歌曲《${displayName}》。当前好感度：${affectionValue}/100（${affectionPhase}阶段）。请用一句符合你傲娇毒舌基调的话回应。注意：好感度低时表现为嫌弃他的品味，好感度高时表现为虽然嘴上嫌弃但其实很乐意为你播放。只输出那句话。）`;

    if (window.CHAT?.talkToOllama) {
      window.CHAT.talkToOllama(prompt, {
        skipLearning: true, skipIntercept: true, skipDiary: true,
        onEnd: () => {
          _playOnlineMusic(result.playUrl, result.songName, result.artist);
          window.STORAGE.addEventForDiary('music', `播放了《${result.songName}》`);
        }
      });
    } else {
      window.UI.showBubble(`哼，居然听《${displayName}》，品味真差… 算了，满足你。`, 3000);
      _playOnlineMusic(result.playUrl, result.songName, result.artist);
    }
  } catch (err) {
    window.UI.showBubble('😵 搜索失败，请检查网络', 3000);
  }
}

// ==================== PPT 生成（统一方案：模板优先，无模板降级） ====================
async function generatePPT(topic) {
  if (!topic?.trim()) { window.UI.showBubble('请告诉我PPT的主题是什么呀？', 2000); return; }

  const s = window.STATE;
  s.setState('working');
  s.clearAutoEndTimer(); // 清除自动结束定时器，让工作动画持续到PPT生成完成
  window.UI.showBubble(`📊 寻慧正在为您规划"${topic}"的极详尽大纲...`, 4000, 'neutral', false);

  try {
    const ollamaUrl = window.SETTINGS_STORE?.getAll()?.ollamaUrl || 'http://localhost:11434';
    
    // 增加一个进度反馈系统
    let progress = 0;
    window.TimerManager.setInterval('pptProgress', () => {
      if (s.state !== 'working') { window.TimerManager.clearGroup('pptProgress'); return; }
      progress++;
      if (progress === 1) window.UI.showBubble('🧠 大纲已就绪，正在进行逐页分布式深度撰写...', 4000);
      if (progress === 3) window.UI.showBubble('✍️ 正在为每一页填充行业洞察与逻辑推导...', 4000);
      if (progress === 6) window.UI.showBubble('🧪 正在校对文稿，确保内容硬核且详实...', 4000);
      if (progress === 10) window.UI.showBubble('🎨 正在进行最后的视觉装潢与排版...', 4000);
    }, 8000);

    let slides = await window.DEPENDENCIES.ipcRenderer.invoke('generate-ppt-content', { topic, ollamaUrl });
    window.TimerManager.clearGroup('pptProgress');

    // ✅ 二次校验：确保 slides 是有效的数组
    if (!Array.isArray(slides)) {
      if (slides && typeof slides === 'object' && Array.isArray(slides.slides)) {
        slides = slides.slides;
      } else {
        throw new Error('AI 返回的数据结构异常，无法解析为幻灯片列表');
      }
    }

    const templates = await window.DEPENDENCIES.ipcRenderer.invoke('get-templates');
    if (templates?.length > 0) {
      await _generateFromTemplate(topic, templates, slides);
    } else {
      await _generateFromScratch(topic, slides);
    }
  } catch (err) {
    console.error('[actions] generatePPT 错误:', err);
    window.UI.showBubble(`😵 PPT生成失败: ${err.message}`, 5000, 'neutral', true);
  } finally {
    window.TimerManager.clearGroup('pptProgress');
    if (s.state === 'working') { s.setState('idle'); s.startIdleTimer(); }
  }
}

async function _generateFromTemplate(topic, templates, slides) {
  let templateId;
  if (templates.length === 1) {
    templateId = templates[0].id;
  } else {
    window.UI.showBubble('🤔 我正在从已学习的模板中挑选最合适的...', 1500);
    templateId = await window.DEPENDENCIES.ipcRenderer.invoke('select-best-template', topic);
    if (!templateId) templateId = templates[0].id;
  }

  const userDataPath = await window.DEPENDENCIES.ipcRenderer.invoke('get-user-data-path');
  const templatePath = window.DEPENDENCIES.path.join(userDataPath, 'templates', templateId, 'template.pptx');
  window.UI.showBubble('📊 正在应用模板并填充 AI 生成的内容...', 2000, 'neutral', false);

  const outputPath = await window.DEPENDENCIES.ipcRenderer.invoke('fill-ppt-template', { templatePath, topic, slides });
  window.UI.showBubble(`✅ 成功！多页PPT已生成并保存到桌面：\n${outputPath}`, 6000);
  window.STORAGE.addEventForDiary('work', `生成了关于"${topic}"的PPT`);
}

async function _generateFromScratch(topic, slides) {
  const PptxGenJS = window.DEPENDENCIES.PptxGenJS;
  const pptx = new PptxGenJS();
  
  window.UI.showBubble('📊 正在根据主题特性匹配最佳排版...', 2000, 'neutral', false);

  slides.forEach((item, index) => {
    let slide = pptx.addSlide();
    const layout = item.layout || 'content';
    const themeColor = (item.themeColor || '#2d3436').replace('#', ''); // 去掉#号

    if (layout === 'cover' || index === 0) {
      // ===== 封面页：基于 AI 建议的色调 =====
      slide.background = { color: themeColor };
      slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0.5, w: '100%', h: 0.1, fill: { color: 'FFFFFF', transparency: 50 } });
      
      slide.addText(item.title, { 
        x: 0.5, y: 1.5, w: 9, h: 1.5, fontSize: 40, bold: true, 
        align: 'center', color: 'FFFFFF', fontFace: '微软雅黑' 
      });
      slide.addText(item.subtitle || '', { 
        x: 0.5, y: 3.0, w: 9, h: 0.5, fontSize: 22, 
        align: 'center', color: 'FFFFFF', fontFace: '微软雅黑', transparency: 20
      });
      slide.addImage({ path: 'images/work.gif', x: 4.2, y: 3.8, w: 1.6, h: 1.6 });

    } else if (layout === 'points') {
      // ===== 要点页：卡片式排版 =====
      slide.background = { color: 'FFFFFF' };
      slide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 0.3, w: 9, h: 0.6, fill: { color: themeColor } });
      slide.addText(item.title, { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 24, bold: true, color: 'FFFFFF', align: 'center' });

      if (item.points && Array.isArray(item.points)) {
        const count = item.points.length;
        const w = (9.5 - (count + 1) * 0.3) / count;
        item.points.forEach((p, i) => {
          const x = 0.5 + i * (w + 0.3);
          // 卡片背景
          slide.addShape(pptx.ShapeType.rect, { x: x, y: 1.2, w: w, h: 3.5, fill: { color: 'F1F2F6' }, line: { color: themeColor, width: 1 } });
          // 卡片标题/序号
          slide.addText(`${i + 1}`, { x: x, y: 1.3, w: w, h: 0.5, fontSize: 32, bold: true, color: themeColor, align: 'center', transparency: 70 });
          // 卡片内容
          slide.addText(p, { x: x + 0.1, y: 1.8, w: w - 0.2, h: 2.8, fontSize: 13, color: '2D3436', align: 'center', valign: 'middle' });
        });
      }
      slide.addImage({ path: 'images/think.gif', x: 8.5, y: 4.8, w: 0.8, h: 0.8 });

    } else if (layout === 'summary') {
      // ===== 总结页：清单式排版 =====
      slide.background = { color: themeColor };
      slide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 0.5, w: 9, h: 4.5, fill: { color: 'FFFFFF' } });
      
      slide.addText(item.title, { x: 1, y: 0.8, w: 8, h: 0.8, fontSize: 32, bold: true, color: themeColor, align: 'left' });
      slide.addShape(pptx.ShapeType.line, { x: 1, y: 1.6, w: 8, h: 0, line: { color: themeColor, width: 3 } });

      slide.addText(item.body || '', { x: 1, y: 1.8, w: 8, h: 1.2, fontSize: 16, color: '636E72', italic: true });

      if (item.points && Array.isArray(item.points)) {
        item.points.forEach((p, i) => {
          slide.addText(`★ ${p}`, { x: 1.2, y: 3.2 + (i * 0.45), w: 7.5, h: 0.4, fontSize: 18, color: '2D3436', bold: true });
        });
      }
      slide.addImage({ path: 'images/dance.gif', x: 7.8, y: 3.8, w: 1.5, h: 1.5 });

    } else {
      // ===== 内容页：双栏/深度解析布局 =====
      slide.background = { color: 'FFFFFF' };
      // 侧边装饰条
      slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.3, h: '100%', fill: { color: themeColor } });
      
      slide.addText(item.title, { x: 0.5, y: 0.3, w: 8, h: 0.6, fontSize: 26, bold: true, color: themeColor });
      slide.addShape(pptx.ShapeType.line, { x: 0.5, y: 0.9, w: 9, h: 0, line: { color: themeColor, width: 2 } });

      // 正文 - 调整字号以适应长文
      const bodyText = item.body || '';
      const fontSize = bodyText.length > 400 ? 11 : (bodyText.length > 200 ? 12 : 14);
      slide.addText(bodyText, { 
        x: 0.5, y: 1.2, w: 6, h: 4, fontSize: fontSize, 
        color: '2D3436', align: 'left', valign: 'top', lineSpacing: 22 
      });

      // 要点盒
      slide.addShape(pptx.ShapeType.rect, { 
        x: 6.8, y: 1.2, w: 2.8, h: 3.5, 
        fill: { color: themeColor, transparency: 90 }, 
        line: { color: themeColor, width: 1 } 
      });
      
      if (item.points && Array.isArray(item.points)) {
        const bulletText = item.points.map(p => ({ text: p, options: { bullet: true, fontSize: 11, color: '2D3436', margin: 5 } }));
        slide.addText(bulletText, { x: 6.9, y: 1.4, w: 2.6, h: 3, valign: 'top' });
      }

      // 根据 AI 建议的情绪选择表情包
      const emotionMap = {
        'neutral': 'images/idle.gif',
        'thinking': 'images/think.gif',
        'success': 'images/dance.gif',
        'warning': 'images/disgust.gif',
        'working': 'images/work.gif',
        'relax': 'images/stretch.gif'
      };
      const petIcon = emotionMap[item.emotion] || emotionMap['neutral'];
      slide.addImage({ path: petIcon, x: 8.8, y: 4.6, w: 0.8, h: 0.8 });
    }
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const desktopPath = window.DEPENDENCIES.path.join(window.DEPENDENCIES.os.homedir(), 'Desktop', `定制版_${topic.replace(/[/\\?%*:|"<>]/g, '')}_${timestamp}.pptx`);
  
  await pptx.writeFile({ fileName: desktopPath });
  window.UI.showBubble(`✅ 定制版PPT已生成！\n内容深度与主题高度契合，已保存至桌面。`, 6000, 'neutral', true);
  window.STORAGE.addEventForDiary('work', `定制了关于"${topic}"的研究报告PPT`);
}

// ==================== 模板接收 ====================
async function receiveTemplate(filePath) {
  if (!filePath?.toLowerCase().endsWith('.pptx')) {
    window.UI.showBubble('😵 我只接受 .pptx 的模板文件哦～', 2000);
    return;
  }
  const s = window.STATE;
  s.setState('working');
  window.UI.showBubble('📥 正在分析模板...', 1500);
  try {
    const ollamaUrl = window.SETTINGS_STORE?.getAll()?.ollamaUrl || 'http://localhost:11434';
    const result = await window.DEPENDENCIES.ipcRenderer.invoke('save-template', filePath, ollamaUrl);
    const userDataPath = await window.DEPENDENCIES.ipcRenderer.invoke('get-user-data-path');
    const templateFolder = window.DEPENDENCIES.path.join(userDataPath, 'templates', result.id);
    window.UI.showBubble(`✅ 模板"${result.name}"已记住！${result.description ? '（' + result.description + '）' : ''}\n📁 位置：${templateFolder}`, 5000);
  } catch (err) {
    window.UI.showBubble(`😵 保存失败：${err.message}`, 2500);
  } finally {
    if (s.state === 'working') { s.setState('idle'); s.startIdleTimer(); }
  }
}

async function selectAndReceiveTemplate() {
  const filePath = await window.DEPENDENCIES.ipcRenderer.invoke('select-ppt-file');
  if (filePath) await receiveTemplate(filePath);
}

// ==================== 意图匹配 ====================
function matchCommand(msg) {
  const m = msg.trim().replace(/[，。！？、\s]+/g, '');
  if (/^(去)?工作[吧！!。]*$/.test(m) || /^开始工作/.test(m)) return 'work';
  if (/^(去)?睡觉[吧！!。]*$/.test(m) || /^我要睡觉/.test(m) || /^晚安/.test(m)) return 'sleep';
  if (/^(来)?玩(一(下|会))?[吧！!。]*$/.test(m) || /^陪我玩/.test(m)) return 'play';
  if (/^(喂|投喂|喂食)(我|你)?/.test(m) || /^给(我|你)?(点|些)?(吃|食物)/.test(m)) return 'feed';
  if (m.length <= 8 && !/不想|不要|懒得|别叫我|不叫|拒绝/.test(m)) {
    if (/工作|上班/.test(m)) return 'work';
    if (/睡觉|睡了|睡吧/.test(m)) return 'sleep';
    if (/玩|玩耍/.test(m)) return 'play';
    if (/喂|吃饭|吃东西|饿了|投食/.test(m)) return 'feed';
  }
  return null;
}

// ==================== 用户输入处理 ====================
async function handleUserInput(msg) {
  // ========== 新增：安静模式指令 ==========
  const silenceMatch = msg.match(/(安静|静音|别吵|闭嘴)[我]?\s*(\d+)\s*(分钟|分|小时|秒)/);
  if (silenceMatch) {
    let duration = parseInt(silenceMatch[2]);
    const unit = silenceMatch[3];
    if (unit === '小时' || unit === '小时') duration *= 60;
    else if (unit === '秒') duration /= 60;
    if (duration > 0 && duration <= 720) { // 最多12小时
      window.STATE.setSilentMode(duration);
      const reply = `😤 哼，安静 ${duration} 分钟，别来烦我！`;
      window.UI.showBubble(reply, 3000);
      window.TTS.speak(reply);
      return;
    }
  }

  const s = window.STATE;
  
  // 用户主动交互，解除安静模式（非安静指令）
  if (window.STATE.isSilentMode() && !silenceMatch) {
    window.STATE.setSilentMode(0);
    window.UI.showBubble('🙄 就知道你会来找我', 1500);
  }

  if (s.idleTimer) clearTimeout(s.idleTimer);
  if (s.state === 'sleeping') {
    // setState('waking') 会自动注册 waking→stretching→idle 的定时器链
    s.setState('waking');
    window.UI.showBubble('🌞 谁叫我？', 2000, 'neutral', false);
  }

  const cmd = matchCommand(msg);
  if (cmd === 'work') { goToWork(); return; }
  if (cmd === 'sleep') { goToBed(true); return; }
  if (cmd === 'play') { play(true); return; }
  if (cmd === 'feed') { sarcasticFeed(); return; }

  if (msg.includes('五子棋')) { startGomoku(); return; }
  if (msg.includes('跳棋')) { startCheckers(); return; }
  if (msg.includes('跳舞') || msg.includes('跳个舞')) { dance(); return; }
  if (msg.includes('伸懒腰') || msg.includes('拉伸')) {
    if (s.state === 'idle') {
      s.dispatch('startStretching');
      window.UI.showBubble('🙆 伸个懒腰，好舒服～', 4000);
    } else {
      window.UI.showBubble('现在不是伸懒腰的时候啦～', 1500);
    }
    return;
  }
  if (msg.includes('忘记')) {
    window.STORAGE.clearHistory();
    window.UI.showBubble('🧹 记忆已清空，我忘记了过去...', 2000);
    return;
  }
  if (msg.includes('查看日记') || msg.includes('看日记')) { window.UI.handleViewDiary(); return; }

  // PPT 生成（统一入口）
  if (/PPT|幻灯片|ppt/.test(msg)) {
    // 改进：不再直接 replace 关键词，而是先询问一次 AI 该消息的核心主题是什么
    window.UI.showBubble('🤔 让我想想这个主题该怎么写...', 1500);
    const ollamaUrl = window.SETTINGS_STORE?.getAll()?.ollamaUrl || 'http://localhost:11434';
    const extractPrompt = `请从以下用户输入中提取他想要制作的PPT的主题。
    输入: "${msg}"
    只需输出主题名称，不要任何其他文字。`;

    fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      body: JSON.stringify({ model: 'qwen2:7b', prompt: extractPrompt, stream: false })
    }).then(res => res.json()).then(data => {
      const topic = data.response.trim().replace(/^"|"$/g, '');
      generatePPT(topic);
    }).catch(() => {
      // 降级：如果 AI 解析失败，用旧的正则逻辑
      let topic = msg.replace(/写|生成|帮我|一个|关于|的|PPT|幻灯片|用|模板|制作|做个/g, '').trim();
      if (!topic) topic = '未命名主题';
      generatePPT(topic);
    });
    return;
  }

  if (msg.includes('打开模板文件夹') || msg.includes('模板文件夹')) {
    const userDataPath = await window.DEPENDENCIES.ipcRenderer.invoke('get-user-data-path');
    const templatesPath = window.DEPENDENCIES.path.join(userDataPath, 'templates');
    window.DEPENDENCIES.shell.openExternal('file:///' + templatesPath.replace(/\\/g, '/'));
    window.UI.showBubble('📂 正在打开模板文件夹...', 2000);
    return;
  }

  window.CHAT.talkToOllama(msg);
}

// ==================== 游戏 ====================
function startGomoku() {
  window.DEPENDENCIES.ipcRenderer.send('open-gomoku');
  const affectionValue = window.AFFECTION?.getValue() ?? 50;
  const affectionPhase = window.AFFECTION?.getPhase() ?? '接受';
  const prompt = `（那个笨蛋邀请你下五子棋。当前好感度：${affectionValue}/100（${affectionPhase}阶段）。请用1句极其傲娇毒舌的话回应，表示虽然觉得他很弱但还是勉强陪他玩玩。只输出话语。）`;
  window.CHAT.talkToOllama(prompt, { skipLearning: true, skipIntercept: true, skipDiary: true });
  window.STORAGE.addEventForDiary('game', '开始下五子棋');
  window.AFFECTION?.change(+1, '邀请下棋');
}

function startCheckers() {
  window.DEPENDENCIES.ipcRenderer.send('open-checkers');
  const affectionValue = window.AFFECTION?.getValue() ?? 50;
  const affectionPhase = window.AFFECTION?.getPhase() ?? '接受';
  const prompt = `（那个笨蛋邀请你下跳棋。当前好感度：${affectionValue}/100（${affectionPhase}阶段）。请用1句极其傲娇毒舌的话回应，嘲讽他的棋艺并勉强接受邀请。只输出话语。）`;
  window.CHAT.talkToOllama(prompt, { skipLearning: true, skipIntercept: true, skipDiary: true });
  window.STORAGE.addEventForDiary('game', '开始下跳棋');
  window.AFFECTION?.change(+1, '邀请下棋');
}

// ==================== 节日祝福 ====================
function festivalGreet() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const todayStr = `${month}-${String(day).padStart(2, '0')}`;
  const profile = window.STORAGE.getLearningData().userProfile || {};
  const lunarData = window.CONFIG.LUNAR_NEW_YEAR_DATES;
  const festivals = window.CONFIG.FESTIVALS || [];

  function getLunarFestivals() {
    if (!lunarData?.[year]) return { eve: null, spring: null };
    const [springMonth, springDay] = lunarData[year];
    const springDate = new Date(year, springMonth - 1, springDay);
    const springStr = `${springMonth}-${String(springDay).padStart(2, '0')}`;
    const eveDate = new Date(springDate);
    eveDate.setDate(eveDate.getDate() - 1);
    const eveStr = `${eveDate.getMonth() + 1}-${String(eveDate.getDate()).padStart(2, '0')}`;
    return { eve: eveStr, spring: springStr };
  }

  const lunar = getLunarFestivals();
  const matchedFestivals = festivals.filter(f => f.month === month && f.day === day);

  // 用户生日
  if (profile.birthday === todayStr) {
    const lastBirthday = window.STORAGE.getFestivalLastDate();
    if (lastBirthday !== `birthday-${todayStr}`) {
      window.UI.showBubble(`🎂 生日快乐！今天是你的大日子，记得吃蛋糕哦～ 🎉🎈`, 9000, 'neutral', true);
      window.STORAGE.setFestivalLastDate(`birthday-${todayStr}`);
      return;
    }
  }

  // 寻慧生日
  const girlBirthday = window.STORAGE.getLearningData().girlProfile?.birthday;
  if (girlBirthday === todayStr) {
    const lastDate = window.STORAGE.getFestivalLastDate();
    if (lastDate !== `girl-birthday-${todayStr}`) {
      window.UI.showBubble(`🎂 今天是我的生日！谢谢那个笨蛋还记得～我会一直陪着你哒！`, 8000, 'neutral', true);
      window.STORAGE.setFestivalLastDate(`girl-birthday-${todayStr}`);
      return;
    }
  }

  // 除夕/春节
  if (lunar.eve === todayStr || lunar.spring === todayStr) {
    const lastDate = window.STORAGE.getFestivalLastDate();
    if (lastDate !== todayStr) {
      const msg = lunar.eve === todayStr ? '🏮 除夕快乐！今晚要守岁吃饺子，团团圆圆～' : '🏮 春节快乐！祝你在新的一年里万事如意！🧧';
      window.UI.showBubble(msg, 8000, 'neutral', true);
      window.STORAGE.setFestivalLastDate(todayStr);
      return;
    }
  }

  // 其他节日
  for (const f of matchedFestivals) {
    const lastDate = window.STORAGE.getFestivalLastDate();
    if (lastDate === todayStr) return;
    let greeting = f.greetings[Math.floor(Math.random() * f.greetings.length)];
    window.UI.showBubble(`🎉 ${f.name}快乐！${greeting}`, 8000, 'neutral', true);
    window.STORAGE.setFestivalLastDate(todayStr);
    break;
  }
}

// ==================== 导出 ====================
window.ACTIONS = {
  goToWork,
  goToBed,
  play,
  feed,
  sarcasticFeed,
  begForFood,
  rejectFood,
  sassyWakeUp,
  dance,
  aiTellTime,
  searchWeb,
  generatePPT,
  receiveTemplate,
  selectAndReceiveTemplate,
  handleUserInput,
  startGomoku,
  startCheckers,
  festivalGreet,
  playMusicOnline,
  stopCurrentMusic
};
