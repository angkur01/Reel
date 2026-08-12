import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { OverviewTab } from './components/OverviewTab';
import { ReelsTab } from './components/ReelsTab';
import { AiBrainTab } from './components/AiBrainTab';
import { AnalyticsTab } from './components/AnalyticsTab';
import { SettingsModal } from './components/SettingsModal';
import { AddReelModal } from './components/AddReelModal';
import { LoginModal } from './components/LoginModal';

import { Reel, ApiProvider, TelegramSettings, SystemStats, AiSettings, AiMeta, AiLog, TestProviderResult } from './types';

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

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<string>('overview');

  // Core Data States
  const [reels, setReels] = useState<Reel[]>([]);
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
  const authFetch = useCallback(async (url: string, options: RequestInit = {}, timeoutMs = 8000) => {
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
      const [reelsRes, statsRes, provRes, tgRes, aiSettingsRes, aiLogsRes] = await Promise.allSettled([
        authFetch('/api/reels', {}, 8000),
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
  const handleAddReel = async (url: string, customName?: string) => {
    try {
      const res = await authFetch('/api/reels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, customName }),
      });
      const data = await res.json();
      if (data.reel) loadDashboardData();
      if (data.success) return { success: true };
      return { success: false, error: data.error };
    } catch (e: any) {
      return { success: false, error: e.message || 'Failed to add reel' };
    }
  };

  const handleRefreshReel = async (id: string) => {
    setRefreshingReelIds((prev) => new Set(prev).add(id));
    try {
      await authFetch(`/api/reels/${id}/fetch`, { method: 'POST' });
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
      await authFetch('/api/reels/refresh-all', { method: 'POST' });
      setTimeout(async () => {
        await loadDashboardData();
        setIsRefreshingAll(false);
      }, 3000);
    } catch (e) {
      setIsRefreshingAll(false);
    }
  };

  const handleRetryFailed = async () => {
    setIsRetryingFailed(true);
    try {
      await authFetch('/api/reels/retry-failed', { method: 'POST' });
      await loadDashboardData();
    } finally {
      setIsRetryingFailed(false);
    }
  };

  const handleEditReelName = async (id: string, currentName: string) => {
    const newName = prompt('Enter new custom name for this Reel:', currentName);
    if (!newName || !newName.trim()) return;

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

  const handleDeleteReel = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Reel?')) return;
    try {
      const res = await authFetch(`/api/reels/${id}`, { method: 'DELETE' });
      if (res.ok) loadDashboardData();
    } catch (e) {
      console.error('Error deleting reel:', e);
    }
  };

  // AI Actions
  const handleRunAiCheck = async () => {
    setIsRunningAiCheck(true);
    try {
      const res = await authFetch('/api/ai/check', { method: 'POST' });
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
      const res = await authFetch('/api/ai/daily-report', { method: 'POST' });
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

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3">
        <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
        <span className="text-xs font-mono">Initializing AI Command Center...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginModal onLogin={handleLogin} />;
  }

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
            reels={reels}
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
            reels={reels}
            onRefreshReel={handleRefreshReel}
            onEditReelName={handleEditReelName}
            onDeleteReel={handleDeleteReel}
            onOpenAddModal={() => setIsAddModalOpen(true)}
            onRetryFailed={handleRetryFailed}
            isRetryingFailed={isRetryingFailed}
            refreshingReelIds={refreshingReelIds}
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

        {activeTab === 'analytics' && <AnalyticsTab reels={reels} />}

        {activeTab === 'settings' && (
          <div className="glass-panel p-6 rounded-3xl space-y-6">
            <h2 className="text-2xl font-black text-white">System & API Configurations</h2>
            <SettingsModal
              isOpen={true}
              onClose={() => setActiveTab('overview')}
              providers={providers}
              telegramSettings={telegramSettings}
              onAddProvider={handleAddProvider}
              onUpdateProvider={handleUpdateProvider}
              onDeleteProvider={handleDeleteProvider}
              onTestProvider={handleTestProvider}
              onSaveTelegram={handleSaveTelegram}
              onTestTelegram={handleTestTelegram}
              onChangePassword={handleChangePassword}
            />
          </div>
        )}
      </main>

      {/* Add Reel Modal */}
      <AddReelModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddReel={handleAddReel}
      />

    </div>
  );
}
