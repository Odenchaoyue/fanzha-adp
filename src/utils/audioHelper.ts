/**
 * audioHelper.ts - 语音朗读 + 来电铃声
 *
 * 朗读优先走本地代理的 Edge 神经网络音色(/proxy/tts,真人感女声),
 * 服务不可用时自动降级为浏览器 speechSynthesis,保证体验不中断。
 */

/* Edge 音色 id(与 server.ts 的 edge-tts.js VOICES 对应) */
export type EdgeVoice = 'xiaoxiao' | 'xiaoyi' | 'xiaobei' | 'xiaoniang' | 'xiaohan' | 'xiaorou';

export const EDGE_VOICE_LABELS: { id: EdgeVoice; label: string; badge: string }[] = [
  { id: 'xiaoxiao',  label: '晓晓 · 温柔自然', badge: '默认' },
  { id: 'xiaoyi',    label: '晓伊 · 年轻亲切', badge: '清晰' },
  { id: 'xiaobei',   label: '晓北 · 东北大姐', badge: '拟真' },
  { id: 'xiaoniang', label: '晓妮 · 陕西口音', badge: '方言' },
  { id: 'xiaohan',   label: '晓涵 · 干练客服', badge: '客服' },
  { id: 'xiaorou',   label: '晓柔 · 轻柔慢语', badge: '轻柔' },
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
 * 朗读一段文本: 优先走 Edge TTS，失败时降级浏览器语音。
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
    console.warn('Edge TTS 不可用,降级浏览器朗读', e);
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


