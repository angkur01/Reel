import React, { useState } from 'react';
import { X, Film, Link as LinkIcon, Sparkles, DollarSign } from 'lucide-react';
import { CpmCampaign } from '../types';

interface AddReelModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaigns?: CpmCampaign[];
  onAddReel: (url: string, name?: string, campaignId?: string) => Promise<{ success: boolean; error?: string }>;
}

export const AddReelModal: React.FC<AddReelModalProps> = ({
  isOpen,
  onClose,
  campaigns = [],
  onAddReel,
}) => {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setIsLoading(true);
    setErrorMsg(null);

    const res = await onAddReel(url, name, selectedCampaignId || undefined);
    setIsLoading(false);

    if (res.success) {
      setUrl('');
      setName('');
      setSelectedCampaignId('');
      onClose();
    } else {
      setErrorMsg(res.error || 'Failed to add Reel.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md glass-panel border border-slate-800 rounded-3xl p-6 space-y-5 relative shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400">
              <Film className="w-5 h-5" />
            </div>
            <h3 className="font-extrabold text-white text-base">Add Instagram Reel</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-xl hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
              ⚠️ {errorMsg}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <LinkIcon className="w-3.5 h-3.5 text-indigo-400" />
              <span>Instagram Reel Link *</span>
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.instagram.com/reel/..."
              className="w-full px-4 py-2.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300">
              Custom Name (Optional)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Want to know AXE"
              className="w-full px-4 py-2.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <p className="text-[10px] text-slate-500">
              If left blank, auto-titles using caption words.
            </p>
          </div>

          {/* Campaign Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              <span>Which campaign?</span>
            </label>
            <select
              value={selectedCampaignId}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="">None / Default</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (${c.cpm.toFixed(2)}/1k CPM - Min {c.minViews.toLocaleString()} views)
                </option>
              ))}
            </select>
            <p className="text-[10px] text-slate-500">
              Connect this Reel permanently to a CPM Campaign for earnings tracking.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white text-xs font-bold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !url.trim()}
              className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs shadow-lg transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              {isLoading ? (
                <>
                  <Sparkles className="w-3.5 h-3.5 animate-spin" />
                  <span>Fetching Data...</span>
                </>
              ) : (
                <span>Add & Fetch Reel</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
