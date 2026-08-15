import React, { useState, useEffect } from 'react';
import { DollarSign, Plus, Edit2, Trash2, CheckCircle2, AlertCircle, Layers, TrendingUp, ShieldAlert, Sparkles, Zap, RefreshCw } from 'lucide-react';
import { CpmCampaign, Reel, SystemStats } from '../types';

interface CpmCampaignsTabProps {
  campaigns: CpmCampaign[];
  reels: Reel[];
  stats: SystemStats | null;
  onCreateCampaign: (campaign: Omit<CpmCampaign, 'id' | 'createdAt'>) => Promise<void>;
  onUpdateCampaign: (id: string, campaign: Partial<CpmCampaign>) => Promise<void>;
  onDeleteCampaign: (id: string) => Promise<void>;
  onEditReelCampaign: (reelId: string, campaignId: string | null) => Promise<void>;
  onChangeCategory?: (id: string, category: 'active' | 'archived' | 'paid') => Promise<void>;
  onSaveGlobalSettings?: (settings: { globalFeePercent?: number; scheduleIntervalHours?: number }) => Promise<void>;
}

export const CpmCampaignsTab: React.FC<CpmCampaignsTabProps> = ({
  campaigns,
  reels,
  stats,
  onCreateCampaign,
  onUpdateCampaign,
  onDeleteCampaign,
  onEditReelCampaign,
  onSaveGlobalSettings,
  onChangeCategory,
}) => {
  const [subTab, setSubTab] = useState<'campaigns' | 'paid'>('campaigns');

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<CpmCampaign | null>(null);

  // Global Settings state
  const [feeInputValue, setFeeInputValue] = useState(stats?.globalFeePercent?.toString() || '3');
  const [isSavingFee, setIsSavingFee] = useState(false);
  const [isSavingInterval, setIsSavingInterval] = useState(false);

  useEffect(() => {
    if (stats?.globalFeePercent !== undefined) {
      setFeeInputValue(stats.globalFeePercent.toString());
    }
  }, [stats?.globalFeePercent]);

  const handleSaveFee = async () => {
    if (!onSaveGlobalSettings) return;
    const val = parseFloat(feeInputValue);
    if (isNaN(val) || val < 0) return;
    setIsSavingFee(true);
    try {
      await onSaveGlobalSettings({ globalFeePercent: val });
    } catch (e) {}
    setIsSavingFee(false);
  };

  const handleQuickFee = async (val: number) => {
    if (!onSaveGlobalSettings) return;
    setIsSavingFee(true);
    try {
      await onSaveGlobalSettings({ globalFeePercent: val });
    } catch (e) {}
    setIsSavingFee(false);
  };

  const handleSaveInterval = async (interval: number) => {
    if (!onSaveGlobalSettings) return;
    setIsSavingInterval(true);
    try {
      await onSaveGlobalSettings({ scheduleIntervalHours: interval });
    } catch (e) {}
    setIsSavingInterval(false);
  };

  // Form State
  const [name, setName] = useState('');
  const [cpm, setCpm] = useState('0.50');
  const [minViews, setMinViews] = useState('10000');
  const [maxViews, setMaxViews] = useState('400000');
  const [enabled, setEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openCreateModal = () => {
    setEditingCampaign(null);
    setName('');
    setCpm('0.50');
    setMinViews('10000');
    setMaxViews('400000');
    setEnabled(true);
    setError(null);
    setIsCreateModalOpen(true);
  };

  const openEditModal = (c: CpmCampaign) => {
    setEditingCampaign(c);
    setName(c.name);
    setCpm(c.cpm.toString());
    setMinViews(c.minViews.toString());
    setMaxViews(c.maxViews.toString());
    setEnabled(c.enabled);
    setError(null);
    setIsCreateModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Campaign Name is required');
      return;
    }

    const parsedCpm = parseFloat(cpm);
    const parsedMin = parseInt(minViews, 10);
    const parsedMax = parseInt(maxViews, 10);

    if (isNaN(parsedCpm) || parsedCpm < 0) {
      setError('Please enter a valid non-negative CPM rate');
      return;
    }
    if (isNaN(parsedMin) || parsedMin < 0) {
      setError('Please enter a valid Minimum Views threshold');
      return;
    }
    if (isNaN(parsedMax) || parsedMax < 0) {
      setError('Please enter a valid Maximum Views cap');
      return;
    }
    if (parsedMax > 0 && parsedMax < parsedMin) {
      setError('Maximum Views must be greater than or equal to Minimum Views');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (editingCampaign) {
        await onUpdateCampaign(editingCampaign.id, {
          name: name.trim(),
          cpm: parsedCpm,
          minViews: parsedMin,
          maxViews: parsedMax,
          enabled,
        });
      } else {
        await onCreateCampaign({
          name: name.trim(),
          cpm: parsedCpm,
          minViews: parsedMin,
          maxViews: parsedMax,
          enabled,
        });
      }
      setIsCreateModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save campaign');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete campaign "${name}"? Connected Reels will be unlinked.`)) {
      try {
        await onDeleteCampaign(id);
      } catch (err: any) {
        alert(err.message || 'Failed to delete campaign');
      }
    }
  };

  const activeReels = reels.filter(r => r.category !== 'archived' && r.category !== 'paid');
  const paidReels = reels.filter(r => r.category === 'paid');
  const totalCpmEarnings = activeReels.reduce((sum, r) => sum + (r.cpmEarnings || 0), 0);
  const totalFees = activeReels.reduce((sum, r) => sum + (r.fee3Percent || 0), 0);
  const totalPayout = activeReels.reduce((sum, r) => sum + (r.estimatedPayout || 0), 0);
  const campaignConnectedReelsCount = reels.filter(r => r.campaignId).length;

  return (
    <div className="space-y-8 pb-12">

      <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl w-fit border border-slate-800">
        <button
          onClick={() => setSubTab('campaigns')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            subTab === 'campaigns'
              ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          Active Campaigns
        </button>
        <button
          onClick={() => setSubTab('paid')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            subTab === 'paid'
              ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          Paid Reels
        </button>
      </div>
      
      {subTab === 'paid' && (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 bg-emerald-500/10 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-bold text-white">Paid Reels History</h3>
              <p className="text-xs text-slate-400">Reels that have been marked as paid are hidden from active totals.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-400 bg-slate-900/50 border-b border-slate-800 uppercase font-bold">
                <tr>
                  <th className="px-4 py-3">Reel Name</th>
                  <th className="px-4 py-3">Campaign</th>
                  <th className="px-4 py-3 text-right">Views</th>
                  <th className="px-4 py-3 text-right">CPM Earnings</th>
                  <th className="px-4 py-3 text-right">Fee (8%)</th>
                  <th className="px-4 py-3 text-right">Payout</th>
                  <th className="px-4 py-3 text-right">Paid Date</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {paidReels.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      No reels have been marked as paid yet.
                    </td>
                  </tr>
                ) : (
                  paidReels.map(reel => (
                    <tr key={reel.id} className="hover:bg-slate-900/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-white">{reel.name}</td>
                      <td className="px-4 py-3 text-indigo-400">{reel.campaignName || '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-300">{(reel.views || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-emerald-400 font-medium">${(reel.cpmEarnings || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-amber-400">-${(reel.fee3Percent || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-white font-bold">${(reel.estimatedPayout || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-slate-400 text-xs">{reel.paidAt ? new Date(reel.paidAt).toLocaleDateString() : 'Unknown'}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => onChangeCategory && onChangeCategory(reel.id, 'active')}
                          className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition-colors"
                        >
                          Unmark Paid
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {subTab === 'campaigns' && (
        <div className="space-y-8">

{/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950/90 to-emerald-950/80 border border-indigo-500/30 p-6 sm:p-8 shadow-2xl">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-500/30">
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              <span>CPM Earnings & Payout Management</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              CPM Campaigns & Payout Engine
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Create CPM campaigns with custom rates ($/1,000 views), minimum eligibility thresholds, and maximum view caps.
              Payouts automatically calculate net earnings with an instant 8% processing fee deduction.
            </p>
          </div>

          <button
            id="btn-create-cpm-campaign"
            onClick={openCreateModal}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 transition active:scale-95 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create CPM Campaign</span>
          </button>
        </div>
      </div>

      {/* Financial Metrics Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total CPM Earnings */}
        <div className="glass-panel p-5 rounded-2xl border border-emerald-500/20 bg-slate-900/60">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Total CPM Earnings</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 tracking-tight">
            ${totalCpmEarnings.toFixed(2)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Gross CPM payout before fees</p>
        </div>

        {/* Metric 2: Fixed Platform Fee Deduction */}
        <div className="glass-panel p-5 rounded-2xl border border-amber-500/20 bg-slate-900/60">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>8% Platform Fee</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-amber-400 tracking-tight">
            -${totalFees.toFixed(2)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Automatic 8% global fee deduction</p>
        </div>

        {/* Metric 3: Net Estimated Payout */}
        <div className="glass-panel p-5 rounded-2xl border border-indigo-500/30 bg-indigo-950/30">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Estimated Payout</span>
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            ${totalPayout.toFixed(2)}
          </div>
          <p className="text-[11px] text-indigo-300 mt-1">Net payable earnings to creator</p>
        </div>

        {/* Metric 4: Active Campaigns */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-slate-900/60">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Active Campaigns</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            {campaigns.filter(c => c.enabled).length} <span className="text-xs text-slate-500 font-normal">/ {campaigns.length} total</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">{campaignConnectedReelsCount} Reels connected</p>
        </div>
      </div>

      {/* Scheduler Gap Adjustment Panel */}
      <div className="glass-panel rounded-3xl p-6 border border-amber-500/20 bg-slate-900/80 space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-base font-extrabold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              <span>Platform Fee & Auto-Refresh Interval Controls</span>
            </h3>
            <p className="text-xs text-slate-400">
              Platform fee is fixed at 8%. Adjust the automatic scheduler gap (1h, 2h, 4h, 6h, 12h) below.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Global Fee % Display */}
          <div className="space-y-3 bg-slate-950/80 p-4 rounded-2xl border border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <span>Platform Fee Percentage (%):</span>
              </span>
              <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                Fixed 8% Fee Active
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Standard 8% global processing fee automatically deducted from all CPM earnings.
            </p>
          </div>

          {/* Schedule Interval Section */}
          <div className="space-y-3 bg-slate-950/80 p-4 rounded-2xl border border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4 text-indigo-400" />
                <span>Auto-Fetch Scheduler Interval:</span>
              </span>
              <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                Every {stats?.scheduleIntervalHours ?? 6} Hours
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {[1, 2, 4, 6, 12].map((gap) => (
                <button
                  key={gap}
                  type="button"
                  onClick={() => handleSaveInterval(gap)}
                  disabled={isSavingInterval}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
                    (stats?.scheduleIntervalHours ?? 6) === gap
                      ? 'bg-indigo-600 text-white border-indigo-400 font-extrabold shadow-md shadow-indigo-500/20'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {gap}h Gap
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Campaigns Management Section */}
      <div className="glass-panel rounded-3xl p-6 border border-slate-800">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-400" />
              <span>CPM Campaign Configurations</span>
            </h3>
            <p className="text-xs text-slate-400">Manage campaign details, rates, and view threshold limits</p>
          </div>
        </div>

        {campaigns.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-800 rounded-2xl">
            <DollarSign className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <h4 className="text-slate-300 font-semibold mb-1">No CPM Campaigns Created Yet</h4>
            <p className="text-xs text-slate-500 mb-4 max-w-md mx-auto">
              Create your first campaign (e.g. "AXE Australia") to start calculating CPM earnings and automated payouts for your Reels.
            </p>
            <button
              onClick={openCreateModal}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-500 transition cursor-pointer"
            >
              + Create Campaign
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {campaigns.map((c) => {
              const connectedReels = reels.filter(r => r.campaignId === c.id);
              const campaignEarnings = connectedReels.reduce((sum, r) => sum + (r.cpmEarnings || 0), 0);
              const campaignPayout = connectedReels.reduce((sum, r) => sum + (r.estimatedPayout || 0), 0);

              return (
                <div
                  key={c.id}
                  className={`p-5 rounded-2xl border transition ${
                    c.enabled
                      ? 'bg-slate-900/80 border-slate-800 hover:border-indigo-500/40'
                      : 'bg-slate-950/60 border-slate-900 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase mb-1.5 ${
                        c.enabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {c.enabled ? 'Active' : 'Disabled'}
                      </span>
                      <h4 className="text-base font-bold text-white leading-tight">{c.name}</h4>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openEditModal(c)}
                        className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition cursor-pointer"
                        title="Edit Campaign"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(c.id, c.name)}
                        className="p-1.5 rounded-lg bg-slate-800 text-rose-400 hover:text-rose-300 hover:bg-rose-950/50 transition cursor-pointer"
                        title="Delete Campaign"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs py-3 border-y border-slate-800/80">
                    <div className="flex justify-between text-slate-300">
                      <span className="text-slate-400">CPM Rate:</span>
                      <span className="font-bold text-emerald-400">${c.cpm.toFixed(2)} / 1k views</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span className="text-slate-400">Min Views Required:</span>
                      <span className="font-semibold">{c.minViews.toLocaleString()} views</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span className="text-slate-400">Max Views Capped:</span>
                      <span className="font-semibold">{c.maxViews > 0 ? `${c.maxViews.toLocaleString()} views` : 'Unlimited'}</span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs pt-1">
                    <span className="text-slate-400">{connectedReels.length} Reel(s) linked</span>
                    <div className="text-right">
                      <div className="text-emerald-400 font-bold">${campaignPayout.toFixed(2)} payout</div>
                      <div className="text-[10px] text-slate-500">Gross: ${campaignEarnings.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Connected Reels CPM Breakdown Table */}
      <div className="glass-panel rounded-3xl p-6 border border-slate-800">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-400" />
              <span>Reel Campaign & Payout Breakdown</span>
            </h3>
            <p className="text-xs text-slate-400">Live view counts, eligible views, CPM earnings, 8% fees, and net payouts</p>
          </div>
        </div>

        {reels.length === 0 ? (
          <p className="text-center text-slate-500 text-xs py-8">No Reels added yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/90 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                <tr>
                  <th className="p-3">Reel</th>
                  <th className="p-3">Connected Campaign</th>
                  <th className="p-3 text-right">Total Views</th>
                  <th className="p-3 text-right">Eligible Views</th>
                  <th className="p-3 text-right">CPM Rate</th>
                  <th className="p-3 text-right">CPM Earnings</th>
                  <th className="p-3 text-right">8% Fee</th>
                  <th className="p-3 text-right">Estimated Payout</th>
                  <th className="p-3 text-center">Eligibility Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {reels.map((reel) => {
                  const connectedCampaign = campaigns.find(c => c.id === reel.campaignId);

                  return (
                    <tr key={reel.id} className="hover:bg-slate-900/50 transition">
                      {/* Reel Info */}
                      <td className="p-3 max-w-[200px]">
                        <div className="font-bold text-white truncate">{reel.name}</div>
                        <a
                          href={reel.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-indigo-400 hover:underline truncate block"
                        >
                          View Reel
                        </a>
                      </td>

                      {/* Connected Campaign Dropdown / Selector */}
                      <td className="p-3 min-w-[160px]">
                        <select
                          value={reel.campaignId || ''}
                          onChange={(e) => onEditReelCampaign(reel.id, e.target.value || null)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none cursor-pointer"
                        >
                          <option value="">No Campaign</option>
                          {campaigns.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} (${c.cpm}/1k)
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Total Views */}
                      <td className="p-3 text-right font-bold text-slate-200">
                        {reel.views.toLocaleString()}
                      </td>

                      {/* Eligible Views */}
                      <td className="p-3 text-right font-semibold text-slate-300">
                        {(reel.eligibleViews || 0).toLocaleString()}
                      </td>

                      {/* CPM Rate */}
                      <td className="p-3 text-right text-emerald-400 font-semibold">
                        {reel.cpmRate ? `$${reel.cpmRate.toFixed(2)}` : '-'}
                      </td>

                      {/* CPM Earnings */}
                      <td className="p-3 text-right font-bold text-emerald-400">
                        ${(reel.cpmEarnings || 0).toFixed(2)}
                      </td>

                      {/* 8% Fee */}
                      <td className="p-3 text-right text-amber-400 font-medium">
                        -${(reel.fee3Percent || 0).toFixed(2)}
                      </td>

                      {/* Net Payout */}
                      <td className="p-3 text-right font-extrabold text-white bg-indigo-950/20">
                        ${(reel.estimatedPayout || 0).toFixed(2)}
                      </td>

                      {/* Eligibility Status Badge */}
                      <td className="p-3 text-center">
                        {reel.cpmEligibilityStatus === 'eligible' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" /> Eligible
                          </span>
                        )}
                        {reel.cpmEligibilityStatus === 'below_min_views' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            <AlertCircle className="w-3 h-3" /> Under Min ({connectedCampaign?.minViews.toLocaleString()})
                          </span>
                        )}
                        {reel.cpmEligibilityStatus === 'max_views_reached' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            <CheckCircle2 className="w-3 h-3" /> Capped ({connectedCampaign?.maxViews.toLocaleString()})
                          </span>
                        )}
                        {(!reel.cpmEligibilityStatus || reel.cpmEligibilityStatus === 'no_campaign') && (
                          <span className="text-slate-500 text-[10px]">Unassigned</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      </div>
      )}

      {/* Create / Edit Campaign Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md p-6 rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-400" />
                <span>{editingCampaign ? 'Edit CPM Campaign' : 'Create CPM Campaign'}</span>
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Campaign Name</label>
                <input
                  type="text"
                  placeholder="e.g. AXE Australia"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 focus:border-indigo-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">CPM Rate ($ per 1,000 views)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.50"
                  value={cpm}
                  onChange={(e) => setCpm(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 focus:border-indigo-500 focus:outline-none"
                  required
                />
                <p className="text-[10px] text-slate-500 mt-1">e.g. $0.50 CPM means $0.50 earned for every 1,000 eligible views</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Minimum Views</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="10000"
                    value={minViews}
                    onChange={(e) => setMinViews(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 focus:border-indigo-500 focus:outline-none"
                    required
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Required to qualify for CPM (not deducted)</p>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Maximum Views Cap</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="400000"
                    value={maxViews}
                    onChange={(e) => setMaxViews(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 focus:border-indigo-500 focus:outline-none"
                    required
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Maximum view limit eligible for CPM</p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="chk-campaign-enabled"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="chk-campaign-enabled" className="text-slate-300 font-medium cursor-pointer">
                  Enable Campaign (Active for payouts)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold transition active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Saving...' : (editingCampaign ? 'Save Changes' : 'Create Campaign')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
