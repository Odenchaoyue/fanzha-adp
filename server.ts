/**
 * 反诈实训系统 - 本地代理服务器 (ADP 版)
 *
 * 后端全部走代理:
 *   /proxy/adp → https://101.42.184.216/adp/v2/chat  (私有化 ADP,SSE 流式)
 *   /proxy/asr → http://8.134.117.157:10095/recognition (队友的语音识别)
 *   /proxy/tts → Edge 神经网络音色 (edge-tts.js,免费无 Key)
 *
 * 用法: npm install && npm run dev  →  浏览器打开 http://localhost:3000
 */
import express from "express";
import path from "path";
import http from "http";
import https from "https";
import { createServer as createViteServer } from "vite";
import * as edgeTTS from "./edge-tts.js";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "20mb" }));
// 关键:前端对 /proxy/adp 用 text/plain 绕 CORS 预检,必须显式解析 text/plain body,
// 否则 req.body 为空,转发到 ADP 的请求体会丢失
app.use(express.text({ limit: "20mb", type: "text/plain" }));

/* ====== 代理目标配置 ====== */
const PROXIES: Record<string, {
  target: string;
  method: string;
  headers: Record<string, string>;
  rejectUnauthorized?: boolean;
}> = {
  "/proxy/asr": {           // 语音转文字
    target: "http://8.134.117.157:10095/recognition",
    method: "POST",
    headers: { "Content-Type": "application/json" },
  },
  "/proxy/adp": {           // ADP 对话(SSE 流)
    target: "https://101.42.184.216/adp/v2/chat",
    method: "POST",
    headers: { "Content-Type": "text/plain", "Accept": "text/event-stream" },
    rejectUnauthorized: false,  // 自签证书
  },
};

/* ====== 健康检查 ====== */
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/* ====== Edge TTS 路由(单独处理,非简单转发) ======
 * POST /proxy/tts  { text, voice: 'xiaoxiao', rate: '+8%' }
 * → audio/mpeg (mp3 二进制)
 */
app.post("/proxy/tts", async (req, res) => {
  try {
    const text = String(req.body?.text || "").slice(0, 600); // 防超长
    const voice = (edgeTTS as any).VOICES[req.body?.voice]?.name
      || (edgeTTS as any).VOICES.xiaoxiao.name;
    const rate = typeof req.body?.rate === "string" && /^[+-]\d+%$/.test(req.body.rate)
      ? req.body.rate : "+8%";
    if (!text.trim()) {
      res.status(400).json({ error: "text required" });
      return;
    }
    const mp3 = await (edgeTTS as any).synthesize(text, voice, { rate });
    res.set("Content-Type", "audio/mpeg");
    res.set("Cache-Control", "no-cache");
    res.send(Buffer.from(mp3));
  } catch (e: any) {
    console.error("TTS error:", e.message);
    res.status(502).json({ error: "TTS failed: " + e.message });
  }
});

/* ====== 通用代理(支持 SSE 流式转发) ====== */
for (const [prefix, cfg] of Object.entries(PROXIES)) {
  app.all(prefix, (req, res) => {
    const url = new URL(cfg.target);
    const isHttps = url.protocol === "https:";
    const lib = isHttps ? https : http;

    // 统一转成字符串:text/plain 是原字符串,JSON 是对象
    const bodyStr =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});

    const proxyReq = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: cfg.method,
        headers: {
          ...cfg.headers,
          "Content-Length": Buffer.byteLength(bodyStr),
        },
        rejectUnauthorized: cfg.rejectUnauthorized ?? true,
      },
      (proxyRes) => {
        res.set("Content-Type", proxyRes.headers["content-type"] || "application/json");
        res.set("Cache-Control", "no-cache");
        res.status(proxyRes.statusCode || 502);
        proxyRes.pipe(res); // 流式转发(SSE 关键)
      }
    );

    proxyReq.on("error", (err) => {
      console.error("Proxy error:", err.message);
      if (!res.headersSent) {
        res.status(502).json({ code: -1, error: "Proxy error: " + err.message });
      }
    });

    // 上游(ADP)超时兜底: 慢工作流不要无限挂起,转为干净的 504
    proxyReq.setTimeout(110000);
    proxyReq.on("timeout", () => {
      console.error("Proxy upstream timeout (ADP 无响应 >110s)");
      proxyReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({ code: -1, error: "ADP 上游超时,请稍后重试" });
      }
    });

    proxyReq.write(bodyStr);
    proxyReq.end();
  });
}

/* ====== Vite middleware(开发模式) / 静态文件(生产) ====== */
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`
  ┌──────────────────────────────────────────┐
  │   反诈实训系统(ADP版)已启动               │
  │                                          │
  │   浏览器打开: http://localhost:${PORT}          │
  │                                          │
  │   代理路由:                              │
  │   /proxy/adp → ADP 对话(SSE流)          │
  │   /proxy/asr → ASR 语音转文字            │
  │   /proxy/tts → Edge TTS 神经网络音色     │
  └──────────────────────────────────────────┘
  `);
  });
}

startServer();
