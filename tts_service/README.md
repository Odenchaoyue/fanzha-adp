# 反诈智猪侠 · TTS 服务

Flask + edge-tts 的语音合成服务，供 `server.ts` 的 `/proxy/tts` 转发调用。

## 接口

```http
POST /synthesize
Content-Type: application/json

{
  "text": "您好，这里是反诈中心",
  "voice": "zh-CN-XiaoxiaoNeural",
  "rate": "+8%"
}
```

返回 `audio/wav`。

## 部署

```bash
pip install flask edge-tts==7.3.1 pydub
sudo apt-get install -y ffmpeg

# 放到服务器上运行
python3 tts_api.py
# 监听 0.0.0.0:10096
```

## systemd（可选）

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

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tts
sudo systemctl status tts --no-pager
```

## 验证

```bash
curl -s -X POST http://127.0.0.1:10096/synthesize \
  -H "Content-Type: application/json" \
  -d '{"text":"你好，这是音色测试","voice":"zh-CN-XiaoxiaoNeural","rate":"+8%"}' \
  -o /tmp/tts.wav -w "HTTP=%{http_code} SIZE=%{size_download}\n"
```

## 注意事项

- `edge-tts` 是微软 Edge 朗读的逆向接口，微软会不定期修改 token 规则。
  出现 **403 WSServerHandshakeError** 时，先升级：
  ```bash
  pip3 install --user --upgrade edge-tts
  sudo systemctl restart tts
  ```
- 当前验证版本：**edge-tts 7.3.1**。
- 音色 ID 与 `server.ts` 的 `TTS_VOICE_MAP` 对应：
  `xiaoxiao / xiaoyi / xiaobei / xiaoniang / xiaohan / xiaorou`。
- 需要 `ffmpeg`，否则 `pydub` 无法把 mp3 转成 wav。
