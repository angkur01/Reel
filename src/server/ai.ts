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

// Call Grok API via xAI endpoint (OpenAI compatible)
async function callGrokApi(prompt: string, customApiKey?: string): Promise<string | null> {
  const apiKey = (customApiKey || process.env.GROK_API_KEY || '').trim();
  if (!apiKey) return null;

  try {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-2-latest',
        messages: [
          { role: 'system', content: 'You are an expert Instagram Reel Analytics AI Brain. Provide short, punchy, actionable performance alerts and commentary with emojis.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!res.ok) {
      console.warn(`[AI] Grok API returned HTTP ${res.status}`);
      return null;
    }

    const json = await res.json() as any;
    const text = json.choices?.[0]?.message?.content;
    return text || null;
  } catch (err) {
    console.error('[AI] Grok API Exception:', err);
    return null;
  }
}

// Execute AI text generation with primary + fallback
export async function generateAiInsight(prompt: string): Promise<{ text: string; modelUsed: 'gemini' | 'grok' } | null> {
  const db = loadDb();
  const settings = db.aiSettings;

  const geminiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY;
  const grokKey = settings.grokApiKey || process.env.GROK_API_KEY;

  const preference = settings.modelPreference || 'auto';
  const enableGemini = settings.enableGemini !== false;
  const enableGrok = settings.enableGrok !== false;

  // Determine try order
  let tryGeminiFirst = true;
  if (preference === 'grok_first') {
    tryGeminiFirst = false;
  }

  const attemptGemini = async (): Promise<string | null> => {
    if (!enableGemini) return null;
    const ai = getGeminiClient(geminiKey);
    if (!ai) return null;
    try {
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

  const attemptGrok = async (): Promise<string | null> => {
    if (!enableGrok) return null;
    return await callGrokApi(prompt, grokKey);
  };

  if (tryGeminiFirst) {
    const geminiResult = await attemptGemini();
    if (geminiResult) return { text: geminiResult, modelUsed: 'gemini' };

    console.log('[AI Fallback] Gemini unavailable or failed. Falling back to Grok...');
    const grokResult = await attemptGrok();
    if (grokResult) return { text: grokResult, modelUsed: 'grok' };
  } else {
    const grokResult = await attemptGrok();
    if (grokResult) return { text: grokResult, modelUsed: 'grok' };

    console.log('[AI Fallback] Grok unavailable or failed. Falling back to Gemini...');
    const geminiResult = await attemptGemini();
    if (geminiResult) return { text: geminiResult, modelUsed: 'gemini' };
  }

  return null;
}

// Execute AI Monitoring Check (Limited strictly to 50 checks/day)
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
  let modelUsed: 'gemini' | 'grok' = 'gemini';

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
    const telegramMsg = `<b>${headline}</b>\n\n${messageText}\n\n<i>🤖 Powered by ${modelUsed === 'gemini' ? 'Google Gemini' : 'Grok AI'} (Check ${db.aiMeta.checksUsedToday}/${limit} used today)</i>`;
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

  return {
    success: true,
    message: `AI Check completed using ${modelUsed === 'gemini' ? 'Google Gemini' : 'Grok'}. (${db.aiMeta.checksUsedToday}/${limit} daily checks used).`,
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

Top Reels by Views: ${topReels.map(r => `${r.name} (${r.views.toLocaleString()} views)`).join(', ')}
Top 24h Gainers: ${topGainers.map(r => `${r.name} (+${(r.growth24h || 0).toLocaleString()} views)`).join(', ')}

Format in crisp Markdown with emojis. Keep under 200 words.`;

  const aiResult = await generateAiInsight(prompt);
  const reportContent = aiResult?.text || `📊 <b>Daily Reel Performance Summary</b>\n\n• Total Reels: ${db.reels.length}\n• Total Views: ${totalViews.toLocaleString()}\n• 24h Growth: +${total24hGain.toLocaleString()} views\n\n<b>Top Performer:</b> ${topReels[0]?.name || 'N/A'} (${topReels[0]?.views.toLocaleString()} views)`;

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
