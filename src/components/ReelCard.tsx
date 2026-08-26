import React, { useState } from 'react';
import { Reel } from '../types';
import { Eye, Heart, MessageCircle, Share2, RefreshCw, Edit2, Trash2, ExternalLink, CheckCircle, AlertTriangle, Clock, User, Check, X, DollarSign } from 'lucide-react';

interface ReelCardProps {
  reel: Reel;
  onRefresh: (id: string) => Promise<void>;
  onEditName: (id: string, newName: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export const ReelCard: React.FC<ReelCardProps> = ({ reel, onRefresh, onEditName, onDelete }) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(reel.name);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const handleRefreshClick = async () => {
    setIsRefreshing(true);
    await onRefresh(reel.id);
    setIsRefreshing(false);
  };

  const handleSaveName = async () => {
    if (editName.trim() && editName.trim() !== reel.name) {
      await onEditName(reel.id, editName.trim());
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditName(reel.name);
    setIsEditing(false);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-3xl p-4 sm:p-5 transition-all shadow-lg hover:shadow-xl hover:shadow-slate-950/40 flex flex-col justify-between relative group">
      
      <div>
        {/* Top Header Row: Name & Status Badge */}
        <div className="flex items-start justify-between gap-3 mb-3">
          
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="px-2.5 py-1 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-rose-500 w-full"
                  autoFocus
                />
                <button
                  onClick={handleSaveName}
                  className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-slate-100 truncate group-hover:text-rose-400 transition-colors">
                  {reel.name}
                </h3>
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-slate-500 hover:text-slate-300 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Edit Reel Name"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            
            <div className="flex items-center flex-wrap gap-2 text-xs text-slate-400 mt-0.5">
              <span className="flex items-center gap-1">
                <User className="w-3 h-3 text-slate-500" />
                <span>@{reel.author || 'instagram'}</span>
              </span>
              {reel.discoveredFromAccount && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md bg-pink-500/10 text-pink-300 border border-pink-500/20 text-[10px] font-medium">
                  via @{reel.discoveredFromAccount}
                </span>
              )}
              <span>•</span>
              <a
                href={reel.url}
                target="_blank"
                rel="noreferrer"
                className="text-rose-400 hover:underline flex items-center gap-0.5 truncate max-w-[140px]"
              >
                <span>View Reel</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Status Badge */}
          <div className="shrink-0">
            {reel.status === 'fetching' || isRefreshing ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20 animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Fetching
              </span>
            ) : reel.status === 'success' ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle className="w-3 h-3" />
                Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20" title={reel.lastError || ''}>
                <AlertTriangle className="w-3 h-3" />
                Failed
              </span>
            )}
          </div>

        </div>

        {/* Thumbnail & Caption Block */}
        <div className="flex gap-3.5 mb-4">
          <div className="relative w-20 h-28 rounded-2xl bg-slate-950 overflow-hidden shrink-0 border border-slate-800">
            <img
              src={reel.thumbnail}
              alt={reel.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                // Fallback image on broken URL
                (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?auto=format&fit=crop&w=600&q=80';
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent"></div>
          </div>

          <div className="flex-1 flex flex-col justify-between min-w-0">
            <p className="text-xs text-slate-300 line-clamp-3 leading-relaxed bg-slate-950/40 p-2.5 rounded-2xl border border-slate-800/60">
              "{reel.caption || 'No caption available'}"
            </p>

            {/* Timestamps */}
            <div className="mt-2 text-[11px] text-slate-400 space-y-0.5">
              <div className="flex items-center justify-between">
                <span>Last Updated:</span>
                <span className="font-mono text-slate-300">
                  {reel.lastUpdatedAt
                    ? new Date(reel.lastUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : 'Never'}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span className="flex items-center gap-1 text-amber-400/90">
                  <Clock className="w-3 h-3" />
                  Next Auto:
                </span>
                <span className="font-mono text-amber-400">
                  {new Date(reel.nextScheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Stat Counter Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 bg-slate-950/60 p-3 rounded-2xl border border-slate-800">
          
          <div className="flex flex-col items-center justify-center p-1.5 bg-slate-900/60 rounded-xl border border-slate-800/50">
            <div className="flex items-center gap-1 text-[11px] text-sky-400 font-medium mb-0.5">
              <Eye className="w-3.5 h-3.5" />
              <span>Views</span>
            </div>
            <span className="text-base font-extrabold text-white font-mono">
              {reel.views.toLocaleString()}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center p-1.5 bg-slate-900/60 rounded-xl border border-slate-800/50">
            <div className="flex items-center gap-1 text-[11px] text-rose-400 font-medium mb-0.5">
              <Heart className="w-3.5 h-3.5" />
              <span>Likes</span>
            </div>
            <span className="text-base font-extrabold text-white font-mono">
              {reel.likes.toLocaleString()}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center p-1.5 bg-slate-900/60 rounded-xl border border-slate-800/50">
            <div className="flex items-center gap-1 text-[11px] text-amber-400 font-medium mb-0.5">
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Comments</span>
            </div>
            <span className="text-sm font-bold text-slate-200 font-mono">
              {reel.comments.toLocaleString()}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center p-1.5 bg-slate-900/60 rounded-xl border border-slate-800/50">
            <div className="flex items-center gap-1 text-[11px] text-purple-400 font-medium mb-0.5">
              <Share2 className="w-3.5 h-3.5" />
              <span>Shares</span>
            </div>
            <span className="text-sm font-bold text-slate-200 font-mono">
              {reel.shares.toLocaleString()}
            </span>
          </div>

        </div>

        {/* CPM Campaign Payout Banner */}
        {reel.campaignName && (
          <div className="mb-3 p-2.5 rounded-2xl bg-gradient-to-r from-slate-950 via-emerald-950/40 to-slate-950 border border-emerald-500/30 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <span className="font-bold text-emerald-300 block leading-tight">{reel.campaignName}</span>
                <span className="text-[10px] text-slate-400 font-mono">${reel.cpmRate || 0}/1k CPM</span>
              </div>
            </div>
            <div className="text-right">
              <span className="font-extrabold text-white text-xs block">${(reel.estimatedPayout || 0).toFixed(2)} payout</span>
              <span className="text-[10px] text-slate-400 block">Earnings: ${(reel.cpmEarnings || 0).toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Error Callout if Failed */}
        {reel.status === 'failed' && reel.lastError && (
          <div className="mb-3 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span className="line-clamp-2">{reel.lastError}</span>
          </div>
        )}

      </div>

      {/* Action Footer Buttons */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
        
        {/* Force Refresh Button */}
        <button
          onClick={handleRefreshClick}
          disabled={isRefreshing || reel.status === 'fetching'}
          className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>Force Refresh</span>
        </button>

        {/* Delete button or confirm */}
        {showConfirmDelete ? (
          <div className="flex items-center space-x-1 shrink-0">
            <button
              onClick={() => onDelete(reel.id)}
              className="py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all"
            >
              Confirm
            </button>
            <button
              onClick={() => setShowConfirmDelete(false)}
              className="py-2 px-2.5 bg-slate-800 text-slate-400 hover:text-white rounded-xl text-xs"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowConfirmDelete(true)}
            className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all shrink-0"
            title="Delete Reel"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}

      </div>

    </div>
  );
};
