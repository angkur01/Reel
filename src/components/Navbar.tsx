import React from 'react';
import { LayoutDashboard, Film, Brain, BarChart3, Settings, RefreshCw, LogOut, Bot, Zap, Bell, Server } from 'lucide-react';
import { SystemStats } from '../types';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  stats: SystemStats | null;
  isRefreshingAll: boolean;
  onRefreshAll: () => void;
  onLogout: () => void;
  onOpenAddModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  stats,
  isRefreshingAll,
  onRefreshAll,
  onLogout,
  onOpenAddModal,
}) => {
  const tabs = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'reels', label: 'Reels', icon: Film, badge: stats?.totalReels },
    { id: 'ai-brain', label: 'AI Brain', icon: Brain, badge: `${stats?.aiChecksUsedToday || 0}/${stats?.aiDailyLimit || 50}` },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'uptime', label: 'Uptime', icon: Server },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <>
      {/* Top Desktop / Mobile Header */}
      <header className="sticky top-0 z-40 glass-panel border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md px-4 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('overview')}>
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 text-white shadow-lg shadow-indigo-500/25">
              <Zap className="w-5 h-5 text-yellow-300 animate-pulse-slow" />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-lg sm:text-xl tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-indigo-200">
                  REEL COMMAND
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  PRO AI
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">Real-Time Intelligence & Video Analytics</p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`nav-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/20'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Header Action Buttons & AI Counter */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* AI Meter Indicator */}
            <div
              onClick={() => setActiveTab('ai-brain')}
              className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-indigo-500/30 text-xs text-slate-300 cursor-pointer hover:border-indigo-500/60 transition"
              title="Daily AI Monitoring Limit"
            >
              <Brain className="w-4 h-4 text-purple-400 animate-pulse" />
              <span>AI Checks:</span>
              <span className="font-bold text-indigo-400">
                {stats?.aiChecksUsedToday || 0}/{stats?.aiDailyLimit || 50}
              </span>
            </div>

            {/* Quick Add Reel Button */}
            <button
              id="btn-quick-add-reel"
              onClick={onOpenAddModal}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 transition active:scale-95 cursor-pointer"
            >
              <span className="text-base leading-none">+</span>
              <span className="hidden sm:inline">Add Reel</span>
            </button>

            {/* Refresh All Button */}
            <button
              id="btn-refresh-all-reels"
              onClick={onRefreshAll}
              disabled={isRefreshingAll}
              title="Fetch latest stats for all reels"
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-indigo-500/50 transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshingAll ? 'animate-spin text-indigo-400' : ''}`} />
            </button>

            {/* Logout Button */}
            <button
              id="btn-admin-logout"
              onClick={onLogout}
              title="Admin Logout"
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-500/50 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass-panel border-t border-slate-800/80 bg-slate-950/95 px-2 py-2">
        <div className="flex items-center justify-around">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`mobile-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all ${
                  isActive
                    ? 'text-indigo-400 font-bold scale-105'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="relative">
                  <Icon className="w-5 h-5" />
                  {tab.badge !== undefined && (
                    <span className="absolute -top-1.5 -right-2 px-1 py-0.2 text-[9px] font-bold rounded-full bg-indigo-600 text-white">
                      {tab.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px]">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
