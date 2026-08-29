/**
 * adpClient.ts - 私有化 ADP 对话客户端(SSE 流式)
 *
 * 已在旧版单页中实测验证的协议要点:
 * 1. 请求体是 PascalCase: RequestId/ConversationId/AppKey/VisitorId/Contents/Incremental/Stream
 * 2. Content-Type 故意用 text/plain 绕过 CORS 预检(服务端照常按 JSON 解析)
 * 3. 响应是 SSE 流,但私有化部署混用多种事件格式,必须全部兼容:
 *    - 流式增量: message 事件里 Payload.Text / Text
 *    - 整包回复: 事件顶层 Content 字段(同事件的 Thought 是思维链,必须过滤)
 *    - 错误:     MessageType === 'error' 或 response.failed
 * 4. 反向过滤原则: 只要事件不是思维链(thought)就尝试渲染正文,
 *    宁可漏渲染也不能把思维链漏给用户看。
 */

export interface ADPOptions {
  text: string;                 // 要发送的用户消息
  appKey: string;               // ADP 应用密钥
  visitorId: string;            // 访客 ID
  conversationId: string;       // 会话 ID(同一通电话/同一场问答保持一致)
  onDelta?: (chunk: string) => void;  // 流式增量回调(正文片段)
  onDone?: (fullText: string) => void; // 流结束
  onError?: (msg: string) => void;     // 出错
  onObject?: (obj: any) => void;       // 工作流结束节点 output type=obj 时回调(返回结构化对象)
  timeoutMs?: number;                  // 超时(毫秒),默认 180000;ADP 多 Agent 工作流较慢,给足时间
  signal?: AbortSignal;                 // 外部取消信号(如换场景/关模态框时 abort)
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/* ====== 单个 SSE 事件解析(三格式兼容 + 思维链过滤) ====== */
function extractEventText(evt: any): string | null {
  const t = evt.MessageType || evt.Type || evt.type || evt.event || "";

  // 错误事件
  if (t === "error" || t === "response.failed") {
    const em = (evt.Payload && (evt.Payload.Message || evt.Payload.Text)) || evt.Message || evt.Text || "未知错误";
    throw new Error(typeof em === "string" ? em : JSON.stringify(em));
  }

  // 思维链判定(绝不渲染给用户)
  const isThought =
    t === "thought" ||
    !!evt.Thought ||
    !!(evt.Payload && evt.Payload.Thought) ||
    t === "thinking";
  if (isThought) return null;

  // 对象型输出(ADP 工作流结束节点 output type=obj):
  // 直接序列化为合法 JSON 字符串,便于下游 JSON.parse;真正的对象另由 extractEventObject 透传给 onObject
  const objCandidates = [
    evt.Output,
    evt.Payload && evt.Payload.Output,
    evt.Content,
    evt.Payload && evt.Payload.Content,
  ];
  for (const c of objCandidates) {
    if (c && typeof c === "object" && !Array.isArray(c)) {
      try { return JSON.stringify(c); } catch { /* fallthrough */ }
    }
  }

  // 格式一: 整包回复(顶层 Content)
  if (typeof evt.Content === "string" && evt.Content) {
    return evt.Content;
  }

  // 格式二: 流式增量(message 事件的 Payload.Text / Text)
  const txt =
    (evt.Payload && (evt.Payload.Text || evt.Payload.Content)) || evt.Text;
  if (typeof txt === "string" && txt) return txt;

  return null;
}

/* ====== 抽取「对象型输出」(ADP 工作流 output type=obj 时) ====== */
function extractEventObject(evt: any): any | null {
  const t = evt.MessageType || evt.Type || evt.type || evt.event || "";
  if (t === "error" || t === "response.failed") return null;
  const isThought =
    t === "thought" ||
    !!evt.Thought ||
    !!(evt.Payload && evt.Payload.Thought) ||
    t === "thinking";
  if (isThought) return null;
  const candidates = [
    evt.Output,
    evt.Payload && evt.Payload.Output,
    evt.Content,
    evt.Payload && evt.Payload.Content,
  ];
  for (const c of candidates) {
    if (c && typeof c === "object" && !Array.isArray(c)) return c;
  }
  return null;
}

/* ====== 主函数: 发送一条消息并流式读取回复 ====== */
export async function sendToADP(opts: ADPOptions): Promise<string> {
  const body = {
    RequestId: uid(),
    ConversationId: opts.conversationId,
    AppKey: opts.appKey,
    VisitorId: opts.visitorId,
    Contents: [{ Type: "text", Text: opts.text }],
    Incremental: true,
    Stream: "enable",
  };

  let full = "";
  const timeoutMs = opts.timeoutMs ?? 180000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // 外部 signal → 联动内部 controller(如换场景/关弹窗时取消)
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  try {
    const res = await fetch("/proxy/adp", {
      method: "POST",
      headers: { "Content-Type": "text/plain" }, // 绕 CORS 预检
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      const errText = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${errText.slice(0, 200)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // 按行拆分(SSE 协议: 每条事件以 data: 开头、换行结尾)
      const lines = buf.split("\n");
      buf = lines.pop() || ""; // 最后一段可能不完整,留到下一轮

      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith("data:")) continue;
        const payload = s.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        let evt: any;
        try {
          evt = JSON.parse(payload);
        } catch {
          continue; // 非 JSON 行(注释/心跳)跳过
        }

        try {
          const obj = extractEventObject(evt);
          if (obj) opts.onObject?.(obj);
          const text = extractEventText(evt);
          if (text) {
            // 去重策略(兼容三种 ADP 发送模式):
            // 1) 整包模式: text 是 full 的子串 → 跳过
            // 2) 累积式 delta: text 包含 full(每次发的是完整内容) → 用 text 替换 full
            // 3) 增量式 delta: text 是纯新增片段 → 追加
            if (full && text.length <= full.length && full.includes(text)) continue;
            if (full && text.length > full.length && text.startsWith(full)) {
              const delta = text.slice(full.length);
              full = text;
              opts.onDelta?.(delta);
            } else {
              full += text;
              opts.onDelta?.(text);
            }
          }
        } catch (e: any) {
          opts.onError?.(e.message || "ADP 事件解析失败");
          return full; // 错误事件: 中止读取
        }
      }
    }
  } catch (e: any) {
    if (e?.name === "AbortError") {
      opts.onError?.(
        `ADP 请求超时(>${Math.round(timeoutMs / 1000)}s 无响应),请检查工作流是否卡住或未返回`
      );
    } else {
      opts.onError?.(e?.message || "网络请求失败");
    }
    return full;
  } finally {
    clearTimeout(timer);
  }

  opts.onDone?.(full);
  return full;
}

/* 生成会话 ID */
export function newConversationId(prefix: string): string {
  return `${prefix}-${uid()}`;
}
