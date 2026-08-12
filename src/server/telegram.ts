import { loadDb, saveDb } from './db.js';
import { fetchReelWithFallbackChain } from './providers.js';
import { Reel, FetchLog } from '../types.js';

// Global set of reel IDs currently being fetched to prevent duplicate simultaneous fetches
const activeFetchingReelIds = new Set<string>();

let pollingInterval: NodeJS.Timeout | null = null;
let lastUpdateId = 0;
let isPollingActive = false;

// Format first 3 words of caption
export function getFirst3Words(caption: string): string {
  if (!caption) return 'Instagram Reel';
  const clean = caption.trim().replace(/\s+/g, ' ');
  const words = clean.split(' ');
  return words.slice(0, 3).join(' ') || 'Instagram Reel';
}

// Send telegram message
export async function sendTelegramMessage(botToken: string, chatId: string, text: string, replyMarkup?: any): Promise<boolean> {
  if (!botToken || !chatId) return false;
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const body: any = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    };
    if (replyMarkup) {
      body.reply_markup = replyMarkup;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const json = await res.json() as any;
    if (!json.ok) {
      console.error('[Telegram Error]', json.description || json);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Telegram Send Exception]', err);
    return false;
  }
}

// Send completed reel notification to Telegram after ANY successful fetch
export async function notifyTelegramReelResult(reel: Reel, logType: 'automatic' | 'manual_web' | 'force_refresh_telegram' = 'automatic'): Promise<boolean> {
  const db = loadDb();
  const { botToken, adminTelegramId, enabled } = db.telegram;

  if (!enabled || !botToken || !adminTelegramId) {
    return false;
  }

  const titleWords = getFirst3Words(reel.caption);
  const formattedViews = reel.views.toLocaleString();
  const formattedLikes = reel.likes.toLocaleString();

  // Telegram message specification required by prompt:
  // Video: first 3 words of caption
  // Views: xxxx
  // Likes: xxxx
  const message = [
    `<b>Video:</b> ${titleWords}`,
    `<b>Views:</b> ${formattedViews}`,
    `<b>Likes:</b> ${formattedLikes}`,
    ``,
    `📌 <b>Reel Name:</b> ${reel.name}`,
    `🔗 <a href="${reel.url}">View on Instagram</a>`,
    `🕒 <i>Updated: ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</i>`
  ].join('\n');

  return await sendTelegramMessage(botToken, adminTelegramId, message);
}

// Answer Callback Query
async function answerCallbackQuery(botToken: string, callbackQueryId: string, text?: string): Promise<void> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
  } catch (e) {
    // ignore
  }
}

// Handle incoming Telegram message
async function handleTelegramMessage(botToken: string, adminTelegramId: string, msg: any) {
  const senderId = String(msg.from?.id || '');
  const chatId = String(msg.chat?.id || '');

  // Security check: Only configured admin Telegram ID allowed
  if (senderId !== String(adminTelegramId).trim()) {
    console.warn(`[Telegram Security] Blocked unauthorized message from user ID: ${senderId}`);
    await sendTelegramMessage(botToken, chatId, '⛔ <b>Unauthorized.</b> Access restricted to bot administrator.');
    return;
  }

  const text = (msg.text || '').trim();

  if (text === '/start' || text === '/help') {
    const replyMarkup = {
      inline_keyboard: [
        [{ text: '🔄 Force Refresh', callback_query_data: 'force_refresh_menu' }],
        [{ text: '📊 List Saved Reels', callback_query_data: 'list_reels' }],
      ],
    };
    await sendTelegramMessage(
      botToken,
      chatId,
      `<b>📱 Instagram Reel Tracker Bot</b>\n\nWelcome Admin! Use the menu below or click <b>🔄 Force Refresh</b> to select a Reel and update stats immediately.`,
      replyMarkup
    );
    return;
  }

  if (text === '🔄 Force Refresh' || text === '/refresh' || text === '/reels') {
    await sendForceRefreshMenu(botToken, chatId);
    return;
  }

  // Default reply
  const replyMarkup = {
    inline_keyboard: [
      [{ text: '🔄 Force Refresh', callback_data: 'force_refresh_menu' }],
      [{ text: '📋 View All Reels', callback_data: 'list_reels' }],
    ],
  };
  await sendTelegramMessage(botToken, chatId, `Commands:\n/refresh - Force Refresh Reel\n/start - Main Menu`, replyMarkup);
}

// Send force refresh menu showing all saved reels as inline buttons
async function sendForceRefreshMenu(botToken: string, chatId: string) {
  const db = loadDb();
  if (db.reels.length === 0) {
    await sendTelegramMessage(botToken, chatId, '⚠️ <b>No Reels saved yet.</b> Add reels from the web dashboard.');
    return;
  }

  const buttons = db.reels.map((reel) => {
    const title = reel.name || getFirst3Words(reel.caption);
    return [{ text: `🎬 ${title} (${reel.views} views)`, callback_data: `select_reel:${reel.id}` }];
  });

  const replyMarkup = { inline_keyboard: buttons };
  await sendTelegramMessage(botToken, chatId, `<b>🔄 Select a Reel to Force Refresh:</b>`, replyMarkup);
}

// Handle inline keyboard button callbacks
async function handleTelegramCallback(botToken: string, adminTelegramId: string, cb: any) {
  const senderId = String(cb.from?.id || '');
  const callbackQueryId = cb.id;
  const data = cb.data || '';
  const chatId = String(cb.message?.chat?.id || adminTelegramId);

  if (senderId !== String(adminTelegramId).trim()) {
    await answerCallbackQuery(botToken, callbackQueryId, 'Unauthorized');
    return;
  }

  if (data === 'force_refresh_menu' || data === 'list_reels') {
    await answerCallbackQuery(botToken, callbackQueryId);
    await sendForceRefreshMenu(botToken, chatId);
    return;
  }

  if (data.startsWith('select_reel:')) {
    const reelId = data.replace('select_reel:', '');
    const db = loadDb();
    const reel = db.reels.find(r => r.id === reelId);

    if (!reel) {
      await answerCallbackQuery(botToken, callbackQueryId, 'Reel not found');
      await sendTelegramMessage(botToken, chatId, '❌ Reel not found in database.');
      return;
    }

    const replyMarkup = {
      inline_keyboard: [
        [{ text: `🚀 Fetch Now (${reel.name})`, callback_data: `fetch_now:${reel.id}` }],
        [{ text: '🔙 Back to Reels List', callback_data: 'force_refresh_menu' }],
      ],
    };

    await answerCallbackQuery(botToken, callbackQueryId);
    await sendTelegramMessage(
      botToken,
      chatId,
      `<b>Reel Selected:</b> ${reel.name}\n<b>Current Views:</b> ${reel.views}\n<b>Current Likes:</b> ${reel.likes}\n\nClick <b>Fetch Now</b> to update immediately:`,
      replyMarkup
    );
    return;
  }

  if (data.startsWith('fetch_now:')) {
    const reelId = data.replace('fetch_now:', '');
    await answerCallbackQuery(botToken, callbackQueryId, 'Fetching latest data...');

    // Trigger Telegram Force Refresh
    await executeTelegramForceRefresh(reelId, chatId);
    return;
  }

  await answerCallbackQuery(botToken, callbackQueryId);
}

// Execute Force Refresh via Telegram request
export async function executeTelegramForceRefresh(reelId: string, targetChatId?: string): Promise<{ success: boolean; message: string }> {
  // Prevent duplicate simultaneous fetches of the same Reel
  if (activeFetchingReelIds.has(reelId)) {
    return { success: false, message: 'Fetch already in progress for this Reel.' };
  }

  const db = loadDb();
  const reelIndex = db.reels.findIndex(r => r.id === reelId);

  if (reelIndex === -1) {
    return { success: false, message: 'Reel not found.' };
  }

  const reel = db.reels[reelIndex];
  activeFetchingReelIds.add(reelId);
  reel.status = 'fetching';
  saveDb(db);

  try {
    console.log(`[Telegram Force Refresh] Starting fetch for Reel: ${reel.name} (${reel.id})`);
    const fetchResult = await fetchReelWithFallbackChain(db.providers, reel.url);

    // Reload DB to get fresh state before write
    const currentDb = loadDb();
    const target = currentDb.reels.find(r => r.id === reelId);

    if (!target) {
      activeFetchingReelIds.delete(reelId);
      return { success: false, message: 'Reel deleted during fetch' };
    }

    if (fetchResult.success && fetchResult.data) {
      // Update statistics safely without wiping previously valid statistics
      target.views = fetchResult.data.views || target.views;
      target.likes = fetchResult.data.likes || target.likes;
      target.comments = fetchResult.data.comments || target.comments;
      target.shares = fetchResult.data.shares || target.shares;
      if (fetchResult.data.caption) target.caption = fetchResult.data.caption;
      if (fetchResult.data.author) target.author = fetchResult.data.author;
      if (fetchResult.data.thumbnail) target.thumbnail = fetchResult.data.thumbnail;

      // Reel name remains user custom if modified, else update from caption
      if (!target.name || target.name.startsWith('Reel ')) {
        target.name = getFirst3Words(target.caption).slice(0, 5);
      }

      target.status = 'success';
      target.lastError = null;
      target.lastUpdatedAt = new Date().toISOString();
      target.lastProviderUsed = fetchResult.providerName || null;

      // Note: Next scheduled update remains strictly on 00:00, 06:00, 12:00, 18:00 fixed times!
      
      // Log fetch history
      const logEntry: FetchLog = {
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        reelId: target.id,
        reelName: target.name,
        timestamp: new Date().toISOString(),
        type: 'force_refresh_telegram',
        status: 'success',
        providerName: fetchResult.providerName || 'Unknown Provider',
        statsAdded: {
          views: target.views,
          likes: target.likes,
          comments: target.comments,
        },
      };
      currentDb.logs.unshift(logEntry);
      if (currentDb.logs.length > 200) currentDb.logs.pop();

      saveDb(currentDb);
      activeFetchingReelIds.delete(reelId);

      // Send completed result to Telegram
      await notifyTelegramReelResult(target, 'force_refresh_telegram');

      return { success: true, message: 'Reel updated successfully and Telegram notified!' };

    } else {
      // Failed fetch: NEVER erase previously valid statistics!
      target.status = 'failed';
      target.lastError = fetchResult.error || 'Failed to fetch from all providers';
      
      const logEntry: FetchLog = {
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        reelId: target.id,
        reelName: target.name,
        timestamp: new Date().toISOString(),
        type: 'force_refresh_telegram',
        status: 'failed',
        providerName: 'All Providers Failed',
        errorMessage: target.lastError,
      };
      currentDb.logs.unshift(logEntry);
      saveDb(currentDb);

      activeFetchingReelIds.delete(reelId);

      if (targetChatId && currentDb.telegram.botToken) {
        await sendTelegramMessage(
          currentDb.telegram.botToken,
          targetChatId,
          `❌ <b>Force Refresh Failed for "${target.name}":</b>\n<code>${target.lastError}</code>\n\n<i>Previous statistics were preserved.</i>`
        );
      }

      return { success: false, message: target.lastError };
    }

  } catch (err: any) {
    activeFetchingReelIds.delete(reelId);
    return { success: false, message: err?.message || 'Error processing force refresh' };
  }
}

// Telegram Bot Polling Loop
export function startTelegramBotPolling() {
  if (isPollingActive) return;
  isPollingActive = true;

  console.log('[Telegram Bot] Starting background polling service...');

  pollingInterval = setInterval(async () => {
    const db = loadDb();
    const { botToken, adminTelegramId, enabled } = db.telegram;

    if (!enabled || !botToken || !adminTelegramId) {
      return;
    }

    try {
      const url = `https://api.telegram.org/bot${botToken}/getUpdates?offset=${lastUpdateId + 1}&timeout=5`;
      const res = await fetch(url);
      if (!res.ok) return;

      const json = await res.json() as any;
      if (json.ok && Array.isArray(json.result)) {
        for (const update of json.result) {
          lastUpdateId = Math.max(lastUpdateId, update.update_id);

          if (update.message) {
            await handleTelegramMessage(botToken, adminTelegramId, update.message);
          } else if (update.callback_query) {
            await handleTelegramCallback(botToken, adminTelegramId, update.callback_query);
          }
        }
      }
    } catch (err) {
      // Suppress transient polling network errors
    }
  }, 4000);
}

export function stopTelegramBotPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  isPollingActive = false;
}
