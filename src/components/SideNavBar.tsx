import React from 'react';
import { ActiveView, ActiveModule } from '../types';

interface SideNavBarProps {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  setActiveModule: (module: ActiveModule) => void;
}

export const SideNavBar: React.FC<SideNavBarProps> = ({
  activeView,
  setActiveView,
  setActiveModule,
}) => {
  const handleNav = (view: ActiveView) => {
    setActiveView(view);
    setActiveModule('none');
  };

  return (
    <nav
      id="side-nav-bar"
      className="hidden md:flex fixed left-0 top-0 h-full flex-col items-center py-8 z-40 bg-[#FAF9F6] border-r border-[#141414] w-20 pt-20 select-none justify-between"
    >
      {/* 顶部区域：纵向编辑标题 */}
      <div className="flex flex-col items-center gap-6">
        <div className="rotate-180 [writing-mode:vertical-lr] text-[9px] uppercase tracking-[0.4em] text-[#141414]/50 font-mono font-bold">
          ESTABLISHED—2026
        </div>

        {/* Tab 1: 监控 */}
        <button
          id="nav-tab-monitoring"
          onClick={() => handleNav('home')}
          title="实时监控与实训"
          className={`flex flex-col items-center justify-center p-2 cursor-pointer transition-all w-12 h-12 border ${
            activeView === 'home'
              ? 'bg-[#141414] text-white border-[#141414] shadow-sm'
              : 'bg-transparent text-[#141414] border-[#141414]/20 hover:border-[#141414] hover:bg-[#FF4D00] hover:text-white'
          }`}
        >
          <span
            className={`material-symbols-outlined text-[20px] ${activeView === 'home' ? 'fill' : ''}`}
            data-icon="security"
          >
            security
          </span>
          <span className="text-[10px] font-mono uppercase font-bold leading-tight mt-0.5">
            实训
          </span>
        </button>

        {/* Tab 2: 分析 */}
        <button
          id="nav-tab-analytics"
          onClick={() => handleNav('analytics')}
          title="风险分析与溯源"
          className={`flex flex-col items-center justify-center p-2 cursor-pointer transition-all w-12 h-12 border ${
            activeView === 'analytics'
              ? 'bg-[#141414] text-white border-[#141414] shadow-sm'
              : 'bg-transparent text-[#141414] border-[#141414]/20 hover:border-[#141414] hover:bg-[#FF4D00] hover:text-white'
          }`}
        >
          <span
            className={`material-symbols-outlined text-[20px] ${activeView === 'analytics' ? 'fill' : ''}`}
            data-icon="analytics"
          >
            analytics
          </span>
          <span className="text-[10px] font-mono uppercase font-bold leading-tight mt-0.5">
            看板
          </span>
        </button>
      </div>

     {/* 底部区域：等宽索引指示器与头像 */}
      <div className="flex flex-col items-center gap-4">
        {/* User Profile Avatar with sharp border */}
        <div className="flex flex-col items-center group relative">
          <div className="w-8 h-8 border border-[#141414] p-0.5 bg-[#EEECE6] hover:bg-[#FF4D00] transition-colors cursor-pointer">
            <img
              id="user-profile-avatar"
              alt="User Profile"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover grayscale contrast-125"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuAPFs4ShF2P8kvTOBvWA733ci7dpGbEQqWbF879ZAGEcQZp0GoGSZ97vVmvLQT7SPJH90h3JAYZrUyzQ6wMq7eWypdPXuAFnvOrHvv__4wpCRqvGjXmRCBeLCCQye-UIPAfIkCnCb_6ZnFFl-yVF1oo2ap_QI3t0zJ0HynYVMxe8lKrHI-impkvr7DG7UtXfhw7txiSsHyp7vkeT8s2bgegxA8EdNU7vGaFKz5onB7Rj5lssZmw38W-"
            />
          </div>
          <div className="absolute left-14 bottom-0 hidden group-hover:block bg-[#141414] text-white text-[10px] font-mono uppercase px-2.5 py-1 shadow-md whitespace-nowrap z-50 border border-white/20">
            警务反诈认证学员 #8841
          </div>
        </div>

        {/* 设计主题中的工作室索引数字 */}
        <div className="text-xs font-mono font-bold text-[#FF4D00] tracking-wider">
          001
        </div>
      </div>
    </nav>
  );
};
