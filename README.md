# 反诈实训系统 · 前端(ADP 版)

基于 React + TypeScript + Tailwind 的反诈能力实训前端,AI 能力全部对接私有化腾讯云 ADP 智能体工作流。

## 运行

```bash
npm install
npm run dev
```

浏览器打开 http://localhost:3000 (麦克风权限要求 localhost 环境)。

## 使用前提

1. 在首页「系统配置」中填入 **ADP AppKey**(智能体开发平台发布应用的密钥)
2. 选择音色(Edge 神经网络音色,免费)
3. 即可体验:模拟来电(语音/文字对话)、互动剧场、反诈问答

## 架构

```
浏览器 (React SPA)
  │  相对路径 fetch
  ▼
server.ts (Express + Vite 中间件,本地代理)
  ├─ /proxy/adp → https://101.42.184.216/adp/v2/chat   ADP 对话(SSE 流式)
  ├─ /proxy/asr → http://8.134.117.157:10095/recognition 语音转文字
  └─ /proxy/tts → 微软 Edge 神经网络音色(edge-tts.js)
```

- ADP 协议要点:PascalCase 请求体、`Content-Type: text/plain` 绕 CORS 预检、
  SSE 三种事件格式兼容(流式增量 / Content 整包 / Thought 思维链过滤)
- 录音:AudioContext 采 16kHz PCM,前端编码 WAV 后 base64 上传
  (MediaRecorder 的 webm 格式 ASR 服务不收)
- 复盘报告:本地规则引擎生成(演示零依赖,不因网络问题白屏)
