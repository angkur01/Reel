import React, { useState } from 'react';
import { Search, Filter, RefreshCw, Trash2, Edit2, ExternalLink, Play, Eye, Heart, MessageSquare, Flame, AlertCircle, CheckCircle2, Video, ArrowUpDown, Sparkles, BarChart3, LayoutGrid, Archive, RotateCcw, Ban, Clock, Zap } from 'lucide-react';
import { Reel } from '../types';
import { AnalyticsTab } from './AnalyticsTab';

interface ReelsTabProps {
  reels: Reel[];
  onRefreshReel: (id: string) => void;
  onEditReelName: (id: string, currentName: string) => void;
  onGroqRenameReel?: (id: string) => Promise<string>;
  onDeleteReel: (id: string) => void;
  onOpenAddModal: () => void;
  onRetryFailed: () => void;
  isRetryingFailed: boolean;
  refreshingReelIds: Set<string>;
  onRefreshAll: () => void;
  isRefreshingAll: boolean;
  onChangeCategory?: (id: string, category: 'active' | 'archived' | 'paid' | 'stop_pushing') => void;
  initialViewMode?: 'grid' | 'analytics';
  initialSearchTerm?: string;
}

export const ReelsTab: React.FC<ReelsTabProps> = ({
  reels,
  onRefreshReel,
  onEditReelName,
  onGroqRenameReel,
  onDeleteReel,
  onOpenAddModal,
  onRetryFailed,
  isRetryingFailed,
  refreshingReelIds,
  onRefreshAll,
  isRefreshingAll,
  onChangeCategory,
  initialViewMode = 'grid',
  initialSearchTerm = '',
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'analytics'>(initialViewMode);
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'active' | 'stop_pushing' | 'archived' | 'paid'>('all');
  const [filterMode, setFilterMode] = useState<'all' | 'viral' | 'stalled' | 'failed' | 'success'>('all');
  const [sortBy, setSortBy] = useState<'views' | 'growth' | 'likes' | 'newest'>('views');
  const [activeVideoModalUrl, setActiveVideoModalUrl] = useState<string | null>(null);

  // Stop Pushing batch state
  const [isFetchingStopPushing, setIsFetchingStopPushing] = useState(false);
  const [stopPushingFeedback, setStopPushingFeedback] = useState<string | null>(null);

  // Rename modal state
  const [renameTargetReel, setRenameTargetReel] = useState<Reel | null>(null);
  const [manualTitleInput, setManualTitleInput] = useState<string>('');
  const [isGeneratingGroqTitle, setIsGeneratingGroqTitle] = useState<boolean>(false);
  const [renameStatusMsg, setRenameStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const activeCount = reels.filter(r => r.category !== 'archived' && r.category !== 'paid' && r.category !== 'stop_pushing').length;
  const stopPushingCount = reels.filter(r => r.category === 'stop_pushing').length;
  const archivedCount = reels.filter(r => r.category === 'archived').length;
  const paidCount = reels.filter(r => r.category === 'paid').length;
  const totalCount = reels.length;

  // Filter logic
  const filteredReels = reels.filter((r) => {
    // Category filter
    if (categoryFilter === 'active' && (r.category === 'archived' || r.category === 'paid' || r.category === 'stop_pushing')) return false;
    if (categoryFilter === 'stop_pushing' && r.category !== 'stop_pushing') return false;
    if (categoryFilter === 'archived' && r.category !== 'archived') return false;
    if (categoryFilter === 'paid' && r.category !== 'paid') return false;

    const matchesSearch =
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.caption.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.author.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.discoveredFromAccount && r.discoveredFromAccount.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    if (filterMode === 'viral') return r.isViral;
    if (filterMode === 'stalled') return r.isStalled;
    if (filterMode === 'failed') return r.status === 'failed';
    if (filterMode === 'success') return r.status === 'success';

    return true;
  });

  // Sort logic
  const sortedReels = [...filteredReels].sort((a, b) => {
    if (sortBy === 'views') return (b.views || 0) - (a.views || 0);
    if (sortBy === 'growth') return (b.growth24h || 0) - (a.growth24h || 0);
    if (sortBy === 'likes') return (b.likes || 0) - (a.likes || 0);
    if (sortBy === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return 0;
  });

  const failedCount = reels.filter(r => r.status === 'failed').length;

  const getRemaining72hText = (targetDateStr?: string | null, createdAtStr?: string | null) => {
    let targetTime: number;
    if (targetDateStr) {
      targetTime = new Date(targetDateStr).getTime();
    } else if (createdAtStr) {
      targetTime = new Date(createdAtStr).getTime() + 72 * 3600 * 1000;
    } else {
      targetTime = Date.now() + 72 * 3600 * 1000;
    }
    const diffMs = targetTime - Date.now();
    if (diffMs <= 0) return 'Ready for auto-recheck';
    const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const days = Math.floor(totalHours / 24);
    const remHours = totalHours % 24;
    if (days > 0) return `${days}d ${remHours}h left`;
    return `${totalHours}h ${mins}m left`;
  };

  return (
    <div className="space-y-6 pb-16">
      
      {/* Header & Control Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 glass-panel p-4 sm:p-6 rounded-3xl">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <span>Tracked Reels</span>
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-500/30">
              {sortedReels.length}
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Real-time statistics & instant Telegram refresh triggers</p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle: Grid vs Analytics */}
          <div className="flex items-center bg-slate-900 border border-slate-800 p-1 rounded-2xl">
            <button
              id="btn-view-reels-grid"
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Reels Grid</span>
            </button>
            <button
              id="btn-view-reels-analytics"
              onClick={() => setViewMode('analytics')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                viewMode === 'analytics'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-purple-300" />
              <span>Analysis</span>
            </button>
          </div>

          {failedCount > 0 && viewMode === 'grid' && (
            <button
              id="btn-retry-failed-reels"
              onClick={onRetryFailed}
              disabled={isRetryingFailed}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold hover:bg-amber-500/30 transition disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRetryingFailed ? 'animate-spin' : ''}`} />
              <span>Retry {failedCount} Failed</span>
            </button>
          )}

          <button
            id="btn-force-refresh-all-dashboard"
            onClick={onRefreshAll}
            disabled={isRefreshingAll}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500/50 text-slate-300 hover:text-white text-xs font-bold shadow-lg transition disabled:opacity-50 cursor-pointer active:scale-95"
            title="Fetch latest stats for all reels in the database"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingAll ? 'animate-spin text-indigo-400' : ''}`} />
            <span>Force Fetch All</span>
          </button>

          <button
            id="btn-add-reel-reels-tab"
            onClick={onOpenAddModal}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/20 transition cursor-pointer"
          >
            <span className="text-base leading-none">+</span>
            <span>Add Reel</span>
          </button>
        </div>
      </div>

      {/* View Mode: Analysis vs Grid */}
      {viewMode === 'analytics' ? (
        <div className="space-y-4">
          <AnalyticsTab reels={reels} />
        </div>
      ) : (
        <>
          {/* Category Filter Tabs Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-slate-900/90 border border-slate-800">
            <div className="flex items-center gap-2 overflow-x-auto">
              <button
                id="btn-cat-filter-all"
                onClick={() => setCategoryFilter('all')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  categoryFilter === 'all'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                <span>All Reels</span>
                <span className="px-1.5 py-0.2 rounded-md bg-black/40 text-[10px] font-mono">{totalCount}</span>
              </button>

              <button
                id="btn-cat-filter-active"
                onClick={() => setCategoryFilter('active')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  categoryFilter === 'active'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                <span>Active Tracked</span>
                <span className="px-1.5 py-0.2 rounded-md bg-black/40 text-[10px] font-mono">{activeCount}</span>
              </button>

              <button
                id="btn-cat-filter-stop-pushing"
                onClick={() => setCategoryFilter('stop_pushing')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  categoryFilter === 'stop_pushing'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-amber-300'
                }`}
              >
                <Ban className="w-3.5 h-3.5 text-amber-400" />
                <span>Stop Pushing</span>
                <span className="px-1.5 py-0.2 rounded-md bg-black/40 text-[10px] font-mono">{stopPushingCount}</span>
              </button>

              <button
                id="btn-cat-filter-archived"
                onClick={() => setCategoryFilter('archived')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  categoryFilter === 'archived'
                    ? 'bg-slate-700 text-white shadow-md'
                    : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                <span>Archived</span>
                <span className="px-1.5 py-0.2 rounded-md bg-black/40 text-[10px] font-mono">{archivedCount}</span>
              </button>

              <button
                id="btn-cat-filter-paid"
                onClick={() => setCategoryFilter('paid')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  categoryFilter === 'paid'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                <span>Paid Out</span>
                <span className="px-1.5 py-0.2 rounded-md bg-black/40 text-[10px] font-mono">{paidCount}</span>
              </button>
            </div>

            {archivedCount > 0 && categoryFilter === 'archived' && (
              <button
                onClick={async () => {
                  try {
                    const token = localStorage.getItem('admin_token');
                    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                    if (token) headers['Authorization'] = `Bearer ${token}`;
                    const res = await fetch('/api/reels/batch-category', {
                      method: 'POST',
                      headers,
                      body: JSON.stringify({ category: 'active' }),
                    });
                    if (res.ok) {
                      onRefreshAll();
                    }
                  } catch (e) {
                    console.error('Failed to unarchive all', e);
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-bold transition cursor-pointer"
                title="Restore all archived reels to active status"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore All to Active</span>
              </button>
            )}
          </div>

          {/* Dedicated Stop Pushing Control Banner */}
          {categoryFilter === 'stop_pushing' && (
            <div className="glass-panel p-5 rounded-3xl border border-amber-500/30 bg-gradient-to-r from-slate-900 via-amber-950/30 to-slate-900 shadow-xl space-y-4">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                    <Ban className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-extrabold text-white">Stop-Pushing Videos Engine</h3>
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-300 rounded border border-amber-500/30">
                        72h+ &lt; 100 Views
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/30">
                        3-Day Auto Schedule Active
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1 max-w-3xl leading-relaxed">
                      Videos added 72+ hours ago with under 100 views are placed in Stop Pushing to conserve API resources.
                      Each video runs its own independent <strong>72-hour recheck cycle</strong> automatically in the background, logs progress, sends Telegram alerts, and <strong>automatically recovers to Active once it reaches 100+ views</strong>.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 flex-wrap w-full md:w-auto">
                  <button
                    onClick={async () => {
                      setIsFetchingStopPushing(true);
                      setStopPushingFeedback(null);
                      try {
                        const token = localStorage.getItem('admin_token');
                        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                        if (token) headers['Authorization'] = `Bearer ${token}`;
                        const res = await fetch('/api/reels/stop-pushing/fetch-all', {
                          method: 'POST',
                          headers,
                        });
                        const data = await res.json();
                        if (data.success) {
                          setStopPushingFeedback(data.message || `Refreshed ${data.total || 0} Stop Pushing reels. ${data.recovered || 0} recovered to Active!`);
                          onRefreshAll();
                        } else {
                          setStopPushingFeedback(data.error || 'Failed to fetch Stop Pushing reels.');
                        }
                      } catch (e: any) {
                        setStopPushingFeedback(e.message || 'Network error during batch fetch.');
                      } finally {
                        setIsFetchingStopPushing(false);
                      }
                    }}
                    disabled={isFetchingStopPushing || stopPushingCount === 0}
                    className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-lg shadow-amber-600/20 transition disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isFetchingStopPushing ? 'animate-spin' : ''}`} />
                    <span>Force Fetch All ({stopPushingCount})</span>
                  </button>
                </div>
              </div>

              {stopPushingFeedback && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{stopPushingFeedback}</span>
                </div>
              )}
            </div>
          )}

          {/* Search, Filter & Sort Controls */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        
        {/* Search Input */}
        <div className="md:col-span-5 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            id="input-reel-search"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by reel name, author, or caption..."
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
          />
        </div>

        {/* Filter Pills */}
        <div className="md:col-span-4 flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {[
            { id: 'all', label: 'All' },
            { id: 'viral', label: '🔥 Viral' },
            { id: 'stalled', label: '⚠️ Stalled' },
            { id: 'success', label: '✅ Success' },
            { id: 'failed', label: '❌ Failed' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilterMode(f.id as any)}
              className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                filterMode === f.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Sort Selector */}
        <div className="md:col-span-3 flex items-center gap-2">
          <ArrowUpDown className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            id="select-reel-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="w-full py-2.5 px-3 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="views">Sort: Highest Views</option>
            <option value="growth">Sort: 24h Growth</option>
            <option value="likes">Sort: Most Likes</option>
            <option value="newest">Sort: Newly Added</option>
          </select>
        </div>
      </div>

      {/* Reels List Grid */}
      {sortedReels.length === 0 ? (
        <div className="glass-panel text-center py-16 p-6 rounded-3xl space-y-3">
          <Video className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="font-bold text-slate-300 text-base">No Reels Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchTerm || filterMode !== 'all'
              ? 'No reels match your search or filter criteria.'
              : 'Start by adding Instagram Reels or send direct links/videos to your Telegram Bot!'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {sortedReels.map((reel) => {
            const isFetching = refreshingReelIds.has(reel.id) || reel.status === 'fetching';
            return (
              <div
                key={reel.id}
                className="glass-panel glass-panel-hover rounded-3xl overflow-hidden flex flex-col justify-between relative group"
              >
                {/* Top Image Preview & Badges */}
                <div className="relative h-48 bg-slate-900 overflow-hidden">
                  <img
                    src={reel.thumbnail}
                    alt={reel.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?auto=format&fit=crop&w=600&q=80';
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />

                  {/* Top Status Indicators */}
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {reel.category === 'stop_pushing' && (
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black shadow-lg flex items-center gap-1">
                          <Ban className="w-3 h-3" />
                          <span>STOP PUSHING</span>
                        </span>
                      )}
                      {reel.category === 'archived' && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/90 text-slate-950 text-[10px] font-extrabold shadow-lg">
                          ARCHIVED 📦
                        </span>
                      )}
                      {reel.category === 'paid' && (
                        <span className="px-2 py-0.5 rounded-full bg-purple-500/90 text-white text-[10px] font-extrabold shadow-lg">
                          PAID 💰
                        </span>
                      )}
                      {reel.isViral && (
                        <span className="px-2 py-0.5 rounded-full bg-rose-500/90 text-white text-[10px] font-extrabold shadow-lg shadow-rose-500/30 border border-rose-400">
                          VIRAL 🔥
                        </span>
                      )}
                      {reel.isStalled && reel.category !== 'stop_pushing' && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/90 text-slate-950 text-[10px] font-extrabold shadow-lg">
                          STALLED ⚠️
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {reel.status === 'success' && (
                        <span className="p-1 rounded-full bg-emerald-500/20 text-emerald-400 backdrop-blur-md" title="Active & Valid">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </span>
                      )}
                      {reel.status === 'failed' && (
                        <span className="p-1 rounded-full bg-rose-500/20 text-rose-400 backdrop-blur-md" title="Fetch Failed">
                          <AlertCircle className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Video Play Button (if Video Attached) */}
                  {reel.videoFileUrl && (
                    <button
                      onClick={() => setActiveVideoModalUrl(reel.videoFileUrl || null)}
                      className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-indigo-600/90 text-white flex items-center justify-center shadow-xl hover:scale-110 transition cursor-pointer"
                    >
                      <Play className="w-5 h-5 ml-0.5 fill-current" />
                    </button>
                  )}

                  {/* Reel Name & Author Badge on Thumbnail */}
                  <div className="absolute bottom-3 left-3 right-3 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-extrabold text-sm text-white truncate drop-shadow-md">
                        {reel.name}
                      </h3>
                      <button
                        onClick={() => {
                          setRenameTargetReel(reel);
                          setManualTitleInput(reel.name);
                          setRenameStatusMsg(null);
                        }}
                        className="text-slate-300 hover:text-white p-1 rounded hover:bg-slate-800/80 cursor-pointer"
                        title="Rename Reel (Manual or Groq AI)"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-300 truncate opacity-90">@{reel.author}</p>
                  </div>
                </div>

                {/* Body Content & Analytics Numbers */}
                <div className="p-4 space-y-4 flex-1 flex flex-col justify-between">
                  <div className="space-y-3">
                    {/* Primary Numbers Grid */}
                    <div className="grid grid-cols-3 gap-2 p-2.5 rounded-2xl bg-slate-900/80 border border-slate-800/80 text-center">
                      <div>
                        <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
                          <Eye className="w-3 h-3 text-indigo-400" />
                          <span>Views</span>
                        </div>
                        <div className="font-black text-sm text-white mt-0.5">
                          {(reel.views || 0).toLocaleString()}
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
                          <Heart className="w-3 h-3 text-rose-400" />
                          <span>Likes</span>
                        </div>
                        <div className="font-black text-sm text-white mt-0.5">
                          {(reel.likes || 0).toLocaleString()}
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
                          <MessageSquare className="w-3 h-3 text-purple-400" />
                          <span>24h Gain</span>
                        </div>
                        <div className="font-black text-sm text-emerald-400 mt-0.5">
                          +{(reel.growth24h || 0).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {/* Error Snippet if Failed */}
                    {reel.status === 'failed' && reel.lastError && (
                      <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[10px] text-rose-300 line-clamp-2">
                        ⚠️ {reel.lastError}
                      </div>
                    )}

                    {/* Stop Pushing 3-Day Schedule & Recovery Progress */}
                    {reel.category === 'stop_pushing' && (
                      <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-2">
                        <div className="flex items-center justify-between font-bold text-amber-300">
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-amber-400" />
                            <span>3-Day Schedule: Cycle #{reel.stopPushingCheckCount || 0}</span>
                          </span>
                          <span className="text-[11px] font-mono text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30">
                            {getRemaining72hText(reel.nextStopPushingCheckAt, reel.stopPushingAt || reel.createdAt)}
                          </span>
                        </div>
                        
                        {/* Recovery progress bar towards 100 views */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-slate-300">
                            <span>Auto-Recovery Goal (100 views):</span>
                            <span className="font-mono text-amber-300 font-bold">{reel.views || 0} / 100 views</span>
                          </div>
                          <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                            <div
                              className="bg-gradient-to-r from-amber-500 to-emerald-400 h-full rounded-full transition-all duration-300"
                              style={{ width: `${Math.min(100, Math.max(3, ((reel.views || 0) / 100) * 100))}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Last Provider Used & Last Updated */}
                    <div className="flex items-center justify-between text-[10px] text-slate-500 px-1">
                      <span>Provider: <strong className="text-slate-400">{reel.lastProviderUsed || 'Pending'}</strong></span>
                      <span>{reel.lastUpdatedAt ? new Date(reel.lastUpdatedAt).toLocaleTimeString() : 'Never Updated'}</span>
                    </div>
                  </div>

                  {/* Card Action Controls */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                    {/* Force Refresh Button */}
                    <button
                      id={`btn-fetch-reel-${reel.id}`}
                      onClick={() => onRefreshReel(reel.id)}
                      disabled={isFetching}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                      <span>{isFetching ? 'Fetching...' : 'Force Refresh'}</span>
                    </button>

                    {/* Instagram External Link */}
                    <a
                      href={reel.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition"
                      title="Open on Instagram"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>

                    {/* Category Actions */}
                    {reel.category === 'archived' ? (
                      <button
                        onClick={() => onChangeCategory && onChangeCategory(reel.id, 'active')}
                        className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:bg-amber-500/30 transition cursor-pointer"
                        title="Restore to Active"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    ) : reel.category === 'paid' ? (
                      <button
                        onClick={() => onChangeCategory && onChangeCategory(reel.id, 'active')}
                        className="p-2 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 transition cursor-pointer"
                        title="Move back to Active"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    ) : reel.category === 'stop_pushing' ? (
                      <>
                        <button
                          onClick={() => onChangeCategory && onChangeCategory(reel.id, 'active')}
                          className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 transition cursor-pointer"
                          title="Restore to Active"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onChangeCategory && onChangeCategory(reel.id, 'archived')}
                          className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-amber-400 hover:border-amber-500/40 transition cursor-pointer"
                          title="Archive Reel"
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        {/* Move to Stop Pushing */}
                        <button
                          onClick={() => onChangeCategory && onChangeCategory(reel.id, 'stop_pushing')}
                          className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-amber-400 hover:border-amber-500/40 transition cursor-pointer"
                          title="Move to Stop Pushing"
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                        {/* Archive Reel */}
                        <button
                          onClick={() => onChangeCategory && onChangeCategory(reel.id, 'archived')}
                          className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-amber-400 hover:border-amber-500/40 transition cursor-pointer"
                          title="Archive Reel"
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                        {/* Mark as Paid */}
                        <button
                          onClick={() => onChangeCategory && onChangeCategory(reel.id, 'paid')}
                          className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/40 transition cursor-pointer"
                          title="Mark as Paid"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    
                    {/* Delete Reel */}
                    <button
                      onClick={() => onDeleteReel(reel.id)}
                      className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-500/40 transition cursor-pointer"
                      title="Delete Reel"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
        </>
      )}

      {/* Video Modal Player */}
      {activeVideoModalUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4">
          <div className="relative w-full max-w-lg glass-panel p-4 rounded-3xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white text-sm">Video Preview</h3>
              <button
                onClick={() => setActiveVideoModalUrl(null)}
                className="text-slate-400 hover:text-white font-bold p-1"
              >
                ✕
              </button>
            </div>
            <video src={activeVideoModalUrl} controls autoPlay className="w-full rounded-2xl max-h-[70vh] object-contain bg-black" />
          </div>
        </div>
      )}

      {/* Dual-Option Rename Modal (Manual & Groq AI) */}
      {renameTargetReel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
          <div className="relative w-full max-w-lg glass-panel p-6 rounded-3xl space-y-6 border border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="font-extrabold text-white text-base flex items-center gap-2">
                  <Edit2 className="w-4 h-4 text-amber-400" />
                  <span>Rename Reel Title</span>
                </h3>
                <p className="text-xs text-slate-400">Manual Rename or 🤖 Groq AI Auto-Rename from Caption</p>
              </div>
              <button
                onClick={() => setRenameTargetReel(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {renameStatusMsg && (
              <div className={`p-3.5 rounded-2xl text-xs font-semibold border flex items-center gap-2 ${
                renameStatusMsg.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              }`}>
                {renameStatusMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{renameStatusMsg.text}</span>
              </div>
            )}

            {/* Option 1: Manual Rename */}
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <span>1. Manual Custom Title</span>
              </label>
              <input
                id="input-manual-rename"
                type="text"
                value={manualTitleInput}
                onChange={(e) => setManualTitleInput(e.target.value)}
                placeholder="Enter custom reel title..."
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              />
              <div className="flex justify-end">
                <button
                  id="btn-save-manual-rename"
                  onClick={async () => {
                    if (!manualTitleInput.trim()) return;
                    await onEditReelName(renameTargetReel.id, manualTitleInput.trim());
                    setRenameStatusMsg({ type: 'success', text: `Title updated to "${manualTitleInput.trim()}"!` });
                    setTimeout(() => setRenameTargetReel(null), 800);
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  Save Custom Title
                </button>
              </div>
            </div>

            {/* Option 2: Groq AI Auto-Rename */}
            <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-indigo-300 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  <span>2. Groq AI Auto-Rename (Uses Caption)</span>
                </label>
                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-mono px-2 py-0.5 rounded-full border border-indigo-500/30">
                  Max 2 Words
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Groq LLM inspects the Instagram reel caption and generates a punchy, viral 2-word title automatically.
              </p>
              {renameTargetReel.caption && (
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-[10px] text-slate-400 line-clamp-2 italic">
                  "{renameTargetReel.caption}"
                </div>
              )}
              <button
                id="btn-trigger-groq-rename"
                onClick={async () => {
                  if (!onGroqRenameReel) return;
                  setIsGeneratingGroqTitle(true);
                  setRenameStatusMsg(null);
                  try {
                    const newTitle = await onGroqRenameReel(renameTargetReel.id);
                    setManualTitleInput(newTitle);
                    setRenameStatusMsg({ type: 'success', text: `✨ Groq AI generated title: "${newTitle}"!` });
                    setTimeout(() => setRenameTargetReel(null), 1200);
                  } catch (err: any) {
                    setRenameStatusMsg({ type: 'error', text: err.message || 'Groq AI title generation failed.' });
                  } finally {
                    setIsGeneratingGroqTitle(false);
                  }
                }}
                disabled={isGeneratingGroqTitle}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-extrabold rounded-xl text-xs shadow-lg shadow-indigo-500/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className={`w-4 h-4 ${isGeneratingGroqTitle ? 'animate-spin' : ''}`} />
                <span>{isGeneratingGroqTitle ? 'Generating Groq AI Title...' : '🤖 Generate Groq AI Title'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
