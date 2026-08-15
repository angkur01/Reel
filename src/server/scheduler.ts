import cron from 'node-cron';
import { loadDb, saveDb, loadDbFresh } from './db.js';
import { fetchReelWithFallbackChain } from './providers.js';
import { notifyTelegramReelResult } from './telegram.js';
import { updateReelWithFetchResult } from './statsHelper.js';
import { FetchLog } from '../types.js';

export function getNextScheduledTime(fromDate: Date = new Date()): Date {
  const db = loadDb();
  const intervalHours = db.meta?.scheduleIntervalHours || 1;
  
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
  const activeReels = db.reels.filter(r => r.category !== 'archived' && r.category !== 'paid');
  const totalReels = activeReels.length;
  for (let i = 0; i < totalReels; i++) {
    let currentDb = loadDb();
    if (i >= activeReels.length) continue;
    const reelId = activeReels[i].id;
    const targetReel = currentDb.reels.find(r => r.id === reelId);
    if (!targetReel) continue;
    
    console.log(`[Automatic Scheduler] Fetching Reel (${i + 1}/${totalReels}): ${targetReel.name} -> ${targetReel.url}`);
    
    // Mark status
    targetReel.status = 'fetching';
    targetReel.nextScheduledAt = nextScheduledIso;
    saveDb(currentDb);
    
    const providers = currentDb.providers;
    const fetchResult = await fetchReelWithFallbackChain(providers, targetReel.url);
    
    // Reload db to prevent race conditions
    currentDb = loadDb();
    const reloadReel = currentDb.reels.find(r => r.id === reelId);
    
    if (reloadReel) {
      if (fetchResult.success && fetchResult.data) {
        updateReelWithFetchResult(reloadReel, fetchResult, currentDb);
        reloadReel.nextScheduledAt = nextScheduledIso;

        // Check Low-View Auto-Archive rule
        // Condition 1: Total views < 2,000
        // Condition 2: Gained < 30 views in previous 24 hours (with sufficient tracking data)
        const isLowViewGrowthArchive = (reloadReel.views < 2000) &&
          (reloadReel.hasSufficient24hData === true) &&
          ((reloadReel.growth24h || 0) < 30);

        if (isLowViewGrowthArchive) {
          console.log(`[Automatic Scheduler] Auto-archiving reel "${reloadReel.name}" (${reloadReel.id}) due to low 24h growth: ${reloadReel.views} total views, +${reloadReel.growth24h || 0} views in 24h.`);
          reloadReel.category = 'archived';
          reloadReel.archiveReason = 'Low 24-hour growth';
          reloadReel.archivedAt = new Date().toISOString();

          const logEntry: FetchLog = {
            id: 'log_auto_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            reelId: reloadReel.id,
            reelName: reloadReel.name,
            timestamp: new Date().toISOString(),
            type: isManualForce ? 'manual_web' : 'automatic',
            status: 'success',
            providerName: fetchResult.providerName || 'Unknown Provider',
            statsAdded: {
              views: reloadReel.views,
              likes: reloadReel.likes,
              comments: reloadReel.comments,
            },
            errorMessage: `Auto-archived: Low 24h growth (${reloadReel.views} total views, +${reloadReel.growth24h || 0} 24h gain)`,
          };
          currentDb.logs.unshift(logEntry);
          saveDb(currentDb);
          // Do NOT send Telegram result for auto-archived reels (must remain completely inactive)
        } else {
          reloadReel.category = 'active';
          reloadReel.archiveReason = null;
          reloadReel.archivedAt = null;

          const logEntry: FetchLog = {
            id: 'log_auto_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            reelId: reloadReel.id,
            reelName: reloadReel.name,
            timestamp: new Date().toISOString(),
            type: isManualForce ? 'manual_web' : 'automatic',
            status: 'success',
            providerName: fetchResult.providerName || 'Unknown Provider',
            statsAdded: {
              views: reloadReel.views,
              likes: reloadReel.likes,
              comments: reloadReel.comments,
            },
          };
          currentDb.logs.unshift(logEntry);
          saveDb(currentDb);

          // Only send Telegram for successfully completed active Reel updates
          await notifyTelegramReelResult(reloadReel, isManualForce ? 'manual_web' : 'automatic');
        }
      } else {
        // Rule 1: AUTO-ARCHIVE FAILED REELS
        // If any Reel fails to fetch successfully during an automatic scheduled fetch:
        // - Automatically move that Reel to ARCHIVED status.
        // - Do NOT retry it automatically afterward.
        // - Do NOT include it in active Dashboard, Reels, CPM, campaign totals, payout totals, or Telegram.
        // - Do NOT send a Telegram result for the failed fetch.
        // - Preserve the last valid data. Record the failure in archiveReason / lastFetchError.
        console.warn(`[Automatic Scheduler] Fetch failed for reel "${reloadReel.name}" (${reloadReel.id}). Auto-archiving reel with reason "Fetch failed".`);
        reloadReel.status = 'failed';
        reloadReel.lastError = fetchResult.error || 'Failed to fetch from all providers';
        reloadReel.lastFetchError = reloadReel.lastError;
        reloadReel.category = 'archived';
        reloadReel.archiveReason = 'Fetch failed';
        reloadReel.archivedAt = new Date().toISOString();
        reloadReel.nextScheduledAt = nextScheduledIso;

        const logEntry: FetchLog = {
          id: 'log_auto_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          reelId: reloadReel.id,
          reelName: reloadReel.name,
          timestamp: new Date().toISOString(),
          type: isManualForce ? 'manual_web' : 'automatic',
          status: 'failed',
          providerName: 'All Providers Failed',
          errorMessage: `Auto-archived: ${reloadReel.lastError}`,
        };
        currentDb.logs.unshift(logEntry);
        saveDb(currentDb);
        // Do NOT send a Telegram result for failed fetch
      }
    }
  }
  
  const finalDb = loadDb();
  if (!finalDb.meta) finalDb.meta = { lastAutoFetchAt: null, deletedReelIds: [] };
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
    const intervalHours = db.meta?.scheduleIntervalHours || 1;
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
