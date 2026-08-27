import React from 'react';
import { ActiveView, ActiveModule } from '../types';

interface BottomNavBarProps {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  setActiveModule: (module: ActiveModule) => void;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeView,
  setActiveView,
  setActiveModule,
}) => {
  return (
    <nav
      id="bottom-nav-bar"
      className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 py-2 bg-[#FAF9F6] border-t border-[#141414] shadow-none"
    >
      {/* 模拟通话 */}
      <button
        id="mobile-btn-call"
        onClick={() => {
          setActiveView('home');
          setActiveModule('call');
        }}
        className="flex flex-col items-center justify-center bg-[#FF4D00] text-white border border-[#141414] p-1.5 cursor-pointer w-12 h-12 active:scale-95 transition-transform"
      >
        <span className="material-symbols-outlined text-lg" data-icon="phone_in_talk">
          phone_in_talk
        </span>
        <span className="text-[9px] font-mono font-bold leading-tight uppercase">模拟</span>
      </button>

      {/* 风险看板 */}
      <button
        id="mobile-btn-dashboard"
        onClick={() => {
          setActiveView('analytics');
          setActiveModule('none');
        }}
        className={`flex flex-col items-center justify-center cursor-pointer w-12 py-1 transition-colors ${
          activeView === 'analytics' ? 'text-[#FF4D00] font-bold' : 'text-[#141414] opacity-80'
        }`}
      >
        <span className="material-symbols-outlined text-lg" data-icon="speed">
          speed
        </span>
        <span className="text-[9px] font-mono leading-tight uppercase mt-0.5">看板</span>
      </button>

      {/* 互动剧场 */}
      <button
        id="mobile-btn-theater"
        onClick={() => {
          setActiveView('home');
          setActiveModule('theater');
        }}
        className="flex flex-col items-center justify-center text-[#141414] opacity-80 hover:text-[#FF4D00] cursor-pointer w-12 py-1"
      >
        <span className="material-symbols-outlined text-lg" data-icon="theater_comedy">
          theater_comedy
        </span>
        <span className="text-[9px] font-mono leading-tight uppercase mt-0.5">剧场</span>
      </button>

      {/* 反诈问答 */}
      <button
        id="mobile-btn-qa"
        onClick={() => {
          setActiveView('home');
          setActiveModule('qa');
        }}
        className="flex flex-col items-center justify-center text-[#141414] opacity-80 hover:text-[#FF4D00] cursor-pointer w-12 py-1"
      >
        <span className="material-symbols-outlined text-lg" data-icon="forum">
          forum
        </span>
        <span className="text-[9px] font-mono leading-tight uppercase mt-0.5">问答</span>
      </button>
    </nav>
  );
};
