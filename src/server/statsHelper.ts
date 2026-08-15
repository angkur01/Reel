import { Reel, ReelHistoryPoint } from '../types.js';
import { DatabaseSchema } from './db.js';
import { applyCpmToReel } from './cpm.js';

export interface ProcessFetchOptions {
  providerName?: string;
}

export function generateTwoWordTitleFromCaption(caption: string): string {
  if (!caption) return 'Viral Reel';
  // Strip URLs, hashtags, mentions, emojis, special symbols
  const clean = caption
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/#\w+/g, '')
    .replace(/@\w+/g, '')
    .replace(/[^\w\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = clean.split(' ').filter(w => w.length > 1);
  if (words.length === 0) return 'Viral Reel';
  
  // Take maximum 2 words
  const selected = words.slice(0, 2).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return selected.join(' ');
}

export interface Growth24hResult {
  growth24h: number;
  hasSufficient24hData: boolean;
  shouldAutoArchiveLowGrowth: boolean;
  baselineSnapshot: ReelHistoryPoint | null;
}

/**
 * Calculates 24-hour view growth using real historical view snapshots.
 *
 * Rules:
 * 1. Condition 1: Total views < 2,000.
 * 2. Condition 2: Gained < 30 views during the previous 24-hour period.
 * 3. Accurate 24h Tracking:
 *    - To calculate previous 24-hour growth: Current views MINUS the most recent valid
 *      view snapshot that is approximately 24 hours old.
 *    - If there is NOT enough historical data to reliably determine 24-hour growth
 *      (e.g., oldest snapshot is less than 20 hours old), DO NOT auto-archive the Reel yet.
 */
export function calculate24hGrowthFromSnapshots(
  reel: Reel,
  history: ReelHistoryPoint[],
  currentFetchTimestamp: string = new Date().toISOString()
): Growth24hResult {
  const currentViews = Math.max(0, reel.views || 0);
  const nowMs = new Date(currentFetchTimestamp).getTime();
  const target24hAgoMs = nowMs - (24 * 60 * 60 * 1000);
  const minHistoryAgeMs = 20 * 60 * 60 * 1000; // Minimum 20 hours of history required to reliably evaluate 24-hour growth

  // Filter history points for this reel with valid numeric views
  const validSnapshots = (history || [])
    .filter(h => h.reelId === reel.id && typeof h.views === 'number' && !isNaN(h.views))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (validSnapshots.length === 0) {
    return {
      growth24h: 0,
      hasSufficient24hData: false,
      shouldAutoArchiveLowGrowth: false,
      baselineSnapshot: null,
    };
  }

  const oldestSnapshot = validSnapshots[0];
  const oldestSnapshotAgeMs = nowMs - new Date(oldestSnapshot.timestamp).getTime();

  // If the total tracked history span is less than ~20 hours, we do NOT have enough data yet
  if (oldestSnapshotAgeMs < minHistoryAgeMs) {
    const rawGain = Math.max(0, currentViews - oldestSnapshot.views);
    return {
      growth24h: rawGain,
      hasSufficient24hData: false,
      shouldAutoArchiveLowGrowth: false,
      baselineSnapshot: oldestSnapshot,
    };
  }

  // Find the snapshot closest to 24 hours ago (target24hAgoMs)
  // Look at snapshots with age >= 18 hours or the closest snapshot overall to 24h ago
  let bestSnapshot: ReelHistoryPoint = validSnapshots[0];
  let minDiff = Math.abs(new Date(bestSnapshot.timestamp).getTime() - target24hAgoMs);

  for (let i = 1; i < validSnapshots.length; i++) {
    const s = validSnapshots[i];
    const sTime = new Date(s.timestamp).getTime();
    // Don't choose a snapshot that is practically identical to current fetch (e.g. within last 6 hours) if older ones exist
    if (nowMs - sTime < 12 * 60 * 60 * 1000 && validSnapshots.length > 2) {
      continue;
    }
    const diff = Math.abs(sTime - target24hAgoMs);
    if (diff < minDiff) {
      minDiff = diff;
      bestSnapshot = s;
    }
  }

  const growth24h = Math.max(0, currentViews - bestSnapshot.views);
  const shouldAutoArchiveLowGrowth = (currentViews < 2000) && (growth24h < 30);

  return {
    growth24h,
    hasSufficient24hData: true,
    shouldAutoArchiveLowGrowth,
    baselineSnapshot: bestSnapshot,
  };
}

/**
 * Safely updates a Reel with newly fetched API data,
 * records a point in db.history, calculates 24h view growth from historical snapshots,
 * and recalculates CPM earnings & fees.
 */
export function updateReelWithFetchResult(
  reel: Reel,
  fetchResult: { success: boolean; data?: any; providerName?: string },
  db: DatabaseSchema
): { viewGain: number; isNewGrowth: boolean } {
  if (!fetchResult.success || !fetchResult.data) {
    return { viewGain: 0, isNewGrowth: false };
  }

  const prevViews = Math.max(0, reel.views || 0);
  const rawViews = fetchResult.data.views;
  const newViews = (typeof rawViews === 'number' && !isNaN(rawViews) && rawViews >= 0) ? rawViews : prevViews;
  const viewGain = Math.max(0, newViews - prevViews);

  // Update Reel properties
  reel.views = newViews;
  if (typeof fetchResult.data.likes === 'number' && fetchResult.data.likes >= 0) {
    reel.likes = fetchResult.data.likes;
  }
  if (typeof fetchResult.data.comments === 'number' && fetchResult.data.comments >= 0) {
    reel.comments = fetchResult.data.comments;
  }
  if (typeof fetchResult.data.shares === 'number' && fetchResult.data.shares >= 0) {
    reel.shares = fetchResult.data.shares;
  }
  if (fetchResult.data.caption) {
    reel.caption = fetchResult.data.caption;
    // Auto-generate punchy max 2-word AI title if name is raw/default
    if (!reel.name || reel.name.startsWith('Reel ') || reel.name.startsWith('reel_') || reel.name.toLowerCase().includes('instagram') || reel.name.length > 25) {
      reel.name = generateTwoWordTitleFromCaption(reel.caption);
    }
  }
  if (fetchResult.data.author) reel.author = fetchResult.data.author;
  if (fetchResult.data.thumbnail) reel.thumbnail = fetchResult.data.thumbnail;

  const nowIso = new Date().toISOString();
  reel.status = 'success';
  reel.lastError = null;
  reel.lastSuccessfulFetch = nowIso;
  reel.lastUpdatedAt = nowIso;
  if (fetchResult.providerName) reel.lastProviderUsed = fetchResult.providerName;

  // 1. Record snapshot point in db.history
  if (!db.history) db.history = [];
  db.history.push({
    id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    reelId: reel.id,
    timestamp: nowIso,
    views: reel.views,
    likes: reel.likes,
    comments: reel.comments,
    shares: reel.shares,
  });

  // Limit total history array size safely to avoid memory/Firestore bloat while preserving 24-48h snapshots
  if (db.history.length > 2500) {
    db.history = db.history.slice(-2500);
  }

  // 2. Calculate 24-hour growth accurately from historical snapshots
  const growthResult = calculate24hGrowthFromSnapshots(reel, db.history, nowIso);
  reel.growth24h = growthResult.growth24h;
  reel.hasSufficient24hData = growthResult.hasSufficient24hData;

  if (viewGain > 0) {
    reel.growth1h = viewGain;
    reel.isStalled = false;
  } else if (reel.lastUpdatedAt && Date.now() - new Date(reel.lastUpdatedAt).getTime() > 24 * 60 * 60 * 1000) {
    reel.isStalled = true;
  }

  // Viral check
  const baselineViews = growthResult.baselineSnapshot ? growthResult.baselineSnapshot.views : prevViews;
  if (reel.growth24h >= 10000 || (baselineViews > 0 && reel.growth24h / baselineViews >= 0.2)) {
    reel.isViral = true;
  }

  // Milestone check
  const milestones = [10000, 50000, 100000, 500000, 1000000, 5000000];
  for (const m of milestones) {
    if (reel.views >= m && (reel.lastMilestone || 0) < m) {
      reel.lastMilestone = m;
      break;
    }
  }

  // 3. Recalculate CPM earnings & payout
  applyCpmToReel(reel, db.cpmCampaigns || [], 8);

  return { viewGain, isNewGrowth: viewGain > 0 };
}

/**
 * Re-evaluates 24h growth & CPM metrics across all reels in DB.
 */
export function recalculateAllReelsGrowthAndCpm(db: DatabaseSchema) {
  const feePercent = 8;
  const nowIso = new Date().toISOString();

  for (const reel of db.reels) {
    const growthResult = calculate24hGrowthFromSnapshots(reel, db.history || [], nowIso);
    reel.growth24h = growthResult.growth24h;
    reel.hasSufficient24hData = growthResult.hasSufficient24hData;
    applyCpmToReel(reel, db.cpmCampaigns || [], feePercent);
  }
}

