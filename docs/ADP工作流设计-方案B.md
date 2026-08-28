# ADP 反诈工作流设计文档（方案 B 精简版）

## 一、整体拓扑

```
                       ┌─ [intent=generate_scene]  ─→ Agent4a(场景生成) ─→ 代码节点 ─→ 结束1
                       │
 入口 ─→ 路由条件节点 ─┼─ [intent=choice_feedback] ─→ Agent4b(选择反馈) ─→ 代码节点 ─→ 结束2
       (字符串匹配)    │
                       ├─ [intent=round_review]    ─→ Agent4c(复盘)    ─→ 代码节点 ─→ 结束3
                       │
                       ├─ [intent=free_text]       ─→ Agent4b(选择反馈) ─→ 代码节点 ─→ 结束2
                       │
                       └─ 不含 [intent=            ─→ Agent2(FAQ)      ───────────→ 结束4
```

**删除的节点：** 原 Agent1（剧本智能助手-ProAgent）、原「大模型意图识别」节点——路由职责合并进新的「路由条件节点」。

---

## 二、节点清单（共 8 个）

| 序号 | 节点名 | 节点类型 | 职责 |
|---|---|---|---|
| 1 | 路由条件节点 | 条件判断 / 代码节点 | 按 `[intent=` 字符串路由到 5 条分支 |
| 2 | Agent4a-场景生成 | Agent | 生成开场场景 + A/B/C 选项 |
| 3 | Agent4b-选择反馈 | Agent | 处理用户选择，给出后果 + 升级场景 |
| 4 | Agent4c-复盘 | Agent | 生成复盘报告 |
| 5 | Agent2-FAQ | Agent | 回答反诈知识提问 |
| 6 | 代码节点-结构化提取 | 代码节点 | 从 Agent 输出里提取 visible/manual/options |
| 7 | 结束1~4 | 结束节点 | 输出代码节点的 JSON / Agent2 文本 |
| 8 | 开始节点 | 入口 | 接收前端 SSE 请求 |

---

## 三、逐节点配置

### 节点 1：路由条件节点

**类型选择（二选一）：**

#### 方案 A：代码节点（推荐，零歧义）

```javascript
var input = $input || '';
if (input.indexOf('[intent=generate_scene]') >= 0) return 'scene';
if (input.indexOf('[intent=choice_feedback]') >= 0) return 'feedback';
if (input.indexOf('[intent=round_review]') >= 0) return 'review';
if (input.indexOf('[intent=free_text]') >= 0) return 'feedback';
return 'faq';
```

#### 方案 B：大模型判断节点（若 ADP 不支持代码做条件分支）

提示词：

```
判断输入文本包含哪个字符串：
- 包含 "[intent=generate_scene]" → 输出 scene
- 包含 "[intent=choice_feedback]" → 输出 feedback
- 包含 "[intent=round_review]" → 输出 review
- 包含 "[intent=free_text]" → 输出 feedback
- 都不包含 → 输出 faq

只输出上述 5 个英文词之一，不输出任何其他内容、解释、标点。
```

**5 条出边：**
- `scene` → Agent4a
- `feedback` → Agent4b
- `review` → Agent4c
- `faq` → Agent2

---

### 节点 2：Agent4a-场景生成

**输入：** 原始请求文本（含 `[intent=generate_scene][round=0][scene=刷单返利]`）

**提示词：**

```
你是反诈互动剧场的 DM（主持人）。你的唯一任务：根据请求中的 [scene=xxx] 关键词，生成一个沉浸式反诈剧本的开场场景。

输出格式（必须严格遵守，按顺序输出）：

第一部分：玩家可见正文
📋 背景设定
（1-2 句交代人物身份和情境，身份由场景自然驱动，不强制"某高校学生"）

🎭 诈骗开场
"骗子说的话，用引号包裹，语气逼真"

第二部分：分隔线（单独一行，就是三个减号）
---

第三部分：主持人手册
🔒 主持人手册
（选完后才揭示，写明骗术真相和关键陷阱，不超过 100 字）

第四部分：JSON 信封（放在最后，用 ```json 包裹）
```json
{
  "phase": "scene",
  "options": [
    {"key": "A", "text": "上当选项描述", "pathType": "scam"},
    {"key": "B", "text": "犹豫选项描述", "pathType": "hesitate"},
    {"key": "C", "text": "正确识破选项描述", "pathType": "correct"}
  ]
}
```

规则：
- 正文不超过 150 字
- A 选项是上当（按骗子指示操作），B 是犹豫/试探，C 是正确识破
- 不要输出 Thought，不要解释你在做什么，不要复述用户输入
- 不要询问年级、专业，直接生成
```

**输出：** 文本 → 代码节点

---

### 节点 3：Agent4b-选择反馈

**输入：** 原始请求文本（含 `[intent=choice_feedback][round=N][choice=A]`）

**提示词：**

```
你是反诈互动剧场的 DM。用户刚做了一个选择，你需要给出选择后果 + 下一轮升级场景。

从请求中读取 [choice=X] 标签，X 是 A/B/C 之一。从 [round=N] 标签读取当前轮次。

分支逻辑：
- choice=A（上当）：骗子得逞并进一步诱导，场景升级（更大金额、更紧急的话术），给新的 A/B/C。
- choice=B（犹豫）：骗子加大施压，用"最后机会""别人已经赚到了"等话术逼你就范，给新的 A/B/C。
- choice=C（正确识破）：骗子恼怒或挂断，可能换套路尝试二次诈骗；若 round >= 4 可以收尾。
- 如果 intent=free_text（无 choice 标签）：把用户输入当作当前场景内的回应，骗子根据这句话继续推进骗局，给新的 A/B/C。

输出格式（与场景生成相同）：

📋 选择后果
（1-2 句描述这个选择/回应导致的结果）

🎭 新情况
（骗子的话术或新场景，用引号包裹关键台词）

---
🔒 主持人手册
（这一轮的骗术拆解，不超过 100 字）

```json
{
  "phase": "feedback",
  "result": "选择后果简述（1 句话）",
  "options": [
    {"key": "A", "text": "...", "pathType": "scam"},
    {"key": "B", "text": "...", "pathType": "hesitate"},
    {"key": "C", "text": "...", "pathType": "correct"}
  ]
}
```

规则：
- 不复述之前的场景，直接给后果和新情况
- 正文不超过 150 字
- 若 round >= 4，C 选项可以是"骗子彻底放弃，本轮结束"，pathType 仍为 correct
```

**输出：** 文本 → 代码节点

---

### 节点 4：Agent4c-复盘

**输入：** 原始请求文本（含 `[intent=round_review][round=N]`）+ 会话历史

**提示词：**

```
你是反诈互动剧场的复盘官。用户结束了演练，生成一份复盘报告。

根据本次会话的对话历史输出：

📊 演练复盘报告

【总体表现】
（1-2 句评价用户在本次演练中的表现，语气客观，不批评）

【关键转折点】
（列出用户在哪一步做了正确/错误选择，每步 1 句话）

【骗术拆解】
（本次骗子使用的核心话术技巧，列 2-3 个）

【反诈心法】

```json
{
  "phase": "review",
  "result": "总体评价（1 句话）",
  "tips": [
    "心法1（不超过 20 字）",
    "心法2",
    "心法3"
  ]
}
```

规则：
- 全文不超过 300 字
- 不要生成新的 A/B/C 选项
- 不要复述对话内容
```

**输出：** 文本 → 代码节点

---

### 节点 5：Agent2-FAQ

**输入：** 原始用户文本（不含 intent 标签，是反诈知识提问）

**提示词：**

```
你是反诈知识问答助手。回答用户关于电信网络诈骗的问题。

规则：
- 基于反诈知识库回答，覆盖常见骗局类型、识别技巧、应对方法
- 不生成剧本、不生成 A/B/C 选项
- 回答简洁，不超过 200 字
- 如用户问的不是反诈相关问题，礼貌引导回反诈话题
```

**输出：** 文本 → 结束4（不走代码节点）

---

### 节点 6：代码节点-结构化提取

**位置：** Agent4a / 4b / 4c 之后，结束节点之前（三个 Agent 共用同一个代码节点，或各接一份）

**JavaScript 版：**

```javascript
var text = $input || '';

// 1. 提取 JSON 信封
var jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
var envelope = null;
if (jsonMatch) {
  try {
    envelope = JSON.parse(jsonMatch[1].trim());
  } catch(e) {
    var s = jsonMatch[1];
    var fi = s.indexOf('{');
    var li = s.lastIndexOf('}');
    if (fi !== -1 && li !== -1) {
      try { envelope = JSON.parse(s.substring(fi, li + 1)); } catch(e2) {}
    }
  }
}

// 2. 拆分正文和手册
var cleaned = text.replace(/```[\s\S]*?```/gi, '');
var parts = cleaned.split('---');
var visible = (parts[0] || '').trim();
var manual = parts.length > 1 ? (parts[1] || '').trim() : null;

// 3. 优先用信封的 options；否则正则兜底
var options = (envelope && Array.isArray(envelope.options)) ? envelope.options : [];
if (options.length === 0) {
  var re = /^\s*([A-C])[.、：:]\s*(.+)$/gm;
  var m;
  while ((m = re.exec(visible)) !== null) {
    var k = m[1];
    options.push({
      key: k,
      text: m[2].trim(),
      pathType: k === 'C' ? 'correct' : (k === 'B' ? 'hesitate' : 'scam')
    });
  }
}

// 4. 仍然没选项且是场景/反馈轮 → 通用兜底
var phase = (envelope && envelope.phase) || 'scene';
if (options.length === 0 && (phase === 'scene' || phase === 'feedback')) {
  options = [
    {key: 'A', text: '相信对方，按指示操作', pathType: 'scam'},
    {key: 'B', text: '有点怀疑，先追问确认', pathType: 'hesitate'},
    {key: 'C', text: '直接拒绝并举报', pathType: 'correct'}
  ];
}

// 5. 组装输出
var result = {
  visible: visible,
  manual: manual,
  options: options,
  phase: phase,
  result: (envelope && envelope.result) ? envelope.result : undefined,
  tips: (envelope && Array.isArray(envelope.tips)) ? envelope.tips : undefined
};

return JSON.stringify(result);
```

**Python 版：**

```python
import json, re

text = $input or ''

envelope = None
m = re.search(r'```(?:json)?\s*([\s\S]*?)```', text, re.I)
if m:
    try:
        envelope = json.loads(m.group(1).strip())
    except:
        s = m.group(1)
        fi, li = s.find('{'), s.rfind('}')
        if fi != -1 and li != -1:
            try: envelope = json.loads(s[fi:li+1])
            except: pass

cleaned = re.sub(r'```[\s\S]*?```', '', text, flags=re.I)
parts = cleaned.split('---')
visible = parts[0].strip()
manual = parts[1].strip() if len(parts) > 1 else None

options = envelope.get('options', []) if envelope else []
if not options:
    for mm in re.finditer(r'^\s*([A-C])[.、：:]\s*(.+)$', visible, re.M):
        k = mm.group(1)
        options.append({
            'key': k, 'text': mm.group(2).strip(),
            'pathType': 'correct' if k == 'C' else ('hesitate' if k == 'B' else 'scam')
        })

phase = (envelope or {}).get('phase', 'scene')
if not options and phase in ('scene', 'feedback'):
    options = [
        {'key': 'A', 'text': '相信对方，按指示操作', 'pathType': 'scam'},
        {'key': 'B', 'text': '有点怀疑，先追问确认', 'pathType': 'hesitate'},
        {'key': 'C', 'text': '直接拒绝并举报', 'pathType': 'correct'}
    ]

result = {
    'visible': visible, 'manual': manual, 'options': options, 'phase': phase,
    'result': (envelope or {}).get('result'),
    'tips': (envelope or {}).get('tips')
}

return json.dumps(result, ensure_ascii=False)
```

**输出变量：** `output`（JSON 字符串）

---

### 节点 7：结束节点

- **结束 1~3**（剧本线）：输出变量 = 代码节点的 `output`，类型设为 JSON / 字符串（看 ADP 选项）
- **结束 4**（FAQ 线）：输出变量 = Agent2 的文本，类型为字符串

---

## 四、变量与会话状态

| 变量名 | 作用域 | 来源 | 用途 |
|---|---|---|---|
| `conversationId` | 全局 | 前端透传 | 多轮记忆，同一 conversationId 共享上下文 |
| `round` | 前端传递 | 请求文本里的 `[round=N]` 标签 | Agent4b 判断是否收尾 |
| `scene` | 前端传递 | 请求文本里的 `[scene=xxx]` 标签 | Agent4a 知道生成什么场景 |
| `choice` | 前端传递 | 请求文本里的 `[choice=X]` 标签 | Agent4b 知道用户选了什么 |

**重要：** ADP 工作流内部不维护状态，全部由前端 + conversationId 承担。前端 `scenarioGen.ts` 已实现 `roundRef` 跟踪和 intent 标签拼接。

---

## 五、前端请求格式对照

| 用户动作 | 前端发出的文本 |
|---|---|
| 开新场景 | `[intent=generate_scene][round=0][scene=刷单返利]` |
| 选 A | `[intent=choice_feedback][round=1][choice=A]` |
| 选 B 后再选 C | `[intent=choice_feedback][round=2][choice=C]` |
| 自由输入 | `[intent=free_text][round=1]\n我怀疑这是骗局` |
| 复盘结束 | `[intent=round_review][round=3]` |
| 问"什么是杀猪盘" | `什么是杀猪盘`（无 intent 标签，走 FAQ） |

---

## 六、连测验收清单

| # | 测试动作 | 预期结果 | 通过 |
|---|---|---|---|
| 1 | 发 `[intent=generate_scene][round=0][scene=刷单返利]` | 路由节点输出 `scene`，Agent4a 出场景+选项 | ☐ |
| 2 | 同 conversationId 发 `[intent=choice_feedback][round=1][choice=A]` | Agent4b 出升级反馈，不复述场景 | ☐ |
| 3 | 连发 5 个不同场景 | 路由 5/5 命中剧本线，无一走 FAQ | ☐ |
| 4 | 发 `什么是杀猪盘`（无标签） | 走 Agent2 FAQ，不触发剧本 | ☐ |
| 5 | 故意发乱码文本（无标签） | 走 Agent2，不崩 | ☐ |
| 6 | Agent4a 输出格式飘了（没 JSON 信封） | 代码节点正则兜底，前端正常渲染 | ☐ |
| 7 | 一轮生成耗时 | < 30 秒 | ☐ |
| 8 | 同 conversationId 发 `[intent=round_review][round=3]` | Agent4c 出复盘报告 | ☐ |

---

## 七、回退方案

若 ADP 改造后仍不稳定，前端已有三层兜底：
1. `cleanTheaterText()` 清洗流噪声
2. `parseTheaterTurn()` 多格式解析（JSON 信封 / 文本正则 / 通用 A/B/C）
3. `LOCAL_SAMPLE` 本地静态剧本 fallback
4. `isMainAgentRoutingNoise()` 路由错误识别 → 自动切本地剧本

即使 ADP 工作流完全没改，前端也不会白屏。
