import { loadDb, saveDb, normalizeInstagramUrl } from './db.js';
import { fetchReelWithFallbackChain } from './providers.js';
import { runAiMonitoringCheck, generateDailyAiReport, generateAiCpmTelegramMessage, talkToAi } from './ai.js';
import { applyCpmToReel } from './cpm.js';
import { updateReelWithFetchResult, generateTwoWordTitleFromCaption } from './statsHelper.js';
import { Reel, FetchLog } from '../types.js';

// Global set of reel IDs currently being fetched to prevent duplicate simultaneous fetches
const activeFetchingReelIds = new Set<string>();

let pollingTimeout: NodeJS.Timeout | null = null;
let lastUpdateId = 0;
let isPollingActive = false;
let isPollingInFlight = false;
let currentPollingSessionId = 0;
const processedUpdateIds = new Set<number>();

// Format first 3 words of caption
export function getFirst3Words(caption: string): string {
  if (!caption) return 'Instagram Reel';
  const clean = caption.trim().replace(/\s+/g, ' ');
  const words = clean.split(' ');
  return words.slice(0, 3).join(' ') || 'Instagram Reel';
}

// Default Admin Keyboard Menu
export const mainAdminKeyboard = {
  keyboard: [
    [{ text: '📊 Dashboard' }, { text: '🎬 Reels' }],
    [{ text: '⚡ Force Refresh' }, { text: '🧠 AI Status' }],
    [{ text: '💬 Talk to AI' }, { text: '📈 Daily Report' }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

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
    } else {
      body.reply_markup = mainAdminKeyboard;
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

  // Ensure CPM is updated for this reel
  applyCpmToReel(reel, db.cpmCampaigns || []);

  const titleWords = getFirst3Words(reel.caption);
  const formattedViews = reel.views.toLocaleString();
  const formattedLikes = reel.likes.toLocaleString();

  const lines: string[] = [];

  if (reel.campaignName) {
    lines.push(`🔥 <b>${reel.campaignName} Campaign Update</b>`);
    lines.push(`🎬 <b>Reel:</b> ${reel.name}`);
    lines.push(`👀 <b>Views:</b> ${formattedViews} | ❤️ <b>Likes:</b> ${formattedLikes}`);
    lines.push(`💰 <b>CPM Earnings:</b> $${(reel.cpmEarnings || 0).toFixed(2)}`);
    lines.push(`💸 <b>8% Fee:</b> $${(reel.fee3Percent || 0).toFixed(2)} | 💵 <b>Est. Payout:</b> $${(reel.estimatedPayout || 0).toFixed(2)}`);
  } else {
    lines.push(`<b>Video:</b> ${titleWords}`);
    lines.push(`📌 <b>Reel Name:</b> ${reel.name}`);
    lines.push(`👀 <b>Views:</b> ${formattedViews} | ❤️ <b>Likes:</b> ${formattedLikes}`);
  }

  lines.push(`🔗 <a href="${reel.url}">View on Instagram</a>`);
  lines.push(`🕒 <i>Updated: ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</i>`);

  const message = lines.join('\n');
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

// Process uploaded video message from Telegram
async function handleTelegramVideoUpload(botToken: string, chatId: string, msg: any) {
  const video = msg.video || msg.video_note || (msg.document?.mime_type?.startsWith('video/') ? msg.document : null);
  if (!video) return;

  const caption = (msg.caption || 'Telegram Video Reel').trim();
  const fileId = video.file_id;

  try {
    // Get file path from Telegram
    const infoRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
    const infoJson = await infoRes.json() as any;

    let fileUrl = '';
    if (infoJson.ok && infoJson.result?.file_path) {
      fileUrl = `https://api.telegram.org/file/bot${botToken}/${infoJson.result.file_path}`;
    }

    // Extract potential Instagram URL in caption
    const urlMatch = caption.match(/https?:\/\/(www\.)?instagram\.com\/(reel|p|tv)\/[A-Za-z0-9_-]+/i);
    let reelUrl = urlMatch ? urlMatch[0] : `https://instagram.com/reel/tg_${Date.now()}`;
    const normalizedTargetUrl = normalizeInstagramUrl(reelUrl) || reelUrl;

    const db = loadDb();

    // Check duplicate using normalized comparison
    const existingIndex = db.reels.findIndex(r => normalizeInstagramUrl(r.url) === normalizedTargetUrl);

    if (existingIndex !== -1) {
      const existing = db.reels[existingIndex];
      existing.videoFileUrl = fileUrl || existing.videoFileUrl;
      existing.telegramFileId = fileId;
      if (caption) existing.caption = caption;
      saveDb(db);

      await sendTelegramMessage(
        botToken,
        chatId,
        `🎬 <b>Updated Reel Video Media!</b>\nLinked video media to existing Reel: <b>${existing.name}</b>`
      );
      return;
    }

    // Create new Reel from Telegram video upload
    const reelName = getFirst3Words(caption).slice(0, 10);
    const newReel: Reel = {
      id: 'reel_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      url: reelUrl,
      name: reelName,
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      caption: caption,
      author: msg.from?.first_name || 'Telegram Admin',
      thumbnail: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?auto=format&fit=crop&w=600&q=80',
      createdAt: new Date().toISOString(),
      lastUpdatedAt: null,
      nextScheduledAt: new Date().toISOString(),
      status: 'pending',
      lastError: null,
      lastProviderUsed: null,
      videoFileUrl: fileUrl,
      telegramFileId: fileId,
    };

    db.reels.unshift(newReel);
    saveDb(db);

    await sendTelegramMessage(
      botToken,
      chatId,
      `🎥 <b>Video Reel Received & Saved!</b>\n\n📌 <b>Name:</b> ${newReel.name}\n📝 <b>Caption:</b> ${caption}\n🔗 <b>URL:</b> ${reelUrl}\n\n<i>Use ⚡ Force Refresh button below to fetch statistics for this reel.</i>`,
      {
        inline_keyboard: [
          [{ text: `🚀 Fetch Stats Now (${newReel.name})`, callback_data: `fetch_now:${newReel.id}` }],
          [{ text: '📊 Back to Dashboard', callback_data: 'send_dashboard' }],
        ],
      }
    );

    // Automatically trigger initial fetch
    executeTelegramForceRefresh(newReel.id, chatId).catch(() => {});

  } catch (err: any) {
    console.error('[Telegram Video Save Error]', err);
    await sendTelegramMessage(botToken, chatId, `❌ Failed to save uploaded video: ${err?.message || 'Error processing media'}`);
  }
}

// Handle incoming Telegram message
async function handleTelegramMessage(botToken: string, adminTelegramId: string, msg: any) {
  const chatId = String(msg.chat?.id || '');

  // Security check: Only configured admin Telegram ID allowed
  if (!isTelegramUserAuthorized(adminTelegramId, msg)) {
    console.warn(`[Telegram Security] Blocked unauthorized message from sender:`, msg.from, `Configured Admin ID: "${adminTelegramId}"`);
    await sendTelegramMessage(botToken, chatId, '⛔ <b>Unauthorized.</b> Access restricted to bot administrator.');
    return;
  }

  // Handle video upload
  if (msg.video || msg.video_note || (msg.document?.mime_type?.startsWith('video/'))) {
    await handleTelegramVideoUpload(botToken, chatId, msg);
    return;
  }

  const text = (msg.text || '').trim();

  if (text === '/start' || text === '/help') {
    await sendTelegramMessage(
      botToken,
      chatId,
      `<b>⚡ REEL COMMAND CENTER BOT</b>\n\nWelcome Admin! Controls & notifications active.\n\n• 📊 <b>Dashboard</b> - Summary stats\n• 🎬 <b>Reels</b> - Manage saved reels\n• ⚡ <b>Force Refresh</b> - Update reel immediately\n• 🧠 <b>AI Status</b> - AI limit & monitoring\n• 📈 <b>Daily Report</b> - Instant AI performance audit\n\n<i>You can also send/upload Reel video files directly here!</i>`,
      mainAdminKeyboard
    );
    return;
  }

  if (text === '📊 Dashboard' || text === '/dashboard') {
    await sendDashboardSummary(botToken, chatId);
    return;
  }

  if (text === '🎬 Reels' || text === '/reels') {
    await sendForceRefreshMenu(botToken, chatId);
    return;
  }

  if (text === '⚡ Force Refresh' || text === '/refresh') {
    await sendForceRefreshMenu(botToken, chatId);
    return;
  }

  if (text === '🧠 AI Status') {
    await sendAiStatusSummary(botToken, chatId);
    return;
  }

  if (text === '💬 Talk to AI' || text === '/talk' || text === '/chat') {
    const msg = [
      `💬 <b>Talk to AI Strategist Active!</b>`,
      ``,
      `Ask me anything about your reels, view counts, CPM payouts, or content strategies!`,
      ``,
      `<b>Try asking:</b>`,
      `• <i>"How are my reels performing today?"</i>`,
      `• <i>"Which reel is earning the most?"</i>`,
      `• <i>"Give me 3 viral ideas for my next reel."</i>`,
      ``,
      `<i>Simply reply with your question or send a message starting with <b>/ai</b>!</i>`
    ].join('\n');
    await sendTelegramMessage(botToken, chatId, msg);
    return;
  }

  if (text === '📈 Daily Report' || text === '/report') {
    await sendTelegramMessage(botToken, chatId, '⏳ Generating daily AI report...');
    const result = await generateDailyAiReport();
    if (!result.success) {
      await sendTelegramMessage(botToken, chatId, `⚠️ ${result.reportText}`);
    }
    return;
  }

  // Handle direct AI chat questions if message starts with /ai or is a natural question
  if (text.toLowerCase().startsWith('/ai ') || text.toLowerCase().startsWith('/chat ') || (!text.startsWith('/') && !text.startsWith('http://') && !text.startsWith('https://') && !['📊 Dashboard', '🎬 Reels', '⚡ Force Refresh', '🧠 AI Status', '💬 Talk to AI', '📈 Daily Report'].includes(text))) {
    const userQuestion = text.replace(/^\/(ai|chat)\s*/i, '').trim() || text;
    if (userQuestion.length > 2) {
      await sendTelegramMessage(botToken, chatId, '🧠 <i>AI is analyzing your query...</i>');
      const aiReply = await talkToAi(userQuestion);
      await sendTelegramMessage(botToken, chatId, aiReply);
      return;
    }
  }

  // Check if text is an Instagram URL sent directly in message
  if (text.startsWith('http://') || text.startsWith('https://')) {
    const urlMatch = text.match(/https?:\/\/(www\.)?instagram\.com\/(reel|p|tv)\/[A-Za-z0-9_-]+/i);
    if (urlMatch) {
      const rawUrl = urlMatch[0];
      const reelUrl = normalizeInstagramUrl(rawUrl) || rawUrl;
      const db = loadDb();
      const existing = db.reels.find(r => normalizeInstagramUrl(r.url) === reelUrl);
      if (existing) {
        await sendTelegramMessage(botToken, chatId, `🔄 <b>Reel "${existing.name}" is already tracked (${(existing.views || 0).toLocaleString()} views).</b>\nRefreshing statistics now...`);
        executeTelegramForceRefresh(existing.id, chatId).catch(() => {});
        return;
      }

      // Add new reel
      const newReel: Reel = {
        id: 'reel_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        url: reelUrl,
        name: 'Reel ' + (db.reels.length + 1),
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        caption: 'Instagram Reel',
        author: 'Instagram User',
        thumbnail: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?auto=format&fit=crop&w=600&q=80',
        createdAt: new Date().toISOString(),
        lastUpdatedAt: null,
        nextScheduledAt: new Date().toISOString(),
        status: 'pending',
        lastError: null,
        lastProviderUsed: null,
      };
      db.reels.unshift(newReel);
      saveDb(db);

      await sendTelegramMessage(botToken, chatId, `✅ <b>New Instagram Reel Added!</b>\nFetching statistics now...`);
      executeTelegramForceRefresh(newReel.id, chatId).catch(() => {});
      return;
    }
  }

  // Default menu reply
  await sendTelegramMessage(botToken, chatId, `Use the command center menu below:`, mainAdminKeyboard);
}

// Send Dashboard Summary via Telegram
async function sendDashboardSummary(botToken: string, chatId: string) {
  const db = loadDb();
  const activeReels = db.reels.filter(r => r.category !== 'archived' && r.category !== 'paid');
  const totalReels = activeReels.length;
  const totalViews = activeReels.reduce((sum, r) => sum + (r.views || 0), 0);
  const totalLikes = activeReels.reduce((sum, r) => sum + (r.likes || 0), 0);
  const total24hGain = activeReels.reduce((sum, r) => sum + (r.growth24h || 0), 0);

  const totalCpmEarnings = activeReels.reduce((sum, r) => sum + (r.cpmEarnings || 0), 0);
  const totalFees = activeReels.reduce((sum, r) => sum + (r.fee3Percent || 0), 0);
  const totalPayout = activeReels.reduce((sum, r) => sum + (r.estimatedPayout || 0), 0);

  const activeProviders = db.providers.filter(p => p.enabled).length;
  const aiChecksUsed = db.aiMeta?.checksUsedToday || 0;
  const aiLimit = db.aiSettings?.dailyCheckLimit || 50;

  const msg = [
    `<b>📊 REEL COMMAND CENTER DASHBOARD</b>`,
    ``,
    `🎬 <b>Total Reels:</b> ${totalReels}`,
    `👁️ <b>Total Views:</b> ${totalViews.toLocaleString()}`,
    `❤️ <b>Total Likes:</b> ${totalLikes.toLocaleString()}`,
    `🚀 <b>24h View Gain:</b> +${total24hGain.toLocaleString()}`,
    ``,
    `💰 <b>CPM Earnings:</b> $${totalCpmEarnings.toFixed(2)}`,
    `💸 <b>8% Processing Fee:</b> $${totalFees.toFixed(2)}`,
    `💵 <b>Estimated Payout:</b> $${totalPayout.toFixed(2)}`,
    ``,
    `🔌 <b>Active Providers:</b> ${activeProviders}`,
    `🧠 <b>AI Check Limit:</b> ${aiChecksUsed}/${aiLimit} used today`,
    ``,
    `🕒 <i>Last Auto Fetch: ${db.meta.lastAutoFetchAt ? new Date(db.meta.lastAutoFetchAt).toLocaleTimeString() : 'Pending'}</i>`
  ].join('\n');

  await sendTelegramMessage(botToken, chatId, msg);
}

// Send AI Status Summary via Telegram
async function sendAiStatusSummary(botToken: string, chatId: string) {
  const db = loadDb();
  const checksUsed = db.aiMeta?.checksUsedToday || 0;
  const limit = db.aiSettings?.dailyCheckLimit || 50;

  const inlineButtons = [
    [{ text: `🤖 Run AI Check Now (${checksUsed}/${limit})`, callback_data: 'trigger_ai_check' }],
    [{ text: '💬 Talk to AI', callback_data: 'prompt_talk_to_ai' }, { text: '📈 Send Daily Report', callback_data: 'send_daily_report' }],
  ];

  const msg = [
    `<b>🧠 AI BRAIN MONITORING STATUS</b>`,
    ``,
    `• <b>Primary Model:</b> Google Gemini 3.6 Flash`,
    `• <b>Secondary Fallback:</b> Grok AI`,
    `• <b>Active Model Used:</b> ${db.aiMeta?.activeModelUsed || 'Gemini'}`,
    `• <b>Daily Monitoring Allowance:</b> ${checksUsed} / ${limit} checks used today`,
    `• <b>Alert Sensitivity:</b> ${db.aiSettings?.alertSensitivity || 'medium'}`,
    `• <b>Last Analysis:</b> ${db.aiMeta?.lastAiAnalysisAt ? new Date(db.aiMeta.lastAiAnalysisAt).toLocaleString() : 'None yet'}`,
    ``,
    `<i>Note: Normal 6-hour scheduled updates and Telegram force refreshes do NOT consume your 50 AI monitoring checks allowance.</i>`
  ].join('\n');

  await sendTelegramMessage(botToken, chatId, msg, { inline_keyboard: inlineButtons });
}

// Send force refresh menu showing all saved reels as inline buttons
async function sendForceRefreshMenu(botToken: string, chatId: string) {
  const db = loadDb();
  const activeReels = db.reels.filter(r => r.category !== 'archived' && r.category !== 'paid');
  if (activeReels.length === 0) {
    await sendTelegramMessage(botToken, chatId, '⚠️ <b>No active Reels found.</b> Add reels or send links/videos here.');
    return;
  }

  const buttons = [
    [{ text: '⚡ 🚀 FORCE REFRESH ALL REELS 🚀 ⚡', callback_data: 'force_refresh_all_reels' }]
  ];

  activeReels.forEach((reel) => {
    const title = reel.name || getFirst3Words(reel.caption);
    buttons.push([{ text: `🎬 ${title} (${reel.views.toLocaleString()} views)`, callback_data: `select_reel:${reel.id}` }]);
  });

  const replyMarkup = { inline_keyboard: buttons };
  await sendTelegramMessage(botToken, chatId, `<b>🔄 Select a Reel or Force Refresh All:</b>`, replyMarkup);
}

// Handle inline keyboard button callbacks
async function handleTelegramCallback(botToken: string, adminTelegramId: string, cb: any) {
  const callbackQueryId = cb.id;
  const data = cb.data || '';
  const chatId = String(cb.message?.chat?.id || adminTelegramId);

  if (!isTelegramUserAuthorized(adminTelegramId, cb)) {
    await answerCallbackQuery(botToken, callbackQueryId, 'Unauthorized');
    return;
  }

  if (data === 'force_refresh_menu' || data === 'list_reels') {
    await answerCallbackQuery(botToken, callbackQueryId);
    await sendForceRefreshMenu(botToken, chatId);
    return;
  }

  if (data === 'force_refresh_all_reels') {
    await answerCallbackQuery(botToken, callbackQueryId, 'Triggering batch refresh...');
    await sendTelegramMessage(botToken, chatId, '🔄 <b>Starting manual batch refresh of all saved reels...</b>\nThis will update every reel in sequence and notify you.');
    
    // Dynamically import to prevent circular dependency at module startup
    import('./scheduler.js').then(({ runAutomaticFetchJob }) => {
      runAutomaticFetchJob(true).then((result) => {
        sendTelegramMessage(botToken, chatId, `✅ <b>Manual Batch Refresh Completed!</b>\nRefreshed ${result.count || 0} reels successfully.`);
      }).catch((err) => {
        sendTelegramMessage(botToken, chatId, `❌ <b>Batch Refresh Failed:</b> ${err.message || err}`);
      });
    }).catch(err => {
      console.error('[Dynamic Import Error]', err);
    });
    return;
  }

  if (data === 'send_dashboard') {
    await answerCallbackQuery(botToken, callbackQueryId);
    await sendDashboardSummary(botToken, chatId);
    return;
  }

  if (data === 'trigger_ai_check') {
    await answerCallbackQuery(botToken, callbackQueryId, 'Running AI Check...');
    await sendTelegramMessage(botToken, chatId, '🧠 Running AI analysis on saved Reels...');
    const result = await runAiMonitoringCheck(true);
    if (!result.success) {
      await sendTelegramMessage(botToken, chatId, `⚠️ ${result.message}`);
    }
    return;
  }

  if (data === 'prompt_talk_to_ai') {
    await answerCallbackQuery(botToken, callbackQueryId);
    const msg = [
      `💬 <b>Talk to AI Strategist Active!</b>`,
      ``,
      `Ask me anything about your reels, view counts, CPM payouts, or content strategies!`,
      ``,
      `<b>Try asking:</b>`,
      `• <i>"How are my reels performing today?"</i>`,
      `• <i>"Which reel is earning the most?"</i>`,
      `• <i>"Give me 3 viral ideas for my next reel."</i>`,
      ``,
      `<i>Simply reply with your question or send a message starting with <b>/ai</b>!</i>`
    ].join('\n');
    await sendTelegramMessage(botToken, chatId, msg);
    return;
  }

  if (data === 'send_daily_report') {
    await answerCallbackQuery(botToken, callbackQueryId, 'Generating Report...');
    await generateDailyAiReport();
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
      `<b>Reel Selected:</b> ${reel.name}\n<b>Current Views:</b> ${reel.views.toLocaleString()}\n<b>Current Likes:</b> ${reel.likes.toLocaleString()}\n\nClick <b>Fetch Now</b> to update immediately:`,
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

  if (reel.category === 'archived' || reel.category === 'paid') {
    return { success: false, message: 'Cannot fetch an archived or paid reel.' };
  }
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
      updateReelWithFetchResult(target, fetchResult, currentDb);

      if (!target.name || target.name.startsWith('Reel ') || target.name.startsWith('reel_')) {
        target.name = generateTwoWordTitleFromCaption(target.caption || '');
      }

      // Check milestone thresholds
      const milestones = [10000, 50000, 100000, 500000, 1000000, 5000000];
      for (const m of milestones) {
        if (target.views >= m && (target.lastMilestone || 0) < m) {
          target.lastMilestone = m;
          if (currentDb.telegram.enabled && currentDb.telegram.botToken && currentDb.telegram.adminTelegramId) {
            sendTelegramMessage(
              currentDb.telegram.botToken,
              currentDb.telegram.adminTelegramId,
              `🎉 <b>MILESTONE REACHED!</b>\n\nReel <b>"${target.name}"</b> just crossed <b>${m.toLocaleString()} VIEWS!</b> 🚀🔥`
            ).catch(() => {});
          }
          break;
        }
      }

      // Log fetch history

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

// Helper to check whether incoming message is from configured admin
function isTelegramUserAuthorized(adminTelegramId: string, msgOrCb: any): boolean {
  const configured = String(adminTelegramId || '').trim().replace(/^@/, '').toLowerCase();
  if (!configured) return true; // Default allow if not configured yet

  const senderId = String(msgOrCb.from?.id || '').toLowerCase();
  const chatId = String(msgOrCb.chat?.id || msgOrCb.message?.chat?.id || '').toLowerCase();
  const username = String(msgOrCb.from?.username || '').toLowerCase();

  return (
    senderId === configured ||
    chatId === configured ||
    (Boolean(username) && username === configured)
  );
}

// Telegram Bot Polling Loop
export function startTelegramBotPolling() {
  stopTelegramBotPolling();

  isPollingActive = true;
  currentPollingSessionId++;
  const activeSessionId = currentPollingSessionId;

  console.log(`[Telegram Bot] Starting single-instance polling service (Session #${activeSessionId})...`);

  const pollCycle = async () => {
    if (!isPollingActive || activeSessionId !== currentPollingSessionId) return;

    if (isPollingInFlight) {
      if (isPollingActive && activeSessionId === currentPollingSessionId) {
        pollingTimeout = setTimeout(pollCycle, 3000);
      }
      return;
    }

    isPollingInFlight = true;

    try {
      const db = loadDb();
      const { botToken, adminTelegramId, enabled } = db.telegram;

      if (!enabled || !botToken) {
        isPollingInFlight = false;
        if (isPollingActive && activeSessionId === currentPollingSessionId) {
          pollingTimeout = setTimeout(pollCycle, 5000);
        }
        return;
      }

      const offsetParam = lastUpdateId > 0 ? `?offset=${lastUpdateId + 1}&timeout=3` : '?timeout=3';
      const url = `https://api.telegram.org/bot${botToken}/getUpdates${offsetParam}`;
      const res = await fetch(url);

      if (res.ok) {
        const json = (await res.json()) as any;
        if (json.ok && Array.isArray(json.result)) {
          for (const update of json.result) {
            const updateId = Number(update.update_id);
            if (isNaN(updateId)) continue;

            // Immediately increment offset tracker
            lastUpdateId = Math.max(lastUpdateId, updateId);

            if (processedUpdateIds.has(updateId)) {
              continue; // Skip duplicate update
            }
            processedUpdateIds.add(updateId);
            if (processedUpdateIds.size > 1000) {
              const oldest = Array.from(processedUpdateIds)[0];
              processedUpdateIds.delete(oldest);
            }

            if (update.message) {
              await handleTelegramMessage(botToken, adminTelegramId, update.message);
            } else if (update.callback_query) {
              await handleTelegramCallback(botToken, adminTelegramId, update.callback_query);
            }
          }
        }
      }
    } catch (err) {
      // Suppress transient polling network errors
    } finally {
      isPollingInFlight = false;
      if (isPollingActive && activeSessionId === currentPollingSessionId) {
        pollingTimeout = setTimeout(pollCycle, 3000);
      }
    }
  };

  pollCycle();
}

export function stopTelegramBotPolling() {
  currentPollingSessionId++;
  if (pollingTimeout) {
    clearTimeout(pollingTimeout);
    pollingTimeout = null;
  }
  isPollingActive = false;
  isPollingInFlight = false;
}
