import fs from 'fs';
import path from 'path';
import os from 'os';
import bcrypt from 'bcryptjs';
import { Reel, ApiProvider, TelegramSettings, FetchLog } from '../types.js';

export interface DatabaseSchema {
  auth: {
    adminPasswordHash: string;
    sessionSecret: string;
    sessions?: Record<string, number>;
  };
  reels: Reel[];
  providers: ApiProvider[];
  telegram: TelegramSettings;
  logs: FetchLog[];
  meta: {
    lastAutoFetchAt: string | null;
  };
}

let activeDbPath: string | null = null;

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
    console.warn('[DB] Primary data directory is read-only. Falling back to temporary directory for serverless environment.');
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
// Default admin password is "admin123" if not set yet
const defaultPasswordHash = bcrypt.hashSync("admin123", 10);

const defaultProviders: ApiProvider[] = [
  {
    id: 'provider_refetcher_default',
    name: 'Refetcher API (Default)',
    baseUrl: 'https://api.refetcher.com',
    endpointPath: '/',
    method: 'POST',
    apiKey: '', // User populates in settings
    apiKeyLocation: 'header_x_api_key', // Header X-API-Key: pc_live_...
    urlParamName: 'url',
    headersJson: '{\n  "Accept": "application/json",\n  "Content-Type": "application/json"\n}',
    customBodyJson: '',
    mapping: {
      viewsPath: 'views', // or plays / play_count / view_count
      likesPath: 'likes', // or like_count / reactions
      commentsPath: 'comments', // or comment_count
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

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function loadDb(): DatabaseSchema {
  const DB_FILE = getDbFilePath();
  ensureDir(DB_FILE);
  if (!fs.existsSync(DB_FILE)) {
    const initialData: DatabaseSchema = {
      auth: {
        adminPasswordHash: defaultPasswordHash,
        sessionSecret: defaultSessionSecret,
      },
      reels: [],
      providers: defaultProviders,
      telegram: defaultTelegram,
      logs: [],
      meta: {
        lastAutoFetchAt: null,
      },
    };
    saveDb(initialData);
    return initialData;
  }

  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const data = JSON.parse(raw) as DatabaseSchema;
    if (!data.auth) {
      data.auth = {
        adminPasswordHash: defaultPasswordHash,
        sessionSecret: defaultSessionSecret,
        sessions: {},
      };
    } else if (!data.auth.sessions) {
      data.auth.sessions = {};
    }
    if (!data.providers || data.providers.length === 0) {
      data.providers = defaultProviders;
    }
    if (!data.telegram) {
      data.telegram = defaultTelegram;
    }
    if (!data.logs) {
      data.logs = [];
    }
    if (!data.meta) {
      data.meta = { lastAutoFetchAt: null };
    }
    return data;
  } catch (err) {
    console.error('Error reading database file, creating backup and starting fresh:', err);
    if (fs.existsSync(DB_FILE)) {
      try { fs.renameSync(DB_FILE, `${DB_FILE}.bak.${Date.now()}`); } catch {}
    }
    const initialData: DatabaseSchema = {
      auth: {
        adminPasswordHash: defaultPasswordHash,
        sessionSecret: defaultSessionSecret,
      },
      reels: [],
      providers: defaultProviders,
      telegram: defaultTelegram,
      logs: [],
      meta: {
        lastAutoFetchAt: null,
      },
    };
    saveDb(initialData);
    return initialData;
  }
}

export function saveDb(data: DatabaseSchema): void {
  const DB_FILE = getDbFilePath();
  ensureDir(DB_FILE);
  const tmpFile = `${DB_FILE}.tmp`;
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DB_FILE);
  } catch (e) {
    console.error('[DB Save Error]', e);
  }
}
