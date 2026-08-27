/**
 * riskEngine.ts - 风险监控与复盘报告引擎(纯本地,零后端依赖)
 *
 * ADP 工作流返回的是自然语言(不是结构化 JSON),所以:
 * - 心理施压指数 / 诈骗技巧标签 → 用本地词库对 AI 回复实时计分
 * - 挂断后的法证报告 → 用规则引擎基于通话记录生成
 * 这样演示时复盘环节永远稳定,不会因为网络问题白屏。
 */
import { CallScenario, ConversationTurn, ForensicReport } from "../types";

/* ====== 通用诈骗话术词库(高危/中危) ====== */
const HIGH_RISK_WORDS = [
  "验证码", "安全账户", "屏幕共享", "转账", "汇款", "银行卡号", "密码",
  "通缉", "逮捕", "洗钱", "冻结", "垫付", "保证金", "解冻金", "补单",
  "刷单", "清查", "过桥", " Inner", "封存",
];
const MID_RISK_WORDS = [
  "保密", "不要告诉", "单独", " remote", "远程操作", "会议软件", "下载APP",
  "下载app", "链接", "点击", "额度", "清退", "内幕", "稳赚", "日化",
  "高额回报", "立即", "马上", "最后", "名额", "逾期", "影响征信", "扣费",
];

/* 用户反制行为词(出现说明学员在正确应对) */
const COUNTER_WORDS = [
  "核实", "110", "96110", "官方", "报警", "诈骗", "骗子", "挂断",
  "派出所", "柜台", "不信", "不需要", "拒绝", "当面",
];
/* 用户顺从行为词(出现说明学员被牵着走) */
const COMPLY_WORDS = ["好的", "行", "我马上", "可以", "没问题", "我配合", "你说", "我操作", "我试试"];

/* 高危词 → 报告里的破绽说明 */
const WORD_EXPLANATIONS: Record<string, string> = {
  验证码: "索要短信验证码 —— 任何机构都不会索要验证码,索要即诈骗",
  安全账户: "要求转入\u201c安全账户\u201d —— 公检法不存在安全账户,这是经典话术",
  屏幕共享: "诱导开启屏幕共享 —— 共享后银行卡与验证码会被实时窃取",
  转账: "诱导转账汇款 —— 凡是电话里让你转账的都要立即挂断",
  汇款: "诱导转账汇款 —— 凡是电话里让你汇款的都要立即挂断",
  银行卡号: "套取银行卡号 —— 正规退款原路返还,从不需要卡号",
  密码: "套取密码 —— 任何场景索要密码都是诈骗",
  通缉: "虚构通缉令制造恐慌 —— 公检法不会电话办案",
  逮捕: "以逮捕威慑 —— 公检法不会电话办案,更不会电话逮捕",
  洗钱: "虚构洗钱案件 —— 典型冒充公检法开场话术",
  冻结: "虚构账户冻结恐吓 —— 制造紧迫感的心理操控",
  垫付: "诱导垫付资金 —— 领导/熟人借钱务必当面或电话核实",
  保证金: "索要保证金 —— 正规业务不存在保证金",
  刷单: "刷单兼职 —— 所有刷单都是诈骗",
  补单: "连环补单套路 —— 前期小利后期吞本的典型骗局",
};

/* ====== 实时计分 ====== */
export function scoreRisk(text: string): { delta: number; hitHigh: string[]; hitMid: string[] } {
  const hitHigh: string[] = [];
  const hitMid: string[] = [];
  for (const w of HIGH_RISK_WORDS) if (text.includes(w)) hitHigh.push(w);
  for (const w of MID_RISK_WORDS) if (text.includes(w)) hitMid.push(w);
  const delta = hitHigh.length * 12 + hitMid.length * 5;
  return { delta, hitHigh, hitMid };
}

/* 命中词 → 技巧标签 */
export function wordsToTactics(hitHigh: string[], hitMid: string[]): string[] {
  const tactics = new Set<string>();
  if (hitHigh.some((w) => ["通缉", "逮捕", "洗钱", "冻结", "清查"].includes(w))) tactics.add("权威威慑");
  if (hitHigh.some((w) => ["验证码", "银行卡号", "密码"].includes(w))) tactics.add("套取核心信息");
  if (hitHigh.some((w) => ["转账", "汇款", "安全账户", "垫付", "保证金"].includes(w))) tactics.add("诱导资金转移");
  if (hitHigh.some((w) => ["屏幕共享"].includes(w)) || hitMid.some((w) => w.includes("会议") || w.includes("远程"))) tactics.add("诱导屏幕共享");
  if (hitMid.some((w) => ["保密", "不要告诉", "单独"].includes(w))) tactics.add("隔离受害人");
  if (hitMid.some((w) => ["立即", "马上", "最后", "名额", "逾期"].includes(w))) tactics.add("制造紧迫感");
  if (hitMid.some((w) => ["内幕", "稳赚", "日化", "高额回报"].includes(w))) tactics.add("利诱话术");
  return Array.from(tactics);
}

/* ====== 本地复盘报告生成 ====== */
export function generateLocalReport(
  scenario: CallScenario,
  conversation: ConversationTurn[],
  callSeconds: number,
  reason: string
): ForensicReport {
  const callerText = conversation
    .filter((m) => m.sender === "caller")
    .map((m) => m.text)
    .join("\n");
  const userTexts = conversation
    .filter((m) => m.sender === "user")
    .map((m) => m.text);

  // 骗子话术命中
  const hitHigh = HIGH_RISK_WORDS.filter((w) => callerText.includes(w));
  const hitMid = MID_RISK_WORDS.filter((w) => callerText.includes(w));
  // 学员行为统计
  const counterCount = userTexts.filter((t) =>
    COUNTER_WORDS.some((w) => t.includes(w))
  ).length;
  const complyCount = userTexts.filter((t) =>
    COMPLY_WORDS.some((w) => t.includes(w))
  ).length;
  const questionedNothing = userTexts.length === 0;

  // 综合得分
  let score = reason === "未接拒听" ? 96 : reason === "识破挂断" ? 84 : 62;
  score += counterCount * 5 - complyCount * 6;
  if (questionedNothing && reason !== "未接拒听") score -= 8;
  score = Math.max(35, Math.min(99, score));

  const riskLevel: ForensicReport["riskLevel"] =
    score >= 85 ? "极低风险" : score >= 70 ? "中低风险" : score >= 55 ? "中等风险" : "高危易受骗";

  // 五维雷达
  const radar = {
    authorityResistance: clamp(60 + counterCount * 8 - complyCount * 5 + (reason === "识破挂断" ? 10 : 0)),
    greedResistance: clamp(
      65 - (hitMid.includes("稳赚") || hitMid.includes("内幕") ? 10 : 0) + counterCount * 4
    ),
    verificationHabit: clamp(50 + (userTexts.some((t) => /核实|官方|110|96110|柜台/.test(t)) ? 30 : 0)),
    privacyAwareness: clamp(75 - (hitHigh.includes("验证码") && complyCount > 0 ? 25 : 0)),
    urgencyComposure: clamp(65 + (reason === "识破挂断" || reason === "未接拒听" ? 15 : 0) - complyCount * 4),
  };

  // 弱点分析
  const vulnerabilities: string[] = [];
  if (complyCount >= 2) vulnerabilities.push("对话中出现多次顺从性回应,未对对方身份提出质疑");
  if (!userTexts.some((t) => /核实|官方|110|96110|柜台/.test(t)) && userTexts.length > 0)
    vulnerabilities.push("全程未主动通过官方渠道交叉核实来电真实性");
  if (questionedNothing && reason !== "未接拒听")
    vulnerabilities.push("接听后全程沉默或被动应对,未有效采集可供核验的信息");
  if (vulnerabilities.length === 0)
    vulnerabilities.push("整体应对冷静规范,未发现明显行为漏洞");

  // 骗子破绽
  const exposed = hitHigh
    .map((w) => WORD_EXPLANATIONS[w])
    .filter(Boolean)
    .slice(0, 4);
  if (exposed.length === 0)
    exposed.push("本轮对话中骗子话术特征尚不充分,建议延长对抗回合观察");

  // 专业建议(按场景给定制建议)
  const suggestions = scenarioAdvice(scenario.id);

  return {
    caseNumber: `CASE-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(
      1000 + Math.random() * 9000
    )}`,
    timestamp: new Date().toLocaleString("zh-CN"),
    scenarioTitle: scenario.title,
    durationSeconds: callSeconds,
    overallScore: score,
    riskLevel,
    radarScores: radar,
    detectedVulnerabilities: vulnerabilities,
    scamPointsExposed: exposed,
    expertSuggestions: suggestions,
    conversationLog: conversation,
  };
}

function scenarioAdvice(id: string): string[] {
  const common = ["牢记三不原则:不轻信、不透露、不转账。", "如有疑虑,立即拨打全国反诈专线 96110 咨询核实。"];
  switch (id) {
    case "police":
      return ["公检法机关绝不会通过电话/QQ/微信办案,更不存在\u201c安全账户\u201d。", ...common];
    case "insurance":
      return ["微信/\u201c百万保障\u201d等一切\u201c取消扣费\u201d要求,请只在官方 App 内自行操作,任何屏幕共享要求一律拒绝。", ...common];
    case "flight":
      return ["航班变动只信航空公司官方 App/官网和机场柜台,退赔一律原路返还,无需提供卡号或验证码。", ...common];
    case "boss":
      return ["领导/熟人线上要求转账时,务必电话或当面核实本人,再急的款项也差这几分钟。", ...common];
    case "finance":
      return ["一切\u201c稳赚不赔、日化收益\u201d的投资都是诈骗,不要有侥幸心理。", ...common];
    default:
      return common;
  }
}

function clamp(n: number) {
  return Math.max(20, Math.min(100, Math.round(n)));
}
