/**
 * audioHelper.ts - 语音朗读 + 来电铃声
 *
 * 朗读优先走本地代理的离线神经网络音色(/proxy/tts, 服务器端 sherpa-onnx),
 * 服务不可用时自动降级为浏览器 speechSynthesis,保证体验不中断。
 */

/* 音色 id(与 server 端 tts_api.py 的 VOICES 对应) */
export type EdgeVoice = 'xiaolan' | 'xiaoqing' | 'xiaoyue' | 'shuyan' | 'zimo' | 'qinghe';

export const EDGE_VOICE_LABELS: { id: EdgeVoice; label: string; badge: string }[] = [
  { id: 'xiaolan',  label: '晓岚 · 成年女声', badge: '默认' },
  { id: 'xiaoqing', label: '晓晴 · 青年女声', badge: '清晰' },
  { id: 'xiaoyue',  label: '晓悦 · 青年女声', badge: '轻快' },
  { id: 'shuyan',   label: '述言 · 成年男声', badge: '沉稳' },
  { id: 'zimo',     label: '子墨 · 青年男声', badge: '亲切' },
  { id: 'qinghe',   label: '清和 · 青年男声', badge: '客服' },
];

/* 当前正在播放的音频(供打断) */
let currentAudio: HTMLAudioElement | null = null;
let currentRequestController: AbortController | null = null;
let playbackGeneration = 0;

export function stopSpeaking() {
  playbackGeneration += 1;
  currentRequestController?.abort();
  currentRequestController = null;
  if (currentAudio) {
    currentAudio.pause();
    if (currentAudio.src.startsWith('blob:')) URL.revokeObjectURL(currentAudio.src);
    currentAudio = null;
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

/**
 * 流式朗读整段回复：浏览器直接播放 /proxy/tts/stream，
 * 服务器边合成边下发，句与句之间没有"等下一句合成完"的停顿。
 * 返回 false 表示流式不可用，调用方回退到逐句队列。
 */
export async function playStreamingSpeech(text: string, voice: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const clean = text.trim();
  if (!clean) return false;

  stopSpeaking();
  const generation = playbackGeneration;
  const params = new URLSearchParams({
    text: clean.slice(0, 500),
    voice,
    rate: '+8%',
  });
  const audio = new Audio(`/proxy/tts/stream?${params.toString()}`);
  currentAudio = audio;

  try {
    await audio.play();
  } catch {
    if (currentAudio === audio) currentAudio = null;
    return false;
  }
  if (generation !== playbackGeneration) {
    audio.pause();
    return true;
  }
  audio.onended = () => {
    if (currentAudio === audio) currentAudio = null;
  };
  return true;
}

/**
 * 逐句朗读队列：把长回复拆成句子并行请求 TTS，按顺序无缝播放。
 *
 * 模拟来电原先等整段回复合成完(十几秒)才出声；用队列后第一句合成完即可开口，
 * 后面几句在播放期间预合成，避免"文字早就出来了、语音还没跟上"。
 */
export interface SpeechQueue {
  enqueue(text: string): void;
  stop(): void;
}

export function createSpeechQueue(voice: string): SpeechQueue {
  if (typeof window === 'undefined') {
    return { enqueue() {}, stop() {} };
  }

  stopSpeaking();
  const generation = playbackGeneration;
  const controller = new AbortController();
  const textQueue: string[] = [];
  const ready: (string | null)[] = [];
  let stopped = false;
  let synthesizing = false;
  let draining = false;

  const synth = async (text: string): Promise<string | null> => {
    const clean = text.trim();
    if (!clean || stopped) return null;
    try {
      const res = await fetch('/proxy/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean.slice(0, 500), voice, rate: '+8%' }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
      const blob = await res.blob();
      if (!blob.size || stopped) return null;
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  };

  const drain = async () => {
    if (draining) return;
    draining = true;
    while (ready.length > 0) {
      const url = ready.shift()!;
      if (stopped || generation !== playbackGeneration) {
        if (url) URL.revokeObjectURL(url);
        break;
      }
      if (!url) continue;

      await new Promise<void>((resolve) => {
        const audio = new Audio(url);
        currentAudio = audio;
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          URL.revokeObjectURL(url);
          if (currentAudio === audio) currentAudio = null;
          resolve();
        };
        audio.onended = done;
        audio.onerror = done;
        audio.onpause = done; // 被 stopSpeaking 打断时也要继续推进队列
        audio.play().catch(done);
      });
    }
    draining = false;
  };

  // 合成按句子顺序串行进行(服务器本身也是串行),边合成边交给播放队列
  const synthLoop = async () => {
    if (synthesizing) return;
    synthesizing = true;
    while (textQueue.length > 0) {
      const text = textQueue.shift()!;
      ready.push(await synth(text));
      void drain();
      if (stopped) break;
    }
    synthesizing = false;
  };

  return {
    enqueue(text: string) {
      if (stopped) return;
      textQueue.push(text);
      void synthLoop();
    },
    stop() {
      stopped = true;
      controller.abort();
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = '';
        currentAudio = null;
      }
    },
  };
}

/**
 * 播放预先合成的静态试听样音(public/voice-demos/<voice>.wav)。
 * 试听按钮专用：不经过服务器合成，点击即播；文件缺失时返回 false 由调用方回退。
 */
export async function playStaticVoiceDemo(voice: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  stopSpeaking();
  const generation = playbackGeneration;
  const audio = new Audio(`/voice-demos/${voice}.wav`);
  currentAudio = audio;

  try {
    await audio.play();
  } catch {
    if (currentAudio === audio) currentAudio = null;
    return false;
  }

  if (generation !== playbackGeneration) {
    audio.pause();
    return true;
  }

  audio.onended = () => {
    if (currentAudio === audio) currentAudio = null;
  };
  return true;
}

/**
 * 朗读一段文本: 优先走服务器本地 TTS，失败时降级浏览器语音。
 * 同一时间只允许最新一次请求产生声音；旧请求即使晚到也会被丢弃。
 */
export async function playVoiceSample(text: string, voice: string) {
  if (typeof window === 'undefined') return;
  const clean = text.replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, '').trim();
  if (!clean) return;

  stopSpeaking();
  const generation = playbackGeneration;
  const controller = new AbortController();
  currentRequestController = controller;

  try {
    const res = await fetch('/proxy/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: clean.slice(0, 500), voice, rate: '+8%' }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);

    const blob = await res.blob();
    if (!blob.size || controller.signal.aborted || generation !== playbackGeneration) return;

    const objectUrl = URL.createObjectURL(blob);
    const audio = new Audio(objectUrl);
    currentAudio = audio;
    audio.onended = () => {
      URL.revokeObjectURL(objectUrl);
      if (currentAudio === audio) currentAudio = null;
    };
    await audio.play();
    if (currentRequestController === controller) currentRequestController = null;
    return;
  } catch (e) {
    if (controller.signal.aborted || generation !== playbackGeneration) return;
    console.warn('本地 TTS 不可用,降级浏览器朗读', e);
  }

  if (currentRequestController === controller) currentRequestController = null;
  if (generation !== playbackGeneration) return;
  fallbackBrowserTTS(clean);
}
function fallbackBrowserTTS(text: string) {
  if (!('speechSynthesis' in window)) return;
  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.05;
    const voices = window.speechSynthesis.getVoices();
    const chineseVoice = voices.find((v) => v.lang.includes('zh') || v.lang.includes('cmn'));
    if (chineseVoice) utterance.voice = chineseVoice;
    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.warn('Browser TTS error', e);
  }
}

/**
 * 来电铃声(双音频合成,无需音频文件)
 */
export function playPhoneRingSound(): () => void {
  if (typeof window === 'undefined') return () => {};

  let intervalId: any = null;
  try {
    const win = window as any;
    const AudioContextClass = win.AudioContext || win.webkitAudioContext;
    if (!AudioContextClass) return () => {};

    const ctx = new AudioContextClass();

    const ringBurst = () => {
      if (ctx.state === 'suspended') ctx.resume();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(440, ctx.currentTime);
      osc2.frequency.setValueAtTime(480, ctx.currentTime);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 1.2);
      osc2.stop(ctx.currentTime + 1.2);
    };

    ringBurst();
    intervalId = setInterval(ringBurst, 2500);
  } catch (e) {
    console.warn('Ring audio error', e);
  }

  return () => {
    if (intervalId) clearInterval(intervalId);
  };
}


