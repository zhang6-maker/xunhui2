/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  模块墓志铭
 * ═══════════════════════════════════════════════════════════════════════════
 * 模块名称: voice.js - 语音输入模块
 * 模块职责: 通过麦克风录音，将语音转为文字（通过主进程处理，绕过 app:// 安全限制）
 * 
 * 依赖模块:
 *   - window.UI: UI 交互（showBubble）
 *   - window.ACTIONS: 动作执行（doAction）
 *   - window.voiceAPI: 主进程语音 API
 * 
 * 生命周期:
 *   - initVoiceInput(): 初始化语音输入按钮
 *   - startVoiceInput(): 开始录音
 *   - 模块初始化时自动注入 window.VOICE
 * 
 * 注意事项:
 *   - ✅ 通过主进程处理麦克风访问，绕过 app:// 协议的安全上下文限制
 *   - ⚠️ 录音中 UI 显示粉色提示框
 * ═══════════════════════════════════════════════════════════════════════════
 */
// ==================== 语音输入模块 ====================
// 依赖: window.UI, window.ACTIONS, window.voiceAPI

let isRecording = false;
let voiceInputBtn = null;

async function startVoiceInput() {
    if (isRecording) {
        window.UI.showBubble('正在录音中...', 1000);
        return;
    }

    const btn = document.getElementById('voiceInputBtn');
    voiceInputBtn = btn;

    try {
        // 立即显示录音状态
        isRecording = true;
        if (btn) btn.style.background = '#ff6666';
        window.UI.showBubble('🎙️ 正在录音，请说话...', 3000, 'neutral', false);

        // 使用主进程的语音 API（绕过 app:// 协议的安全上下文限制）
        // 这个调用会阻塞直到录音完成（约5秒）
        const result = await window.voiceAPI.startRecording();

        // 录音完成，恢复按钮状态
        isRecording = false;
        if (btn) btn.style.background = '#ff99cc';

        if (!result.success) {
            window.UI.showBubble(result.error || '录音失败', 2000);
            return;
        }

        // 录音成功，直接识别
        await stopVoiceInput();

    } catch (e) {
        console.error('麦克风访问失败', e);
        isRecording = false;
        if (btn) btn.style.background = '#ff99cc';
        window.UI.showBubble('无法访问麦克风，请检查权限', 2000);
    }
}

async function stopVoiceInput() {
    try {
        const result = await window.voiceAPI.stopRecording();
        
        if (result.success && result.text) {
            const text = result.text;
            console.log('🔊 语音识别原始结果:', text);
            if (text && text.trim() !== '') {
                const inputEl = document.getElementById('customInputText');
                if (inputEl) {
                    inputEl.value = text;
                }
                window.ACTIONS.handleUserInput(text);
            } else {
                window.UI.showBubble('😵 没有听清，请重试', 2000);
            }
        } else {
            window.UI.showBubble(result.error || '识别失败，请稍后重试', 2000);
        }
    } catch (e) {
        console.error('录音停止失败:', e);
        window.UI.showBubble('录音停止失败', 2000);
    }
}

// 手动构建标准 WAV 文件头（使用 ArrayBuffer + DataView）
function buildWav(samples, sampleRate) {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const dataSize = samples.length * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset, str) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);           // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    for (let i = 0; i < samples.length; i++) {
        view.setInt16(44 + i * 2, samples[i], true);
    }
    return new Uint8Array(buffer);
}

// 将 WebM/Opus 等格式转为 16kHz 单声道 WAV
async function convertToWav(audioBlob) {
    const audioContext = new AudioContext({ sampleRate: 16000 });
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    let channelData;
    if (audioBuffer.numberOfChannels > 1) {
        const left = audioBuffer.getChannelData(0);
        const right = audioBuffer.getChannelData(1);
        channelData = new Float32Array(left.length);
        for (let i = 0; i < left.length; i++) {
            channelData[i] = (left[i] + right[i]) / 2;
        }
    } else {
        channelData = audioBuffer.getChannelData(0);
    }

    const samples = new Int16Array(channelData.length);
    for (let i = 0; i < channelData.length; i++) {
        const s = Math.max(-1, Math.min(1, channelData[i]));
        samples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    return buildWav(samples, 16000);
}

// 保存临时 WAV 文件（通过 IPC 写入）
async function saveTempWavFile(wavBuffer) {
    const tempDir = window.DEPENDENCIES.os.tmpdir();
    const tempFilePath = window.DEPENDENCIES.path.join(tempDir, `voice_${Date.now()}.wav`);
    try {
        await window.DEPENDENCIES.fs.promises.writeFile(tempFilePath, wavBuffer);
        console.log('临时 WAV 文件已保存:', tempFilePath);
        return tempFilePath;
    } catch (err) {
        console.error('保存临时 WAV 文件失败:', err);
        throw err;
    }
}

window.VOICE = {
    startVoiceInput,
    stopVoiceInput
};
