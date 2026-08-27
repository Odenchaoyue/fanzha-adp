import React from 'react';
import { ActiveView, ActiveModule } from '../types';

interface TopAppBarProps {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  setActiveModule: (module: ActiveModule) => void;
}

export const TopAppBar: React.FC<TopAppBarProps> = ({
  activeView,
  setActiveView,
  setActiveModule,
}) => {
  const handleReturnHome = () => {
    setActiveView('home');
    setActiveModule('none');
  };

  return (
    <header
      id="top-app-bar"
      className="bg-[#FAF9F6] border-b border-[#141414] flex justify-between items-center px-6 md:px-10 h-16 w-full fixed top-0 z-50 transition-colors"
    >
      {/* Brand & Editorial Monogram */}
      <div
        id="brand-logo-button"
        onClick={handleReturnHome}
        className="flex items-center gap-3 cursor-pointer select-none group"
      >
        <div className="w-8 h-8 bg-[#141414] flex items-center justify-center relative overflow-hidden transition-transform group-hover:scale-105">
          <div className="w-3.5 h-[1.5px] bg-white rotate-45 absolute"></div>
          <div className="w-3.5 h-[1.5px] bg-white -rotate-45 absolute"></div>
        </div>
        <div>
          <div className="text-base md:text-lg font-bold tracking-tighter text-[#141414] leading-tight flex items-center gap-1.5">
            <span>STUDIO.ANTI-FRAUD</span>
            <span className="text-[#FF4D00] text-xs font-mono font-bold">/ / 01</span>
          </div>
          <p className="text-[10px] uppercase font-mono tracking-widest text-[#141414]/60 hidden sm:block">
            反诈能力实训系统 · ARCHIVE EDITION
          </p>
        </div>
      </div>

      {/* Center / Right Editorial Nav Links */}
      <div className="flex items-center gap-4 md:gap-8">
        <div className="hidden sm:flex items-center gap-6 text-xs uppercase tracking-widest font-mono font-semibold">
          <button
            onClick={() => {
              setActiveView('home');
              setActiveModule('none');
            }}
            className={`transition-all hover:line-through hover:text-[#FF4D00] ${
              activeView === 'home' ? 'text-[#FF4D00] underline underline-offset-4' : 'text-[#141414]'
            }`}
          >
            实训大厅
          </button>
          <button
            onClick={() => {
              setActiveView('analytics');
              setActiveModule('none');
            }}
            className={`transition-all hover:line-through hover:text-[#FF4D00] ${
              activeView === 'analytics' ? 'text-[#FF4D00] underline underline-offset-4' : 'text-[#141414]'
            }`}
          >
            法证看板
          </button>
          <button
            onClick={() => {
              setActiveView('home');
              setActiveModule('qa');
            }}
            className="text-[#141414] transition-all hover:line-through hover:text-[#FF4D00]"
          >
            智能问答
          </button>
        </div>

        {/* Home / Action Button */}
        <button
          id="btn-return-home"
          onClick={handleReturnHome}
          className="text-[#141414] bg-[#EEECE6] hover:bg-[#141414] hover:text-white active:bg-[#FF4D00] transition-colors duration-200 px-3.5 py-1.5 border border-[#141414] text-xs uppercase tracking-wider font-mono font-bold flex items-center gap-1.5"
        >
          <span className="material-symbols-outlined text-sm">grid_view</span>
          <span className="hidden xs:inline">返回大厅</span>
        </button>
      </div>
    </header>
  );
};
