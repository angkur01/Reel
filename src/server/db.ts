import fs from 'fs';
import path from 'path';
import os from 'os';
import bcrypt from 'bcryptjs';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { Reel, ApiProvider, TelegramSettings, FetchLog, AiSettings, AiMeta, AiLog, ReelHistoryPoint } from '../types.js';

export interface DatabaseSchema {
  auth: {
    adminPasswordHash: string;
    sessionSecret: string;
    sessions?: Record<string, number>;
  };
  reels: Reel[];
  providers: ApiProvider[];
  telegram: TelegramSettings;
  aiSettings: AiSettings;
  aiMeta: AiMeta;
  aiLogs: AiLog[];
  history: ReelHistoryPoint[];
  logs: FetchLog[];
  meta: {
    lastAutoFetchAt: string | null;
    deletedReelIds?: string[];
  };
}

let activeDbPath: string | null = null;
let firestoreDb: any = null;
let firestoreInitialized = false;
let cachedDb: DatabaseSchema | null = null;
let lastLocalWriteAt = 0;

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
const defaultSessionSecret = Math.random().toString(36).substring(2) + Date.now().toString(36);
const defaultPasswordHash = bcrypt.hashSync("admin123", 10);

const defaultProviders: ApiProvider[] = [
  {
    id: 'provider_refetcher_default',
    name: 'Refetcher API (Default)',
    baseUrl: 'https://api.refetcher.com',
    endpointPath: '/',
    method: 'POST',
    apiKey: '',
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
    priority: 1,
    lastTestedAt: null,
    lastTestStatus: null,
    lastTestError: null,
  }
];

const defaultTelegram: TelegramSettings = {
  botToken: '',
  adminTelegramId: '',
  enabled: false,
};

const defaultAiSettings: AiSettings = {
  geminiApiKey: '',
  grokApiKey: '',
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

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function mergeDatabaseSchemas(local: DatabaseSchema, remote: Partial<DatabaseSchema>): DatabaseSchema {
  const deletedSet = new Set<string>([
    ...(local.meta?.deletedReelIds || []),
    ...(remote.meta?.deletedReelIds || []),
  ]);

  const reelMap = new Map<string, Reel>();

  const processReel = (r: Reel) => {
    if (!r || !r.id || deletedSet.has(r.id)) return;
    const existing = reelMap.get(r.id);
    if (!existing) {
      reelMap.set(r.id, { ...r });
    } else {
      const existingTime = new Date(existing.lastUpdatedAt || existing.createdAt || 0).getTime();
      const rTime = new Date(r.lastUpdatedAt || r.createdAt || 0).getTime();

      if (rTime >= existingTime) {
        reelMap.set(r.id, {
          ...existing,
          ...r,
          views: r.views || existing.views,
          likes: r.likes || existing.likes,
          comments: r.comments || existing.comments,
          shares: r.shares || existing.shares,
        });
      } else {
        reelMap.set(r.id, {
          ...r,
          ...existing,
          views: existing.views || r.views,
          likes: existing.likes || r.likes,
          comments: existing.comments || r.comments,
          shares: existing.shares || r.shares,
        });
      }
    }
  };

  (remote.reels || []).forEach(processReel);
  (local.reels || []).forEach(processReel);

  const mergedReels = Array.from(reelMap.values()).filter(r => !deletedSet.has(r.id));
  mergedReels.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  const providerMap = new Map<string, ApiProvider>();
  (remote.providers || []).forEach(p => p && p.id && providerMap.set(p.id, p));
  (local.providers || []).forEach(p => p && p.id && providerMap.set(p.id, p));
  const mergedProviders = Array.from(providerMap.values());
  if (mergedProviders.length === 0) {
    mergedProviders.push(...defaultProviders);
  }

  const mergedTelegram: TelegramSettings = {
    botToken: local.telegram?.botToken || remote.telegram?.botToken || '',
    adminTelegramId: local.telegram?.adminTelegramId || remote.telegram?.adminTelegramId || '',
    enabled: local.telegram?.enabled ?? remote.telegram?.enabled ?? false,
  };

  const mergedAiSettings: AiSettings = {
    geminiApiKey: local.aiSettings?.geminiApiKey || remote.aiSettings?.geminiApiKey || '',
    grokApiKey: local.aiSettings?.grokApiKey || remote.aiSettings?.grokApiKey || '',
    enableGemini: local.aiSettings?.enableGemini ?? remote.aiSettings?.enableGemini ?? true,
    enableGrok: local.aiSettings?.enableGrok ?? remote.aiSettings?.enableGrok ?? true,
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
    providers: mergedProviders,
    telegram: mergedTelegram,
    aiSettings: mergedAiSettings,
    aiMeta,
    aiLogs: mergedAiLogs,
    history: mergedHistory,
    logs: mergedLogs,
    meta: {
      lastAutoFetchAt: local.meta?.lastAutoFetchAt || remote.meta?.lastAutoFetchAt || null,
      deletedReelIds: Array.from(deletedSet),
    },
  };
}

// Setup Firebase Firestore connection
function initFirestore() {
  if (firestoreInitialized) return firestoreDb;
  firestoreInitialized = true;

  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(configPath)) {
      console.log('[Firestore] firebase-applet-config.json not found. Using local DB file.');
      return null;
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
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
      if (snapshot.exists()) {
        const firestoreData = snapshot.data() as Partial<DatabaseSchema>;
        const baseLocal = cachedDb || readLocalFile() || normalizeDbSchema({});
        cachedDb = mergeDatabaseSchemas(baseLocal, firestoreData);
        saveLocalFile(cachedDb);
        console.log(`[Firestore] Synced & merged ${cachedDb.reels.length} reels from Cloud Firestore.`);
      } else {
        console.log('[Firestore] No existing Cloud Firestore document found. Seeding initial data...');
        const baseLocal = cachedDb || readLocalFile() || normalizeDbSchema({});
        setDoc(docRef, baseLocal).catch(e => console.error('[Firestore Seed Error]', e));
      }
    }).catch(err => {
      console.error('[Firestore Fetch Error]', err);
    });

    // Realtime Listener
    onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        // Avoid overwriting very recent local writes
        if (Date.now() - lastLocalWriteAt < 2500) {
          return;
        }
        const data = snapshot.data() as Partial<DatabaseSchema>;
        const baseLocal = cachedDb || readLocalFile() || normalizeDbSchema({});
        cachedDb = mergeDatabaseSchemas(baseLocal, data);
        saveLocalFile(cachedDb);
      }
    }, (error) => {
      console.warn('[Firestore Listener Warning]', error);
    });

    return firestoreDb;
  } catch (err) {
    console.error('[Firestore Init Error]', err);
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
    providers: defaultProviders,
    telegram: defaultTelegram,
    aiSettings: defaultAiSettings,
    aiMeta: defaultAiMeta,
    aiLogs: [],
    history: [],
    logs: [],
    meta: { lastAutoFetchAt: null, deletedReelIds: [] },
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
  try {
    const db = initFirestore();
    if (db) {
      const docRef = doc(db, 'dashboard_data', 'main');
      setDoc(docRef, data, { merge: true }).catch((err) => {
        console.error('[Firestore Cloud Save Error]', err);
      });
    }
  } catch (e) {
    console.error('[Firestore Sync Trigger Error]', e);
  }
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
