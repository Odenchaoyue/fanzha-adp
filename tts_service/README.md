# 反诈智猪侠 · 本地离线 TTS 服务

Flask + sherpa-onnx + **Kokoro-82M v1.1-zh** 的本地离线语音合成服务，供 `server.ts` 的 `/proxy/tts` 转发调用。

**合规说明：运行时完全不出网**，不调用任何境外接口，符合比赛“数据不出境、禁止调用境外 API”的要求。模型仅在部署时下载一次。

## 接口

```http
POST /synthesize
Content-Type: application/json

{
  "text": "您好，这里是反诈中心",
  "voice": "xiaolan",
  "rate": "+8%"
}
```

返回 `audio/wav`（24 kHz / 16 bit / 单声道）。

```http
GET /health
```

返回服务状态与音色列表。

## 音色（3 女 3 男）

| key | 名称 | 性别 | 年龄感 | speaker id | 默认语速 |
|---|---|---|---|---|---|
| `xiaolan` | 晓岚 | 女 | 成年 | 19 | 1.0 |
| `xiaoqing` | 晓晴 | 女 | 青年 | 34 | 1.0 |
| `xiaoyue` | 晓悦 | 女 | 青年 | 36 | 1.0 |
| `shuyan` | 述言 | 男 | 成年 | 58 | 1.0 |
| `zimo` | 子墨 | 男 | 青年 | 59 | 1.0 |
| `qinghe` | 清和 | 男 | 青年 | 62 | 1.0 |

> speaker id 来自 Kokoro-82M v1.1-zh：3–57 为中文女声，58–102 为中文男声。
> 本地挑选工具见仓库根目录 `voice-lab/`。

## 部署

### 1. 安装依赖

```bash
pip3 install flask sherpa-onnx==1.13.7
```

### 2. 下载模型（一次性）

```bash
mkdir -p /home/admin/sherpa-models && cd /home/admin/sherpa-models
curl -L -o kokoro.tar.bz2 \
  https://gh-proxy.com/https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-multi-lang-v1_1.tar.bz2
tar -xjf kokoro.tar.bz2
```

模型目录应包含：`model.onnx`、`voices.bin`、`tokens.txt`、`lexicon-us-en.txt`、
`lexicon-zh.txt`、`espeak-ng-data/`。

### 3. 启动

```bash
python3 tts_api.py     # 监听 0.0.0.0:10096
```

## systemd

```ini
[Unit]
Description=TTS Voice Service
After=network.target

[Service]
User=admin
WorkingDirectory=/home/admin
ExecStart=/usr/bin/python3 /home/admin/tts_api.py
Restart=always
RestartSec=3

# 与 ASR 共存：限制内存、降低 CPU 优先级
MemoryHigh=1000M
MemoryMax=1150M
Nice=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tts
sudo systemctl status tts --no-pager
```

> 2 核 1.7 G 的机器上，Kokoro 常驻内存约 600–900 MB。软上限不要低于 900 M，
> 否则内核会在每次合成时回收内存，表现为“合成几条之后越来越慢”。

## 验证

```bash
curl -s -X POST http://127.0.0.1:10096/synthesize \
  -H "Content-Type: application/json" \
  -d '{"text":"你好，这是音色测试","voice":"xiaolan","rate":"+8%"}' \
  -o /tmp/tts.wav -w "HTTP=%{http_code} SIZE=%{size_download}\n"
```

## 注意事项

- 输出 24 kHz，语音自然度明显高于旧版 AISHELL-3（8 kHz）。
- 单句合成约 2–5 秒（取决于句子长度和机器负载）；固定话术命中进程内缓存后为毫秒级。
- 并发请求由进程内锁串行化，避免 ONNX Runtime 多线程争抢 CPU。
- 长文本会按句切分、逐句合成后拼接，单次请求过长会显著增加延迟。
- 若更换模型，只需修改 `MODEL_DIR` 与 `VOICES` 中的 `sid`。
