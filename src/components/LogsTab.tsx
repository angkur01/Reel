import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Terminal,
  Activity,
  Search,
  Filter,
  Trash2,
  Download,
  RefreshCw,
  Play,
  Pause,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Server,
  Bot,
  Brain,
  Clock,
  Database,
  Lock,
  Globe,
  ExternalLink,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { SystemLogEntry } from '../types';

interface LogsTabProps {
  authFetch: (url: string, options?: RequestInit, timeoutMs?: number) => Promise<Response>;
}

export const LogsTab: React.FC<LogsTabProps> = ({ authFetch }) => {
  const [logs, setLogs] = useState<SystemLogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isLiveStreaming, setIsLiveStreaming] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const [testUrlInput, setTestUrlInput] = useState<string>('https://www.instagram.com/reel/Db6jlRLFM5X/');
  const [isTestingFetch, setIsTestingFetch] = useState<boolean>(false);
  const [testFeedback, setTestFeedback] = useState<string | null>(null);

  const autoScrollRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState<boolean>(false);

  // Fetch Logs from Server
  const fetchLogs = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await authFetch('/api/system/logs?limit=300');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.logs)) {
          setLogs(data.logs);
        }
      }
    } catch (err) {
      console.warn('[Logs] Failed to fetch system logs:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Initial Load & Live Streaming Poller
  useEffect(() => {
    fetchLogs(false);
  }, []);

  useEffect(() => {
    if (!isLiveStreaming) return;
    const interval = setInterval(() => {
      fetchLogs(true);
    }, 3000);
    return () => clearInterval(interval);
  }, [isLiveStreaming]);

  // Handle Auto Scroll
  useEffect(() => {
    if (autoScroll && autoScrollRef.current) {
      autoScrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Clear Logs
  const handleClearLogs = async () => {
    if (!window.confirm('Are you sure you want to clear all server logs?')) return;
    setIsClearing(true);
    try {
      const res = await authFetch('/api/system/logs/clear', { method: 'POST' });
      if (res.ok) {
        setLogs([]);
        await fetchLogs(false);
      }
    } catch (e) {
      console.error('Failed to clear logs:', e);
    } finally {
      setIsClearing(false);
    }
  };

  // Export Logs as JSON
  const handleExportLogs = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `reel-system-logs-${new Date().toISOString().slice(0, 19)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Copy Snippet to Clipboard
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Quick Test Fetch Trigger directly from Logs Console
  const handleTriggerTestFetch = async () => {
    if (!testUrlInput.trim()) return;
    setIsTestingFetch(true);
    setTestFeedback(null);
    try {
      const res = await authFetch('/api/providers/test-raw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testUrl: testUrlInput.trim(),
          provider: {
            baseUrl: 'https://reel-production-1a03.up.railway.app',
            endpointPath: '/fetch',
            method: 'GET',
            apiKeyLocation: 'header_x_api_key',
            urlParamName: 'url',
          },
        }),
      });
      const data = await res.json();
      if (data.success && data.result?.success) {
        setTestFeedback(`✅ Scrape Successful! Extracted ${data.result.parsedData?.views?.toLocaleString() || 0} views.`);
      } else {
        setTestFeedback(`❌ Scrape Result: ${data.result?.errorMessage || data.error || 'Failed'}`);
      }
      fetchLogs(true);
    } catch (e: any) {
      setTestFeedback(`❌ Network Exception: ${e.message}`);
    } finally {
      setIsTestingFetch(false);
    }
  };

  // Metrics Calculations
  const metrics = useMemo(() => {
    const total = logs.length;
    const errors = logs.filter((l) => l.level === 'error').length;
    const warns = logs.filter((l) => l.level === 'warn').length;
    const successes = logs.filter((l) => l.level === 'success').length;
    const scraperLogs = logs.filter((l) => l.category === 'scraper' || l.category === 'provider');
    const successRate = scraperLogs.length > 0
      ? Math.round((scraperLogs.filter((l) => l.level === 'success').length / scraperLogs.length) * 100)
      : 100;

    return { total, errors, warns, successes, scraperCount: scraperLogs.length, successRate };
  }, [logs]);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Category filter
      if (selectedCategory !== 'all') {
        if (selectedCategory === 'scraper_group') {
          if (log.category !== 'scraper' && log.category !== 'provider') return false;
        } else if (log.category !== selectedCategory) {
          return false;
        }
      }

      // Level filter
      if (selectedLevel !== 'all' && log.level !== selectedLevel) {
        return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const msg = log.message.toLowerCase();
        const details = (log.details || '').toLowerCase();
        const reel = (log.metadata?.reelName || '').toLowerCase();
        const provider = (log.metadata?.providerName || '').toLowerCase();
        const url = (log.metadata?.url || '').toLowerCase();
        if (!msg.includes(q) && !details.includes(q) && !reel.includes(q) && !provider.includes(q) && !url.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [logs, selectedCategory, selectedLevel, searchQuery]);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'scraper':
      case 'provider':
        return <Globe className="w-3.5 h-3.5 text-cyan-400" />;
      case 'telegram':
        return <Bot className="w-3.5 h-3.5 text-sky-400" />;
      case 'ai':
        return <Brain className="w-3.5 h-3.5 text-purple-400" />;
      case 'scheduler':
        return <Clock className="w-3.5 h-3.5 text-amber-400" />;
      case 'database':
        return <Database className="w-3.5 h-3.5 text-emerald-400" />;
      case 'auth':
        return <Lock className="w-3.5 h-3.5 text-rose-400" />;
      default:
        return <Activity className="w-3.5 h-3.5 text-indigo-400" />;
    }
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <XCircle className="w-3 h-3" /> Error
          </span>
        );
      case 'warn':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-3 h-3" /> Warning
          </span>
        );
      case 'success':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> Success
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
            <Info className="w-3 h-3" /> Info
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Banner & Header */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-indigo-600/10 via-purple-600/10 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="p-2 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/20">
                <Terminal className="w-5 h-5" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                Live System & Scraper Logs Console
              </h2>
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Live Engine
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
              Inspect real-time execution logs for yt-dlp microservice scrapers, Telegram bot notifications, AI monitoring audits, scheduler cron jobs, and database sync events.
            </p>
          </div>

          {/* Top Quick Controls */}
          <div className="flex items-center flex-wrap gap-2">
            {/* Live Streaming Toggle */}
            <button
              id="btn-toggle-live-logs"
              onClick={() => setIsLiveStreaming(!isLiveStreaming)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                isLiveStreaming
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/10'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
              title={isLiveStreaming ? 'Click to Pause Live Stream' : 'Click to Resume Live Stream'}
            >
              {isLiveStreaming ? (
                <>
                  <Pause className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Streaming (3s)</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 text-slate-400" />
                  <span>Stream Paused</span>
                </>
              )}
            </button>

            {/* Manual Refresh */}
            <button
              id="btn-refresh-logs"
              onClick={() => fetchLogs(false)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-300 transition"
              title="Refresh Logs Now"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
              <span>Refresh</span>
            </button>

            {/* Export Logs */}
            <button
              id="btn-export-logs"
              onClick={handleExportLogs}
              disabled={logs.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-300 transition disabled:opacity-50"
              title="Export all logs as JSON"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>

            {/* Clear Logs */}
            <button
              id="btn-clear-logs"
              onClick={handleClearLogs}
              disabled={isClearing || logs.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs font-semibold text-rose-300 transition disabled:opacity-50"
              title="Clear all stored logs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          </div>
        </div>

        {/* Realtime KPI Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-4 border-t border-slate-800/80">
          <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/80">
            <span className="text-[11px] font-medium text-slate-400 block">Total Logs Captured</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xl font-bold text-white font-mono">{metrics.total}</span>
              <span className="text-[10px] text-slate-500">records</span>
            </div>
          </div>

          <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/80">
            <span className="text-[11px] font-medium text-slate-400 block">Scraper Requests</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xl font-bold text-cyan-300 font-mono">{metrics.scraperCount}</span>
              <span className="text-[10px] text-emerald-400 font-semibold">{metrics.successRate}% OK</span>
            </div>
          </div>

          <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/80">
            <span className="text-[11px] font-medium text-slate-400 block">Successful Executions</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xl font-bold text-emerald-400 font-mono">{metrics.successes}</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
          </div>

          <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/80">
            <span className="text-[11px] font-medium text-slate-400 block">Errors & Warnings</span>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xl font-bold font-mono ${metrics.errors > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                {metrics.errors}
              </span>
              {metrics.errors > 0 ? (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300">Action needed</span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300">Clean</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Scraper Live Test Bar */}
      <div className="glass-panel p-4 rounded-2xl border border-slate-800 bg-slate-900/40">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300 shrink-0">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>Test Scraper Live:</span>
          </div>
          <input
            type="text"
            value={testUrlInput}
            onChange={(e) => setTestUrlInput(e.target.value)}
            placeholder="https://www.instagram.com/reel/..."
            className="flex-1 px-3 py-2 text-xs bg-slate-950/80 border border-slate-700/80 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={handleTriggerTestFetch}
            disabled={isTestingFetch || !testUrlInput.trim()}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold transition disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0 shadow-md shadow-indigo-500/20"
          >
            {isTestingFetch ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Extracting...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Execute Scrape & Log</span>
              </>
            )}
          </button>
        </div>
        {testFeedback && (
          <div className="mt-2 text-xs font-mono px-3 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800 text-slate-300">
            {testFeedback}
          </div>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="glass-panel p-4 rounded-2xl border border-slate-800 bg-slate-900/50 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search logs by keyword, reel name, provider, error message, URL, or status..."
            className="w-full pl-10 pr-4 py-2 text-xs bg-slate-950/70 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-200"
            >
              Clear
            </button>
          )}
        </div>

        {/* Category & Level Dropdowns / Buttons */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Category Selector */}
          <div className="flex items-center gap-1.5 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-500 pl-2">Type:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent text-xs text-slate-200 font-semibold focus:outline-none py-1 pr-2 cursor-pointer"
            >
              <option value="all" className="bg-slate-900 text-slate-200">All Categories ({logs.length})</option>
              <option value="scraper_group" className="bg-slate-900 text-slate-200">🕷️ Scrapers & Providers</option>
              <option value="telegram" className="bg-slate-900 text-slate-200">🤖 Telegram Bot</option>
              <option value="ai" className="bg-slate-900 text-slate-200">🧠 AI Brain Audits</option>
              <option value="scheduler" className="bg-slate-900 text-slate-200">⏰ Scheduler & Cron</option>
              <option value="database" className="bg-slate-900 text-slate-200">🗄️ Firestore Database</option>
              <option value="auth" className="bg-slate-900 text-slate-200">🔒 Auth & Security</option>
            </select>
          </div>

          {/* Level Selector */}
          <div className="flex items-center gap-1.5 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-500 pl-2">Level:</span>
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="bg-transparent text-xs text-slate-200 font-semibold focus:outline-none py-1 pr-2 cursor-pointer"
            >
              <option value="all" className="bg-slate-900 text-slate-200">All Levels</option>
              <option value="error" className="bg-slate-900 text-rose-400">❌ Error ({metrics.errors})</option>
              <option value="warn" className="bg-slate-900 text-amber-400">⚠️ Warning ({metrics.warns})</option>
              <option value="success" className="bg-slate-900 text-emerald-400">✅ Success ({metrics.successes})</option>
              <option value="info" className="bg-slate-900 text-indigo-400">ℹ️ Info</option>
            </select>
          </div>
        </div>
      </div>

      {/* Logs Stream List */}
      <div className="glass-panel rounded-2xl border border-slate-800 bg-slate-950/70 overflow-hidden shadow-2xl">
        {/* Terminal Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 text-xs">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
            </div>
            <span className="font-mono text-slate-400 text-[11px] ml-2">system.log ~ /var/log/reelpulse</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-400 font-mono">
              Showing <strong className="text-white">{filteredLogs.length}</strong> of {logs.length} events
            </span>
          </div>
        </div>

        {/* Logs Scrollable Container */}
        <div className="p-3 max-h-[600px] overflow-y-auto space-y-2 font-mono text-xs scrollbar-thin">
          {loading && logs.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-3">
              <RefreshCw className="w-8 h-8 mx-auto animate-spin text-indigo-400" />
              <p>Connecting to system logging bus...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-16 text-center text-slate-500 space-y-2">
              <Terminal className="w-8 h-8 mx-auto text-slate-600" />
              <p className="text-sm font-semibold text-slate-400">No log entries found matching criteria</p>
              <p className="text-xs text-slate-600">Try adjusting your category filter, level filter, or search query.</p>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              const hasDetails = Boolean(log.details || log.metadata);
              const formattedTime = new Date(log.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                fractionalSecondDigits: 3,
              });
              const formattedDate = new Date(log.timestamp).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
              });

              return (
                <div
                  key={log.id}
                  id={`log-entry-${log.id}`}
                  className={`rounded-xl p-3 transition-all border ${
                    log.level === 'error'
                      ? 'bg-rose-950/20 border-rose-500/30 hover:border-rose-500/50'
                      : log.level === 'warn'
                      ? 'bg-amber-950/20 border-amber-500/30 hover:border-amber-500/50'
                      : log.level === 'success'
                      ? 'bg-emerald-950/15 border-emerald-500/20 hover:border-emerald-500/40'
                      : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    {/* Timestamp & Metadata Badges */}
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="text-[11px] text-slate-400 font-mono bg-slate-950/60 px-2 py-0.5 rounded border border-slate-800">
                        {formattedDate} {formattedTime}
                      </span>
                      {getLevelBadge(log.level)}

                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-800/80 text-slate-300 border border-slate-700/80">
                        {getCategoryIcon(log.category)}
                        <span>{log.category}</span>
                      </span>

                      {log.durationMs !== undefined && (
                        <span className="text-[10px] text-slate-400 font-mono">
                          {log.durationMs}ms
                        </span>
                      )}

                      {log.metadata?.httpStatus && (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${
                            log.metadata.httpStatus >= 200 && log.metadata.httpStatus < 300
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : log.metadata.httpStatus === 404
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          HTTP {log.metadata.httpStatus}
                        </span>
                      )}

                      {log.metadata?.providerName && (
                        <span className="text-[11px] text-cyan-300 font-semibold">
                          [{log.metadata.providerName}]
                        </span>
                      )}

                      {log.metadata?.reelName && (
                        <span className="text-[11px] text-indigo-300 font-medium">
                          🎬 {log.metadata.reelName}
                        </span>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 self-end sm:self-auto">
                      <button
                        onClick={() => handleCopy(log.details || log.message, log.id)}
                        className="p-1 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition"
                        title="Copy message"
                      >
                        {copiedId === log.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>

                      {hasDetails && (
                        <button
                          onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold transition"
                        >
                          <span>{isExpanded ? 'Hide Payload' : 'Inspect'}</span>
                          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Primary Message */}
                  <div className="mt-2 text-xs text-slate-200 font-medium whitespace-pre-wrap break-words leading-relaxed">
                    {log.message}
                  </div>

                  {/* Expanded Payload Inspector */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                          Detailed Structured Payload / Inspector
                        </span>
                        <button
                          onClick={() => handleCopy(log.details || JSON.stringify(log, null, 2), `${log.id}-payload`)}
                          className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                        >
                          {copiedId === `${log.id}-payload` ? 'Copied JSON!' : 'Copy Full JSON'}
                        </button>
                      </div>

                      {log.details && (
                        <pre className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 text-[11px] text-slate-300 font-mono overflow-x-auto whitespace-pre-wrap max-h-60">
                          {log.details}
                        </pre>
                      )}

                      {log.metadata && (
                        <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                          {log.metadata.url && (
                            <div>
                              <span className="text-slate-500 block text-[10px]">URL:</span>
                              <span className="text-slate-300 break-all">{log.metadata.url}</span>
                            </div>
                          )}
                          {log.metadata.stats && (
                            <div>
                              <span className="text-slate-500 block text-[10px]">Parsed Stats:</span>
                              <span className="text-emerald-400 font-bold">
                                {log.metadata.stats.views?.toLocaleString()} Views | {log.metadata.stats.likes?.toLocaleString()} Likes | {log.metadata.stats.comments?.toLocaleString()} Comments
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={autoScrollRef} />
        </div>
      </div>
    </div>
  );
};
