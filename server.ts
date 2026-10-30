import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
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

interface SessionFallbackBody {
  businessOwnerId?: string;
  visitId?: string;
  rating?: number;
  language?: 'English' | 'Hindi' | 'Hinglish';
  usedOptionalPrompts?: boolean;
  stage?: 'draft_generated' | 'copied_review' | 'opened_google';
}

interface SignupBody {
  email?: string;
  password?: string;
  fullName?: string;
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

const SUPABASE_URL =
  process.env.SUPABASE_URL?.trim() ||
  process.env.VITE_SUPABASE_URL?.trim() ||
  'https://qfftaewsktgvwuqoomsn.supabase.co';

const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  'sb_publishable_k1c1nN3jaOqVGhnxqoHIVg_r8qsOnBw';

const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY?.trim() || '';
const SUPABASE_JWKS_URL =
  process.env.SUPABASE_JWKS_URL?.trim() || `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`;

let supabaseServerClient: SupabaseClient | null = null;
function getSupabaseServer(): SupabaseClient | null {
  if (supabaseServerClient) return supabaseServerClient;
  const activeKey = SUPABASE_SECRET_KEY || SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !activeKey) return null;
  supabaseServerClient = createClient(SUPABASE_URL, activeKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return supabaseServerClient;
}

let cachedJwks: { keys: Array<crypto.JsonWebKey & { kid?: string; alg?: string }> } | null = null;
let cachedJwksAt = 0;

async function verifySupabaseJwtViaJwks(token: string): Promise<{ sub: string; email?: string } | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as {
      kid?: string;
      alg?: string;
    };
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      sub?: string;
      email?: string;
      exp?: number;
    };

    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return null;
    }

    if (!cachedJwks || Date.now() - cachedJwksAt > 10 * 60 * 1000) {
      const res = await fetch(SUPABASE_JWKS_URL);
      if (res.ok) {
        cachedJwks = (await res.json()) as {
          keys: Array<crypto.JsonWebKey & { kid?: string; alg?: string }>;
        };
        cachedJwksAt = Date.now();
      }
    }

    const matchingKey = cachedJwks?.keys?.find((k) => !header.kid || k.kid === header.kid);
    if (matchingKey) {
      const pubKey = crypto.createPublicKey({ key: matchingKey, format: 'jwk' });
      const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`);
      const sig = Buffer.from(parts[2], 'base64url');
      const verified =
        header.alg === 'ES256'
          ? crypto.verify('sha256', signingInput, { key: pubKey, dsaEncoding: 'ieee-p1363' }, sig)
          : crypto.verify('RSA-SHA256', signingInput, pubKey, sig);
      if (verified && payload.sub) {
        return { sub: payload.sub, email: payload.email };
      }
    }

    // Fallback to Supabase Auth user lookup
    const sb = getSupabaseServer();
    if (!sb) return null;
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return null;
    return { sub: data.user.id, email: data.user.email };
  } catch {
    return null;
  }
}

function isoToMillis(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val) {
    const parsed = Date.parse(val);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}

function buildSystemInstruction(
  rating: number,
  language: 'English' | 'Hindi' | 'Hinglish'
): string {
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
    'You help real customers draft a concise, authentic first-person Google review based strictly on the details they supplied.',
    sentimentInstruction,
    languageInstruction,
    'Strict Rules:',
    '- Output ONLY the review text itself (2 to 4 natural sentences, roughly 140 to 360 characters).',
    '- Do NOT wrap the review in quotation marks, markdown, titles, star emojis, or hashtags.',
    '- Do NOT invent dishes, staff names, prices, wait times, or experiences that the customer did not mention.',
    '- If optional answers are blank, write a concise, honest general impression matching the star rating without fabricating specifics.',
  ].join('\n');
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use('/api', (req: Request, res: Response, next) => {
    const origin = req.headers.origin;
    if (origin && (origin.startsWith('https://') || origin.startsWith('http://localhost'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: '32kb' }));

  app.get('/api/config/status', (_req: Request, res: Response) => {
    const geminiReady = isGeminiConfigured();
    const openRouterReady = isOpenRouterConfigured();
    res.json({
      liveAiConfigured: geminiReady || openRouterReady,
      activeProvider: geminiReady ? 'gemini' : openRouterReady ? 'openrouter' : 'fallback',
      supabaseConnected: Boolean(SUPABASE_URL),
      appUrl:
        process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
          ? process.env.APP_URL.replace(/\/+$/, '')
          : null,
    });
  });

  // Server-assisted Supabase Auth signup (auto-confirms email when SUPABASE_SECRET_KEY is configured)
  app.post('/api/auth/signup', async (req: Request, res: Response) => {
    if (!SUPABASE_SECRET_KEY) {
      res.status(501).json({ created: false });
      return;
    }
    const body = (req.body ?? {}) as SignupBody;
    const email = (body.email ?? '').trim().toLowerCase();
    const password = body.password ?? '';
    const fullName = (body.fullName ?? '').trim().slice(0, 80);

    if (!email || !email.includes('@') || password.length < 6) {
      res.status(400).json({ created: false, error: 'Valid email and 6+ character password required.' });
      return;
    }

    const sbAdmin = getSupabaseServer();
    if (!sbAdmin) {
      res.status(503).json({ created: false });
      return;
    }

    const { error } = await sbAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName || email.split('@')[0],
      },
    });

    if (error) {
      res.status(400).json({ created: false, error: error.message });
      return;
    }

    res.json({ created: true });
  });

  const FOUNDER_ADMIN_EMAILS = new Set([
    'techgam766@gmail.com',
    'aalamnashim786@gmail.com',
  ]);

  async function verifyAdminRequest(
    req: Request,
    res: Response
  ): Promise<{ sub: string; email: string } | null> {
    const authHeader = req.headers.authorization ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing Authorization Bearer token.' });
      return null;
    }
    const token = authHeader.slice('Bearer '.length).trim();
    const verified = await verifySupabaseJwtViaJwks(token);
    const email = (verified?.email ?? '').toLowerCase();
    if (!verified || !email || !FOUNDER_ADMIN_EMAILS.has(email)) {
      res.status(403).json({ error: 'Founder Admin privileges required.' });
      return null;
    }
    return { sub: verified.sub, email };
  }

  app.get('/api/admin/subscriptions', async (req: Request, res: Response) => {
    const admin = await verifyAdminRequest(req, res);
    if (!admin) return;
    const sb = getSupabaseServer();
    if (!sb) {
      res.status(503).json({ error: 'Supabase server client not configured.' });
      return;
    }
    const { data, error } = await sb
      .from('subscriptions')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(200);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ items: data ?? [] });
  });

  app.get('/api/admin/businesses', async (req: Request, res: Response) => {
    const admin = await verifyAdminRequest(req, res);
    if (!admin) return;
    const sb = getSupabaseServer();
    if (!sb) {
      res.status(503).json({ error: 'Supabase server client not configured.' });
      return;
    }
    const { data, error } = await sb
      .from('businesses')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ items: data ?? [] });
  });

  app.post('/api/admin/billing-config', async (req: Request, res: Response) => {
    const admin = await verifyAdminRequest(req, res);
    if (!admin) return;
    const sb = getSupabaseServer();
    if (!sb) {
      res.status(503).json({ error: 'Supabase server client not configured.' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { error } = await sb.from('platform_settings').upsert(
      {
        id: 'billing',
        upi_id: String(body.upiId ?? '').trim().slice(0, 80),
        payee_name: (String(body.payeeName ?? '').trim() || 'ReviewEase AI').slice(0, 80),
        payment_link_starter: String(body.paymentLinkStarter ?? '').trim().slice(0, 300),
        payment_link_growth: String(body.paymentLinkGrowth ?? '').trim().slice(0, 300),
        payment_link_agency: String(body.paymentLinkAgency ?? '').trim().slice(0, 300),
        support_contact: String(body.supportContact ?? '').trim().slice(0, 80),
        trial_days: Math.max(0, Math.min(30, Math.round(Number(body.trialDays ?? 7)))),
        updated_by_uid: admin.sub,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ ok: true });
  });

  app.post('/api/admin/subscriptions/update', async (req: Request, res: Response) => {
    const admin = await verifyAdminRequest(req, res);
    if (!admin) return;
    const sb = getSupabaseServer();
    if (!sb) {
      res.status(503).json({ error: 'Supabase server client not configured.' });
      return;
    }
    const body = (req.body ?? {}) as {
      userId?: string;
      planId?: string;
      status?: string;
      maxBusinesses?: number;
      currentPeriodEndMs?: number;
    };
    if (!body.userId || !body.planId || !body.status || !body.currentPeriodEndMs) {
      res.status(400).json({ error: 'Missing required subscription update fields.' });
      return;
    }

    const { error } = await sb
      .from('subscriptions')
      .update({
        plan_id: body.planId,
        status: body.status,
        max_businesses: Number(body.maxBusinesses ?? 1),
        current_period_end_ms: Number(body.currentPeriodEndMs),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', body.userId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const shouldBeActive = body.status === 'active' || body.status === 'trialing';
    await sb
      .from('businesses')
      .update({
        plan_id: body.planId,
        subscription_ends_at_ms: Number(body.currentPeriodEndMs),
        is_active: shouldBeActive,
        updated_at: new Date().toISOString(),
      })
      .eq('owner_id', body.userId);

    res.json({ ok: true });
  });

  // Authenticated JWT verification health route via SUPABASE_JWKS_URL
  app.get('/api/auth/me', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ authenticated: false });
      return;
    }
    const verified = await verifySupabaseJwtViaJwks(authHeader.slice(7));
    if (!verified) {
      res.status(401).json({ authenticated: false });
      return;
    }
    res.json({ authenticated: true, user: verified });
  });

  // Same-origin fallback for public QR scan resolution via Supabase
  app.get('/api/public/businesses/:slug', async (req: Request, res: Response) => {
    const slug = String(req.params.slug ?? '')
      .toLowerCase()
      .trim();
    if (!slug || slug === 'demo' || slug.length < 2 || slug.length > 60 || !/^[a-z0-9-]+$/.test(slug)) {
      res.status(404).json({ found: false });
      return;
    }

    const sb = getSupabaseServer();
    if (!sb) {
      res.status(503).json({ found: false });
      return;
    }

    try {
      const { data, error } = await sb
        .from('businesses')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle();

      if (error || !data) {
        res.status(404).json({ found: false });
        return;
      }

      const row = data as Record<string, unknown>;
      res.json({
        found: true,
        business: {
          name: String(row.name ?? ''),
          category: String(row.category ?? ''),
          slug: String(row.slug ?? slug),
          locationLabel: String(row.location_label ?? ''),
          googleReviewUrl: String(row.google_review_url ?? ''),
          ownerId: String(row.owner_id ?? ''),
          isActive: Boolean(row.is_active),
          planId: row.plan_id ? String(row.plan_id) : undefined,
          subscriptionEndsAtMs:
            row.subscription_ends_at_ms !== null && row.subscription_ends_at_ms !== undefined
              ? Number(row.subscription_ends_at_ms)
              : undefined,
          createdAtMs: isoToMillis(row.created_at),
          updatedAtMs: isoToMillis(row.updated_at),
        },
      });
    } catch {
      res.status(404).json({ found: false });
    }
  });

  // Same-origin fallback for anonymous customer QR telemetry via Supabase
  app.post('/api/public/businesses/:slug/sessions', async (req: Request, res: Response) => {
    const slug = String(req.params.slug ?? '')
      .toLowerCase()
      .trim();
    const body = (req.body ?? {}) as SessionFallbackBody;
    const sb = getSupabaseServer();

    if (
      !sb ||
      !slug ||
      slug === 'demo' ||
      !/^[a-z0-9-]+$/.test(slug) ||
      !body.businessOwnerId ||
      !body.visitId ||
      !Number.isInteger(body.rating) ||
      (body.rating ?? 0) < 1 ||
      (body.rating ?? 0) > 5 ||
      !['English', 'Hindi', 'Hinglish'].includes(body.language ?? '') ||
      !['draft_generated', 'copied_review', 'opened_google'].includes(body.stage ?? '')
    ) {
      res.status(400).json({ ok: false });
      return;
    }

    const suffix = Math.random().toString(36).slice(2, 7);
    const cleanVisitId = body.visitId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
    const sessionId = `${cleanVisitId}_${body.stage}_${suffix}`.slice(0, 96);

    try {
      const { error } = await sb.from('review_sessions').insert({
        id: sessionId,
        business_slug: slug,
        business_owner_id: String(body.businessOwnerId).slice(0, 64),
        visit_id: cleanVisitId,
        rating: Number(body.rating),
        language: body.language,
        used_optional_prompts: Boolean(body.usedOptionalPrompts),
        stage: body.stage,
      });
      if (error) {
        res.status(403).json({ ok: false });
        return;
      }
      res.json({ ok: true });
    } catch {
      res.status(403).json({ ok: false });
    }
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
      `Customer Star Rating: ${rating} out of 5`,
      `Target Language: ${language}`,
      `Primary customer note: ${primaryAnswer || '(Skipped by customer)'}`,
      `Secondary customer note: ${secondaryAnswer || '(Skipped by customer)'}`,
      `Draft variation number: ${variationSeed + 1}`,
    ].filter(Boolean);

    const userPrompt = promptLines.join('\n');

    const ai = getGeminiClient();
    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: userPrompt,
          config: {
            systemInstruction,
            temperature: 0.65,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        });

        const text = response.text?.trim().replace(/^["“”]+|["“”]+$/g, '');
        if (text) {
          res.json({ review: text, source: 'gemini' });
          return;
        }
      } catch (err) {
        console.error('Gemini review generation error:', err);
      }
    }

    if (isOpenRouterConfigured()) {
      const apiKey = process.env.OPENROUTER_API_KEY!.trim();
      const model = process.env.OPENROUTER_MODEL?.trim() || 'openai/gpt-4o-mini';

      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
            'X-Title': 'ReviewEase AI',
          },
          body: JSON.stringify({
            model,
            temperature: 0.65,
            max_tokens: 220,
            messages: [
              { role: 'system', content: systemInstruction },
              { role: 'user', content: userPrompt },
            ],
          }),
        });

        if (response.ok) {
          const data = (await response.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const rawReview = data.choices?.[0]?.message?.content?.trim();
          if (rawReview) {
            const cleaned = rawReview.replace(/^["“”]+|["“”]+$/g, '').trim();
            res.json({ review: cleaned, source: 'openrouter' });
            return;
          }
        }
      } catch (err) {
        console.error('OpenRouter request failed:', err);
      }
    }

    res.status(503).json({
      configured: false,
      message: 'No live AI provider responded; using deterministic local fallback.',
    });
  });

  const distPath = path.join(__dirname, 'dist');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distPath);

  if (isProd) {
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ReviewEase AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ReviewEase AI server:', err);
  process.exit(1);
});
