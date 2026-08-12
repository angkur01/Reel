export interface ReelHistoryPoint {
  id: string;
  reelId: string;
  timestamp: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

export interface CpmCampaign {
  id: string;
  name: string;
  cpm: number;          // CPM rate ($ per 1,000 views)
  minViews: number;     // Minimum required views eligibility threshold
  maxViews: number;     // Maximum cap views for CPM calculation
  enabled: boolean;     // Active or disabled
  createdAt: string;
  updatedAt?: string;
}

export interface Reel {
  id: string;
  url: string;
  name: string; // first 5 chars of caption by default, or user custom
  views: number;
  likes: number;
  comments: number;
  shares: number;
  caption: string;
  author: string;
  thumbnail: string;
  createdAt: string;
  lastUpdatedAt: string | null;
  nextScheduledAt: string;
  status: 'success' | 'failed' | 'fetching' | 'pending';
  lastError: string | null;
  lastProviderUsed: string | null;
  
  // Smart Growth Tracking
  growth1h?: number;
  growth6h?: number;
  growth24h?: number;
  lastMilestone?: number; // e.g. 10000, 50000, 100000, 500000, 1000000
  isViral?: boolean;
  isStalled?: boolean;
  
  // Video Media Support
  videoFileUrl?: string;
  telegramFileId?: string;

  // CPM Campaign Association & Computed Financials
  campaignId?: string | null;
  campaignName?: string | null;
  cpmRate?: number;
  minViews?: number;
  maxViews?: number;
  eligibleViews?: number;
  cpmEarnings?: number;
  fee3Percent?: number;
  estimatedPayout?: number;
  cpmEligibilityStatus?: 'eligible' | 'below_minimum' | 'capped_at_max' | 'no_campaign';
}

export interface ApiProvider {
  id: string;
  name: string;
  baseUrl: string; // e.g. https://api.refetcher.com
  endpointPath: string; // e.g. /v1/instagram/reel
  method: 'GET' | 'POST';
  apiKey: string; // Kept server side, sent as header or query param
  apiKeyLocation: 'header_bearer' | 'header_x_api_key' | 'query_api_key' | 'query_key' | 'body_api_key';
  urlParamName: string; // parameter name for the instagram reel URL, e.g. "url" or "link"
  headersJson?: string; // custom headers JSON string if needed
  customBodyJson?: string; // custom payload template if needed
  mapping: {
    viewsPath: string; // e.g. "data.views" or "view_count"
    likesPath: string; // e.g. "data.likes" or "like_count"
    commentsPath: string; // e.g. "data.comments" or "comment_count"
    sharesPath: string; // e.g. "data.shares" or "share_count"
    captionPath: string; // e.g. "data.caption" or "text"
    authorPath: string; // e.g. "data.author" or "owner.username"
    thumbnailPath: string; // e.g. "data.thumbnail" or "display_url"
  };
  enabled: boolean;
  priority: number;
  lastTestedAt?: string | null;
  lastTestStatus?: 'success' | 'failed' | null;
  lastTestError?: string | null;
}

export interface TelegramSettings {
  botToken: string;
  adminTelegramId: string;
  enabled: boolean;
  lastStatus?: string;
  lastActiveAt?: string;
}

export interface AiSettings {
  geminiApiKey: string; // Masked on client
  grokApiKey: string;   // Masked on client (or Groq API Key)
  groqApiKey?: string;  // Explicit Groq Cloud API Key
  enableGemini: boolean;
  enableGrok: boolean;
  dailyCheckLimit: number; // default 50
  alertSensitivity: 'low' | 'medium' | 'high';
  modelPreference: 'auto' | 'groq_first' | 'gemini_first' | 'grok_first';
}

export interface AiMeta {
  checksUsedToday: number;
  lastCheckDate: string; // "YYYY-MM-DD"
  lastAiAnalysisAt: string | null;
  activeModelUsed?: 'gemini' | 'groq' | 'grok' | 'none';
}

export interface AiLog {
  id: string;
  timestamp: string;
  modelUsed: 'gemini' | 'groq' | 'grok';
  headline: string;
  message: string;
  sentToTelegram: boolean;
  reelId?: string;
  reelName?: string;
  type: 'milestone' | 'viral' | 'acceleration' | 'stalled' | 'daily_report' | 'manual_audit';
}

export interface FetchLog {
  id: string;
  reelId: string;
  reelName: string;
  timestamp: string;
  type: 'automatic' | 'manual_web' | 'force_refresh_telegram' | 'ai_check';
  status: 'success' | 'failed';
  providerName: string;
  errorMessage?: string;
  statsAdded?: {
    views: number;
    likes: number;
    comments: number;
  };
}

export interface TestProviderResult {
  success: boolean;
  httpStatus: number;
  rawResponseSnippet: string;
  errorMessage?: string;
  parsedData?: {
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    caption?: string;
    author?: string;
    thumbnail?: string;
  };
}

export interface SystemStats {
  totalReels: number;
  totalViews: number;
  totalLikes: number;
  total24hGrowth: number;
  activeProviders: number;
  lastAutoFetchAt: string | null;
  nextScheduledFetchAt: string;
  isFetchingAny: boolean;
  aiChecksUsedToday: number;
  aiDailyLimit: number;
  aiActiveModel: 'gemini' | 'groq' | 'grok' | 'none';
  viralCount: number;
  stalledCount: number;
  
  // CPM System Totals
  totalCpmEarnings: number;
  total3PercentFees: number;
  totalEstimatedPayout: number;
  totalCampaignsCount: number;
}

