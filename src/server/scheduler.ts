import cron from 'node-cron';
import { loadDb, saveDb, loadDbFresh } from './db.js';
import { fetchReelWithFallbackChain } from './providers.js';
import { notifyTelegramReelResult, notifyTelegramStopPushingMove, notifyTelegramStopPushingProgress, notifyTelegramStopPushingRecovered } from './telegram.js';
import { updateReelWithFetchResult } from './statsHelper.js';
import { FetchLog, DatabaseSchema, Reel } from '../types.js';
import { scanInstagramAccount } from './accountScraper.js';
import { logSystemEvent } from './logger.js';

export function getNextScheduledTime(fromDate: Date = new Date()): Date {
  const db = loadDb();
  const intervalHours = db.meta?.scheduleIntervalHours || 24;
  
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

/**
 * Evaluates all reels in the database against the Stop Pushing rules:
 * - Added/detected 72h+ ago AND views < 100 => Stop Pushing
 * - If views reach >= 100 => Automatically recover to Active
 * Preserves association with dashboard, does NOT delete or archive.
 */
export function evaluateReelsForStopPushing(db: DatabaseSchema): { movedToStopPushing: number; recoveredToActive: number } {
  let movedToStopPushing = 0;
  let recoveredToActive = 0;
  const now = Date.now();
  const nowIso = new Date().toISOString();

  for (const reel of db.reels || []) {
    // Never modify archived or paid videos
    if (reel.category === 'archived' || reel.category === 'paid') continue;

    const discoveredMs = new Date(reel.firstDiscoveredAt || reel.createdAt || nowIso).getTime();
    const ageHours = (now - discoveredMs) / (1000 * 60 * 60);
    const views = Math.max(0, Math.floor(reel.views || 0));

    // Rule 1: Video added 72 hours ago and has < 100 views -> Stop Pushing
    if (reel.category !== 'stop_pushing' && ageHours >= 72 && views < 100) {
      reel.category = 'stop_pushing';
      reel.stopPushingAt = reel.stopPushingAt || nowIso;
      reel.lastStopPushingCheckAt = reel.lastStopPushingCheckAt || nowIso;
      reel.nextStopPushingCheckAt = new Date(now + 72 * 60 * 60 * 1000).toISOString();
      reel.stopPushingCheckCount = 0;
      movedToStopPushing++;
      
      console.log(`[Stop Pushing] Reel "${reel.name}" (${reel.id}) moved to Stop Pushing (Age: ${Math.round(ageHours)}h, Views: ${views} < 100).`);
      logSystemEvent(
        'info',
        'scheduler',
        `Reel "${reel.name}" moved to Stop Pushing (Age: ${Math.round(ageHours)}h, Views: ${views} < 100). Assigned to 3-day (72h) automatic schedule.`,
        undefined,
        { reelId: reel.id, url: reel.url, nextCheck: reel.nextStopPushingCheckAt }
      );

      // Send Stop Pushing Telegram notification
      notifyTelegramStopPushingMove(reel, ageHours, reel.nextStopPushingCheckAt).catch(e => console.warn('[Telegram StopPushing Move Alert Error]', e));
    } else if (reel.category === 'stop_pushing' && views >= 100) {
      // Recovery Rule: Views reached >= 100 -> Return to Active
      reel.category = 'active';
      reel.stopPushingAt = null;
      reel.lastStopPushingCheckAt = null;
      reel.nextStopPushingCheckAt = null;
      reel.stopPushingCheckCount = 0;
      recoveredToActive++;

      console.log(`[Stop Pushing] Reel "${reel.name}" (${reel.id}) recovered to Active (Views: ${views} >= 100).`);
      logSystemEvent(
        'info',
        'scheduler',
        `Reel "${reel.name}" reached ${views} views (>= 100) and recovered from Stop Pushing to Active!`,
        undefined,
        { reelId: reel.id, url: reel.url }
      );

      // Send Recovery Telegram notification
      notifyTelegramStopPushingRecovered(reel).catch(e => console.warn('[Telegram StopPushing Recovery Alert Error]', e));
    }
  }

  return { movedToStopPushing, recoveredToActive };
}

// Global active automatic fetch guard
let isAutoFetchRunning = false;
let isStopPushingRecheckRunning = false;
let isSchedulerInitialized = false;

export async function runAutomaticFetchJob(isManualForce = false): Promise<{ success: boolean; message: string; count?: number }> {
  if (isAutoFetchRunning) {
    console.log('[Automatic Scheduler] Fetch job already running, skipping duplicate.');
    return { success: false, message: 'A batch fetch is currently in progress.' };
  }

  // Load database directly from Firestore (or local disk fallback) to ensure zero stale state
  const db = await loadDbFresh();

  // Evaluate any videos ready for Stop Pushing before beginning active fetch
  const evalResult = evaluateReelsForStopPushing(db);
  if (evalResult.movedToStopPushing > 0 || evalResult.recoveredToActive > 0) {
    saveDb(db);
  }

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
  // CRITICAL: Exclude 'stop_pushing', 'archived', and 'paid' videos from normal automated fetches
  const activeReels = db.reels.filter(r => r.category !== 'archived' && r.category !== 'paid' && r.category !== 'stop_pushing');
  const totalReels = activeReels.length;

  console.log(`[Automatic Scheduler] Processing ${totalReels} active reels (excluded Stop Pushing, Archived, and Paid).`);

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
        } else {
          // Re-evaluate Stop Pushing condition after fresh fetch
          const discoveredMs = new Date(reloadReel.firstDiscoveredAt || reloadReel.createdAt || new Date().toISOString()).getTime();
          const ageHours = (Date.now() - discoveredMs) / (1000 * 60 * 60);
          if (ageHours >= 72 && (reloadReel.views || 0) < 100) {
            reloadReel.category = 'stop_pushing';
            reloadReel.stopPushingAt = reloadReel.stopPushingAt || new Date().toISOString();
            reloadReel.lastStopPushingCheckAt = new Date().toISOString();
            reloadReel.nextStopPushingCheckAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
            console.log(`[Automatic Scheduler] Reel "${reloadReel.name}" entered Stop Pushing (Age: ${Math.round(ageHours)}h, Views: ${reloadReel.views} < 100).`);
          } else {
            reloadReel.category = 'active';
            reloadReel.archiveReason = null;
            reloadReel.archivedAt = null;
          }

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
          if (reloadReel.category === 'active') {
            await notifyTelegramReelResult(reloadReel, isManualForce ? 'manual_web' : 'automatic');
          }
        }
      } else {
        // Auto-archive failed reel
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
      }
    }
  }
  
  const finalDb = loadDb();
  if (!finalDb.meta) finalDb.meta = { lastAutoFetchAt: null, deletedReelIds: [] };
  finalDb.meta.lastAutoFetchAt = new Date().toISOString();
  saveDb(finalDb);

  isAutoFetchRunning = false;
  console.log('[Automatic Scheduler] Scheduled fetch job completed successfully.');
  return { success: true, message: `Completed refresh for ${totalReels} active reels.`, count: totalReels };
}

/**
 * Automatic Re-check Job for Stop-Pushing Videos (Runs on each Reel's individual 3-Day / 72-Hour Cycle)
 * - Evaluates each Stop Pushing reel based on its own unique 72-hour timer (nextStopPushingCheckAt)
 * - If views >= 100: returns to Active status and sends celebratory Telegram notification
 * - If views < 100: remains Stop Pushing, resets next check for 72 hours later, records log, and sends progress notification
 */
export async function runStopPushingRecheckJob(isManual = false): Promise<{ success: boolean; count: number; total: number; recovered: number; message: string }> {
  if (isStopPushingRecheckRunning) {
    console.log('[Stop Pushing Recheck] Recheck cycle already running, skipping.');
    return { success: false, count: 0, total: 0, recovered: 0, message: 'Stop Pushing recheck already in progress.' };
  }

  isStopPushingRecheckRunning = true;
  let totalProcessed = 0;
  let totalRecovered = 0;

  try {
    const db = loadDb();
    const now = Date.now();
    const stopPushingReels = (db.reels || []).filter(r => r.category === 'stop_pushing');

    if (stopPushingReels.length === 0) {
      isStopPushingRecheckRunning = false;
      return { success: true, count: 0, total: 0, recovered: 0, message: 'No Stop Pushing videos found in database.' };
    }

    console.log(`[Stop Pushing Recheck] Evaluating ${stopPushingReels.length} Stop Pushing videos (manual: ${isManual})...`);

    for (const spReel of stopPushingReels) {
      const nextCheckMs = spReel.nextStopPushingCheckAt ? new Date(spReel.nextStopPushingCheckAt).getTime() : 0;
      const isDue = isManual || isNaN(nextCheckMs) || nextCheckMs <= now;

      if (!isDue) continue;

      totalProcessed++;
      const currentCycle = (spReel.stopPushingCheckCount || 0) + 1;
      console.log(`[Stop Pushing Recheck] (${totalProcessed}) Cycle #${currentCycle} - Fetching latest stats for Stop Pushing Reel: "${spReel.name}" (${spReel.id})...`);

      const providers = db.providers || [];
      const fetchResult = await fetchReelWithFallbackChain(providers, spReel.url);

      const currentDb = loadDb();
      const reelToUpdate = currentDb.reels.find(r => r.id === spReel.id);
      if (!reelToUpdate) continue;

      const nowIso = new Date().toISOString();
      const next3DaysIso = new Date(now + 72 * 60 * 60 * 1000).toISOString();

      reelToUpdate.lastStopPushingCheckAt = nowIso;
      reelToUpdate.nextStopPushingCheckAt = next3DaysIso;
      reelToUpdate.stopPushingCheckCount = currentCycle;

      if (fetchResult.success && fetchResult.data) {
        updateReelWithFetchResult(reelToUpdate, fetchResult, currentDb);
        reelToUpdate.status = 'success';
        reelToUpdate.lastError = null;

        if ((reelToUpdate.views || 0) >= 100) {
          // Recovered to Active!
          reelToUpdate.category = 'active';
          reelToUpdate.stopPushingAt = null;
          reelToUpdate.lastStopPushingCheckAt = null;
          reelToUpdate.nextStopPushingCheckAt = null;
          reelToUpdate.stopPushingCheckCount = 0;
          totalRecovered++;

          console.log(`[Stop Pushing Recheck] 🎉 Reel "${reelToUpdate.name}" reached ${reelToUpdate.views} views (>= 100). Restored to ACTIVE!`);
          logSystemEvent(
            'success',
            'scheduler',
            `Stop Pushing Recheck: Reel "${reelToUpdate.name}" reached ${reelToUpdate.views} views (>= 100) and automatically recovered to Active!`,
            undefined,
            { reelId: reelToUpdate.id, views: reelToUpdate.views }
          );

          await notifyTelegramStopPushingRecovered(reelToUpdate);
        } else {
          reelToUpdate.category = 'stop_pushing';
          console.log(`[Stop Pushing Recheck] Reel "${reelToUpdate.name}" remains at ${reelToUpdate.views} views (< 100). Next check at ${next3DaysIso}.`);
          
          logSystemEvent(
            'info',
            'scheduler',
            `[Stop Pushing 3-Day Schedule] Cycle #${currentCycle} for "${reelToUpdate.name}": ${reelToUpdate.views} views (< 100 target). Next check scheduled for ${new Date(next3DaysIso).toUTCString()}.`,
            undefined,
            { reelId: reelToUpdate.id, views: reelToUpdate.views, cycle: currentCycle, nextCheck: next3DaysIso }
          );

          await notifyTelegramStopPushingProgress(reelToUpdate, currentCycle, next3DaysIso);
        }
      } else {
        reelToUpdate.lastError = fetchResult.error || 'Failed to fetch during Stop Pushing recheck';
        console.warn(`[Stop Pushing Recheck] Fetch failed for "${reelToUpdate.name}": ${reelToUpdate.lastError}`);
        logSystemEvent(
          'warn',
          'scheduler',
          `Stop Pushing recheck fetch error for "${reelToUpdate.name}": ${reelToUpdate.lastError}`,
          undefined,
          { reelId: reelToUpdate.id }
        );
      }

      saveDb(currentDb);
    }

    const currentDb = loadDb();
    if (!currentDb.meta) currentDb.meta = { lastAutoFetchAt: null, deletedReelIds: [] };
    currentDb.meta.lastStopPushingCheckAt = new Date().toISOString();
    saveDb(currentDb);

    logSystemEvent(
      'info',
      'scheduler',
      `Stop Pushing automatic check completed. Evaluated ${totalProcessed} due video(s), ${totalRecovered} recovered to Active.`,
      undefined,
      { processed: totalProcessed, recovered: totalRecovered }
    );

  } catch (err: any) {
    console.error('[Stop Pushing Recheck Error]', err);
    logSystemEvent('error', 'scheduler', `Error during Stop Pushing recheck: ${err?.message || err}`);
  } finally {
    isStopPushingRecheckRunning = false;
  }

  return {
    success: true,
    count: totalProcessed,
    total: totalProcessed,
    recovered: totalRecovered,
    message: `Processed ${totalProcessed} Stop Pushing videos (${totalRecovered} recovered to Active).`,
  };
}

/**
 * Force Fetch a single Stop-Pushing video.
 * Bypasses 72h / 100 views restrictions and instantly re-evaluates.
 */
export async function forceFetchStopPushingReel(reelId: string): Promise<{ success: boolean; reel?: Reel; recovered: boolean; message: string; error?: string }> {
  const db = loadDb();
  const reel = db.reels.find(r => r.id === reelId);

  if (!reel) {
    return { success: false, recovered: false, message: 'Reel not found.' };
  }

  console.log(`[Force Fetch Stop-Pushing] Refreshing "${reel.name}" (${reel.id})...`);
  reel.status = 'fetching';
  saveDb(db);

  const fetchResult = await fetchReelWithFallbackChain(db.providers || [], reel.url);
  const currentDb = loadDb();
  const target = currentDb.reels.find(r => r.id === reelId);

  if (!target) {
    return { success: false, recovered: false, message: 'Reel was deleted during fetch.' };
  }

  const nowIso = new Date().toISOString();
  const next3DaysIso = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  const nextCycle = (target.stopPushingCheckCount || 0) + 1;

  target.lastStopPushingCheckAt = nowIso;
  target.nextStopPushingCheckAt = next3DaysIso;
  target.stopPushingCheckCount = nextCycle;

  if (fetchResult.success && fetchResult.data) {
    updateReelWithFetchResult(target, fetchResult, currentDb);
    target.status = 'success';
    target.lastError = null;

    let recovered = false;
    if ((target.views || 0) >= 100) {
      target.category = 'active';
      target.stopPushingAt = null;
      target.lastStopPushingCheckAt = null;
      target.nextStopPushingCheckAt = null;
      target.stopPushingCheckCount = 0;
      recovered = true;
      console.log(`[Force Fetch Stop-Pushing] 🎉 "${target.name}" reached ${target.views} views (>= 100). Restored to ACTIVE!`);
      logSystemEvent('success', 'scheduler', `Force Fetch: "${target.name}" reached ${target.views} views (>= 100) and recovered to Active.`, undefined, { reelId: target.id });
      notifyTelegramStopPushingRecovered(target).catch(e => console.warn('[Telegram Notify Error]', e));
    } else {
      target.category = 'stop_pushing';
      console.log(`[Force Fetch Stop-Pushing] "${target.name}" has ${target.views} views (< 100). Retained in Stop Pushing.`);
      logSystemEvent('info', 'scheduler', `Force Fetch: "${target.name}" has ${target.views} views (< 100). 3-day schedule timer reset to ${new Date(next3DaysIso).toUTCString()}.`, undefined, { reelId: target.id, cycle: nextCycle });
      notifyTelegramStopPushingProgress(target, nextCycle, next3DaysIso).catch(e => console.warn('[Telegram Notify Error]', e));
    }

    saveDb(currentDb);
    return {
      success: true,
      reel: target,
      recovered,
      message: recovered ? `Reel reached ${target.views.toLocaleString()} views and is restored to Active!` : `Reel refreshed (${target.views.toLocaleString()} views). Next 72h check scheduled.`,
    };
  } else {
    target.status = 'failed';
    target.lastError = fetchResult.error || 'Failed to fetch from all providers';
    saveDb(currentDb);
    return {
      success: false,
      reel: target,
      recovered: false,
      error: target.lastError,
      message: target.lastError,
    };
  }
}

/**
 * Force Fetch ALL Stop-Pushing videos simultaneously in batch.
 */
export async function forceFetchAllStopPushingReels(): Promise<{ success: boolean; total: number; recovered: number; message: string }> {
  return await runStopPushingRecheckJob(true);
}

let isAccountScanRunning = false;

export async function runScheduledAccountScans(isManual = false) {
  if (isAccountScanRunning) {
    console.log('[Account Scanner] Scan already in progress. Skipping duplicate.');
    return { success: false, message: 'Account scan already in progress.' };
  }

  isAccountScanRunning = true;
  try {
    const db = loadDb();
    const accounts = db.instagramAccounts || [];
    const enabledAccounts = accounts.filter(a => a && a.enabled !== false);

    if (enabledAccounts.length === 0) {
      isAccountScanRunning = false;
      return { success: true, message: 'No active Instagram accounts to scan.', count: 0 };
    }

    console.log(`[Account Scanner] Checking ${enabledAccounts.length} enabled Instagram accounts for scheduled discovery...`);

    for (const acc of enabledAccounts) {
      const intervalMs = (acc.scanIntervalMinutes || 30) * 60 * 1000;
      const lastRunMs = acc.lastScanAt ? new Date(acc.lastScanAt).getTime() : 0;
      const elapsedMs = Date.now() - lastRunMs;

      // Scan if never run, or if interval has passed, or if manual trigger
      if (isManual || isNaN(lastRunMs) || elapsedMs >= intervalMs) {
        console.log(`[Account Scanner] Scanning @${acc.normalizedUsername} (interval: ${acc.scanIntervalMinutes}m)...`);
        try {
          const result = await scanInstagramAccount(acc.id, 'normal', isManual ? 'manual' : 'scheduled');
          console.log(`[Account Scanner] Result for @${acc.normalizedUsername}: Discovered ${result.totalDiscovered}, New: ${result.newReelsCount}, Known: ${result.alreadyKnown}`);
        } catch (scanErr: any) {
          console.error(`[Account Scanner] Error scanning @${acc.normalizedUsername}:`, scanErr);
          logSystemEvent('error', 'scraper', `Scheduled profile scan failed for @${acc.normalizedUsername}: ${scanErr?.message || scanErr}`);
        }
      }
    }
  } catch (err: any) {
    console.error('[Account Scanner] Global scanning error:', err);
    logSystemEvent('error', 'scraper', `Global account scanning error: ${err?.message || err}`);
  } finally {
    isAccountScanRunning = false;
  }

  return { success: true, message: 'Account scan cycle completed.' };
}

// Initialize node-cron schedule and backup timer check
export function initializeScheduler() {
  if (isSchedulerInitialized) {
    console.log('[Scheduler] Scheduler already initialized. Skipping.');
    return;
  }
  isSchedulerInitialized = true;
  console.log('[Scheduler] Initializing dynamic hourly cron check and background tasks...');

  // Check reels every hour at minute 0
  cron.schedule('0 * * * *', () => {
    const db = loadDb();
    const intervalHours = db.meta?.scheduleIntervalHours || 24;
    const currentHour = new Date().getUTCHours();

    console.log(`[Scheduler Cron] Hourly tick at UTC hour ${currentHour} (Configured interval: ${intervalHours}h)`);

    // 1. Evaluate Stop Pushing on all videos hourly
    evaluateReelsForStopPushing(db);

    // 2. Check if any Stop Pushing videos are due for their 3-day automatic recheck
    runStopPushingRecheckJob(false).catch(err => console.error('[Stop Pushing Cron Error]', err));

    // 3. Regular interval fetch for active reels
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

  // Account discovery loop: check every 2 minutes
  cron.schedule('*/2 * * * *', () => {
    runScheduledAccountScans(false).catch(err => console.error('[Account Scheduler Error]', err));
  }, {
    timezone: 'UTC',
  });

  // Perform initial Stop Pushing evaluation on server boot
  setTimeout(() => {
    try {
      const db = loadDb();
      evaluateReelsForStopPushing(db);
    } catch (e) {
      console.warn('[Scheduler Startup Error]', e);
    }
  }, 3000);
}
