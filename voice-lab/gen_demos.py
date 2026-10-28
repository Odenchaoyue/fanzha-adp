# -*- coding: utf-8 -*-
"""重新生成项目首页 6 个音色的“试听”静态样音。

输出到 ../public/voice-demos/<voice key>.wav，供 HomeDashboard 的试听按钮直接播放。
文案与 src/components/HomeDashboard.tsx 的 VOICE_SAMPLES 保持一致；
如果修改了服务器 VOICES 里的 sid，记得同步这里的 sid 后重跑本脚本。
"""
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "public", "voice-demos")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tts_local import build_tts, save_wav  # noqa: E402

DEMOS = {
    "xiaolan":  (19, "您好，这里是支付平台客服中心，检测到您的账户存在异常，需要配合核查。"),
    "xiaoqing": (34, "同学你好，你的会员服务今天到期啦，不取消的话每个月会自动扣费哦。"),
    "xiaoyue":  (36, "快来呀，这个活动名额只剩最后几个了，错过今天就要等下周啦！"),
    "shuyan":   (58, "你名下银行卡涉嫌洗钱，请立即将资金转入安全账户配合清查。"),
    "zimo":     (59, "我是你领导，现在不方便接电话，你先帮我垫付一笔过桥款。"),
    "qinghe":   (62, "您好，我是航空理赔专员，您的航班已取消，请提供银行卡号接收赔付金。"),
}


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    tts = build_tts(8)
    for key, (sid, text) in DEMOS.items():
        # 与旧版试听一致：播放时 rate 为 +8%
        audio = tts.generate(text, sid=sid, speed=1.08)
        path = os.path.join(OUT, key + ".wav")
        size = save_wav(path, audio)
        dur = len(audio.samples) / audio.sample_rate
        print(f"{key:9s} sid={sid:3d} {dur:5.1f}s {size / 1024:6.0f} KB")
    print("DONE ->", OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
