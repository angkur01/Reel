import cron from 'node-cron';
import { loadDb, saveDb } from './db.js';
import { fetchReelWithFallbackChain } from './providers.js';
import { notifyTelegramReelResult } from './telegram.js';
import { updateReelWithFetchResult } from './statsHelper.js';
import { FetchLog } from '../types.js';

const FIXED_HOURS = [0, 6, 12, 18];

/**
 * Calculate the exact next scheduled update timestamp.
 * FIXED hours: 00:00, 06:00, 12:00, 18:00 UTC
 */
export function getNextScheduledTime(fromDate: Date = new Date()): Date {
  const year = fromDate.getUTCFullYear();
  const month = fromDate.getUTCMonth();
  const date = fromDate.getUTCDate();
  const currentHour = fromDate.getUTCHours();
  const currentMinute = fromDate.getUTCMinutes();

  // Find next hour in FIXED_HOURS strictly greater than current hour (or equal if minutes = 0)
  for (const targetHour of FIXED_HOURS) {
    if (targetHour > currentHour || (targetHour === currentHour && currentMinute === 0)) {
      const nextTime = new Date(Date.UTC(year, month, date, targetHour, 0, 0, 0));
      if (nextTime.getTime() > fromDate.getTime()) {
        return nextTime;
      }
    }
  }

  // Next slot is 00:00 UTC tomorrow
  return new Date(Date.UTC(year, month, date + 1, 0, 0, 0, 0));
}

// Global active automatic fetch guard
let isAutoFetchRunning = false;

export async function runAutomaticFetchJob() {
  if (isAutoFetchRunning) {
    console.log('[Automatic Scheduler] Fetch job already running, skipping duplicate.');
    return;
  }

  isAutoFetchRunning = true;
  console.log(`[Automatic Scheduler] Starting FIXED scheduled refresh at ${new Date().toISOString()}`);

  const db = loadDb();
  if (db.reels.length === 0) {
    console.log('[Automatic Scheduler] No saved Reels to update.');
    db.meta.lastAutoFetchAt = new Date().toISOString();
    saveDb(db);
    isAutoFetchRunning = false;
    return;
  }

  const nextScheduledIso = getNextScheduledTime().toISOString();

  for (let i = 0; i < db.reels.length; i++) {
    const reel = db.reels[i];
    console.log(`[Automatic Scheduler] Fetching Reel (${i + 1}/${db.reels.length}): ${reel.name} -> ${reel.url}`);

    // Mark status
    reel.status = 'fetching';
    reel.nextScheduledAt = nextScheduledIso;
    saveDb(db);

    const fetchResult = await fetchReelWithFallbackChain(db.providers, reel.url);

    // Reload db to prevent race conditions
    const currentDb = loadDb();
    const targetReel = currentDb.reels.find(r => r.id === reel.id);

    if (targetReel) {
      if (fetchResult.success && fetchResult.data) {
        updateReelWithFetchResult(targetReel, fetchResult, currentDb);
        targetReel.nextScheduledAt = nextScheduledIso;

        const logEntry: FetchLog = {
          id: 'log_auto_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          reelId: targetReel.id,
          reelName: targetReel.name,
          timestamp: new Date().toISOString(),
          type: 'automatic',
          status: 'success',
          providerName: fetchResult.providerName || 'Unknown Provider',
          statsAdded: {
            views: targetReel.views,
            likes: targetReel.likes,
            comments: targetReel.comments,
          },
        };
        currentDb.logs.unshift(logEntry);
        saveDb(currentDb);

        // Send Telegram completed result
        await notifyTelegramReelResult(targetReel, 'automatic');

      } else {
        // Failed fetch: NEVER erase previously valid statistics
        targetReel.status = 'failed';
        targetReel.lastError = fetchResult.error || 'Failed to fetch from all providers';
        targetReel.nextScheduledAt = nextScheduledIso;

        const logEntry: FetchLog = {
          id: 'log_auto_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          reelId: targetReel.id,
          reelName: targetReel.name,
          timestamp: new Date().toISOString(),
          type: 'automatic',
          status: 'failed',
          providerName: 'All Providers Failed',
          errorMessage: targetReel.lastError,
        };
        currentDb.logs.unshift(logEntry);
        saveDb(currentDb);
      }
    }
  }

  const finalDb = loadDb();
  finalDb.meta.lastAutoFetchAt = new Date().toISOString();
  saveDb(finalDb);

  isAutoFetchRunning = false;
  console.log('[Automatic Scheduler] Scheduled fetch job completed successfully.');
}

// Initialize node-cron schedule and backup timer check
export function initializeScheduler() {
  console.log('[Scheduler] Initializing fixed time cron (00:00, 06:00, 12:00, 18:00 UTC)...');

  // Node-cron pattern for 00:00, 06:00, 12:00, 18:00
  cron.schedule('0 0,6,12,18 * * *', () => {
    runAutomaticFetchJob().catch(err => console.error('[Scheduler Error]', err));
  }, {
    timezone: 'UTC',
  });

  // Secondary check every 30 seconds to handle any container wake-up or drift
  let lastTriggeredHour = -1;
  setInterval(() => {
    const now = new Date();
    const currentUtcHour = now.getUTCHours();
    const currentUtcMin = now.getUTCMinutes();

    if (FIXED_HOURS.includes(currentUtcHour) && currentUtcMin === 0 && lastTriggeredHour !== currentUtcHour) {
      lastTriggeredHour = currentUtcHour;
      runAutomaticFetchJob().catch(err => console.error('[Scheduler Fallback Error]', err));
    }
    if (currentUtcMin > 1) {
      lastTriggeredHour = -1; // Reset trigger flag
    }
  }, 30000);
}
