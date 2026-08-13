import { SystemLogEntry } from '../types.js';

const MAX_LOGS_IN_MEMORY = 1000;
const systemLogs: SystemLogEntry[] = [];

// Listeners for SSE or polling
type LogListener = (entry: SystemLogEntry) => void;
const listeners: Set<LogListener> = new Set();

export function logSystemEvent(
  level: 'info' | 'warn' | 'error' | 'success',
  category: 'scraper' | 'provider' | 'telegram' | 'ai' | 'auth' | 'scheduler' | 'database' | 'http',
  message: string,
  details?: any,
  metadata?: SystemLogEntry['metadata'],
  durationMs?: number
): SystemLogEntry {
  const entry: SystemLogEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    details: details ? (typeof details === 'string' ? details : JSON.stringify(details, null, 2)) : undefined,
    durationMs,
    metadata,
  };

  systemLogs.unshift(entry);
  if (systemLogs.length > MAX_LOGS_IN_MEMORY) {
    systemLogs.pop();
  }

  // Also print clean console output
  const prefix = `[${entry.category.toUpperCase()}] [${entry.level.toUpperCase()}]`;
  if (level === 'error') {
    console.error(`${prefix} ${message}`, details || '');
  } else if (level === 'warn') {
    console.warn(`${prefix} ${message}`, details || '');
  } else {
    console.log(`${prefix} ${message}`);
  }

  listeners.forEach(fn => {
    try {
      fn(entry);
    } catch (e) {}
  });

  return entry;
}

export function getSystemLogs(filters?: {
  category?: string;
  level?: string;
  search?: string;
  limit?: number;
  sinceTimestamp?: string;
}): { logs: SystemLogEntry[]; total: number; metrics: { total: number; errors: number; successes: number; scrapers: number } } {
  let result = [...systemLogs];

  if (filters?.category && filters.category !== 'all') {
    result = result.filter(l => l.category === filters.category);
  }

  if (filters?.level && filters.level !== 'all') {
    result = result.filter(l => l.level === filters.level);
  }

  if (filters?.sinceTimestamp) {
    const sinceTime = new Date(filters.sinceTimestamp).getTime();
    result = result.filter(l => new Date(l.timestamp).getTime() > sinceTime);
  }

  if (filters?.search && filters.search.trim()) {
    const q = filters.search.toLowerCase().trim();
    result = result.filter(l =>
      l.message.toLowerCase().includes(q) ||
      (l.details && l.details.toLowerCase().includes(q)) ||
      (l.metadata?.reelName && l.metadata.reelName.toLowerCase().includes(q)) ||
      (l.metadata?.providerName && l.metadata.providerName.toLowerCase().includes(q)) ||
      (l.metadata?.url && l.metadata.url.toLowerCase().includes(q))
    );
  }

  const metrics = {
    total: systemLogs.length,
    errors: systemLogs.filter(l => l.level === 'error').length,
    successes: systemLogs.filter(l => l.level === 'success').length,
    scrapers: systemLogs.filter(l => l.category === 'scraper' || l.category === 'provider').length,
  };

  const limit = filters?.limit || 200;
  return {
    logs: result.slice(0, limit),
    total: result.length,
    metrics,
  };
}

export function clearSystemLogs(): void {
  systemLogs.length = 0;
  logSystemEvent('info', 'scheduler', 'System logs cleared by administrator.');
}
