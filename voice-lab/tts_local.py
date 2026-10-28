# -*- coding: utf-8 -*-
"""本地音色试音台 · Kokoro-82M 离线合成（Windows）

用法：
  python tts_local.py --sid 30                 # 生成 samples/sid_30.wav
  python tts_local.py --all                    # 生成 3–102 全部样音
  python tts_local.py --sid 30 --text "你好"    # 自定义文本
可选：--speed 1.0  --threads 4  --out samples/sid_30.wav
"""
import argparse
import os
import struct
import sys
import wave

import sherpa_onnx

BASE = os.path.dirname(os.path.abspath(__file__))

# sherpa-onnx 的 C++ 层不认非 ASCII 路径（本工程路径含“项目文件”）。
# 因此 model/ 通过 NTFS junction 映射到纯 ASCII 路径；没有链接时退回本地目录。
_ASCII_MODEL = "C:/fanzha-voice-lab-model"
MODEL_DIR = _ASCII_MODEL if os.path.isdir(_ASCII_MODEL) else os.path.join(BASE, "model")
SAMPLE_DIR = os.path.join(BASE, "samples")
DEFAULT_TEXT = "您好，我是反诈中心的工作人员。"
DEFAULT_SPEED = 1.0


def p(*parts: str) -> str:
    """C++ 侧按 POSIX 路径拼接，Windows 下必须转成正斜杠。"""
    return os.path.join(*parts).replace("\\", "/")


def build_tts(threads: int):
    cfg = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
                model=p(MODEL_DIR, "model.onnx"),
                voices=p(MODEL_DIR, "voices.bin"),
                tokens=p(MODEL_DIR, "tokens.txt"),
                data_dir=p(MODEL_DIR, "espeak-ng-data"),
                lexicon=",".join([
                    p(MODEL_DIR, "lexicon-us-en.txt"),
                    p(MODEL_DIR, "lexicon-zh.txt"),
                ]),
            ),
            num_threads=threads,
        ),
        max_num_sentences=1,
    )
    return sherpa_onnx.OfflineTts(cfg)


def save_wav(path: str, audio) -> int:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(audio.sample_rate)
        w.writeframes(b"".join(
            struct.pack("<h", max(-32768, min(32767, int(x * 32767))))
            for x in audio.samples
        ))
    return os.path.getsize(path)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sid", type=int, help="单个 speaker id（3–102）")
    ap.add_argument("--all", action="store_true", help="批量生成 3–102")
    ap.add_argument("--text", default=DEFAULT_TEXT)
    ap.add_argument("--speed", type=float, default=DEFAULT_SPEED)
    ap.add_argument("--threads", type=int, default=max(2, min(8, (os.cpu_count() or 4) - 2)))
    ap.add_argument("--out", default="")
    ap.add_argument("--force", action="store_true", help="覆盖已存在的样音")
    args = ap.parse_args()

    if not args.all and args.sid is None:
        ap.print_help()
        return 1

    print(f"模型目录: {MODEL_DIR}")
    print(f"线程数: {args.threads} · 文本: {args.text}")
    tts = build_tts(args.threads)

    if args.all:
        os.makedirs(SAMPLE_DIR, exist_ok=True)
        total = 0
        for sid in range(3, 103):
            out = os.path.join(SAMPLE_DIR, f"sid_{sid}.wav")
            if os.path.exists(out) and not args.force:
                print(f"sid {sid:3d} 已存在，跳过")
                continue
            audio = tts.generate(args.text, sid=sid, speed=args.speed)
            size = save_wav(out, audio)
            total += 1
            dur = len(audio.samples) / audio.sample_rate
            print(f"sid {sid:3d} ok  {dur:.1f}s  {size/1024:.0f} KB")
        print(f"完成，本次生成 {total} 个，目录: {SAMPLE_DIR}")
        return 0

    out = args.out or os.path.join(SAMPLE_DIR, f"sid_{args.sid}.wav")
    audio = tts.generate(args.text, sid=args.sid, speed=args.speed)
    size = save_wav(out, audio)
    dur = len(audio.samples) / audio.sample_rate
    print(f"sid {args.sid} ok  {dur:.1f}s  {size/1024:.0f} KB  -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
