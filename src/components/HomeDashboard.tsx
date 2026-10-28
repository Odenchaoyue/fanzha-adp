import React, { useState } from 'react';
import { ActiveModule, AppConfig } from '../types';
import { CALL_SCENARIOS } from '../data/scenarios';
import { playVoiceSample, playStaticVoiceDemo, EDGE_VOICE_LABELS } from '../utils/audioHelper';

interface HomeDashboardProps {
  onStartModule: (module: ActiveModule, scenarioId?: string) => void;
  config: AppConfig;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  onStartModule,
  config,
  setConfig,
}) => {
  const [selectedQuickScenario, setSelectedQuickScenario] = useState('police');
  const [testVoicePlaying, setTestVoicePlaying] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState('');

  /* 各音色的试听台词 */
  const VOICE_SAMPLES: Record<string, string> = {
    xiaolan: '您好，这里是支付平台客服中心，检测到您的账户存在异常，需要配合核查。',
    xiaoqing: '同学你好，你的会员服务今天到期啦，不取消的话每个月会自动扣费哦。',
    xiaoyue: '快来呀，这个活动名额只剩最后几个了，错过今天就要等下周啦！',
    shuyan: '你名下银行卡涉嫌洗钱，请立即将资金转入安全账户配合清查。',
    zimo: '我是你领导，现在不方便接电话，你先帮我垫付一笔过桥款。',
    qinghe: '您好，我是航空理赔专员，您的航班已取消，请提供银行卡号接收赔付金。',
  };

  const handleTestVoice = async () => {
    setTestVoicePlaying(true);
    const sampleText =
      VOICE_SAMPLES[config.ttsVoice] ||
      '您好，这里是国家反诈中心实训智能体，请随时保持防诈警惕。';

    try {
      // 试听优先播放预生成样音（秒开、不打服务器）；缺文件时回退实时合成
      const played = await playStaticVoiceDemo(config.ttsVoice);
      if (!played) await playVoiceSample(sampleText, config.ttsVoice);
    } finally {
      setTestVoicePlaying(false);
    }
  };

  const showToast = (msg: string) => {
    setCopiedNotification(msg);
    setTimeout(() => setCopiedNotification(''), 2200);
  };

  return (
    <div id="home-dashboard" className="w-full space-y-10 animate-fade-in">
      {/* Toast Notification */}
      {copiedNotification && (
        <div className="fixed top-20 right-6 z-50 bg-[#141414] text-white px-5 py-3 shadow-2xl text-xs font-mono border border-[#FF4D00] animate-fade-in">
          <span className="text-[#FF4D00] font-bold mr-2">[NOTIFY]</span>
          {copiedNotification}
        </div>
      )}

     {/* 编辑推荐英雄区 / 欢迎区域 */}
      <section id="welcome-section" className="border-b border-[#141414] pb-8 pt-2">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 text-xs font-mono font-bold uppercase tracking-[0.3em] text-[#FF4D00] mb-3">
              <span>VOL. 2026</span>
              <span className="w-8 h-[1px] bg-[#141414]/40"></span>
              <span className="text-[#141414]/60">ANTI-FRAUD SIMULATION SUITE</span>
            </div>
            <h1 className="font-serif-editorial italic text-5xl sm:text-6xl lg:text-7xl leading-[0.9] text-[#141414] tracking-tighter mb-4">
              Defend & Discern.
            </h1>
            <p className="text-[#141414]/80 text-sm md:text-base leading-relaxed max-w-2xl font-sans">
              融合人机对抗实战、分支叙事与智能法证溯源的反诈能力实训系统。基于全真AI语音交互，筑牢财产安全认知防线。
            </p>
          </div>

          <div className="hidden sm:flex items-center gap-6 text-xs font-mono border-l border-[#141414] pl-6 py-2">
            <div>
              <div className="text-[10px] uppercase text-[#141414]/50 font-bold">REDUCTION METRIC</div>
              <div className="text-xl font-bold font-serif-editorial text-[#141414]">99.4%</div>
            </div>
            <div className="w-[1px] h-8 bg-[#141414]/20"></div>
            <div>
              <div className="text-[10px] uppercase text-[#141414]/50 font-bold">HOTLINE</div>
              <div className="text-xl font-bold font-mono text-[#FF4D00]">96110</div>
            </div>
          </div>
        </div>
      </section>

      {/* 非对称编辑网格布局 */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Primary Action: Simulated Call (Left 7 cols) */}
        <div
          id="card-simulated-call"
          onClick={() => onStartModule('call', selectedQuickScenario)}
          className="md:col-span-7 bg-[#141414] text-white p-8 md:p-10 relative border border-[#141414] overflow-hidden group cursor-pointer flex flex-col justify-between min-h-[360px] shadow-sm transition-all"
        >
          {/* Top-Right Badge & Watermark */}
          <div className="absolute top-0 right-0 bg-[#FF4D00] text-white font-mono uppercase font-bold text-[11px] px-4 py-1.5 z-10 select-none tracking-widest">
            I. PRIMARY SIMULATION
          </div>

          {/* Large Serif Watermark Numeral */}
          <div className="text-[100px] md:text-[140px] font-serif-editorial italic leading-none text-white/5 absolute top-2 right-4 pointer-events-none select-none">
            01
          </div>

          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-white/10 border border-white/20 flex items-center justify-center text-white">
                <span className="material-symbols-outlined text-[24px]">
                  phone_in_talk
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-mono tracking-widest text-[#FF4D00] font-bold block">
                  VOICE THREAT SYNTHESIZER
                </span>
                <h2 className="font-serif-editorial italic text-3xl md:text-4xl leading-tight font-normal text-white">
                  模拟来电对抗
                </h2>
              </div>
            </div>

            <p className="text-white/80 text-sm leading-relaxed max-w-lg mb-6 font-sans">
              由深度对抗大模型驱动的实时电话骗局仿真。精准模拟公检法施压、微信百万保障扣费、退改签理赔等高发话术。
            </p>

            {/* 快速场景标签 */}
            <div
              className="flex flex-wrap gap-2 mb-2"
              onClick={(e) => e.stopPropagation()}
            >
              {CALL_SCENARIOS.slice(0, 4).map((sc) => (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => {
                    setSelectedQuickScenario(sc.id);
                    onStartModule('call', sc.id);
                  }}
                  className={`text-xs font-mono uppercase px-3 py-1.5 transition-all flex items-center gap-2 border ${
                    selectedQuickScenario === sc.id
                      ? 'bg-[#FF4D00] border-[#FF4D00] text-white font-bold'
                      : 'bg-white/5 text-white/90 border-white/20 hover:border-white hover:bg-white hover:text-[#141414]'
                  }`}
                >
                  <span className="w-1.5 h-1.5 bg-current"></span>
                  {sc.title}
                </button>
              ))}
            </div>
          </div>

          {/* 操作页脚 */}
          <div className="relative z-10 flex items-center justify-between mt-8 pt-5 border-t border-white/15">
            <div className="text-xs text-white/60 flex items-center gap-2 font-mono">
              <span className="w-2 h-2 bg-[#FF4D00] animate-pulse"></span>
              <span>ENGINE READY // 实时合成就绪</span>
            </div>

            <button
              id="btn-start-call"
              type="button"
              className="bg-[#FF4D00] text-white hover:bg-white hover:text-[#141414] hover:border-white transition-all px-6 py-2.5 text-xs font-mono uppercase font-bold tracking-wider flex items-center gap-2 border border-[#FF4D00]"
            >
              <span>立即接入对抗</span>
              <span className="material-symbols-outlined text-base group-hover:translate-x-1 transition-transform">
                arrow_forward
              </span>
            </button>
          </div>
        </div>

        {/* 次要操作（右侧 5 列） */}
        <div className="md:col-span-5 flex flex-col gap-6">
          {/* Interactive Theater */}
          <div
            id="card-interactive-theater"
            onClick={() => onStartModule('theater')}
            className="bg-[#EEECE6] border border-[#141414] p-7 flex-1 flex flex-col justify-between cursor-pointer hover:bg-[#FF4D00] hover:text-white group transition-colors shadow-2xs min-h-[170px]"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono font-bold uppercase tracking-widest group-hover:text-white/80 text-[#141414]/60">
                  II. BRANCHING NARRATIVE
                </span>
                <span className="text-xs font-mono font-bold border border-[#141414] group-hover:border-white px-2 py-0.5">
                  02
                </span>
              </div>
              <h3 className="font-serif-editorial italic text-2xl font-bold tracking-tight text-[#141414] group-hover:text-white mb-2">
                反诈互动剧场
              </h3>
              <p className="text-[#141414]/80 group-hover:text-white/90 text-xs md:text-sm leading-relaxed">
                沉浸式案情推演，在关键抉择节点权衡资金与风险，逆转受骗结局。
              </p>
            </div>

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#141414]/20 group-hover:border-white/30 text-xs font-mono font-bold">
              <span>经典案情演绎</span>
              <span className="flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                进入剧场 →
              </span>
            </div>
          </div>

          {/* 反欺诈问答 */}
          <div
            id="card-anti-fraud-qa"
            onClick={() => onStartModule('qa')}
            className="bg-[#FAF9F6] border border-[#141414] p-7 flex-1 flex flex-col justify-between cursor-pointer hover:bg-[#141414] hover:text-white group transition-colors shadow-2xs min-h-[170px]"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono font-bold uppercase tracking-widest group-hover:text-[#FF4D00] text-[#141414]/60">
                  III. FORENSIC INTELLIGENCE
                </span>
                <span className="text-xs font-mono font-bold border border-[#141414] group-hover:border-white px-2 py-0.5">
                  03
                </span>
              </div>
              <h3 className="font-serif-editorial italic text-2xl font-bold tracking-tight text-[#141414] group-hover:text-white mb-2">
                反诈智能问答
              </h3>
              <p className="text-[#141414]/80 group-hover:text-white/90 text-xs md:text-sm leading-relaxed">
                调取全国电诈话术特征库，实时诊断可疑短信、转账指示与话术陷阱。
              </p>
            </div>

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#141414]/20 group-hover:border-white/30 text-xs font-mono font-bold">
              <span>线索法证核验</span>
              <span className="flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                开启问答 →
              </span>
            </div>
          </div>
        </div>
      </div>

     {/* 配置区块（带艺术粗野主义风格的可折叠手风琴组件） */}
      <div
        id="section-system-config"
        className="border border-[#141414] bg-[#EEECE6] overflow-hidden"
      >
        <details className="group" open>
          <summary className="flex justify-between items-center p-5 cursor-pointer bg-[#EEECE6] hover:bg-[#FAF9F6] select-none transition-colors border-b border-transparent group-open:border-[#141414]">
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 bg-[#141414] text-white flex items-center justify-center text-xs font-mono">
                ⚙
              </span>
              <span className="font-mono text-sm uppercase font-bold tracking-wider text-[#141414]">
                SYSTEM CONFIGURATION // 系统调试配置
              </span>
            </div>
            <span className="material-symbols-outlined text-[#141414] transition-transform duration-200 group-open:rotate-180">
              expand_more
            </span>
          </summary>

          <div className="p-6 md:p-8 bg-[#FAF9F6]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Inputs */}
              <div className="flex flex-col gap-5">
                <div>
                  <label className="block text-xs font-mono uppercase font-bold text-[#141414] mb-2 tracking-wider">
                    VISITOR_ID [学员编号]
                  </label>
                  <input
                    id="input-visitor-id"
                    type="text"
                    value={config.visitorId}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, visitorId: e.target.value }))
                    }
                    placeholder="usr_trainee_8841"
                    className="w-full border border-[#141414] bg-[#FAF9F6] px-4 py-2.5 text-sm font-mono text-[#141414] focus:border-[#FF4D00] focus:ring-0 focus:outline-none transition-all"
                  />
                  <span className="text-[11px] text-[#141414]/60 font-mono mt-1 block">
                    用于多端交互数据留痕与风险画像溯源
                  </span>
                </div>

                {/* Quick Save & Test Indicator */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => showToast('配置已更新并持久化至本地缓存')}
                    className="text-xs bg-[#141414] hover:bg-[#FF4D00] text-white px-4 py-2 transition-colors font-mono uppercase font-bold"
                  >
                    保存配置
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfig((prev) => ({
                        ...prev,
                        visitorId: `visitor-${Math.floor(1000 + Math.random() * 9000)}`,
                      }));
                      showToast('已生成随机学员编号');
                    }}
                    className="text-xs font-mono text-[#141414] hover:text-[#FF4D00] underline"
                  >
                    生成随机学员编号
                  </button>
                </div>
              </div>

              {/* TTS音色*/}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-xs font-mono uppercase font-bold text-[#141414] tracking-wider">
                    TTS VOICE SELECTOR [拟真音色]
                  </label>
                  <span className="text-xs font-mono text-[#FF4D00] font-bold">
                    {EDGE_VOICE_LABELS.find((v) => v.id === config.ttsVoice)?.label || config.ttsVoice}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {EDGE_VOICE_LABELS.map((voice) => {
                    const isChecked = config.ttsVoice === voice.id;
                    return (
                      <label
                        key={voice.id}
                        className={`flex items-center justify-between p-3 border cursor-pointer transition-all ${
                          isChecked
                            ? 'border-[#141414] bg-[#141414] text-white font-bold'
                            : 'border-[#141414]/30 bg-[#FAF9F6] text-[#141414] hover:border-[#141414]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="tts_voice"
                            value={voice.id}
                            checked={isChecked}
                            onChange={() =>
                              setConfig((prev) => ({
                                ...prev,
                                ttsVoice: voice.id as any,
                              }))
                            }
                            className="accent-[#FF4D00]"
                          />
                          <span className="text-xs font-mono">
                            {voice.label}
                          </span>
                        </div>
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.5 border ${
                            isChecked
                              ? 'border-[#FF4D00] text-[#FF4D00] bg-transparent'
                              : 'border-[#141414]/40 text-[#141414]/70 bg-[#EEECE6]'
                          }`}
                        >
                          {voice.badge}
                        </span>
                      </label>
                    );
                  })}
                </div>

                <div className="mt-5 flex items-center gap-4">
                  <button
                    id="btn-preview-voice"
                    type="button"
                    onClick={handleTestVoice}
                    disabled={testVoicePlaying}
                    className="border border-[#141414] text-[#141414] hover:bg-[#FF4D00] hover:border-[#FF4D00] hover:text-white px-4 py-2 text-xs font-mono uppercase font-bold transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-base">
                      {testVoicePlaying ? 'volume_up' : 'play_circle'}
                    </span>
                    <span>{testVoicePlaying ? 'PLAYING...' : '试听当前音色'}</span>
                  </button>

                  <span className="text-xs font-mono text-[#141414]/60">
                    本地离线神经网络音色 · 试听为预生成样音
                  </span>
                </div>
              </div>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
};


