// ==================== 配置常量 ====================
// 图像映射
const imgMap = {
    idle: 'images/idle.gif',
    idle2: 'images/idle2.gif',
    walking: 'images/walk.gif',
    working: 'images/work.gif',
    sleeping: 'images/sleep.gif',
    playing: 'images/play.gif',
    playing2: 'images/play2.gif',
    eating: 'images/eat.gif',
    waking: 'images/wake.gif',
    stretching: 'images/stretch.gif',
    dancing: 'images/dance.gif',
    disgust: 'images/disgust.gif',
    think: 'images/think.gif'
};

// 文件路径配置
const FILE_PATHS = {
    diary: '.girlpet_diary.txt',
    learning: '.girlpet_learning.json',
    history: '.girlpet_chat_history.json',
    lyrics: '.girlpet_lyrics.json'
};

// 状态配置
const STATE_CONFIG = {
    minDuration: 600000,           // 状态最少保持 10 分钟
    idleTimeout: 600000,             // 空闲超时 10 分钟
    randomPlayMin: 60000,          // 随机玩耍最小间隔（1分钟）
    randomPlayMax: 180000,         // 随机玩耍最大间隔（3分钟）
    innerThoughtChance: 0.25,       // 内心独白概率（25%）
    hungerMin: 300000,             // 饥饿最小间隔（5分钟）
    hungerMax: 900000              // 饥饿最大间隔（15分钟）
};

// 睡眠时间配置
const SLEEP_CONFIG = {
    sleepTime: { hour: 22, minute: 0 },
    wakeTime: { hour: 7, minute: 0 },
    checkInterval: 60000 ,          // 检查间隔 1 分钟
    wakeAnimDuration: 4000,      // 苏醒动画时长（毫秒），可自行修改
    stretchAnimDuration: 2000    // 伸懒腰动画时长（可选）
};

// 游戏反应配置
const GAME_REACTIONS = {
    player: [
        '哼，这次就算你运气好……下次绝对赢回来！',
        '切，笨蛋居然赢了？你一定是作弊了吧！',
        '赢了就一副傻笑的样子，真是受不了你。',
        '别太得意了，这次是我让你而已！'
    ],
    ai: [
        '😎 哈哈，白痴！我就说你赢不了我吧！',
        '承让承让～这就是实力的差距，懂吗？',
        '😏 啧啧，你刚才那步棋也太离谱了。',
        '哼，赢你这种笨蛋简直轻而易举。'
    ],
    draw: '🤝 平局？切，这次算你走运，下次一定要分出胜负！'
};

// 玩耍动作配置
const PLAY_ACTIONS = [
    { text: '♪ 哼哼～笨蛋～ ♪', sound: '哼哼哼，大笨蛋' },
    { text: '😄 略略略～抓不到我吧', sound: '略略略，抓不到我吧' },
    { text: '🎵 啦啦啦～今天心情勉强还行', sound: '啦啦啦，今天心情勉强还行' },
    { text: '😊 喂，看什么看，没见过美少女吗', sound: '喂，看什么看，没见过美少女吗' },
    { text: '🎶 哒哒哒～笨蛋笨蛋笨蛋', sound: '哒哒哒，大笨蛋' }
];

// 日记动作映射
const DIARY_ACTIONS = {
    feed: (name) => `${name} 喂我吃东西，哼，味道也就那样吧。`,
    work: (name) => `${name} 让我去工作，我是看在报酬份上才去的！`,
    play: (name) => `${name} 居然想陪我玩，真是个无可救药的闲人。`,
    sleep: (name) => `困死了，${name} 这种笨蛋肯定还没睡吧，晚安。`,
    talk: (name, detail) => `和笨蛋 ${name} 废话了几句：${detail}`,
    wake: () => `啧，居然被叫醒了，起床气还没消呢！`,
    search: (name, detail) => `${name} 让我搜"${detail}"，连这都不知道吗？`,
    gomoku: (name) => `和笨蛋 ${name} 下五子棋，他的棋艺真烂。`,
    checkers: (name) => `和笨蛋 ${name} 下跳棋，赢他太简单了。`,
    default: (name) => `${name} 又在烦我了……`
};

// 食物图标
const FOOD_ICONS = ['🍎', '🍰', '🍪', '🍔', '🍕', '🍩'];

// 情绪反应
const EMOTION_REACTIONS = {
    diary: [
        '😳 哎呀，被你发现我的小秘密了...',
        '😊 你居然偷偷看我的日记！不过...很开心～',
        '😏 哼！看就看吧，反正写的都是你～',
        '🤗 以后我们可以一起写日记哦！',
        '😜 下次要提前告诉我，我打扮一下日记本～'
    ]
};

// 位置配置
const POSITION_CONFIG = {
    baseWorkPos: { x: 300, y: 300 },
    baseBedPos: { x: 200, y: 400 }
};

// ==================== 节日祝福配置 ====================
const FESTIVALS = [
    { month: 1, day: 1, name: '元旦', greetings: ['新年快乐！新的一年也要一起加油哦~', '元旦快乐！今天适合许愿！'] },
    { month: 2, day: 14, name: '情人节', greetings: ['情人节快乐！要一直甜甜蜜蜜的呀~', '今天是情人节，送你一颗虚拟巧克力 🍫'] },
    { month: 3, day: 8, name: '妇女节', greetings: ['女神节快乐！今天你是最美的~'] },
    { month: 4, day: 1, name: '愚人节', greetings: ['愚人节快乐！今天我说的话可别全信哦~'] },
    { month: 5, day: 1, name: '劳动节', greetings: ['劳动节快乐！辛苦啦，好好休息一下吧~'] },
    { month: 6, day: 1, name: '儿童节', greetings: ['儿童节快乐！谁还不是个宝宝呢~'] },
    { month: 10, day: 1, name: '国庆节', greetings: ['国庆快乐！假期愉快~'] },
    { month: 12, day: 25, name: '圣诞节', greetings: ['圣诞快乐！今晚会有礼物吗？🎄'] }
];

// ==================== 农历春节公历日期表（除夕 = 春节前一天） ====================
// 格式：年份 -> [月份, 日期]，例如 '2026': [2, 17] 表示2026年春节是2月17日
const LUNAR_NEW_YEAR_DATES = {
    '2026': [2, 17],
    '2027': [2,  6],
    '2028': [1, 26],
    '2029': [2, 13],
    '2030': [2,  3]
};

// 导出配置
window.CONFIG = {
    imgMap,
    FILE_PATHS,
    STATE_CONFIG,
    SLEEP_CONFIG,
    GAME_REACTIONS,
    PLAY_ACTIONS,
    DIARY_ACTIONS,
    FOOD_ICONS,
    EMOTION_REACTIONS,
    FESTIVALS,            
    LUNAR_NEW_YEAR_DATES,
    ...POSITION_CONFIG
};