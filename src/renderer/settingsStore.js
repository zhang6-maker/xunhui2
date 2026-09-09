// settingsStore.js
// 依赖: window.DEPENDENCIES (必须在 deps.js 之后加载)

const PATH = window.DEPENDENCIES.path;
const OS = window.DEPENDENCIES.os;
const FS = window.DEPENDENCIES.fs;

const SETTINGS_FILE = PATH.join(OS.homedir(), '.girlpet_settings.json');

const DEFAULT_SETTINGS = {
    ollamaUrl: 'http://localhost:11435',
    ollamaModel: 'qwen2:7b',
    ttsUrl: 'http://127.0.0.1:8001/synthesize/',
    ttsVoice: 'zh-CN-XiaoyiNeural',
    sleepTimeHour: 22,
    sleepTimeMinute: 0,
    wakeTimeHour: 7,
    wakeTimeMinute: 0,
    workPosX: 300,
    workPosY: 300,
    bedPosX: 200,
    bedPosY: 400,
    idleTimeoutSec: 30,
    stateMinDurationSec: 600,
    randomPlayMinSec: 10,
    randomPlayMaxSec: 30,
    hungerMinSec: 30,
    hungerMaxSec: 90
};

let currentSettings = { ...DEFAULT_SETTINGS };

function loadSettings() {
    try {
        if (FS.existsSync(SETTINGS_FILE)) {
            const data = FS.readFileSync(SETTINGS_FILE, 'utf8');
            Object.assign(currentSettings, JSON.parse(data));
        } else {
            saveSettings(); // 首次运行保存默认值
        }
    } catch (e) {
        console.error('加载设置失败:', e);
    }
    return currentSettings;
}

function saveSettings() {
    try {
        FS.writeFileSync(SETTINGS_FILE, JSON.stringify(currentSettings, null, 2), 'utf8');
    } catch (e) {
        console.error('保存设置失败:', e);
    }
}

function updateSetting(key, value) {
    if (currentSettings.hasOwnProperty(key)) {
        currentSettings[key] = value;
        saveSettings();
        return true;
    }
    return false;
}

window.SETTINGS_STORE = {
    load: loadSettings,
    save: saveSettings,
    update: updateSetting,
    getAll: () => currentSettings
};