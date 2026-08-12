import React from 'react';
import { Eye, Heart, TrendingUp, Film, Brain, Sparkles, RefreshCw, AlertTriangle, ArrowUpRight, ShieldCheck, Download, DollarSign } from 'lucide-react';
import { Reel, SystemStats, AiLog } from '../types';

interface OverviewTabProps {
  stats: SystemStats | null;
  reels: Reel[];
  aiLogs: AiLog[];
  onOpenAddModal: () => void;
  onRefreshAll: () => void;
  isRefreshingAll: boolean;
  onRunAiCheck: () => void;
  isRunningAiCheck: boolean;
  onSelectReel: (reel: Reel) => void;
  setActiveTab: (tab: string) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  stats,
  reels,
  aiLogs,
  onOpenAddModal,
  onRefreshAll,
  isRefreshingAll,
  onRunAiCheck,
  isRunningAiCheck,
  onSelectReel,
  setActiveTab,
}) => {
  const topReels = [...reels].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 3);
  const latestAiLog = aiLogs && aiLogs.length > 0 ? aiLogs[0] : null;

  return (
    <div className="space-y-6 pb-12">
      
      {/* AI Brain Live Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950/80 to-purple-950/90 border border-indigo-500/30 p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold border border-indigo-500/30">
              <Sparkles className="w-3.5 h-3.5 text-yellow-300 animate-spin" />
              <span>AI Autonomous Monitoring Active</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Command Center AI Intelligence
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Google Gemini 3.6 Flash & Grok AI are analyzing saved Reels, detecting viral spikes, milestone breakthroughs, and auto-dispatching alerts directly to Telegram.
            </p>

            {/* Latest AI Insight Alert Box */}
            {latestAiLog && (
              <div className="mt-4 p-3.5 rounded-2xl bg-slate-950/80 border border-indigo-500/40 text-xs flex items-start gap-3">
                <Brain className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-indigo-300">{latestAiLog.headline}</span>
                    <span className="text-[10px] text-slate-400">{new Date(latestAiLog.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-slate-300 mt-0.5 line-clamp-2">{latestAiLog.message}</p>
                </div>
              </div>
            )}
          </div>

          {/* AI Action CTA */}
          <div className="flex flex-col sm:flex-row md:flex-col gap-3 w-full md:w-auto shrink-0">
            <button
              id="btn-trigger-ai-check-hero"
              onClick={onRunAiCheck}
              disabled={isRunningAiCheck}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-600 hover:from-indigo-400 hover:to-pink-500 text-white font-bold text-xs shadow-lg shadow-indigo-500/30 transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <Brain className={`w-4 h-4 ${isRunningAiCheck ? 'animate-bounce' : ''}`} />
              <span>{isRunningAiCheck ? 'AI Analyzing...' : 'Run AI Analysis Now'}</span>
            </button>

            <button
              id="btn-add-reel-hero"
              onClick={onOpenAddModal}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-slate-900 border border-slate-700 hover:border-emerald-500 text-emerald-400 font-bold text-xs transition active:scale-95 cursor-pointer"
            >
              <span className="text-lg leading-none">+</span>
              <span>Add Instagram Reel</span>
            </button>
          </div>
        </div>
      </div>

      {/* Primary KPI Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Metric 1: Total Views */}
        <div className="glass-panel glass-panel-hover p-5 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Total Views</span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
              <Eye className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white">
            {(stats?.totalViews || 0).toLocaleString()}
          </div>
          <div className="mt-2 text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>+{(stats?.total24hGrowth || 0).toLocaleString()} in last 24h</span>
          </div>
        </div>

        {/* Metric 2: Total Likes */}
        <div className="glass-panel glass-panel-hover p-5 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Total Engagement</span>
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400">
              <Heart className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white">
            {(stats?.totalLikes || 0).toLocaleString()}
          </div>
          <div className="mt-2 text-[11px] text-slate-400 font-medium">
            Likes recorded across reels
          </div>
        </div>

        {/* Metric 3: Active Reels */}
        <div className="glass-panel glass-panel-hover p-5 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Tracked Reels</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
              <Film className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white">
            {stats?.totalReels || 0}
          </div>
          <div className="mt-2 text-[11px] text-amber-400 flex items-center gap-1 font-medium">
            <span>🔥 {stats?.viralCount || 0} Viral</span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-400">⚠️ {stats?.stalledCount || 0} Stalled</span>
          </div>
        </div>

        {/* Metric 4: AI Daily Allowance Gauge */}
        <div className="glass-panel glass-panel-hover p-5 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>AI Checks Today</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <Brain className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white">
            {stats?.aiChecksUsedToday || 0} <span className="text-sm font-normal text-slate-400">/ {stats?.aiDailyLimit || 50}</span>
          </div>
          {/* Progress Bar */}
          <div className="mt-3 w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full transition-all duration-500"
              style={{
                width: `${Math.min(100, ((stats?.aiChecksUsedToday || 0) / (stats?.aiDailyLimit || 50)) * 100)}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* CPM Campaign Live Financial Summary Banner */}
      <div className="glass-panel p-6 rounded-3xl border border-emerald-500/30 bg-gradient-to-r from-slate-900 via-emerald-950/40 to-slate-900 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
            <DollarSign className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-extrabold text-white">CPM Campaign Earnings & Payout</h3>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30">
                Auto-Calculated
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Net earnings after applying active CPM rates and automatic 3% platform fee deduction.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 border-slate-800 pt-4 md:pt-0">
          <div>
            <span className="text-[11px] text-slate-400 block uppercase font-semibold">Gross CPM Earnings</span>
            <span className="text-lg font-bold text-emerald-400">${(stats?.totalCpmEarnings || 0).toFixed(2)}</span>
          </div>
          <div className="text-slate-600 font-light text-xl">/</div>
          <div>
            <span className="text-[11px] text-slate-400 block uppercase font-semibold">Net Estimated Payout</span>
            <span className="text-xl font-extrabold text-white">${(stats?.totalEstimatedPayout || 0).toFixed(2)}</span>
          </div>

          <button
            onClick={() => setActiveTab('cpm-campaigns')}
            className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-500/20 transition cursor-pointer shrink-0"
          >
            Manage CPM
          </button>
        </div>
      </div>

      {/* Middle Section: Top Reels Leaderboard & Quick Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Top Performing Reels (2 columns) */}
        <div className="lg:col-span-2 glass-panel p-6 rounded-3xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-6 rounded-full bg-indigo-500" />
              <h3 className="font-extrabold text-base text-white">Top Performing Reels</h3>
            </div>
            <button
              onClick={() => setActiveTab('reels')}
              className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
            >
              <span>View All ({reels.length})</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {topReels.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              No Reels tracked yet. Click "+ Add Reel" to begin tracking stats!
            </div>
          ) : (
            <div className="space-y-3">
              {topReels.map((reel, index) => (
                <div
                  key={reel.id}
                  onClick={() => onSelectReel(reel)}
                  className="flex items-center gap-4 p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/40 transition cursor-pointer group"
                >
                  <div className="font-black text-slate-500 text-sm w-4 text-center group-hover:text-indigo-400">
                    #{index + 1}
                  </div>
                  <img
                    src={reel.thumbnail}
                    alt={reel.name}
                    className="w-12 h-16 rounded-xl object-cover bg-slate-800 shrink-0"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?auto=format&fit=crop&w=300&q=80';
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-xs text-white truncate group-hover:text-indigo-300">
                        {reel.name}
                      </h4>
                      {reel.isViral && (
                        <span className="px-1.5 py-0.2 text-[9px] font-extrabold rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          VIRAL 🔥
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">{reel.author}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px]">
                      <span className="font-extrabold text-white">{(reel.views || 0).toLocaleString()} views</span>
                      <span className="text-slate-500">•</span>
                      <span className="text-emerald-400">+{(reel.growth24h || 0).toLocaleString()} 24h</span>
                    </div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* System Scheduler & Quick Tools (1 column) */}
        <div className="glass-panel p-6 rounded-3xl space-y-5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-6 rounded-full bg-purple-500" />
            <h3 className="font-extrabold text-base text-white">System Status</h3>
          </div>

          <div className="space-y-3 text-xs">
            {/* Auto Fetch Schedule */}
            <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
              <div className="text-slate-400 font-medium">Automatic Cron Scheduler</div>
              <div className="text-emerald-400 font-bold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Runs Every 6 Hours</span>
              </div>
              <div className="text-[10px] text-slate-500">
                Next run: {stats?.nextScheduledFetchAt ? new Date(stats.nextScheduledFetchAt).toLocaleTimeString() : 'Scheduled'}
              </div>
            </div>

            {/* AI Model Status */}
            <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
              <div className="text-slate-400 font-medium">Active AI Model</div>
              <div className="text-indigo-300 font-bold flex items-center gap-1.5">
                <Brain className="w-4 h-4 text-purple-400" />
                <span className="capitalize">{stats?.aiActiveModel || 'Gemini 3.6 Flash'}</span>
              </div>
              <div className="text-[10px] text-slate-500">Automatic Grok Fallback Engine Enabled</div>
            </div>

            {/* Telegram Bot */}
            <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
              <div className="text-slate-400 font-medium">Telegram Bot Direct Push</div>
              <div className="text-emerald-400 font-bold">
                {stats?.telegramEnabled ? '✅ Active & Polling' : '⚠️ Offline / Disabled'}
              </div>
            </div>
          </div>

          {/* Export Stats Button */}
          <a
            href="/api/reels/export?format=csv"
            download="reels_analytics.csv"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-slate-900 border border-slate-800 hover:border-indigo-500 text-slate-200 text-xs font-bold transition cursor-pointer"
          >
            <Download className="w-4 h-4 text-indigo-400" />
            <span>Export Analytics CSV</span>
          </a>
        </div>

      </div>
    </div>
  );
};
