/**
 * 反诈实训系统 - 本地代理服务器 (ADP 版)
 *
 * 后端全部走代理:
 *   /proxy/adp → https://adp.gaoxiaobang.com/adp/v2/chat  (私有化 ADP,SSE 流式)
 *   /proxy/asr → http://8.134.117.157:10095/recognition (队友的语音识别)
 *   /proxy/tts → 服务器 Edge 神经网络音色 (Python TTS, 8.134.117.157:10096)
 *
 * 用法: npm install && npm run dev  →  浏览器打开 http://localhost:3000
 */
import express from "express";
import path from "path";
import http from "http";
import https from "https";
import { createServer as createViteServer } from "vite";

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
    // 注意:必须用域名访问。该服务器的 nginx 按 Host 头做虚拟主机分流,
    // 直接写 IP(101.42.184.216)会落到默认站点返回 404。
    target: "https://adp.gaoxiaobang.com/adp/v2/chat",
    method: "POST",
    headers: { "Content-Type": "text/plain", "Accept": "text/event-stream" },
    rejectUnauthorized: true,   // 域名证书已正式签发(curl 默认校验可通过)
  },
};

/* ====== 健康检查 ====== */
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/* ====== TTS 路由: 转发到服务器上的 Python Edge TTS 服务 ======
 * POST /proxy/tts  { text, voice: 'xiaoxiao', rate: '+8%' }
 * → audio/wav (服务器用 edge-tts 7.3.1 合成)
 */
const TTS_VOICE_MAP: Record<string, string> = {
  xiaoxiao: "zh-CN-XiaoxiaoNeural",
  xiaoyi: "zh-CN-XiaoyiNeural",
  xiaobei: "zh-CN-liaoning-XiaobeiNeural",
  xiaoniang: "zh-CN-shaanxi-XiaoniangNeural",
  xiaohan: "zh-CN-XiaohanNeural",
  xiaorou: "zh-CN-XiaorouNeural",
};

app.post("/proxy/tts", (req, res) => {
  try {
    const text = String(req.body?.text || "").slice(0, 600); // 防超长
    const voice = TTS_VOICE_MAP[String(req.body?.voice || "xiaoxiao")] || TTS_VOICE_MAP.xiaoxiao;
    const rate = typeof req.body?.rate === "string" && /^[+-]\d+%$/.test(req.body.rate)
      ? req.body.rate : "+8%";
    if (!text.trim()) {
      res.status(400).json({ error: "text required" });
      return;
    }
    const payload = JSON.stringify({ text, voice, rate });
    const upstream = http.request(
      {
        hostname: "8.134.117.157",
        port: 10096,
        path: "/synthesize",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (up) => {
        res.set("Content-Type", up.headers["content-type"] || "audio/wav");
        res.set("Cache-Control", "no-cache");
        res.status(up.statusCode || 502);
        up.pipe(res);
      }
    );
    upstream.on("error", (e) => {
      console.error("TTS proxy error:", e.message);
      if (!res.headersSent) {
        res.status(502).json({ error: "TTS proxy failed: " + e.message });
      }
    });
    upstream.write(payload);
    upstream.end();
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

    // SSE 心跳:上游静默期间(工作流正在跑 Agent)定期写 SSE 注释行保活,
    // 防止浏览器/中间代理因长连接空闲而掐断
    let lastDataAt = Date.now();
    let heartbeat: NodeJS.Timeout | null = null;

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
        res.set("X-Accel-Buffering", "no"); // 防反向代理缓冲(SSE 关键)
        res.status(proxyRes.statusCode || 502);

        lastDataAt = Date.now();
        proxyRes.on("data", () => { lastDataAt = Date.now(); });

        heartbeat = setInterval(() => {
          if (!res.writableEnded && Date.now() - lastDataAt > 20000) {
            try { res.write(": keepalive\n\n"); } catch { /* 连接已断,忽略 */ }
          }
        }, 5000);

        proxyRes.pipe(res); // 流式转发(SSE 关键)
      }
    );

    // 客户端提前断开(换场景 / 关弹窗 / 前端超时 abort)时必须销毁上游连接。
    // 否则上游请求继续在 ADP 侧跑,同一 ConversationId 的后续请求会被排队阻塞,
    // 表现为"平时很快,连点几次后 200s 无响应 → 504"
    res.on("close", () => {
      if (heartbeat) clearInterval(heartbeat);
      if (!res.writableEnded) {
        console.warn("[proxy] 客户端提前断开,销毁上游连接");
        proxyReq.destroy();
      }
    });

    proxyReq.on("error", (err) => {
      console.error("Proxy error:", err.message);
      if (!res.headersSent) {
        res.status(502).json({ code: -1, error: "Proxy error: " + err.message });
      }
    });

    // 上游(ADP)超时兜底: 慢工作流不要无限挂起,转为干净的 504
    // 240s > 前端 180s,确保正常情况下前端先超时(前端超时带 UI 提示,裸 504 不好处理)
    proxyReq.setTimeout(240000);
    proxyReq.on("timeout", () => {
      console.error("Proxy upstream timeout (ADP 无响应 >240s)");
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
