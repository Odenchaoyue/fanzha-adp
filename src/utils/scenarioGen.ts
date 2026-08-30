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
  // 过滤 "Thought":"..." 字段(ADP 多 agent 工作流会把工具调用链作为字符串化 JSON 放这)
  // 不依赖 emoji lookahead,直接匹配 "Thought":"<字符串值>" 到字段结束
  t = t.replace(/"Thought"\s*:\s*"(?:[^"\\]|\\[\s\S])*"/g, '').trim();
  // 过滤 【Thought】{...} 块(老格式)
  t = t.replace(/【?Thought?】?\s*\{[^{}]*\}/gi, '').trim();
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

  // 1) 优先:找 {"Content":"...","Thought":"..."} 载荷
  //    ADP 多 agent 工作流会把"思考→工具调用→生成正文"整个过程作为纯文本 delta 发出来,
  //    真正的剧本正文被包在 {"Content":"..."} 里,前面是思考文本,后面是 Thought 字段(字符串化JSON)
  //    正则要求 Content 值后跟 , 或 }(之前只匹配 } 会漏掉 {"Content":"...","Thought":"..."} 格式)
  const contentRe = /\{\s*"Content"\s*:\s*"((?:[^"\\]|\\[\s\S])*)"\s*[,}]/;
  const cm = t.match(contentRe);
  if (cm) {
    try {
      const contentValue = JSON.parse('"' + cm[1] + '"');
      if (contentValue && contentValue.trim().length >= 40) {
        // 找到 Content 载荷 → 只返回 Content 值,丢弃前面的思考文本和后面的 Thought 字段
        return contentValue
          .replace(/^#{1,6}\s*/gm, '')
          .replace(/\*\*([^*\n]+)\*\*/g, '$1')
          .trim();
      }
    } catch {
      // 流式中 JSON 转义不完整 → 回退到下方兜底
    }
  }

  // 2) 兜底:流式中 Content 载荷不完整时,删除已知的噪声字段
  // 删除 "Thought":"..." 字段(字符串化 JSON,可能很长)
  t = t.replace(/"Thought"\s*:\s*"(?:[^"\\]|\\[\s\S])*"/g, '');
  // 去残留事件壳
  t = t.replace(/\{\s*"Type"\s*:\s*"[^"]*"\s*\}/g, '');
  t = t.replace(/\{\s*"Answer"\s*:\s*"[^"]*"\s*\}/g, '');
  t = t.replace(/\{\s*"Type"\s*:\s*"custom_params"[\s\S]*$/g, ''); // 删到结尾(结束事件)
  // 去 markdown 标记
  t = t.replace(/^#{1,6}\s*/gm, '').replace(/\*\*([^*\n]+)\*\*/g, '$1');
  return t.trim();
}

/**
 * 清洗模拟来电(SimulatedCall)的 ADP 流文本:
 * - ADP 主控 agent 会把"思考→调知识库→再思考→生成正文"整个过程作为纯文本 delta 发出来
 * - 第一次回复通常有"好的！智能体马上启动！"分界标记,第二次回复往往没有
 * - 思考句式多变(我需要/我应该/根据我的角色/用户正在/现在我需要以...),追着列特征永远追不全
 *
 * 策略(从最稳到最激进的兜底):
 * 1) 分界标记"好的！智能体马上启动!" → 取它之后的内容
 * 2) 删除事件壳({"Type":"..."} / {"Type":"custom_params",...} / "Thought":...)
 * 3) 找"正文开始标志"(您好/你好/这里是/这个案件/本次/本案/此案/您的身份证/你的身份证)
 *    骗子对用户说话一定有这些开头,取标志之后的所有内容 → 一次性丢弃前面所有思考
 * 4) 如果正文标志也没找到,回退到句子级思考特征删除(最后兜底)
 * 5) 去 markdown
 */
export function cleanCallText(s: string): string {
  if (!s) return '';
  let t = s;

  // 1) 分界标记快速跳过(第一次回复通常有)
  const MARKER = '好的！智能体马上启动！';
  const idx = t.lastIndexOf(MARKER);
  if (idx !== -1) {
    t = t.slice(idx + MARKER.length).trim();
  }

  // 2) 删除事件壳(ADP SSE 事件被作为文本 delta 发出来的情况)
  t = t.replace(/\{\s*"Type"\s*:\s*"[^"]*"\s*\}/g, '');
  t = t.replace(/\{\s*"Answer"\s*:\s*"[^"]*"\s*\}/g, '');
  t = t.replace(/\{\s*"Type"\s*:\s*"custom_params"[\s\S]*$/g, '');
  t = t.replace(/"Thought"\s*:\s*"(?:[^"\\]|\\[\s\S])*"/g, '');

  // 3) 找"正文开始标志",取它之后的所有内容(最稳,一次性丢弃前面所有思考)
  //    骗子对用户说话一定有这些开头;思考句里通常用"用户"而非"您"
  const BODY_START = /您好|你好|这里是|这个案件|本次|本案|此案|您的身份证|你的身份证|您的账户|你的账户|您的银行卡|你的银行卡/;
  const m = t.match(BODY_START);
  if (m && m.index !== undefined && m.index > 0) {
    // 只在标志不在字符串开头时切割(避免误删"您好"开头的正文)
    t = t.slice(m.index);
  }

  // 4) 兜底: 如果正文标志没找到(分界标记+正文标志都失效),用句子级思考特征删除
  if (idx === -1 && !m) {
    // 句子级: 句首(字符串开头或句末标点后)有思考特征 → 删整句
    // 思考特征严格,避免误杀正文("我需要+您"不删,"我需要+动词"删)
    t = t.replace(/(^|[。！？\.\?!])\s*(?:让我(?:先|继续|检索|理解|思考|尝试|生成)|我需要[^您你]|我应该(?:用|强调|继续|保持|说)|根据我的角色|根据角色|用户正在|用户刚才|用户产生|用户要求|用户希望|用户明确|用户提供|现在我需要|按照[^,。]*要求|保持角色内|知识库中)[^。]*[。！？]/g, '$1');
  }

  // 5) 去 markdown
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

  // 过滤掉 Thought/思考过程(ADP 有时会返回内部推理) — stripJsonFence 已处理,此处不再重复

  // 场景轮用 '---' 分隔【玩家可见】与【主持人手册】
  // 注意:必须在 cleaned 文本里找索引,也在 cleaned 里切(不能混用 raw 和 cleaned 的索引)
  const sep = visible.indexOf('---');
  if (sep !== -1 && visible.includes('主持人手册')) {
    manual = visible.slice(sep + 3).trim();
    visible = visible.slice(0, sep).trim();
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

/* ============ 极简方案: 单 Agent + 前端状态机 ============ */

/**
 * 前端 → ADP 的请求协议:ADP 只放一个「剧本生成」Agent,无路由、无意图识别。
 * 前端维护全部状态(轮次/上一轮摘要/用户选择),每轮把完整上下文拼成自然语言发过去,
 * ADP 只是"收上下文 → 跑大模型 → 返回文本"的管道。
 */
export interface TheaterRequest {
  round: number;        // 0=开场, 1+=反馈/自由输入, 复盘轮为当前 round
  scene?: string;       // round 0 的场景关键词
  lastScene?: string;   // 上一轮场景摘要(来自上一次 DM 回复的正文)
  choice?: string;      // 用户选的选项文本(如 "A 相信对方")
  freeText?: string;    // 用户自由输入正文
  review?: boolean;     // 复盘轮标记
  audience?: string;    // 受众身份(大学生/上班族/中老年/其他),可选
  major?: string;       // 专业/职业(如 计算机/会计/医学),可选
}

/** 拼接受众描述(身份 + 专业);为空返回空串 */
function buildAudiencePart(req: TheaterRequest): string {
  if (!req.audience) return '';
  const major = req.major ? `(${req.major})` : '';
  return `受众:${req.audience}${major}。`;
}

/** 把结构化请求拼成自然语言上下文 */
export function buildTheaterRequest(req: TheaterRequest): string {
  const audiencePart = buildAudiencePart(req);
  if (req.review) {
    return `[round=${req.round}] 演练结束,请生成复盘报告。${audiencePart}对话摘要:${req.lastScene || '已完成多轮演练'}`;
  }
  if (req.round === 0) {
    // 受众信息已附上时,显式告诉主控/剧本 agent 不要反问身份
    const noAsk = audiencePart ? '请直接生成开场,不要反问身份。' : '';
    return `[round=0] 场景:${req.scene || ''}。${audiencePart}请生成开场场景 + A/B/C 选项。${noAsk}`.replace(/\s+/g, ' ').trim();
  }
  // 纯升级(无选择无自由输入,如"再来一轮"按钮触发)
  if (req.round > 0 && !req.choice && !req.freeText) {
    return `[round=${req.round}] ${audiencePart}上一轮场景:${req.lastScene || ''}。请升级骗子话术,给出新一轮开场 + 陷阱 + 新 A/B/C 选项。`.replace(/\s+/g, ' ').trim();
  }
  if (req.choice) {
    return `[round=${req.round}] ${audiencePart}上一轮场景:${req.lastScene || ''}。用户选择了「${req.choice}」。请给出选择后果 + 升级场景 + 新 A/B/C 选项。`.replace(/\s+/g, ' ').trim();
  }
  // 自由输入
  return `[round=${req.round}] ${audiencePart}上一轮场景:${req.lastScene || ''}。用户说:「${req.freeText || ''}」。请继续推进骗局并给出新的 A/B/C 选项。`.replace(/\s+/g, ' ').trim();
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
    signal?: AbortSignal;
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
    timeoutMs: 180000,
    onDelta: handlers.onDelta,
    onDone: handlers.onDone,
    onError: handlers.onError,
    signal: handlers.signal,
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
      timeoutMs: 180000,
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
