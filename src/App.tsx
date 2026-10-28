/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { ActiveView, ActiveModule, AppConfig, ForensicReport } from './types';
import { TopAppBar } from './components/TopAppBar';
import { SideNavBar } from './components/SideNavBar';
import { BottomNavBar } from './components/BottomNavBar';
import { HomeDashboard } from './components/HomeDashboard';
import { SimulatedCallModal } from './components/SimulatedCallModal';
import { InteractiveTheaterModal } from './components/InteractiveTheaterModal';
import { AntiFraudQAModal } from './components/AntiFraudQAModal';
import { ForensicReportModal } from './components/ForensicReportModal';
import { AnalyticsView } from './components/AnalyticsView';

/* localStorage 持久化 key(仅保留 visitor/voice,AppKey 改从 .env 读) */
const LS_KEYS = {
  visitor: 'fz_visitor',
  voice: 'fz_voice',
};

function loadConfig(): AppConfig {
  let appKey = '';
  let visitorId = '';
  let ttsVoice: AppConfig['ttsVoice'] = 'xiaolan';
  try {
    // AppKey 优先取自 Vite 注入的环境变量(.env: VITE_APP_KEY=...),旧版 localStorage 兜底兼容
    const envKey = (import.meta as any).env?.VITE_APP_KEY as string | undefined;
    if (envKey && envKey.trim()) {
      appKey = envKey.trim();
    } else {
      appKey = localStorage.getItem('fz_appkey') || ''; // 兼容旧配置
    }
    visitorId = localStorage.getItem(LS_KEYS.visitor) || '';
    const v = localStorage.getItem(LS_KEYS.voice);
    if (v === 'xiaolan' || v === 'xiaoqing' || v === 'xiaoyue' || v === 'shuyan' || v === 'zimo' || v === 'qinghe') {
      ttsVoice = v;
    }
    if (!visitorId) {
      visitorId = 'visitor-' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(LS_KEYS.visitor, visitorId);
    }
  } catch {
    /* localStorage 不可用时用默认值 */
  }
  return { appKey, visitorId, ttsVoice, soundEnabled: true, aiAssistance: true };
}

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>('home');
  const [activeModule, setActiveModule] = useState<ActiveModule>('none');
  const [currentScenarioId, setCurrentScenarioId] = useState<string>('police');
  const [activeReport, setActiveReport] = useState<ForensicReport | null>(null);

  const [config, setConfig] = useState<AppConfig>(loadConfig);

  // 配置持久化(只写 visitor/voice,AppKey 来自 .env 不再回写)
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEYS.visitor, config.visitorId);
      localStorage.setItem(LS_KEYS.voice, config.ttsVoice);
    } catch {
      /* 忽略 */
    }
  }, [config]);

  const handleStartModule = (module: ActiveModule, scenarioId?: string) => {
    if (scenarioId) {
      setCurrentScenarioId(scenarioId);
    }
    setActiveModule(module);
  };

  const handleViewReport = (report: ForensicReport) => {
    setActiveReport(report);
    setActiveModule('report');
  };

  const handleCloseModal = () => {
    setActiveModule('none');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#141414] font-sans selection:bg-[#FF4D00] selection:text-white">
      {/* Top App Bar */}
      <TopAppBar
        activeView={activeView}
        setActiveView={setActiveView}
        setActiveModule={setActiveModule}
      />

      {/* Fixed Left Side Nav Bar (md+) */}
      <SideNavBar
        activeView={activeView}
        setActiveView={setActiveView}
        setActiveModule={setActiveModule}
      />

      {/* Main Content Canvas */}
      <main
        id="main-canvas"
        className="flex-1 md:ml-20 pt-20 pb-24 md:pb-12 px-4 sm:px-8 max-w-7xl mx-auto w-full transition-all"
      >
        {activeView === 'home' ? (
          <HomeDashboard
            onStartModule={handleStartModule}
            config={config}
            setConfig={setConfig}
          />
        ) : (
          <AnalyticsView
            onViewReportDetail={handleViewReport}
            onStartSimulation={() => {
              setActiveView('home');
              handleStartModule('call', 'police');
            }}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <BottomNavBar
        activeView={activeView}
        setActiveView={setActiveView}
        setActiveModule={setActiveModule}
      />

      {/* Interactive Modals */}
      {activeModule === 'call' && (
        <SimulatedCallModal
          initialScenarioId={currentScenarioId}
          config={config}
          onClose={handleCloseModal}
          onViewReport={handleViewReport}
        />
      )}

      {activeModule === 'theater' && (
        <InteractiveTheaterModal
          config={config}
          onClose={handleCloseModal}
          onViewReport={handleViewReport}
        />
      )}

      {activeModule === 'qa' && (
        <AntiFraudQAModal config={config} onClose={handleCloseModal} />
      )}

      {activeModule === 'report' && activeReport && (
        <ForensicReportModal
          report={activeReport}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}
