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
      console.log('[AI] Calling Google Gemini 2.5 Flash...');
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
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

  if (db.reels.filter(r => r.category !== 'archived' && r.category !== 'paid').length === 0) {
    return { success: false, message: 'No reels saved in database to analyze.' };
  }

  // Increment usage counter FIRST
  db.aiMeta.checksUsedToday += 1;
  db.aiMeta.lastAiAnalysisAt = new Date().toISOString();
  saveDb(db);

  // Prepare structured performance data for AI
  const reelsSummary = db.reels.filter(r => r.category !== 'archived' && r.category !== 'paid').map((r) => {
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

  const totalViews = db.reels.filter(r => r.category !== 'archived' && r.category !== 'paid').reduce((acc, r) => acc + (r.views || 0), 0);
  const total24hGain = db.reels.filter(r => r.category !== 'archived' && r.category !== 'paid').reduce((acc, r) => acc + (r.growth24h || 0), 0);

  const prompt = `Analyze these Instagram Reels performance statistics and generate 1-2 punchy, highly relevant insights or alerts.
Sensitivity setting: ${db.aiSettings.alertSensitivity || 'medium'}.
Total Reels: ${db.reels.filter(r => r.category !== 'archived' && r.category !== 'paid').length} | Total Views: ${totalViews} | 24h Total Gain: +${total24hGain} views.

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
  let messageText = `Analyzed ${db.reels.filter(r => r.category !== 'archived' && r.category !== 'paid').length} reels (${totalViews.toLocaleString()} total views, +${total24hGain.toLocaleString()} 24h gain).`;
  let type: AiLog['type'] = isManualTrigger ? 'manual_audit' : 'viral';
  let reelName: string | undefined = undefined;
  let modelUsed: 'gemini' | 'groq' | 'grok' = 'groq';

  if (aiResult) {
    modelUsed = aiResult.modelUsed;
    db.aiMeta.activeModelUsed = modelUsed;
    
    // Extract JSON block cleanly using regex to eliminate any leading text/numbering
    const jsonMatch = aiResult.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.headline) headline = parsed.headline;
        if (parsed.message) messageText = parsed.message;
        if (parsed.type) type = parsed.type;
        if (parsed.reelName) reelName = parsed.reelName;
      } catch (e) {
        messageText = aiResult.text.replace(/```[a-z]*/gi, '').replace(/```/g, '').trim();
      }
    } else {
      messageText = aiResult.text.replace(/```[a-z]*/gi, '').replace(/```/g, '').trim();
    }
  }

  // Check if we should notify Telegram
  let sentToTelegram = false;
  if (db.telegram.enabled && db.telegram.botToken && db.telegram.adminTelegramId) {
    const modelLabel = modelUsed === 'groq' ? 'Groq Llama-3.3' : modelUsed === 'gemini' ? 'Google Gemini' : 'Grok AI';
    const telegramMsg = `🔥 <b>${headline}</b>\n\n${messageText}\n\n<i>🤖 Powered by ${modelLabel} (Check ${db.aiMeta.checksUsedToday}/${limit} used today)</i>`;
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
  if (db.reels.filter(r => r.category !== 'archived' && r.category !== 'paid').length === 0) {
    return { success: false, reportText: 'No reels saved to generate daily report.' };
  }

  const totalViews = db.reels.filter(r => r.category !== 'archived' && r.category !== 'paid').reduce((sum, r) => sum + (r.views || 0), 0);
  const totalLikes = db.reels.filter(r => r.category !== 'archived' && r.category !== 'paid').reduce((sum, r) => sum + (r.likes || 0), 0);
  const total24hGain = db.reels.filter(r => r.category !== 'archived' && r.category !== 'paid').reduce((sum, r) => sum + (r.growth24h || 0), 0);

  const topReels = [...db.reels.filter(r => r.category !== 'archived' && r.category !== 'paid')].sort((a, b) => b.views - a.views).slice(0, 3);
  const topGainers = [...db.reels.filter(r => r.category !== 'archived' && r.category !== 'paid')].sort((a, b) => (b.growth24h || 0) - (a.growth24h || 0)).slice(0, 3);

  const prompt = `Generate a daily executive performance summary report for an Instagram Reel Command Center.
Stats:
- Total Reels: ${db.reels.filter(r => r.category !== 'archived' && r.category !== 'paid').length}
- Total Views: ${totalViews.toLocaleString()}
- Total Likes: ${totalLikes.toLocaleString()}
- 24h Growth: +${total24hGain.toLocaleString()} views

Top Reels by Views: ${topReels.map((r) => `${r.name} (${r.views.toLocaleString()} views)`).join(', ')}
Top 24h Gainers: ${topGainers.map((r) => `${r.name} (+${(r.growth24h || 0).toLocaleString()} views)`).join(', ')}

Format in crisp Markdown with emojis. Keep under 200 words.`;

  const aiResult = await generateAiInsight(prompt);
  const reportContent =
    aiResult?.text ||
    `📊 <b>Daily Reel Performance Summary</b>\n\n• Total Reels: ${db.reels.filter(r => r.category !== 'archived' && r.category !== 'paid').length}\n• Total Views: ${totalViews.toLocaleString()}\n• 24h Growth: +${total24hGain.toLocaleString()} views\n\n<b>Top Performer:</b> ${topReels[0]?.name || 'N/A'} (${topReels[0]?.views.toLocaleString()} views)`;

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

// Generate Exciting Natural-Language AI Telegram Message for CPM Campaign Updates
export async function generateAiCpmTelegramMessage(
  reelName: string,
  campaignName: string,
  views: number,
  cpmEarnings: number,
  estimatedPayout: number,
  fee3Percent: number
): Promise<string> {
  const prompt = `Generate an exciting, natural-language creator update message for a Telegram bot update.

EXACT PRE-CALCULATED DATA (DO NOT CHANGE OR RECALCULATE ANY NUMBERS):
- Campaign Name: ${campaignName}
- Reel Name: ${reelName}
- Current Views: ${views.toLocaleString()}
- Total CPM Earnings (before 8% fee): $${cpmEarnings.toFixed(2)}
- 8% Processing Fee: $${fee3Percent.toFixed(2)}
- Estimated Payout (after 8% fee): $${estimatedPayout.toFixed(2)}

INSTRUCTIONS:
1. Write a hyped, energetic, natural message (e.g., starting with "🚀 YOOO! ${campaignName} is moving! 🔥" or "🔥 Huge update for ${campaignName}!").
2. Include ALL of these items clearly:
   - Campaign Name: ${campaignName}
   - Current Views: ${views.toLocaleString()}
   - CPM Earnings: $${cpmEarnings.toFixed(2)}
   - Estimated Payout: $${estimatedPayout.toFixed(2)} (explicitly mentioning it is after the 8% fee)
3. Do NOT invent or recalculate any numbers. Use ONLY the exact numbers provided.
4. Keep it under 5 sentences, using appropriate creator emojis (🔥, 🚀, 👀, 💰, 📈).
5. Do NOT use markdown code blocks or json wrappers. Return raw plain text.`;

  const aiResult = await generateAiInsight(prompt);
  if (aiResult?.text && aiResult.text.trim().length > 10) {
    return aiResult.text.trim();
  }

  // Fallback energetic message if AI model call is disabled/fails
  return `🚀 YOOO! ${campaignName} is moving! 🔥
That Reel '${reelName}' just hit ${views.toLocaleString()} views! 👀
You're sitting at $${cpmEarnings.toFixed(2)} CPM earnings, which puts your estimated payout at $${estimatedPayout.toFixed(2)} after the 8% fee. 💰
Let's keep it climbing! 📈`;
}

import { generateTwoWordTitleFromCaption } from './statsHelper.js';

// Chat interactively with the AI model about posts, performance, ideas, and CPM
export async function talkToAi(userQuestion: string): Promise<string> {
  const db = loadDb();
  const reelsSummary = db.reels.filter(r => r.category !== 'archived' && r.category !== 'paid').map(r => ({
    name: r.name,
    views: r.views,
    growth24h: r.growth24h || 0,
    cpmEarnings: r.cpmEarnings || 0,
    estimatedPayout: r.estimatedPayout || 0,
    status: r.status,
  }));

  const totalViews = db.reels.filter(r => r.category !== 'archived' && r.category !== 'paid').reduce((sum, r) => sum + (r.views || 0), 0);
  const totalPayout = db.reels.filter(r => r.category !== 'archived' && r.category !== 'paid').reduce((sum, r) => sum + (r.estimatedPayout || 0), 0);

  const prompt = `You are an elite Instagram Reels AI Strategist & Analytics Brain chatting directly with the content creator on Telegram.
User Question: "${userQuestion}"

Creator's Reel Database Context:
- Total Saved Reels: ${db.reels.filter(r => r.category !== 'archived' && r.category !== 'paid').length}
- Total Lifetime Views: ${totalViews.toLocaleString()}
- Total Estimated Payout: $${totalPayout.toFixed(2)}
- Reel Performance List:
${JSON.stringify(reelsSummary, null, 2)}

Instructions:
1. Provide a direct, professional, exciting, helpful, concise answer (under 250 words).
2. Refer to specific reels by name and exact view counts if relevant.
3. Use emojis, bold titles, bullet points, and actionable creator tips.
4. Do NOT output raw JSON or codeblocks. Output clean Telegram HTML formatted text (<b>bold</b>, <i>italic</i>, bullet points).`;

  const aiResult = await generateAiInsight(prompt);
  if (aiResult && aiResult.text) {
    return aiResult.text.replace(/```[a-z]*/gi, '').replace(/```/g, '').trim();
  }

  return `📊 <b>AI Analysis:</b>\nCurrently tracking ${db.reels.filter(r => r.category !== 'archived' && r.category !== 'paid').length} reels with ${totalViews.toLocaleString()} views and $${totalPayout.toFixed(2)} total net payout. Ask me any question about your reels growth or strategy!`;
}

// Generate Groq AI 2-Word Title from caption
export async function generateGroqTitle(caption: string): Promise<string> {
  if (!caption || caption.trim().length === 0) return 'Viral Reel';

  const prompt = `Generate a catchy, punchy, maximum 2-word title (e.g. "Viral Surge", "Fitness Grind", "Crypto Spike", "Daily Focus") based on this Instagram reel caption: "${caption.slice(0, 500)}".

INSTRUCTIONS:
- Maximum 2 words.
- Return ONLY the 2 words, no punctuation, no quotes, no extra conversational filler.`;

  const result = await callGroqApi(prompt);
  if (result.text) {
    const cleanText = result.text
      .replace(/["'`.!?:;,]/g, '')
      .replace(/\n/g, ' ')
      .trim();
    const words = cleanText.split(/\s+/).filter(w => w.length > 0);
    if (words.length >= 1) {
      return words.slice(0, 2).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    }
  }

  return generateTwoWordTitleFromCaption(caption);
}

