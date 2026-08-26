import fs from 'fs';
import path from 'path';
import os from 'os';
import bcrypt from 'bcryptjs';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, onSnapshot, terminate } from 'firebase/firestore';
import { Reel, ApiProvider, TelegramSettings, FetchLog, AiSettings, AiMeta, AiLog, ReelHistoryPoint, CpmCampaign, InstagramAccount } from '../types.js';
import { recalculateAllDbReelsCpm } from './cpm.js';

export interface DatabaseSchema {
  auth: {
    adminPasswordHash: string;
    sessionSecret: string;
    sessions?: Record<string, number>;
  };
  reels: Reel[];
  cpmCampaigns?: CpmCampaign[];
  instagramAccounts?: InstagramAccount[];
  providers: ApiProvider[];
  telegram: TelegramSettings;
  aiSettings: AiSettings;
  aiMeta: AiMeta;
  aiLogs: AiLog[];
  history: ReelHistoryPoint[];
  logs: FetchLog[];
  meta: {
    lastAutoFetchAt: string | null;
    globalFeePercent?: number;
    scheduleIntervalHours?: number;
    deletedReelIds?: string[];
    deletedCampaignIds?: string[];
    deletedProviderIds?: string[];
    deletedAccountIds?: string[];
  };
}

let activeDbPath: string | null = null;
let firestoreDb: any = null;
let firestoreInitialized = false;
let firestoreQuotaExceeded = false;
let firestoreUnsubscribe: (() => void) | null = null;
let cachedDb: DatabaseSchema | null = null;
let lastLocalWriteAt = 0;
let firestoreSyncTimeout: NodeJS.Timeout | null = null;

export function isFirestoreQuotaExceeded(): boolean {
  return firestoreQuotaExceeded;
}

function getDbFilePath(): string {
  if (activeDbPath) return activeDbPath;

  const primaryDir = path.resolve(process.cwd(), 'data');
  const primaryFile = path.join(primaryDir, 'db.json');

  try {
    if (!fs.existsSync(primaryDir)) {
      fs.mkdirSync(primaryDir, { recursive: true });
    }
    const testFile = path.join(primaryDir, '.write-test');
    fs.writeFileSync(testFile, 'test', 'utf-8');
    fs.unlinkSync(testFile);
    activeDbPath = primaryFile;
    return activeDbPath;
  } catch (err) {
    console.warn('[DB] Primary data directory is read-only. Falling back to temporary directory for local cache.');
    const tmpDir = path.join(os.tmpdir(), 'reel-tracker-data');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    activeDbPath = path.join(tmpDir, 'db.json');
    return activeDbPath;
  }
}

// Initial default configuration
const defaultSessionSecret = process.env.ADMIN_SESSION_SECRET || (Math.random().toString(36).substring(2) + Date.now().toString(36));
const customAdminPassword = process.env.ADMIN_PASSWORD || "admin123";
const defaultPasswordHash = bcrypt.hashSync(customAdminPassword, 10);

const defaultProviders: ApiProvider[] = [
  {
    id: 'provider_ytdlp_microservice',
    name: '🐍 yt-dlp Microservice (Railway / Docker)',
    baseUrl: process.env.YTDLP_MICROSERVICE_URL || 'https://your-ytdlp-scraper.up.railway.app',
    endpointPath: '/fetch',
    method: 'GET',
    apiKey: process.env.YTDLP_API_KEY || '',
    apiKeyLocation: 'header_x_api_key',
    urlParamName: 'url',
    headersJson: '{\n  "Accept": "application/json"\n}',
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
    enabled: Boolean(process.env.YTDLP_MICROSERVICE_URL),
    priority: 1,
    lastTestedAt: null,
    lastTestStatus: null,
    lastTestError: null,
  },
  {
    id: 'provider_refetcher_default',
    name: 'Refetcher API (Default)',
    baseUrl: process.env.PROVIDER_BASE_URL || 'https://api.refetcher.com',
    endpointPath: '/',
    method: 'POST',
    apiKey: process.env.PROVIDER_API_KEY || '',
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
    enabled: true,
    priority: 2,
    lastTestedAt: null,
    lastTestStatus: null,
    lastTestError: null,
  },
  {
    id: 'provider_rapidapi_default',
    name: 'RapidAPI Instagram Scraper',
    baseUrl: 'https://instagram-scraper-api2.p.rapidapi.com',
    endpointPath: '/v1/post_info',
    method: 'GET',
    apiKey: process.env.RAPIDAPI_KEY || '',
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
    enabled: false,
    priority: 3,
    lastTestedAt: null,
    lastTestStatus: null,
    lastTestError: null,
  }
];

const defaultTelegram: TelegramSettings = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  adminTelegramId: process.env.TELEGRAM_ADMIN_ID || '',
  enabled: Boolean(process.env.TELEGRAM_BOT_TOKEN),
};

const defaultAiSettings: AiSettings = {
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  grokApiKey: process.env.GROK_API_KEY || process.env.GROQ_API_KEY || '',
  groqApiKey: process.env.GROQ_API_KEY || '',
  enableGemini: true,
  enableGrok: true,
  dailyCheckLimit: 50,
  alertSensitivity: 'medium',
  modelPreference: 'auto',
};

const defaultAiMeta: AiMeta = {
  checksUsedToday: 0,
  lastCheckDate: new Date().toISOString().slice(0, 10),
  lastAiAnalysisAt: null,
  activeModelUsed: 'gemini',
};

export function sanitizeForFirestore<T = any>(data: T): T {
  if (data === undefined) {
    return null as any;
  }
  if (data === null || typeof data !== 'object') {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForFirestore(item)) as any;
  }
  const cleanObj: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) {
      continue;
    }
    cleanObj[key] = sanitizeForFirestore(value);
  }
  return cleanObj as T;
}

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function extractInstagramShortcode(rawUrlOrId: string): string {
  if (!rawUrlOrId) return '';
  const clean = rawUrlOrId.trim();
  // Match shortcode from various Instagram URL formats (/reel/CODE, /p/CODE, /tv/CODE, /share/reel/CODE, etc.)
  const match = clean.match(/(?:instagram\.com\/)?(?:reel|p|tv|share\/reel)\/([A-Za-z0-9_-]+)/i);
  if (match && match[1]) {
    return match[1].replace(/\/+$/, '').trim();
  }
  // If it's already a clean alphanumeric shortcode (e.g., C-abc123)
  if (/^[A-Za-z0-9_-]{5,40}$/.test(clean) && !clean.includes('.') && !clean.includes('/')) {
    return clean;
  }
  // Fallback: strip query params & trailing slashes
  const noQuery = clean.split('?')[0].split('#')[0].replace(/\/+$/, '');
  const parts = noQuery.split('/');
  return parts[parts.length - 1] || clean;
}

export function canonicalizeInstagramReelUrl(rawUrlOrId: string): string {
  const shortcode = extractInstagramShortcode(rawUrlOrId);
  if (shortcode && shortcode.length >= 5) {
    return `https://www.instagram.com/reel/${shortcode}/`;
  }
  return normalizeInstagramUrl(rawUrlOrId);
}

export function normalizeInstagramUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  try {
    let clean = rawUrl.trim();
    const shortcode = extractInstagramShortcode(clean);
    if (shortcode && shortcode.length >= 5) {
      return `https://www.instagram.com/reel/${shortcode}/`;
    }
    clean = clean.split('?')[0].split('#')[0].replace(/\/+$/, '');
    return clean.toLowerCase();
  } catch (e) {
    return rawUrl.trim().toLowerCase();
  }
}

export function mergeDatabaseSchemas(local: DatabaseSchema, remote: Partial<DatabaseSchema>): DatabaseSchema {
  const deletedSet = new Set<string>([
    ...(local.meta?.deletedReelIds || []),
    ...(remote.meta?.deletedReelIds || []),
  ]);
  const deletedCampaignSet = new Set<string>([
    ...(local.meta?.deletedCampaignIds || []),
    ...(remote.meta?.deletedCampaignIds || []),
  ]);
  const deletedProviderSet = new Set<string>([
    ...(local.meta?.deletedProviderIds || []),
    ...(remote.meta?.deletedProviderIds || []),
  ]);
  const deletedAccountSet = new Set<string>([
    ...(local.meta?.deletedAccountIds || []),
    ...(remote.meta?.deletedAccountIds || []),
  ]);

  const reelMap = new Map<string, Reel>();
  const shortcodeToReelIdMap = new Map<string, string>();
  const urlToReelIdMap = new Map<string, string>();
  const instagramReelIdMap = new Map<string, string>();

  const processReel = (r: Reel) => {
    if (!r || !r.id || deletedSet.has(r.id)) return;
    const shortcode = extractInstagramShortcode(r.shortcode || r.url || r.id);
    const cleanUrl = canonicalizeInstagramReelUrl(r.url) || r.url;
    const igReelId = r.instagram_reel_id ? String(r.instagram_reel_id).trim() : undefined;

    // Check if we already have this reel by Instagram Reel ID, shortcode, or canonical URL (Multi-tier uniqueness constraint)
    const existingId = (igReelId ? instagramReelIdMap.get(igReelId) : undefined)
      || (shortcode ? shortcodeToReelIdMap.get(shortcode.toLowerCase()) : undefined)
      || (cleanUrl ? urlToReelIdMap.get(cleanUrl.toLowerCase()) : undefined)
      || (reelMap.has(r.id) ? r.id : undefined);
    const existing = existingId ? reelMap.get(existingId) : undefined;

    if (!existing) {
      const enrichedReel: Reel = {
        ...r,
        instagram_reel_id: igReelId || r.instagram_reel_id,
        canonical_reel_url: cleanUrl,
        url: cleanUrl,
        shortcode: shortcode || r.shortcode,
        category: r.category || 'active',
      };
      reelMap.set(r.id, enrichedReel);
      if (cleanUrl) urlToReelIdMap.set(cleanUrl.toLowerCase(), r.id);
      if (shortcode) shortcodeToReelIdMap.set(shortcode.toLowerCase(), r.id);
      if (igReelId) instagramReelIdMap.set(igReelId, r.id);
    } else {
      // Merge properties cleanly without duplicating records
      const targetId = existing.id || r.id;
      const existingTime = new Date(existing.lastUpdatedAt || existing.createdAt || 0).getTime();
      const rTime = new Date(r.lastUpdatedAt || r.createdAt || 0).getTime();

      const maxViews = Math.max(r.views || 0, existing.views || 0);
      const maxLikes = Math.max(r.likes || 0, existing.likes || 0);
      const maxComments = Math.max(r.comments || 0, existing.comments || 0);
      const maxShares = Math.max(r.shares || 0, existing.shares || 0);
      const maxGrowth = Math.max(r.growth24h || 0, existing.growth24h || 0);

      const dominant = rTime >= existingTime ? { ...existing, ...r } : { ...r, ...existing };

      const mergedReel: Reel = {
        ...dominant,
        id: targetId,
        instagram_reel_id: existing.instagram_reel_id || igReelId || dominant.instagram_reel_id,
        canonical_reel_url: cleanUrl,
        url: cleanUrl,
        shortcode: shortcode || existing.shortcode || r.shortcode,
        name: dominant.name || existing.name || r.name || 'Instagram Reel',
        thumbnail: dominant.thumbnail || existing.thumbnail || r.thumbnail,
        caption: dominant.caption || existing.caption || r.caption,
        author: dominant.author || existing.author || r.author,
        discoveredFromAccount: dominant.discoveredFromAccount || existing.discoveredFromAccount || r.discoveredFromAccount,
        discoverySource: dominant.discoverySource || existing.discoverySource || r.discoverySource,
        firstDiscoveredAt: dominant.firstDiscoveredAt || existing.firstDiscoveredAt || r.firstDiscoveredAt,
        publishedAt: dominant.publishedAt || existing.publishedAt || r.publishedAt,
        views: maxViews,
        likes: maxLikes,
        comments: maxComments,
        shares: maxShares,
        growth24h: maxGrowth,
        status: (r.status === 'fetching' || existing.status === 'fetching') 
          ? 'fetching' 
          : (dominant.status || 'success'),
      };

      reelMap.set(targetId, mergedReel);
      if (cleanUrl) urlToReelIdMap.set(cleanUrl.toLowerCase(), targetId);
      if (shortcode) shortcodeToReelIdMap.set(shortcode.toLowerCase(), targetId);
      if (igReelId) instagramReelIdMap.set(igReelId, targetId);
      if (mergedReel.instagram_reel_id) instagramReelIdMap.set(mergedReel.instagram_reel_id, targetId);
    }
  };

  (remote.reels || []).forEach(processReel);
  (local.reels || []).forEach(processReel);

  const globalFeePercent = 8;
  const scheduleIntervalHours = local.meta?.scheduleIntervalHours ?? remote.meta?.scheduleIntervalHours ?? 24;

  const campaignMap = new Map<string, CpmCampaign>();
  (remote.cpmCampaigns || []).forEach(c => c && c.id && !deletedCampaignSet.has(c.id) && campaignMap.set(c.id, c));
  (local.cpmCampaigns || []).forEach(c => c && c.id && !deletedCampaignSet.has(c.id) && campaignMap.set(c.id, c));
  const mergedCampaigns = Array.from(campaignMap.values());

  // Instagram Accounts merge
  const accountMap = new Map<string, InstagramAccount>();
  const normalizedUsernameToIdMap = new Map<string, string>();

  const processAccount = (acc: InstagramAccount) => {
    if (!acc || !acc.id || deletedAccountSet.has(acc.id)) return;
    const normalized = (acc.normalizedUsername || acc.username || '').replace(/^@+/, '').trim().toLowerCase();
    if (!normalized) return;

    const existingId = normalizedUsernameToIdMap.get(normalized) || (accountMap.has(acc.id) ? acc.id : undefined);
    const existing = existingId ? accountMap.get(existingId) : undefined;

    if (!existing) {
      accountMap.set(acc.id, {
        ...acc,
        normalizedUsername: normalized,
        username: acc.username?.startsWith('@') ? acc.username : `@${normalized}`,
        profileUrl: `https://www.instagram.com/${normalized}/`,
        scanIntervalMinutes: acc.scanIntervalMinutes || 30,
        enabled: acc.enabled ?? true,
        totalDiscoveredReels: acc.totalDiscoveredReels || 0,
        lastScanDiscoveredCount: acc.lastScanDiscoveredCount || 0,
        lastScanNewCount: acc.lastScanNewCount || 0,
      });
      normalizedUsernameToIdMap.set(normalized, acc.id);
    } else {
      const targetId = existing.id || acc.id;
      const mergedAcc: InstagramAccount = {
        ...existing,
        ...acc,
        id: targetId,
        normalizedUsername: normalized,
        username: acc.username?.startsWith('@') ? acc.username : `@${normalized}`,
        profileUrl: `https://www.instagram.com/${normalized}/`,
        enabled: acc.enabled ?? existing.enabled ?? true,
        scanIntervalMinutes: acc.scanIntervalMinutes || existing.scanIntervalMinutes || 30,
        totalDiscoveredReels: Math.max(acc.totalDiscoveredReels || 0, existing.totalDiscoveredReels || 0),
        lastScanAt: acc.lastScanAt || existing.lastScanAt || null,
        lastSuccessfulScanAt: acc.lastSuccessfulScanAt || existing.lastSuccessfulScanAt || null,
        lastScanError: acc.lastScanError !== undefined ? acc.lastScanError : existing.lastScanError,
        lastScanDiscoveredCount: acc.lastScanDiscoveredCount || existing.lastScanDiscoveredCount || 0,
        lastScanNewCount: acc.lastScanNewCount || existing.lastScanNewCount || 0,
      };
      accountMap.set(targetId, mergedAcc);
      normalizedUsernameToIdMap.set(normalized, targetId);
    }
  };

  (remote.instagramAccounts || []).forEach(processAccount);
  (local.instagramAccounts || []).forEach(processAccount);
  const mergedAccounts = Array.from(accountMap.values()).filter(a => !deletedAccountSet.has(a.id));

  const mergedReels = Array.from(reelMap.values()).filter(r => !deletedSet.has(r.id));
  mergedReels.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  // Automatically recalculate CPM for all reels based on campaigns and global fee %
  recalculateAllDbReelsCpm(mergedReels, mergedCampaigns, globalFeePercent);

  const providerMap = new Map<string, ApiProvider>();
  const allProviderIds = new Set<string>([
    ...(remote.providers || []).map(p => p?.id).filter(Boolean) as string[],
    ...(local.providers || []).map(p => p?.id).filter(Boolean) as string[],
  ]);

  allProviderIds.forEach(id => {
    if (deletedProviderSet.has(id)) return;
    const remoteP = (remote.providers || []).find(p => p?.id === id);
    const localP = (local.providers || []).find(p => p?.id === id);

    if (localP && remoteP) {
      const bestApiKey = (localP.apiKey && !localP.apiKey.includes('••••'))
        ? localP.apiKey
        : (remoteP.apiKey && !remoteP.apiKey.includes('••••'))
          ? remoteP.apiKey
          : (localP.apiKey || remoteP.apiKey || '');

      providerMap.set(id, {
        ...remoteP,
        ...localP,
        apiKey: bestApiKey,
        baseUrl: localP.baseUrl || remoteP.baseUrl || '',
        enabled: localP.enabled ?? remoteP.enabled ?? true,
      });
    } else if (localP) {
      providerMap.set(id, localP);
    } else if (remoteP) {
      providerMap.set(id, remoteP);
    }
  });

  const mergedProviders = Array.from(providerMap.values());
  if (mergedProviders.length === 0) {
    mergedProviders.push(...defaultProviders);
  } else {
    for (const dp of defaultProviders) {
      if (!mergedProviders.some(p => p.id === dp.id) && !deletedProviderSet.has(dp.id)) {
        mergedProviders.push(dp);
      }
    }
  }

  const bestTelegramToken = (local.telegram?.botToken && !local.telegram?.botToken.includes('••••'))
    ? local.telegram.botToken
    : (remote.telegram?.botToken && !remote.telegram?.botToken.includes('••••'))
      ? remote.telegram.botToken
      : (local.telegram?.botToken || remote.telegram?.botToken || '');

  const bestAdminTelegramId = local.telegram?.adminTelegramId || remote.telegram?.adminTelegramId || '';

  const isTelegramEnabled = (remote.telegram?.enabled !== undefined)
    ? remote.telegram.enabled
    : (local.telegram?.enabled ?? false);

  const mergedTelegram: TelegramSettings = {
    botToken: bestTelegramToken,
    adminTelegramId: bestAdminTelegramId,
    enabled: Boolean(bestTelegramToken && isTelegramEnabled),
    lastStatus: local.telegram?.lastStatus || remote.telegram?.lastStatus || null,
  };

  const bestGeminiKey = (local.aiSettings?.geminiApiKey && !local.aiSettings?.geminiApiKey.includes('••••'))
    ? local.aiSettings.geminiApiKey
    : (remote.aiSettings?.geminiApiKey && !remote.aiSettings?.geminiApiKey.includes('••••'))
      ? remote.aiSettings.geminiApiKey
      : (local.aiSettings?.geminiApiKey || remote.aiSettings?.geminiApiKey || '');

  const bestGrokKey = (local.aiSettings?.grokApiKey && !local.aiSettings?.grokApiKey.includes('••••'))
    ? local.aiSettings.grokApiKey
    : (remote.aiSettings?.grokApiKey && !remote.aiSettings?.grokApiKey.includes('••••'))
      ? remote.aiSettings.grokApiKey
      : (local.aiSettings?.grokApiKey || remote.aiSettings?.grokApiKey || '');

  const bestGroqKey = (local.aiSettings?.groqApiKey && !local.aiSettings?.groqApiKey.includes('••••'))
    ? local.aiSettings.groqApiKey
    : (remote.aiSettings?.groqApiKey && !remote.aiSettings?.groqApiKey.includes('••••'))
      ? remote.aiSettings.groqApiKey
      : (local.aiSettings?.groqApiKey || remote.aiSettings?.groqApiKey || bestGrokKey);

  const mergedAiSettings: AiSettings = {
    geminiApiKey: bestGeminiKey,
    grokApiKey: bestGrokKey,
    groqApiKey: bestGroqKey,
    enableGemini: remote.aiSettings?.enableGemini ?? local.aiSettings?.enableGemini ?? true,
    enableGrok: remote.aiSettings?.enableGrok ?? local.aiSettings?.enableGrok ?? true,
    dailyCheckLimit: local.aiSettings?.dailyCheckLimit || remote.aiSettings?.dailyCheckLimit || 50,
    alertSensitivity: local.aiSettings?.alertSensitivity || remote.aiSettings?.alertSensitivity || 'medium',
    modelPreference: local.aiSettings?.modelPreference || remote.aiSettings?.modelPreference || 'auto',
  };

  const historyMap = new Map<string, ReelHistoryPoint>();
  (remote.history || []).forEach(h => h && h.id && historyMap.set(h.id, h));
  (local.history || []).forEach(h => h && h.id && historyMap.set(h.id, h));
  const mergedHistory = Array.from(historyMap.values())
    .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
    .slice(0, 1000);

  const logsMap = new Map<string, FetchLog>();
  (remote.logs || []).forEach(l => l && l.id && logsMap.set(l.id, l));
  (local.logs || []).forEach(l => l && l.id && logsMap.set(l.id, l));
  const mergedLogs = Array.from(logsMap.values())
    .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
    .slice(0, 500);

  const aiLogsMap = new Map<string, AiLog>();
  (remote.aiLogs || []).forEach(al => al && al.id && aiLogsMap.set(al.id, al));
  (local.aiLogs || []).forEach(al => al && al.id && aiLogsMap.set(al.id, al));
  const mergedAiLogs = Array.from(aiLogsMap.values())
    .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
    .slice(0, 500);

  const todayStr = new Date().toISOString().slice(0, 10);
  const aiMeta = local.aiMeta || remote.aiMeta || defaultAiMeta;
  if (aiMeta.lastCheckDate !== todayStr) {
    aiMeta.checksUsedToday = 0;
    aiMeta.lastCheckDate = todayStr;
  }

  return {
    auth: {
      adminPasswordHash: local.auth?.adminPasswordHash || remote.auth?.adminPasswordHash || defaultPasswordHash,
      sessionSecret: local.auth?.sessionSecret || remote.auth?.sessionSecret || defaultSessionSecret,
      sessions: { ...(remote.auth?.sessions || {}), ...(local.auth?.sessions || {}) },
    },
    reels: mergedReels,
    cpmCampaigns: mergedCampaigns,
    instagramAccounts: mergedAccounts,
    providers: mergedProviders,
    telegram: mergedTelegram,
    aiSettings: mergedAiSettings,
    aiMeta,
    aiLogs: mergedAiLogs,
    history: mergedHistory,
    logs: mergedLogs,
    meta: {
      lastAutoFetchAt: local.meta?.lastAutoFetchAt || remote.meta?.lastAutoFetchAt || null,
      globalFeePercent,
      scheduleIntervalHours,
      deletedReelIds: Array.from(deletedSet),
      deletedCampaignIds: Array.from(deletedCampaignSet),
      deletedProviderIds: Array.from(deletedProviderSet),
      deletedAccountIds: Array.from(deletedAccountSet),
    },
  };
}

// Setup Firebase Firestore connection
let loadedFirebaseConfig: any = null;

export function getFirebaseConfig() {
  if (loadedFirebaseConfig) return loadedFirebaseConfig;

  let config: any = null;
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');

  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
      console.warn('[Firestore] Error parsing firebase-applet-config.json:', e);
    }
  }

  if (!config) {
    if (process.env.FIREBASE_CONFIG) {
      try {
        config = typeof process.env.FIREBASE_CONFIG === 'string'
          ? JSON.parse(process.env.FIREBASE_CONFIG)
          : process.env.FIREBASE_CONFIG;
      } catch (e) {
        console.warn('[Firestore] Error parsing FIREBASE_CONFIG env var');
      }
    } else if (process.env.FIREBASE_PROJECT_ID || process.env.FIREBASE_API_KEY) {
      config = {
        projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID,
        apiKey: process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY,
        appId: process.env.FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID,
        firestoreDatabaseId: process.env.FIREBASE_FIRESTORE_DATABASE_ID || process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || 'ai-studio-reelpulsepro-dce90b8a-4fa5-4cf5-b57a-5249a4950dda',
        authDomain: `${process.env.FIREBASE_PROJECT_ID || 'ai-studio-applet-webapp-479fe'}.firebaseapp.com`,
      };
    }
  }

  // Default provisioned fallback if blank
  if (!config) {
    config = {
      projectId: 'ai-studio-applet-webapp-479fe',
      apiKey: 'AIzaSyCQj5JOrkWHCUyJUo3PdVjj6VgU7XdRCYU',
      appId: '1:17300429211:web:a1efc53ce188b9ba90a93e',
      firestoreDatabaseId: 'ai-studio-reelpulsepro-dce90b8a-4fa5-4cf5-b57a-5249a4950dda',
      authDomain: 'ai-studio-applet-webapp-479fe.firebaseapp.com',
    };
  }

  loadedFirebaseConfig = config;
  return loadedFirebaseConfig;
}

export function saveFirebaseConfig(newConfig: any) {
  loadedFirebaseConfig = {
    projectId: newConfig.projectId || 'ai-studio-applet-webapp-479fe',
    apiKey: newConfig.apiKey || '',
    appId: newConfig.appId || '',
    firestoreDatabaseId: newConfig.firestoreDatabaseId || 'ai-studio-reelpulsepro-dce90b8a-4fa5-4cf5-b57a-5249a4950dda',
    authDomain: `${newConfig.projectId || 'ai-studio-applet-webapp-479fe'}.firebaseapp.com`,
  };

  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  try {
    fs.writeFileSync(configPath, JSON.stringify(loadedFirebaseConfig, null, 2), 'utf-8');
    console.log('[Firestore] Updated firebase-applet-config.json successfully');
  } catch (e) {
    console.warn('[Firestore] Could not write firebase-applet-config.json to disk:', e);
  }

  // Force re-init
  firestoreInitialized = false;
  firestoreDb = null;
  return initFirestore();
}

export async function testFirestoreConnection() {
  if (firestoreQuotaExceeded) {
    return {
      success: false,
      isQuotaExceeded: true,
      error: 'Daily free tier write/read quota reached on Firebase Spark plan. The app is running smoothly on local storage fallback until the quota resets at 00:00 UTC.',
      databaseId: loadedFirebaseConfig?.firestoreDatabaseId || 'default',
      projectId: loadedFirebaseConfig?.projectId || 'unknown',
    };
  }
  try {
    const db = initFirestore();
    if (!db) {
      return { success: false, error: 'Firebase Firestore initialization failed' };
    }
    const docRef = doc(db, 'dashboard_data', 'main');
    const snapshot = await getDoc(docRef);
    return {
      success: true,
      message: 'Cloud Firestore connected successfully!',
      exists: snapshot.exists(),
      databaseId: loadedFirebaseConfig?.firestoreDatabaseId || 'default',
      projectId: loadedFirebaseConfig?.projectId || 'unknown',
    };
  } catch (e: any) {
    if (isQuotaError(e)) {
      handleQuotaExceeded();
      return {
        success: false,
        isQuotaExceeded: true,
        error: 'Daily free tier write/read quota reached on Firebase Spark plan. App is running smoothly on persistent local storage fallback.',
        databaseId: loadedFirebaseConfig?.firestoreDatabaseId || 'default',
        projectId: loadedFirebaseConfig?.projectId || 'unknown',
      };
    }
    return {
      success: false,
      error: e.message || 'Failed to connect to Cloud Firestore',
    };
  }
}

function isQuotaError(err: any): boolean {
  if (!err) return false;
  const code = err.code;
  const msg = err.message || String(err);
  return (
    code === 8 ||
    code === '8' ||
    code === 'resource-exhausted' ||
    String(code).toLowerCase() === 'resource_exhausted' ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('Quota limit exceeded') ||
    msg.includes('Quota exceeded') ||
    msg.includes('quota metric') ||
    msg.toLowerCase().includes('quota')
  );
}

function handleQuotaExceeded() {
  if (!firestoreQuotaExceeded) {
    firestoreQuotaExceeded = true;
    console.warn('[Firestore] Free daily write/read quota reached (RESOURCE_EXHAUSTED). Cloud write listener paused; seamlessly using persistent local JSON storage.');
    if (firestoreUnsubscribe) {
      try {
        firestoreUnsubscribe();
      } catch (e) {}
      firestoreUnsubscribe = null;
    }
    if (firestoreSyncTimeout) {
      clearTimeout(firestoreSyncTimeout);
      firestoreSyncTimeout = null;
    }
    if (firestoreDb) {
      try {
        terminate(firestoreDb).catch(() => {});
      } catch (e) {}
    }
    firestoreDb = null;
  }
}

function initFirestore() {
  if (firestoreQuotaExceeded) return null;
  if (firestoreInitialized) return firestoreDb;
  firestoreInitialized = true;

  try {
    const config = getFirebaseConfig();

    if (!config || !config.projectId) {
      console.log('[Firestore] No Firebase Firestore configuration found. Using local DB file fallback.');
      return null;
    }

    const apps = getApps();
    const app = apps.length === 0 ? initializeApp(config) : apps[0];

    if (config.firestoreDatabaseId) {
      firestoreDb = getFirestore(app, config.firestoreDatabaseId);
    } else {
      firestoreDb = getFirestore(app);
    }

    console.log('[Firestore] Connected to Firebase Firestore database:', config.firestoreDatabaseId || config.projectId);

    const docRef = doc(firestoreDb, 'dashboard_data', 'main');

    // Initial async sync from Firestore
    getDoc(docRef).then((snapshot) => {
      if (firestoreQuotaExceeded) return;
      if (snapshot.exists()) {
        const firestoreData = snapshot.data() as Partial<DatabaseSchema>;
        const baseLocal = cachedDb || readLocalFile() || normalizeDbSchema({});
        cachedDb = mergeDatabaseSchemas(baseLocal, firestoreData);
        saveLocalFile(cachedDb);
        console.log(`[Firestore] Synced & merged ${cachedDb.reels.length} reels from Cloud Firestore.`);
      } else {
        console.log('[Firestore] No existing Cloud Firestore document found. Seeding initial data...');
        const baseLocal = cachedDb || readLocalFile() || normalizeDbSchema({});
        const sanitizedSeed = sanitizeForFirestore(baseLocal);
        setDoc(docRef, sanitizedSeed).catch(e => {
          if (isQuotaError(e)) {
            handleQuotaExceeded();
          } else {
            console.error('[Firestore Seed Error]', e);
          }
        });
      }
    }).catch(err => {
      if (isQuotaError(err)) {
        handleQuotaExceeded();
      } else {
        console.error('[Firestore Fetch Error]', err);
      }
    });

    // Realtime Listener
    try {
      firestoreUnsubscribe = onSnapshot(docRef, (snapshot) => {
        if (firestoreQuotaExceeded) return;
        if (snapshot.exists()) {
          if (Date.now() - lastLocalWriteAt < 2500) {
            return;
          }
          const data = snapshot.data() as Partial<DatabaseSchema>;
          const baseLocal = cachedDb || readLocalFile() || normalizeDbSchema({});
          cachedDb = mergeDatabaseSchemas(baseLocal, data);
          saveLocalFile(cachedDb);
        }
      }, (error) => {
        if (isQuotaError(error)) {
          handleQuotaExceeded();
        } else {
          console.warn('[Firestore Listener Warning]', error);
        }
      });
    } catch (e) {
      if (isQuotaError(e)) {
        handleQuotaExceeded();
      }
    }

    return firestoreDb;
  } catch (err: any) {
    if (isQuotaError(err)) {
      handleQuotaExceeded();
    } else {
      console.error('[Firestore Init Error]', err);
    }
    firestoreDb = null;
    return null;
  }
}

function normalizeDbSchema(data: Partial<DatabaseSchema>): DatabaseSchema {
  return mergeDatabaseSchemas({
    auth: {
      adminPasswordHash: defaultPasswordHash,
      sessionSecret: defaultSessionSecret,
      sessions: {},
    },
    reels: [],
    cpmCampaigns: [],
    instagramAccounts: [],
    providers: defaultProviders,
    telegram: defaultTelegram,
    aiSettings: defaultAiSettings,
    aiMeta: defaultAiMeta,
    aiLogs: [],
    history: [],
    logs: [],
    meta: { 
      lastAutoFetchAt: null, 
      deletedReelIds: [], 
      deletedCampaignIds: [], 
      deletedProviderIds: [],
      deletedAccountIds: [],
      globalFeePercent: 8,
      scheduleIntervalHours: 24,
    },
  }, data);
}

function readLocalFile(): DatabaseSchema | null {
  const DB_FILE = getDbFilePath();
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const data = JSON.parse(raw) as Partial<DatabaseSchema>;
      return normalizeDbSchema(data);
    } catch (err) {
      console.error('Error reading local db file:', err);
    }
  }
  return null;
}

function saveLocalFile(data: DatabaseSchema): void {
  const DB_FILE = getDbFilePath();
  ensureDir(DB_FILE);
  const tmpFile = `${DB_FILE}.tmp`;
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DB_FILE);
  } catch (e) {
    console.error('[Local DB Cache Save Error]', e);
  }
}

function saveFirestoreDoc(data: DatabaseSchema): void {
  if (firestoreQuotaExceeded) return;

  // Debounce cloud syncing by 2 seconds to coalesce rapid consecutive writes
  if (firestoreSyncTimeout) {
    clearTimeout(firestoreSyncTimeout);
  }

  firestoreSyncTimeout = setTimeout(() => {
    firestoreSyncTimeout = null;
    if (firestoreQuotaExceeded) return;

    try {
      const db = initFirestore();
      if (db) {
        const docRef = doc(db, 'dashboard_data', 'main');

        // Prune heavy log arrays to ensure payload stays well under Firestore document size limit
        const firestorePayload: DatabaseSchema = {
          ...data,
          history: (data.history || []).slice(0, 100),
          logs: (data.logs || []).slice(0, 30),
          aiLogs: (data.aiLogs || []).slice(0, 30),
        };

        const sanitizedPayload = sanitizeForFirestore(firestorePayload);

        setDoc(docRef, sanitizedPayload, { merge: true }).catch((err) => {
          if (isQuotaError(err)) {
            handleQuotaExceeded();
          } else {
            console.error('[Firestore Cloud Save Error]', err);
          }
        });
      }
    } catch (e: any) {
      if (isQuotaError(e)) {
        handleQuotaExceeded();
      } else {
        console.error('[Firestore Sync Trigger Error]', e);
      }
    }
  }, 2000);
}

export async function loadDbFresh(): Promise<DatabaseSchema> {
  const localBase = readLocalFile() || normalizeDbSchema({});
  if (firestoreQuotaExceeded) {
    firestoreDb = null;
    cachedDb = localBase;
    return cachedDb;
  }
  initFirestore();
  try {
    const config = getFirebaseConfig();
    if (config && config.projectId) {
      const apps = getApps();
      const app = apps.length === 0 ? initializeApp(config) : apps[0];
      const firestore = config.firestoreDatabaseId ? getFirestore(app, config.firestoreDatabaseId) : getFirestore(app);
      const docRef = doc(firestore, 'dashboard_data', 'main');
      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        const remoteData = snapshot.data() as Partial<DatabaseSchema>;
        cachedDb = mergeDatabaseSchemas(localBase, remoteData);
        saveLocalFile(cachedDb);
        console.log(`[Firestore] Force-loaded fresh database. Reels count: ${cachedDb.reels.length}`);
        return cachedDb;
      }
    }
  } catch (e: any) {
    if (isQuotaError(e)) {
      handleQuotaExceeded();
    } else {
      console.error('[Firestore] Error force-loading fresh db:', e);
    }
  }
  cachedDb = localBase;
  return cachedDb;
}

export function loadDb(): DatabaseSchema {
  initFirestore();

  if (cachedDb) {
    return cachedDb;
  }

  const localFile = readLocalFile();
  if (localFile) {
    cachedDb = localFile;
    return cachedDb;
  }

  const initialData: DatabaseSchema = normalizeDbSchema({});
  cachedDb = initialData;
  saveLocalFile(initialData);
  saveFirestoreDoc(initialData);
  return initialData;
}

export function saveDb(data: DatabaseSchema): void {
  lastLocalWriteAt = Date.now();
  cachedDb = normalizeDbSchema(data);
  saveLocalFile(cachedDb);
  saveFirestoreDoc(cachedDb);
}
