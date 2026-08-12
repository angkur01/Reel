/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { LoginModal } from './components/LoginModal';
import { AddReelCard } from './components/AddReelCard';
import { ReelsList } from './components/ReelsList';
import { SettingsModal } from './components/SettingsModal';
import { LogsModal } from './components/LogsModal';
import { Reel, ApiProvider, TelegramSettings, FetchLog, TestProviderResult } from './types';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [reels, setReels] = useState<Reel[]>([]);
  const [providers, setProviders] = useState<ApiProvider[]>([]);
  const [telegramSettings, setTelegramSettings] = useState<TelegramSettings>({
    botToken: '',
    adminTelegramId: '',
    enabled: false,
  });
  const [logs, setLogs] = useState<FetchLog[]>([]);
  const [nextScheduledFetchAt, setNextScheduledFetchAt] = useState<string>('');
  const [isRefreshingBatch, setIsRefreshingBatch] = useState(false);

  // Modals state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);

  // Helper for authenticated requests (supports both cookies & Bearer header in iframe)
  const authFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem('admin_token');
    const headers = new Headers(options.headers || {});
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return fetch(url, {
      ...options,
      headers,
    });
  }, []);

  // Check initial authentication
  const checkAuthStatus = useCallback(async () => {
    try {
      const res = await authFetch('/api/auth/status');
      const data = await res.json();
      setIsAuthenticated(data.authenticated === true);
    } catch (e) {
      setIsAuthenticated(false);
    }
  }, [authFetch]);

  // Fetch Dashboard Data
  const loadDashboardData = useCallback(async () => {
    try {
      const reelsRes = await authFetch('/api/reels');
      if (reelsRes.ok) {
        const reelsData = await reelsRes.json();
        if (reelsData.success) {
          setReels(reelsData.reels || []);
          if (reelsData.nextScheduledFetchAt) {
            setNextScheduledFetchAt(reelsData.nextScheduledFetchAt);
          }
        }
      }

      const provRes = await authFetch('/api/providers');
      if (provRes.ok) {
        const provData = await provRes.json();
        if (provData.success) setProviders(provData.providers || []);
      }

      const tgRes = await authFetch('/api/telegram/settings');
      if (tgRes.ok) {
        const tgData = await tgRes.json();
        if (tgData.success && tgData.telegram) {
          setTelegramSettings({
            botToken: tgData.telegram.botTokenMasked || '',
            adminTelegramId: tgData.telegram.adminTelegramId || '',
            enabled: tgData.telegram.enabled ?? true,
          });
        }
      }

      const logsRes = await authFetch('/api/logs');
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        if (logsData.success) setLogs(logsData.logs || []);
      }

    } catch (err) {
      console.error('Error loading dashboard data:', err);
    }
  }, [authFetch]);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  useEffect(() => {
    if (isAuthenticated) {
      loadDashboardData();
      // Poll data every 10 seconds to reflect automatic or Telegram updates live
      const interval = setInterval(loadDashboardData, 10000);
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
      const data = await res.json();
      if (data.success && data.token) {
        localStorage.setItem('admin_token', data.token);
        setIsAuthenticated(true);
        loadDashboardData();
        return { success: true };
      }
      return { success: false, error: data.error };
    } catch (e: any) {
      return { success: false, error: e.message || 'Login network error' };
    }
  };

  const handleLogout = async () => {
    try {
      await authFetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      // ignore
    }
    localStorage.removeItem('admin_token');
    setIsAuthenticated(false);
  };

  // Reel Handlers
  const handleAddReel = async (url: string, customName?: string) => {
    try {
      const res = await authFetch('/api/reels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, customName }),
      });
      const data = await res.json();
      if (data.reel) {
        loadDashboardData();
      }
      if (data.success) {
        return { success: true };
      }
      return { success: false, error: data.error };
    } catch (e: any) {
      return { success: false, error: e.message || 'Failed to add reel' };
    }
  };

  const handleEditReelName = async (id: string, newName: string) => {
    try {
      const res = await authFetch(`/api/reels/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      if (res.ok) {
        loadDashboardData();
      }
    } catch (e) {
      console.error('Error updating reel name:', e);
    }
  };

  const handleDeleteReel = async (id: string) => {
    try {
      const res = await authFetch(`/api/reels/${id}`, { method: 'DELETE' });
      if (res.ok) {
        loadDashboardData();
      }
    } catch (e) {
      console.error('Error deleting reel:', e);
    }
  };

  const handleRefreshReel = async (id: string) => {
    try {
      await authFetch(`/api/reels/${id}/fetch`, { method: 'POST' });
      loadDashboardData();
    } catch (e) {
      console.error('Error refreshing reel:', e);
    }
  };

  const handleBatchRefresh = async () => {
    setIsRefreshingBatch(true);
    try {
      await authFetch('/api/reels/refresh-all', { method: 'POST' });
      setTimeout(() => {
        loadDashboardData();
        setIsRefreshingBatch(false);
      }, 3000);
    } catch (e) {
      setIsRefreshingBatch(false);
    }
  };

  // Provider Handlers
  const handleAddProvider = async (p: Partial<ApiProvider>): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await authFetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      });
      const data = await res.json();
      if (data.success) {
        loadDashboardData();
        return { success: true };
      }
      return { success: false, error: data.error || 'Failed to add provider' };
    } catch (e: any) {
      return { success: false, error: e.message || 'Network error' };
    }
  };

  const handleUpdateProvider = async (id: string, p: Partial<ApiProvider>): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await authFetch(`/api/providers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      });
      const data = await res.json();
      if (data.success) {
        loadDashboardData();
        return { success: true };
      }
      return { success: false, error: data.error || 'Failed to update provider' };
    } catch (e: any) {
      return { success: false, error: e.message || 'Network error' };
    }
  };

  const handleDeleteProvider = async (id: string) => {
    try {
      const res = await authFetch(`/api/providers/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        loadDashboardData();
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  };

  const handleTestProvider = async (id: string, testUrl?: string): Promise<TestProviderResult | null> => {
    try {
      const res = await authFetch(`/api/providers/${id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testUrl }),
      });
      const data = await res.json();
      if (data.success && data.result) {
        return data.result as TestProviderResult;
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  // Telegram Handlers
  const handleSaveTelegram = async (t: Partial<TelegramSettings>) => {
    try {
      const res = await authFetch('/api/telegram/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(t),
      });
      const data = await res.json();
      if (data.success) {
        loadDashboardData();
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  };

  const handleTestTelegram = async () => {
    try {
      const res = await authFetch('/api/telegram/test', { method: 'POST' });
      const data = await res.json();
      return data;
    } catch (e: any) {
      return { success: false, error: e.message || 'Telegram test failed' };
    }
  };

  const handleChangePassword = async (currentPassword: string, newPassword: string) => {
    try {
      const res = await authFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      return data;
    } catch (e: any) {
      return { success: false, error: e.message || 'Password update failed' };
    }
  };

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 font-sans">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 border-2 border-rose-500/30 border-t-rose-500 rounded-full animate-spin"></div>
          <span className="text-xs">Loading Dashboard...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginModal onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-rose-500 selection:text-white pb-16">
      
      {/* Navigation Header */}
      <Header
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenLogs={() => setIsLogsOpen(true)}
        onLogout={handleLogout}
        onBatchRefresh={handleBatchRefresh}
        nextScheduledFetchAt={nextScheduledFetchAt}
        isRefreshingBatch={isRefreshingBatch}
        telegramEnabled={telegramSettings.enabled}
      />

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
        
        {/* Add Reel Input Section */}
        <AddReelCard onAddReel={handleAddReel} />

        {/* Saved Reels List & Stats */}
        <ReelsList
          reels={reels}
          onRefresh={handleRefreshReel}
          onEditName={handleEditReelName}
          onDelete={handleDeleteReel}
        />

      </main>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
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

      {/* Logs Modal */}
      <LogsModal
        isOpen={isLogsOpen}
        onClose={() => setIsLogsOpen(false)}
        logs={logs}
      />

    </div>
  );
}
