import React, { useState, useEffect } from 'react';
import { Server, Activity, Clock, Zap, Copy, Check, ExternalLink, RefreshCw, Radio, ShieldCheck, Terminal, Lock } from 'lucide-react';

interface UptimeTabProps {
  onOpenLogin?: () => void;
  isPublicMode?: boolean;
}

export const UptimeTab: React.FC<UptimeTabProps> = ({ onOpenLogin, isPublicMode }) => {
  const [uptimeData, setUptimeData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const uptimeUrl = `${baseUrl}/api/uptime`;
  const cronFetchUrl = `${baseUrl}/api/uptime?fetch=true`;
  const vercelCronConfig = JSON.stringify(
    {
      crons: [
        {
          path: '/api/uptime?fetch=true',
          schedule: '0 0 * * *',
        },
      ],
    },
    null,
    2
  );

  const fetchUptimeStatus = async () => {
    setLoading(true);
    const start = Date.now();
    try {
      const res = await fetch('/api/uptime');
      const data = await res.json();
      setLatency(Date.now() - start);
      setUptimeData(data);
    } catch (e) {
      setUptimeData({ status: 'offline', error: 'Failed to reach server' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUptimeStatus();
    const interval = setInterval(fetchUptimeStatus, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(label);
    setTimeout(() => setCopiedUrl(null), 2500);
  };

  const formatUptimeSeconds = (sec: number) => {
    if (!sec) return '0s';
    const d = Math.floor(sec / (3600 * 24));
    const h = Math.floor((sec % (3600 * 24)) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);

    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Public Mode Navigation Header */}
      {isPublicMode && (
        <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-emerald-500 to-indigo-600 text-white shadow-md">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-extrabold text-white text-base">Reel Pulse Pro — System Status</h1>
              <p className="text-xs text-slate-400">Public Live Uptime Monitor & Cron Endpoint Guide</p>
            </div>
          </div>

          {onOpenLogin && (
            <button
              id="btn-public-admin-login"
              onClick={onOpenLogin}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs transition cursor-pointer border border-slate-700"
            >
              <Lock className="w-4 h-4 text-rose-400" />
              <span>Admin Login</span>
            </button>
          )}
        </div>
      )}

      {/* Hero Header */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl relative overflow-hidden space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-500/30">
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>24/7 Server Continuous Health & Uptime Hub</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Uptime Monitoring & Automated Crons
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-xl">
              Host your Reel Command Center on free cloud hosting (Vercel, Render, Cloud Run) and keep it online 24/7
              with external ping monitors like UptimeRobot, Cron-Job.org, or Vercel Crons.
            </p>
          </div>

          <button
            id="btn-test-uptime-ping"
            onClick={fetchUptimeStatus}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-600 to-indigo-600 hover:from-emerald-400 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-emerald-500/20 transition active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Pinging Server...' : 'Test Uptime Ping Now'}</span>
          </button>
        </div>

        {/* Live Status Overview Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>Service Status</span>
            </div>
            <div className="text-lg font-black text-emerald-400 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
              <span>{uptimeData?.status?.toUpperCase() || 'ONLINE'}</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Clock className="w-4 h-4 text-indigo-400" />
              <span>Server Uptime</span>
            </div>
            <div className="text-lg font-black text-white font-mono">
              {formatUptimeSeconds(uptimeData?.uptimeSeconds)}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Zap className="w-4 h-4 text-yellow-400" />
              <span>Response Latency</span>
            </div>
            <div className="text-lg font-black text-yellow-300 font-mono">
              {latency !== null ? `${latency} ms` : 'Testing...'}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="w-4 h-4 text-purple-400" />
              <span>Telegram Bot Polling</span>
            </div>
            <div className="text-lg font-black text-purple-300">
              {uptimeData?.telegramBot === 'active' ? '🟢 Active' : '⚪ Idle'}
            </div>
          </div>
        </div>
      </div>

      {/* Public Endpoints Card */}
      <div className="glass-panel p-6 rounded-3xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400">
            <Server className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-extrabold text-white text-base">Your Public Ping & Cron URLs</h3>
            <p className="text-xs text-slate-400">Paste these URLs into UptimeRobot or Cron-Job.org</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Uptime Ping URL */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px]">GET</span>
                <span>1. Standard Uptime Ping (Keeps Server Awake 24/7)</span>
              </span>
              <button
                id="btn-copy-uptime-url"
                onClick={() => handleCopy(uptimeUrl, 'uptime')}
                className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition cursor-pointer"
              >
                {copiedUrl === 'uptime' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedUrl === 'uptime' ? 'Copied!' : 'Copy URL'}</span>
              </button>
            </div>
            <code className="block p-3 rounded-xl bg-slate-950 text-emerald-400 text-xs font-mono break-all select-all border border-slate-800">
              {uptimeUrl}
            </code>
            <p className="text-[11px] text-slate-400">
              Configure in <b>UptimeRobot</b> (HTTP 5-minute interval check). Prevents serverless containers from sleeping.
            </p>
          </div>

          {/* Auto-Fetch Cron URL */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono text-[10px]">GET</span>
                <span>2. Automated Fetch & Telegram Dispatch Endpoint</span>
              </span>
              <button
                id="btn-copy-cron-fetch-url"
                onClick={() => handleCopy(cronFetchUrl, 'cronFetch')}
                className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition cursor-pointer"
              >
                {copiedUrl === 'cronFetch' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedUrl === 'cronFetch' ? 'Copied!' : 'Copy URL'}</span>
              </button>
            </div>
            <code className="block p-3 rounded-xl bg-slate-950 text-indigo-300 text-xs font-mono break-all select-all border border-slate-800">
              {cronFetchUrl}
            </code>
            <p className="text-[11px] text-slate-400">
              Configure in <b>Cron-Job.org</b> (Trigger every 24 hours / daily). Automatically fetches fresh statistics and alerts Telegram.
            </p>
          </div>
        </div>
      </div>

      {/* Free Setup Guides */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* UptimeRobot Guide */}
        <div className="glass-panel p-6 rounded-3xl space-y-4">
          <div className="flex items-center gap-2 text-emerald-400 font-extrabold text-sm">
            <ExternalLink className="w-4 h-4" />
            <span>Setup Guide: UptimeRobot (100% Free 24/7 Ping)</span>
          </div>
          <ol className="list-decimal list-inside space-y-2 text-xs text-slate-300 leading-relaxed">
            <li>Create a free account on <a href="https://uptimerobot.com" target="_blank" rel="noreferrer" className="text-indigo-400 underline font-semibold">UptimeRobot.com</a>.</li>
            <li>Click <b>+ Add New Monitor</b> and select <b>HTTP(s)</b>.</li>
            <li>Set <b>Friendly Name</b> to <code>Reel Command Center</code>.</li>
            <li>Paste your Uptime URL: <code className="text-emerald-300 bg-slate-900 px-1 rounded">{uptimeUrl}</code>.</li>
            <li>Set <b>Monitoring Interval</b> to <b>every 5 minutes</b>.</li>
            <li>Click <b>Create Monitor</b>. Done! Your server will stay active continuously.</li>
          </ol>
        </div>

        {/* Vercel Cron Guide */}
        <div className="glass-panel p-6 rounded-3xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-indigo-400 font-extrabold text-sm">
              <Terminal className="w-4 h-4" />
              <span>Vercel Deployments (vercel.json)</span>
            </div>
            <button
              id="btn-copy-vercel-json"
              onClick={() => handleCopy(vercelCronConfig, 'vercelJson')}
              className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition cursor-pointer"
            >
              {copiedUrl === 'vercelJson' ? 'Copied!' : 'Copy vercel.json'}
            </button>
          </div>
          <pre className="p-3 rounded-2xl bg-slate-950 text-indigo-300 font-mono text-[11px] overflow-x-auto border border-slate-800">
            {vercelCronConfig}
          </pre>
          <p className="text-[11px] text-slate-400">
            Save this snippet as <code>vercel.json</code> in your project root when deploying to Vercel.
          </p>
        </div>
      </div>

      {/* Recommended 24/7 Free Hosting Services Guide */}
      <div className="glass-panel p-6 rounded-3xl space-y-4 border border-indigo-500/30">
        <div className="flex items-center gap-2.5 text-indigo-300 font-bold text-sm">
          <Server className="w-5 h-5 text-indigo-400" />
          <span>Recommended Free 24/7 Node.js Hosting (Better than Vercel)</span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          <b>Why Vercel struggles:</b> Vercel is a serverless platform designed for static sites. It kills long-polling Telegram bots and background timers after 10 seconds. For a full-stack Express app with Telegram bot listeners, use one of these <b>100% free continuous hosts</b>:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          {/* Render.com */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-xs text-white">1. Render.com</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">Free Tier</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Runs native 24/7 Node.js processes. Connect your GitHub repo, set Build command to <code>npm run build</code>, and Start command to <code>npm run start</code>.
            </p>
          </div>

          {/* Koyeb */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-xs text-white">2. Koyeb.com</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">Free Instance</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Ultra-fast container hosting with zero sleeping on free tier. Automatically builds and runs Express apps directly from GitHub.
            </p>
          </div>

          {/* Railway */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-xs text-white">3. Railway.app</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">Free Trial</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Zero configuration required. Connect GitHub and deploy with a single click. Ideal for background bots.
            </p>
          </div>
        </div>
      </div>

      {/* Raw Response Live Monitor Terminal */}
      <div className="glass-panel p-6 rounded-3xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-white text-xs uppercase tracking-wider flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span>Live Uptime Endpoint Diagnostic Terminal</span>
          </h3>
          <span className="text-[10px] text-slate-500 font-mono">GET /api/uptime</span>
        </div>

        <pre className="p-4 rounded-2xl bg-slate-950 text-emerald-400 text-xs font-mono overflow-x-auto border border-slate-800 max-h-64 select-all">
          {JSON.stringify(uptimeData || { status: 'loading...' }, null, 2)}
        </pre>
      </div>
    </div>
  );
};
