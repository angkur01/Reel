import React, { useState, useEffect } from 'react';
import { ApiProvider, TelegramSettings, TestProviderResult } from '../types';
import {
  X,
  Key,
  Bot,
  ShieldCheck,
  Plus,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Play,
  ExternalLink,
  Code,
  Sparkles,
  Video,
  MessageSquare,
  Zap,
  Layers,
  ChevronDown,
  ChevronUp,
  Database,
  Cloud,
  RefreshCw
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  providers: ApiProvider[];
  telegramSettings: TelegramSettings;
  stats?: any;
  onAddProvider: (p: Partial<ApiProvider>) => Promise<{ success: boolean; error?: string }>;
  onUpdateProvider: (id: string, p: Partial<ApiProvider>) => Promise<{ success: boolean; error?: string }>;
  onDeleteProvider: (id: string) => Promise<boolean>;
  onTestProvider: (id: string, testUrl?: string) => Promise<TestProviderResult | null>;
  onSaveTelegram: (t: Partial<TelegramSettings>) => Promise<boolean>;
  onTestTelegram: () => Promise<{ success: boolean; message?: string; error?: string }>;
  onChangePassword: (curr: string, next: string) => Promise<{ success: boolean; error?: string }>;
  onSaveGlobalSettings?: (settings: { globalFeePercent?: number; scheduleIntervalHours?: number }) => Promise<void>;
  isInline?: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  providers,
  telegramSettings,
  stats,
  onAddProvider,
  onUpdateProvider,
  onDeleteProvider,
  onTestProvider,
  onSaveTelegram,
  onTestTelegram,
  onChangePassword,
  onSaveGlobalSettings,
  isInline = false,
}) => {
  const [activeTab, setActiveTab] = useState<'apis' | 'telegram' | 'cloud-db' | 'global' | 'security'>('apis');

  // Global Settings controls state
  const [feeInput, setFeeInput] = useState<string>(stats?.globalFeePercent?.toString() || '3');
  const [intervalChoice, setIntervalChoice] = useState<number>(stats?.scheduleIntervalHours || 6);
  const [globalStatusMsg, setGlobalStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [globalSaving, setGlobalSaving] = useState(false);

  useEffect(() => {
    if (stats) {
      if (stats.globalFeePercent !== undefined) setFeeInput(stats.globalFeePercent.toString());
      if (stats.scheduleIntervalHours !== undefined) setIntervalChoice(stats.scheduleIntervalHours);
    }
  }, [stats]);

  const handleSaveGlobal = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!onSaveGlobalSettings) return;
    setGlobalSaving(true);
    setGlobalStatusMsg(null);
    try {
      await onSaveGlobalSettings({
        scheduleIntervalHours: intervalChoice,
      });
      setGlobalStatusMsg({ type: 'success', text: 'Auto-Fetch Schedule Interval updated successfully!' });
    } catch (err: any) {
      setGlobalStatusMsg({ type: 'error', text: err.message || 'Failed to save global settings' });
    } finally {
      setGlobalSaving(false);
    }
  };

  // Firebase Cloud DB state
  const [fbProjectId, setFbProjectId] = useState('ai-studio-applet-webapp-479fe');
  const [fbApiKey, setFbApiKey] = useState('');
  const [fbAppId, setFbAppId] = useState('1:17300429211:web:a1efc53ce188b9ba90a93e');
  const [fbFirestoreDatabaseId, setFbFirestoreDatabaseId] = useState('ai-studio-reelpulsepro-dce90b8a-4fa5-4cf5-b57a-5249a4950dda');
  const [fbStatusMsg, setFbStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [fbSaving, setFbSaving] = useState(false);
  const [fbTesting, setFbTesting] = useState(false);

  useEffect(() => {
    if (activeTab === 'cloud-db') {
      const token = localStorage.getItem('admin_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      fetch('/api/firebase/config', { headers })
        .then((r) => r.json())
        .then((data) => {
          if (data.success && data.rawConfig) {
            setFbProjectId(data.rawConfig.projectId || '');
            setFbApiKey(data.rawConfig.apiKey || '');
            setFbAppId(data.rawConfig.appId || '');
            setFbFirestoreDatabaseId(data.rawConfig.firestoreDatabaseId || '');
          }
        })
        .catch(() => {});
    }
  }, [activeTab]);

  const handleSaveFirebase = async (e: React.FormEvent) => {
    e.preventDefault();
    setFbSaving(true);
    setFbStatusMsg(null);
    try {
      const token = localStorage.getItem('admin_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/firebase/config', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          projectId: fbProjectId,
          apiKey: fbApiKey,
          appId: fbAppId,
          firestoreDatabaseId: fbFirestoreDatabaseId,
        }),
      });
      const data = await res.json();
      setFbSaving(false);
      if (data.success) {
        setFbStatusMsg({ type: 'success', text: 'Firebase Cloud DB config saved and reconnected!' });
      } else {
        setFbStatusMsg({ type: 'error', text: data.error || 'Failed to save Firebase config.' });
      }
    } catch (e) {
      setFbSaving(false);
      setFbStatusMsg({ type: 'error', text: 'Failed to communicate with server.' });
    }
  };

  const handleTestFirebase = async () => {
    setFbTesting(true);
    setFbStatusMsg(null);
    try {
      const token = localStorage.getItem('admin_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/firebase/test', { method: 'POST', headers });
      const data = await res.json();
      setFbTesting(false);
      if (data.success) {
        setFbStatusMsg({ type: 'success', text: `Connected! Database: ${data.databaseId} (${data.projectId})` });
      } else {
        setFbStatusMsg({ type: 'error', text: data.error || 'Firestore connection test failed.' });
      }
    } catch (e) {
      setFbTesting(false);
      setFbStatusMsg({ type: 'error', text: 'Failed to test Firebase connection.' });
    }
  };

  // Provider Form State
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [showAddProviderForm, setShowAddProviderForm] = useState(false);
  const [showAdvancedMapping, setShowAdvancedMapping] = useState(false);
  const [quickKeyInput, setQuickKeyInput] = useState<Record<string, string>>({});
  const [providerStatusMsg, setProviderStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const defaultProviderState: Partial<ApiProvider> = {
    name: 'Refetcher API',
    baseUrl: 'https://api.refetcher.com',
    endpointPath: '/',
    method: 'POST',
    apiKey: '',
    apiKeyLocation: 'header_x_api_key',
    urlParamName: 'url',
    headersJson: '{\n  "Accept": "application/json",\n  "Content-Type": "application/json"\n}',
    customBodyJson: '',
    enabled: true,
    priority: 1,
    mapping: {
      viewsPath: 'views',
      likesPath: 'likes',
      commentsPath: 'comments',
      sharesPath: 'shares',
      captionPath: 'caption',
      authorPath: 'author',
      thumbnailPath: 'thumbnail',
    },
  };

  const [providerForm, setProviderForm] = useState<Partial<ApiProvider>>(defaultProviderState);

  // Test Provider State
  const [testUrl, setTestUrl] = useState('https://www.instagram.com/reel/Db6jlRLFM5X/?igsh=dnNoaHRkYm1icTZk');
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ providerId: string; result: TestProviderResult } | null>(null);

  // Telegram Form State
  const [tgToken, setTgToken] = useState(telegramSettings?.botToken || '');
  const [tgAdminId, setTgAdminId] = useState(telegramSettings?.adminTelegramId || '');
  const [tgEnabled, setTgEnabled] = useState(telegramSettings?.enabled ?? true);
  const [tgSaving, setTgSaving] = useState(false);
  const [tgTesting, setTgTesting] = useState(false);
  const [tgStatusMsg, setTgStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sync Telegram settings prop updates
  useEffect(() => {
    if (telegramSettings) {
      setTgToken(telegramSettings.botToken || '');
      setTgAdminId(telegramSettings.adminTelegramId || '');
      setTgEnabled(telegramSettings.enabled ?? true);
    }
  }, [telegramSettings]);

  // Security Form State
  const [currPassword, setCurrPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pwdLoading, setPwdLoading] = useState(false);

  if (!isOpen) return null;

  const handleOpenEditProvider = (p: ApiProvider) => {
    setEditingProviderId(p.id);
    setProviderForm({
      name: p.name,
      baseUrl: p.baseUrl,
      endpointPath: p.endpointPath,
      method: p.method,
      apiKey: p.apiKey || '',
      apiKeyLocation: p.apiKeyLocation,
      urlParamName: p.urlParamName,
      headersJson: p.headersJson || '{\n  "Accept": "application/json",\n  "Content-Type": "application/json"\n}',
      customBodyJson: p.customBodyJson || '',
      enabled: p.enabled,
      priority: p.priority,
      mapping: p.mapping || {
        viewsPath: 'views',
        likesPath: 'likes',
        commentsPath: 'comments',
        sharesPath: 'shares',
        captionPath: 'caption',
        authorPath: 'author',
        thumbnailPath: 'thumbnail',
      },
    });
    setShowAddProviderForm(true);
  };

  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerForm.name || !providerForm.baseUrl) return;

    setProviderStatusMsg(null);
    let res: { success: boolean; error?: string };
    if (editingProviderId) {
      res = await onUpdateProvider(editingProviderId, providerForm);
    } else {
      res = await onAddProvider(providerForm);
    }

    if (res.success) {
      setProviderStatusMsg({
        type: 'success',
        text: editingProviderId ? 'API Provider updated successfully!' : 'New API Provider added successfully!',
      });
      setShowAddProviderForm(false);
      setEditingProviderId(null);
      setProviderForm(defaultProviderState);
    } else {
      setProviderStatusMsg({
        type: 'error',
        text: res.error || 'Failed to save API Provider. Please try again.',
      });
    }
  };

  const handleSaveQuickKey = async (providerId: string) => {
    const keyToSave = quickKeyInput[providerId];
    if (!keyToSave) return;

    setProviderStatusMsg(null);
    const res = await onUpdateProvider(providerId, { apiKey: keyToSave.trim() });
    if (res.success) {
      setQuickKeyInput({ ...quickKeyInput, [providerId]: '' });
      setProviderStatusMsg({ type: 'success', text: 'API Key saved successfully!' });
    } else {
      setProviderStatusMsg({ type: 'error', text: res.error || 'Failed to save API Key.' });
    }
  };

  const handleRunTest = async (providerId: string) => {
    setTestingProviderId(providerId);
    setTestResult(null);
    const result = await onTestProvider(providerId, testUrl);
    setTestingProviderId(null);
    if (result) {
      setTestResult({ providerId, result });
    }
  };

  const handleSaveTg = async (e: React.FormEvent) => {
    e.preventDefault();
    setTgSaving(true);
    setTgStatusMsg(null);
    const ok = await onSaveTelegram({
      botToken: tgToken,
      adminTelegramId: tgAdminId,
      enabled: tgEnabled,
    });
    setTgSaving(false);
    if (ok) {
      setTgStatusMsg({ type: 'success', text: 'Telegram settings saved successfully!' });
    } else {
      setTgStatusMsg({ type: 'error', text: 'Failed to save Telegram settings.' });
    }
  };

  const handleTestTg = async () => {
    setTgTesting(true);
    setTgStatusMsg(null);
    const res = await onTestTelegram();
    setTgTesting(false);
    if (res.success) {
      setTgStatusMsg({ type: 'success', text: res.message || 'Test message sent to Telegram successfully!' });
    } else {
      setTgStatusMsg({ type: 'error', text: res.error || 'Failed to send test message.' });
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdLoading(true);
    setPwdMsg(null);
    const res = await onChangePassword(currPassword, newPassword);
    setPwdLoading(false);
    if (res.success) {
      setPwdMsg({ type: 'success', text: 'Admin password updated successfully!' });
      setCurrPassword('');
      setNewPassword('');
    } else {
      setPwdMsg({ type: 'error', text: res.error || 'Failed to update password.' });
    }
  };

  const contentMarkup = (
    <div className="space-y-6">
      
      {/* Navigation Tabs Header */}
      <div className="flex flex-wrap items-center border-b border-slate-800 bg-slate-950/60 px-4 sm:px-6 gap-2 rounded-t-3xl">
        <button
          id="btn-tab-apis"
          onClick={() => setActiveTab('apis')}
          className={`py-3.5 px-4 font-bold text-xs flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'apis'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Key className="w-4 h-4" />
          <span>Instagram APIs ({providers.length})</span>
        </button>

        <button
          id="btn-tab-telegram"
          onClick={() => setActiveTab('telegram')}
          className={`py-3.5 px-4 font-bold text-xs flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'telegram'
              ? 'border-sky-500 text-sky-400 bg-sky-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Bot className="w-4 h-4" />
          <span>Telegram Bot Integration</span>
        </button>

        <button
          id="btn-tab-cloud-db"
          onClick={() => setActiveTab('cloud-db')}
          className={`py-3.5 px-4 font-bold text-xs flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'cloud-db'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Database className="w-4 h-4 text-emerald-400" />
          <span>Cloud Database (Firebase)</span>
        </button>

        <button
          id="btn-tab-global"
          onClick={() => setActiveTab('global')}
          className={`py-3.5 px-4 font-bold text-xs flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'global'
              ? 'border-amber-500 text-amber-400 bg-amber-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Zap className="w-4 h-4 text-amber-400" />
          <span>Global CPM & Schedule</span>
        </button>

        <button
          id="btn-tab-security"
          onClick={() => setActiveTab('security')}
          className={`py-3.5 px-4 font-bold text-xs flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'security'
              ? 'border-purple-500 text-purple-400 bg-purple-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Admin Security</span>
        </button>
      </div>

      {/* TAB CONTENT BODY */}
      <div className="p-4 sm:p-6 space-y-6">
        
        {/* TAB 1: API PROVIDERS MANAGEMENT */}
        {activeTab === 'apis' && (
          <div className="space-y-6">
            
            {/* Header info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  <span>API Provider Fallback Chain</span>
                </h3>
                <p className="text-xs text-slate-400 max-w-xl">
                  Configure primary and fallback Instagram scraping APIs. If Provider 1 fails or runs out of credits, system automatically retries with Provider 2, 3, etc.
                </p>
              </div>

              {!showAddProviderForm && (
                <button
                  id="btn-add-provider-trigger"
                  onClick={() => {
                    setEditingProviderId(null);
                    setProviderForm(defaultProviderState);
                    setShowAddProviderForm(true);
                  }}
                  className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs font-bold shadow-lg flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add API Provider</span>
                </button>
              )}
            </div>

            {/* Notification Banner */}
            {providerStatusMsg && (
              <div
                className={`p-3.5 rounded-2xl text-xs flex items-center gap-2 border ${
                  providerStatusMsg.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                }`}
              >
                {providerStatusMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{providerStatusMsg.text}</span>
              </div>
            )}

            {/* Test URL Config Drawer */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Play className="w-3.5 h-3.5 text-amber-400" />
                <span>Test Instagram Reel URL (Used when clicking "Test Provider")</span>
              </label>
              <input
                id="input-test-reel-url"
                type="text"
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                placeholder="https://www.instagram.com/reel/..."
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Add / Edit Form Drawer */}
            {showAddProviderForm && (
              <form onSubmit={handleSaveProvider} className="p-5 bg-slate-950 border border-slate-800 rounded-2xl space-y-5 animate-fade-in">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                    <Code className="w-4 h-4" />
                    <span>{editingProviderId ? 'Edit API Provider Configuration' : 'Add New API Provider'}</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddProviderForm(false);
                      setEditingProviderId(null);
                    }}
                    className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg bg-slate-900 border border-slate-800"
                  >
                    Cancel
                  </button>
                </div>

                {/* Quick Presets */}
                <div className="space-y-1.5 bg-slate-900/50 p-3 rounded-xl border border-slate-800/80">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Quick Presets:</span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setProviderForm({
                          ...providerForm,
                          name: 'Refetcher API',
                          baseUrl: 'https://api.refetcher.com',
                          endpointPath: '/',
                          method: 'POST',
                          apiKeyLocation: 'header_x_api_key',
                          urlParamName: 'url',
                          headersJson: '{\n  "Accept": "application/json",\n  "Content-Type": "application/json"\n}',
                          customBodyJson: '',
                          mapping: {
                            viewsPath: 'views',
                            likesPath: 'likes',
                            commentsPath: 'comments',
                            sharesPath: 'shares',
                            captionPath: 'caption',
                            authorPath: 'author',
                            thumbnailPath: 'thumbnail',
                          },
                        });
                      }}
                      className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded-lg border border-indigo-500/30 transition cursor-pointer"
                    >
                      ⚡ Refetcher API
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProviderForm({
                          ...providerForm,
                          name: 'RapidAPI Instagram Scraper',
                          baseUrl: 'https://instagram-scraper-api2.p.rapidapi.com',
                          endpointPath: '/v1/post_info',
                          method: 'GET',
                          apiKeyLocation: 'header_x_rapidapi_key',
                          urlParamName: 'url_or_code',
                          headersJson: '{\n  "Accept": "application/json"\n}',
                          customBodyJson: '',
                          mapping: {
                            viewsPath: 'data.metrics.play_count',
                            likesPath: 'data.metrics.like_count',
                            commentsPath: 'data.metrics.comment_count',
                            sharesPath: 'data.metrics.share_count',
                            captionPath: 'data.caption.text',
                            authorPath: 'data.owner.username',
                            thumbnailPath: 'data.thumbnail_url',
                          },
                        });
                      }}
                      className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-sky-300 rounded-lg border border-sky-500/30 transition cursor-pointer"
                    >
                      🚀 RapidAPI Instagram Scraper
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProviderForm({
                          ...providerForm,
                          name: 'Custom Webhook / Scraper',
                          baseUrl: 'https://your-custom-scraper.com',
                          endpointPath: '/fetch-reel',
                          method: 'POST',
                          apiKeyLocation: 'header_bearer',
                          urlParamName: 'url',
                          headersJson: '{\n  "Content-Type": "application/json"\n}',
                          customBodyJson: '',
                          mapping: {
                            viewsPath: 'views',
                            likesPath: 'likes',
                            commentsPath: 'comments',
                            sharesPath: 'shares',
                            captionPath: 'caption',
                            authorPath: 'author',
                            thumbnailPath: 'thumbnail',
                          },
                        });
                      }}
                      className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-purple-300 rounded-lg border border-purple-500/30 transition cursor-pointer"
                    >
                      🔧 Custom Scraper / Proxy
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-300 font-bold mb-1">Provider Name *</label>
                    <input
                      type="text"
                      value={providerForm.name || ''}
                      onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })}
                      placeholder="e.g. Refetcher API"
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1">Base URL *</label>
                    <input
                      type="text"
                      value={providerForm.baseUrl || ''}
                      onChange={(e) => setProviderForm({ ...providerForm, baseUrl: e.target.value })}
                      placeholder="https://api.refetcher.com"
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500 font-mono"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1">Endpoint Path</label>
                    <input
                      type="text"
                      value={providerForm.endpointPath || ''}
                      onChange={(e) => setProviderForm({ ...providerForm, endpointPath: e.target.value })}
                      placeholder="/"
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1">HTTP Method</label>
                    <select
                      value={providerForm.method || 'POST'}
                      onChange={(e) => setProviderForm({ ...providerForm, method: e.target.value as 'GET' | 'POST' })}
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="POST">POST (JSON Body / Headers)</option>
                      <option value="GET">GET (Query Parameters)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1">API Key Secret</label>
                    <input
                      type="password"
                      value={providerForm.apiKey || ''}
                      onChange={(e) => setProviderForm({ ...providerForm, apiKey: e.target.value })}
                      placeholder="Enter API Key secret..."
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1">API Key Location</label>
                    <select
                      value={providerForm.apiKeyLocation || 'header_x_api_key'}
                      onChange={(e) => setProviderForm({ ...providerForm, apiKeyLocation: e.target.value as any })}
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="header_x_api_key">Header: X-API-Key: KEY</option>
                      <option value="header_x_rapidapi_key">Header: X-RapidAPI-Key: KEY (RapidAPI)</option>
                      <option value="header_bearer">Header: Authorization: Bearer KEY</option>
                      <option value="query_api_key">Query Parameter: ?api_key=KEY</option>
                      <option value="query_key">Query Parameter: ?key=KEY</option>
                      <option value="query_token">Query Parameter: ?token=KEY</option>
                      <option value="body_api_key">JSON Body: "api_key": "KEY"</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1">Reel URL Parameter Name</label>
                    <input
                      type="text"
                      value={providerForm.urlParamName || 'url'}
                      onChange={(e) => setProviderForm({ ...providerForm, urlParamName: e.target.value })}
                      placeholder="url"
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1">Provider Status</label>
                    <select
                      value={providerForm.enabled ? 'true' : 'false'}
                      onChange={(e) => setProviderForm({ ...providerForm, enabled: e.target.value === 'true' })}
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="true">Enabled</option>
                      <option value="false">Disabled</option>
                    </select>
                  </div>
                </div>

                {/* Toggleable Advanced JSON Mapping Section */}
                <div className="pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedMapping(!showAdvancedMapping)}
                    className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 py-1"
                  >
                    <span>{showAdvancedMapping ? 'Hide' : 'Show'} Custom Headers & Response Mapping Paths</span>
                    {showAdvancedMapping ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {showAdvancedMapping && (
                    <div className="mt-3 space-y-4 text-xs bg-slate-900/60 p-4 rounded-2xl border border-slate-800 animate-fade-in">
                      <div>
                        <label className="block text-slate-300 font-bold mb-1">Custom Headers (JSON Format)</label>
                        <textarea
                          rows={3}
                          value={providerForm.headersJson || ''}
                          onChange={(e) => setProviderForm({ ...providerForm, headersJson: e.target.value })}
                          placeholder={'{\n  "Content-Type": "application/json"\n}'}
                          className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 font-mono text-[11px] focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Views Path</label>
                          <input
                            type="text"
                            value={providerForm.mapping?.viewsPath || 'views'}
                            onChange={(e) =>
                              setProviderForm({
                                ...providerForm,
                                mapping: { ...providerForm.mapping, viewsPath: e.target.value },
                              })
                            }
                            className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Likes Path</label>
                          <input
                            type="text"
                            value={providerForm.mapping?.likesPath || 'likes'}
                            onChange={(e) =>
                              setProviderForm({
                                ...providerForm,
                                mapping: { ...providerForm.mapping, likesPath: e.target.value },
                              })
                            }
                            className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Caption Path</label>
                          <input
                            type="text"
                            value={providerForm.mapping?.captionPath || 'caption'}
                            onChange={(e) =>
                              setProviderForm({
                                ...providerForm,
                                mapping: { ...providerForm.mapping, captionPath: e.target.value },
                              })
                            }
                            className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Author Path</label>
                          <input
                            type="text"
                            value={providerForm.mapping?.authorPath || 'author'}
                            onChange={(e) =>
                              setProviderForm({
                                ...providerForm,
                                mapping: { ...providerForm.mapping, authorPath: e.target.value },
                              })
                            }
                            className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-500/20 transition cursor-pointer"
                  >
                    Save API Provider
                  </button>
                </div>
              </form>
            )}

            {/* Provider Cards List - No layout overlaps */}
            <div className="space-y-4">
              {providers.map((p, idx) => (
                <div key={p.id} className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4">
                  
                  {/* Top Bar: Name, Badges & Action Buttons */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-full bg-slate-800 text-indigo-400 text-xs font-mono font-bold flex items-center justify-center border border-slate-700 shrink-0">
                        #{idx + 1}
                      </span>
                      <div className="min-w-0">
                        <h4 className="text-sm font-extrabold text-white flex flex-wrap items-center gap-2">
                          <span className="truncate">{p.name}</span>
                          {p.enabled ? (
                            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                              ACTIVE
                            </span>
                          ) : (
                            <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-bold">
                              DISABLED
                            </span>
                          )}
                        </h4>
                        <p className="text-xs text-slate-400 font-mono truncate mt-0.5">
                          <span className="text-indigo-400 font-bold">{p.method}</span> {p.baseUrl}{p.endpointPath}
                        </p>
                      </div>
                    </div>

                    {/* Action buttons box with flex-wrap so no text or icons collide */}
                    <div className="flex items-center flex-wrap gap-2 shrink-0">
                      <button
                        id={`btn-test-provider-${p.id}`}
                        onClick={() => handleRunTest(p.id)}
                        disabled={testingProviderId === p.id}
                        className="px-3 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                      >
                        {testingProviderId === p.id ? (
                          <span className="w-3.5 h-3.5 border-2 border-sky-400/30 border-t-sky-400 rounded-full animate-spin"></span>
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                        <span>Test Provider</span>
                      </button>

                      <button
                        onClick={() => handleOpenEditProvider(p)}
                        className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 border border-slate-800"
                        title="Edit Full Settings"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>

                      {providers.length > 1 && (
                        <button
                          onClick={() => onDeleteProvider(p.id)}
                          className="p-2 text-slate-500 hover:text-rose-400 rounded-xl hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/20"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Quick API Key Input Bar - Clean layout */}
                  <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300 shrink-0">
                      <Key className="w-3.5 h-3.5 text-rose-400" />
                      <span>API Secret:</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <input
                        type="password"
                        value={quickKeyInput[p.id] !== undefined ? quickKeyInput[p.id] : ''}
                        onChange={(e) => setQuickKeyInput({ ...quickKeyInput, [p.id]: e.target.value })}
                        placeholder={p.apiKeyMasked ? `Saved Key: ${p.apiKeyMasked}` : "Paste API Key secret here..."}
                        className="w-full px-3.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 font-mono placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <button
                      onClick={() => handleSaveQuickKey(p.id)}
                      disabled={!quickKeyInput[p.id]}
                      className="px-4 py-1.5 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white text-xs font-bold rounded-lg disabled:opacity-40 transition shrink-0 cursor-pointer"
                    >
                      <span>Update Key</span>
                    </button>
                  </div>

                  {/* Test Results Drawer */}
                  {testResult && testResult.providerId === p.id && (
                    <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 text-xs animate-fade-in">
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                        <span className="font-bold flex items-center gap-1.5">
                          {testResult.result.success ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-rose-400" />
                          )}
                          <span className={testResult.result.success ? 'text-emerald-400' : 'text-rose-400'}>
                            Test Execution: {testResult.result.success ? 'Success (200 OK)' : 'Failed'}
                          </span>
                        </span>
                        <span className="font-mono text-slate-400">HTTP {testResult.result.httpStatus}</span>
                      </div>

                      {testResult.result.errorMessage && (
                        <div className="text-rose-300 font-mono text-[11px] bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
                          {testResult.result.errorMessage}
                        </div>
                      )}

                      {testResult.result.parsedData && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
                          <div>
                            <span className="text-slate-500 text-[10px] block">Views</span>
                            <strong className="text-indigo-400 font-mono text-sm">{testResult.result.parsedData.views?.toLocaleString()}</strong>
                          </div>
                          <div>
                            <span className="text-slate-500 text-[10px] block">Likes</span>
                            <strong className="text-rose-400 font-mono text-sm">{testResult.result.parsedData.likes?.toLocaleString()}</strong>
                          </div>
                          <div>
                            <span className="text-slate-500 text-[10px] block">Comments</span>
                            <strong className="text-amber-400 font-mono text-sm">{testResult.result.parsedData.comments?.toLocaleString()}</strong>
                          </div>
                          <div>
                            <span className="text-slate-500 text-[10px] block">Author</span>
                            <strong className="text-slate-200 font-mono text-xs">@{testResult.result.parsedData.author}</strong>
                          </div>
                        </div>
                      )}

                      {testResult.result.rawResponseSnippet && (
                        <details className="text-[10px] text-slate-500">
                          <summary className="cursor-pointer hover:text-slate-300 font-mono">View Raw JSON Response</summary>
                          <pre className="mt-1.5 p-3 bg-slate-950 rounded-xl overflow-x-auto font-mono text-slate-400 max-h-36 border border-slate-800">
                            {testResult.result.rawResponseSnippet}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}

                </div>
              ))}
            </div>

          </div>
        )}

        {/* TAB 2: TELEGRAM BOT INTEGRATION & CONFIGURATION */}
        {activeTab === 'telegram' && (
          <div className="space-y-6">
            
            {/* Telegram Configuration Form */}
            <form onSubmit={handleSaveTg} className="space-y-6">
              
              {/* Header card with toggle */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-slate-950 border border-slate-800 rounded-2xl">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Bot className="w-4 h-4 text-sky-400" />
                    <span>Telegram Bot Administration & Dispatch</span>
                  </h3>
                  <p className="text-xs text-slate-400 max-w-xl">
                    Connect your Telegram Bot to receive real-time viral milestone alerts, daily AI digests, and run remote commands directly inside Telegram chats.
                  </p>
                </div>

                <label className="flex items-center gap-3 cursor-pointer shrink-0">
                  <span className="text-xs font-bold text-slate-300">Bot Enabled</span>
                  <input
                    id="checkbox-telegram-enabled"
                    type="checkbox"
                    checked={tgEnabled}
                    onChange={(e) => setTgEnabled(e.target.checked)}
                    className="w-5 h-5 rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-sky-500 cursor-pointer"
                  />
                </label>
              </div>

              {/* Status Message */}
              {tgStatusMsg && (
                <div
                  className={`p-3.5 rounded-2xl text-xs flex items-center gap-2 border ${
                    tgStatusMsg.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                  }`}
                >
                  {tgStatusMsg.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{tgStatusMsg.text}</span>
                </div>
              )}

              {/* Form Input Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                    <span>Telegram Bot Token *</span>
                    <a
                      href="https://t.me/BotFather"
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-400 hover:underline text-[10px] normal-case flex items-center gap-1"
                    >
                      <span>@BotFather</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </label>
                  <input
                    id="input-telegram-token"
                    type="password"
                    value={tgToken}
                    onChange={(e) => setTgToken(e.target.value)}
                    placeholder="e.g. 123456789:ABCdefGhIJKlm..."
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-slate-100 placeholder-slate-600 text-xs font-mono focus:outline-none focus:border-sky-500"
                  />
                  <p className="text-[10px] text-slate-500">
                    Bot Token created via @BotFather. Format: 123456789:AA...
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                    <span>Admin Telegram User ID *</span>
                    <a
                      href="https://t.me/userinfobot"
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-400 hover:underline text-[10px] normal-case flex items-center gap-1"
                    >
                      <span>@userinfobot</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </label>
                  <input
                    id="input-telegram-admin-id"
                    type="text"
                    value={tgAdminId}
                    onChange={(e) => setTgAdminId(e.target.value)}
                    placeholder="e.g. 12345678"
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-slate-100 placeholder-slate-600 text-xs font-mono focus:outline-none focus:border-sky-500"
                  />
                  <p className="text-[10px] text-slate-500">
                    Your personal Telegram numeric user ID. Only this ID can control the bot.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-800">
                <button
                  id="btn-test-telegram-bot"
                  type="button"
                  onClick={handleTestTg}
                  disabled={tgTesting || !tgToken || !tgAdminId}
                  className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-sky-400 border border-sky-500/30 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
                >
                  {tgTesting ? (
                    <span className="w-3.5 h-3.5 border-2 border-sky-400/30 border-t-sky-400 rounded-full animate-spin"></span>
                  ) : (
                    <Bot className="w-4 h-4 text-sky-400" />
                  )}
                  <span>Send Test Telegram Message</span>
                </button>

                <button
                  id="btn-save-telegram-settings"
                  type="submit"
                  disabled={tgSaving}
                  className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-2xl text-xs font-bold shadow-lg shadow-sky-500/20 transition cursor-pointer"
                >
                  {tgSaving ? 'Saving...' : 'Save Telegram Settings'}
                </button>
              </div>

            </form>

            {/* Telegram Capabilities Overview Card */}
            <div className="p-5 bg-slate-950 border border-slate-800 rounded-2xl space-y-4">
              <h4 className="text-xs font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-sky-400" />
                <span>Telegram Bot Capabilities & Commands Reference</span>
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                <div className="p-3.5 bg-slate-900/70 border border-slate-800 rounded-xl space-y-1.5">
                  <div className="flex items-center gap-2 text-sky-300 font-bold">
                    <MessageSquare className="w-4 h-4" />
                    <span>Interactive Buttons</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Type <code className="text-sky-300 bg-slate-950 px-1 py-0.5 rounded">/start</code> in Telegram to access live inline control buttons: Dashboard, Reels List, AI Check, Daily Report.
                  </p>
                </div>

                <div className="p-3.5 bg-slate-900/70 border border-slate-800 rounded-xl space-y-1.5">
                  <div className="flex items-center gap-2 text-purple-300 font-bold">
                    <Video className="w-4 h-4" />
                    <span>Direct Video Upload</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Send or forward any MP4 Reel video directly to your Telegram bot. The server automatically stores and lists it in your dashboard!
                  </p>
                </div>

                <div className="p-3.5 bg-slate-900/70 border border-slate-800 rounded-xl space-y-1.5">
                  <div className="flex items-center gap-2 text-amber-300 font-bold">
                    <Zap className="w-4 h-4" />
                    <span>Milestone Alerts</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Autonomous AI sends alerts whenever a Reel hits viral view thresholds (20k+, 50k+, 100k+ views).
                  </p>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* TAB 3: CLOUD DATABASE (FIREBASE FIRESTORE) */}
        {activeTab === 'cloud-db' && (
          <div className="space-y-6">
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                <span>Google Firebase Firestore Cloud Storage</span>
              </h3>
              <p className="text-xs text-slate-400">
                Configure your persistent Cloud Firestore database settings so your data stays saved permanently across GitHub syncs, Vercel deployments, or server restarts.
              </p>
            </div>

            {fbStatusMsg && (
              <div
                className={`p-4 rounded-2xl text-xs flex items-center gap-2 border ${
                  fbStatusMsg.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                }`}
              >
                {fbStatusMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{fbStatusMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleSaveFirebase} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Firebase Project ID</label>
                  <input
                    id="input-firebase-project-id"
                    type="text"
                    value={fbProjectId}
                    onChange={(e) => setFbProjectId(e.target.value)}
                    placeholder="ai-studio-applet-webapp-479fe"
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-slate-100 placeholder-slate-600 text-xs font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Firestore Database ID</label>
                  <input
                    id="input-firebase-database-id"
                    type="text"
                    value={fbFirestoreDatabaseId}
                    onChange={(e) => setFbFirestoreDatabaseId(e.target.value)}
                    placeholder="ai-studio-reelpulsepro-dce90b8a-4fa5-4cf5-b57a-5249a4950dda"
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-slate-100 placeholder-slate-600 text-xs font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-slate-300">Firebase API Key</label>
                  <input
                    id="input-firebase-api-key"
                    type="password"
                    value={fbApiKey}
                    onChange={(e) => setFbApiKey(e.target.value)}
                    placeholder="AIzaSyCQj5JOrkWHCUyJUo3PdVjj6VgU7XdRCYU"
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-slate-100 placeholder-slate-600 text-xs font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-slate-300">Firebase App ID</label>
                  <input
                    id="input-firebase-app-id"
                    type="text"
                    value={fbAppId}
                    onChange={(e) => setFbAppId(e.target.value)}
                    placeholder="1:17300429211:web:a1efc53ce188b9ba90a93e"
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-slate-100 placeholder-slate-600 text-xs font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-800">
                <button
                  id="btn-test-firebase-connection"
                  type="button"
                  onClick={handleTestFirebase}
                  disabled={fbTesting}
                  className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-emerald-500/30 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
                >
                  {fbTesting ? (
                    <span className="w-3.5 h-3.5 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin"></span>
                  ) : (
                    <RefreshCw className="w-4 h-4 text-emerald-400" />
                  )}
                  <span>Test Firestore Cloud Connection</span>
                </button>

                <button
                  id="btn-save-firebase-config"
                  type="submit"
                  disabled={fbSaving}
                  className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white rounded-2xl text-xs font-bold shadow-lg shadow-emerald-500/20 transition cursor-pointer"
                >
                  {fbSaving ? 'Saving & Reconnecting...' : 'Save & Reconnect Cloud DB'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 4: GLOBAL CPM FEE % & SCHEDULER INTERVAL */}
        {activeTab === 'global' && (
          <div className="space-y-6">
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Global CPM Platform Fee & Scheduler Interval Controls</span>
              </h3>
              <p className="text-xs text-slate-400">
                Platform fee is fixed at 8% across all CPM campaigns. Adjust the automatic cron refresh gap below (1 hour, 2 hours, 4 hours, 6 hours, or 12 hours).
              </p>
            </div>

            {globalStatusMsg && (
              <div
                className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-center gap-2 ${
                  globalStatusMsg.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                }`}
              >
                {globalStatusMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{globalStatusMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleSaveGlobal} className="space-y-6">
              {/* Section 1: Global Fee % (Fixed 8%) */}
              <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    <span>Global CPM Platform Fee %</span>
                  </label>
                  <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                    Fixed 8% Fee Active
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Standard 8% platform fee automatically deducted from all CPM earnings.
                </p>
              </div>

              {/* Section 2: Schedule Gap */}
              <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-indigo-400" />
                    <span>Auto-Fetch Scheduler Interval Gap</span>
                  </label>
                  <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20">
                    Every {intervalChoice} Hour{intervalChoice > 1 ? 's' : ''}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[1, 2, 4, 6, 12].map((gap) => (
                    <button
                      key={gap}
                      type="button"
                      onClick={() => setIntervalChoice(gap)}
                      className={`py-2.5 px-3 rounded-2xl text-xs font-bold transition border flex flex-col items-center justify-center gap-1 cursor-pointer ${
                        intervalChoice === gap
                          ? 'bg-indigo-600 text-white border-indigo-400 shadow-lg shadow-indigo-500/25'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-sm font-extrabold">{gap}h</span>
                      <span className="text-[10px] opacity-75">
                        {gap === 1 ? 'Hourly' : `${24 / gap}x daily`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  id="btn-save-global-settings"
                  type="submit"
                  disabled={globalSaving}
                  className="px-6 py-3 bg-gradient-to-r from-amber-500 via-orange-500 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-slate-950 font-extrabold rounded-2xl text-xs shadow-xl shadow-amber-500/20 transition cursor-pointer"
                >
                  {globalSaving ? 'Saving Global Settings...' : 'Save Global Settings'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 5: ADMIN AUTHENTICATION SECURITY */}
        {activeTab === 'security' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md mx-auto py-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-purple-400" />
                <span>Change Dashboard Password</span>
              </h3>
              <p className="text-xs text-slate-400">Update the master administrative login password.</p>
            </div>

            {pwdMsg && (
              <div
                className={`p-3.5 rounded-2xl text-xs flex items-center gap-2 border ${
                  pwdMsg.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                }`}
              >
                {pwdMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{pwdMsg.text}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">Current Password</label>
              <input
                id="input-current-password"
                type="password"
                value={currPassword}
                onChange={(e) => setCurrPassword(e.target.value)}
                placeholder="Current password"
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-2xl text-slate-100 text-xs focus:outline-none focus:border-purple-500"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">New Password</label>
              <input
                id="input-new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-2xl text-slate-100 text-xs focus:outline-none focus:border-purple-500"
                required
              />
            </div>

            <button
              id="btn-update-password"
              type="submit"
              disabled={pwdLoading}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-2xl font-bold text-xs shadow-lg shadow-purple-500/20 transition cursor-pointer"
            >
              {pwdLoading ? 'Updating Password...' : 'Update Admin Password'}
            </button>
          </form>
        )}

      </div>
    </div>
  );

  if (isInline) {
    return (
      <div className="glass-panel rounded-3xl overflow-hidden border border-slate-800 shadow-2xl">
        {contentMarkup}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-100 relative">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900">
          <h2 className="text-base font-extrabold text-white flex items-center gap-2">
            <span>Dashboard Settings & API Management</span>
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">{contentMarkup}</div>
      </div>
    </div>
  );
};
