import React from 'react';
import { ForensicReport } from '../types';

interface ForensicReportModalProps {
  report: ForensicReport;
  onClose: () => void;
}

export const ForensicReportModal: React.FC<ForensicReportModalProps> = ({
  report,
  onClose,
}) => {
  const radarDimensions = [
    { label: '权威威慑抗压', score: report.radarScores?.authorityResistance || 85 },
    { label: '贪利诱惑防御', score: report.radarScores?.greedResistance || 90 },
    { label: '官方渠道验证', score: report.radarScores?.verificationHabit || 80 },
    { label: '隐私防线坚固度', score: report.radarScores?.privacyAwareness || 85 },
    { label: '急迫话术冷静度', score: report.radarScores?.urgencyComposure || 75 },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-[#141414]/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-fade-in">
      <div className="bg-[#FAF9F6] text-[#141414] w-full max-w-4xl border-2 border-[#141414] shadow-[10px_10px_0px_#141414] overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Report Top Header */}
        <div className="bg-[#141414] text-white px-6 py-4 flex items-center justify-between border-b border-[#141414]">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-2xl text-[#FF4D00]">
              verified
            </span>
            <div>
              <h3 className="font-mono text-sm uppercase font-bold tracking-tight">
                FORENSIC DOSSIER // 反诈能力实训法证评估报告
              </h3>
              <p className="text-xs text-white/60 font-mono">
                NATIONAL ANTI-FRAUD INTELLIGENCE & EVALUATION REPORT
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

        {/* Forensic Metadata Header */}
        <div className="bg-[#EEECE6] border-b border-[#141414] px-6 py-3 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
          <div>
            <span className="text-[#141414]/60 uppercase block">案件档案编号:</span>
            <span className="font-bold text-[#141414]">{report.caseNumber}</span>
          </div>
          <div>
            <span className="text-[#141414]/60 uppercase block">测评时间戳:</span>
            <span className="text-[#141414]">{report.timestamp}</span>
          </div>
          <div>
            <span className="text-[#141414]/60 uppercase block">实训攻防场景:</span>
            <span className="text-[#141414] font-bold">{report.scenarioTitle}</span>
          </div>
          <div>
            <span className="text-[#141414]/60 uppercase block">对抗耗时:</span>
            <span className="text-[#141414] font-bold">{report.durationSeconds} SEC</span>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="p-6 md:p-8 overflow-y-auto flex-1 space-y-6 bg-[#FAF9F6]">
          
          {/* Top Score & Risk Gauge Card */}
          <div className="bg-[#EEECE6] border border-[#141414] p-6 shadow-[4px_4px_0px_#141414] flex flex-col md:flex-row items-center justify-between gap-6">
            {/* Score Ring */}
            <div className="flex items-center gap-6">
              <div className="relative w-28 h-28 flex items-center justify-center bg-[#FAF9F6] border-2 border-[#141414] shadow-[3px_3px_0px_#141414]">
                <div className="text-center">
                  <span className="font-serif-editorial italic text-4xl font-bold text-[#141414] block">
                    {report.overallScore}
                  </span>
                  <span className="text-[10px] text-[#141414]/70 uppercase font-mono font-bold">
                    SCORE / 100
                  </span>
                </div>
              </div>
              <div>
                <span className="text-xs text-[#141414]/60 font-mono uppercase block mb-1 font-bold">
                  综合防御评级:
                </span>
                <div className="inline-block px-3 py-1 bg-[#141414] text-[#FF4D00] text-sm font-bold font-mono uppercase tracking-wider border border-[#141414]">
                  {report.riskLevel}
                </div>
                <p className="text-xs text-[#141414]/80 mt-2 max-w-xs leading-relaxed font-sans">
                  {report.overallScore >= 85
                    ? '学员具备高度敏锐的电信诈骗识别意识，能从容抵御权威施压与利益诱导。'
                    : '学员在应对高频恐吓及紧急催促时存在轻微漏洞，需强化官方渠道核查习惯。'}
                </p>
              </div>
            </div>

            {/* Dimensional Bars */}
            <div className="w-full md:w-1/2 space-y-2.5">
              <span className="text-xs font-mono font-bold text-[#141414] uppercase block mb-1">
                FIVE-AXIS DEFENSE RADAR // 五维防御雷达分解:
              </span>
              {radarDimensions.map((dim, idx) => (
                <div key={idx}>
                  <div className="flex justify-between text-xs font-mono mb-1">
                    <span className="text-[#141414]/80">{dim.label}</span>
                    <span className="font-bold text-[#141414]">{dim.score} PTS</span>
                  </div>
                  <div className="w-full bg-white h-2 border border-[#141414]/40 overflow-hidden">
                    <div
                      className="bg-[#FF4D00] h-full transition-all duration-700"
                      style={{ width: `${dim.score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 1: Detected Vulnerabilities */}
          <div>
            <h4 className="font-mono text-sm uppercase font-bold text-[#141414] mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#FF4D00] text-lg">
                warning
              </span>
              <span>EXPOSED VULNERABILITIES // 实训暴露的潜在心理薄弱点</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {report.detectedVulnerabilities?.map((vul, idx) => (
                <div
                  key={idx}
                  className="bg-[#EEECE6] border border-[#141414] p-4 text-xs leading-relaxed text-[#141414] flex items-start gap-3 shadow-[2px_2px_0px_#FF4D00]"
                >
                  <span className="font-bold font-mono text-[#FF4D00]">0{idx + 1}.</span>
                  <span>{vul}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Scam Points Exposed */}
          <div>
            <h4 className="font-mono text-sm uppercase font-bold text-[#141414] mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#141414] text-lg">
                find_in_page
              </span>
              <span>TACTIC ANALYSIS // 本次涉案诈骗话术特征拆解</span>
            </h4>
            <div className="space-y-2">
              {report.scamPointsExposed?.map((pt, idx) => (
                <div
                  key={idx}
                  className="bg-[#EEECE6] border border-[#141414] p-3 text-xs text-[#141414] flex items-center gap-3"
                >
                  <span className="w-2 h-2 bg-[#FF4D00] shrink-0"></span>
                  <span>{pt}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Expert Suggestions */}
          <div>
            <h4 className="font-mono text-sm uppercase font-bold text-[#141414] mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#FF4D00] text-lg">
                security
              </span>
              <span>EXPERT DIRECTIVES // 公安与法证专家防御指南</span>
            </h4>
            <div className="bg-[#EEECE6] border-l-4 border-[#FF4D00] border-y border-r border-[#141414] p-4 space-y-2">
              {report.expertSuggestions?.map((sug, idx) => (
                <p key={idx} className="text-xs text-[#141414] leading-relaxed flex items-start gap-2">
                  <span className="text-[#FF4D00] font-bold">✓</span>
                  <span>{sug}</span>
                </p>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-[#EEECE6] border-t border-[#141414] px-6 py-4 flex items-center justify-between">
          <span className="text-xs font-mono text-[#141414]/60 uppercase">
            STATUS: ARCHIVED TO CENTRAL REGISTRY // 数据已加密归档
          </span>
          <button
            type="button"
            onClick={onClose}
            className="bg-[#141414] hover:bg-[#FF4D00] text-white px-6 py-2 text-xs font-mono uppercase font-bold border border-[#141414] transition-colors"
          >
            RETURN TO HUB // 完成并返回大厅
          </button>
        </div>
      </div>
    </div>
  );
};
