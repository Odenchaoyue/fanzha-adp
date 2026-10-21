# -*- coding: utf-8 -*-
"""
反诈智猪侠 · TTS 服务

POST /synthesize
  { "text": "...", "voice": "zh-CN-XiaoxiaoNeural", "rate": "+8%" }
  → audio/wav

依赖：
  pip install flask edge-tts==7.3.1 pydub
  apt-get install -y ffmpeg        # pydub 导出 wav 需要
运行：
  python3 tts_api.py               # 监听 0.0.0.0:10096
"""
from flask import Flask, request, Response
import io
import asyncio
from edge_tts import Communicate
from pydub import AudioSegment

app = Flask(__name__)


async def get_mp3(text: str, voice: str = "zh-CN-XiaoxiaoNeural", rate: str = "+0%"):
    buf = io.BytesIO()
    comm = Communicate(text, voice=voice, rate=rate)
    async for chunk in comm.stream():
        if chunk["type"] == "audio":
            buf.write(chunk["data"])
    buf.seek(0)
    return buf


def mp3_to_wav(mp3_buffer):
    sound = AudioSegment.from_file(mp3_buffer, format="mp3")
    wav_buf = io.BytesIO()
    sound.export(wav_buf, format="wav")
    wav_buf.seek(0)
    return wav_buf.read()


@app.route("/synthesize", methods=["POST"])
def synthesize():
    req = request.get_json(silent=True) or {}
    text = (req.get("text") or "").strip()
    voice = req.get("voice") or "zh-CN-XiaoxiaoNeural"
    rate = req.get("rate") or "+0%"
    if not text:
        return Response("文本不能为空", status=400)

    mp3_stream = asyncio.run(get_mp3(text, voice, rate))
    wav_data = mp3_to_wav(mp3_stream)
    return Response(wav_data, mimetype="audio/wav")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=10096)
