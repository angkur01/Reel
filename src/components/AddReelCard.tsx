import React, { useState } from 'react';
import { PlusCircle, Link as LinkIcon, Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';

interface AddReelCardProps {
  onAddReel: (url: string, customName?: string) => Promise<{ success: boolean; error?: string }>;
}

export const AddReelCard: React.FC<AddReelCardProps> = ({ onAddReel }) => {
  const [url, setUrl] = useState('');
  const [customName, setCustomName] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    if (!url.includes('instagram.com')) {
      setStatusMessage({ type: 'error', text: 'Please enter a valid Instagram URL (e.g. https://www.instagram.com/reel/...)' });
      return;
    }

    setLoading(true);
    setStatusMessage(null);

    const res = await onAddReel(url.trim(), customName.trim());
    setLoading(false);

    if (res.success) {
      setUrl('');
      setCustomName('');
      setStatusMessage({ type: 'success', text: 'Reel added and statistics fetched successfully!' });
      setTimeout(() => setStatusMessage(null), 4000);
    } else {
      // Useful real error response displayed directly in dashboard
      setStatusMessage({ type: 'error', text: res.error || 'Failed to fetch Reel data from API providers.' });
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden mb-8">
      
      {/* Visual Header */}
      <div className="flex items-center space-x-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
          <PlusCircle className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-100">Add New Instagram Reel</h2>
          <p className="text-xs text-slate-400">Paste URL to fetch stats instantly & track automatically</p>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`mb-4 p-3.5 rounded-2xl text-xs flex items-start gap-2.5 border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
          )}
          <div className="flex-1 whitespace-pre-wrap leading-relaxed">{statusMessage.text}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          
          {/* URL Input */}
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
              <LinkIcon className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.instagram.com/reel/Db6jlRLFM5X/..."
              className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/40 focus:border-rose-500 transition-all"
              required
            />
          </div>

          {/* Optional Custom Name Input */}
          <div className="sm:w-1/3">
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Custom Name (Optional)"
              className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/40 focus:border-rose-500 transition-all"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-rose-500 to-purple-600 hover:from-rose-600 hover:to-purple-700 text-white font-semibold rounded-2xl shadow-lg shadow-rose-500/20 flex items-center justify-center space-x-2 transition-all active:scale-[0.98] disabled:opacity-50 shrink-0"
          >
            {loading ? (
              <span className="flex items-center space-x-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span className="text-sm">Fetching...</span>
              </span>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span className="text-sm">Fetch Reel</span>
              </>
            )}
          </button>

        </div>
      </form>
    </div>
  );
};
