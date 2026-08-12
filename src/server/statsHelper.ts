import { Reel } from '../types.js';
import { DatabaseSchema } from './db.js';
import { applyCpmToReel } from './cpm.js';

export interface ProcessFetchOptions {
  providerName?: string;
}

/**
 * Safely updates a Reel with newly fetched API data,
 * records a point in db.history, calculates 24h view growth from history,
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
  if (fetchResult.data.caption) reel.caption = fetchResult.data.caption;
  if (fetchResult.data.author) reel.author = fetchResult.data.author;
  if (fetchResult.data.thumbnail) reel.thumbnail = fetchResult.data.thumbnail;

  reel.status = 'success';
  reel.lastError = null;
  reel.lastUpdatedAt = new Date().toISOString();
  if (fetchResult.providerName) reel.lastProviderUsed = fetchResult.providerName;

  // 1. Record snapshot point in db.history
  if (!db.history) db.history = [];
  db.history.push({
    id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    reelId: reel.id,
    timestamp: new Date().toISOString(),
    views: reel.views,
    likes: reel.likes,
    comments: reel.comments,
    shares: reel.shares,
  });

  // Limit total history array size to avoid memory & Firestore payload bloat
  if (db.history.length > 500) {
    db.history = db.history.slice(-500);
  }

  // 2. Calculate 24-hour growth dynamically from history
  const now = Date.now();
  const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);

  const reelHistory = db.history.filter(h => h.reelId === reel.id);
  if (reelHistory.length > 0) {
    // Sort history points chronologically
    reelHistory.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    // Baseline entry is the first history point recorded in the last 24h, or the earliest point if all are recent
    const baselineEntry = reelHistory.find(h => new Date(h.timestamp).getTime() >= twentyFourHoursAgo) || reelHistory[0];
    const baselineViews = baselineEntry ? baselineEntry.views : prevViews;
    
    reel.growth24h = Math.max(0, reel.views - baselineViews);
  } else {
    reel.growth24h = viewGain;
  }

  if (viewGain > 0) {
    reel.growth1h = viewGain;
    reel.isStalled = false;
  } else if (reel.lastUpdatedAt && now - new Date(reel.lastUpdatedAt).getTime() > 24 * 60 * 60 * 1000) {
    reel.isStalled = true;
  }

  // Viral check
  const baselineViews = (reelHistory.length > 0 && reelHistory[0]) ? reelHistory[0].views : prevViews;
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
  applyCpmToReel(reel, db.cpmCampaigns || []);

  return { viewGain, isNewGrowth: viewGain > 0 };
}

/**
 * Re-evaluates 24h growth & CPM metrics across all reels in DB.
 */
export function recalculateAllReelsGrowthAndCpm(db: DatabaseSchema) {
  const now = Date.now();
  const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);

  for (const reel of db.reels) {
    const reelHistory = (db.history || []).filter(h => h.reelId === reel.id);
    if (reelHistory.length > 0) {
      reelHistory.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const baselineEntry = reelHistory.find(h => new Date(h.timestamp).getTime() >= twentyFourHoursAgo) || reelHistory[0];
      reel.growth24h = Math.max(0, reel.views - (baselineEntry ? baselineEntry.views : reel.views));
    } else {
      reel.growth24h = reel.growth24h || 0;
    }
    applyCpmToReel(reel, db.cpmCampaigns || []);
  }
}
