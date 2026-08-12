import React, { useState } from 'react';
import { Search, Filter, RefreshCw, Trash2, Edit2, ExternalLink, Play, Eye, Heart, MessageSquare, Flame, AlertCircle, CheckCircle2, Video, ArrowUpDown, Sparkles } from 'lucide-react';
import { Reel } from '../types';

interface ReelsTabProps {
  reels: Reel[];
  onRefreshReel: (id: string) => void;
  onEditReelName: (id: string, currentName: string) => void;
  onDeleteReel: (id: string) => void;
  onOpenAddModal: () => void;
  onRetryFailed: () => void;
  isRetryingFailed: boolean;
  refreshingReelIds: Set<string>;
  onRefreshAll: () => void;
  isRefreshingAll: boolean;
}

export const ReelsTab: React.FC<ReelsTabProps> = ({
  reels,
  onRefreshReel,
  onEditReelName,
  onDeleteReel,
  onOpenAddModal,
  onRetryFailed,
  isRetryingFailed,
  refreshingReelIds,
  onRefreshAll,
  isRefreshingAll,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'viral' | 'stalled' | 'failed' | 'success'>('all');
  const [sortBy, setSortBy] = useState<'views' | 'growth' | 'likes' | 'newest'>('views');
  const [activeVideoModalUrl, setActiveVideoModalUrl] = useState<string | null>(null);

  // Filter logic
  const filteredReels = reels.filter((r) => {
    const matchesSearch =
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.caption.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.author.toLowerCase().includes(searchTerm.toLowerCase());

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
          {failedCount > 0 && (
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
                    <div className="flex items-center gap-1.5">
                      {reel.isViral && (
                        <span className="px-2 py-0.5 rounded-full bg-rose-500/90 text-white text-[10px] font-extrabold shadow-lg shadow-rose-500/30 border border-rose-400">
                          VIRAL 🔥
                        </span>
                      )}
                      {reel.isStalled && (
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
                        onClick={() => onEditReelName(reel.id, reel.name)}
                        className="text-slate-300 hover:text-white p-1 rounded hover:bg-slate-800/80 cursor-pointer"
                        title="Edit Custom Name"
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

    </div>
  );
};
