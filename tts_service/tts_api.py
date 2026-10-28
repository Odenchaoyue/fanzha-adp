# -*- coding: utf-8 -*-
import io, re, struct, threading, wave
import sherpa_onnx
from flask import Flask, Response, jsonify, request

MODEL_DIR = "/home/admin/sherpa-models/kokoro-multi-lang-v1_1"
VOICES = {
    "xiaolan":  {"sid": 19,   "name": "\u6653\u5c9a", "gender": "female", "age": "adult", "speed": 1.0},
    "xiaoqing": {"sid": 34,  "name": "\u6653\u6674", "gender": "female", "age": "youth", "speed": 1.0},
    "xiaoyue":  {"sid": 36,  "name": "\u6653\u60a6", "gender": "female", "age": "youth", "speed": 1.0},
    "shuyan":   {"sid": 58,  "name": "\u8ff0\u8a00", "gender": "male",   "age": "adult", "speed": 1.0},
    "zimo":     {"sid": 59,  "name": "\u5b50\u58a8", "gender": "male",   "age": "youth", "speed": 1.0},
    "qinghe":   {"sid": 62,  "name": "\u6e05\u548c", "gender": "male",   "age": "youth", "speed": 1.0},
}
LEGACY = {
    "xiaoxiao": "xiaolan", "xiaoyi": "xiaoqing", "xiaobei": "shuyan",
    "xiaoniang": "xiaoqing", "xiaohan": "qinghe", "xiaorou": "xiaoyue",
    "zh-CN-XiaoxiaoNeural": "xiaolan", "zh-CN-XiaoyiNeural": "xiaoqing",
    "zh-CN-liaoning-XiaobeiNeural": "shuyan", "zh-CN-shaanxi-XiaoniangNeural": "xiaoqing",
    "zh-CN-XiaohanNeural": "qinghe", "zh-CN-XiaorouNeural": "xiaoyue",
}
app = Flask(__name__)
_tts = None
_lock = threading.Lock()
_cache = {}
_CACHE_MAX = 64

def get_tts():
    global _tts
    if _tts is None:
        cfg = sherpa_onnx.OfflineTtsConfig(
            model=sherpa_onnx.OfflineTtsModelConfig(
                kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
                    model=MODEL_DIR + "/model.onnx",
                    voices=MODEL_DIR + "/voices.bin",
                    tokens=MODEL_DIR + "/tokens.txt",
                    data_dir=MODEL_DIR + "/espeak-ng-data",
                    lexicon=MODEL_DIR + "/lexicon-us-en.txt," + MODEL_DIR + "/lexicon-zh.txt",
                ),
                num_threads=2,
            ),
            max_num_sentences=1,
        )
        _tts = sherpa_onnx.OfflineTts(cfg)
    return _tts

def parse_rate(rate):
    m = re.match(r"^([+-]?)(\d+)%$", str(rate or "").strip())
    if not m:
        return 1.0
    v = 1.0 + (int(m.group(2)) / 100.0) * (1 if m.group(1) != "-" else -1)
    return max(0.6, min(1.6, v))

def clean_for_tts(text):
    text = re.sub(r"[\uff08(][^\uff09)]{0,40}[\uff09)]", "", text)
    text = re.sub(r"[*#\x60_]+", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()

_CN_DIGITS = "零一二三四五六七八九"
_CN_UNITS = ("", "十", "百", "千")
_CN_BIG = ("", "万", "亿", "万亿")


def _four(n):
    s = ""
    zero = False
    for i, ch in enumerate("%04d" % n):
        d = int(ch)
        if d == 0:
            zero = True
        else:
            if zero and s:
                s += "零"
            s += _CN_DIGITS[d] + _CN_UNITS[3 - i]
            zero = False
    return s


def _int_cn(n):
    if n == 0:
        return "零"
    if len(str(n)) > 16:
        return _digits_cn(str(n))
    groups = []
    while n > 0:
        groups.append(n % 10000)
        n //= 10000
    parts = []
    for i in range(len(groups) - 1, -1, -1):
        g = groups[i]
        if g == 0:
            if parts and not parts[-1].endswith("零"):
                parts.append("零")
            continue
        parts.append(_four(g) + _CN_BIG[i])
    out = "".join(parts)
    out = re.sub("零+", "零", out).rstrip("零")
    if out.startswith("一十"):
        out = out[1:]
    return out


def _digits_cn(s):
    return "".join(_CN_DIGITS[int(c)] if c.isdigit() else c for c in s)


def _num_cn(s):
    if "." in s:
        a, b = s.split(".", 1)
        return _int_cn(int(a)) + "点" + _digits_cn(b)
    if len(s) > 1 and s.startswith("0"):
        return _digits_cn(s)
    return _int_cn(int(s))


def normalize_numbers(text):
    """把阿拉伯数字转成中文读法，避免 Kokoro 用英文读数字。"""
    # 时间 19:45 -> 十九点四十五
    text = re.sub(r"(?<!\d)(\d{1,2}):(\d{2})(?!\d)",
                  lambda m: _int_cn(int(m.group(1))) + "点" + _int_cn(int(m.group(2))), text)
    # 百分比 50% -> 百分之五十
    text = re.sub(r"(\d+(?:\.\d+)?)\s*%",
                  lambda m: "百分之" + _num_cn(m.group(1)), text)
    # 年份 2026年 -> 二零二六年
    text = re.sub(r"(?<!\d)(\d{4})\s*年",
                  lambda m: _digits_cn(m.group(1)) + "年", text)
    # 带连字符的电话/编号 010-8522 -> 零一零-八五二二
    text = re.sub(r"(?<!\d)(\d{2,4}-\d{2,8}(?:-\d{1,8})?)(?!\d)",
                  lambda m: _digits_cn(m.group(1)), text)
    # 工号/编号/卡号/验证码等标识类数字逐位读（8037 -> 八零三七）
    text = re.sub(
        r"(工号|编号|警号|卡号|账号|账户|订单号|单号|流水号|身份证号?|护照号|手机号|电话|验证码|车牌号?|门牌号?)"
        r"(\s*[：:为是]?\s*)(\d{3,})",
        lambda m: m.group(1) + m.group(2) + _digits_cn(m.group(3)), text)
    # 报警/急救号码
    text = re.sub(r"(?<!\d)(110|119|120)(?!\d)",
                  lambda m: {"110": "幺幺零", "119": "幺幺九", "120": "幺二零"}[m.group(1)], text)
    # 区间 3-5 -> 三到五
    text = re.sub(r"(?<!\d)(\d{1,3})\s*[-~—–]\s*(\d{1,3})(?!\d)",
                  lambda m: _num_cn(m.group(1)) + "到" + _num_cn(m.group(2)), text)
    # 长数字串（手机号/银行卡/长编号）逐位读
    text = re.sub(r"(?<!\d)\d{11,}(?!\d)", lambda m: _digits_cn(m.group(0)), text)
    # 其余数字
    text = re.sub(r"\d+(?:\.\d+)?", lambda m: _num_cn(m.group(0)), text)
    return text


def split_sentences(text):
    parts = re.split(r"(?<=[\u3002\uff01\uff1f\uff1b!?;\n])", text)
    return [p.strip() for p in parts if p.strip()]

def synth_wav(text, voice, rate, sid=None):
    cfg = VOICES.get(voice) or VOICES["xiaolan"]
    if sid is not None:
        cfg = dict(cfg)
        cfg["sid"] = sid
    speed = max(0.6, min(1.6, parse_rate(rate) * cfg["speed"]))
    text = normalize_numbers(clean_for_tts(text))
    key = (text, cfg["sid"], round(speed, 3))
    cached = _cache.get(key)
    if cached is not None:
        return cached
    engine = get_tts()
    sr = 24000
    samples = []
    with _lock:
        for sent in split_sentences(text):
            audio = engine.generate(sent, sid=cfg["sid"], speed=speed)
            sr = audio.sample_rate
            samples.extend(audio.samples)
            samples.extend([0.0] * int(sr * 0.12))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(b"".join(
            struct.pack("<h", max(-32768, min(32767, int(x * 32767))))
            for x in samples
        ))
    data = buf.getvalue()
    if len(_cache) >= _CACHE_MAX:
        _cache.pop(next(iter(_cache)))
    _cache[key] = data
    return data

@app.route("/health")
def health():
    return jsonify({"ok": True, "engine": "sherpa-onnx-kokoro-v1.1-zh", "sample_rate": 24000,
                    "offline": True,
                    "voices": {k: {"name": v["name"], "gender": v["gender"], "age": v["age"]} for k, v in VOICES.items()}})

@app.route("/synthesize_stream")
def synthesize_stream():
    """流式合成：边生成边下发 WAV，浏览器可边下边播，句与句之间不会空等。"""
    req = request.args
    text = (req.get("text") or "").strip()
    if not text:
        return Response("empty text", status=400)
    voice = str(req.get("voice") or "xiaolan")
    voice = LEGACY.get(voice, voice)
    sid = None
    if voice.startswith("sid_") and voice[4:].isdigit():
        sid = int(voice[4:])
    elif voice not in VOICES:
        voice = "xiaolan"
    text = re.sub(r"[\x00-\x08\x0b-\x1f]", "", text)[:400]
    text = normalize_numbers(clean_for_tts(text))

    cfg = VOICES.get(voice) or VOICES["xiaolan"]
    sid_val = sid if sid is not None else cfg["sid"]
    speed = max(0.6, min(1.6, parse_rate(req.get("rate") or "+0%") * cfg["speed"]))
    sr = 24000

    def pcm(samples):
        return b"".join(
            struct.pack("<h", max(-32768, min(32767, int(x * 32767))))
            for x in samples
        )

    def generate():
        # 流式 WAV：长度字段写 0xFFFFFFFF，浏览器收到 header 即可开始播放
        yield b"RIFF" + struct.pack("<I", 0xFFFFFFFF) + b"WAVE"
        yield b"fmt " + struct.pack("<IHHIIHH", 16, 1, 1, sr, sr * 2, 2, 16)
        yield b"data" + struct.pack("<I", 0xFFFFFFFF)
        for sent in split_sentences(text):
            with _lock:
                audio = get_tts().generate(sent, sid=sid_val, speed=speed)
            yield pcm(audio.samples)
            yield b"\x00\x00" * int(sr * 0.04)

    return Response(generate(), mimetype="audio/wav",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.route("/synthesize", methods=["POST"])
def synthesize():
    req = request.get_json(silent=True) or {}
    text = (req.get("text") or "").strip()
    if not text:
        return Response("empty text", status=400)
    voice = str(req.get("voice") or "xiaolan")
    voice = LEGACY.get(voice, voice)
    sid = None
    if voice.startswith("sid_") and voice[4:].isdigit():
        sid = int(voice[4:])
    elif voice not in VOICES:
        voice = "xiaolan"
    text = re.sub(r"[\x00-\x08\x0b-\x1f]", "", text)[:400]
    try:
        wav = synth_wav(text, voice, req.get("rate") or "+0%", sid=sid)
    except Exception as e:
        return Response("synthesis failed: %s" % e, status=500)
    return Response(wav, mimetype="audio/wav", headers={"Cache-Control": "no-cache"})

if __name__ == "__main__":
    get_tts()
    try:
        synth_wav("\u4f60\u597d", "xiaolan", "+0%")
    except Exception:
        pass
    app.run(host="0.0.0.0", port=10096, threaded=True)
