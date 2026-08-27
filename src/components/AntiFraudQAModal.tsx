import React, { useState, useRef, useEffect } from 'react';
import { AppConfig } from '../types';
import { sendToADP, newConversationId } from '../utils/adpClient';

interface AntiFraudQAModalProps {
  config: AppConfig;
  onClose: () => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
}

export const AntiFraudQAModal: React.FC<AntiFraudQAModalProps> = ({ config, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-welcome',
      role: 'model',
      content: `您好!我是反诈教育智能体(ADP 工作流 · 直接问答分支)。\n\n您可以向我咨询:\n1. **可疑短信/电话核验**(如机票退改、百万保障、公检法调查、理财内幕等)\n2. **转账风险自查**(如陌生对公账户、安全账户、过桥借款)\n3. **反诈防范法规与官方维权渠道**(全国反诈专线 96110)\n\n请直接输入您遇到的情况,我将为您深度拆解话术套路!`,
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [inputVal, setInputVal] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const conversationIdRef = useRef<string>(newConversationId('qa'));

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || inputVal).trim();
    if (!query || isLoading) return;

    setInputVal('');
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    };

    const replyId = `model-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      userMsg,
      // 先插入空气泡,流式填充
      {
        id: replyId,
        role: 'model',
        content: '',
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setIsLoading(true);

    let finalText = '';
    await sendToADP({
      text: query,
      appKey: config.appKey,
      visitorId: config.visitorId,
      conversationId: conversationIdRef.current,
      onDelta: (chunk) => {
        finalText += chunk;
        setMessages((prev) =>
          prev.map((m) => (m.id === replyId ? { ...m, content: finalText } : m))
        );
      },
      onError: (msg) => console.error('ADP QA error:', msg),
    });

    if (!finalText) {
      const errText = '【连接异常】ADP 工作流未返回内容。请检查首页配置的 AppKey 是否有效,或稍后重试。\n\n紧急提醒:凡是索要验证码、要求开启"屏幕共享"或声称转入"安全账户"的,一律为100%诈骗!紧急风险请拨打96110。';
      setMessages((prev) => prev.map((m) => (m.id === replyId ? { ...m, content: errText } : m)));
    }

    setIsLoading(false);
  };

  const sampleQuestions = [
    '收到短信说航班取消并赔付300元延误金,要求屏幕共享,是真的吗?',
    '有人自称微信客服说"百万保障"到期每月扣800元,该怎么应对?',
    '所谓的"国家安全核查账户"和"公检法电话办案"真的存在吗?',
    '刷单兼职前面小额提现都成功了,现在要我补单两万元解冻,怎么办?',
  ];

  return (
    <div className="fixed inset-0 z-50 bg-[#141414]/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-fade-in">
      <div className="bg-[#FAF9F6] text-[#141414] w-full max-w-4xl border-2 border-[#141414] shadow-[10px_10px_0px_#141414] overflow-hidden flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="bg-[#141414] text-white px-6 py-4 flex items-center justify-between border-b border-[#141414]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/10 flex items-center justify-center text-white border border-white/20">
              <span className="material-symbols-outlined text-lg" data-icon="forum">
                forum
              </span>
            </div>
            <div>
              <h3 className="font-mono text-sm uppercase font-bold flex items-center gap-2">
                <span>ANTI-FRAUD INTELLIGENCE // 智能法证诊断</span>
                <span className="text-[10px] bg-[#FF4D00] text-white px-2 py-0.5 font-mono">
                  ADP WORKFLOW LIVE
                </span>
              </h3>
              <p className="text-xs font-serif-editorial italic text-white/70">
                国家反诈案例库 & 涉案套路解构引擎
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

        {/* Quick Sample Questions */}
        <div className="bg-[#EEECE6] border-b border-[#141414] px-6 py-2.5 flex items-center gap-2 overflow-x-auto">
          <span className="text-xs font-mono font-bold uppercase text-[#141414]/60 whitespace-nowrap">典型核验:</span>
          <div className="flex gap-2">
            {sampleQuestions.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSend(q)}
                disabled={isLoading}
                className="text-xs font-mono uppercase bg-white hover:bg-[#FF4D00] hover:text-white hover:border-[#FF4D00] text-[#141414] border border-[#141414] px-3 py-1 whitespace-nowrap transition-colors disabled:opacity-50"
              >
                {q.length > 22 ? `${q.slice(0, 22)}...` : q}
              </button>
            ))}
          </div>
        </div>

        {/* Chat Stream View */}
        <div
          ref={scrollRef}
          className="p-6 md:p-8 overflow-y-auto flex-1 space-y-4 bg-[#FAF9F6]"
        >
          {messages.map((m) => {
            const isBot = m.role === 'model';
            return (
              <div
                key={m.id}
                className={`flex flex-col ${isBot ? 'items-start' : 'items-end'}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-mono font-bold text-[#141414]/70 uppercase">
                    {isBot ? 'AI 法证智能体' : '学员提问'}
                  </span>
                  <span className="text-[10px] font-mono text-[#141414]/40">
                    {m.timestamp}
                  </span>
                </div>
                <div
                  className={`p-4 max-w-[85%] text-sm leading-relaxed whitespace-pre-wrap ${
                    isBot
                      ? 'bg-[#EEECE6] text-[#141414] border border-[#141414] shadow-[3px_3px_0px_#141414]'
                      : 'bg-[#141414] text-white border border-[#141414] shadow-[3px_3px_0px_#FF4D00]'
                  }`}
                >
                  {m.content || (
                    <span className="inline-flex gap-1 items-center text-[#141414]/50">
                      <span className="w-1.5 h-1.5 bg-[#FF4D00] animate-pulse"></span>
                      <span className="w-1.5 h-1.5 bg-[#FF4D00] animate-pulse [animation-delay:150ms]"></span>
                      <span className="w-1.5 h-1.5 bg-[#FF4D00] animate-pulse [animation-delay:300ms]"></span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="bg-[#EEECE6] border-t border-[#141414] p-4 flex items-center gap-3"
        >
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="描述您遇到的可疑短信、来电要求或转账指示,AI将为您即时研判..."
            disabled={isLoading}
            className="flex-1 bg-white border border-[#141414] px-4 py-2.5 text-sm text-[#141414] focus:border-[#FF4D00] focus:outline-none font-mono"
          />
          <button
            type="submit"
            disabled={isLoading || !inputVal.trim()}
            className="bg-[#141414] hover:bg-[#FF4D00] text-white px-6 py-2.5 text-xs font-mono uppercase font-bold disabled:opacity-40 transition-colors flex items-center gap-1.5 border border-[#141414]"
          >
            <span>发送研判</span>
            <span className="material-symbols-outlined text-sm">send</span>
          </button>
        </form>
      </div>
    </div>
  );
};
