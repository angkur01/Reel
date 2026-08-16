import React, { useState } from 'react';
import { Brain, Sparkles, Zap, Shield, Bell, Send, Check, RefreshCw, AlertCircle } from 'lucide-react';
import { AiSettings, AiMeta, AiLog } from '../types';

interface AiBrainTabProps {
  aiSettings: AiSettings | null;
  aiMeta: AiMeta | null;
  aiLogs: AiLog[];
  onSaveAiSettings: (settings: Partial<AiSettings>) => Promise<void>;
  onRunAiCheck: () => Promise<void>;
  isRunningAiCheck: boolean;
  onGenerateDailyReport: () => Promise<void>;
  isGeneratingReport: boolean;
}

export const AiBrainTab: React.FC<AiBrainTabProps> = ({
  aiSettings,
  aiMeta,
  aiLogs,
  onSaveAiSettings,
  onRunAiCheck,
  isRunningAiCheck,
  onGenerateDailyReport,
  isGeneratingReport,
}) => {
  const [geminiKey, setGeminiKey] = useState(aiSettings?.geminiApiKey || '');
  const [groqKey, setGroqKey] = useState(aiSettings?.groqApiKey || aiSettings?.grokApiKey || '');
  const [sensitivity, setSensitivity] = useState<'low' | 'medium' | 'high'>(
    aiSettings?.alertSensitivity || 'medium'
  );
  const [modelPref, setModelPref] = useState<'auto' | 'groq_first' | 'gemini_first' | 'grok_first'>(
    aiSettings?.modelPreference || 'groq_first'
  );
  const [limit, setLimit] = useState(aiSettings?.dailyCheckLimit || 50);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [isTestingGroq, setIsTestingGroq] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveAiSettings({
        geminiApiKey: geminiKey,
        groqApiKey: groqKey,
        grokApiKey: groqKey,
        alertSensitivity: sensitivity,
        modelPreference: modelPref,
        dailyCheckLimit: Number(limit),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestGroq = async () => {
    setIsTestingGroq(true);
    setTestResult(null);
    try {
      const token = localStorage.getItem('admin_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/ai/test', {
        method: 'POST',
        headers,
        body: JSON.stringify({ apiKey: groqKey, model: 'groq' }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({ success: true, message: data.response || 'Groq Cloud API connected successfully!' });
      } else {
        setTestResult({ success: false, message: data.error || 'Groq connection failed' });
      }
    } catch (e: any) {
      setTestResult({ success: false, message: e.message || 'Network request failed' });
    } finally {
      setIsTestingGroq(false);
    }
  };

  const checksUsed = aiMeta?.checksUsedToday || 0;
  const maxLimit = aiSettings?.dailyCheckLimit || 50;

  return (
    <div className="space-y-6 pb-16">
      {/* Hero Header */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl relative overflow-hidden space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-xs font-semibold border border-purple-500/30">
              <Brain className="w-3.5 h-3.5 text-purple-400" />
              <span>AI Autonomous Brain & Alert Dispatch</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Autonomous AI Monitor Engine
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-xl">
              Powered by Groq Cloud API (Llama-3.3-70B) & Google Gemini 2.5 Flash for high-speed performance monitoring.
              Strictly limited to {maxLimit} checks per day.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <button
              id="btn-run-ai-check-tab"
              onClick={onRunAiCheck}
              disabled={isRunningAiCheck}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-600 hover:from-indigo-400 hover:to-pink-500 text-white font-bold text-xs shadow-lg shadow-indigo-500/30 transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <Brain className={`w-4 h-4 ${isRunningAiCheck ? 'animate-spin' : ''}`} />
              <span>{isRunningAiCheck ? 'AI Analyzing...' : 'Run AI Analysis Check'}</span>
            </button>

            <button
              id="btn-generate-daily-report"
              onClick={onGenerateDailyReport}
              disabled={isGeneratingReport}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-slate-900 border border-slate-700 hover:border-indigo-500 text-indigo-300 font-bold text-xs transition active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{isGeneratingReport ? 'Generating Report...' : 'Send Daily Report'}</span>
            </button>
          </div>
        </div>

        {/* Meter Gauge */}
        <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 font-bold flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>Daily AI Check Allowance</span>
            </span>
            <span className="font-mono text-indigo-400 font-extrabold text-sm">
              {checksUsed} / {maxLimit} Checks Used Today
            </span>
          </div>

          <div className="w-full bg-slate-900 h-3 rounded-full overflow-hidden p-0.5 border border-slate-800">
            <div
              className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, (checksUsed / maxLimit) * 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-500">
            <span>Resets daily at 00:00 UTC</span>
            <span>Telegram Force Refreshes do NOT consume this allowance</span>
          </div>
        </div>
      </div>

      {/* Model Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Groq Cloud Card */}
        <div className="glass-panel p-6 rounded-3xl space-y-4 border border-purple-500/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-purple-500/10 text-purple-400">
                <Zap className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <h3 className="font-extrabold text-white text-base">Groq Cloud API</h3>
                <p className="text-xs text-slate-400">Ultra-fast Llama-3.3-70B Engine</p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-300 text-xs font-bold border border-purple-500/30">
              PRIMARY ENGINE
            </span>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-medium">Groq API Key (gsk_...)</label>
            <div className="flex gap-2">
              <input
                id="input-groq-key"
                type="password"
                value={groqKey}
                onChange={(e) => setGroqKey(e.target.value)}
                placeholder="Enter Groq API Key (gsk_...)"
                className="w-full px-4 py-2.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-purple-500"
              />
              <button
                id="btn-test-groq"
                type="button"
                onClick={handleTestGroq}
                disabled={isTestingGroq}
                className="px-4 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shrink-0 transition disabled:opacity-50 cursor-pointer"
              >
                {isTestingGroq ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Test Key'}
              </button>
            </div>
            {testResult && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  testResult.success
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}
              >
                {testResult.success ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* Gemini Card */}
        <div className="glass-panel p-6 rounded-3xl space-y-4 border border-indigo-500/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-400">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-white text-base">Google Gemini 2.5 Flash</h3>
                <p className="text-xs text-slate-400">Secondary AI Reasoning Engine</p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30">
              OPERATIONAL
            </span>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-medium">Gemini API Key (Server Secret)</label>
            <input
              id="input-gemini-key"
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="System default GEMINI_API_KEY or enter custom..."
              className="w-full px-4 py-2.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* AI Controls & Sensitivity */}
      <div className="glass-panel p-6 rounded-3xl space-y-6">
        <h3 className="font-extrabold text-white text-base flex items-center gap-2">
          <Brain className="w-5 h-5 text-indigo-400" />
          <span>AI Decision & Alert Sensitivity Settings</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Model Preference */}
          <div className="space-y-2">
            <label className="text-xs text-slate-300 font-bold">Model Fallback Behavior</label>
            <select
              id="select-model-preference"
              value={modelPref}
              onChange={(e) => setModelPref(e.target.value as any)}
              className="w-full py-2.5 px-3 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="groq_first">Groq Primary (Default → Gemini Fallback)</option>
              <option value="auto">Auto Selection</option>
              <option value="gemini_first">Gemini Primary (→ Groq Fallback)</option>
            </select>
          </div>

          {/* Alert Sensitivity */}
          <div className="space-y-2">
            <label className="text-xs text-slate-300 font-bold">Alert Sensitivity Level</label>
            <select
              id="select-alert-sensitivity"
              value={sensitivity}
              onChange={(e) => setSensitivity(e.target.value as any)}
              className="w-full py-2.5 px-3 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="low">Low (Only major milestones & 100k+ spikes)</option>
              <option value="medium">Medium (Standard viral & 20k+ spikes)</option>
              <option value="high">High (Notify on any 5k+ view increase)</option>
            </select>
          </div>

          {/* Daily Limit Cap */}
          <div className="space-y-2">
            <label className="text-xs text-slate-300 font-bold">Daily Check Limit (Max 100)</label>
            <input
              id="input-daily-check-limit"
              type="number"
              min="1"
              max="100"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-full px-4 py-2 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          {saveSuccess && (
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
              <Check className="w-4 h-4" /> AI Settings Saved!
            </span>
          )}
          <button
            id="btn-save-ai-settings"
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs shadow-lg transition cursor-pointer disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save AI Settings'}
          </button>
        </div>
      </div>

      {/* AI Log Feed */}
      <div className="glass-panel p-6 rounded-3xl space-y-4">
        <h3 className="font-extrabold text-white text-base flex items-center gap-2">
          <Bell className="w-5 h-5 text-purple-400" />
          <span>AI Insight History Log</span>
        </h3>

        {aiLogs.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs">
            No AI insights recorded yet. Click "Run AI Analysis Check" above!
          </div>
        ) : (
          <div className="space-y-3">
            {aiLogs.map((log) => (
              <div
                key={log.id}
                className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 font-mono text-[10px] uppercase font-bold">
                      {log.modelUsed}
                    </span>
                    <span className="font-bold text-xs text-white">{log.headline}</span>
                  </div>
                  <span className="text-[10px] text-slate-500">{new Date(log.timestamp).toLocaleString()}</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{log.message}</p>
                {log.sentToTelegram && (
                  <div className="text-[10px] text-emerald-400 font-medium">
                    ✓ Dispatched to Telegram Admin
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
