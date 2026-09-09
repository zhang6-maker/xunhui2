import asyncio
import edge_tts
import sys
import logging
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# 配置日志输出到标准输出，以便 Electron 捕获
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("EdgeTTS")

app = FastAPI(title="Edge-TTS Service for XunHui")

# 添加 CORS 中间件，允许来自任何源的请求（包括 app:// 协议）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 允许所有来源（包括 null 和 app://）
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TTSRequest(BaseModel):
    text: str
    voice: str = "zh-CN-XiaoyiNeural"

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/synthesize/")
async def synthesize(request: TTSRequest):
    logger.info(f"收到合成请求: text_len={len(request.text)}, voice={request.voice}")
    
    max_retries = 3
    retry_delay = 2  # 秒

    for attempt in range(max_retries):
        try:
            # 增加超时控制，防止 edge_tts 无限期挂起
            async def fetch_audio():
                communicate = edge_tts.Communicate(request.text, request.voice)
                data = b""
                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        data += chunk["data"]
                return data

            # 设置 20 秒超时
            audio_data = await asyncio.wait_for(fetch_audio(), timeout=20.0)
            
            if not audio_data:
                logger.warning("合成完成但音频数据为空")
                raise Exception("Empty audio data received from Edge-TTS")

            logger.info(f"合成成功, 大小: {len(audio_data)} bytes")
            return Response(content=audio_data, media_type="audio/mpeg")

        except (asyncio.TimeoutError, Exception) as e:
            error_msg = str(e)
            # 检查是否为 DNS 或连接错误，这类错误通常值得重试
            is_network_error = any(kw in error_msg.lower() for kw in ["getaddrinfo", "dnsservernameerror", "clientconnectordnserror", "connection reset", "timeout"])
            
            if is_network_error and attempt < max_retries - 1:
                logger.warning(f"合成尝试 {attempt + 1} 失败 (网络/超时错误), {retry_delay}s 后重试... 错误: {error_msg}")
                await asyncio.sleep(retry_delay)
                continue
            
            if isinstance(e, asyncio.TimeoutError):
                logger.error("合成超时 (20s)")
                raise HTTPException(status_code=504, detail="TTS synthesis timed out")
            
            logger.error(f"合成异常 (尝试 {attempt + 1}/{max_retries}): {error_msg}", exc_info=True)
            if attempt == max_retries - 1:
                raise HTTPException(status_code=500, detail=f"TTS synthesis failed after {max_retries} attempts: {error_msg}")

if __name__ == "__main__":
    logger.info("Starting Edge-TTS Service on port 8001...")
    uvicorn.run(app, host="127.0.0.1", port=8001, log_level="info")