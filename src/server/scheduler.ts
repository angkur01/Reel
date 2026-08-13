import cron from 'node-cron';
import { loadDb, saveDb, loadDbFresh } from './db.js';
import { fetchReelWithFallbackChain } from './providers.js';
import { notifyTelegramReelResult } from './telegram.js';
import { updateReelWithFetchResult } from './statsHelper.js';
import { FetchLog } from '../types.js';

export function getNextScheduledTime(fromDate: Date = new Date()): Date {
  const db = loadDb();
  const intervalHours = db.meta?.scheduleIntervalHours || 6;
  
  // Calculate target hours for the interval
  const targetHours: number[] = [];
  for (let h = 0; h < 24; h += intervalHours) {
    targetHours.push(h);
  }

  const year = fromDate.getUTCFullYear();
  const month = fromDate.getUTCMonth();
  const date = fromDate.getUTCDate();
  const currentHour = fromDate.getUTCHours();
  const currentMinute = fromDate.getUTCMinutes();

  for (const targetHour of targetHours) {
    if (targetHour > currentHour || (targetHour === currentHour && currentMinute === 0)) {
      const nextTime = new Date(Date.UTC(year, month, date, targetHour, 0, 0, 0));
      if (nextTime.getTime() > fromDate.getTime()) {
        return nextTime;
      }
    }
  }

  // Next slot is targetHours[0] UTC tomorrow
  return new Date(Date.UTC(year, month, date + 1, targetHours[0] || 0, 0, 0, 0));
}

// Global active automatic fetch guard
let isAutoFetchRunning = false;
let isSchedulerInitialized = false;

export async function runAutomaticFetchJob(isManualForce = false): Promise<{ success: boolean; message: string; count?: number }> {
  if (isAutoFetchRunning) {
    console.log('[Automatic Scheduler] Fetch job already running, skipping duplicate.');
    return { success: false, message: 'A batch fetch is currently in progress.' };
  }

  // Load database directly from Firestore (or local disk fallback) to ensure zero stale state
  const db = await loadDbFresh();

  // Guard against duplicate automatic scheduled triggers within a 15-minute window
  if (!isManualForce && db.meta?.lastAutoFetchAt) {
    const lastRunMs = new Date(db.meta.lastAutoFetchAt).getTime();
    const timeSinceLastMs = Date.now() - lastRunMs;
    const cooldownMs = 15 * 60 * 1000; // 15 minutes cooldown

    if (!isNaN(lastRunMs) && timeSinceLastMs < cooldownMs) {
      console.log(`[Automatic Scheduler] Scheduled fetch already ran ${Math.round(timeSinceLastMs / 1000)}s ago (${db.meta.lastAutoFetchAt}). Skipping duplicate trigger.`);
      return { success: true, message: 'Scheduled fetch already completed recently.' };
    }
  }

  isAutoFetchRunning = true;
  console.log(`[Automatic Scheduler] Starting ${isManualForce ? 'MANUAL FORCE' : 'FIXED SCHEDULED'} refresh at ${new Date().toISOString()}`);

  // Instantly mark execution timestamp to lock out secondary concurrent cron/interval triggers
  db.meta.lastAutoFetchAt = new Date().toISOString();
  saveDb(db);

  if (db.reels.length === 0) {
    console.log('[Automatic Scheduler] No saved Reels to update.');
    isAutoFetchRunning = false;
    return { success: true, message: 'No reels saved in database.', count: 0 };
  }

  const nextScheduledIso = getNextScheduledTime().toISOString();
  const totalReels = db.reels.length;

  for (let i = 0; i < totalReels; i++) {
    const reel = db.reels[i];
    console.log(`[Automatic Scheduler] Fetching Reel (${i + 1}/${totalReels}): ${reel.name} -> ${reel.url}`);

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
          type: isManualForce ? 'manual_web' : 'automatic',
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
        await notifyTelegramReelResult(targetReel, isManualForce ? 'manual_web' : 'automatic');

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
          type: isManualForce ? 'manual_web' : 'automatic',
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
  return { success: true, message: `Completed refresh for ${totalReels} reels.`, count: totalReels };
}

// Initialize node-cron schedule and backup timer check
export function initializeScheduler() {
  if (isSchedulerInitialized) {
    console.log('[Scheduler] Scheduler already initialized. Skipping.');
    return;
  }
  isSchedulerInitialized = true;
  console.log('[Scheduler] Initializing dynamic hourly cron check...');

  // Check every hour at minute 0
  cron.schedule('0 * * * *', () => {
    const db = loadDb();
    const intervalHours = db.meta?.scheduleIntervalHours || 6;
    const currentHour = new Date().getUTCHours();

    if (currentHour % intervalHours === 0) {
      // Introduce random jitter to prevent concurrent container execution race condition on Cloud Run
      const jitterMs = Math.floor(Math.random() * 45000) + 5000; // 5 to 50 seconds delay
      console.log(`[Scheduler] Cron interval (${intervalHours}h) triggered at UTC hour ${currentHour}. Delaying execution by ${jitterMs}ms...`);
      setTimeout(() => {
        runAutomaticFetchJob(false).catch(err => console.error('[Scheduler Error]', err));
      }, jitterMs);
    }
  }, {
    timezone: 'UTC',
  });
}
