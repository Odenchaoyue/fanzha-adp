import React, { useState } from 'react';
import { INITIAL_ANALYTICS_DATA } from '../data/scenarios';
import { ForensicReport } from '../types';

interface AnalyticsViewProps {
  onViewReportDetail: (report: ForensicReport) => void;
  onStartSimulation: () => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  onViewReportDetail,
  onStartSimulation,
}) => {
  const [data] = useState(INITIAL_ANALYTICS_DATA);

  const handleOpenHistoricalRecord = (rec: any) => {
    const mockReport: ForensicReport = {
      caseNumber: rec.id,
      timestamp: rec.date,
      scenarioTitle: rec.scenario,
      durationSeconds: 192,
      overallScore: rec.score,
      riskLevel: rec.score >= 90 ? '极低风险' : '中低风险',
      radarScores: {
        authorityResistance: 88,
        greedResistance: 92,
        verificationHabit: 85,
        privacyAwareness: 90,
        urgencyComposure: 85,
      },
      detectedVulnerabilities: [
        '在初期听到涉案信息时，略微延迟了核实官方的动作',
        '对部分假冒工号具有短暂的信任盲区',
      ],
      scamPointsExposed: rec.riskKeywords.map((k: string) => `涉及高危话术特征：${k}`),
      expertSuggestions: [
        '牢记公检法从不电话办案，更无所谓安全账户。',
        '遇到突发情况务必通过96110主动向反诈中心核实。',
      ],
      conversationLog: [],
    };
    onViewReportDetail(mockReport);
  };

  return (
    <div id="analytics-view" className="w-full space-y-8 animate-fade-in text-[#141414]">
      {/* Top Header */}
      <section className="border-b border-[#141414] pb-6">
        <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#FF4D00] uppercase mb-2">
          <span>THREAT INTELLIGENCE & DOSSIER</span>
          <span>//</span>
          <span>法证看板</span>
        </div>
        <h1 className="font-serif-editorial italic text-3xl sm:text-4xl text-[#141414] mb-3 font-bold">
          反诈风险分析与法证溯源看板
        </h1>
        <p className="text-[#141414]/70 text-sm max-w-2xl font-sans leading-relaxed">
          基于多轮电诈实训与人机对抗行为数据，生成的全方位心理防御画像、战术漏洞分析及风险溯源档案。
        </p>
      </section>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#EEECE6] border-2 border-[#141414] p-5 shadow-[4px_4px_0px_#141414]">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-mono font-bold text-[#141414]/70 uppercase">综合防骗指数</span>
            <span className="material-symbols-outlined text-[#FF4D00] text-xl">
              verified_user
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-serif-editorial italic text-4xl font-bold text-[#141414]">
              {data.overallIndex}
            </span>
            <span className="text-xs font-mono text-[#FF4D00] font-bold">
              +4.2% ↑
            </span>
          </div>
          <span className="text-[11px] font-mono text-[#141414]/60 mt-1 block uppercase">
            DEFENSE: HIGH IMMUNITY // 高危免疫
          </span>
        </div>

        <div className="bg-[#EEECE6] border-2 border-[#141414] p-5 shadow-[4px_4px_0px_#141414]">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-mono font-bold text-[#141414]/70 uppercase">实训演练场次</span>
            <span className="material-symbols-outlined text-[#141414] text-xl">
              history_edu
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-serif-editorial italic text-4xl font-bold text-[#141414]">
              {data.totalSimulations}
            </span>
            <span className="text-xs font-mono text-[#141414]/60 font-bold uppercase">SESSIONS</span>
          </div>
          <span className="text-[11px] font-mono text-[#141414]/60 mt-1 block uppercase">
            涵盖公检法、刷单、百万保障等
          </span>
        </div>

        <div className="bg-[#EEECE6] border-2 border-[#141414] p-5 shadow-[4px_4px_0px_#141414]">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-mono font-bold text-[#141414]/70 uppercase">精准识破拦截率</span>
            <span className="material-symbols-outlined text-[#141414] text-xl">
              security
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-serif-editorial italic text-4xl font-bold text-[#141414]">
              {data.successRate}%
            </span>
            <span className="text-xs font-mono text-white bg-[#141414] px-1.5 py-0.5 font-bold uppercase">
              TOP 9%
            </span>
          </div>
          <span className="text-[11px] font-mono text-[#141414]/60 mt-1 block uppercase">
            高于全国同批次受训学员 91%
          </span>
        </div>

        <div className="bg-[#EEECE6] border-2 border-[#141414] p-5 shadow-[4px_4px_0px_#141414]">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-mono font-bold text-[#141414]/70 uppercase">模拟挽回潜在损失</span>
            <span className="material-symbols-outlined text-[#FF4D00] text-xl">
              savings
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-serif-editorial italic text-3xl font-bold text-[#141414]">
              ¥{data.blockedLossAmount.toLocaleString()}
            </span>
          </div>
          <span className="text-[11px] font-mono text-[#141414]/60 mt-1 block uppercase">
            成功拦截虚拟洗钱与连环刷单陷阱
          </span>
        </div>
      </div>

      {/* Main Analysis: 5 Dimensions & Vulnerability Map */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: 5 Dimensions */}
        <div className="lg:col-span-7 bg-[#EEECE6] border-2 border-[#141414] p-6 shadow-[5px_5px_0px_#141414]">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#141414]">
            <h3 className="font-mono text-sm uppercase font-bold text-[#141414] flex items-center gap-2">
              <span className="material-symbols-outlined text-lg text-[#FF4D00]">
                speed
              </span>
              <span>5-AXIS RADAR EVALUATION // 五维能力画像测评</span>
            </h3>
            <span className="text-xs font-mono text-[#141414]/60 font-bold uppercase">
              BENCHMARK: 80+ PTS
            </span>
          </div>

          <div className="space-y-4">
            {data.dimensions.map((dim, idx) => (
              <div key={idx} className="bg-[#FAF9F6] border border-[#141414] p-4 shadow-[2px_2px_0px_#141414]">
                <div className="flex justify-between items-center mb-2 font-mono text-xs">
                  <span className="font-bold text-[#141414] uppercase">{dim.name}</span>
                  <span className="font-bold text-[#FF4D00]">{dim.score} / 100 PTS</span>
                </div>
                <div className="w-full bg-[#EEECE6] h-2 border border-[#141414]/40 overflow-hidden mb-2">
                  <div
                    className="bg-[#141414] h-full transition-all duration-500"
                    style={{ width: `${dim.score}%` }}
                  />
                </div>
                <p className="text-xs text-[#141414]/70 font-sans">{dim.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right: History & Dossier */}
        <div className="lg:col-span-5 bg-[#EEECE6] border-2 border-[#141414] p-6 shadow-[5px_5px_0px_#141414] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#141414]">
              <h3 className="font-mono text-sm uppercase font-bold text-[#141414] flex items-center gap-2">
                <span className="material-symbols-outlined text-lg text-[#141414]">
                  folder_shared
                </span>
                <span>DOSSIER ARCHIVE // 演练档案与溯源报告</span>
              </h3>
              <span className="text-xs font-mono text-[#FF4D00] font-bold uppercase">
                CLICK TO VIEW
              </span>
            </div>

            <div className="space-y-3">
              {data.historyRecords.map((rec) => (
                <div
                  key={rec.id}
                  onClick={() => handleOpenHistoricalRecord(rec)}
                  className="bg-[#FAF9F6] border border-[#141414] hover:bg-[#FF4D00] hover:text-white p-4 cursor-pointer transition-colors group shadow-[2px_2px_0px_#141414]"
                >
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="font-mono text-xs font-bold uppercase group-hover:text-white">
                      {rec.scenario}
                    </span>
                    <span className="text-[11px] font-mono bg-[#141414] text-white group-hover:bg-white group-hover:text-[#141414] px-2 py-0.5 font-bold">
                      {rec.score}分 · {rec.result}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-mono text-[#141414]/60 group-hover:text-white/80">
                    <span>{rec.date} · {rec.duration}</span>
                    <span className="font-bold group-hover:translate-x-1 transition-transform">
                      VIEW REPORT →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-[#141414]">
            <button
              onClick={onStartSimulation}
              className="w-full bg-[#141414] hover:bg-[#FF4D00] text-white py-3 text-xs font-mono uppercase font-bold flex items-center justify-center gap-2 transition-colors border border-[#141414]"
            >
              <span className="material-symbols-outlined text-base">play_arrow</span>
              <span>LAUNCH NEW SIMULATION // 开启新一轮实训</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
