# 本地音色试音台（voice-lab）

在**本机**用 Kokoro-82M 生成全部 speaker 的样音，浏览器直接播放本地 WAV 试听。
不经过云服务器，不占服务器内存，点一下就是秒开。

选好编号后告诉我，我在服务器的 `/home/admin/tts_api.py` 里替换
晓晴（`xiaoqing`）、晓悦（`xiaoqing`）、子墨（`zimo`）的 `sid`，重启 `tts` 即可生效。

## 使用方法

双击 **`启动试音.bat`**：

1. 首次运行会自动创建 Python 虚拟环境并安装 `sherpa-onnx==1.13.7`；
2. 检查 `model/`，并在 `C:\fanzha-voice-lab-model` 建一个目录链接（见下方原因）；
3. 逐个生成 `samples/sid_3.wav` … `sid_102.wav`（首次约 5–10 分钟）；
4. 自动用默认浏览器打开 `index.html`。

之后每次打开只需几秒（样音已存在会跳过）。想重新生成某几个音色时删掉
`samples/` 里对应的 wav 再运行即可；全部重来加 `--force`。

## 目录说明

| 路径 | 说明 |
|---|---|
| `index.html` | 试音页面：女声 3–57、男声 58–102，可 ★ 收藏、复制编号 |
| `tts_local.py` | 本地合成脚本（单条 / 批量，参数见文件头） |
| `model/` | Kokoro-82M 模型（`model.onnx` 311 MB、`voices.bin` 52 MB、词典等），约 380 MB，**不入库** |
| `samples/` | 生成的 100 条样音，约 18 MB，**不入库** |
| `.venv/` | 本地 Python 环境，**不入库** |
| `启动试音.bat` | 一键安装 + 生成 + 打开页面 |

样音统一文本：**「您好，我是反诈中心的工作人员。」**，语速 1.0。

## 为什么要有 C:\fanzha-voice-lab-model

sherpa-onnx 的 C++ 层在 Windows 下按本地编码处理路径，遇到中文目录
（本工程路径含“项目文件”）会打不开 `espeak-ng-data`，启动时报：

```
Error processing file '/usr/share/espeak-ng-data\phontab'
```

所以 `tts_local.py` 优先使用纯 ASCII 路径 `C:/fanzha-voice-lab-model`，
由 `启动试音.bat` 用 `mklink /J` 指向本文件夹的 `model/`。
它只是一个目录链接，不占额外空间；删掉也不影响工程。

## 重新生成项目首页的试听样音

项目首页 6 个“试听”按钮播放的是 `public/voice-demos/<key>.wav`，由本目录
`gen_demos.py` 生成（每个音色说自己的那句台词，语速 +8%）。改过 `sid` 后执行：

```bash
.venv\Scripts\python.exe gen_demos.py
```

## 服务器侧怎么改

选定编号后，服务器上 `VOICES` 的 `sid` 改成新编号即可，例如：

```python
"xiaoqing": {"sid": 31, ...},
"xiaoyue":  {"sid": 44, ...},
"zimo":     {"sid": 72, ...},
```

```bash
sudo systemctl restart tts
curl -s http://127.0.0.1:10096/health
```

前端不用动——音色 key、名称、性别都不变，只换底层 speaker。

## 模型来源

Kokoro-82M v1.1（多语言，含中文），来自 sherpa-onnx 官方发布：

```
https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-multi-lang-v1_1.tar.bz2
```

模型许可见 `model/` 内附带的 LICENSE / README。运行时完全离线。
