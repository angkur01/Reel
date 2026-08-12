import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';

import { loadDb, saveDb } from './db.js';
import { requireAuth, verifyPassword, setPassword, createSessionToken, revokeSession, isValidSession } from './auth.js';
import { fetchReelWithFallbackChain, testSingleProvider } from './providers.js';
import { startTelegramBotPolling, stopTelegramBotPolling, sendTelegramMessage, notifyTelegramReelResult, getFirst3Words } from './telegram.js';
import { getNextScheduledTime, runAutomaticFetchJob } from './scheduler.js';
import { runAiMonitoringCheck, generateDailyAiReport, callGroqApi, callGrokApi } from './ai.js';
import { Reel, ApiProvider, FetchLog, AiSettings } from '../types.js';

export function createExpressApp() {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  // Health & Uptime Monitoring Endpoints
  app.get(['/api/health', '/api/uptime'], async (req: Request, res: Response) => {
    const db = loadDb();
    const totalReels = db.reels?.length || 0;
    const totalViews = db.reels?.reduce((sum, r) => sum + (r.views || 0), 0) || 0;
    const activeProviders = db.providers?.filter((p) => p.enabled).length || 0;

    // Optional query triggers for external cron services (UptimeRobot, Cron-Job.org, Vercel Cron)
    const triggerFetch = req.query.fetch === 'true' || req.query.cron === 'true';
    const triggerAi = req.query.ai_check === 'true';
    const triggerReport = req.query.report === 'true';

    const triggeredActions: string[] = [];

    if (triggerFetch) {
      triggeredActions.push('automatic_fetch_job');
      runAutomaticFetchJob().catch((e) => console.error('[Cron Fetch Error]', e));
    }
    if (triggerAi) {
      triggeredActions.push('ai_monitoring_check');
      runAiMonitoringCheck(false).catch((e) => console.error('[Cron AI Error]', e));
    }
    if (triggerReport) {
      triggeredActions.push('daily_ai_report');
      generateDailyAiReport().catch((e) => console.error('[Cron Report Error]', e));
    }

    res.json({
      status: 'online',
      service: 'Reel Command Center Pro AI',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      database: 'connected',
      telegramBot: db.telegram.enabled ? 'active' : 'disabled',
      stats: {
        totalReels,
        totalViews,
        activeProviders,
        aiChecksUsedToday: db.aiMeta?.checksUsedToday || 0,
        aiCheckLimit: db.aiSettings?.dailyCheckLimit || 50,
        lastAutoFetchAt: db.meta?.lastAutoFetchAt || null,
        nextScheduledFetchAt: getNextScheduledTime().toISOString(),
      },
      triggeredActions,
    });
  });

  // Dedicated Cron Job Endpoint for Cron-Job.org / Vercel Cron
  app.all('/api/cron', async (req: Request, res: Response) => {
    const db = loadDb();
    console.log('[Cron Endpoint] External ping received from Uptime/Cron service');

    runAutomaticFetchJob().catch((e) => console.error('[Cron Fetch Error]', e));

    res.json({
      success: true,
      message: 'Cron job initiated successfully',
      timestamp: new Date().toISOString(),
      reelsCount: db.reels?.length || 0,
      nextScheduledFetchAt: getNextScheduledTime().toISOString(),
    });
  });

  // ----------------------------------------------------
  // AUTH ROUTES
  // ----------------------------------------------------

  // Check auth status
  app.get('/api/auth/status', (req: Request, res: Response) => {
    let token: string | undefined = undefined;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.cookies && req.cookies.admin_session) {
      token = req.cookies.admin_session;
    }

    const authenticated = isValidSession(token);
    res.json({ success: true, authenticated });
  });

  // Login
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { password } = req.body;
    if (!password) {
      res.status(400).json({ success: false, error: 'Password is required' });
      return;
    }

    if (verifyPassword(password)) {
      const token = createSessionToken();
      const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
      res.cookie('admin_session', token, {
        httpOnly: true,
        secure: isHttps,
        sameSite: isHttps ? 'none' : 'lax',
        maxAge: 365 * 24 * 60 * 60 * 1000, // 365 days persistent cookie
      });
      res.json({ success: true, token, message: 'Logged in successfully' });
    } else {
      res.status(401).json({ success: false, error: 'Invalid admin password' });
    }
  });

  // Logout
  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    let token: string | undefined = undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.cookies && req.cookies.admin_session) {
      token = req.cookies.admin_session;
    }
    if (token) revokeSession(token);
    res.clearCookie('admin_session');
    res.json({ success: true, message: 'Logged out' });
  });

  // Change Admin Password
  app.post('/api/auth/change-password', requireAuth, (req: Request, res: Response) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ success: false, error: 'Both current and new password are required' });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ success: false, error: 'New password must be at least 6 characters long' });
      return;
    }
    if (!verifyPassword(currentPassword)) {
      res.status(401).json({ success: false, error: 'Current password is incorrect' });
      return;
    }

    setPassword(newPassword);
    res.json({ success: true, message: 'Admin password updated successfully' });
  });

  // ----------------------------------------------------
  // REELS ROUTES
  // ----------------------------------------------------

  // Get all Reels
  app.get('/api/reels', requireAuth, (req: Request, res: Response) => {
    const db = loadDb();
    const nextScheduledAt = getNextScheduledTime().toISOString();
    
    // Attach current nextScheduledAt dynamically
    const reelsWithNext = db.reels.map(r => ({
      ...r,
      nextScheduledAt,
    }));

    res.json({
      success: true,
      reels: reelsWithNext,
      nextScheduledFetchAt: nextScheduledAt,
    });
  });

  // Export Reels Statistics (CSV / JSON)
  app.get('/api/reels/export', requireAuth, (req: Request, res: Response) => {
    const { format } = req.query;
    const db = loadDb();

    if (format === 'csv') {
      const headers = ['ID', 'Name', 'Views', 'Likes', 'Comments', 'Shares', '24h Gain', 'Author', 'Status', 'URL', 'Last Updated'];
      const rows = db.reels.map(r => [
        `"${r.id}"`,
        `"${r.name.replace(/"/g, '""')}"`,
        r.views,
        r.likes,
        r.comments,
        r.shares,
        r.growth24h || 0,
        `"${(r.author || '').replace(/"/g, '""')}"`,
        `"${r.status}"`,
        `"${r.url}"`,
        `"${r.lastUpdatedAt || 'Never'}"`
      ]);

      const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=reels_analytics.csv');
      res.send(csvContent);
      return;
    }

    res.json({
      success: true,
      exportedAt: new Date().toISOString(),
      reels: db.reels,
    });
  });

  // Get History Time-Series Data
  app.get('/api/reels/history', requireAuth, (req: Request, res: Response) => {
    const db = loadDb();
    res.json({ success: true, history: db.history || [] });
  });

  // Retry Failed Reels
  app.post('/api/reels/retry-failed', requireAuth, async (req: Request, res: Response) => {
    const db = loadDb();
    const failedReels = db.reels.filter(r => r.status === 'failed');

    if (failedReels.length === 0) {
      res.json({ success: true, message: 'No failed reels found to retry.' });
      return;
    }

    let successCount = 0;
    for (const reel of failedReels) {
      reel.status = 'fetching';
      saveDb(db);
      const result = await fetchReelWithFallbackChain(db.providers, reel.url);
      if (result.success && result.data) {
        reel.views = result.data.views || reel.views;
        reel.likes = result.data.likes || reel.likes;
        reel.comments = result.data.comments || reel.comments;
        reel.status = 'success';
        reel.lastError = null;
        reel.lastUpdatedAt = new Date().toISOString();
        successCount++;
      } else {
        reel.status = 'failed';
        reel.lastError = result.error || 'Retry failed';
      }
      saveDb(db);
    }

    res.json({
      success: true,
      message: `Retried ${failedReels.length} reels. ${successCount} updated successfully!`,
    });
  });

  // Add & Fetch Reel instantly
  app.post('/api/reels', requireAuth, async (req: Request, res: Response) => {
    const { url, customName } = req.body;
    if (!url || typeof url !== 'string' || !url.includes('instagram.com')) {
      res.status(400).json({ success: false, error: 'Please enter a valid Instagram Reel URL (e.g., https://www.instagram.com/reel/...)' });
      return;
    }

    const cleanUrl = url.trim();
    const db = loadDb();

    // Check if URL already saved
    const existing = db.reels.find(r => r.url.toLowerCase() === cleanUrl.toLowerCase());
    if (existing) {
      res.status(400).json({ success: false, error: `This Reel is already saved in your dashboard as "${existing.name}".` });
      return;
    }

    console.log(`[Add Reel] Attempting instant fetch for: ${cleanUrl}`);
    const fetchResult = await fetchReelWithFallbackChain(db.providers, cleanUrl);

    const nextScheduledAt = getNextScheduledTime().toISOString();
    const newId = 'reel_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

    let reelName = (customName || '').trim();
    const caption = fetchResult.data?.caption || 'Instagram Reel';

    if (!reelName) {
      reelName = getFirst3Words(caption).slice(0, 10);
      if (!reelName) reelName = 'Reel ' + newId.slice(-4);
    }

    const newReel: Reel = {
      id: newId,
      url: cleanUrl,
      name: reelName,
      views: fetchResult.data?.views || 0,
      likes: fetchResult.data?.likes || 0,
      comments: fetchResult.data?.comments || 0,
      shares: fetchResult.data?.shares || 0,
      caption: fetchResult.data?.caption || 'Instagram Reel',
      author: fetchResult.data?.author || 'Instagram User',
      thumbnail: fetchResult.data?.thumbnail || 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?auto=format&fit=crop&w=600&q=80',
      createdAt: new Date().toISOString(),
      lastUpdatedAt: fetchResult.success ? new Date().toISOString() : null,
      nextScheduledAt,
      status: fetchResult.success ? 'success' : 'failed',
      lastError: fetchResult.success ? null : (fetchResult.error || 'Failed to fetch Reel stats'),
      lastProviderUsed: fetchResult.providerName || null,
      growth1h: 0,
      growth6h: 0,
      growth24h: 0,
    };

    // Save reel
    const currentDb = loadDb();
    currentDb.reels.unshift(newReel);

    // Record initial history
    if (fetchResult.success) {
      currentDb.history.push({
        id: 'hist_' + Date.now(),
        reelId: newReel.id,
        timestamp: new Date().toISOString(),
        views: newReel.views,
        likes: newReel.likes,
        comments: newReel.comments,
        shares: newReel.shares,
      });
    }

    // Log attempt
    const logEntry: FetchLog = {
      id: 'log_' + Date.now(),
      reelId: newReel.id,
      reelName: newReel.name,
      timestamp: new Date().toISOString(),
      type: 'manual_web',
      status: fetchResult.success ? 'success' : 'failed',
      providerName: fetchResult.providerName || 'All Providers Failed',
      errorMessage: fetchResult.success ? undefined : fetchResult.error,
      statsAdded: fetchResult.success ? {
        views: newReel.views,
        likes: newReel.likes,
        comments: newReel.comments,
      } : undefined,
    };
    currentDb.logs.unshift(logEntry);
    saveDb(currentDb);

    if (fetchResult.success) {
      notifyTelegramReelResult(newReel, 'manual_web').catch(e => console.error('[Telegram Notify Error]', e));
      res.json({
        success: true,
        reel: newReel,
        message: 'Reel added and fetched successfully!',
      });
    } else {
      res.json({
        success: false,
        reel: newReel,
        error: fetchResult.error || 'Failed to fetch Reel data from configured API providers.',
      });
    }
  });

  // Edit Reel name
  app.patch('/api/reels/:id', requireAuth, (req: Request, res: Response) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ success: false, error: 'Reel name cannot be empty' });
      return;
    }

    const db = loadDb();
    const reel = db.reels.find(r => r.id === id);
    if (!reel) {
      res.status(404).json({ success: false, error: 'Reel not found' });
      return;
    }

    reel.name = name.trim();
    saveDb(db);
    res.json({ success: true, reel });
  });

  // Delete Reel
  app.delete('/api/reels/:id', requireAuth, (req: Request, res: Response) => {
    const { id } = req.params;
    const db = loadDb();
    const index = db.reels.findIndex(r => r.id === id);
    if (index === -1) {
      res.status(404).json({ success: false, error: 'Reel not found' });
      return;
    }

    const deleted = db.reels.splice(index, 1)[0];
    if (!db.meta) db.meta = { lastAutoFetchAt: null, deletedReelIds: [] };
    if (!db.meta.deletedReelIds) db.meta.deletedReelIds = [];
    if (!db.meta.deletedReelIds.includes(id)) {
      db.meta.deletedReelIds.push(id);
    }
    saveDb(db);
    res.json({ success: true, message: `Reel "${deleted.name}" deleted` });
  });

  // Force Refresh specific Reel via Web Dashboard
  app.post('/api/reels/:id/fetch', requireAuth, async (req: Request, res: Response) => {
    const { id } = req.params;
    const db = loadDb();
    const reel = db.reels.find(r => r.id === id);

    if (!reel) {
      res.status(404).json({ success: false, error: 'Reel not found' });
      return;
    }

    console.log(`[Manual Dashboard Fetch] Fetching Reel: ${reel.name} -> ${reel.url}`);
    reel.status = 'fetching';
    saveDb(db);

    const fetchResult = await fetchReelWithFallbackChain(db.providers, reel.url);

    const currentDb = loadDb();
    const target = currentDb.reels.find(r => r.id === id);

    if (!target) {
      res.status(404).json({ success: false, error: 'Reel was deleted' });
      return;
    }

    const nextScheduledAt = getNextScheduledTime().toISOString();

    if (fetchResult.success && fetchResult.data) {
      const prevViews = target.views || 0;
      const newViews = fetchResult.data.views || prevViews;
      const viewGain = Math.max(0, newViews - prevViews);

      target.growth24h = (target.growth24h || 0) + viewGain;
      if (viewGain > 0) target.growth1h = viewGain;

      target.views = newViews;
      target.likes = fetchResult.data.likes || target.likes;
      target.comments = fetchResult.data.comments || target.comments;
      target.shares = fetchResult.data.shares || target.shares;
      if (fetchResult.data.caption) target.caption = fetchResult.data.caption;
      if (fetchResult.data.author) target.author = fetchResult.data.author;
      if (fetchResult.data.thumbnail) target.thumbnail = fetchResult.data.thumbnail;

      target.status = 'success';
      target.lastError = null;
      target.lastUpdatedAt = new Date().toISOString();
      target.nextScheduledAt = nextScheduledAt;
      target.lastProviderUsed = fetchResult.providerName || null;

      currentDb.history.push({
        id: 'hist_' + Date.now(),
        reelId: target.id,
        timestamp: new Date().toISOString(),
        views: target.views,
        likes: target.likes,
        comments: target.comments,
        shares: target.shares,
      });

      const logEntry: FetchLog = {
        id: 'log_' + Date.now(),
        reelId: target.id,
        reelName: target.name,
        timestamp: new Date().toISOString(),
        type: 'manual_web',
        status: 'success',
        providerName: fetchResult.providerName || 'Unknown Provider',
        statsAdded: {
          views: target.views,
          likes: target.likes,
          comments: target.comments,
        },
      };
      currentDb.logs.unshift(logEntry);
      saveDb(currentDb);

      notifyTelegramReelResult(target, 'manual_web').catch(e => console.error('[Telegram Notify Error]', e));

      res.json({ success: true, reel: target, message: 'Reel refreshed successfully!' });

    } else {
      target.status = 'failed';
      target.lastError = fetchResult.error || 'Failed to fetch from all providers';
      target.nextScheduledAt = nextScheduledAt;

      const logEntry: FetchLog = {
        id: 'log_' + Date.now(),
        reelId: target.id,
        reelName: target.name,
        timestamp: new Date().toISOString(),
        type: 'manual_web',
        status: 'failed',
        providerName: 'All Providers Failed',
        errorMessage: target.lastError,
      };
      currentDb.logs.unshift(logEntry);
      saveDb(currentDb);

      res.status(400).json({
        success: false,
        reel: target,
        error: target.lastError,
      });
    }
  });

  // Trigger global manual refresh of ALL reels
  app.post('/api/reels/refresh-all', requireAuth, async (req: Request, res: Response) => {
    runAutomaticFetchJob().catch(err => console.error('[Manual All Fetch Error]', err));
    res.json({ success: true, message: 'Batch refresh triggered for all saved reels in background.' });
  });

  // ----------------------------------------------------
  // AI BRAIN & MONITORING ROUTES
  // ----------------------------------------------------

  // Get AI Settings & Usage Status
  app.get('/api/ai/settings', requireAuth, (req: Request, res: Response) => {
    const db = loadDb();
    const s = db.aiSettings;
    const m = db.aiMeta;

    const groqKey = s.groqApiKey || s.grokApiKey || '';

    res.json({
      success: true,
      aiSettings: {
        geminiApiKeyMasked: s.geminiApiKey ? (s.geminiApiKey.slice(0, 4) + '••••••••' + s.geminiApiKey.slice(-4)) : '',
        grokApiKeyMasked: s.grokApiKey ? (s.grokApiKey.slice(0, 4) + '••••••••' + s.grokApiKey.slice(-4)) : '',
        groqApiKeyMasked: groqKey ? (groqKey.slice(0, 4) + '••••••••' + groqKey.slice(-4)) : '',
        enableGemini: s.enableGemini,
        enableGrok: s.enableGrok,
        dailyCheckLimit: s.dailyCheckLimit,
        alertSensitivity: s.alertSensitivity,
        modelPreference: s.modelPreference || 'groq_first',
      },
      aiMeta: m,
    });
  });

  // Save AI Settings
  app.post('/api/ai/settings', requireAuth, (req: Request, res: Response) => {
    const { geminiApiKey, grokApiKey, groqApiKey, enableGemini, enableGrok, dailyCheckLimit, alertSensitivity, modelPreference } = req.body;
    const db = loadDb();

    if (geminiApiKey !== undefined && !geminiApiKey.includes('••••')) {
      db.aiSettings.geminiApiKey = geminiApiKey.trim();
    }
    if (groqApiKey !== undefined && !groqApiKey.includes('••••')) {
      db.aiSettings.groqApiKey = groqApiKey.trim();
      db.aiSettings.grokApiKey = groqApiKey.trim();
    } else if (grokApiKey !== undefined && !grokApiKey.includes('••••')) {
      db.aiSettings.grokApiKey = grokApiKey.trim();
      db.aiSettings.groqApiKey = grokApiKey.trim();
    }
    if (enableGemini !== undefined) db.aiSettings.enableGemini = Boolean(enableGemini);
    if (enableGrok !== undefined) db.aiSettings.enableGrok = Boolean(enableGrok);
    if (dailyCheckLimit !== undefined) db.aiSettings.dailyCheckLimit = Math.min(100, Math.max(1, Number(dailyCheckLimit)));
    if (alertSensitivity !== undefined) db.aiSettings.alertSensitivity = alertSensitivity;
    if (modelPreference !== undefined) db.aiSettings.modelPreference = modelPreference;

    saveDb(db);
    res.json({ success: true, message: 'AI Brain settings updated successfully!' });
  });

  // Test AI Key Connection (Groq Cloud / xAI Grok / Gemini)
  app.post('/api/ai/test', requireAuth, async (req: Request, res: Response) => {
    const { apiKey, model } = req.body;
    const db = loadDb();
    const keyToUse = apiKey || db.aiSettings.groqApiKey || db.aiSettings.grokApiKey;

    const testPrompt = 'Say "Hello! Groq Cloud API connection is working perfectly! 🚀" in 1 concise sentence.';

    if (model === 'grok' || keyToUse?.startsWith('xai-')) {
      const grokRes = await callGrokApi(testPrompt, keyToUse);
      if (grokRes.text) {
        res.json({ success: true, message: 'xAI Grok connection successful!', response: grokRes.text });
      } else {
        res.status(400).json({ success: false, error: grokRes.error || 'Failed to connect to xAI Grok' });
      }
    } else {
      const groqRes = await callGroqApi(testPrompt, keyToUse);
      if (groqRes.text) {
        res.json({ success: true, message: 'Groq Cloud API connection successful!', response: groqRes.text });
      } else {
        res.status(400).json({ success: false, error: groqRes.error || 'Failed to connect to Groq Cloud API' });
      }
    }
  });

  // Trigger Manual AI Monitoring Check (Consumes 1 check from 50 daily limit)
  app.post('/api/ai/check', requireAuth, async (req: Request, res: Response) => {
    const result = await runAiMonitoringCheck(true);
    if (result.success) {
      res.json({ success: true, message: result.message, aiLog: result.aiLog });
    } else {
      res.status(400).json({ success: false, error: result.message });
    }
  });

  // Get AI Logs
  app.get('/api/ai/logs', requireAuth, (req: Request, res: Response) => {
    const db = loadDb();
    res.json({ success: true, aiLogs: db.aiLogs || [] });
  });

  // Generate Daily AI Executive Report
  app.post('/api/ai/daily-report', requireAuth, async (req: Request, res: Response) => {
    const result = await generateDailyAiReport();
    res.json({ success: result.success, reportText: result.reportText });
  });

  // ----------------------------------------------------
  // PROVIDER ROUTES
  // ----------------------------------------------------

  // Get all API Providers
  app.get('/api/providers', requireAuth, (req: Request, res: Response) => {
    const db = loadDb();
    const safeProviders = db.providers.map(p => ({
      ...p,
      apiKeyMasked: p.apiKey ? (p.apiKey.slice(0, 4) + '••••••••' + p.apiKey.slice(-4)) : '',
    }));
    res.json({ success: true, providers: safeProviders });
  });

  // Add Provider
  app.post('/api/providers', requireAuth, (req: Request, res: Response) => {
    const providerData = req.body as Partial<ApiProvider>;
    if (!providerData.name || !providerData.baseUrl) {
      res.status(400).json({ success: false, error: 'Provider Name and Base URL are required' });
      return;
    }

    const db = loadDb();
    const newProvider: ApiProvider = {
      id: 'provider_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      name: providerData.name.trim(),
      baseUrl: providerData.baseUrl.trim(),
      endpointPath: providerData.endpointPath !== undefined ? providerData.endpointPath.trim() : '/',
      method: providerData.method || 'POST',
      apiKey: (providerData.apiKey || '').trim(),
      apiKeyLocation: providerData.apiKeyLocation || 'header_x_api_key',
      urlParamName: (providerData.urlParamName || 'url').trim(),
      headersJson: providerData.headersJson || '{\n  "Accept": "application/json",\n  "Content-Type": "application/json"\n}',
      customBodyJson: providerData.customBodyJson || '',
      mapping: providerData.mapping || {
        viewsPath: 'views',
        likesPath: 'likes',
        commentsPath: 'comments',
        sharesPath: 'shares',
        captionPath: 'caption',
        authorPath: 'author',
        thumbnailPath: 'thumbnail',
      },
      enabled: providerData.enabled !== undefined ? providerData.enabled : true,
      priority: providerData.priority || db.providers.length + 1,
      lastTestedAt: null,
      lastTestStatus: null,
      lastTestError: null,
    };

    db.providers.push(newProvider);
    saveDb(db);
    res.json({ success: true, provider: newProvider });
  });

  // Update Provider
  app.put('/api/providers/:id', requireAuth, (req: Request, res: Response) => {
    const { id } = req.params;
    const db = loadDb();
    const provider = db.providers.find(p => p.id === id);

    if (!provider) {
      res.status(404).json({ success: false, error: 'Provider not found' });
      return;
    }

    const body = req.body;
    if (body.name) provider.name = body.name.trim();
    if (body.baseUrl) provider.baseUrl = body.baseUrl.trim();
    if (body.endpointPath !== undefined) provider.endpointPath = body.endpointPath.trim();
    if (body.method) provider.method = body.method;
    
    if (body.apiKey !== undefined && body.apiKey.trim() !== '' && !body.apiKey.includes('••••')) {
      provider.apiKey = body.apiKey.trim();
    }

    if (body.apiKeyLocation) provider.apiKeyLocation = body.apiKeyLocation;
    if (body.urlParamName) provider.urlParamName = body.urlParamName.trim();
    if (body.headersJson !== undefined) provider.headersJson = body.headersJson;
    if (body.customBodyJson !== undefined) provider.customBodyJson = body.customBodyJson;
    if (body.mapping) provider.mapping = body.mapping;
    if (body.enabled !== undefined) provider.enabled = Boolean(body.enabled);
    if (body.priority !== undefined) provider.priority = Number(body.priority);

    saveDb(db);
    res.json({ success: true, provider });
  });

  // Delete Provider
  app.delete('/api/providers/:id', requireAuth, (req: Request, res: Response) => {
    const { id } = req.params;
    const db = loadDb();
    const idx = db.providers.findIndex(p => p.id === id);

    if (idx === -1) {
      res.status(404).json({ success: false, error: 'Provider not found' });
      return;
    }

    const deleted = db.providers.splice(idx, 1)[0];
    saveDb(db);
    res.json({ success: true, message: `Provider "${deleted.name}" deleted` });
  });

  // Test Saved Provider with real Instagram Reel URL
  app.post('/api/providers/:id/test', requireAuth, async (req: Request, res: Response) => {
    const { id } = req.params;
    const { testUrl } = req.body;

    const sampleUrl = testUrl || 'https://www.instagram.com/reel/Db6jlRLFM5X/?igsh=dnNoaHRkYm1icTZk';

    const db = loadDb();
    const provider = db.providers.find(p => p.id === id);

    if (!provider) {
      res.status(404).json({ success: false, error: 'Provider not found' });
      return;
    }

    console.log(`[Test Provider] Testing ${provider.name} with URL: ${sampleUrl}`);
    const testResult = await testSingleProvider(provider, sampleUrl);

    provider.lastTestedAt = new Date().toISOString();
    provider.lastTestStatus = testResult.success ? 'success' : 'failed';
    provider.lastTestError = testResult.errorMessage || null;
    saveDb(db);

    res.json({
      success: true,
      result: testResult,
    });
  });

  // Test Raw Unsaved Provider settings directly
  app.post('/api/providers/test-raw', requireAuth, async (req: Request, res: Response) => {
    const { provider, testUrl } = req.body;
    if (!provider || !provider.baseUrl) {
      res.status(400).json({ success: false, error: 'Provider settings required' });
      return;
    }

    const sampleUrl = testUrl || 'https://www.instagram.com/reel/Db6jlRLFM5X/?igsh=dnNoaHRkYm1icTZk';
    const testResult = await testSingleProvider(provider as ApiProvider, sampleUrl);

    res.json({
      success: true,
      result: testResult,
    });
  });

  // ----------------------------------------------------
  // TELEGRAM SETTINGS & LOGS ROUTES
  // ----------------------------------------------------

  // Get Telegram Settings
  app.get('/api/telegram/settings', requireAuth, (req: Request, res: Response) => {
    const db = loadDb();
    const t = db.telegram;
    res.json({
      success: true,
      telegram: {
        botTokenMasked: t.botToken ? (t.botToken.slice(0, 5) + '••••••••' + t.botToken.slice(-4)) : '',
        adminTelegramId: t.adminTelegramId,
        enabled: t.enabled,
        lastStatus: t.lastStatus,
      },
    });
  });

  // Update Telegram Settings
  app.post('/api/telegram/settings', requireAuth, (req: Request, res: Response) => {
    const { botToken, adminTelegramId, enabled } = req.body;
    const db = loadDb();

    if (botToken !== undefined && !botToken.includes('••••')) {
      db.telegram.botToken = botToken.trim();
    }
    if (adminTelegramId !== undefined) {
      db.telegram.adminTelegramId = String(adminTelegramId).trim();
    }
    if (enabled !== undefined) {
      db.telegram.enabled = Boolean(enabled);
    }

    saveDb(db);

    stopTelegramBotPolling();
    if (db.telegram.enabled) {
      startTelegramBotPolling();
    }

    res.json({ success: true, message: 'Telegram settings updated successfully' });
  });

  // Send Test Message to Telegram
  app.post('/api/telegram/test', requireAuth, async (req: Request, res: Response) => {
    const db = loadDb();
    const { botToken, adminTelegramId } = db.telegram;

    if (!botToken || !adminTelegramId) {
      res.status(400).json({ success: false, error: 'Bot Token and Admin Telegram ID must be configured first.' });
      return;
    }

    const testMsg = `<b>✅ Telegram Integration Test</b>\n\nYour Instagram Reel Tracker is successfully connected to Telegram!\n\n<b>Admin ID:</b> <code>${adminTelegramId}</code>\n<b>Server Time:</b> ${new Date().toUTCString()}`;
    const sent = await sendTelegramMessage(botToken, adminTelegramId, testMsg);

    if (sent) {
      db.telegram.lastStatus = 'Connected & Verified';
      saveDb(db);
      res.json({ success: true, message: 'Test message sent to Telegram successfully!' });
    } else {
      db.telegram.lastStatus = 'Connection Failed';
      saveDb(db);
      res.status(400).json({ success: false, error: 'Failed to send message. Please verify Bot Token and Admin Telegram ID.' });
    }
  });

  // Get Fetch Logs
  app.get('/api/logs', requireAuth, (req: Request, res: Response) => {
    const db = loadDb();
    res.json({ success: true, logs: db.logs || [] });
  });

  // Get Enhanced System Stats
  app.get('/api/stats', requireAuth, (req: Request, res: Response) => {
    const db = loadDb();
    const nextFetch = getNextScheduledTime().toISOString();

    const totalViews = db.reels.reduce((sum, r) => sum + (r.views || 0), 0);
    const totalLikes = db.reels.reduce((sum, r) => sum + (r.likes || 0), 0);
    const total24hGrowth = db.reels.reduce((sum, r) => sum + (r.growth24h || 0), 0);
    const viralCount = db.reels.filter(r => r.isViral).length;
    const stalledCount = db.reels.filter(r => r.isStalled).length;

    res.json({
      success: true,
      stats: {
        totalReels: db.reels.length,
        totalViews,
        totalLikes,
        total24hGrowth,
        activeProviders: db.providers.filter(p => p.enabled).length,
        lastAutoFetchAt: db.meta.lastAutoFetchAt,
        nextScheduledFetchAt: nextFetch,
        telegramEnabled: db.telegram.enabled,
        aiChecksUsedToday: db.aiMeta?.checksUsedToday || 0,
        aiDailyLimit: db.aiSettings?.dailyCheckLimit || 50,
        aiActiveModel: db.aiMeta?.activeModelUsed || 'gemini',
        viralCount,
        stalledCount,
      },
    });
  });

  return app;
}

