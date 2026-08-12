import { GoogleGenAI } from '@google/genai';
import { loadDb, saveDb } from './db.js';
import { sendTelegramMessage } from './telegram.js';
import { AiLog, Reel } from '../types.js';

// Initialize Gemini Client safely with User-Agent
function getGeminiClient(customApiKey?: string): GoogleGenAI | null {
  const apiKey = (customApiKey || process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;
  try {
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  } catch (err) {
    console.error('[AI] Gemini client initialization error:', err);
    return null;
  }
}

// Call Groq Cloud API (Ultra-fast LLM Inference: llama-3.3-70b-versatile, llama-3.1-8b-instant)
export async function callGroqApi(prompt: string, customApiKey?: string): Promise<{ text: string | null; error?: string }> {
  const apiKey = (customApiKey || process.env.GROQ_API_KEY || process.env.GROK_API_KEY || '').trim();
  if (!apiKey) {
    return { text: null, error: 'No Groq API key provided' };
  }

  const modelsToTry = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'];

  for (const model of modelsToTry) {
    try {
      console.log(`[AI] Calling Groq Cloud API (model: ${model})...`);
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: 'You are an expert Instagram Reel Analytics AI Brain. Provide short, punchy, actionable performance alerts and commentary with emojis. Return raw JSON if requested.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 500,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        console.warn(`[AI] Groq API (${model}) returned HTTP ${res.status}: ${errorText.slice(0, 200)}`);
        // If HTTP 401 or invalid key, don't keep trying models
        if (res.status === 401) {
          return { text: null, error: `Groq HTTP 401 Unauthorized: Invalid API key` };
        }
        continue;
      }

      const json = (await res.json()) as any;
      const text = json.choices?.[0]?.message?.content;
      if (text) {
        return { text };
      }
    } catch (err: any) {
      console.error(`[AI] Groq API (${model}) Exception:`, err);
    }
  }

  return { text: null, error: 'Groq API request failed across all models' };
}

// Call xAI Grok API (https://api.x.ai/v1/chat/completions with grok-2-latest)
export async function callGrokApi(prompt: string, customApiKey?: string): Promise<{ text: string | null; error?: string }> {
  const apiKey = (customApiKey || process.env.GROK_API_KEY || process.env.GROQ_API_KEY || '').trim();
  if (!apiKey) {
    return { text: null, error: 'No xAI Grok API key provided' };
  }

  try {
    console.log('[AI] Calling xAI Grok API (grok-2-latest)...');
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-2-latest',
        messages: [
          {
            role: 'system',
            content: 'You are an expert Instagram Reel Analytics AI Brain. Provide short, punchy, actionable performance alerts and commentary with emojis.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      console.warn(`[AI] xAI Grok API returned HTTP ${res.status}: ${errorText.slice(0, 200)}`);
      return { text: null, error: `xAI Grok HTTP ${res.status}: ${errorText.slice(0, 150)}` };
    }

    const json = (await res.json()) as any;
    const text = json.choices?.[0]?.message?.content;
    return { text: text || null };
  } catch (err: any) {
    console.error('[AI] xAI Grok API Exception:', err);
    return { text: null, error: err.message || 'xAI Grok API request exception' };
  }
}

// Execute AI text generation with configurable primary + fallback priority
export async function generateAiInsight(prompt: string): Promise<{ text: string; modelUsed: 'gemini' | 'groq' | 'grok' } | null> {
  const db = loadDb();
  const settings = db.aiSettings;

  const geminiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY;
  const groqKey = settings.groqApiKey || settings.grokApiKey || process.env.GROQ_API_KEY || process.env.GROK_API_KEY;
  const grokKey = settings.grokApiKey || settings.groqApiKey || process.env.GROK_API_KEY || process.env.GROQ_API_KEY;

  const preference = settings.modelPreference || 'groq_first';
  const enableGemini = settings.enableGemini !== false;
  const enableGroq = settings.enableGrok !== false;

  const attemptGemini = async (): Promise<string | null> => {
    if (!enableGemini) return null;
    const ai = getGeminiClient(geminiKey);
    if (!ai) return null;
    try {
      console.log('[AI] Calling Google Gemini 3.6 Flash...');
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          systemInstruction: 'You are an expert Instagram Reel Performance Monitoring AI Agent. Return concise, impactful, emoji-rich alerts for creator dashboards and Telegram.',
          temperature: 0.7,
        },
      });
      return response.text || null;
    } catch (e) {
      console.warn('[AI] Gemini generation failed:', e);
      return null;
    }
  };

  const attemptGroqOrGrok = async (): Promise<{ text: string; modelUsed: 'groq' | 'grok' } | null> => {
    if (!enableGroq) return null;

    // Check key prefix to smartly choose Groq Cloud vs xAI Grok
    const key = (groqKey || '').trim();
    if (key.startsWith('gsk_') || process.env.GROQ_API_KEY || !key.startsWith('xai-')) {
      const groqRes = await callGroqApi(prompt, key);
      if (groqRes.text) return { text: groqRes.text, modelUsed: 'groq' };

      // Fallback to xAI Grok if Groq Cloud failed
      if (key.startsWith('xai-') || process.env.GROK_API_KEY) {
        const grokRes = await callGrokApi(prompt, key);
        if (grokRes.text) return { text: grokRes.text, modelUsed: 'grok' };
      }
    } else {
      const grokRes = await callGrokApi(prompt, key);
      if (grokRes.text) return { text: grokRes.text, modelUsed: 'grok' };

      const groqRes = await callGroqApi(prompt, key);
      if (groqRes.text) return { text: groqRes.text, modelUsed: 'groq' };
    }

    return null;
  };

  // Preference order: Default groq_first
  if (preference === 'groq_first' || preference === 'grok_first') {
    const groqResult = await attemptGroqOrGrok();
    if (groqResult) return groqResult;

    console.log('[AI Fallback] Groq/Grok unavailable. Falling back to Gemini...');
    const geminiResult = await attemptGemini();
    if (geminiResult) return { text: geminiResult, modelUsed: 'gemini' };
  } else if (preference === 'gemini_first') {
    const geminiResult = await attemptGemini();
    if (geminiResult) return { text: geminiResult, modelUsed: 'gemini' };

    console.log('[AI Fallback] Gemini unavailable. Falling back to Groq/Grok...');
    const groqResult = await attemptGroqOrGrok();
    if (groqResult) return groqResult;
  } else {
    // Auto mode: Try Groq first if key present, else Gemini first
    if (groqKey) {
      const groqResult = await attemptGroqOrGrok();
      if (groqResult) return groqResult;
      const geminiResult = await attemptGemini();
      if (geminiResult) return { text: geminiResult, modelUsed: 'gemini' };
    } else {
      const geminiResult = await attemptGemini();
      if (geminiResult) return { text: geminiResult, modelUsed: 'gemini' };
      const groqResult = await attemptGroqOrGrok();
      if (groqResult) return groqResult;
    }
  }

  return null;
}

// Execute AI Monitoring Check (Limited strictly to daily limit)
export async function runAiMonitoringCheck(isManualTrigger = false): Promise<{ success: boolean; message: string; aiLog?: AiLog }> {
  const db = loadDb();
  const todayStr = new Date().toISOString().slice(0, 10);

  // Check and reset daily counter if new UTC day
  if (db.aiMeta.lastCheckDate !== todayStr) {
    db.aiMeta.checksUsedToday = 0;
    db.aiMeta.lastCheckDate = todayStr;
    saveDb(db);
  }

  const limit = db.aiSettings.dailyCheckLimit || 50;

  if (db.aiMeta.checksUsedToday >= limit) {
    return {
      success: false,
      message: `Daily AI monitoring check limit (${limit}/${limit}) reached for today (${todayStr}). Resets tomorrow at 00:00 UTC.`,
    };
  }

  if (db.reels.length === 0) {
    return { success: false, message: 'No reels saved in database to analyze.' };
  }

  // Increment usage counter FIRST
  db.aiMeta.checksUsedToday += 1;
  db.aiMeta.lastAiAnalysisAt = new Date().toISOString();
  saveDb(db);

  // Prepare structured performance data for AI
  const reelsSummary = db.reels.map((r) => {
    return {
      id: r.id,
      name: r.name,
      views: r.views,
      likes: r.likes,
      growth24h: r.growth24h || 0,
      growth6h: r.growth6h || 0,
      isViral: r.isViral || false,
      isStalled: r.isStalled || false,
      lastMilestone: r.lastMilestone || 0,
      status: r.status,
    };
  });

  const totalViews = db.reels.reduce((acc, r) => acc + (r.views || 0), 0);
  const total24hGain = db.reels.reduce((acc, r) => acc + (r.growth24h || 0), 0);

  const prompt = `Analyze these Instagram Reels performance statistics and generate 1-2 punchy, highly relevant insights or alerts.
Sensitivity setting: ${db.aiSettings.alertSensitivity || 'medium'}.
Total Reels: ${db.reels.length} | Total Views: ${totalViews} | 24h Total Gain: +${total24hGain} views.

Reels Data:
${JSON.stringify(reelsSummary, null, 2)}

Instructions:
1. Detect any notable milestones (e.g. crossing 10K, 50K, 100K, 500K, 1M views).
2. Detect viral acceleration or sudden view gains (e.g., gained 20K views recently).
3. Detect stalled reels with 0 growth.
4. Format output as a headline + message. Use examples like:
   - "🔥 Wow! Reel 'ABC' just crossed 100K views!"
   - "📈 This Reel gained 20K views since the last check."
   - "🚀 This Reel is accelerating unusually fast."
   - "⚠️ Views have stalled."
5. Output format JSON strictly:
{
  "headline": "Short Emoji Title",
  "message": "1-2 sentence detailed insight",
  "reelName": "Name of relevant reel if specific",
  "type": "milestone" | "viral" | "acceleration" | "stalled" | "manual_audit"
}
`;

  const aiResult = await generateAiInsight(prompt);

  let headline = '🧠 AI Performance Analysis Complete';
  let messageText = `Analyzed ${db.reels.length} reels (${totalViews.toLocaleString()} total views, +${total24hGain.toLocaleString()} 24h gain).`;
  let type: AiLog['type'] = isManualTrigger ? 'manual_audit' : 'viral';
  let reelName: string | undefined = undefined;
  let modelUsed: 'gemini' | 'groq' | 'grok' = 'groq';

  if (aiResult) {
    modelUsed = aiResult.modelUsed;
    db.aiMeta.activeModelUsed = modelUsed;
    try {
      // Clean JSON string
      const raw = aiResult.text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(raw);
      if (parsed.headline) headline = parsed.headline;
      if (parsed.message) messageText = parsed.message;
      if (parsed.type) type = parsed.type;
      if (parsed.reelName) reelName = parsed.reelName;
    } catch (e) {
      // Fallback text if not JSON
      messageText = aiResult.text.slice(0, 300);
    }
  }

  // Check if we should notify Telegram
  let sentToTelegram = false;
  if (db.telegram.enabled && db.telegram.botToken && db.telegram.adminTelegramId) {
    const modelLabel = modelUsed === 'groq' ? 'Groq Llama-3.3' : modelUsed === 'gemini' ? 'Google Gemini' : 'Grok AI';
    const telegramMsg = `<b>${headline}</b>\n\n${messageText}\n\n<i>🤖 Powered by ${modelLabel} (Check ${db.aiMeta.checksUsedToday}/${limit} used today)</i>`;
    sentToTelegram = await sendTelegramMessage(db.telegram.botToken, db.telegram.adminTelegramId, telegramMsg);
  }

  const aiLogEntry: AiLog = {
    id: 'ailog_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    timestamp: new Date().toISOString(),
    modelUsed,
    headline,
    message: messageText,
    sentToTelegram,
    reelName,
    type,
  };

  db.aiLogs.unshift(aiLogEntry);
  if (db.aiLogs.length > 100) db.aiLogs.pop();
  saveDb(db);

  const modelName = modelUsed === 'groq' ? 'Groq Llama-3.3' : modelUsed === 'gemini' ? 'Google Gemini' : 'Grok';
  return {
    success: true,
    message: `AI Check completed using ${modelName}. (${db.aiMeta.checksUsedToday}/${limit} daily checks used).`,
    aiLog: aiLogEntry,
  };
}

// Generate Daily Performance Report and Send to Telegram
export async function generateDailyAiReport(): Promise<{ success: boolean; reportText: string }> {
  const db = loadDb();
  if (db.reels.length === 0) {
    return { success: false, reportText: 'No reels saved to generate daily report.' };
  }

  const totalViews = db.reels.reduce((sum, r) => sum + (r.views || 0), 0);
  const totalLikes = db.reels.reduce((sum, r) => sum + (r.likes || 0), 0);
  const total24hGain = db.reels.reduce((sum, r) => sum + (r.growth24h || 0), 0);

  const topReels = [...db.reels].sort((a, b) => b.views - a.views).slice(0, 3);
  const topGainers = [...db.reels].sort((a, b) => (b.growth24h || 0) - (a.growth24h || 0)).slice(0, 3);

  const prompt = `Generate a daily executive performance summary report for an Instagram Reel Command Center.
Stats:
- Total Reels: ${db.reels.length}
- Total Views: ${totalViews.toLocaleString()}
- Total Likes: ${totalLikes.toLocaleString()}
- 24h Growth: +${total24hGain.toLocaleString()} views

Top Reels by Views: ${topReels.map((r) => `${r.name} (${r.views.toLocaleString()} views)`).join(', ')}
Top 24h Gainers: ${topGainers.map((r) => `${r.name} (+${(r.growth24h || 0).toLocaleString()} views)`).join(', ')}

Format in crisp Markdown with emojis. Keep under 200 words.`;

  const aiResult = await generateAiInsight(prompt);
  const reportContent =
    aiResult?.text ||
    `📊 <b>Daily Reel Performance Summary</b>\n\n• Total Reels: ${db.reels.length}\n• Total Views: ${totalViews.toLocaleString()}\n• 24h Growth: +${total24hGain.toLocaleString()} views\n\n<b>Top Performer:</b> ${topReels[0]?.name || 'N/A'} (${topReels[0]?.views.toLocaleString()} views)`;

  // Send to Telegram if enabled
  if (db.telegram.enabled && db.telegram.botToken && db.telegram.adminTelegramId) {
    await sendTelegramMessage(
      db.telegram.botToken,
      db.telegram.adminTelegramId,
      `📅 <b>DAILY REEL PERFORMANCE REPORT</b>\n\n${reportContent}`
    );
  }

  return { success: true, reportText: reportContent };
}
