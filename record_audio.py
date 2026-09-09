#!/usr/bin/env python3
import sys
import os
import time
import wave

# 录音时长（秒）
RECORD_DURATION = 5

# 优先尝试 sounddevice（更轻量）
try:
    import sounddevice as sd
    HAS_SOUNDDEVICE = True
except ImportError:
    HAS_SOUNDDEVICE = False

# 备选：尝试 pyaudio
try:
    import pyaudio
    HAS_PYAUDIO = True
except ImportError:
    HAS_PYAUDIO = False

CHANNELS = 1
RATE = 16000

def record_with_sounddevice(output_path):
    print("Recording with sounddevice...", file=sys.stderr)
    
    frames = []
    
    def callback(indata, frames_count, time_info, status):
        if status:
            print(f"Audio callback status: {status}", file=sys.stderr)
        frames.append(indata.copy())
    
    with sd.InputStream(samplerate=RATE, channels=CHANNELS, dtype='int16', callback=callback):
        # 录音指定时长
        sd.sleep(RECORD_DURATION * 1000)
    
    # 写入 WAV 文件
    with wave.open(output_path, 'wb') as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(RATE)
        wf.writeframes(b''.join(frames))
    
    print(f"Saved to {output_path}", file=sys.stderr)

def record_with_pyaudio(output_path):
    print("Recording with pyaudio...", file=sys.stderr)
    
    import pyaudio
    
    p = pyaudio.PyAudio()
    stream = p.open(format=pyaudio.paInt16, channels=CHANNELS, rate=RATE, input=True, frames_per_buffer=1024)
    
    frames = []
    start_time = time.time()
    
    while time.time() - start_time < RECORD_DURATION:
        try:
            data = stream.read(1024)
            frames.append(data)
        except Exception as e:
            print(f"Read error: {e}", file=sys.stderr)
            break
    
    stream.stop_stream()
    stream.close()
    p.terminate()
    
    # 写入 WAV 文件
    with wave.open(output_path, 'wb') as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(p.get_sample_size(pyaudio.paInt16))
        wf.setframerate(RATE)
        wf.writeframes(b''.join(frames))
    
    print(f"Saved to {output_path}", file=sys.stderr)

def main():
    if len(sys.argv) != 2:
        print("Usage: python record_audio.py <output_file.wav>", file=sys.stderr)
        sys.exit(1)
    
    output_path = sys.argv[1]
    
    try:
        if HAS_SOUNDDEVICE:
            record_with_sounddevice(output_path)
        elif HAS_PYAUDIO:
            record_with_pyaudio(output_path)
        else:
            print("Error: No audio library available. Please install sounddevice or pyaudio.", file=sys.stderr)
            sys.exit(1)
    except Exception as e:
        print(f"Recording error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
