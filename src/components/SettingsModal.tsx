import React, { useState } from 'react';
import { ApiProvider, TelegramSettings, TestProviderResult } from '../types';
import { X, Key, Bot, ShieldCheck, Plus, Trash2, Edit3, CheckCircle2, AlertCircle, Play, Layers, ExternalLink, HelpCircle } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  providers: ApiProvider[];
  telegramSettings: TelegramSettings;
  onAddProvider: (p: Partial<ApiProvider>) => Promise<{ success: boolean; error?: string }>;
  onUpdateProvider: (id: string, p: Partial<ApiProvider>) => Promise<{ success: boolean; error?: string }>;
  onDeleteProvider: (id: string) => Promise<boolean>;
  onTestProvider: (id: string, testUrl?: string) => Promise<TestProviderResult | null>;
  onSaveTelegram: (t: Partial<TelegramSettings>) => Promise<boolean>;
  onTestTelegram: () => Promise<{ success: boolean; message?: string; error?: string }>;
  onChangePassword: (curr: string, next: string) => Promise<{ success: boolean; error?: string }>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  providers,
  telegramSettings,
  onAddProvider,
  onUpdateProvider,
  onDeleteProvider,
  onTestProvider,
  onSaveTelegram,
  onTestTelegram,
  onChangePassword,
}) => {
  const [activeTab, setActiveTab] = useState<'apis' | 'telegram' | 'security'>('apis');

  // Provider Form State
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [showAddProviderForm, setShowAddProviderForm] = useState(false);
  const [quickKeyInput, setQuickKeyInput] = useState<Record<string, string>>({});
  const [providerStatusMsg, setProviderStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [providerForm, setProviderForm] = useState<Partial<ApiProvider>>({
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
  });

  // Test Provider State
  const [testUrl, setTestUrl] = useState('https://www.instagram.com/reel/Db6jlRLFM5X/?igsh=dnNoaHRkYm1icTZk');
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ providerId: string; result: TestProviderResult } | null>(null);

  // Telegram Form State
  const [tgToken, setTgToken] = useState(telegramSettings.botToken || '');
  const [tgAdminId, setTgAdminId] = useState(telegramSettings.adminTelegramId || '');
  const [tgEnabled, setTgEnabled] = useState(telegramSettings.enabled ?? true);
  const [tgSaving, setTgSaving] = useState(false);
  const [tgTesting, setTgTesting] = useState(false);
  const [tgStatusMsg, setTgStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Keep Telegram state in sync with incoming props
  React.useEffect(() => {
    if (telegramSettings) {
      if (telegramSettings.botToken) setTgToken(telegramSettings.botToken);
      if (telegramSettings.adminTelegramId) setTgAdminId(telegramSettings.adminTelegramId);
      if (telegramSettings.enabled !== undefined) setTgEnabled(telegramSettings.enabled);
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
      apiKey: p.apiKey || (p as any).apiKeyMasked || '',
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
      setProviderStatusMsg({ type: 'success', text: editingProviderId ? 'API Provider updated successfully!' : 'New API Provider added successfully!' });
      setShowAddProviderForm(false);
      setEditingProviderId(null);
    } else {
      setProviderStatusMsg({ type: 'error', text: res.error || 'Failed to save API Provider. Please try again.' });
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-100">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>Dashboard Settings</span>
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/50 px-6 gap-2">
          
          <button
            onClick={() => setActiveTab('apis')}
            className={`py-3 px-4 font-semibold text-xs flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'apis'
                ? 'border-rose-500 text-rose-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>Instagram APIs ({providers.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('telegram')}
            className={`py-3 px-4 font-semibold text-xs flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'telegram'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>Telegram Bot</span>
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`py-3 px-4 font-semibold text-xs flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'security'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Admin Auth</span>
          </button>

        </div>

        {/* Tab Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          
          {/* TAB 1: API PROVIDERS MANAGEMENT */}
          {activeTab === 'apis' && (
            <div className="space-y-6">
              
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-200">API Provider Fallback Chain</h3>
                  <p className="text-xs text-slate-400">
                    If API 1 fails or runs out of credits, system automatically tries API 2 → API 3.
                  </p>
                </div>
                {!showAddProviderForm && (
                  <button
                    onClick={() => {
                      setEditingProviderId(null);
                      setProviderForm({
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
                        priority: providers.length + 1,
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
                      setShowAddProviderForm(true);
                    }}
                    className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Provider</span>
                  </button>
                )}
              </div>

              {/* Status Message Notification */}
              {providerStatusMsg && (
                <div
                  className={`p-3.5 rounded-2xl text-xs flex items-center gap-2 border ${
                    providerStatusMsg.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                  }`}
                >
                  {providerStatusMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{providerStatusMsg.text}</span>
                </div>
              )}

              {/* Reel URL input for real provider testing */}
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5 text-amber-400" />
                  <span>Test Instagram Reel URL (Used when clicking "Test Provider")</span>
                </label>
                <input
                  type="text"
                  value={testUrl}
                  onChange={(e) => setTestUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
              </div>

              {/* Add / Edit Form Drawer */}
              {showAddProviderForm && (
                <form onSubmit={handleSaveProvider} className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h4 className="text-xs font-bold text-rose-400">
                      {editingProviderId ? 'Edit API Provider' : 'Add New API Provider'}
                    </h4>
                    <button
                      type="button"
                      onClick={() => setShowAddProviderForm(false)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-slate-400 mb-1">Provider Name</label>
                      <input
                        type="text"
                        value={providerForm.name || ''}
                        onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })}
                        placeholder="e.g. Refetcher API"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Base URL</label>
                      <input
                        type="text"
                        value={providerForm.baseUrl || ''}
                        onChange={(e) => setProviderForm({ ...providerForm, baseUrl: e.target.value })}
                        placeholder="https://api.refetcher.com"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Endpoint Path</label>
                      <input
                        type="text"
                        value={providerForm.endpointPath || ''}
                        onChange={(e) => setProviderForm({ ...providerForm, endpointPath: e.target.value })}
                        placeholder="/"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">HTTP Method</label>
                      <select
                        value={providerForm.method || 'POST'}
                        onChange={(e) => setProviderForm({ ...providerForm, method: e.target.value as 'GET' | 'POST' })}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white"
                      >
                        <option value="POST">POST (JSON Body / Headers)</option>
                        <option value="GET">GET (Query Parameters)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">API Key Secret</label>
                      <input
                        type="password"
                        value={providerForm.apiKey || ''}
                        onChange={(e) => setProviderForm({ ...providerForm, apiKey: e.target.value })}
                        placeholder="Enter API Key secret (e.g. pc_live_...)"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">API Key Header / Location</label>
                      <select
                        value={providerForm.apiKeyLocation || 'header_x_api_key'}
                        onChange={(e) => setProviderForm({ ...providerForm, apiKeyLocation: e.target.value as any })}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white"
                      >
                        <option value="header_x_api_key">Header (X-API-Key: pc_live_...)</option>
                        <option value="header_bearer">Authorization: Bearer KEY</option>
                        <option value="query_api_key">Query Parameter (?api_key=...)</option>
                        <option value="query_key">Query Parameter (?key=...)</option>
                        <option value="body_api_key">JSON Body ("api_key": "KEY")</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Reel URL Parameter Name</label>
                      <input
                        type="text"
                        value={providerForm.urlParamName || 'url'}
                        onChange={(e) => setProviderForm({ ...providerForm, urlParamName: e.target.value })}
                        placeholder="url"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Provider Enable Status</label>
                      <select
                        value={providerForm.enabled ? 'true' : 'false'}
                        onChange={(e) => setProviderForm({ ...providerForm, enabled: e.target.value === 'true' })}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white"
                      >
                        <option value="true">Enabled</option>
                        <option value="false">Disabled</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
                    <button
                      type="submit"
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-500/20"
                    >
                      Save Provider
                    </button>
                  </div>
                </form>
              )}

              {/* Provider Cards List */}
              <div className="space-y-3">
                {providers.map((p, idx) => (
                  <div key={p.id} className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3">
                    
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 text-xs font-mono font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <div>
                          <h4 className="text-sm font-bold text-white flex items-center gap-2">
                            <span>{p.name}</span>
                            {p.enabled ? (
                              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">Enabled</span>
                            ) : (
                              <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-medium">Disabled</span>
                            )}
                          </h4>
                          <p className="text-xs text-slate-400 font-mono mt-0.5">{p.method} {p.baseUrl}{p.endpointPath}</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => handleRunTest(p.id)}
                          disabled={testingProviderId === p.id}
                          className="px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50"
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
                          className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800"
                          title="Edit Full Settings"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        {providers.length > 1 && (
                          <button
                            onClick={() => onDeleteProvider(p.id)}
                            className="p-2 text-slate-500 hover:text-rose-400 rounded-xl hover:bg-rose-500/10"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Quick API Key Input Row directly on card */}
                    <div className="p-2.5 bg-slate-900 border border-slate-800/80 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
                        <Key className="w-3.5 h-3.5 text-rose-400" />
                        <span>API Key:</span>
                      </div>
                      <div className="flex-1">
                        <input
                          type="password"
                          value={quickKeyInput[p.id] !== undefined ? quickKeyInput[p.id] : ''}
                          onChange={(e) => setQuickKeyInput({ ...quickKeyInput, [p.id]: e.target.value })}
                          placeholder={p.apiKeyMasked ? `Current Key: ${p.apiKeyMasked}` : "Paste your API Key secret here..."}
                          className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 font-mono placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                        />
                      </div>
                      <button
                        onClick={() => handleSaveQuickKey(p.id)}
                        disabled={!quickKeyInput[p.id]}
                        className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-lg disabled:opacity-40 disabled:hover:bg-rose-500 transition-all flex items-center justify-center gap-1 shrink-0"
                      >
                        <span>Save Key</span>
                      </button>
                    </div>

                    {/* Test Results Banner */}
                    {testResult && testResult.providerId === p.id && (
                      <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2 text-xs">
                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
                          <span className="font-bold flex items-center gap-1.5">
                            {testResult.result.success ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-rose-400" />
                            )}
                            <span>Test Status: {testResult.result.success ? 'Success (200 OK)' : 'Failed'}</span>
                          </span>
                          <span className="font-mono text-slate-400">HTTP {testResult.result.httpStatus}</span>
                        </div>

                        {testResult.result.errorMessage && (
                          <div className="text-rose-300 font-mono text-[11px] bg-rose-500/10 p-2 rounded-xl">
                            {testResult.result.errorMessage}
                          </div>
                        )}

                        {testResult.result.parsedData && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                            <div><span className="text-slate-500">Views:</span> <strong className="text-sky-400">{testResult.result.parsedData.views?.toLocaleString()}</strong></div>
                            <div><span className="text-slate-500">Likes:</span> <strong className="text-rose-400">{testResult.result.parsedData.likes?.toLocaleString()}</strong></div>
                            <div><span className="text-slate-500">Comments:</span> <strong className="text-amber-400">{testResult.result.parsedData.comments?.toLocaleString()}</strong></div>
                            <div><span className="text-slate-500">Author:</span> <strong className="text-slate-200">@{testResult.result.parsedData.author}</strong></div>
                          </div>
                        )}

                        {testResult.result.rawResponseSnippet && (
                          <details className="text-[10px] text-slate-500">
                            <summary className="cursor-pointer hover:text-slate-300 font-mono">View Raw Snippet</summary>
                            <pre className="mt-1 p-2 bg-slate-950 rounded-xl overflow-x-auto font-mono text-slate-400 max-h-32">
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

          {/* TAB 2: TELEGRAM BOT SETTINGS */}
          {activeTab === 'telegram' && (
            <form onSubmit={handleSaveTg} className="space-y-5">
              
              <div className="flex items-center justify-between p-4 bg-slate-950 border border-slate-800 rounded-2xl">
                <div>
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Bot className="w-4 h-4 text-sky-400" />
                    <span>Enable Telegram Bot Notifications</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Send stats updates after fetches and enable Telegram Force Refresh.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={tgEnabled}
                  onChange={(e) => setTgEnabled(e.target.checked)}
                  className="w-5 h-5 rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-sky-500 cursor-pointer"
                />
              </div>

              {tgStatusMsg && (
                <div
                  className={`p-3.5 rounded-2xl text-xs flex items-center gap-2 border ${
                    tgStatusMsg.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                  }`}
                >
                  {tgStatusMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{tgStatusMsg.text}</span>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Telegram Bot Token
                  </label>
                  <input
                    type="password"
                    value={tgToken}
                    onChange={(e) => setTgToken(e.target.value)}
                    placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ..."
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-slate-100 placeholder-slate-600 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Get token from <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-sky-400 underline">@BotFather</a> on Telegram.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Admin Telegram User ID
                  </label>
                  <input
                    type="text"
                    value={tgAdminId}
                    onChange={(e) => setTgAdminId(e.target.value)}
                    placeholder="e.g. 12345678"
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-slate-100 placeholder-slate-600 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Find your ID via <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer" className="text-sky-400 underline">@userinfobot</a>. Only this ID is authorized to interact with the bot.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleTestTg}
                  disabled={tgTesting || !tgToken || !tgAdminId}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all disabled:opacity-50"
                >
                  {tgTesting ? (
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  ) : (
                    <Bot className="w-4 h-4 text-sky-400" />
                  )}
                  <span>Test Telegram Bot</span>
                </button>

                <button
                  type="submit"
                  disabled={tgSaving}
                  className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-sky-500/20"
                >
                  {tgSaving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>

            </form>
          )}

          {/* TAB 3: ADMIN AUTHENTICATION SECURITY */}
          {activeTab === 'security' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md mx-auto">
              
              <div>
                <h3 className="text-sm font-bold text-slate-200 mb-1">Change Admin Password</h3>
                <p className="text-xs text-slate-400 mb-4">Update the master dashboard password.</p>
              </div>

              {pwdMsg && (
                <div
                  className={`p-3.5 rounded-2xl text-xs flex items-center gap-2 border ${
                    pwdMsg.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                  }`}
                >
                  {pwdMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{pwdMsg.text}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Current Password</label>
                <input
                  type="password"
                  value={currPassword}
                  onChange={(e) => setCurrPassword(e.target.value)}
                  placeholder="Current password"
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-2xl text-slate-100 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-2xl text-slate-100 text-sm"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={pwdLoading}
                className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl font-semibold text-xs transition-all shadow-lg shadow-purple-500/20"
              >
                {pwdLoading ? 'Updating Password...' : 'Update Admin Password'}
              </button>

            </form>
          )}

        </div>

      </div>
    </div>
  );
};
