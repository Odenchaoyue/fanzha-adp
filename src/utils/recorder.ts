/**
 * recorder.ts - 麦克风录音 → 16kHz 16bit 单声道 WAV → base64
 *
 * 为什么不用 MediaRecorder: 它输出 webm/opus 格式,
 * 队友的 ASR 服务(http://8.134.117.157:10095/recognition)只收 WAV。
 * 所以用 AudioContext 直接采 PCM,前端手动编码 WAV。
 *
 * 用法:
 *   const rec = new WavRecorder();
 *   await rec.start();          // 按下时
 *   const b64 = await rec.stop(); // 松开时,返回 base64(无 data: 前缀)
 */

export class WavRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private chunks: Float32Array[] = [];
  private recording = false;

  async start(): Promise<void> {
    if (this.recording) return;
    this.chunks = [];

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
    // 指定 16kHz 采样率(ASR 服务要求);不支持的浏览器回退默认采样率,导出时重采样
    this.ctx = new AC({ sampleRate: 16000 });
    if (this.ctx.state === "suspended") await this.ctx.resume();

    this.source = this.ctx.createMediaStreamSource(this.stream);
    // ScriptProcessor 已废弃但兼容性最好,采集场景够用
    this.processor = this.ctx.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (e) => {
      if (!this.recording) return;
      // 拷贝一份(inputBuffer 的内存会被复用)
      this.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };

    this.source.connect(this.processor);
    // 必须连到 destination 才会触发 onaudioprocess(Chrome 的坑),音量设 0 防止回声
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    this.processor.connect(mute);
    mute.connect(this.ctx.destination);

    this.recording = true;
  }

  async stop(): Promise<string | null> {
    this.recording = false;
    if (!this.ctx) return null;

    const sampleRate = this.ctx.sampleRate;
    // 断开音频链
    try {
      this.processor?.disconnect();
      this.source?.disconnect();
      this.stream?.getTracks().forEach((t) => t.stop());
      await this.ctx.close();
    } catch {
      /* 忽略清理错误 */
    }
    this.ctx = null;
    this.stream = null;
    this.processor = null;
    this.source = null;

    // 拼接采样数据
    const totalLen = this.chunks.reduce((n, c) => n + c.length, 0);
    if (totalLen === 0) return null;
    const merged = new Float32Array(totalLen);
    let off = 0;
    for (const c of this.chunks) {
      merged.set(c, off);
      off += c.length;
    }
    this.chunks = [];

    // 采样率转换(如果浏览器没给 16kHz)
    let pcm: Float32Array = merged;
    if (Math.abs(sampleRate - 16000) > 1) {
      pcm = resample(merged, sampleRate, 16000);
    }

    return encodeWavBase64(pcm, 16000);
  }

  get isRecording() {
    return this.recording;
  }
}

/* 线性插值重采样 */
function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = toRate / fromRate;
  const outLen = Math.floor(input.length * ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcPos = i / ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = srcPos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

/* Float32 PCM → WAV 文件 → base64 */
function encodeWavBase64(samples: Float32Array, sampleRate: number): string {
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF 头
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);        // PCM 块大小
  view.setUint16(20, 1, true);         // PCM 格式
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // 字节率
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);        // 位深
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // 采样数据(Float32 → Int16)
  let off = 44;
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  // ArrayBuffer → base64(分块避免参数栈溢出)
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function writeAscii(view: DataView, offset: number, s: string) {
  for (let i = 0; i < s.length; i++) {
    view.setUint8(offset + i, s.charCodeAt(i));
  }
}

/* ====== 调用 ASR 服务 ====== */
export async function recognizeSpeech(b64Wav: string): Promise<string> {
  const res = await fetch("/proxy/asr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audio_base64: b64Wav }),
  });
  const data = await res.json();
  if (data.code !== 0 && data.code !== undefined) {
    throw new Error(data.message || data.msg || `ASR 错误码 ${data.code}`);
  }
  return (data.text || "").trim();
}
