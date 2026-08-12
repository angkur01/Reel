import React, { useState, useEffect } from 'react';
import { Instagram, Settings, LogOut, Clock, FileText, RefreshCw, Bot } from 'lucide-react';

interface HeaderProps {
  onOpenSettings: () => void;
  onOpenLogs: () => void;
  onLogout: () => void;
  onBatchRefresh: () => void;
  nextScheduledFetchAt: string;
  isRefreshingBatch: boolean;
  telegramEnabled: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  onOpenLogs,
  onLogout,
  onBatchRefresh,
  nextScheduledFetchAt,
  isRefreshingBatch,
  telegramEnabled,
}) => {
  const [timeLeftStr, setTimeLeftStr] = useState<string>('');

  useEffect(() => {
    const updateTimer = () => {
      if (!nextScheduledFetchAt) {
        setTimeLeftStr('');
        return;
      }
      const target = new Date(nextScheduledFetchAt).getTime();
      const now = Date.now();
      const diffMs = target - now;

      if (diffMs <= 0) {
        setTimeLeftStr('Scheduled now...');
        return;
      }

      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diffMs % (1000 * 60)) / 1000);

      setTimeLeftStr(`${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [nextScheduledFetchAt]);

  return (
    <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 text-slate-100 px-4 py-3 sm:px-6">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        
        {/* Brand Logo & Name */}
        <div className="flex items-center justify-between w-full sm:w-auto">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center shadow-lg shadow-rose-500/20">
              <Instagram className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                Reel Tracker
              </h1>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Auto 00:00 · 06:00 · 12:00 · 18:00
              </div>
            </div>
          </div>

          {/* Mobile Right Badges */}
          <div className="flex sm:hidden items-center gap-2">
            {telegramEnabled && (
              <span className="p-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400" title="Telegram Bot Active">
                <Bot className="w-4 h-4" />
              </span>
            )}
            <button
              onClick={onOpenSettings}
              className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white border border-slate-700/50"
              aria-label="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Next Schedule Banner & Actions */}
        <div className="flex flex-wrap items-center justify-between sm:justify-end w-full sm:w-auto gap-2">
          
          {/* Next Scheduled Countdown Pill */}
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs text-slate-300">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>Next Auto:</span>
            <span className="font-mono font-bold text-amber-400">{timeLeftStr || '--:--:--'}</span>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center space-x-2">
            
            <button
              onClick={onBatchRefresh}
              disabled={isRefreshingBatch}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700/60 text-xs font-medium text-slate-200 transition-all active:scale-95 disabled:opacity-50"
              title="Refresh all reels now"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isRefreshingBatch ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh All</span>
            </button>

            <button
              onClick={onOpenLogs}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700/60 text-xs font-medium text-slate-200 transition-all active:scale-95"
            >
              <FileText className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden sm:inline">Logs</span>
            </button>

            <button
              onClick={onOpenSettings}
              className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700/60 text-xs font-medium text-slate-200 transition-all active:scale-95"
            >
              <Settings className="w-3.5 h-3.5 text-slate-400" />
              <span>Settings</span>
            </button>

            <button
              onClick={onLogout}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-xs font-medium text-rose-400 transition-all active:scale-95"
              title="Logout Admin"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>

      </div>
    </header>
  );
};
