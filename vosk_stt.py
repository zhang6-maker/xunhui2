import sys
import json
import os
import wave
import numpy as np
from vosk import Model, KaldiRecognizer

def transcribe(audio_path):
    # 自适应模型路径（开发与打包环境通用）
    if getattr(sys, 'frozen', False):
        base_dir = os.path.dirname(sys.executable) if sys.platform == 'win32' else os.path.dirname(__file__)
        model_path = os.path.join(base_dir, 'bin', 'vosk-model-cn-0.22')
    else:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        model_path = os.path.join(script_dir, 'bin', 'vosk-model-cn-0.22')

    if not os.path.exists(model_path):
        sys.stderr.write(f"Model not found at {model_path}\n")
        return ""

    # 加载模型
    model = Model(model_path)

    # 使用 wave 模块读取 WAV 文件（不依赖 soundfile）
    try:
        wf = wave.open(audio_path, 'rb')
    except Exception as e:
        sys.stderr.write(f"Wave open error: {e}\n")
        return ""

    if wf.getnchannels() != 1:
        sys.stderr.write("Audio must be mono\n")
        wf.close()
        return ""
    if wf.getframerate() != 16000:
        sys.stderr.write("Audio sample rate must be 16000\n")
        wf.close()
        return ""

    audio_data = wf.readframes(wf.getnframes())
    wf.close()

    audio = np.frombuffer(audio_data, dtype=np.int16)
    sys.stderr.write(f"Audio loaded: {len(audio)} samples, rate=16000\n")

    recognizer = KaldiRecognizer(model, 16000)
    recognizer.SetWords(False)

    chunk_size = 4000
    text = ""
    for start in range(0, len(audio), chunk_size):
        chunk = audio[start:start+chunk_size]
        if recognizer.AcceptWaveform(chunk.tobytes()):
            res = json.loads(recognizer.Result())
            text += res.get("text", "") + " "
    final_res = json.loads(recognizer.FinalResult())
    text += final_res.get("text", "")
    return text.strip()

if __name__ == "__main__":
    # 强制 UTF-8 输出，解决 Electron 乱码
    sys.stdout.reconfigure(encoding='utf-8')
    if len(sys.argv) < 2:
        print("")
        sys.exit(1)
    result = transcribe(sys.argv[1])
    print(result)