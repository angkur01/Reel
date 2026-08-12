import React, { useState } from 'react';
import { Reel } from '../types';
import { ReelCard } from './ReelCard';
import { Search, Eye, Heart, Video, Sparkles } from 'lucide-react';

interface ReelsListProps {
  reels: Reel[];
  onRefresh: (id: string) => Promise<void>;
  onEditName: (id: string, newName: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export const ReelsList: React.FC<ReelsListProps> = ({ reels, onRefresh, onEditName, onDelete }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredReels = reels.filter((reel) => {
    const q = searchQuery.toLowerCase();
    return (
      reel.name.toLowerCase().includes(q) ||
      reel.caption.toLowerCase().includes(q) ||
      reel.author.toLowerCase().includes(q)
    );
  });

  const totalViews = reels.reduce((acc, r) => acc + (r.views || 0), 0);
  const totalLikes = reels.reduce((acc, r) => acc + (r.likes || 0), 0);

  return (
    <div className="space-y-6">
      
      {/* Overview Stat Cards Bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3.5 sm:p-4 flex flex-col items-center justify-center text-center">
          <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-400 mb-1">
            <Video className="w-4 h-4 text-purple-400" />
            <span>Tracked Reels</span>
          </div>
          <span className="text-xl sm:text-2xl font-black text-white font-mono">{reels.length}</span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3.5 sm:p-4 flex flex-col items-center justify-center text-center">
          <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-400 mb-1">
            <Eye className="w-4 h-4 text-sky-400" />
            <span>Total Views</span>
          </div>
          <span className="text-xl sm:text-2xl font-black text-sky-400 font-mono">{totalViews.toLocaleString()}</span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3.5 sm:p-4 flex flex-col items-center justify-center text-center">
          <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-400 mb-1">
            <Heart className="w-4 h-4 text-rose-400" />
            <span>Total Likes</span>
          </div>
          <span className="text-xl sm:text-2xl font-black text-rose-400 font-mono">{totalLikes.toLocaleString()}</span>
        </div>
      </div>

      {/* Filter / Search Bar */}
      {reels.length > 0 && (
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search saved reels by name, caption, author..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-2xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 transition-all"
          />
        </div>
      )}

      {/* Grid of Reel Cards */}
      {filteredReels.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredReels.map((reel) => (
            <ReelCard
              key={reel.id}
              reel={reel}
              onRefresh={onRefresh}
              onEditName={onEditName}
              onDelete={onDelete}
            />
          ))}
        </div>
      ) : reels.length > 0 ? (
        <div className="text-center py-12 bg-slate-900/50 rounded-3xl border border-slate-800 p-6">
          <p className="text-sm text-slate-400">No reels found matching "{searchQuery}".</p>
        </div>
      ) : (
        <div className="text-center py-16 bg-slate-900/30 border border-dashed border-slate-800 rounded-3xl p-8">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto text-rose-400 mb-3">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-200">No Instagram Reels Saved Yet</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Paste any Instagram Reel URL above to fetch statistics instantly and start automatic tracking!
          </p>
        </div>
      )}

    </div>
  );
};
