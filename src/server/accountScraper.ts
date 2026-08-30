import { ApiProvider, InstagramAccount, AccountScanResult, Reel, FetchLog } from '../types.js';
import { loadDb, saveDb, extractInstagramShortcode, canonicalizeInstagramReelUrl, DatabaseSchema } from './db.js';
import { notifyTelegramNewReelsDiscovered } from './telegram.js';
import { applyCpmToReel, getDefaultCampaignId } from './cpm.js';

// Server-side scan locks to prevent overlapping concurrent scans for the same account
const activeAccountScanLocks = new Set<string>();

/**
 * Normalizes an Instagram username by stripping @, URL prefixes, query parameters,
 * and trailing slashes to a clean lowercase username.
 */
export function normalizeInstagramUsername(raw: string): string {
  if (!raw) return '';
  let clean = raw.trim();
  // Remove full URLs e.g. https://www.instagram.com/creatorname/ or instagram.com/creatorname
  clean = clean.replace(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i, '');
  // Remove leading @ or /
  clean = clean.replace(/^[@/]+/, '');
  // Remove trailing slashes and query params
  clean = clean.split('?')[0].split('#')[0].replace(/\/+$/, '').trim();
  // Lowercase
  return clean.toLowerCase();
}

/**
 * Resolves the Refetch(er) API key securely from server-side environment variables
 * or active providers in the database. Never exposed to frontend.
 */
export function getRefetcherApiKey(providers: ApiProvider[] = []): string {
  if (process.env.REFETCHER_API_KEY && process.env.REFETCHER_API_KEY.trim()) {
    return process.env.REFETCHER_API_KEY.trim();
  }
  if (process.env.PROVIDER_API_KEY && process.env.PROVIDER_API_KEY.trim()) {
    return process.env.PROVIDER_API_KEY.trim();
  }

  // Look in DB providers for Refetcher provider or key
  const refetcherProvider = providers.find(
    p => p && p.apiKey && (p.baseUrl?.toLowerCase().includes('refetcher.com') || p.name?.toLowerCase().includes('refetcher'))
  );
  if (refetcherProvider && refetcherProvider.apiKey) {
    return refetcherProvider.apiKey.trim();
  }

  // Fallback to any provider with apiKey starting with 'pc_'
  const pcKeyProvider = providers.find(p => p && p.apiKey && p.apiKey.startsWith('pc_'));
  if (pcKeyProvider && pcKeyProvider.apiKey) {
    return pcKeyProvider.apiKey.trim();
  }

  return '';
}

export interface ProfileDetails {
  id?: string;
  handle?: string;
  fullName?: string | null;
  biography?: string | null;
  profilePicUrl?: string | null;
  followers?: number | null;
  following?: number | null;
  totalProfilePosts?: number | null;
  isPrivate?: boolean;
  isVerified?: boolean;
}

export interface RefetcherReelItem {
  id: string;              // Unique Instagram Post ID e.g. "3972228173613852056"
  shortcode: string;       // e.g. "DcgMHpnDWWY"
  url: string;             // Canonical reel URL
  type?: string;           // "video" | "reel"
  isVideo?: boolean;
  viewCount?: number;
  likes?: number;
  comments?: number;
  publishedAt?: string;
  caption?: string;
  displayUrl?: string;
}

export interface RefetcherProfileResponse {
  success: boolean;
  profile: ProfileDetails | null;
  reels: RefetcherReelItem[];
  totalReturned: number;
  pagesScanned: number;
  error: string | null;
  httpStatus?: number;
  costEstimate?: string;
}

/**
 * Calls Refetch(er) API POST https://api.refetcher.com/
 * Exclusively uses Refetcher API for public Instagram profile discovery.
 * Stripped of all manual HTML scraping, browser scraping, and direct Instagram web requests.
 */
export async function fetchRefetcherInstagramProfile(
  username: string,
  pages: number = 1,
  providers: ApiProvider[] = []
): Promise<RefetcherProfileResponse> {
  const normalized = normalizeInstagramUsername(username);
  if (!normalized) {
    return {
      success: false,
      profile: null,
      reels: [],
      totalReturned: 0,
      pagesScanned: 0,
      error: 'Invalid or empty Instagram username provided.',
    };
  }

  const apiKey = getRefetcherApiKey(providers);
  if (!apiKey) {
    return {
      success: false,
      profile: null,
      reels: [],
      totalReturned: 0,
      pagesScanned: 0,
      error: 'Refetch(er) API key not configured. Please set REFETCHER_API_KEY or configure Refetcher in Settings > API Providers.',
    };
  }

  const requestedPages = Math.min(Math.max(Number(pages) || 1, 1), 25);

  try {
    const controller = new AbortController();
    // Allow up to 45s for 25-page discovery, 15s for 1-page
    const timeoutMs = requestedPages > 5 ? 45000 : 15000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch('https://api.refetcher.com/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        platform: 'instagram',
        username: normalized,
        includeRecentPosts: true,
        pages: requestedPages,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const httpStatus = res.status;

    // Handle HTTP errors
    if (!res.ok) {
      let errorMsg = `Refetch(er) API returned HTTP ${httpStatus}`;
      try {
        const errJson = await res.json() as any;
        if (errJson?.message) {
          errorMsg = `Refetch(er): ${errJson.message}`;
        } else if (errJson?.error) {
          errorMsg = `Refetch(er): ${typeof errJson.error === 'string' ? errJson.error : JSON.stringify(errJson.error)}`;
        }
      } catch (e) {
        // use status text
        if (httpStatus === 401) errorMsg = 'Refetch(er) Authentication Failed (401): Invalid API Key.';
        if (httpStatus === 402) errorMsg = 'Refetch(er) Payment Required (402): Account balance depleted.';
        if (httpStatus === 429) errorMsg = 'Refetch(er) Rate Limit Exceeded (429): Too many requests.';
        if (httpStatus >= 500) errorMsg = `Refetch(er) Server Error (${httpStatus}): Upstream service temporary issue.`;
      }

      return {
        success: false,
        profile: null,
        reels: [],
        totalReturned: 0,
        pagesScanned: requestedPages,
        error: errorMsg,
        httpStatus,
      };
    }

    const data = (await res.json()) as any;
    const resultObj = Array.isArray(data?.results) ? data.results[0] : (data?.data || data);

    if (!resultObj) {
      return {
        success: true,
        profile: null,
        reels: [],
        totalReturned: 0,
        pagesScanned: requestedPages,
        error: null,
        httpStatus,
      };
    }

    // Extract rich profile details
    let profile: ProfileDetails | null = null;
    const rawProfile = resultObj.profile || data.profile;
    if (rawProfile) {
      profile = {
        id: rawProfile.id ? String(rawProfile.id) : undefined,
        handle: rawProfile.handle || normalized,
        fullName: rawProfile.name || rawProfile.fullName || null,
        biography: rawProfile.biography || rawProfile.bio || null,
        profilePicUrl: rawProfile.profilePicUrlHd || rawProfile.profilePicUrl || null,
        followers: typeof rawProfile.followers === 'number' ? rawProfile.followers : null,
        following: typeof rawProfile.following === 'number' ? rawProfile.following : null,
        totalProfilePosts: typeof rawProfile.totalPosts === 'number' ? rawProfile.totalPosts : null,
        isPrivate: Boolean(rawProfile.isPrivate),
        isVerified: Boolean(rawProfile.isVerified),
      };
    }

    // Extract recent posts / videos
    const rawPosts = Array.isArray(resultObj.recentPosts) 
      ? resultObj.recentPosts 
      : (Array.isArray(resultObj.recentVideos) ? resultObj.recentVideos : (Array.isArray(resultObj.items) ? resultObj.items : []));

    const reels: RefetcherReelItem[] = [];

    for (const post of rawPosts) {
      if (!post) continue;

      // Only process items where isVideo = true or type is video/reel
      const isVideo = post.isVideo === true || post.type === 'video' || post.type === 'reel' || (typeof post.url === 'string' && post.url.includes('/reel/'));
      if (!isVideo) continue;

      const rawId = post.id || post.pk || post.shortcode;
      const rawShortcode = post.shortcode || extractInstagramShortcode(post.url || String(rawId));
      if (!rawShortcode || rawShortcode.length < 4) continue;

      const canonicalUrl = canonicalizeInstagramReelUrl(post.url || `https://www.instagram.com/reel/${rawShortcode}/`);
      const reelId = String(rawId || rawShortcode);

      reels.push({
        id: reelId,
        shortcode: rawShortcode,
        url: canonicalUrl,
        type: post.type || 'video',
        isVideo: true,
        viewCount: typeof post.viewCount === 'number' ? post.viewCount : (typeof post.views === 'number' ? post.views : (typeof post.playCount === 'number' ? post.playCount : 0)),
        likes: typeof post.likes === 'number' ? post.likes : (typeof post.likeCount === 'number' ? post.likeCount : 0),
        comments: typeof post.comments === 'number' ? post.comments : (typeof post.commentCount === 'number' ? post.commentCount : 0),
        publishedAt: post.publishedAt || post.takenAt || post.timestamp || undefined,
        caption: post.caption || post.text || undefined,
        displayUrl: post.displayUrl || post.thumbnailUrl || post.thumbnail || undefined,
      });
    }

    const estimatedCostUsd = (requestedPages * 0.0009).toFixed(4);

    return {
      success: true,
      profile,
      reels,
      totalReturned: reels.length,
      pagesScanned: requestedPages,
      error: null,
      httpStatus,
      costEstimate: `$${estimatedCostUsd}`,
    };
  } catch (err: any) {
    const isTimeout = err?.name === 'AbortError';
    const errorMsg = isTimeout 
      ? `Refetch(er) API request timed out after scanning ${requestedPages} pages.` 
      : (err?.message || 'Network error connecting to Refetch(er) API');

    return {
      success: false,
      profile: null,
      reels: [],
      totalReturned: 0,
      pagesScanned: requestedPages,
      error: errorMsg,
    };
  }
}

/**
 * Checks Refetch(er) Account Balance (GET https://api.refetcher.com/v1/account/balance)
 */
export async function getRefetcherAccountBalance(apiKeyOverride?: string): Promise<{
  success: boolean;
  balanceUsd?: number;
  currency?: string;
  maxBillableUnits?: number;
  unitPriceUsd?: number;
  error?: string;
}> {
  const db = loadDb();
  const apiKey = (apiKeyOverride || getRefetcherApiKey(db.providers || [])).trim();

  if (!apiKey) {
    return { success: false, error: 'No Refetch(er) API key configured.' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch('https://api.refetcher.com/v1/account/balance', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'X-API-Key': apiKey,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { success: false, error: `Refetch(er) Balance API returned HTTP ${res.status}` };
    }

    const json = await res.json() as any;
    if (json?.balance) {
      return {
        success: true,
        balanceUsd: json.balance.balanceUsd,
        currency: json.balance.currency || 'USD',
        maxBillableUnits: json.balance.maxBillableUnits,
        unitPriceUsd: json.balance.unitPriceUsd || 0.0009,
      };
    }
    return { success: false, error: 'Unexpected response from Refetch(er) balance endpoint.' };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Failed to retrieve Refetch(er) balance.' };
  }
}

/**
 * Scans an Instagram account using Refetch(er) API:
 * 1. Resolves profile and recent reels using Refetch(er) API
 * 2. Compares against existing database records (active, archived, paid, deleted)
 * 3. Inserts only genuinely new Reels with UNIQUE(instagram_reel_id) constraint
 * 4. Integrates with CPM campaign
 * 5. Sends Telegram notification only AFTER successful database insertion
 */
export async function scanInstagramAccount(
  accountIdOrUsername: string,
  mode: 'normal' | 'full' | 'initial' = 'normal',
  triggerType: 'manual' | 'scheduled' | 'initial' = 'manual'
): Promise<AccountScanResult> {
  const startTime = Date.now();
  const db: DatabaseSchema = loadDb();

  // Find account by ID or normalized username
  const cleanInput = normalizeInstagramUsername(accountIdOrUsername);
  const account = (db.instagramAccounts || []).find(
    a => a.id === accountIdOrUsername || a.normalizedUsername === cleanInput
  );

  if (!account) {
    return {
      success: false,
      accountId: accountIdOrUsername,
      username: accountIdOrUsername,
      pagesScanned: 0,
      totalDiscovered: 0,
      alreadyKnown: 0,
      newReelsCount: 0,
      failed: 1,
      newReelUrls: [],
      newReelIds: [],
      errorMessage: `Account "${accountIdOrUsername}" not found in database.`,
      durationMs: Date.now() - startTime,
      mode,
      triggerType,
    };
  }

  const accountId = account.id;
  const username = account.username;
  const normalizedUsername = account.normalizedUsername;

  // Scan lock check to prevent concurrent overlapping scans
  if (activeAccountScanLocks.has(accountId)) {
    return {
      success: false,
      accountId,
      username,
      pagesScanned: 0,
      totalDiscovered: account.totalDiscoveredReels || 0,
      alreadyKnown: account.totalDiscoveredReels || 0,
      newReelsCount: 0,
      failed: 0,
      newReelUrls: [],
      newReelIds: [],
      errorMessage: `A scan for @${normalizedUsername} is already in progress. Please wait for it to complete.`,
      durationMs: Date.now() - startTime,
      mode,
      triggerType,
    };
  }

  activeAccountScanLocks.add(accountId);

  // Determine pages: 25 for initial discovery or explicit full scan; 1 for normal scheduled scan
  const pagesToScan = (mode === 'full' || mode === 'initial') ? 25 : 1;

  try {
    // 1. Call Refetch(er) API
    const refetcherResult = await fetchRefetcherInstagramProfile(
      normalizedUsername,
      pagesToScan,
      db.providers || []
    );

    // If Refetcher API returned an error:
    if (!refetcherResult.success) {
      const errorMsg = refetcherResult.error || 'Refetch(er) API discovery failed';
      account.lastScanAt = new Date().toISOString();
      account.lastScanError = errorMsg;
      account.lastScanPages = pagesToScan;
      account.lastScanDurationMs = Date.now() - startTime;
      saveDb(db);

      activeAccountScanLocks.delete(accountId);

      return {
        success: false,
        accountId,
        username,
        pagesScanned: pagesToScan,
        totalDiscovered: account.totalDiscoveredReels || 0,
        alreadyKnown: account.totalDiscoveredReels || 0,
        newReelsCount: 0,
        failed: 1,
        newReelUrls: [],
        newReelIds: [],
        errorMessage: errorMsg,
        durationMs: Date.now() - startTime,
        mode,
        triggerType,
      };
    }

    // Update rich profile info on account
    if (refetcherResult.profile) {
      if (refetcherResult.profile.fullName) account.fullName = refetcherResult.profile.fullName;
      if (refetcherResult.profile.biography) account.biography = refetcherResult.profile.biography;
      if (refetcherResult.profile.profilePicUrl) account.profilePicUrl = refetcherResult.profile.profilePicUrl;
      if (typeof refetcherResult.profile.followers === 'number') account.followers = refetcherResult.profile.followers;
      if (typeof refetcherResult.profile.following === 'number') account.following = refetcherResult.profile.following;
      if (typeof refetcherResult.profile.totalProfilePosts === 'number') account.totalProfilePosts = refetcherResult.profile.totalProfilePosts;
      if (refetcherResult.profile.isPrivate !== undefined) account.isPrivate = refetcherResult.profile.isPrivate;
      if (refetcherResult.profile.isVerified !== undefined) account.isVerified = refetcherResult.profile.isVerified;
    }

    // 2. Build multi-tier lookup of existing Reels across Active, Archived, Paid, and Deleted
    const existingShortcodes = new Set<string>();
    const existingUrls = new Set<string>();
    const existingIgReelIds = new Set<string>();

    for (const reel of db.reels || []) {
      if (!reel) continue;
      if (reel.instagram_reel_id) existingIgReelIds.add(String(reel.instagram_reel_id).trim());
      const code = extractInstagramShortcode(reel.shortcode || reel.url || reel.id);
      if (code) existingShortcodes.add(code.toLowerCase());
      const canon = canonicalizeInstagramReelUrl(reel.url);
      if (canon) existingUrls.add(canon.toLowerCase());
    }

    const deletedIds = new Set<string>(db.meta?.deletedReelIds || []);

    let alreadyKnownCount = 0;
    const genuinelyNewReels: Reel[] = [];
    const genuinelyNewUrls: string[] = [];
    const genuinelyNewIds: string[] = [];
    const nowIso = new Date().toISOString();

    for (const item of refetcherResult.reels) {
      const lowerCode = item.shortcode.toLowerCase();
      const canonicalUrl = canonicalizeInstagramReelUrl(item.url || `https://www.instagram.com/reel/${item.shortcode}/`);
      const canonicalUrlLower = canonicalUrl.toLowerCase();
      const reelId = `reel_${item.shortcode}`;
      const igId = item.id ? String(item.id).trim() : '';

      // Check duplicate against all tiers:
      // (1) Instagram Reel ID, (2) Shortcode, (3) Canonical URL, (4) Deleted IDs
      const isAlreadyInDb = (igId && existingIgReelIds.has(igId))
        || existingShortcodes.has(lowerCode)
        || existingUrls.has(canonicalUrlLower)
        || deletedIds.has(reelId);

      if (isAlreadyInDb) {
        alreadyKnownCount++;
        continue;
      }

      // Genuinely new Reel detected
      const newReel: Reel = {
        id: reelId,
        instagram_reel_id: igId || item.id,
        canonical_reel_url: canonicalUrl,
        url: canonicalUrl,
        shortcode: item.shortcode,
        name: `@${normalizedUsername} Reel ${item.shortcode.slice(0, 6)}`,
        caption: item.caption || `Discovered from @${normalizedUsername}`,
        author: account.fullName || normalizedUsername,
        thumbnail: item.displayUrl || account.profilePicUrl || 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=600&auto=format&fit=crop&q=80',
        views: item.viewCount || 0,
        likes: item.likes || 0,
        comments: item.comments || 0,
        shares: 0,
        createdAt: nowIso,
        publishedAt: item.publishedAt,
        lastUpdatedAt: null,
        nextScheduledAt: new Date(Date.now() + 5000).toISOString(),
        status: 'pending',
        lastError: null,
        lastProviderUsed: 'Refetcher Profile Discovery',
        category: 'active',
        accountId: account.id,
        discoveredFromAccount: normalizedUsername,
        discoverySource: 'refetcher_profile',
        firstDiscoveredAt: nowIso,
      };

      // Assign default/eligible CPM campaign according to existing rules
      const defaultCampId = getDefaultCampaignId(db);
      if (defaultCampId) {
        newReel.campaignId = defaultCampId;
      }
      if (db.cpmCampaigns && db.cpmCampaigns.length > 0) {
        applyCpmToReel(newReel, db.cpmCampaigns, db.meta?.globalFeePercent || 8);
      }

      genuinelyNewReels.push(newReel);
      genuinelyNewUrls.push(canonicalUrl);
      genuinelyNewIds.push(reelId);

      // Add to local sets to prevent intra-batch duplicates
      if (igId) existingIgReelIds.add(igId);
      existingShortcodes.add(lowerCode);
      existingUrls.add(canonicalUrlLower);
    }

    // 3. Update Database State
    account.lastScanAt = nowIso;
    account.lastSuccessfulScanAt = nowIso;
    account.lastScanError = null;
    account.lastScanDiscoveredCount = refetcherResult.reels.length;
    account.lastScanNewCount = genuinelyNewReels.length;
    account.lastScanPages = pagesToScan;
    account.lastScanDurationMs = Date.now() - startTime;

    if (refetcherResult.reels.length > 0) {
      account.lastSeenShortcode = refetcherResult.reels[0].shortcode || account.lastSeenShortcode || null;
      account.lastSeenPostId = refetcherResult.reels[0].id ? String(refetcherResult.reels[0].id) : account.lastSeenPostId || null;
    }

    if (genuinelyNewReels.length > 0) {
      db.reels = [...genuinelyNewReels, ...(db.reels || [])];
    }

    // Calculate total reels tracked for this account in the database
    const totalAccountReels = (db.reels || []).filter(
      r => r.discoveredFromAccount === normalizedUsername || r.accountId === accountId || (account.fullName && r.author === account.fullName)
    ).length;

    account.totalDiscoveredReels = totalAccountReels;

    // Log entry
    const scanLog: FetchLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      reelId: `account_${accountId}`,
      reelName: `@${normalizedUsername}`,
      timestamp: nowIso,
      type: 'automatic',
      status: 'success',
      providerName: 'Refetcher Discovery',
      statsAdded: {
        views: refetcherResult.reels.length,
        likes: genuinelyNewReels.length,
        comments: pagesToScan,
      },
    };
    db.logs = [scanLog, ...(db.logs || [])].slice(0, 500);

    // Save to DB and sync to Firestore
    saveDb(db);

    // 4. Send Telegram Notification ONLY AFTER successful DB insertion
    if (genuinelyNewUrls.length > 0) {
      notifyTelegramNewReelsDiscovered(username, genuinelyNewUrls).catch(err => {
        console.error('[Telegram Discovery Alert Error]', err);
      });
    }

    activeAccountScanLocks.delete(accountId);

    return {
      success: true,
      accountId,
      username,
      pagesScanned: pagesToScan,
      totalDiscovered: refetcherResult.reels.length,
      alreadyKnown: alreadyKnownCount,
      newReelsCount: genuinelyNewReels.length,
      failed: 0,
      newReelUrls: genuinelyNewUrls,
      newReelIds: genuinelyNewIds,
      errorMessage: null,
      durationMs: Date.now() - startTime,
      costEstimate: refetcherResult.costEstimate,
      mode,
      triggerType,
    };
  } catch (err: any) {
    activeAccountScanLocks.delete(accountId);

    const errorMsg = err?.message || 'Unexpected error during Refetch(er) account scan';
    account.lastScanAt = new Date().toISOString();
    account.lastScanError = errorMsg;
    account.lastScanPages = pagesToScan;
    account.lastScanDurationMs = Date.now() - startTime;
    saveDb(db);

    return {
      success: false,
      accountId,
      username,
      pagesScanned: pagesToScan,
      totalDiscovered: 0,
      alreadyKnown: 0,
      newReelsCount: 0,
      failed: 1,
      newReelUrls: [],
      newReelIds: [],
      errorMessage: errorMsg,
      durationMs: Date.now() - startTime,
      mode,
      triggerType,
    };
  }
}

/**
 * Bulk imports and associates reels with a specific tracked account.
 * Accepts raw URLs, shortcodes, or multiline text.
 */
export async function importReelsForAccount(
  accountIdOrUsername: string,
  rawInput: string | string[]
): Promise<{
  success: boolean;
  totalImported: number;
  newAdded: number;
  alreadyTracked: number;
  totalAccountReels: number;
  account: InstagramAccount | null;
  error?: string | null;
}> {
  const db = loadDb();
  const cleanInput = normalizeInstagramUsername(accountIdOrUsername);
  const account = (db.instagramAccounts || []).find(
    a => a.id === accountIdOrUsername || a.normalizedUsername === cleanInput
  );

  if (!account) {
    return {
      success: false,
      totalImported: 0,
      newAdded: 0,
      alreadyTracked: 0,
      totalAccountReels: 0,
      account: null,
      error: `Account "${accountIdOrUsername}" not found.`,
    };
  }

  // Parse all shortcodes and URLs from input
  const lines = Array.isArray(rawInput) ? rawInput : rawInput.split(/[\n,\s\r]+/);
  const extractedCodes: string[] = [];

  for (const line of lines) {
    if (!line || !line.trim()) continue;
    const trimmed = line.trim();
    const code = extractInstagramShortcode(trimmed);
    if (code && code.length >= 4 && !extractedCodes.includes(code)) {
      extractedCodes.push(code);
    }
  }

  if (extractedCodes.length === 0) {
    return {
      success: false,
      totalImported: 0,
      newAdded: 0,
      alreadyTracked: 0,
      totalAccountReels: account.totalDiscoveredReels || 0,
      account,
      error: 'No valid Instagram Reel URLs or shortcodes found in the input.',
    };
  }

  const existingByCode = new Map<string, Reel>();
  for (const reel of db.reels || []) {
    const code = extractInstagramShortcode(reel.shortcode || reel.url || reel.id);
    if (code) existingByCode.set(code.toLowerCase(), reel);
  }

  let newAdded = 0;
  let alreadyTracked = 0;
  const newlyCreatedReels: Reel[] = [];
  const nowIso = new Date().toISOString();

  for (const code of extractedCodes) {
    const lowerCode = code.toLowerCase();
    const existing = existingByCode.get(lowerCode);

    if (existing) {
      // Connect to this account if not already connected
      existing.discoveredFromAccount = account.normalizedUsername;
      existing.accountId = account.id;
      existing.category = 'active'; // ensure it is active
      alreadyTracked++;
    } else {
      const canonicalUrl = `https://www.instagram.com/reel/${code}/`;
      const reelId = `reel_${code}`;
      const newReel: Reel = {
        id: reelId,
        canonical_reel_url: canonicalUrl,
        url: canonicalUrl,
        shortcode: code,
        name: `@${account.normalizedUsername} Reel ${code.slice(0, 6)}`,
        caption: `Imported for @${account.normalizedUsername}`,
        author: account.fullName || account.normalizedUsername,
        thumbnail: account.profilePicUrl || 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=600&auto=format&fit=crop&q=80',
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        createdAt: nowIso,
        lastUpdatedAt: null,
        nextScheduledAt: new Date(Date.now() + 5000).toISOString(),
        status: 'pending',
        lastError: null,
        lastProviderUsed: 'Manual Bulk Import',
        category: 'active',
        discoveredFromAccount: account.normalizedUsername,
        accountId: account.id,
        discoverySource: 'account_tracker',
        firstDiscoveredAt: nowIso,
      };

      const defaultCampId = getDefaultCampaignId(db);
      if (defaultCampId) {
        newReel.campaignId = defaultCampId;
      }
      if (db.cpmCampaigns && db.cpmCampaigns.length > 0) {
        applyCpmToReel(newReel, db.cpmCampaigns, db.meta?.globalFeePercent || 8);
      }

      newlyCreatedReels.push(newReel);
      existingByCode.set(lowerCode, newReel);
      newAdded++;
    }
  }

  if (newlyCreatedReels.length > 0) {
    db.reels = [...newlyCreatedReels, ...(db.reels || [])];
  }

  const totalAccountReels = (db.reels || []).filter(
    r => r.discoveredFromAccount === account.normalizedUsername || r.accountId === account.id || (account.fullName && r.author === account.fullName)
  ).length;

  account.totalDiscoveredReels = totalAccountReels;
  account.lastScanError = null;
  account.lastScanAt = nowIso;
  account.lastSuccessfulScanAt = nowIso;

  saveDb(db);

  return {
    success: true,
    totalImported: extractedCodes.length,
    newAdded,
    alreadyTracked,
    totalAccountReels,
    account,
  };
}
