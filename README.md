# 反诈实训系统 · 前端(ADP 版)

基于 React 19 + TypeScript + Vite + Tailwind 的反诈能力实训系统。AI 能力全部对接**腾讯云 ADP 智能体工作流**(私有化部署),提供三大实训模式:

- 📞 **模拟来电** — 真实通话感:按住麦克风说话(ASR 识别)或打字,AI 扮演骗子实时攻防;支持 6 类场景、风险词高亮、挂断后生成本地复盘报告
- 🎭 **互动剧场** — 反诈剧本推演:选择场景由 ADP 实时生成剧情,通过 A/B/C 选项识别骗局,主持人手册在终局复盘阶段揭晓
- 💬 **反诈问答** — 直接咨询 ADP 工作流"直接问答"分支,可疑短信/来电/转账指令随手研判

## 运行

### 1. 配置 AppKey(必需)

复制 `.env.example` 为 `.env`,填入你的 **ADP 应用密钥**(在腾讯云 ADP 智能体开发平台发布应用后获得):

```bash
# D:\fanzha\.env
VITE_APP_KEY=你的ADP应用AppKey
```

> 说明:AppKey 只在前端经本地代理转发时使用,不会直连外部。环境变量由 Vite 启动时注入,改后需重启。

### 2. 启动

```bash
npm install        # 首次
npm run dev        # 同时启动前端(Vite) + 本地代理(server.ts)
```

浏览器打开 **http://localhost:3000**(语音功能要求 localhost 安全上下文,否则麦克风被浏览器静默拒绝)。

### 3. 试玩

首页 → 选择音色(Edge 神经网络女声,免费) → 进入任一模式。

## 架构

```
浏览器 (React SPA)
  │  相对路径 fetch(无 CORS)
  ▼
server.ts (Express + Vite 中间件,本地代理)
  ├─ /proxy/adp → https://adp.gaoxiaobang.com/adp/v2/chat    ADP 对话(SSE 流式)
  ├─ /proxy/asr → http://8.134.117.157:10095/recognition  语音转文字(ASR)
  └─ /proxy/tts → 服务器 Python Edge TTS(8.134.117.157:10096,支持音色/语速)
```

**语音链路三段来源:**
| 环节 | 实现 |
|---|---|
| 录音 | 浏览器本地 AudioContext 采 16kHz PCM,前端编码 WAV(MediaRecorder 的 webm 队友 ASR 不收) |
| 语音识别(ASR) | 队友服务器 `8.134.117.157:10095`,经 `/proxy/asr` 转发,**依赖队友机器在线**;离线时打字仍可玩 |
| 朗读(TTS) | 服务器 Python Edge TTS(edge-tts 7.3.1),6 种音色 + 语速;服务不可用时自动降级浏览器朗读 |
| 对话大脑 | 你的 ADP 工作流,经 `/proxy/adp` 转发 |

**ADP 协议要点(已真机验证):**
- PascalCase 请求体:`RequestId/ConversationId/AppKey/VisitorId/Contents/Incremental/Stream`
- `Content-Type: text/plain` 绕 CORS 预检(私有化部署只放行同源预检)
- SSE 三种事件格式全兼容:流式增量 / `Content`+`Thought` 整包(自动丢弃思维链) / 错误事件
- 工作流一次返回多遍剧本时,前端自动折叠去重

## 关键实现文件

| 文件 | 职责 |
|---|---|
| `src/utils/adpClient.ts` | ADP SSE 客户端(三格式解析 + 思维链过滤 + 去重) |
| `src/utils/scenarioGen.ts` | 剧场请求拼装 / 响应解析 / 事件壳剥离 / 重复交付折叠 |
| `src/utils/recorder.ts` | 16kHz WAV 录音 → base64 |
| `src/utils/riskEngine.ts` | 风险词库计分 + 本地复盘报告生成(演示零依赖) |
| `src/utils/audioHelper.ts` | TTS 播放(服务器 WAV / 降级浏览器) |
| `server.ts` | 本地代理:静态服务 + Vite 中间件 + 三条代理路由 |
| `edge-tts.js` | 旧版本地 Edge TTS 实现(当前未使用,保留备查) |
| `tts_service/` | 服务器 TTS 服务源码 + 部署说明(edge-tts 7.3.1) |
| `docs/` | **`全技术链路文档.md`(工程真相 + 排查记录,接手必读)**、PRD 产品需求文档、ADP 工作流设计方案、`ADP平台侧改动-第0天.md`(平台侧待办) |

## 打包/上线

```bash
npm run build     # 产物输出到 dist/(前端静态文件 + server.cjs)
npm start         # 用产物启动(需先配置好 .env)
```

## 依赖与已知限制

- **ASR 依赖队友服务器在线**(`8.134.117.157:10095`);打字路径不依赖
- **TTS 依赖服务器 `8.134.117.157:10096` 在线**(部署说明见 `tts_service/README.md`);不可用时自动降级浏览器朗读
- **ADP 工作流路由锁定**:主控 Agent 需要"会话上下文锁定"提示词,否则模拟来电中的反制话术可能被误路由到剧本生成分支(详见 `docs/` 方案)
- **麦克风**:必须用 `http://localhost:3000` 打开,iframe 预览面板(非 localhost)拿不到麦克风权限
