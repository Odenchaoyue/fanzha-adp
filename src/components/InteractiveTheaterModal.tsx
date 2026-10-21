import React, { useState, useEffect, useRef } from 'react';
import { ForensicReport, AppConfig } from '../types';
import {
  parseTheaterTurn,
  runTheaterChat,
  stripJsonFence,
  cleanTheaterText,
  newConversationId,
  buildTheaterRequest,
  TheaterOption,
  TheaterRequest,
} from '../utils/scenarioGen';

interface InteractiveTheaterModalProps {
  onClose: () => void;
  onViewReport?: (report: ForensicReport) => void;
  config: AppConfig;
}

/* 设定项 */
const SCENES = ['刷单返利', '校园贷', '冒充老师', '求职诈骗', '快递理赔', 'AI换脸诈骗'];

/* 受众身份(可选,填了让剧本更精准) */
const AUDIENCE_OPTIONS = [
  { key: '', label: '不指定' },
  { key: '大学生', label: '大学生' },
  { key: '研究生', label: '研究生' },
  { key: '刚毕业/求职', label: '刚毕业/求职' },
  { key: '上班族', label: '上班族' },
  { key: '中老年/退休', label: '中老年/退休' },
  { key: '自由职业', label: '自由职业' },
  { key: '全职妈妈/爸爸', label: '全职妈妈/爸爸' },
];

/* 本地兜底(无 AppKey 时展示一段静态剧本,保持页面可用) */
const LOCAL_SAMPLE = {
  visible:
    '📋 背景设定\n你是一名大三学生,课余想找点兼职赚生活费。\n\n' +
    '🎭 诈骗开场\n"同学你好,我们是XX商城官方招募,刷单返利日结佣金,一单5%-15%,先垫后返,有兴趣吗?"',
  manual:
    '⚠️ 关键陷阱(骗术真相)\n骗子用"小额返利"建立信任,前期让你赚到甜头,随后以"连单任务""保证金"为名诱导大额垫付,钱一旦转出便消失。\n\n' +
    '💡 反诈教育总结\n凡是"先垫付、后返利"的兼职都是刷单诈骗;陌生高额佣金勿信,遇可疑立即拨打 96110。',
  options: [
    { key: 'A', text: '听起来不错,怎么操作?', pathType: 'scam' },
    { key: 'B', text: '我需要考虑一下', pathType: 'hesitate' },
    { key: 'C', text: '我不感兴趣,谢谢', pathType: 'correct' },
  ] as TheaterOption[],
};
const LOCAL_SAMPLE_MESSAGE: TheaterMessage = {
  id: 'local-fallback',
  role: 'dm',
  visible: LOCAL_SAMPLE.visible,
  manual: LOCAL_SAMPLE.manual,
  options: LOCAL_SAMPLE.options,
};

interface TheaterMessage {
  id: string;
  role: 'user' | 'dm';
  visible: string;
  manual?: string;
  options?: TheaterOption[];
  phase?: string;
  result?: string;
  tips?: string[];
  chosen?: boolean; // 该轮的选项已被选
}

const now = () =>
  new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

export const InteractiveTheaterModal: React.FC<InteractiveTheaterModalProps> = ({
  onClose,
  onViewReport,
  config,
}) => {
  const hasKey = !!(config.appKey && config.appKey.trim());

  const [messages, setMessages] = useState<TheaterMessage[]>([]);
  const [isResponding, setIsResponding] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false); // 用户是否已主动选择过场景(用于决定显示欢迎面板)

  const [scene, setScene] = useState(SCENES[0]);
  const [showAudienceForm, setShowAudienceForm] = useState(false);
  const [audience, setAudience] = useState<string>('');
  const [major, setMajor] = useState<string>('');

  // 切片:把 audience/major 拼成调用 buildTheaterRequest 的辅助对象
  const reqContext = { audience: audience || undefined, major: major || undefined };

  const convIdRef = useRef<string>(newConversationId('theater'));
  const roundRef = useRef<number>(0);
  const lastSceneRef = useRef<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initiatedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // 自动滚动
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isResponding]);

  // 卸载时 abort 正在进行的请求(关模态框/换模块时)
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  /* 流式发一轮给 ADP,渲染为 DM 气泡 */
  const streamDmReply = async (text: string) => {
    // abort 之前的请求(防并发)
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const turnId = `dm-${Date.now()}`;
    setMessages((prev) => [...prev, { id: turnId, role: 'dm', visible: '', chosen: false }]);
    setIsResponding(true);
    setGenError(null);
    let buf = '';
    let wasAborted = false;
    let wasTimeout = false;
    try {
      await runTheaterChat(text, config, {
        conversationId: convIdRef.current,
        signal: ac.signal,
        onDelta: (c) => {
          buf += c;
          // 流式显示前先清洗噪声(Content载荷/事件壳/路由口播),再只取【玩家可见】
          const live = cleanTheaterText(
            stripJsonFence(buf).split('---')[0] || buf
          );
          setMessages((prev) =>
            prev.map((m) => (m.id === turnId ? { ...m, visible: live } : m))
          );
        },
        onError: (msg) => {
          if (ac.signal.aborted) {
            wasAborted = true;
          } else if (msg.includes('超时')) {
            wasTimeout = true;
            setGenError(msg);
          } else {
            setGenError(msg);
          }
        },
      });
      // 如果被 abort 或超时,不解析、不写 lastSceneRef,标记中断
      if (wasAborted) return;
      if (wasTimeout) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === turnId
              ? { ...m, visible: m.visible || '⚠️ 本轮生成中断(超时),请重试或换场景。' }
              : m
          )
        );
        return;
      }
      const turn = parseTheaterTurn(buf);
      // 记录本轮 DM 正文作为"上一轮场景摘要",供下一轮请求拼上下文
      if (turn.visible && !turn.routingError) {
        lastSceneRef.current = turn.visible.replace(/\s+/g, ' ').slice(0, 120);
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === turnId
            ? turn.routingError
              ? {
                  // 路由错误:把占位 DM 消息直接换成静态本地样本,确保流程不卡死
                  ...LOCAL_SAMPLE_MESSAGE,
                }
              : {
                  ...m,
                  visible: turn.visible,
                  manual: turn.manual,
                  options: turn.options,
                  phase: turn.phase,
                  result: turn.result,
                  tips: turn.tips,
                }
            : m
        )
      );
      if (turn.routingError) {
        setGenError(turn.routingError);
      }
    } catch (e: any) {
      if (ac.signal.aborted) return; // 静默取消
      setGenError(e?.message || '剧本生成失败');
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setIsResponding(false);
    }
  };

  /* 开新一场(换场景: 新会话, round=0, 清空消息) */
  const startScene = (sc: string) => {
    if (!hasKey) return;
    abortRef.current?.abort(); // 先中断正在进行的请求
    convIdRef.current = newConversationId('theater');
    roundRef.current = 0;
    lastSceneRef.current = '';
    setMessages([]);
    setGenError(null);
    setScene(sc);
    setHasStarted(true); // 标记已开场,后续不再显示欢迎面板
    streamDmReply(buildTheaterRequest({ round: 0, scene: sc, ...reqContext }));
  };

  /* 升级回合(再来一轮: 同一会话, round+1, 不清空消息, 不带 choice 让 ADP 自行升级) */
  const continueScene = () => {
    if (!hasKey || isResponding) return;
    roundRef.current += 1;
    setGenError(null);
    streamDmReply(buildTheaterRequest({ round: roundRef.current, lastScene: lastSceneRef.current, ...reqContext }));
  };

  /* 开场: 不再自动开首场 —— 让用户先选剧本再生成。
   * 无 AppKey 时显示本地静态样本;有 AppKey 时由用户在欢迎面板里点选场景开始演练。
   * (StrictMode 双挂载问题也随之消失:不再有任何 effect 自动发请求)
   */
  useEffect(() => {
    if (!hasKey) {
      setMessages([
        {
          id: 'local-0',
          role: 'dm',
          visible: LOCAL_SAMPLE.visible,
          manual: LOCAL_SAMPLE.manual,
          options: LOCAL_SAMPLE.options,
        },
      ]);
    } else {
      setMessages([]);
      setHasStarted(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasKey]);

  /* 用户回复(自由输入) */
  const handleSend = (text?: string) => {
    const t = (text ?? inputRef.current?.value ?? '').trim();
    if (!t || isResponding) return;
    if (inputRef.current) inputRef.current.value = '';
    if (!hasKey) return;
    setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: 'user', visible: t }]);
    streamDmReply(buildTheaterRequest({ round: roundRef.current, lastScene: lastSceneRef.current, freeText: t, ...reqContext }));
  };

  /* 用户点选 A/B/C */
  const handleOption = (msg: TheaterMessage, opt: TheaterOption) => {
    if (isResponding || msg.chosen) return;
    // 标记该轮已选,揭示隐藏的手册
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, chosen: true } : m))
    );
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: 'user', visible: `${opt.key}. ${opt.text}` },
    ]);
    if (!hasKey) return;
    roundRef.current += 1;
    streamDmReply(
      buildTheaterRequest({
        round: roundRef.current,
        lastScene: lastSceneRef.current,
        choice: `${opt.key} ${opt.text}`,
        ...reqContext,
      })
    );
  };

  /* 选项按钮着色(上当/犹豫/正确) */
  const optionColor = (pathType: string) => {
    if (pathType === 'scam') return 'border-red-300 bg-red-50 hover:bg-red-100 hover:border-red-400 text-red-900';
    if (pathType === 'hesitate') return 'border-amber-300 bg-amber-50 hover:bg-amber-100 hover:border-amber-400 text-amber-900';
    if (pathType === 'correct') return 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-400 text-emerald-900';
    return 'border-[#141414]/20 bg-white hover:bg-gray-50';
  };
  /* 选项字母方块着色 */
  const optionKeyColor = (pathType: string) => {
    if (pathType === 'scam') return 'bg-red-500';
    if (pathType === 'hesitate') return 'bg-amber-500';
    if (pathType === 'correct') return 'bg-emerald-600';
    return 'bg-[#141414]';
  };

  const isLocal = (m: TheaterMessage) => !hasKey && m.role === 'dm';

  return (
    <div className="fixed inset-0 z-50 bg-[#141414]/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-fade-in">
      <div className="bg-[#FAF9F6] text-[#141414] w-full max-w-3xl border-2 border-[#141414] shadow-[10px_10px_0px_#141414] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-[#141414] text-white px-6 py-4 flex items-center justify-between border-b border-[#141414]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/10 flex items-center justify-center text-white border border-white/20">
              <span className="material-symbols-outlined text-lg">theater_comedy</span>
            </div>
            <div>
              <h3 className="font-mono text-sm uppercase font-bold flex items-center gap-2">
                <span>INTERACTIVE THEATER // 互动剧场</span>
                <span className="text-[10px] bg-[#FF4D00] text-white px-2 py-0.5 font-mono">
                  {hasKey ? 'AI实时演练' : '本地演示'}
                </span>
              </h3>
              <p className="text-xs font-serif-editorial italic text-white/70">
                主持人(DM)由 ADP 工作流驱动 · 跟着做选择,揭穿骗局
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-[#FF4D00] p-1 border border-white/20 hover:border-[#FF4D00] transition-colors"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* 场景切换条(有 Key 时可重开) */}
        <div className="bg-[#EEECE6] border-b border-[#141414] px-4 py-2.5 flex flex-wrap items-center gap-2 text-xs font-mono">
          <span className="uppercase text-[#141414]/60 font-bold">场景:</span>
          {SCENES.map((s) => (
            <button
              key={s}
              disabled={!hasKey}
              onClick={() => startScene(s)}
              className={`px-2.5 py-1 border transition-all whitespace-nowrap disabled:opacity-40 ${
                scene === s && hasKey
                  ? 'bg-[#141414] text-white border-[#141414] font-bold'
                  : 'bg-white text-[#141414] border-[#141414]/40 hover:bg-[#FF4D00] hover:text-white hover:border-[#FF4D00]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* 受训者画像(可选,让剧本更精准;不填也不影响使用) */}
        <div className="bg-[#FAF9F6] border-b border-[#141414]/15 px-4 py-2 text-xs font-mono">
          <button
            onClick={() => setShowAudienceForm(!showAudienceForm)}
            className="flex items-center gap-2 text-[#141414]/70 hover:text-[#FF4D00] transition-colors w-full"
            type="button"
          >
            <span className="material-symbols-outlined text-base">
              {showAudienceForm ? 'expand_less' : 'expand_more'}
            </span>
            <span className="uppercase font-bold">受训者画像(可选)</span>
            {audience || major ? (
              <span className="bg-[#FF4D00]/10 text-[#FF4D00] px-2 py-0.5 border border-[#FF4D00]/40 text-[11px]">
                ✓ {audience || '未指定'}{major ? `·${major}` : ''}
              </span>
            ) : (
              <span className="text-[#141414]/50 text-[11px]">点击设定,让剧本更贴合你的身份</span>
            )}
          </button>
          {showAudienceForm && (
            <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5 pb-1">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase text-[#141414]/50 font-bold tracking-wider">身份类型</label>
                <select
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  disabled={isResponding}
                  className="bg-white border border-[#141414]/40 px-3 py-1.5 text-sm focus:border-[#FF4D00] focus:outline-none disabled:opacity-50 text-[#141414]"
                >
                  {AUDIENCE_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase text-[#141414]/50 font-bold tracking-wider">专业 / 职业(可选)</label>
                <input
                  type="text"
                  value={major}
                  onChange={(e) => setMajor(e.target.value)}
                  placeholder="如:计算机、会计、医学、销售…"
                  maxLength={20}
                  disabled={isResponding}
                  className="bg-white border border-[#141414]/40 px-3 py-1.5 text-sm focus:border-[#FF4D00] focus:outline-none disabled:opacity-50 text-[#141414] placeholder:text-[#141414]/30"
                />
              </div>
              <div className="col-span-1 sm:col-span-2 text-[10px] text-[#141414]/45 leading-relaxed">
                填了会随每轮请求发给 ADP,主控 agent 看到就不会再反问身份;不填也能正常演练。
              </div>
            </div>
          )}
        </div>

        {/* 剧本对话区 */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#FAF9F6] max-h-[58vh]"
        >
          {!hasKey && (
            <div className="bg-[#FF4D00]/10 border border-[#FF4D00] text-[#FF4D00] text-xs font-mono px-4 py-2 mb-2">
              未检测到 AppKey,当前为本地演示剧本。在项目根目录 `.env` 配置 `VITE_APP_KEY` 并重启 `npm run dev` 后,本页会由 ADP 工作流实时驱动。
            </div>
          )}
          {genError && (
            <div className="bg-[#FF4D00]/10 border border-[#FF4D00] text-[#FF4D00] text-xs font-mono px-4 py-2 mb-2 whitespace-pre-wrap max-h-56 overflow-y-auto">
              {genError}
            </div>
          )}

          {/* 欢迎面板: 用户尚未选择场景时显示,引导其主动选剧本 */}
          {hasKey && !hasStarted && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center py-10 px-4 min-h-[320px]">
              <span className="material-symbols-outlined text-5xl text-[#FF4D00] mb-3">theater_comedy</span>
              <h3 className="font-mono text-base font-bold uppercase text-[#141414] mb-2">选择剧本背景</h3>
              <p className="text-xs text-[#141414]/60 font-serif-editorial italic max-w-md mb-6 leading-relaxed">
                每选剧本背景由 ADP 工作流实时生成开场剧情、诈骗套路与 A/B/C 选项;<br/>你作为受训学员通过选择逐步识别骗局,主持人手册会在你选完后揭晓真相。
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 w-full max-w-2xl">
                {SCENES.map((s) => (
                  <button
                    key={s}
                    onClick={() => startScene(s)}
                    className="bg-white hover:bg-[#FF4D00] hover:text-white border border-[#141414] hover:border-[#FF4D00] text-[#141414] px-4 py-3 text-sm font-mono font-bold transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-[#141414]/40 font-mono mt-5">
                或点上方「受训者画像」设置身份,让剧本更贴合你的处境
              </p>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] text-[#141414]/70 font-mono font-bold">
                  {m.role === 'user' ? '我 [受训学员]' : '主持人 (DM)'}
                </span>
                <span className="text-[10px] text-[#141414]/40 font-mono">{now()}</span>
              </div>

              {/* 玩家可见正文 */}
              <div
                className={`p-4 max-w-[88%] text-base leading-7 whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-[#141414] text-white border border-[#141414] shadow-[2px_2px_0px_#FF4D00]'
                    : 'bg-[#EEECE6] text-[#141414] border border-[#141414] shadow-[2px_2px_0px_#141414]'
                }`}
              >
                {m.visible || (
                  <span className="inline-flex gap-1 items-center text-[#141414]/50">
                    <span className="w-1.5 h-1.5 bg-[#FF4D00] animate-pulse"></span>
                    <span className="w-1.5 h-1.5 bg-[#FF4D00] animate-pulse [animation-delay:150ms]"></span>
                    <span className="w-1.5 h-1.5 bg-[#FF4D00] animate-pulse [animation-delay:300ms]"></span>
                  </span>
                )}
              </div>

              {/* 主持人手册(仅在最终复盘阶段揭晓 —— 选完每轮 A/B/C 立即剧透等于破坏悬念) */}
              {m.manual && m.chosen && m.phase === 'review' && (
                <div className="mt-2 p-4 max-w-[88%] text-sm leading-6 whitespace-pre-wrap bg-[#141414] text-white border border-[#141414] shadow-[2px_2px_0px_#FF4D00]">
                  <span className="font-mono font-bold text-[#FF4D00] block mb-1 text-xs">
                    🔓 主持人手册揭晓(终局复盘)
                  </span>
                  {m.manual}
                </div>
              )}

              {/* 选项按钮(仅未选时显示) */}
              {m.options && !m.chosen && (
                <div className="mt-2 w-full max-w-[88%] space-y-2">
                  {m.options.map((opt) => (
                    <button
                      key={opt.key}
                      disabled={isResponding}
                      onClick={() => handleOption(m, opt)}
                      className={`w-full text-left p-3 border transition-colors flex items-start gap-3 disabled:opacity-50 ${optionColor(
                        opt.pathType
                      )}`}
                    >
                      <span className={`w-6 h-6 text-white text-sm font-mono flex items-center justify-center shrink-0 rounded ${optionKeyColor(
                        opt.pathType
                      )}`}>
                        {opt.key}
                      </span>
                      <span className="text-base leading-6">{opt.text}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* 复盘心法 */}
              {m.tips && m.tips.length > 0 && (
                <div className="mt-2 p-3 max-w-[88%] text-xs bg-emerald-50 border border-emerald-600 whitespace-pre-wrap">
                  {m.tips.map((t, i) => (
                    <div key={i}>🛡️ {t}</div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {isResponding && (
            <div className="flex items-center gap-2 text-xs text-[#FF4D00] font-mono py-1 font-bold">
              <span className="w-2 h-2 rounded-full bg-[#FF4D00] animate-ping"></span>
              <span>DM 正在生成…</span>
            </div>
          )}
        </div>

        {/* 指令快捷条 + 输入 */}
        <div className="bg-[#EEECE6] border-t border-[#141414] px-4 py-3">
          <div className="flex flex-wrap gap-2 mb-2">
            <button
              disabled={!hasKey || isResponding}
              onClick={() => continueScene()}
              className="text-xs font-mono px-3 py-1.5 border border-[#141414] bg-white hover:bg-[#FF4D00] hover:text-white hover:border-[#FF4D00] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              再来一轮
            </button>
            <button
              disabled={!hasKey || isResponding}
              onClick={() => startScene(scene)}
              className="text-xs font-mono px-3 py-1.5 border border-[#141414] bg-white hover:bg-[#FF4D00] hover:text-white hover:border-[#FF4D00] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              重新开始
            </button>
            <button
              disabled={!hasKey || isResponding}
              onClick={() => {
                const idx = SCENES.indexOf(scene);
                startScene(SCENES[(idx + 1) % SCENES.length]);
              }}
              className="text-xs font-mono px-3 py-1.5 border border-[#141414] bg-white hover:bg-[#FF4D00] hover:text-white hover:border-[#FF4D00] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              换个场景
            </button>
            <button
              disabled={!hasKey || isResponding}
              onClick={() => {
                setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: 'user', visible: '复盘结束' }]);
                streamDmReply(buildTheaterRequest({ round: roundRef.current, lastScene: lastSceneRef.current, review: true, ...reqContext }));
              }}
              className="text-xs font-mono px-3 py-1.5 border border-[#141414] bg-white hover:bg-[#FF4D00] hover:text-white hover:border-[#FF4D00] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              复盘结束
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              disabled={!hasKey || isResponding}
              placeholder={hasKey ? '输入你的回答,或发送指令(如:复盘结束)…' : '请先在 .env 配置 VITE_APP_KEY'}
              className="flex-1 bg-white border border-[#141414] px-4 py-2.5 text-sm text-[#141414] focus:border-[#FF4D00] focus:outline-none font-mono disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!hasKey || isResponding}
              className="bg-[#141414] hover:bg-[#FF4D00] text-white px-5 py-2.5 text-xs font-mono uppercase font-bold border border-[#141414] transition-colors disabled:opacity-40"
            >
              发送
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
