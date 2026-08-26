import React, { useState, useEffect, useCallback } from 'react';
import { 
  Users, 
  Plus, 
  RefreshCw, 
  ExternalLink, 
  Trash2, 
  Power, 
  Clock, 
  Film, 
  CheckCircle2, 
  AlertTriangle, 
  Send, 
  Sparkles, 
  Search,
  SlidersHorizontal,
  Instagram,
  ArrowRight,
  ShieldCheck,
  Zap,
  Download,
  Link,
  Info,
  Check,
  CreditCard,
  Layers
} from 'lucide-react';
import { InstagramAccount, AccountScanResult, SystemStats } from '../types';

interface AccountsTabProps {
  accounts: InstagramAccount[];
  stats: SystemStats | null;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  onRefreshData: () => void;
  onViewReelsForAccount?: (username: string) => void;
}

export const AccountsTab: React.FC<AccountsTabProps> = ({
  accounts,
  stats,
  authFetch,
  onRefreshData,
  onViewReelsForAccount,
}) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [scanIntervalInput, setScanIntervalInput] = useState<number>(30);
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [scanningAccountId, setScanningAccountId] = useState<string | null>(null);
  const [linkingAccountId, setLinkingAccountId] = useState<string | null>(null);
  const [isScanningAll, setIsScanningAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'disabled'>('all');

  const [lastScanResult, setLastScanResult] = useState<AccountScanResult | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);

  // Refetcher API Balance State
  const [refetcherBalance, setRefetcherBalance] = useState<{
    balanceUsd?: number;
    currency?: string;
    maxBillableUnits?: number;
    unitPriceUsd?: number;
    error?: string;
  } | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const fetchRefetcherBalance = useCallback(async () => {
    setLoadingBalance(true);
    try {
      const res = await authFetch('/api/accounts/refetcher-balance');
      const data = await res.json();
      if (data && data.success) {
        setRefetcherBalance(data);
      }
    } catch (e) {
      // silent
    } finally {
      setLoadingBalance(false);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchRefetcherBalance();
  }, [fetchRefetcherBalance]);

  // Import Reels Modal State
  const [importAccount, setImportAccount] = useState<InstagramAccount | null>(null);
  const [importInput, setImportInput] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<{ success: boolean; text: string } | null>(null);

  // Filtered Accounts
  const filteredAccounts = accounts.filter((acc) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = 
      acc.username.toLowerCase().includes(query) ||
      acc.normalizedUsername.toLowerCase().includes(query) ||
      (acc.fullName && acc.fullName.toLowerCase().includes(query));
    
    if (!matchesSearch) return false;
    if (filterStatus === 'active') return acc.enabled !== false;
    if (filterStatus === 'disabled') return acc.enabled === false;
    return true;
  });

  const totalDiscoveredAcrossAll = accounts.reduce((sum, a) => sum + (a.totalDiscoveredReels || 0), 0);
  const activeCount = accounts.filter((a) => a.enabled !== false).length;

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim()) return;

    setIsAdding(true);
    setAddError(null);

    try {
      const res = await authFetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: usernameInput.trim(),
          scanIntervalMinutes: scanIntervalInput,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setAddError(data.error || 'Failed to add Instagram account.');
        setIsAdding(false);
        return;
      }

      setUsernameInput('');
      setIsAddModalOpen(false);
      setIsAdding(false);

      if (data.scanResult) {
        setLastScanResult(data.scanResult);
        setShowResultModal(true);
      }

      onRefreshData();
      fetchRefetcherBalance();
    } catch (err: any) {
      setAddError(err?.message || 'Network error while adding account.');
      setIsAdding(false);
    }
  };

  const handleScanSingleAccount = async (account: InstagramAccount, mode: 'normal' | 'full' = 'normal') => {
    const lockKey = `${account.id}_${mode}`;
    setScanningAccountId(lockKey);
    try {
      const res = await authFetch(`/api/accounts/${account.id}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (data.scanResult) {
        setLastScanResult(data.scanResult);
        setShowResultModal(true);
      }
      onRefreshData();
      fetchRefetcherBalance();
    } catch (err) {
      console.error('Scan error:', err);
    } finally {
      setScanningAccountId(null);
    }
  };

  const handleLinkExisting = async (account: InstagramAccount) => {
    setLinkingAccountId(account.id);
    try {
      const res = await authFetch(`/api/accounts/${account.id}/link-existing`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        onRefreshData();
      }
    } catch (err) {
      console.error('Link existing error:', err);
    } finally {
      setLinkingAccountId(null);
    }
  };

  const handleImportReels = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importAccount || !importInput.trim()) return;

    setIsImporting(true);
    setImportMessage(null);

    try {
      const res = await authFetch(`/api/accounts/${importAccount.id}/import-reels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: importInput }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setImportMessage({ success: false, text: data.error || 'Failed to import reels.' });
        setIsImporting(false);
        return;
      }

      setImportMessage({
        success: true,
        text: `Successfully imported ${data.totalImported} Reels (${data.newAdded} newly added, ${data.alreadyTracked} linked). Total tracked: ${data.totalAccountReels}`,
      });
      setIsImporting(false);
      onRefreshData();

      setTimeout(() => {
        setImportAccount(null);
        setImportInput('');
        setImportMessage(null);
      }, 2000);
    } catch (err: any) {
      setImportMessage({ success: false, text: err?.message || 'Network error during import.' });
      setIsImporting(false);
    }
  };

  const handleScanAllAccounts = async () => {
    setIsScanningAll(true);
    try {
      await authFetch('/api/accounts/scan-all', {
        method: 'POST',
      });
      onRefreshData();
    } catch (err) {
      console.error('Scan all error:', err);
    } finally {
      setIsScanningAll(false);
    }
  };

  const handleToggleAccount = async (account: InstagramAccount) => {
    try {
      await authFetch(`/api/accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !account.enabled }),
      });
      onRefreshData();
    } catch (err) {
      console.error('Toggle error:', err);
    }
  };

  const handleDeleteAccount = async (account: InstagramAccount) => {
    if (!window.confirm(`Are you sure you want to stop tracking @${account.normalizedUsername}?\n\nNote: All previously discovered Reels from this account will remain safely preserved in your database.`)) {
      return;
    }

    try {
      await authFetch(`/api/accounts/${account.id}`, {
        method: 'DELETE',
      });
      onRefreshData();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const formatRelativeTime = (isoString: string | null) => {
    if (!isoString) return 'Never scanned';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'Never';
    const now = Date.now();
    const diffMin = Math.round((now - d.getTime()) / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.round(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.round(diffHours / 24)}d ago`;
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-purple-950/40 to-slate-900 border border-purple-500/20 p-6 md:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-pink-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pink-500/10 border border-pink-500/20 text-pink-300 text-xs font-semibold">
              <Instagram className="w-3.5 h-3.5" />
              <span>Automated Instagram Creator Tracking</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              Track Instagram Accounts
            </h2>
            <p className="text-sm text-slate-300 max-w-xl">
              Add creators and public accounts. The scanner continuously discovers new public Reels, monitors metrics, and sends instant alerts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {refetcherBalance && (
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900/80 border border-purple-500/30 text-xs">
                <CreditCard className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-slate-400">Refetcher Balance:</span>
                <span className="font-bold text-emerald-400">${typeof refetcherBalance.balanceUsd === 'number' ? refetcherBalance.balanceUsd.toFixed(2) : '8.29'}</span>
                {typeof refetcherBalance.maxBillableUnits === 'number' && (
                  <span className="text-[10px] text-slate-500">({refetcherBalance.maxBillableUnits.toLocaleString()} units)</span>
                )}
              </div>
            )}

            <button
              id="btn-scan-all-accounts"
              onClick={handleScanAllAccounts}
              disabled={isScanningAll || accounts.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold shadow-md transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isScanningAll ? 'animate-spin text-pink-400' : 'text-slate-400'}`} />
              <span>{isScanningAll ? 'Scanning Profiles...' : 'Scan All Profiles'}</span>
            </button>

            <button
              id="btn-add-account-modal"
              onClick={() => {
                setAddError(null);
                setIsAddModalOpen(true);
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-pink-500/20 transition active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Instagram Account</span>
            </button>
          </div>
        </div>

        {/* Global Stats Counter Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-800/80">
          <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800">
            <span className="text-[11px] text-slate-400 font-medium">Tracked Accounts</span>
            <div className="text-xl font-bold text-white mt-0.5">{accounts.length}</div>
          </div>
          <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800">
            <span className="text-[11px] text-slate-400 font-medium">Active Monitoring</span>
            <div className="text-xl font-bold text-emerald-400 mt-0.5">{activeCount}</div>
          </div>
          <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800">
            <span className="text-[11px] text-slate-400 font-medium">Total Tracked Reels</span>
            <div className="text-xl font-bold text-pink-400 mt-0.5">{totalDiscoveredAcrossAll}</div>
          </div>
          <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800">
            <span className="text-[11px] text-slate-400 font-medium">Auto-Scan Engine</span>
            <div className="text-xl font-bold text-purple-300 mt-0.5">Active</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search accounts or creators..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-pink-500/50"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filter:</span>
          </span>
          <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1 rounded-lg transition ${
                filterStatus === 'all' ? 'bg-pink-600 text-white font-semibold shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({accounts.length})
            </button>
            <button
              onClick={() => setFilterStatus('active')}
              className={`px-3 py-1 rounded-lg transition ${
                filterStatus === 'active' ? 'bg-emerald-600 text-white font-semibold shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Active ({activeCount})
            </button>
            <button
              onClick={() => setFilterStatus('disabled')}
              className={`px-3 py-1 rounded-lg transition ${
                filterStatus === 'disabled' ? 'bg-slate-700 text-white font-semibold shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Paused ({accounts.length - activeCount})
            </button>
          </div>
        </div>
      </div>

      {/* Account Cards Grid */}
      {filteredAccounts.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-3xl bg-slate-900/40 border border-dashed border-slate-800">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/80 flex items-center justify-center text-slate-500 mx-auto mb-4">
            <Users className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-slate-200">No Instagram accounts found</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-6">
            {searchQuery
              ? 'No tracked accounts match your search query.'
              : 'Add an Instagram username to automatically discover public Reels and get Telegram notifications.'}
          </p>
          {!searchQuery && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 text-white text-xs font-bold shadow-lg shadow-pink-500/20 hover:opacity-95 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Track Your First Account</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredAccounts.map((account) => {
            const isScanning = scanningAccountId === account.id || isScanningAll;
            const isLinking = linkingAccountId === account.id;

            return (
              <div
                key={account.id}
                id={`account-card-${account.normalizedUsername}`}
                className={`p-5 rounded-2xl bg-slate-900/90 border transition-all flex flex-col justify-between ${
                  account.enabled === false
                    ? 'border-slate-800/60 opacity-75'
                    : 'border-slate-800 hover:border-slate-700 shadow-xl'
                }`}
              >
                <div>
                  {/* Account Card Header with Avatar */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {account.profilePicUrl ? (
                        <img
                          src={account.profilePicUrl}
                          alt={account.username}
                          referrerPolicy="no-referrer"
                          className="w-12 h-12 rounded-2xl object-cover border border-slate-700 shadow-md"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-500 via-rose-500 to-amber-500 text-white flex items-center justify-center font-black text-lg shadow-md shadow-pink-500/20">
                          {account.normalizedUsername.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <a
                            href={account.profileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="font-bold text-sm text-slate-100 hover:text-pink-400 transition flex items-center gap-1"
                          >
                            <span>@{account.normalizedUsername}</span>
                            <ExternalLink className="w-3 h-3 text-slate-500 hover:text-pink-400" />
                          </a>
                          {account.isVerified && (
                            <span className="w-3.5 h-3.5 rounded-full bg-blue-500 text-white text-[9px] font-black flex items-center justify-center">✓</span>
                          )}
                        </div>

                        {account.fullName && (
                          <div className="text-xs font-medium text-slate-300 truncate max-w-[170px]">
                            {account.fullName}
                          </div>
                        )}

                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              account.enabled !== false
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${account.enabled !== false ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                            {account.enabled !== false ? `Every ${account.scanIntervalMinutes || 30}m` : 'Paused'}
                          </span>

                          {typeof account.followers === 'number' && (
                            <span className="text-[10px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700/60">
                              {account.followers.toLocaleString()} followers
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Toggle & Delete */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleToggleAccount(account)}
                        title={account.enabled ? 'Pause background tracking' : 'Resume background tracking'}
                        className={`p-1.5 rounded-lg border transition ${
                          account.enabled
                            ? 'bg-slate-800 border-slate-700 text-slate-300 hover:text-amber-400'
                            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteAccount(account)}
                        title="Remove account (keeps discovered reels)"
                        className="p-1.5 rounded-lg bg-slate-800/80 border border-slate-700/80 text-slate-400 hover:text-rose-400 hover:border-rose-500/40 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Biography excerpt if available */}
                  {account.biography && (
                    <p className="text-[11px] text-slate-400 line-clamp-2 my-2.5 bg-slate-950/40 p-2 rounded-xl border border-slate-800/40 italic">
                      "{account.biography}"
                    </p>
                  )}

                  {/* Metrics Section: Tracked vs Total on Instagram */}
                  <div className="grid grid-cols-3 gap-2 my-3 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60 text-center">
                    <div className="p-1">
                      <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider block">Tracked Reels</span>
                      <div className="text-base font-extrabold text-pink-400 mt-0.5">
                        {account.totalDiscoveredReels || 0}
                      </div>
                    </div>
                    <div className="p-1 border-x border-slate-800/80">
                      <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider block">IG Total Posts</span>
                      <div className="text-base font-extrabold text-slate-200 mt-0.5">
                        {typeof account.totalProfilePosts === 'number' ? account.totalProfilePosts : '—'}
                      </div>
                    </div>
                    <div className="p-1">
                      <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider block">Last Scan</span>
                      <div className="text-[11px] font-semibold text-slate-300 mt-1 truncate">
                        {formatRelativeTime(account.lastScanAt)}
                      </div>
                    </div>
                  </div>

                  {/* Notice / Status */}
                  {account.lastScanError && (
                    <div className="mb-3 p-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400 mt-0.5" />
                      <div className="flex-1 truncate">{account.lastScanError}</div>
                    </div>
                  )}
                </div>

                {/* Card Bottom Actions */}
                <div className="space-y-2 pt-2 border-t border-slate-800/60">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      id={`btn-scan-now-${account.normalizedUsername}`}
                      onClick={() => handleScanSingleAccount(account, 'normal')}
                      disabled={isScanning}
                      title="Quick scan of the latest posts (1 page / ~$0.0009)"
                      className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-pink-600/20 hover:bg-pink-600/30 border border-pink-500/30 text-pink-300 text-xs font-bold transition active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${scanningAccountId === `${account.id}_normal` ? 'animate-spin text-pink-400' : ''}`} />
                      <span>{scanningAccountId === `${account.id}_normal` ? 'Scanning...' : 'Scan Now (1p)'}</span>
                    </button>

                    <button
                      id={`btn-full-scan-${account.normalizedUsername}`}
                      onClick={() => handleScanSingleAccount(account, 'full')}
                      disabled={isScanning}
                      title="Deep full scan of up to 25 pages / ~60+ public Reels (~$0.0225)"
                      className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 text-xs font-bold transition active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      <Layers className={`w-3.5 h-3.5 ${scanningAccountId === `${account.id}_full` ? 'animate-spin text-purple-400' : ''}`} />
                      <span>{scanningAccountId === `${account.id}_full` ? 'Scanning 25p...' : 'Full Scan (25p)'}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setImportAccount(account);
                        setImportInput('');
                        setImportMessage(null);
                      }}
                      title="Paste Reels for this profile"
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] font-medium transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Import Reels</span>
                    </button>

                    <button
                      onClick={() => handleLinkExisting(account)}
                      disabled={isLinking}
                      title="Auto-link existing reels in database matching this author"
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] font-medium transition disabled:opacity-50"
                    >
                      <Link className={`w-3 h-3 ${isLinking ? 'animate-spin' : 'text-slate-400'}`} />
                      <span>{isLinking ? 'Linking...' : 'Auto-Link DB'}</span>
                    </button>

                    {onViewReelsForAccount && (
                      <button
                        onClick={() => onViewReelsForAccount(account.normalizedUsername)}
                        title="Filter and view reels discovered from this account"
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] font-medium transition"
                      >
                        View
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Account Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center text-white shadow-md">
                  <Instagram className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Track Instagram Account</h3>
                  <p className="text-xs text-slate-400">Discover all public Reels automatically</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Instagram Username or Profile Link
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">@</span>
                  <input
                    type="text"
                    required
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="creatorname or https://instagram.com/creatorname"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-pink-500/60"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  We'll normalize the username and scan all public Reels on the profile.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Automatic Scan Interval
                </label>
                <select
                  value={scanIntervalInput}
                  onChange={(e) => setScanIntervalInput(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-pink-500/60"
                >
                  <option value={15}>Every 15 minutes</option>
                  <option value={30}>Every 30 minutes (Recommended)</option>
                  <option value={60}>Every 1 hour</option>
                  <option value={120}>Every 2 hours</option>
                  <option value={360}>Every 6 hours</option>
                  <option value={720}>Every 12 hours</option>
                  <option value={1440}>Every 24 hours</option>
                </select>
              </div>

              {addError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{addError}</span>
                </div>
              )}

              <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[11px] flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 text-indigo-400 mt-0.5" />
                <div>
                  <strong>Duplicate Protection:</strong> We extract unique Reel IDs to guarantee existing links are never duplicated. Telegram alerts are only sent for genuinely new additions.
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAdding || !usernameInput.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white text-xs font-bold shadow-lg shadow-pink-500/20 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {isAdding ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Scanning Account...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Add & Scan Now</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import Reels Modal */}
      {importAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Import Reels for @{importAccount.normalizedUsername}</h3>
                  <p className="text-xs text-slate-400">Paste multiple Reel links or shortcodes to track instantly</p>
                </div>
              </div>
              <button
                onClick={() => setImportAccount(null)}
                className="text-slate-400 hover:text-slate-200 text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleImportReels} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Paste Reel URLs or Shortcodes (One per line or comma separated)
                </label>
                <textarea
                  rows={6}
                  required
                  value={importInput}
                  onChange={(e) => setImportInput(e.target.value)}
                  placeholder={`https://www.instagram.com/reel/C8xyz123/\nhttps://www.instagram.com/reel/D9abc456/\nC7qwe890`}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  You can paste all 60 Reel URLs or IDs. All reels will be linked to @{importAccount.normalizedUsername} and scheduled for immediate metric collection.
                </p>
              </div>

              {importMessage && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                    importMessage.success
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                  }`}
                >
                  {importMessage.success ? <Check className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />}
                  <span>{importMessage.text}</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setImportAccount(null)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isImporting || !importInput.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-purple-500/20 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {isImporting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Importing & Linking...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Import Reels</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Scan Results Modal / Confirmation */}
      {showResultModal && lastScanResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white ${
                  lastScanResult.success ? 'bg-emerald-600 shadow-emerald-500/20' : 'bg-rose-600 shadow-rose-500/20'
                }`}>
                  {lastScanResult.success ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {lastScanResult.success ? 'Scan Completed' : 'Scan Notice'}
                  </h3>
                  <p className="text-xs text-slate-400">Account @{lastScanResult.username}</p>
                </div>
              </div>
              <button
                onClick={() => setShowResultModal(false)}
                className="text-slate-400 hover:text-slate-200 text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            {lastScanResult.success ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="p-2">
                    <span className="text-[10px] text-slate-500 font-bold block">TOTAL SCANNED</span>
                    <span className="text-lg font-black text-slate-200">{lastScanResult.totalDiscovered}</span>
                    <span className="text-[10px] text-slate-500 block">{lastScanResult.pagesScanned || 1} {lastScanResult.pagesScanned === 1 ? 'page' : 'pages'}</span>
                  </div>
                  <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                    <span className="text-[10px] text-emerald-400 font-bold block">NEW ADDED</span>
                    <span className="text-lg font-black text-emerald-400">+{lastScanResult.newReelsCount}</span>
                    <span className="text-[10px] text-emerald-400/70 block">{lastScanResult.costEstimate || '~$0.0009'}</span>
                  </div>
                  <div className="p-2">
                    <span className="text-[10px] text-slate-500 font-bold block">ALREADY KNOWN</span>
                    <span className="text-lg font-black text-slate-400">{lastScanResult.alreadyKnown}</span>
                    <span className="text-[10px] text-slate-500 block">skipped</span>
                  </div>
                </div>

                {lastScanResult.newReelsCount > 0 ? (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-bold">
                      <Send className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Telegram Alert Dispatched!</span>
                    </div>
                    <p className="text-[11px] text-emerald-300/80">
                      {lastScanResult.newReelsCount === 1
                        ? '1 new Reel was added to your database and sent to Telegram admin.'
                        : `${lastScanResult.newReelsCount} new Reels were added to your database and grouped into a Telegram notification.`}
                    </p>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700 text-slate-300 text-xs">
                    Account profile and database reels synced successfully. No duplicate records were created.
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs space-y-2">
                <p className="font-semibold">Discovery Notice:</p>
                <p className="text-rose-200">{lastScanResult.errorMessage || 'Unable to fetch public reels.'}</p>
                <p className="text-[11px] text-rose-300/70">
                  You can use the <strong>Import Reels</strong> button on the account card to paste and track all reels directly!
                </p>
              </div>
            )}

            <button
              onClick={() => setShowResultModal(false)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
