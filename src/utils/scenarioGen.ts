/**
 * scenarioGen.ts — 互动剧场「聊天 DM」模式:实时调用 ADP 工作流
 *
 * 与早期"一次性生成整棵 TheaterStory 分支树"不同,互动剧场现在是对话式 DM:
 *  - 前端把用户输入(年级/专业/场景 或 A/B/C 或指令)发给 ADP;
 *  - ADP 按"剧本生成 Agent"提示词逐轮回复(背景/开场/选项/手册揭晓/升级/复盘);
 *  - 每轮回复同时附带一个 ```json 信封(见交互剧场提示词),前端用 parseTheaterTurn 解析,
 *    抽取【玩家可见】正文、隐藏的【主持人手册】、A/B/C 选项等信息,做结构化渲染。
 *  - 多轮升级/记忆由 ADP 的 conversationId 承担,前端不维护剧情状态树。
 *
 * 模拟来电(CallScenario)仍是一次性 JSON 生成,见下方 generateScenario,逻辑不变。
 */

import { sendToADP, newConversationId } from './adpClient';
import { CallScenario, AppConfig } from '../types';
import { CALL_SCENARIOS } from '../data/scenarios';

/* ============ 互动剧场:聊天式解析 ============ */

/** 去掉回复里用于机器解析的 ```json 信封,只留给人看的正文;同时过滤 ADP 的 Thought 内部推理 */
function stripJsonFence(s: string): string {
  let t = s
    .replace(/```json\s*[\s\S]*?```/gi, '')
    .replace(/```\s*[\s\S]*?```/gi, '')
    .trim();
  // 过滤 ADP Thought 内部推理块(有时会混入流式文本)
  t = t.replace(/【?Thought?】?\s*\{[^}]*\}[\s\S]*?(?=(?:📋|🎭|🔀|⚠️|💡|📊|🧩|🛡️|📞|---|$))/gi, '').trim();
  // 过滤 \n"Thought":\n{...} 格式的思考过程
  t = t.replace(/\\n*"Thought"[\s\S]*?\\n*(?=(?:📋|🎭|🔀|⚠️|💡|📊|🧩|🛡️|📞|---|$))/gi, '').trim();
  return t;
}

/**
 * 判定一段文本是不是 ADP 主控 agent 的内部推理/路由口播
 * (而不是剧本生成 agent 出的真剧本)
 */
export function isMainAgentRoutingNoise(text: string): boolean {
  if (!text) return false;
  const t = text.trim();
  // ADP 主控 agent 思考时常见的口吻与工具调用意图
  const signals = [
    /我需要先询问/i,
    /我需要主动询问/i,
    /我需要了解一些基本信息/i,
    /我需要收集/i,
    /根据我的角色设定,?我是/i,
    /根据规则,?三项信息未/i,
    /让我调用\s*ask_user/i,
    /让我先询问/i,
    /我应该(?:用|以).{0,10}询问/i,
    /用户只说了[^,。]{0,30},?(?:没|没有|需要)/i,
    /我需要(?:先|主动|询问)/i,
    /用户想生成[^,。]{0,40},?(?:我|需)/i,
    /根据任务要求,?我需要(?:收集|询问|主动)/i,
    /我会用.{0,10}提问/i,
    /我可以将(?:这三项|三项|这.{0,5}信息).{0,10}以友好方式询问/i,
    /请(?:告诉我|提供)/i, // 反问用户要信息的标志性句式
  ];
  // 同时要求至少含一个"信息收集"相关的关键词,避免误杀
  const contextNeeded = /年级|专业|场景|信息|询问|收集|ask_user|我会马上/i;
  if (!contextNeeded.test(t)) return false;
  let hits = 0;
  for (const re of signals) if (re.test(t)) hits++;
  // 命中两个以上信号,或含“询问三项信息+没有 A/B/C 选项”结构,判定为路由噪声
  if (hits >= 2) return true;
  // 出现明显的反问语气 且 没有真实剧本的 A/B/C 选项,也算
  const hasAbcOptions = /^\s*[A-C][.、：:]/m.test(t);
  if (hits >= 1 && /请(?:告诉我|提供|依次告诉)/i.test(t) && !hasAbcOptions) return true;
  return false;
}

/**
 * 清洗 ADP 剧场流文本:
 *  - 抽取混在文本里的 {"Content":"..."} 载荷(丢弃包在外面的主控路由口播/Thought 噪声);
 *  - 去掉残留的事件壳 {"Type":"..."} / {"Answer":"..."} / CustomParams;
 *  - 去掉 markdown 标记(#、**)便于聊天气泡展示。
 * 正常流(已由 adpClient 抽好纯文本)不受影响。
 */
export function cleanTheaterText(s: string): string {
  if (!s) return '';
  let t = s;
  // 抽取 {"Content":"..."} 载荷
  const blobs: string[] = [];
  const re = /\{\s*"Content"\s*:\s*"((?:[^"\\]|\\[\s\S])*)"\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    try {
      blobs.push(JSON.parse('"' + m[1] + '"'));
    } catch {
      blobs.push(m[1]);
    }
  }
  if (blobs.length > 0) {
    const joined = blobs.join('');
    if (joined.trim().length >= 40) t = joined;
  }
  // 去残留事件壳
  t = t.replace(/\{\s*"Type"\s*:\s*"[^"]*"\s*\}/g, '');
  t = t.replace(/\{\s*"Answer"\s*:\s*"[^"]*"\s*\}/g, '');
  t = t.replace(/\{\s*"Type"\s*:\s*"custom_params"[\s\S]*?\}\s*\}?(?=\n|$)/g, '');
  // 去 markdown 标记
  t = t.replace(/^#{1,6}\s*/gm, '').replace(/\*\*([^*\n]+)\*\*/g, '$1');
  return t.trim();
}

export interface TheaterOption {
  key: string; // 'A' | 'B' | 'C'
  text: string;
  pathType: 'scam' | 'hesitate' | 'correct' | string;
}

export interface TheaterTurn {
  visible: string; // 【玩家可见】正文(场景轮)或整段(反馈/复盘轮)
  manual?: string; // 【主持人手册】正文(场景轮里隐藏,用户选完后才展示)
  options?: TheaterOption[]; // 场景轮的选择按钮
  phase?: 'scene' | 'feedback' | 'review' | string;
  result?: string; // 反馈轮:所选路径的具体后果
  tips?: string[]; // 复盘轮:反诈心法
  raw: string;
  routingError?: string; // ADP 主控 agent 路由错误时的诊断信息
}

/** 从纯文本格式中正则提取 A/B/C 选项(无 JSON 信封时的兜底) */
function parseOptionsFromText(text: string): TheaterOption[] | undefined {
  // 匹配 "A. xxx" / "A、xxx" / "A：xxx" 等格式
  const re = /^\s*([A-C])[.、：:]\s*(.+)$/gm;
  const opts: TheaterOption[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    opts.push({
      key: m[1],
      text: m[2].trim(),
      pathType: m[1] === 'C' ? 'correct' : m[1] === 'B' ? 'hesitate' : 'scam',
    });
  }
  return opts.length > 0 ? opts : undefined;
}

/** 判断 phase: 根据文本特征推断当前轮次 */
function inferPhase(text: string, options?: TheaterOption[]): string {
  if (/复盘|演练报告|反诈心法|套路链/.test(text)) return 'review';
  if (/选择结果|你的选择结果|后果|回头看/.test(text)) return 'feedback';
  if (options && options.length > 0) return 'scene';
  return 'scene';
}

/** 解析 ADP 一轮返回:先清洗流噪声,再拆分可见/手册、抽取 JSON 信封;无信封则从文本正则抠选项 */
export function parseTheaterTurn(raw: string): TheaterTurn {
  const env = extractJson(raw);
  // 清洗:抽 Content 载荷、去事件壳/路由口播/Thought 噪声
  const cleaned = cleanTheaterText(raw);
  let visible = cleaned;
  let manual: string | undefined;

  // 路由错误识别:ADP 主控 agent 还在用旧版"信息收集"提示词自己回答,
  // 把它的内部思考当剧本正文是错的,直接标记为错误并 fallback 到本地剧本
  const routingError = isMainAgentRoutingNoise(cleaned) || isMainAgentRoutingNoise(raw)
    ? buildRoutingErrorHint(raw)
    : undefined;

  // 过滤掉 Thought/思考过程(ADP 有时会返回内部推理)
  const thoughtMatch = raw.match(/【?Thought?】?\s*[\s\S]*?(?=【|\n\n|$)/i);
  if (thoughtMatch && thoughtMatch[0].length < raw.length * 0.8) {
    // 只在 Thought 占比较小时才移除(避免误删正文)
  }

  // 场景轮用 '---' 分隔【玩家可见】与【主持人手册】
  const sep = visible.indexOf('---');
  if (sep !== -1 && raw.includes('主持人手册')) {
    visible = raw.slice(0, sep);
    manual = raw.slice(sep + 3);
  }
  const cleanVisible = stripJsonFence(visible);
  const cleanManual = manual ? stripJsonFence(manual) : undefined;

  // 优先用 JSON 信封的 options;否则从文本正则抠
  const options =
    Array.isArray(env?.options) && env.options.length > 0
      ? env.options.map((o: any) => ({
          key: String(o.key || ''),
          text: String(o.text || ''),
          pathType: String(o.pathType || 'unknown'),
        }))
      : parseOptionsFromText(cleanVisible);

  // 兜底:场景轮没抠到选项(如 ADP 返回叙事体剧本)时,给通用 A/B/C,保证流程可继续
  const needFallback =
    !options && cleanVisible.trim().length > 60 && inferPhase(cleanVisible) === 'scene';

  return {
    visible: cleanVisible,
    manual: cleanManual,
    options: needFallback
      ? [
          { key: 'A', text: '相信对方,按指示继续操作', pathType: 'scam' },
          { key: 'B', text: '有点怀疑,先追问确认一下', pathType: 'hesitate' },
          { key: 'C', text: '直接拒绝,并举报/报警', pathType: 'correct' },
        ]
      : options,
    phase: env?.phase || inferPhase(cleanVisible, options),
    result: env?.result ? String(env.result) : undefined,
    tips: Array.isArray(env?.tips) ? env.tips.map(String) : undefined,
    raw,
    routingError,
  };
}

/** 生成路由错误时给用户看的诊断提示 */
function buildRoutingErrorHint(raw: string): string {
  const snippet = raw.replace(/\s+/g, ' ').slice(0, 240);
  return [
    '【ADP 主控 Agent 路由到了"信息收集"分支,没生成剧本】',
    '',
    '判断依据:返回内容含有"我需要询问/收集年级专业场景"等主控 agent 的旧提示词口吻,且无剧本结构。',
    '',
    '请到腾讯云 ADP 控制台检查:',
    '  1)「剧本生成 Agent」节点的提示词是否已换成我们给的那份 DM 版(强调"含场景关键词+直接生成 → 立即出剧本")',
    '  2) 工作流路由是否会把"直接生成剧本"转发给这个 Agent,而不是主控 agent 自己回答',
    '  3) 或把 main agent 提示词里"三项信息未全部获取前只做询问"那段删除/改写',
    '',
    '本次已自动 fallback 到本地剧本,你可以正常演练;修复 ADP 之前不会再走通实时生成。',
    '',
    '【原始返回片段】',
    snippet,
  ].join('\n');
}

/* ============ 方案 B: intent 协议标签 ============ */

/**
 * 前端 → ADP 的请求协议:用 [intent=xxx] 标签让 Agent1 做确定性路由(不依赖大模型判断意图)。
 * Agent1 提示词里写死规则:看到 [intent= 标签 → 转发剧本线;没有 → 走 FAQ。
 */
export type TheaterIntent =
  | 'generate_scene'    // 生成新场景(round=0)
  | 'choice_feedback'   // 用户选了 A/B/C,请求反馈 + 下一轮升级
  | 'round_review'      // 复盘结束
  | 'free_text';        // 用户自由输入(当作当前场景内的回应)

export interface TheaterRequest {
  intent: TheaterIntent;
  round: number;
  scene?: string;
  choice?: string;
  context?: string;     // 自由输入正文
}

/** 把结构化请求拼成带协议标签的文本 */
export function buildTheaterRequest(req: TheaterRequest): string {
  const tags: string[] = [`[intent=${req.intent}]`, `[round=${req.round}]`];
  if (req.scene) tags.push(`[scene=${req.scene}]`);
  if (req.choice) tags.push(`[choice=${req.choice}]`);
  const header = tags.join('');
  const body = req.context ? `\n${req.context}` : '';
  return header + body;
}

/** 发一条消息给 ADP 工作流(互动剧场),返回完整文本;支持流式回调 */
export async function runTheaterChat(
  textOrRequest: string | TheaterRequest,
  config: AppConfig,
  handlers: {
    conversationId: string;
    onDelta?: (chunk: string) => void;
    onDone?: (full: string) => void;
    onError?: (msg: string) => void;
  }
): Promise<string> {
  if (!config.appKey || !config.appKey.trim()) {
    throw new Error('未配置 AppKey,无法连接 ADP 工作流');
  }
  const text = typeof textOrRequest === 'string'
    ? textOrRequest
    : buildTheaterRequest(textOrRequest);
  return sendToADP({
    text,
    appKey: config.appKey,
    visitorId: config.visitorId || 'fanzha-web',
    conversationId: handlers.conversationId,
    timeoutMs: 90000,
    onDelta: handlers.onDelta,
    onDone: handlers.onDone,
    onError: handlers.onError,
  });
}

export { stripJsonFence, newConversationId };

/* ============ 模拟来电:一次性 JSON 生成(逻辑保持) ============ */

function buildScenarioPrompt(p: ScenarioGenParams): string {
  const type = p.type || '任意高发骗局';
  const audience = p.audience || '普通群众';
  return `你现在开始一次反诈模拟来电剧本生成任务。
基于知识库中"${type}"相关真实案例,生成一段面向"${audience}"的冒充类来电设定。
严格只输出一个 JSON 对象(可用 \`\`\`json 包裹),结构如下:
{
  "id": "唯一标识",
  "title": "场景标题",
  "badge": "标签如'高频致命'",
  "callerName": "骗子伪装身份,如'北京市公安局专案组·李警官'",
  "callerNumber": "伪装号码描述",
  "description": "骗局简介",
  "openingLine": "骗子开场白(一句逼真话术)",
  "stressFactor": "施压手段描述",
  "dangerKeywords": ["安全账户","验证码","逮捕令"]
}
dangerKeywords 为 3-6 个该骗局高危词,用于前端实时高亮。`;
}

/* ---------- JSON 提取(容错) ---------- */
function looseParseObject(s: string): any | null {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('"use strict"; return (' + s + ');');
    const v = fn();
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

function parseLenient(candidate: string): any | null {
  try {
    return JSON.parse(candidate);
  } catch {
    /* fallthrough */
  }
  try {
    const fixed = candidate.replace(
      /([^\\])(\r?\n)(?=(?:[^"]*"[^"]*")*[^"]*$)/g,
      '$1\\n'
    );
    return JSON.parse(fixed);
  } catch {
    /* fallthrough */
  }
  return looseParseObject(candidate);
}

function extractJson(text: string): any | null {
  if (!text || !text.trim()) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let candidate = fence ? fence[1] : text;
  const first = candidate.indexOf('{');
  const last = candidate.lastIndexOf('}');
  if (first === -1 || last === -1 || last < first) return null;
  candidate = candidate.slice(first, last + 1);
  return parseLenient(candidate);
}

function unwrapRaw(capturedObj: any, full: string): any | null {
  if (capturedObj && capturedObj.Type === 'custom_params' && Array.isArray(capturedObj.CustomParams)) {
    for (const p of capturedObj.CustomParams) {
      const cand = typeof p === 'string' ? parseLenient(p) : p;
      if (cand && typeof cand === 'object' && (cand.nodes || cand.start || cand.id)) return cand;
    }
  }
  if (capturedObj && typeof capturedObj === 'object' && (capturedObj.nodes || capturedObj.start)) {
    return capturedObj;
  }
  return extractJson(full);
}

function normalizeScenario(raw: any): CallScenario | null {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: String(raw.id || 'ai-' + Date.now()),
    title: String(raw.title || 'AI 生成模拟来电'),
    badge: String(raw.badge || 'AI实时生成'),
    callerName: String(raw.callerName || '未知来电'),
    callerNumber: String(raw.callerNumber || ''),
    description: String(raw.description || ''),
    openingLine: String(raw.openingLine || ''),
    stressFactor: String(raw.stressFactor || ''),
    dangerKeywords: Array.isArray(raw.dangerKeywords) ? raw.dangerKeywords.map(String) : [],
  };
}

export interface ScenarioGenParams {
  type?: string;
  audience?: string;
}

export async function generateScenario(
  params: ScenarioGenParams,
  config: AppConfig
): Promise<CallScenario> {
  if (!config.appKey || !config.appKey.trim()) {
    return CALL_SCENARIOS[0];
  }
  try {
    let capturedObj: any = null;
    const full = await sendToADP({
      text: buildScenarioPrompt(params),
      appKey: config.appKey,
      visitorId: config.visitorId || 'fanzha-web',
      conversationId: newConversationId('call'),
      timeoutMs: 90000,
      onObject: (o) => {
        capturedObj = o;
      },
    });
    const raw = unwrapRaw(capturedObj, full);
    const sc = raw ? normalizeScenario(raw) : null;
    return sc || CALL_SCENARIOS[0];
  } catch (e) {
    console.warn('[scenarioGen] generateScenario failed, fallback:', e);
    return CALL_SCENARIOS[0];
  }
}
