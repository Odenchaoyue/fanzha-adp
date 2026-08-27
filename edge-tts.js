/**
 * edge-tts.js - 微软 Edge 神经网络语音合成(免费、无需API Key)
 *
 * 原理: Edge 浏览器"大声朗读"功能背后的服务,走 WSS 长连接收 mp3。
 * Node 内置 WebSocket 不支持自定义 Header(服务端要求浏览器UA+扩展Origin),
 * 所以这里用 https 模块手动完成 WebSocket 握手和帧编解码,零依赖。
 *
 * 导出:
 *   VOICES      - 可用音色表
 *   synthesize(text, voiceName, opts) -> Promise<Buffer(mp3)>
 *     opts: { rate: '+0%', pitch: '+0Hz', volume: '+0%' }
 */
import https from "node:https";
import crypto from "node:crypto";
const TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const HOST = 'speech.platform.bing.com';
const WSS_PATH = '/consumer/speech/synthesize/readaloud/edge/v1';
const CHROMIUM_VER = '143.0.3650.75';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0';
const ORIGIN = 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold';
const TIMEOUT_MS = 20000;

/* 时钟偏差(秒): 403 时用服务器 Date 头自动校准 */
let clockSkew = 0;

/* ====== 音色表(全是中文女声,挑不"AI味"的) ====== */
const VOICES = {
  xiaoxiao: { name: 'zh-CN-XiaoxiaoNeural',        label: '晓晓 · 温柔自然' },
  xiaoyi:   { name: 'zh-CN-XiaoyiNeural',          label: '晓伊 · 年轻亲切' },
  xiaobei:  { name: 'zh-CN-liaoning-XiaobeiNeural',label: '晓北 · 东北大姐' },
  xiaoniang:{ name: 'zh-CN-shaanxi-XiaoniangNeural', label: '晓妮 · 陕西口音' },
  xiaohan:  { name: 'zh-CN-XiaohanNeural',         label: '晓涵 · 干练客服' },
  xiaorou:  { name: 'zh-CN-XiaorouNeural',         label: '晓柔 · 轻柔慢语' },
};

/* ====== DRM 令牌: Windows文件时间(取整到5分钟) + Token 的 SHA256 ====== */
function secMsGec() {
  let ticks = BigInt(Math.floor(Date.now() / 1000 + clockSkew) + 11644473600);
  ticks -= ticks % 300n; // 5分钟窗口
  ticks *= 10000000n;    // 转成100ns
  return crypto.createHash('sha256')
    .update(ticks.toString() + TRUSTED_TOKEN, 'ascii')
    .digest('hex').toUpperCase();
}

/* Edge 服务要求的 JS 风格时间串 */
function jsDateStr() {
  const D = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${D[d.getUTCDay()]} ${M[d.getUTCMonth()]} ${p(d.getUTCDate())} ${d.getUTCFullYear()} ` +
         `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} ` +
         `GMT+0000 (Coordinated Universal Time)`;
}

function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

/* ====== 客户端帧编码(必须掩码) ====== */
function encodeFrame(opcode, payload) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, 0x80 | len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode; header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode; header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  const mask = crypto.randomBytes(4);
  const masked = Buffer.allocUnsafe(len);
  for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i % 4];
  return Buffer.concat([header, mask, masked]);
}

/* ====== 服务端帧解析器(流式,处理TCP分包) ====== */
function createFrameParser(onText, onBinary) {
  let buf = Buffer.alloc(0);
  return chunk => {
    buf = Buffer.concat([buf, chunk]);
    while (true) {
      if (buf.length < 2) return;
      const opcode = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2); off = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        len = Number(buf.readBigUInt64BE(2)); off = 10;
      }
      if (masked) off += 4; // 服务端帧按规范不掩码,保险起见跳过
      if (buf.length < off + len) return; // 帧还没收全
      const payload = buf.subarray(off, off + len);
      buf = buf.subarray(off + len);
      if (opcode === 0x1) onText(payload.toString('utf8'));
      else if (opcode === 0x2) onBinary(payload);
      else if (opcode === 0x8) { /* close */ }
    }
  };
}

/* ====== 主函数(带一次 403 自动校时重试) ====== */
async function synthesize(text, voiceName, opts = {}) {
  try {
    return await rawSynthesize(text, voiceName, opts);
  } catch (e) {
    if (e && e.needClockRetry) {
      clockSkew += e.skew; // 用服务器时间修正本地时钟偏差
      return await rawSynthesize(text, voiceName, opts);
    }
    throw e;
  }
}

function rawSynthesize(text, voiceName, opts = {}) {
  return new Promise((resolve, reject) => {
    const clean = String(text || '').replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, '').trim();
    if (!clean) return reject(new Error('empty text'));

    const connId = crypto.randomUUID().replace(/-/g, '');
    const reqId = crypto.randomUUID().replace(/-/g, '');
    const path = `${WSS_PATH}?TrustedClientToken=${TRUSTED_TOKEN}&Sec-MS-GEC=${secMsGec()}` +
                 `&Sec-MS-GEC-Version=1-${CHROMIUM_VER}&ConnectionId=${connId}`;

    const req = https.request({
      hostname: HOST, port: 443, path,
      headers: {
        'Connection': 'Upgrade',
        'Upgrade': 'websocket',
        'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'),
        'Sec-WebSocket-Version': '13',
        'User-Agent': UA,
        'Origin': ORIGIN,
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error('TTS 超时(20s)'));
    }, TIMEOUT_MS);

    req.on('upgrade', (res, socket) => {
      const audioChunks = [];
      let done = false;

      const finish = err => {
        if (done) return; done = true;
        clearTimeout(timer);
        try { socket.destroy(); } catch (e) {}
        if (err) reject(err);
        else if (audioChunks.length) resolve(Buffer.concat(audioChunks));
        else reject(new Error('TTS 未返回音频'));
      };

      const parse = createFrameParser(
        textMsg => {
          if (textMsg.includes('Path:turn.end')) finish();
          else if (textMsg.includes('Path:response')) {
            // 服务端错误通知(如403拒绝、音色不存在)
            const m = textMsg.match(/"text"\s*:\s*"([^"]+)"/);
            if (/Path:response\.not/.test(textMsg)) finish(new Error('TTS 拒绝请求: ' + (m ? m[1] : textMsg.slice(0, 200))));
          }
        },
        binMsg => {
          // 二进制帧: 前2字节=头部长度, 头部里含 Path:audio, 后面是 mp3 数据
          if (binMsg.length < 2) return;
          const headerLen = binMsg.readUInt16BE(0);
          if (headerLen + 2 > binMsg.length) return;
          const header = binMsg.subarray(2, 2 + headerLen).toString('utf8');
          if (header.includes('Path:audio')) {
            audioChunks.push(binMsg.subarray(2 + headerLen));
          }
        }
      );

      socket.on('data', parse);
      socket.on('error', e => finish(e));
      socket.on('close', () => finish());

      // 1) 语音配置
      const cfg = 'X-Timestamp:' + jsDateStr() + '\r\n' +
        'Content-Type:application/json; charset=utf-8\r\n' +
        'Path:speech.config\r\n\r\n' +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' },
                outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
              }
            }
          }
        });
      socket.write(encodeFrame(0x1, Buffer.from(cfg, 'utf8')));

      // 2) SSML
      const rate = opts.rate || '+0%';
      const pitch = opts.pitch || '+0Hz';
      const volume = opts.volume || '+0%';
      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>` +
        `<voice name='${voiceName}'>` +
        `<prosody pitch='${pitch}' rate='${rate}' volume='${volume}'>${escapeXml(clean)}</prosody>` +
        `</voice></speak>`;
      const msg = `X-RequestId:${reqId}\r\n` +
        `Content-Type:application/ssml+xml\r\n` +
        `X-Timestamp:${jsDateStr()}Z\r\n` +
        `Path:ssml\r\n\r\n${ssml}`;
      socket.write(encodeFrame(0x1, Buffer.from(msg, 'utf8')));
    });

    req.on('response', r => {
      clearTimeout(timer);
      // 403 且带 Date 头: 记录时钟偏差,让上层校时重试
      if (r.statusCode === 403 && r.headers.date) {
        const serverTime = Math.floor(Date.parse(r.headers.date) / 1000);
        const err = new Error(`Edge TTS 403 (时钟偏差 ${serverTime - Math.floor(Date.now()/1000)}s, 自动校准重试)`);
        err.needClockRetry = true;
        err.skew = serverTime - Math.floor(Date.now() / 1000);
        reject(err);
        return;
      }
      let body = '';
      r.on('data', c => body += c);
      r.on('end', () => reject(new Error(`Edge TTS HTTP ${r.statusCode}: ${body.slice(0, 200)}`)));
    });
    req.on('error', e => { clearTimeout(timer); reject(e); });
    req.end();
  });
}

export { VOICES, synthesize };