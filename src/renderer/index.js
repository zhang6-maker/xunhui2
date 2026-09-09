/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  模块墓志铭
 * ═══════════════════════════════════════════════════════════════════════════
 * 模块名称: index.js - 入口模块
 * 模块职责: 初始化整个应用，协调各模块启动
 * 
 * 依赖模块:（所有模块在 HTML 中按顺序加载）
 *   - window.SETTINGS_STORE: 设置存储
 *   - window.DEPENDENCIES: 系统能力
 *   - window.CONFIG: 配置信息
 *   - window.STORAGE: 本地存储
 *   - window.STATE: 状态管理
 *   - window.REMINDERS: 提醒系统
 *   - window.DRAG: 拖拽交互
 *   - window.CHAT: 对话系统
 *   - window.AFFECTION: 好感度
 *   - window.ACTIONS: 动作执行
 *   - window.TTS: 语音合成
 *   - window.VOICE: 语音输入
 * 
 * 生命周期:
 *   - init(): 应用入口，初始化所有模块
 *   - _onGirlClick(e): 角色点击事件处理
 *   - _onDragOver(e): 拖放文件处理
 * 
 * 注意事项:
 *   - ⚠️ 模块加载顺序很重要（deps.js 必须最先）
 *   - ⚠️ Electron 环境下通过 preload 注入 API
 *   - ⚠️ 浏览器环境下 API 来自模拟对象
 * ═══════════════════════════════════════════════════════════════════════════
 */

async function init() {
  console.log('🚀 寻慧 v2 初始化中...');

  window.SETTINGS_STORE.load();

  const girl = window.DEPENDENCIES.girl;
  if (!girl) { console.error('无法获取 girl 元素'); return; }

  // 加载存储数据
  window.STORAGE.loadLearning();
  window.STORAGE.loadHistory();

  // 启动后台服务
  window.STATE.startAutoSleepCheck();
  window.REMINDERS.startReminderCheck();
  window.DRAG.startHungerTimer();

  // 初始化交互
  window.DRAG.initGirlDrag();
  window.DRAG.initDragDrop();

  // 点击事件
  girl.addEventListener('click', _onGirlClick);

  // 初始状态
  window.STATE.setState('idle');
  window.STATE.updatePosition();

  // 隐身按钮
  _initToggleBtn();

  // 快捷键强制显示
  window.DEPENDENCIES.ipcRenderer.on('force-show-girl', _forceShowGirl);

  // 游戏结果
  window.DEPENDENCIES.ipcRenderer.on('game-result', (data) => {

    // 防御：如果主进程发空消息，直接忽略
    if (!data) {
        console.warn('⚠️ 收到 game-result 空消息，已忽略');
        return;
    }
    
    const result = data.result;
    const game = data.game;
    
    // 记录战绩
    window.STORAGE.recordGameResult(game, result);
    
    // 获取累计战绩
    const stats = window.STORAGE.getGameStats(game);
    const totalGames = stats.wins + stats.losses + stats.draws;
    
    // 触发 AI 动态反应
    const affectionValue = window.AFFECTION?.getValue() ?? 50;
    const affectionPhase = window.AFFECTION?.getPhase() ?? '接受';
    
    let resultText = result === 'player' ? '你赢了' : (result === 'ai' ? '我赢了' : '平局');
    const prompt = `（${game === 'gomoku' ? '五子棋' : '跳棋'}游戏结束。结果：${resultText}。目前累计战绩：我赢了${stats.wins}局，你赢了${stats.losses}局。当前好感度：${affectionValue}/100（${affectionPhase}阶段）。请用1句极其傲娇、毒舌的话对结果进行点评。注意：如果你输了，要表现得不服气；如果你赢了，要狠狠嘲讽。只输出话语。）`;
    
    window.CHAT.talkToOllama(prompt, { skipLearning: true, skipIntercept: true });
  });

  console.log('✅ 寻慧 v2 初始化完成');

  // 页面关闭前清理所有定时器
  window.addEventListener('beforeunload', () => {
      TimerManager.clearAll();
      console.log('[TimerManager] 已清理所有定时器');
  });

  // 自动检测 Ollama
  window.OLLAMA_CHECKER.performStartupCheck();

  // 等待 TTS 就绪后说启动语
  _speakStartupGreeting();

  // 初始化状态变更监听器（视图层负责 DOM 更新）
  _initStateListeners();
}

// ==================== 状态变更监听器（视图层） ====================
// 【重构 2026-05-22】：从 state.js 移出的 DOM 操作逻辑
// 状态机只发事件，视图层负责实际的 DOM 更新
let _sleepAudio = null;

function _initStateListeners() {
  // 监听状态即将变更
  window.addEventListener('stateWillChange', (e) => {
    const { oldState, newState } = e.detail;
    console.log(`[UI] 状态即将变更: ${oldState} → ${newState}`);
  });

  // 监听状态已变更
  window.addEventListener('stateChanged', (e) => {
    const { newState, oldState } = e.detail;
    const girl = window.DEPENDENCIES?.girl;
    if (!girl) return;

    // ===== 动画切换 =====
    const FORCE_RELOAD_STATES = ['waking', 'stretching', 'playing', 'dancing', 'eating', 'working'];
    let newSrc;
    if (newState === 'idle') {
      newSrc = Math.random() < 0.5
        ? window.CONFIG.imgMap.idle2
        : window.CONFIG.imgMap.idle;
    } else if (newState === 'playing') {
      newSrc = Math.random() < 0.5
        ? window.CONFIG.imgMap.playing2
        : window.CONFIG.imgMap.playing;
    } else {
      newSrc = window.CONFIG.imgMap[newState] || window.CONFIG.imgMap.idle;
    }

    if (FORCE_RELOAD_STATES.includes(newState)) {
      girl.src = newSrc + '?t=' + Date.now();
    } else {
      girl.src = newSrc;
    }

    // ===== 透明度 =====
    girl.style.opacity = newState === 'sleeping' ? '0.8' : '1';

    // ===== 睡眠音频 =====
    if (newState === 'sleeping') {
      window.DRAG?.hideFoodIcon?.();
      window.DRAG?.stopHungerTimer?.();
      _startSleepAudio();
    } else if (oldState === 'sleeping') {
      _stopSleepAudio();
    }

    // ===== 节日检查：sleeping→idle 时 =====
    if (oldState === 'sleeping' && newState === 'idle') {
      setTimeout(() => window.ACTIONS?.festivalGreet?.(), 1000);
    }
  });
}

function _startSleepAudio() {
  if (!_sleepAudio) {
    _sleepAudio = new Audio('sleep.wav');
    _sleepAudio.loop = true;
  }
  _sleepAudio.currentTime = 0;
  _sleepAudio.play().catch(err => console.warn('播放 sleep.wav 失败:', err));
}

function _stopSleepAudio() {
  if (_sleepAudio) {
    _sleepAudio.pause();
    _sleepAudio.currentTime = 0;
    _sleepAudio = null;
  }
}

// ==================== 点击事件 ====================
function _onGirlClick() {
  if (window.STATE.isSilentMode()) {
    window.STATE.setSilentMode(0);
    window.UI.showBubble('😏 哼，就知道你会来找我', 2000);
    window.TTS.speak('哼，就知道你会来找我');
  }
  
  window.UI.onUserInteract();
  if (window.STATE.idleTimer) clearTimeout(window.STATE.idleTimer);

  if (window.STATE.state === 'sleeping') {
    // setState('waking') 会自动注册 waking(2.5s)→stretching(2s)→idle 的定时器链
    window.STATE.setState('waking');

    // 唤醒完成后（约5秒）触发起床气 + 重启饥饿定时器
    TimerManager.setTimeout('wakeComplaint', () => {
      if (window.STATE.state === 'idle' && !window.STATE.isSpeaking) {
        window.OLLAMA_CHECKER.performStartupCheck();
        window.STATE.resetAutoActionTime();
        window.STATE.lastWakeUpTime = Date.now();
        window.DRAG?.startHungerTimer?.();

        const now = Date.now();
        const last = window.STATE.lastWakeUpComplaintTime || 0;
        if (now - last > 30 * 60 * 1000) {
          window.STATE.lastWakeUpComplaintTime = now;
          window.ACTIONS.sassyWakeUp();
        }
      }
    }, 5500);
    return;
  }
  window.UI.showCustomInput();
}

// ==================== 隐身按钮 ====================
function _initToggleBtn() {
  const toggleBtn = document.getElementById('toggleVisibilityBtn');
  if (!toggleBtn) return;

  // 确保按钮始终在可见区域内
  function keepButtonInView() {
    if (!toggleBtn) return;
    
    // 先强制重置到右下角，确保基础位置正确
    toggleBtn.style.left = '';
    toggleBtn.style.top = '';
    toggleBtn.style.bottom = '5px';
    toggleBtn.style.right = '5px';
    
    // 然后检查是否在可见区域内
    const rect = toggleBtn.getBoundingClientRect();
    
    // 如果按钮完全或部分超出边界，移动到最近的角落
    if (rect.right > window.innerWidth || rect.left < 0 ||
        rect.bottom > window.innerHeight || rect.top < 0) {
      // 计算按钮应该在哪个角落
      const centerX = (rect.left + rect.right) / 2;
      const centerY = (rect.top + rect.bottom) / 2;
      
      // 确定应该放在哪个角落
      const isLeft = centerX < window.innerWidth / 2;
      const isTop = centerY < window.innerHeight / 2;
      
      toggleBtn.style.left = isLeft ? '5px' : '';
      toggleBtn.style.right = isLeft ? '' : '5px';
      toggleBtn.style.top = isTop ? '5px' : '';
      toggleBtn.style.bottom = isTop ? '' : '5px';
    }
  }

  toggleBtn.addEventListener('click', () => {
    const girl = window.DEPENDENCIES.girl;
    const bubble = window.DEPENDENCIES.bubble;
    if (!girl) return;

    if (window.STATE.isHidden) {
      window.DEPENDENCIES.ipcRenderer.send('toggle-visibility', false);
      girl.style.display = 'block';
      girl.style.pointerEvents = 'auto';
      if (bubble) bubble.style.pointerEvents = 'auto';
      toggleBtn.innerHTML = '👁️';
      toggleBtn.style.width = '36px';
      toggleBtn.style.height = '36px';
      toggleBtn.style.fontSize = '20px';
      toggleBtn.style.background = 'rgba(255,255,255,0.7)';
      window.STATE.isHidden = false;
    } else {
      girl.style.display = 'none';
      girl.style.pointerEvents = 'none';
      if (bubble) { bubble.style.display = 'none'; bubble.style.pointerEvents = 'none'; }
      window.DEPENDENCIES.ipcRenderer.send('toggle-visibility', true);
      toggleBtn.innerHTML = '👁️‍🗨️';
      window.STATE.isHidden = true;
    }
    // 点击后确保按钮在可见区域内
    keepButtonInView();
  });

  // 窗口大小变化时检查按钮位置
  window.addEventListener('resize', keepButtonInView);
  
  // 定期检查按钮位置（处理窗口移动的情况）
  TimerManager.setInterval('toggleBtn', keepButtonInView, 1000);
  
  // 页面加载时检查一次
  setTimeout(keepButtonInView, 100);
}

function _forceShowGirl() {
  const girl = window.DEPENDENCIES.girl;
  const bubble = window.DEPENDENCIES.bubble;
  if (!girl) return;
  girl.style.display = 'block';
  girl.style.pointerEvents = 'auto';
  if (bubble) bubble.style.pointerEvents = 'auto';
  const toggleBtn = document.getElementById('toggleVisibilityBtn');
  if (toggleBtn) {
    toggleBtn.innerHTML = '👁️';
    toggleBtn.style.width = '36px';
    toggleBtn.style.height = '36px';
    toggleBtn.style.fontSize = '20px';
    toggleBtn.style.background = 'rgba(255,255,255,0.7)';
  }
  window.STATE.isHidden = false;
  window.DEPENDENCIES.ipcRenderer.send('toggle-visibility', false);
}

// ==================== 启动语 ====================
async function _speakStartupGreeting() {
  const ttsUrl = window.SETTINGS_STORE.getAll().ttsUrl || 'http://127.0.0.1:8001/synthesize/';
  const ready = await _waitForTTS(ttsUrl, 20000);

  if (!ready) {
    // TTS 未就绪，但仍然显示文字启动语，不阻断流程
    console.warn('[index] TTS 服务未就绪，降级为纯文字模式');
  }

  // 无论 TTS 是否就绪，都显示启动语（TTS 内部有降级到浏览器语音的逻辑）
  window.UI.showBubble('🤔 正在苏醒中...', 2000, 'neutral', false);

  TimerManager.setTimeout('startup', async () => {
    const now = new Date();
    const hour = now.getHours();
    const timeStr = `${hour}点${String(now.getMinutes()).padStart(2,'0')}分`;
    const timeOfDay = hour < 6 ? '凌晨' : hour < 9 ? '早上' : hour < 12 ? '上午' : hour < 14 ? '中午' : hour < 18 ? '下午' : hour < 22 ? '晚上' : '深夜';

    let affectionHint = '';
    if (window.AFFECTION) {
      affectionHint = `当前好感度是${window.AFFECTION.getValue()}/100，处于"${window.AFFECTION.getPhase()}"阶段。`;
    }

    const lastBoot = window.STORAGE.getLastBootDate?.() || '';
    const today = new Date().toLocaleDateString();
    let prompt;

    if (lastBoot === today) {
      const history = (window.STORAGE.getHistory?.() || []).slice(-4);
      const context = history.length > 0
        ? '重启前你们最后的对话是：\n' + history.map(h => `${h.role === 'user' ? '你' : '我'}: ${h.content}`).join('\n')
        : '你刚刚被重启了。';
      prompt = `（你刚刚被重启了。现在是${timeOfDay}，时间大约是${timeStr}。${affectionHint}${context}\n请用一句傲娇、有个性的话告诉那个笨蛋"我回来了"，表现出你不耐烦但还是回来了的态度。只输出话语，不要任何解释）`;
    } else {
      prompt = `（你刚刚被启动了。现在是${timeOfDay}，时间大约是${timeStr}。${affectionHint}你是一个有独立人格的小精灵，不是宠物或工具。请用1句傲娇、有主见的话作为开场白，表达你自己的情绪和态度。要求：结合时间和好感度，只输出话语，不要任何解释）`;
      window.STORAGE.setLastBootDate?.(today);
    }

    if (window.CHAT?.talkToOllama) {
      window.CHAT.talkToOllama(prompt, { skipLearning: true, skipDiary: true, skipIntercept: true });
    } else {
      window.UI.showBubble('哼！我才不是特意等你呢… 有事快说！', 3000);
    }
  }, 3000);
}

async function _waitForTTS(ttsUrl, maxWait = 30000) {
  let baseUrl;
  try {
    const u = new URL(ttsUrl);
    baseUrl = `${u.protocol}//${u.host}/health`;
  } catch (_) {
    baseUrl = 'http://127.0.0.1:8001/health';
  }

  const started = Date.now();
  while (Date.now() - started < maxWait) {
    try {
      const res = await fetch(baseUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok') {
          console.log('[TTS] 服务已就绪');
          return true;
        }
      }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 500));
  }
  console.warn('[TTS] 服务等待超时');
  return false;
}

// DOM 就绪后执行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

window.INDEX = { init };
