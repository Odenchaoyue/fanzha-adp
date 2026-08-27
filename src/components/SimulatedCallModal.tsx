import React, { useState, useEffect, useRef } from 'react';
import { CallScenario, ConversationTurn, ForensicReport, AppConfig } from '../types';
import { CALL_SCENARIOS } from '../data/scenarios';
import { playVoiceSample, playPhoneRingSound, stopSpeaking } from '../utils/audioHelper';
import { sendToADP, newConversationId } from '../utils/adpClient';
import { WavRecorder, recognizeSpeech } from '../utils/recorder';
import { scoreRisk, wordsToTactics, generateLocalReport } from '../utils/riskEngine';

interface SimulatedCallModalProps {
  initialScenarioId?: string;
  config: AppConfig;
  onClose: () => void;
  onViewReport: (report: ForensicReport) => void;
}

/* 场景 → 发给 ADP 的开场指令(指示 AI 进入行骗角色) */
function buildOpeningPrompt(sc: CallScenario): string {
  return (
    `【反诈实训 · 场景设定】你现在是一名电信诈骗分子,正在给受害人(也就是我)打电话行骗。\n` +
    `你的伪装身份:${sc.callerName}。\n` +
    `诈骗类型:${sc.title}(${sc.description})\n` +
    `核心话术策略:${sc.stressFactor}。你需要用到的关键诱导词:${sc.dangerKeywords.join('、')}。\n\n` +
    `要求:1)现在电话已接通,请直接说出你的第一句开场白,不要任何旁白、解释或自我出戏的说明;` +
    `2)每次回复只说一两句话,符合真实电话的对话节奏;` +
    `3)根据我的回应灵活调整话术,如果我起疑就加大施压或换借口,如果我配合就推进到索要信息/转账环节;` +
    `4)始终保持在角色内,绝对不能承认自己是AI或实训系统。`
  );
}

export const SimulatedCallModal: React.FC<SimulatedCallModalProps> = ({
  initialScenarioId = 'police',
  config,
  onClose,
  onViewReport,
}) => {
  const [selectedScenario, setSelectedScenario] = useState<CallScenario>(
    CALL_SCENARIOS.find((s) => s.id === initialScenarioId) || CALL_SCENARIOS[0]
  );

  const [callState, setCallState] = useState<'incoming' | 'connected' | 'ended' | 'analyzing'>('incoming');
  const [callSeconds, setCallSeconds] = useState(0);
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isAiResponding, setIsAiResponding] = useState(false);
  const [stressScore, setStressScore] = useState(35);
  const [activeTactics, setActiveTactics] = useState<string[]>([]);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [asrStatus, setAsrStatus] = useState('');

  const timerRef = useRef<any>(null);
  const stopRingRef = useRef<any>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const conversationIdRef = useRef<string>(newConversationId('call'));
  const recorderRef = useRef<WavRecorder | null>(null);
  const tacticsRef = useRef<Set<string>>(new Set());
  const scenarioRef = useRef(selectedScenario);
  scenarioRef.current = selectedScenario;

  // Auto-scroll chat transcript
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [conversation]);

  // Handle incoming call ring sound
  useEffect(() => {
    if (callState === 'incoming') {
      stopRingRef.current = playPhoneRingSound();
    } else {
      if (stopRingRef.current) stopRingRef.current();
    }
    return () => {
      if (stopRingRef.current) stopRingRef.current();
    };
  }, [callState]);

  // Call timer
  useEffect(() => {
    if (callState === 'connected') {
      timerRef.current = setInterval(() => setCallSeconds((prev) => prev + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  // 组件卸载时停掉一切声音
  useEffect(() => {
    return () => stopSpeaking();
  }, []);

  const now = () =>
    new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  /* 本地风险计分:AI 每句回复后调用 */
  const updateRiskFromText = (text: string) => {
    const { delta, hitHigh, hitMid } = scoreRisk(text);
    if (delta > 0) {
      setStressScore((prev) => Math.min(100, prev + delta));
    }
    wordsToTactics(hitHigh, hitMid).forEach((t) => tacticsRef.current.add(t));
    scenarioRef.current.dangerKeywords.forEach((k) => {
      if (text.includes(k)) tacticsRef.current.add(k);
    });
    if (tacticsRef.current.size > 0) {
      setActiveTactics(Array.from(tacticsRef.current).slice(0, 8));
    }
  };

  /* 流式发送一条消息给 ADP,渲染为 caller 的回复气泡 */
  const streamCallerReply = async (text: string) => {
    const turnId = `caller-${Date.now()}`;
    // 先插入空气泡(打字状态)
    setConversation((prev) => [
      ...prev,
      { id: turnId, sender: 'caller', text: '', timestamp: now(), stressLevel: stressScore },
    ]);
    setIsAiResponding(true);

    let finalText = '';
    await sendToADP({
      text,
      appKey: config.appKey,
      visitorId: config.visitorId,
      conversationId: conversationIdRef.current,
      onDelta: (chunk) => {
        finalText += chunk;
        // 流式更新气泡
        setConversation((prev) =>
          prev.map((t) => (t.id === turnId ? { ...t, text: finalText } : t))
        );
      },
      onError: (msg) => {
        console.error('ADP error:', msg);
      },
    });

    if (!finalText) {
      finalText = '(对方沉默了几秒,电话那头传来杂音……请继续回应或挂断)';
      setConversation((prev) => prev.map((t) => (t.id === turnId ? { ...t, text: finalText } : t)));
    }

    updateRiskFromText(finalText);
    setIsAiResponding(false);

    if (isSpeakerOn) {
      playVoiceSample(finalText, config.ttsVoice);
    }
  };

  // Handle Answer Call: 把场景设定发给 ADP,AI 流式说出开场白
  const handleAnswerCall = async () => {
    if (!config.appKey.trim()) {
      alert('请先在首页「系统配置」中填写 ADP AppKey,才能接通模拟来电。');
      return;
    }
    if (stopRingRef.current) stopRingRef.current();
    setCallState('connected');

    // 换场景 = 换会话(重新开场)
    if (conversation.length > 0) {
      conversationIdRef.current = newConversationId('call');
      setConversation([]);
      tacticsRef.current = new Set();
      setStressScore(35);
    }

    await streamCallerReply(buildOpeningPrompt(selectedScenario));
  };

  // Handle Sending a user response
  const handleSendResponse = async (textToSend?: string) => {
    const text = (textToSend || userInput).trim();
    if (!text || isAiResponding || callState !== 'connected') return;

    stopSpeaking(); // 用户开口,打断上一句朗读
    setUserInput('');
    setAsrStatus('');

    setConversation((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, sender: 'user', text, timestamp: now() },
    ]);

    await streamCallerReply(text);
  };

  /* ====== 按住说话:WavRecorder 录音 → ASR 识别 → 自动发送 ====== */
  const handleMicDown = async () => {
    if (isAiResponding || callState !== 'connected' || isListening) return;
    stopSpeaking();
    try {
      recorderRef.current = new WavRecorder();
      await recorderRef.current.start();
      setIsListening(true);
      setAsrStatus('正在聆听…松开结束');
    } catch (e) {
      console.warn('麦克风启动失败', e);
      setAsrStatus('麦克风不可用,请直接打字');
      recorderRef.current = null;
    }
  };

  const handleMicUp = async () => {
    if (!isListening || !recorderRef.current) return;
    setIsListening(false);
    setAsrStatus('识别中…');
    const rec = recorderRef.current;
    recorderRef.current = null;

    try {
      const b64 = await rec.stop();
      if (!b64) {
        setAsrStatus('未录到声音');
        return;
      }
      const text = await recognizeSpeech(b64);
      if (text) {
        setAsrStatus(`识别结果:${text}`);
        handleSendResponse(text);
      } else {
        setAsrStatus('没听清,再试一次或直接打字');
      }
    } catch (e: any) {
      console.error('ASR error:', e);
      setAsrStatus('识别失败:' + (e?.message || '网络异常'));
    }
  };

  // Handle Hang up: 本地规则引擎生成法证报告(演示稳定,不依赖网络)
  const handleHangUp = async (reason: string = 'ended') => {
    if (stopRingRef.current) stopRingRef.current();
    if (timerRef.current) clearInterval(timerRef.current);
    stopSpeaking();

    setCallState('analyzing');

    // 本地生成,零延迟零依赖;留 800ms 展示"分析中"过渡感
    await new Promise((r) => setTimeout(r, 800));
    const report = generateLocalReport(selectedScenario, conversation, callSeconds, reason);
    onViewReport(report);
  };

  // 切换场景(通话中点击右上角场景切换)
  const handleSwitchScenario = (sc: CallScenario) => {
    if (callState === 'connected' && conversation.length > 0) {
      if (!confirm('切换场景将结束当前通话,确定?')) return;
    }
    setSelectedScenario(sc);
    scenarioRef.current = sc;
    conversationIdRef.current = newConversationId('call');
    setConversation([]);
    tacticsRef.current = new Set();
    setStressScore(35);
    setActiveTactics([]);
    setCallSeconds(0);
    setCallState('incoming');
  };

  // Suggested Quick Responses based on current scenario
  const getQuickReplies = () => {
    if (selectedScenario.id === 'police') {
      return [
        '请告诉我你的单位全称和警官证号,我打110核实。',
        '既然涉案,请你们发公函到我户籍地派出所当面调查。',
        '公检法没有所谓的"安全账户",你这是电信诈骗!',
        '好的警官,我马上按照您说的转账配合清查。',
      ];
    }
    if (selectedScenario.id === 'insurance') {
      return [
        '我从没开通过这项服务,你们是怎么拿到我电话的?',
        '退款为什么要屏幕共享?这绝对是诈骗!',
        '我自己去微信官方App服务设置里查看。',
        '别扣我钱,我立刻下载会议软件让你们帮我关闭。',
      ];
    }
    if (selectedScenario.id === 'flight') {
      return [
        '航班取消我自己找机场柜台,不需要你们私下赔付。',
        '退改签只要原路返还即可,为什么还要我输卡号?',
        '我已经向航空公司官方客服核实,航班根本没取消!',
      ];
    }
    if (selectedScenario.id === 'finance') {
      return [
        '日化15%?巴菲特年化才20%,你比他还牛?',
        '我不感兴趣,已将你拉黑并举报。',
        '先给我看你说的套利平台的金融牌照。',
      ];
    }
    return [
      '请问你具体是哪个部门的?我找前台转接核实。',
      '涉及资金转账必须走正规审批流程,不能私下汇款。',
      '你别骗我了,我已经向反诈中心报案了!',
    ];
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#141414]/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-fade-in">
      <div className="bg-[#FAF9F6] text-[#141414] w-full max-w-4xl border-2 border-[#141414] shadow-[10px_10px_0px_#141414] overflow-hidden flex flex-col md:flex-row max-h-[92vh]">

        {/* Left Side: Call State & Threat Analysis Monitor */}
        <div className="w-full md:w-5/12 bg-[#141414] text-white border-b md:border-b-0 md:border-r border-[#141414] p-6 flex flex-col justify-between relative">
          {/* Top Status Header */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] font-mono tracking-widest text-[#FF4D00] uppercase flex items-center gap-2 font-bold">
                <span className="w-2 h-2 rounded-full bg-[#FF4D00] animate-ping"></span>
                <span>SIMULATION ACTIVE // 实时仿真</span>
              </span>
              <span className="text-xs bg-[#FF4D00] text-white px-2 py-0.5 font-mono uppercase font-bold">
                {selectedScenario.badge}
              </span>
            </div>

            {/* Caller Identity Display */}
            <div className="text-center py-6 border-y border-white/10 my-2">
              <div className="w-20 h-20 mx-auto bg-white/5 border border-white/20 flex items-center justify-center mb-3 relative">
                <span className="material-symbols-outlined text-4xl text-white">
                  account_circle
                </span>
                {callState === 'connected' && (
                  <div className="absolute -bottom-1 -right-1 bg-[#FF4D00] text-white p-1 text-[10px]">
                    <span className="material-symbols-outlined text-xs">phone_in_talk</span>
                  </div>
                )}
              </div>
              <h3 className="font-serif-editorial italic text-2xl font-bold text-white mb-1">
                {selectedScenario.callerName}
              </h3>
              <p className="text-xs font-mono text-white/60">
                {selectedScenario.callerNumber}
              </p>
              <div className="mt-3 text-xs font-mono text-[#FF4D00] font-bold">
                {callState === 'incoming' && 'WAITING FOR RESPONSE (振铃中)...'}
                {callState === 'connected' && `LIVE CALL // ${formatTimer(callSeconds)}`}
                {callState === 'analyzing' && 'GENERATING FORENSIC DOSSIER...'}
              </div>
            </div>

            {/* Stress & Risk Monitor */}
            {callState === 'connected' && (
              <div className="bg-white/5 border border-white/15 p-4 mt-3">
                <div className="flex justify-between items-center text-xs mb-2 font-mono">
                  <span className="text-white/70 uppercase">心理施压指数</span>
                  <span className="font-bold text-[#FF4D00]">
                    {stressScore}% {stressScore > 65 ? '高压逼迫' : '常规试探'}
                  </span>
                </div>
                <div className="w-full bg-white/10 h-2 overflow-hidden border border-white/20">
                  <div
                    className="h-full bg-[#FF4D00] transition-all duration-500"
                    style={{ width: `${stressScore}%` }}
                  />
                </div>

                {/* Detected Tactics */}
                <div className="mt-3">
                  <span className="text-[10px] font-mono text-white/60 uppercase block mb-1">已捕捉诈骗技巧特征:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {activeTactics.length === 0 ? (
                      <span className="text-[10px] font-mono text-white/40">等待对方开口…</span>
                    ) : (
                      activeTactics.map((t, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] bg-black text-[#FF4D00] border border-[#FF4D00]/50 px-2 py-0.5 font-mono uppercase"
                        >
                          #{t}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 场景切换(未通话时) */}
            {callState === 'incoming' && (
              <div className="mt-3">
                <span className="text-[10px] font-mono text-white/60 uppercase block mb-1.5">切换诈骗场景:</span>
                <div className="flex flex-wrap gap-1.5">
                  {CALL_SCENARIOS.map((sc) => (
                    <button
                      key={sc.id}
                      onClick={() => handleSwitchScenario(sc)}
                      className={`text-[10px] font-mono px-2 py-1 border transition-colors ${
                        sc.id === selectedScenario.id
                          ? 'bg-[#FF4D00] text-white border-[#FF4D00]'
                          : 'border-white/30 text-white/70 hover:border-[#FF4D00] hover:text-[#FF4D00]'
                      }`}
                    >
                      {sc.title.slice(0, 6)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Actions: Answer / Reject / Hang Up */}
          <div className="pt-6">
            {callState === 'incoming' ? (
              <div className="flex items-center justify-around gap-3">
                <button
                  id="btn-reject-call"
                  onClick={() => handleHangUp('未接拒听')}
                  className="flex-1 bg-transparent hover:bg-white/10 text-white py-3 text-xs font-mono uppercase font-bold flex items-center justify-center gap-2 transition-all border border-white/30"
                >
                  <span className="material-symbols-outlined text-base">call_end</span>
                  <span>拒接识破</span>
                </button>
                <button
                  id="btn-answer-call"
                  onClick={handleAnswerCall}
                  className="flex-1 bg-[#FF4D00] hover:bg-white hover:text-[#141414] hover:border-white text-white py-3 text-xs font-mono uppercase font-bold flex items-center justify-center gap-2 shadow-lg animate-pulse transition-all border border-[#FF4D00]"
                >
                  <span className="material-symbols-outlined text-base">call</span>
                  <span>接听对练</span>
                </button>
              </div>
            ) : callState === 'connected' ? (
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => {
                    setIsSpeakerOn(!isSpeakerOn);
                    if (isSpeakerOn) stopSpeaking();
                  }}
                  className={`p-2.5 border text-xs font-mono uppercase flex flex-col items-center justify-center gap-1 flex-1 transition-colors ${
                    isSpeakerOn ? 'bg-white text-[#141414] border-white font-bold' : 'border-white/20 text-white/70 hover:border-white'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">
                    {isSpeakerOn ? 'volume_up' : 'volume_off'}
                  </span>
                  <span>{isSpeakerOn ? '免提开启' : '静音模式'}</span>
                </button>

                <button
                  id="btn-hangup-success"
                  onClick={() => handleHangUp('识破挂断')}
                  className="bg-[#FF4D00] hover:bg-white hover:text-[#141414] hover:border-white text-white py-2.5 px-4 text-xs font-mono uppercase font-bold flex items-center justify-center gap-2 transition-all border border-[#FF4D00] flex-2"
                >
                  <span className="material-symbols-outlined text-base">call_end</span>
                  <span>挂断并完成评估</span>
                </button>
              </div>
            ) : (
              <div className="text-center py-2 text-xs text-white/60 font-mono uppercase">
                GENERATING DOSSIER...
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Interactive Dialogue & Transcript */}
        <div className="w-full md:w-7/12 p-6 flex flex-col justify-between bg-[#FAF9F6] min-h-[380px]">
          {/* Header */}
          <div className="flex justify-between items-center pb-3 border-b border-[#141414]">
            <div>
              <h4 className="text-sm font-bold text-[#141414] font-mono uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-base text-[#FF4D00]">
                  record_voice_over
                </span>
                <span>TRANSCRIPT LOG // 实训通话实时转写</span>
              </h4>
              <p className="text-[11px] text-[#141414]/60 font-sans mt-0.5">
                根据您的发言,ADP 工作流中的诈骗 Agent 将动态调整对抗话术
              </p>
            </div>
            <button
              onClick={() => handleHangUp('中途退出')}
              className="text-[#141414] hover:text-[#FF4D00] p-1 border border-[#141414] hover:border-[#FF4D00] transition-colors"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>

          {/* Transcript Scroll Area */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto my-4 pr-2 space-y-3 max-h-[300px]"
          >
            {conversation.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-[#141414]/50 py-12">
                <span className="material-symbols-outlined text-4xl mb-2 text-[#141414]/30">
                  phone_paused
                </span>
                <p className="text-xs font-mono uppercase">点击左侧"接听对练"开启实时电诈对抗模拟</p>
                <p className="text-[11px] font-mono text-[#141414]/40 mt-2">
                  语音链路: 按住麦克风 → ASR 识别 → ADP 回复 → 神经网络音色朗读
                </p>
              </div>
            ) : (
              conversation.map((msg) => {
                const isCaller = msg.sender === 'caller';
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isCaller ? 'items-start' : 'items-end'}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] text-[#141414]/70 font-mono font-bold">
                        {isCaller ? selectedScenario.callerName : '我 [受训学员]'}
                      </span>
                      <span className="text-[10px] text-[#141414]/40 font-mono">
                        {msg.timestamp}
                      </span>
                    </div>
                    <div
                      className={`p-3.5 max-w-[85%] text-sm leading-relaxed ${
                        isCaller
                          ? 'bg-[#EEECE6] text-[#141414] border border-[#141414] shadow-[2px_2px_0px_#141414]'
                          : 'bg-[#141414] text-white border border-[#141414] shadow-[2px_2px_0px_#FF4D00]'
                      }`}
                    >
                      {msg.text || (
                        <span className="inline-flex gap-1 items-center text-[#141414]/50">
                          <span className="w-1.5 h-1.5 bg-[#FF4D00] animate-pulse"></span>
                          <span className="w-1.5 h-1.5 bg-[#FF4D00] animate-pulse [animation-delay:150ms]"></span>
                          <span className="w-1.5 h-1.5 bg-[#FF4D00] animate-pulse [animation-delay:300ms]"></span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {isAiResponding && (
              <div className="flex items-center gap-2 text-xs text-[#FF4D00] font-mono py-1 font-bold">
                <span className="w-2 h-2 rounded-full bg-[#FF4D00] animate-ping"></span>
                <span>AI SCAMMER SYNTHESIZING RESPONSE...</span>
              </div>
            )}
          </div>

          {/* Quick Counter Responses */}
          {callState === 'connected' && (
            <div className="pt-3 border-t border-[#141414]">
              <div className="text-[11px] text-[#141414]/70 font-mono uppercase mb-2 flex items-center justify-between font-bold">
                <span>防骗快捷反制词:</span>
                <span className="text-[#FF4D00]">点击直接发问</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                {getQuickReplies().map((reply, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendResponse(reply)}
                    disabled={isAiResponding}
                    className="text-left text-xs bg-[#EEECE6] hover:bg-[#FF4D00] text-[#141414] hover:text-white p-2.5 border border-[#141414] transition-colors truncate font-sans"
                  >
                    {reply}
                  </button>
                ))}
              </div>

              {/* ASR 状态提示 */}
              {asrStatus && (
                <div className="text-[11px] font-mono text-[#FF4D00] mb-2">{asrStatus}</div>
              )}

              {/* Custom Input Box */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendResponse();
                }}
                className="flex items-center gap-2"
              >
                {/* 按住说话(走 ASR) */}
                <button
                  type="button"
                  onPointerDown={handleMicDown}
                  onPointerUp={handleMicUp}
                  onPointerLeave={() => isListening && handleMicUp()}
                  disabled={isAiResponding}
                  title="按住说话,松开发送"
                  className={`p-2.5 border transition-all select-none touch-none ${
                    isListening
                      ? 'bg-[#FF4D00] border-[#FF4D00] text-white animate-pulse'
                      : 'bg-[#EEECE6] border-[#141414] text-[#141414] hover:bg-[#141414] hover:text-white'
                  }`}
                >
                  <span className="material-symbols-outlined text-lg">mic</span>
                </button>
                <input
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  placeholder={isListening ? '松开麦克风结束录音…' : '输入您的回答,或按住麦克风说话...'}
                  disabled={isAiResponding}
                  className="flex-1 bg-white border border-[#141414] px-4 py-2.5 text-sm text-[#141414] focus:border-[#FF4D00] focus:outline-none font-mono"
                />
                <button
                  type="submit"
                  disabled={isAiResponding || !userInput.trim()}
                  className="bg-[#141414] hover:bg-[#FF4D00] text-white px-5 py-2.5 text-xs font-mono uppercase font-bold disabled:opacity-40 transition-colors border border-[#141414]"
                >
                  发送
                </button>
              </form>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
