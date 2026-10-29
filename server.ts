import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import dotenv from 'dotenv';
import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface GenerateReviewBody {
  businessName?: string;
  category?: string;
  locationLabel?: string;
  rating?: number;
  language?: 'English' | 'Hindi' | 'Hinglish';
  primaryAnswer?: string;
  secondaryAnswer?: string;
  variationSeed?: number;
}

function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key !== 'MY_GEMINI_API_KEY' && key.length > 8);
}

function isOpenRouterConfigured(): boolean {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  return Boolean(key && key !== 'MY_OPENROUTER_API_KEY' && key.length > 8);
}

let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!isGeminiConfigured()) return null;
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY?.trim(),
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiClient;
}

function buildSystemInstruction(rating: number, language: 'English' | 'Hindi' | 'Hinglish'): string {
  const sentimentInstruction =
    rating >= 4
      ? `The customer selected ${rating} out of 5 stars. Write in a genuinely warm, appreciative, natural tone without exaggerated advertising clichés or robotic buzzwords.`
      : rating === 3
        ? 'The customer selected 3 out of 5 stars (neutral/mixed). Write in a fair, balanced, matter-of-fact tone acknowledging both what worked and what can improve.'
        : `The customer selected ${rating} out of 5 stars (dissatisfied). Write in an honest, candid, constructive tone reflecting their frustration or disappointment. NEVER turn negative feedback into praise or soften complaints into compliments.`;

  const languageInstruction =
    language === 'Hindi'
      ? 'Write the entire review in natural, everyday conversational Hindi using Devanagari script (हिन्दी).'
      : language === 'Hinglish'
        ? 'Write the entire review in natural, everyday urban Hinglish (conversational Hindi in Roman alphabet blended naturally with English words, the way people actually write reviews in India).'
        : 'Write the entire review in clear, natural, everyday English.';

  return [
    'You help real customers draft a concise, authentic first-person Google review (2 to 4 short sentences, around 25 to 65 words).',
    sentimentInstruction,
    languageInstruction,
    'STRICT GROUNDING RULE: Base the review strictly on the business name, rating, and actual notes supplied by the customer.',
    'If the customer skipped optional notes, write a brief, natural general review matching their star rating without inventing any specific menu items, treatments, staff names, prices, or events.',
    'Output ONLY the plain review text. Do not include quotation marks, star emojis, titles, hashtags, or explanations.',
  ].join(' ');
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '32kb' }));

  app.get('/api/config/status', (_req: Request, res: Response) => {
    const geminiReady = isGeminiConfigured();
    const openRouterReady = isOpenRouterConfigured();
    res.json({
      liveAiConfigured: geminiReady || openRouterReady,
      activeProvider: geminiReady ? 'gemini' : openRouterReady ? 'openrouter' : 'fallback',
      appUrl:
        process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
          ? process.env.APP_URL.replace(/\/+$/, '')
          : null,
    });
  });

  app.post('/api/reviews/generate', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as GenerateReviewBody;
    const businessName = (body.businessName ?? 'Local Business').trim().slice(0, 100);
    const category = (body.category ?? 'Business').trim().slice(0, 80);
    const locationLabel = (body.locationLabel ?? '').trim().slice(0, 80);
    const rating = Number(body.rating);
    const language = body.language ?? 'English';
    const primaryAnswer = (body.primaryAnswer ?? '').trim().slice(0, 400);
    const secondaryAnswer = (body.secondaryAnswer ?? '').trim().slice(0, 400);
    const variationSeed = Number(body.variationSeed ?? 0);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      res.status(400).json({ error: 'Rating must be an integer from 1 to 5.' });
      return;
    }

    if (!['English', 'Hindi', 'Hinglish'].includes(language)) {
      res.status(400).json({ error: 'Unsupported language selection.' });
      return;
    }

    const systemInstruction = buildSystemInstruction(rating, language);
    const promptLines = [
      `Business Name: ${businessName}`,
      `Category: ${category}`,
      locationLabel ? `Location: ${locationLabel}` : null,
      `Selected Star Rating: ${rating} / 5`,
      primaryAnswer
        ? `Customer Note 1: ${primaryAnswer}`
        : 'Customer Note 1: (Customer skipped this optional question)',
      secondaryAnswer
        ? `Customer Note 2: ${secondaryAnswer}`
        : 'Customer Note 2: (Customer skipped this optional question)',
      variationSeed > 0
        ? `Phrasing Variation Request #${variationSeed}: Use a fresh sentence structure and opening different from standard templates.`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    // Primary Live Engine: Server-side Gemini API (@google/genai)
    const ai = getGeminiClient();
    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: promptLines,
          config: {
            systemInstruction,
            temperature: variationSeed > 0 ? 0.85 : 0.65,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        });

        const generatedText = response.text?.trim();
        if (generatedText) {
          res.json({
            review: generatedText.replace(/^["'“”]+|["'“”]+$/g, '').trim(),
            provider: 'gemini',
          });
          return;
        }
      } catch (err) {
        console.error('Gemini generation error:', err instanceof Error ? err.message : err);
        if (!isOpenRouterConfigured()) {
          res.status(502).json({
            error:
              err instanceof Error
                ? err.message
                : 'Live AI generation encountered a temporary error.',
          });
          return;
        }
      }
    }

    // Secondary Live Engine: Server-side OpenRouter if configured
    if (isOpenRouterConfigured()) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY?.trim()}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
            'X-Title': 'ReviewEase AI',
          },
          body: JSON.stringify({
            model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
            temperature: variationSeed > 0 ? 0.85 : 0.65,
            max_tokens: 220,
            messages: [
              { role: 'system', content: systemInstruction },
              { role: 'user', content: promptLines },
            ],
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          res.status(502).json({
            error: 'Upstream OpenRouter request failed.',
            details: errorText.slice(0, 200),
          });
          return;
        }

        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const generatedText = data.choices?.[0]?.message?.content?.trim();

        if (generatedText) {
          res.json({
            review: generatedText.replace(/^["'“”]+|["'“”]+$/g, '').trim(),
            provider: 'openrouter',
          });
          return;
        }
      } catch (error) {
        res.status(500).json({
          error:
            error instanceof Error
              ? error.message
              : 'Unexpected server error while generating review.',
        });
        return;
      }
    }

    res.status(503).json({
      configured: false,
      message: 'No server AI key configured; falling back to local template mode.',
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ReviewEase AI production-ready server listening at http://0.0.0.0:${PORT}`);
  });
}

startServer();
