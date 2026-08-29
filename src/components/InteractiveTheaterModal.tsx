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

  const [scene, setScene] = useState(SCENES[0]);

  const convIdRef = useRef<string>(newConversationId('theater'));
  const roundRef = useRef<number>(0);
  const lastSceneRef = useRef<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 自动滚动
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isResponding]);

  /* 流式发一轮给 ADP,渲染为 DM 气泡 */
  const streamDmReply = async (text: string) => {
    const turnId = `dm-${Date.now()}`;
    setMessages((prev) => [...prev, { id: turnId, role: 'dm', visible: '', chosen: false }]);
    setIsResponding(true);
    setGenError(null);
    let buf = '';
    try {
      await runTheaterChat(text, config, {
        conversationId: convIdRef.current,
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
        onError: (msg) => setGenError(msg),
      });
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
      setGenError(e?.message || '剧本生成失败');
    } finally {
      setIsResponding(false);
    }
  };

  /* 开新一场(换场景/重开) */
  const startScene = (sc: string) => {
    if (!hasKey) return;
    convIdRef.current = newConversationId('theater');
    roundRef.current = 0;
    lastSceneRef.current = '';
    setMessages([]);
    setGenError(null);
    setScene(sc);
    streamDmReply(buildTheaterRequest({ round: 0, scene: sc }));
  };

  /* 开场: 有 AppKey 自动开一场;无 Key 展示本地静态剧本 */
  useEffect(() => {
    if (hasKey) {
      startScene(SCENES[0]);
    } else {
      setMessages([
        {
          id: 'local-0',
          role: 'dm',
          visible: LOCAL_SAMPLE.visible,
          manual: LOCAL_SAMPLE.manual,
          options: LOCAL_SAMPLE.options,
        },
      ]);
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
    streamDmReply(buildTheaterRequest({ round: roundRef.current, lastScene: lastSceneRef.current, freeText: t }));
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
      })
    );
  };

  /* 选项按钮着色(上当/犹豫/正确) */
  const optionColor = (pathType: string) => {
    if (pathType === 'scam') return 'border-[#FF4D00] hover:bg-[#FF4D00] hover:text-white';
    if (pathType === 'correct') return 'border-emerald-600 hover:bg-emerald-600 hover:text-white';
    return 'border-[#141414]/40 hover:bg-[#141414] hover:text-white';
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
              disabled={!hasKey || isResponding}
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

        {/* 剧本对话区 */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#FAF9F6] max-h-[58vh]"
        >
          {!hasKey && (
            <div className="bg-[#FF4D00]/10 border border-[#FF4D00] text-[#FF4D00] text-xs font-mono px-4 py-2 mb-2">
              未检测到 AppKey,当前为本地演示剧本。到首页「设置」填写 AppKey 后,本页会由 ADP 工作流实时驱动。
            </div>
          )}
          {genError && (
            <div className="bg-[#FF4D00]/10 border border-[#FF4D00] text-[#FF4D00] text-xs font-mono px-4 py-2 mb-2 whitespace-pre-wrap max-h-56 overflow-y-auto">
              {genError}
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

              {/* 主持人手册(选完后揭示) */}
              {m.manual && m.chosen && (
                <div className="mt-2 p-4 max-w-[88%] text-sm leading-6 whitespace-pre-wrap bg-[#141414] text-white border border-[#141414] shadow-[2px_2px_0px_#FF4D00]">
                  <span className="font-mono font-bold text-[#FF4D00] block mb-1 text-xs">
                    🔓 主持人手册揭晓
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
                      className={`w-full text-left p-3 border bg-white transition-colors flex items-start gap-3 disabled:opacity-50 ${optionColor(
                        opt.pathType
                      )}`}
                    >
                      <span className="w-6 h-6 bg-[#141414] text-white text-sm font-mono flex items-center justify-center shrink-0">
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
              onClick={() => startScene(scene)}
              className="text-xs font-mono px-3 py-1.5 border border-[#141414] bg-white hover:bg-[#FF4D00] hover:text-white hover:border-[#FF4D00] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              再来一轮
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
                streamDmReply(buildTheaterRequest({ round: roundRef.current, lastScene: lastSceneRef.current, review: true }));
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
              placeholder={hasKey ? '输入你的回答,或发送指令(如:复盘结束)…' : '请先配置 AppKey'}
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
