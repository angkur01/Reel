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
  };
}

let activeDbPath: string | null = null;
let firestoreDb: any = null;
let firestoreInitialized = false;
let cachedDb: DatabaseSchema | null = null;

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

    // Initial sync from Firestore asynchronously
    const docRef = doc(firestoreDb, 'dashboard_data', 'main');
    getDoc(docRef).then((snapshot) => {
      if (snapshot.exists()) {
        const firestoreData = snapshot.data() as DatabaseSchema;
        console.log(`[Firestore] Synced ${firestoreData.reels?.length || 0} reels & settings from Cloud Firestore database.`);
        cachedDb = normalizeDbSchema(firestoreData);
        saveLocalFile(cachedDb);
      } else {
        console.log('[Firestore] No existing Cloud Firestore document found. Seeding initial data...');
        if (cachedDb) {
          setDoc(docRef, cachedDb).catch(e => console.error('[Firestore Seed Error]', e));
        }
      }
    }).catch(err => {
      console.error('[Firestore Fetch Error]', err);
    });

    // Realtime Listener
    onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as DatabaseSchema;
        cachedDb = normalizeDbSchema(data);
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
  const normalized: DatabaseSchema = {
    auth: data.auth || {
      adminPasswordHash: defaultPasswordHash,
      sessionSecret: defaultSessionSecret,
      sessions: {},
    },
    reels: Array.isArray(data.reels) ? data.reels : [],
    providers: (Array.isArray(data.providers) && data.providers.length > 0) ? data.providers : defaultProviders,
    telegram: data.telegram || defaultTelegram,
    aiSettings: data.aiSettings || defaultAiSettings,
    aiMeta: data.aiMeta || defaultAiMeta,
    aiLogs: Array.isArray(data.aiLogs) ? data.aiLogs : [],
    history: Array.isArray(data.history) ? data.history : [],
    logs: Array.isArray(data.logs) ? data.logs : [],
    meta: data.meta || { lastAutoFetchAt: null },
  };

  if (!normalized.auth.sessions) normalized.auth.sessions = {};

  // Reset daily check counter if new UTC day
  const todayStr = new Date().toISOString().slice(0, 10);
  if (normalized.aiMeta.lastCheckDate !== todayStr) {
    normalized.aiMeta.checksUsedToday = 0;
    normalized.aiMeta.lastCheckDate = todayStr;
  }

  return normalized;
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

  const DB_FILE = getDbFilePath();
  ensureDir(DB_FILE);

  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const data = JSON.parse(raw) as DatabaseSchema;
      cachedDb = normalizeDbSchema(data);
      return cachedDb;
    } catch (err) {
      console.error('Error reading local db file, falling back to initial data:', err);
    }
  }

  const initialData: DatabaseSchema = normalizeDbSchema({});
  cachedDb = initialData;
  saveLocalFile(initialData);
  saveFirestoreDoc(initialData);
  return initialData;
}

export function saveDb(data: DatabaseSchema): void {
  cachedDb = normalizeDbSchema(data);
  saveLocalFile(cachedDb);
  saveFirestoreDoc(cachedDb);
}
