import { ApiProvider, TestProviderResult } from '../types.js';
import { logSystemEvent } from './logger.js';

export interface FetchedReelData {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  caption: string;
  author: string;
  thumbnail: string;
}

export interface FetchResult {
  success: boolean;
  providerName?: string;
  data?: FetchedReelData;
  error?: string;
  httpStatus?: number;
}

// Utility to safely extract nested property path like "data.views" or "owner.username" or array "edges[0].node.text"
function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

// Helper to find value from multiple candidate paths or key search
function extractField(obj: any, configuredPath: string | undefined, candidateKeys: string[]): any {
  if (configuredPath) {
    const val = getNestedValue(obj, configuredPath);
    if (val !== undefined && val !== null) return val;
  }
  
  // Search candidates across all candidate root/child object scopes
  const firstResult = Array.isArray(obj?.results) ? obj.results[0] : (Array.isArray(obj?.data) ? obj.data[0] : (Array.isArray(obj?.items) ? obj.items[0] : null));
  const scopes = [
    obj, 
    firstResult, 
    obj?.data, 
    obj?.result, 
    obj?.response, 
    obj?.item, 
    obj?.media, 
    obj?.post, 
    obj?.reel,
    obj?.metrics,
    obj?.shortcode_media,
    obj?.graphql?.shortcode_media,
    firstResult?.metrics,
    firstResult?.shortcode_media,
  ];
  
  for (const scope of scopes) {
    if (!scope || typeof scope !== 'object') continue;
    for (const key of candidateKeys) {
      if (scope[key] !== undefined && scope[key] !== null) {
        return scope[key];
      }
    }
  }
  return undefined;
}

// Sanitize secret API key from string output
export function sanitizeApiKey(str: string, apiKey: string): string {
  if (!apiKey || !str) return str || '';
  return str.split(apiKey).join('[REDACTED_API_KEY]');
}

// Format clean error details from raw response text
function parseDetailedApiError(responseText: string, httpStatus: number, cleanApiKey: string): string {
  let detailed = '';
  try {
    const json = JSON.parse(responseText);
    if (json.errors) {
      if (typeof json.errors === 'object' && json.errors !== null) {
        const entries = Object.entries(json.errors).map(([k, v]) => {
          if (typeof v === 'string') return v;
          if (typeof v === 'object' && v !== null && (v as any).message) return (v as any).message;
          return `${k}: ${JSON.stringify(v)}`;
        });
        detailed = entries.join(', ');
      } else {
        detailed = String(json.errors);
      }
    } else if (json.error) {
      if (typeof json.error === 'string') {
        detailed = json.error;
      } else if (typeof json.error === 'object' && json.error !== null) {
        detailed = json.error.message || json.error.msg || json.error.description || JSON.stringify(json.error);
      }
    } else if (json.message) {
      detailed = String(json.message);
    } else if (json.msg) {
      detailed = String(json.msg);
    } else if (json.failed) {
      detailed = `Upstream fetch failed (code: ${json.failed})`;
    }
  } catch (e) {
    // text not json
  }

  if (httpStatus === 401 || httpStatus === 403) {
    return `HTTP ${httpStatus}: Invalid or missing API key (${detailed || 'Unauthorized'})`;
  }
  if (httpStatus === 429) {
    return `HTTP 429: API rate limit or quota balance depleted (${detailed || 'Too Many Requests'})`;
  }
  if (httpStatus === 404) {
    return `HTTP 404: Endpoint or Reel not found (${detailed || 'Not Found'})`;
  }
  if (httpStatus === 502 || httpStatus === 503 || httpStatus === 504) {
    return `HTTP ${httpStatus} (Bad Gateway / Upstream Error): ${detailed || 'The scraping provider encountered a temporary error reaching Instagram'}`;
  }
  if (detailed) {
    return `HTTP ${httpStatus}: ${detailed}`;
  }
  return `HTTP ${httpStatus}: ${responseText.slice(0, 160)}`;
}

// Execute request to a single provider
export async function executeProviderFetch(provider: ApiProvider, reelUrl: string): Promise<{ success: boolean; data?: FetchedReelData; error?: string; httpStatus?: number; rawSnippet?: string }> {
  try {
    const cleanApiKey = (provider.apiKey || '').trim();
    const cleanUrl = reelUrl.trim();

    // Construct full URL
    let fullUrlStr = provider.baseUrl.trim();
    if (fullUrlStr.endsWith('/')) fullUrlStr = fullUrlStr.slice(0, -1);
    
    let pathStr = provider.endpointPath.trim();
    if (pathStr && !pathStr.startsWith('/')) pathStr = '/' + pathStr;
    
    let targetUrl = fullUrlStr + pathStr;

    // Headers
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) InstagramReelTracker/1.0',
      'Accept': 'application/json',
    };

    if (provider.headersJson) {
      try {
        const customHeaders = JSON.parse(provider.headersJson);
        Object.assign(headers, customHeaders);
      } catch (e) {
        console.warn(`[Provider:${provider.name}] Custom headers JSON parse error`);
      }
    }

    // Apply API key location & parameters
    const urlObj = new URL(targetUrl);
    const paramName = provider.urlParamName || 'url';

    // Auto-detect RapidAPI host header if calling rapidapi
    if (urlObj.hostname.includes('rapidapi.com') && !headers['x-rapidapi-host']) {
      headers['x-rapidapi-host'] = urlObj.hostname;
    }

    if (provider.method === 'GET') {
      urlObj.searchParams.set(paramName, cleanUrl);
      if (provider.apiKeyLocation === 'query_api_key') {
        urlObj.searchParams.set('api_key', cleanApiKey);
      } else if (provider.apiKeyLocation === 'query_key') {
        urlObj.searchParams.set('key', cleanApiKey);
      } else if (provider.apiKeyLocation === 'query_token') {
        urlObj.searchParams.set('token', cleanApiKey);
      }
    }

    if (cleanApiKey) {
      if (provider.apiKeyLocation === 'header_bearer') {
        for (const k of Object.keys(headers)) {
          if (k.toLowerCase() === 'authorization') delete headers[k];
        }
        headers['Authorization'] = `Bearer ${cleanApiKey}`;
      } else if (provider.apiKeyLocation === 'header_x_api_key') {
        for (const k of Object.keys(headers)) {
          if (k.toLowerCase() === 'x-api-key') delete headers[k];
        }
        headers['x-api-key'] = cleanApiKey;
      } else if (provider.apiKeyLocation === 'header_x_rapidapi_key') {
        for (const k of Object.keys(headers)) {
          if (k.toLowerCase() === 'x-rapidapi-key') delete headers[k];
        }
        headers['x-rapidapi-key'] = cleanApiKey;
      }
    }

    // Prepare fetch options
    const fetchOptions: RequestInit = {
      method: provider.method,
      headers,
    };

    if (provider.method === 'POST') {
      headers['Content-Type'] = 'application/json';
      const bodyObj: Record<string, any> = {};
      bodyObj[paramName] = cleanUrl;
      if (provider.apiKeyLocation === 'body_api_key') {
        bodyObj['api_key'] = cleanApiKey;
      }
      
      if (provider.customBodyJson) {
        try {
          const parsed = JSON.parse(provider.customBodyJson);
          Object.assign(bodyObj, parsed);
        } catch (e) {
          // ignore
        }
      }
      fetchOptions.body = JSON.stringify(bodyObj);
    }

    // Log attempt (sanitized)
    const startTime = Date.now();
    const sanitizedUrl = sanitizeApiKey(urlObj.toString(), cleanApiKey);
    console.log(`[Provider Attempt] Calling ${provider.name} -> ${sanitizedUrl}`);

    // Call API with 20 second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    fetchOptions.signal = controller.signal;

    const response = await fetch(urlObj.toString(), fetchOptions);
    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;

    const httpStatus = response.status;
    const responseText = await response.text();
    const sanitizedRawSnippet = sanitizeApiKey(responseText.slice(0, 1000), cleanApiKey);

    if (!response.ok) {
      const errMsg = parseDetailedApiError(responseText, httpStatus, cleanApiKey);
      logSystemEvent(
        'error',
        'provider',
        `Provider ${provider.name} returned HTTP ${httpStatus}`,
        { error: errMsg, url: sanitizedUrl, snippet: sanitizedRawSnippet },
        { providerName: provider.name, httpStatus, url: sanitizedUrl },
        durationMs
      );
      return {
        success: false,
        httpStatus,
        error: sanitizeApiKey(errMsg, cleanApiKey),
        rawSnippet: sanitizedRawSnippet,
      };
    }

    // Parse JSON
    let json: any;
    try {
      json = JSON.parse(responseText);
    } catch (e) {
      const isHtml = responseText.trim().toLowerCase().startsWith('<!doctype html') || responseText.trim().toLowerCase().startsWith('<html');
      const errorDetail = isHtml
        ? 'Provider returned an HTML web page instead of JSON API response. This occurs when the deployed Railway/Render service is running the root Web Frontend instead of the Python microservice in "/microservice". In Railway: go to Settings -> Build -> set "Root Directory" to "/microservice" and redeploy.'
        : `Provider response was not valid JSON: ${sanitizedRawSnippet.slice(0, 150)}`;

      logSystemEvent(
        'error',
        'provider',
        `Provider ${provider.name} response JSON parsing error`,
        { error: errorDetail, rawSnippet: sanitizedRawSnippet },
        { providerName: provider.name, httpStatus, url: sanitizedUrl },
        durationMs
      );

      return {
        success: false,
        httpStatus,
        error: errorDetail,
        rawSnippet: sanitizedRawSnippet,
      };
    }

    // Check if JSON response explicitly marks error/failure
    if (json.success === false || json.status === 'error' || (json.error && !json.data && !json.views)) {
      const apiErr = json.message || (typeof json.error === 'object' ? json.error?.message : json.error) || json.msg || 'API returned error status';
      logSystemEvent(
        'warn',
        'provider',
        `Provider ${provider.name} returned API error status`,
        { error: apiErr, raw: sanitizedRawSnippet },
        { providerName: provider.name, httpStatus, url: sanitizedUrl },
        durationMs
      );
      return {
        success: false,
        httpStatus,
        error: sanitizeApiKey(String(apiErr), cleanApiKey),
        rawSnippet: sanitizedRawSnippet,
      };
    }

    // Extract statistics fields
    const m = provider.mapping || ({} as Partial<ApiProvider['mapping']>);
    
    const rawViews = extractField(json, m.viewsPath, [
      'views', 'view_count', 'video_view_count', 'play_count', 'video_play_count', 'plays', 'playCount', 'views_count'
    ]);
    const rawLikes = extractField(json, m.likesPath, [
      'likes', 'like_count', 'likes_count', 'likeCount', 'edge_media_preview_like.count', 'edge_liked_by.count'
    ]);
    const rawComments = extractField(json, m.commentsPath, [
      'comments', 'comment_count', 'comments_count', 'commentCount', 'edge_media_to_comment.count'
    ]);
    const rawShares = extractField(json, m.sharesPath, [
      'shares', 'share_count', 'shares_count', 'shareCount', 'reposts', 'repost_count'
    ]);
    const rawCaption = extractField(json, m.captionPath, [
      'caption', 'text', 'title', 'description', 'caption_text', 'edge_media_to_caption.edges[0].node.text'
    ]);
    const rawAuthor = extractField(json, m.authorPath, [
      'author', 'username', 'owner_username', 'user_username', 'owner.username', 'user.username', 'owner', 'user'
    ]);
    const rawThumbnail = extractField(json, m.thumbnailPath, [
      'thumbnail', 'display_url', 'cover', 'image_url', 'cover_url', 'thumbnail_url', 'image', 'display_src'
    ]);

    // Helper to format number
    const parseNum = (val: any): number => {
      if (typeof val === 'number') return Math.max(0, val);
      if (typeof val === 'string') {
        const cleaned = val.replace(/,/g, '').trim();
        const num = parseInt(cleaned, 10);
        return isNaN(num) ? 0 : Math.max(0, num);
      }
      if (typeof val === 'object' && val !== null && typeof val.count === 'number') {
        return Math.max(0, val.count);
      }
      return 0;
    };

    // Helper to format text
    const parseStr = (val: any): string => {
      if (!val) return '';
      if (typeof val === 'string') return val.trim();
      if (typeof val === 'object' && val.username) return String(val.username);
      if (typeof val === 'object' && val.text) return String(val.text);
      if (typeof val === 'object' && val.name) return String(val.name);
      return String(val);
    };

    const views = parseNum(rawViews);
    const likes = parseNum(rawLikes);
    const comments = parseNum(rawComments);
    const shares = parseNum(rawShares);
    const caption = parseStr(rawCaption);
    const author = parseStr(rawAuthor);
    let thumbnail = parseStr(rawThumbnail);

    // If thumbnail is empty, supply default placeholder
    if (!thumbnail) {
      thumbnail = `https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?auto=format&fit=crop&w=600&q=80`;
    }

    const fetchedData: FetchedReelData = {
      views,
      likes,
      comments,
      shares,
      caption: caption || 'Instagram Reel',
      author: author || 'Instagram User',
      thumbnail,
    };

    logSystemEvent(
      'success',
      'provider',
      `Extracted stats via ${provider.name}: ${views.toLocaleString()} views, ${likes.toLocaleString()} likes`,
      { views, likes, comments, shares, author, captionSnippet: caption.slice(0, 100) },
      {
        providerName: provider.name,
        httpStatus,
        url: sanitizedUrl,
        stats: { views, likes, comments, shares },
      },
      durationMs
    );

    return {
      success: true,
      httpStatus,
      data: fetchedData,
      rawSnippet: sanitizedRawSnippet,
    };

  } catch (err: any) {
    const cleanApiKey = provider.apiKey || '';
    const errMessage = err?.name === 'AbortError' 
      ? 'Request timed out (20s timeout exceeded)' 
      : (err?.message || 'Network request failed');

    logSystemEvent(
      'error',
      'provider',
      `Provider ${provider.name} network exception: ${errMessage}`,
      { error: errMessage, url: reelUrl },
      { providerName: provider.name, url: reelUrl }
    );

    return {
      success: false,
      httpStatus: 0,
      error: sanitizeApiKey(errMessage, cleanApiKey),
    };
  }
}

// Primary fetch function using multi-provider fallback chain
export async function fetchReelWithFallbackChain(
  providers: ApiProvider[], 
  reelUrl: string
): Promise<FetchResult> {
  const activeProviders = providers
    .filter(p => p.enabled && p.baseUrl)
    .sort((a, b) => a.priority - b.priority);

  if (activeProviders.length === 0) {
    return {
      success: false,
      error: 'No active API providers configured in Settings. Please add an API key/provider in Settings.',
    };
  }

  const errorsLogged: string[] = [];

  for (const provider of activeProviders) {
    const result = await executeProviderFetch(provider, reelUrl);
    if (result.success && result.data) {
      return {
        success: true,
        providerName: provider.name,
        data: result.data,
      };
    } else {
      const failReason = `${provider.name}: ${result.error || 'Unknown error'}`;
      errorsLogged.push(failReason);
      console.warn(`[Fallback Chain] Provider failed -> ${failReason}`);
    }
  }

  return {
    success: false,
    error: `All ${activeProviders.length} configured providers failed.\nDetails:\n` + errorsLogged.join('\n'),
  };
}

// Function for "Test Provider" button in Settings
export async function testSingleProvider(provider: ApiProvider, reelUrl: string): Promise<TestProviderResult> {
  const result = await executeProviderFetch(provider, reelUrl);
  return {
    success: result.success,
    httpStatus: result.httpStatus || 0,
    rawResponseSnippet: result.rawSnippet || '',
    errorMessage: result.error,
    parsedData: result.data ? {
      views: result.data.views,
      likes: result.data.likes,
      comments: result.data.comments,
      shares: result.data.shares,
      caption: result.data.caption,
      author: result.data.author,
      thumbnail: result.data.thumbnail,
    } : undefined,
  };
}
