import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { OverviewTab } from './components/OverviewTab';
import { ReelsTab } from './components/ReelsTab';
import { CpmCampaignsTab } from './components/CpmCampaignsTab';
import { AiBrainTab } from './components/AiBrainTab';
import { AnalyticsTab } from './components/AnalyticsTab';
import { LogsTab } from './components/LogsTab';
import { UptimeTab } from './components/UptimeTab';
import { SettingsModal } from './components/SettingsModal';
import { AddReelModal } from './components/AddReelModal';
import { LoginModal } from './components/LoginModal';

import { Reel, ApiProvider, TelegramSettings, SystemStats, AiSettings, AiMeta, AiLog, TestProviderResult, CpmCampaign } from './types';

async function parseJsonResponse(res: Response) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    if (res.status === 404) {
      throw new Error('API endpoint not found (HTTP 404). Please verify backend deployment.');
    }
    throw new Error(`Server returned non-JSON response (HTTP ${res.status}): ${text.slice(0, 60)}`);
  }
  return await res.json();
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => {
    controller.abort(new Error(`Timeout of ${Math.round(timeoutMs / 1000)}s exceeded`));
  }, timeoutMs);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err: any) {
    clearTimeout(id);
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds. Background tasks may still be completing.`);
    }
    throw err;
  }
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<string>('overview');

  // Core Data States
  const [reels, setReels] = useState<Reel[]>([]);
  const [cpmCampaigns, setCpmCampaigns] = useState<CpmCampaign[]>([]);
  const [providers, setProviders] = useState<ApiProvider[]>([]);
  const [telegramSettings, setTelegramSettings] = useState<TelegramSettings>({
    botToken: '',
    adminTelegramId: '',
    enabled: true,
  });
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [aiMeta, setAiMeta] = useState<AiMeta | null>(null);
  const [aiLogs, setAiLogs] = useState<AiLog[]>([]);

  // Action Loading States
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [isRunningAiCheck, setIsRunningAiCheck] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isRetryingFailed, setIsRetryingFailed] = useState(false);
  const [refreshingReelIds, setRefreshingReelIds] = useState<Set<string>>(new Set());

  // Modal Controls
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedReelForModal, setSelectedReelForModal] = useState<Reel | null>(null);

  // Authenticated Fetch Wrapper
  const authFetch = useCallback(async (url: string, options: RequestInit = {}, timeoutMs = 30000) => {
    const token = localStorage.getItem('admin_token');
    const headers = new Headers(options.headers || {});
    if (token && token !== 'null' && token !== 'undefined') {
      headers.set('Authorization', `Bearer ${token}`);
    }
    const res = await fetchWithTimeout(url, { ...options, headers }, timeoutMs);
    if (res.status === 401 && !url.includes('/api/auth/status') && !url.includes('/api/auth/login')) {
      console.warn('[Auth] 401 Unauthorized detected. Prompting login.');
      localStorage.removeItem('admin_token');
      setIsAuthenticated(false);
    }
    return res;
  }, []);

  // Check Auth Status
  const checkAuthStatus = useCallback(async () => {
    try {
      const res = await authFetch('/api/auth/status', {}, 4000);
      const data = await parseJsonResponse(res);
      setIsAuthenticated(data.authenticated === true);
    } catch (e) {
      setIsAuthenticated(false);
    }
  }, [authFetch]);

  // Load All Dashboard Data in Parallel
  const loadDashboardData = useCallback(async () => {
    try {
      const [reelsRes, cpmRes, statsRes, provRes, tgRes, aiSettingsRes, aiLogsRes] = await Promise.allSettled([
        authFetch('/api/reels', {}, 8000),
        authFetch('/api/cpm-campaigns', {}, 8000),
        authFetch('/api/stats', {}, 8000),
        authFetch('/api/providers', {}, 8000),
        authFetch('/api/telegram/settings', {}, 8000),
        authFetch('/api/ai/settings', {}, 8000),
        authFetch('/api/ai/logs', {}, 8000),
      ]);

      if (reelsRes.status === 'fulfilled' && reelsRes.value.ok) {
        try {
          const reelsData = await parseJsonResponse(reelsRes.value);
          if (reelsData.success) setReels(reelsData.reels || []);
        } catch (e) {}
      }

      if (cpmRes.status === 'fulfilled' && cpmRes.value.ok) {
        try {
          const cpmData = await parseJsonResponse(cpmRes.value);
          if (cpmData.success) setCpmCampaigns(cpmData.campaigns || []);
        } catch (e) {}
      }

      if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
        try {
          const statsData = await parseJsonResponse(statsRes.value);
          if (statsData.success) setStats(statsData.stats);
        } catch (e) {}
      }

      if (provRes.status === 'fulfilled' && provRes.value.ok) {
        try {
          const provData = await parseJsonResponse(provRes.value);
          if (provData.success) setProviders(provData.providers || []);
        } catch (e) {}
      }

      if (tgRes.status === 'fulfilled' && tgRes.value.ok) {
        try {
          const tgData = await parseJsonResponse(tgRes.value);
          if (tgData.success && tgData.telegram) {
            setTelegramSettings({
              botToken: tgData.telegram.botTokenMasked || '',
              adminTelegramId: tgData.telegram.adminTelegramId || '',
              enabled: tgData.telegram.enabled ?? true,
            });
          }
        } catch (e) {}
      }

      if (aiSettingsRes.status === 'fulfilled' && aiSettingsRes.value.ok) {
        try {
          const aiData = await parseJsonResponse(aiSettingsRes.value);
          if (aiData.success) {
            setAiSettings(aiData.aiSettings);
            setAiMeta(aiData.aiMeta);
          }
        } catch (e) {}
      }

      if (aiLogsRes.status === 'fulfilled' && aiLogsRes.value.ok) {
        try {
          const logsData = await parseJsonResponse(aiLogsRes.value);
          if (logsData.success) setAiLogs(logsData.aiLogs || []);
        } catch (e) {}
      }

    } catch (err) {
      console.error('Error loading dashboard data:', err);
    }
  }, [authFetch]);

  useEffect(() => {
    checkAuthStatus();
    const safetyTimer = setTimeout(() => {
      setIsAuthenticated((prev) => (prev === null ? false : prev));
    }, 3500);
    return () => clearTimeout(safetyTimer);
  }, [checkAuthStatus]);

  useEffect(() => {
    if (isAuthenticated) {
      loadDashboardData();
      const interval = setInterval(loadDashboardData, 8000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, loadDashboardData]);

  // Auth Handlers
  const handleLogin = async (password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await parseJsonResponse(res);
      if (data.success && data.token) {
        localStorage.setItem('admin_token', data.token);
        setIsAuthenticated(true);
        loadDashboardData();
        return { success: true };
      }
      return { success: false, error: data.error || 'Invalid admin password' };
    } catch (e: any) {
      return { success: false, error: e.message || 'Login network error' };
    }
  };

  const handleLogout = async () => {
    try {
      await authFetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    localStorage.removeItem('admin_token');
    setIsAuthenticated(false);
  };

  // Reel Actions
  const handleAddReel = async (url: string, customName?: string, campaignId?: string) => {
    try {
      const res = await authFetch('/api/reels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, customName, campaignId }),
      }, 60000);
      const data = await res.json();
      if (data.reel) {
        setReels((prev) => [data.reel, ...prev.filter((r) => r.id !== data.reel.id)]);
        loadDashboardData();
      }
      if (data.success) return { success: true };
      return { success: false, error: data.error };
    } catch (e: any) {
      return { success: false, error: e.message || 'Failed to add reel' };
    }
  };

  // CPM Campaign Actions
  const handleCreateCpmCampaign = async (campaignData: Omit<CpmCampaign, 'id' | 'createdAt'>) => {
    const res = await authFetch('/api/cpm-campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(campaignData),
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to create campaign');
    }
    await loadDashboardData();
  };

  const handleSaveGlobalSettings = async (settings: { globalFeePercent?: number; scheduleIntervalHours?: number }) => {
    const res = await authFetch('/api/settings/global', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to save global settings');
    }
    await loadDashboardData();
  };

  const handleUpdateCpmCampaign = async (id: string, campaignData: Partial<CpmCampaign>) => {
    const res = await authFetch(`/api/cpm-campaigns/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(campaignData),
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to update campaign');
    }
    await loadDashboardData();
  };

  const handleDeleteCpmCampaign = async (id: string) => {
    const res = await authFetch(`/api/cpm-campaigns/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to delete campaign');
    }
    await loadDashboardData();
  };

  const handleEditReelCampaign = async (reelId: string, campaignId: string | null) => {
    const res = await authFetch(`/api/reels/${reelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId }),
    });
    const data = await res.json();
    if (data.success) {
      await loadDashboardData();
    }
  };

  const handleRefreshReel = async (id: string) => {
    setRefreshingReelIds((prev) => new Set(prev).add(id));
    try {
      await authFetch(`/api/reels/${id}/fetch`, { method: 'POST' }, 60000);
      await loadDashboardData();
    } finally {
      setRefreshingReelIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleBatchRefresh = async () => {
    setIsRefreshingAll(true);
    try {
      await authFetch('/api/reels/refresh-all', { method: 'POST' }, 180000);
      await loadDashboardData();
    } catch (e: any) {
      console.error('[Batch Refresh Error]', e);
      alert(`Batch refresh note: ${e.message || 'Operation timed out, but background fetches are completing.'}`);
    } finally {
      setIsRefreshingAll(false);
    }
  };

  const handleRetryFailed = async () => {
    setIsRetryingFailed(true);
    try {
      await authFetch('/api/reels/retry-failed', { method: 'POST' }, 180000);
      await loadDashboardData();
    } catch (e: any) {
      console.error('[Retry Failed Error]', e);
    } finally {
      setIsRetryingFailed(false);
    }
  };

  const handleEditReelName = async (id: string, newName: string) => {
    setReels((prev) => prev.map((r) => (r.id === id ? { ...r, name: newName.trim() } : r)));

    try {
      const res = await authFetch(`/api/reels/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) loadDashboardData();
    } catch (e) {
      console.error('Error renaming reel:', e);
    }
  };

  const handleGroqRenameReel = async (id: string): Promise<string> => {
    const res = await authFetch(`/api/reels/${id}/groq-rename`, {
      method: 'POST',
    });
    const data = await res.json();
    if (data.success && data.newTitle) {
      setReels((prev) => prev.map((r) => (r.id === id ? { ...r, name: data.newTitle } : r)));
      await loadDashboardData();
      return data.newTitle;
    } else {
      throw new Error(data.error || 'Groq AI rename failed');
    }
  };


  const handleDeleteReel = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Reel?')) return;
    setReels((prev) => prev.filter((r) => r.id !== id));
    try {
      const res = await authFetch(`/api/reels/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await loadDashboardData();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || 'Failed to delete reel');
        await loadDashboardData();
      }
    } catch (e: any) {
      console.error('Error deleting reel:', e);
      alert('Error deleting reel: ' + (e.message || e));
      await loadDashboardData();
    }
  };

  // AI Actions
  const handleRunAiCheck = async () => {
    setIsRunningAiCheck(true);
    try {
      const res = await authFetch('/api/ai/check', { method: 'POST' }, 60000);
      const data = await res.json();
      if (!data.success) {
        alert(data.error || 'AI Check failed.');
      }
      await loadDashboardData();
    } finally {
      setIsRunningAiCheck(false);
    }
  };

  const handleGenerateDailyReport = async () => {
    setIsGeneratingReport(true);
    try {
      const res = await authFetch('/api/ai/daily-report', { method: 'POST' }, 60000);
      const data = await res.json();
      if (data.success) {
        alert('Daily Report generated & sent to Telegram successfully!');
      } else {
        alert('Failed to generate daily report.');
      }
      await loadDashboardData();
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleSaveAiSettings = async (newSettings: Partial<AiSettings>) => {
    await authFetch('/api/ai/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSettings),
    });
    await loadDashboardData();
  };

  // Settings Modal Handlers
  const handleAddProvider = async (p: Partial<ApiProvider>) => {
    const res = await authFetch('/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    });
    const data = await res.json();
    if (data.success) loadDashboardData();
    return data;
  };

  const handleUpdateProvider = async (id: string, p: Partial<ApiProvider>) => {
    const res = await authFetch(`/api/providers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    });
    const data = await res.json();
    if (data.success) loadDashboardData();
    return data;
  };

  const handleDeleteProvider = async (id: string) => {
    const res = await authFetch(`/api/providers/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) loadDashboardData();
    return data.success;
  };

  const handleTestProvider = async (id: string, testUrl?: string) => {
    const res = await authFetch(`/api/providers/${id}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testUrl }),
    });
    const data = await res.json();
    return data.result as TestProviderResult;
  };

  const handleSaveTelegram = async (t: Partial<TelegramSettings>) => {
    const res = await authFetch('/api/telegram/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(t),
    });
    const data = await res.json();
    if (data.success) loadDashboardData();
    return data.success;
  };

  const handleTestTelegram = async () => {
    const res = await authFetch('/api/telegram/test', { method: 'POST' });
    return await res.json();
  };

  const handleChangePassword = async (curr: string, next: string) => {
    const res = await authFetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: curr, newPassword: next }),
    });
    return await res.json();
  };

  // Public Uptime Route Detection
  const [isShowingPublicUptime, setIsShowingPublicUptime] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      const search = window.location.search;
      const hash = window.location.hash;
      return path.includes('/uptime') || search.includes('uptime') || hash.includes('uptime');
    }
    return false;
  });

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3">
        <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
        <span className="text-xs font-mono">Initializing AI Command Center...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (isShowingPublicUptime) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 sm:p-6 max-w-7xl mx-auto">
          <UptimeTab isPublicMode={true} onOpenLogin={() => setIsShowingPublicUptime(false)} />
        </div>
      );
    }
    return (
      <LoginModal
        onLogin={handleLogin}
        onViewPublicUptime={() => setIsShowingPublicUptime(true)}
      />
    );
  }

  
  const activeReels = reels.filter(r => r.category !== 'archived' && r.category !== 'paid');
  const archivedReels = reels.filter(r => r.category === 'archived');
  const paidReels = reels.filter(r => r.category === 'paid');
  
  const handleChangeCategory = async (id: string, category: 'active' | 'archived' | 'paid') => {
    setReels(prev => prev.map(r => r.id === id ? { ...r, category, paidAt: category === 'paid' ? new Date().toISOString() : r.paidAt } : r));
    try {
      await authFetch(`/api/reels/${id}/category`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category })
      });
      await loadDashboardData();
    } catch (e) {
      console.error('Failed to change category', e);
    }
  };
return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
      
      {/* Top Navbar Header */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        stats={stats}
        isRefreshingAll={isRefreshingAll}
        onRefreshAll={handleBatchRefresh}
        onLogout={handleLogout}
        onOpenAddModal={() => setIsAddModalOpen(true)}
      />

      {/* Main Tab Content Canvas */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
        {activeTab === 'overview' && (
          <OverviewTab
            stats={stats}
            reels={activeReels}
            aiLogs={aiLogs}
            onOpenAddModal={() => setIsAddModalOpen(true)}
            onRefreshAll={handleBatchRefresh}
            isRefreshingAll={isRefreshingAll}
            onRunAiCheck={handleRunAiCheck}
            isRunningAiCheck={isRunningAiCheck}
            onSelectReel={(reel) => {
              setSelectedReelForModal(reel);
              setActiveTab('reels');
            }}
            setActiveTab={setActiveTab}
          />
        )}

        {activeTab === 'reels' && (
          <ReelsTab
            reels={activeReels} onChangeCategory={handleChangeCategory}
            onRefreshReel={handleRefreshReel}
            onEditReelName={handleEditReelName}
            onGroqRenameReel={handleGroqRenameReel}
            onDeleteReel={handleDeleteReel}
            onOpenAddModal={() => setIsAddModalOpen(true)}
            onRetryFailed={handleRetryFailed}
            isRetryingFailed={isRetryingFailed}
            refreshingReelIds={refreshingReelIds}
            onRefreshAll={handleBatchRefresh}
            isRefreshingAll={isRefreshingAll}
          />
        )}

        {activeTab === 'cpm-campaigns' && (
          <CpmCampaignsTab onChangeCategory={handleChangeCategory}
            campaigns={cpmCampaigns}
            reels={reels}
            stats={stats}
            onCreateCampaign={handleCreateCpmCampaign}
            onUpdateCampaign={handleUpdateCpmCampaign}
            onDeleteCampaign={handleDeleteCpmCampaign}
            onEditReelCampaign={handleEditReelCampaign}
            onSaveGlobalSettings={handleSaveGlobalSettings}
          />
        )}

        {activeTab === 'ai-brain' && (
          <AiBrainTab
            aiSettings={aiSettings}
            aiMeta={aiMeta}
            aiLogs={aiLogs}
            onSaveAiSettings={handleSaveAiSettings}
            onRunAiCheck={handleRunAiCheck}
            isRunningAiCheck={isRunningAiCheck}
            onGenerateDailyReport={handleGenerateDailyReport}
            isGeneratingReport={isGeneratingReport}
          />
        )}

        {activeTab === 'analytics' && <AnalyticsTab reels={activeReels} />}

        {activeTab === 'logs' && <LogsTab authFetch={authFetch} />}

        {activeTab === 'uptime' && <UptimeTab />}

        {activeTab === 'settings' && (
          <SettingsModal archivedReels={archivedReels} onChangeCategory={handleChangeCategory}
            isOpen={true}
            onClose={() => setActiveTab('overview')}
            providers={providers}
            telegramSettings={telegramSettings}
            stats={stats}
            onAddProvider={handleAddProvider}
            onUpdateProvider={handleUpdateProvider}
            onDeleteProvider={handleDeleteProvider}
            onTestProvider={handleTestProvider}
            onSaveTelegram={handleSaveTelegram}
            onTestTelegram={handleTestTelegram}
            onChangePassword={handleChangePassword}
            onSaveGlobalSettings={handleSaveGlobalSettings}
            aiSettings={aiSettings}
            aiMeta={aiMeta}
            aiLogs={aiLogs}
            onSaveAiSettings={handleSaveAiSettings}
            onRunAiCheck={handleRunAiCheck}
            isRunningAiCheck={isRunningAiCheck}
            onGenerateDailyReport={handleGenerateDailyReport}
            isGeneratingReport={isGeneratingReport}
            authFetch={authFetch}
            isInline={true}
          />
        )}
      </main>

      {/* Add Reel Modal */}
      <AddReelModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        campaigns={cpmCampaigns}
        onAddReel={handleAddReel}
      />

    </div>
  );
}
