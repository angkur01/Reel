import fs from 'fs';
import path from 'path';
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

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

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

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadDb(): DatabaseSchema {
  ensureDir();
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
      fs.renameSync(DB_FILE, `${DB_FILE}.bak.${Date.now()}`);
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
  ensureDir();
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);
}
