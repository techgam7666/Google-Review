import {
  getMaxBusinessesForPlan,
  getPlanPriceInr,
} from '../data/subscriptionPlans';
import { isMissingSupabaseTableError, supabase } from '../lib/supabase';
import type {
  BillingCycle,
  MerchantSubscriptionRecord,
  PaidPlanId,
  PlatformBillingConfigRecord,
  RealBusinessRecord,
  RealSessionEventRecord,
  ReviewLanguage,
  SessionStage,
  SubscriptionPlanId,
  SubscriptionStatus,
} from '../types/review';

export type Unsubscribe = () => void;

export const BUSINESS_MAX_NAME = 80;
export const BUSINESS_MAX_CATEGORY = 60;
export const BUSINESS_MIN_SLUG = 2;
export const BUSINESS_MAX_SLUG = 60;
export const BUSINESS_MAX_LOCATION = 80;
export const BUSINESS_MIN_URL = 10;
export const BUSINESS_MAX_URL = 500;
const SLUG_REGEX = /^[a-z0-9-]+$/;
const URL_REGEX = /^https?:\/\/.+/;

export const SUPABASE_SCHEMA_MISSING_CODE = 'SUPABASE_SCHEMA_MISSING';

export const DEFAULT_BILLING_CONFIG: PlatformBillingConfigRecord = {
  upiId: '',
  payeeName: 'ReviewEase AI',
  paymentLinkStarter: '',
  paymentLinkGrowth: '',
  paymentLinkAgency: '',
  supportContact: '',
  trialDays: 7,
  updatedByUid: '',
  updatedAtMs: 0,
};

function makeSchemaMissingError(): Error {
  const err = new Error(
    'Supabase database tables have not been initialized yet. Run the 1-click SQL setup above in your Supabase SQL Editor.'
  );
  (err as Error & { code?: string }).code = SUPABASE_SCHEMA_MISSING_CODE;
  return err;
}

export function isSupabaseSchemaMissing(error: unknown): boolean {
  if (!error) return false;
  if ((error as { code?: string })?.code === SUPABASE_SCHEMA_MISSING_CODE) return true;
  return isMissingSupabaseTableError(error);
}

export async function verifySupabaseSchemaReady(): Promise<boolean> {
  const { error } = await supabase.from('businesses').select('slug').limit(1);
  if (error && isMissingSupabaseTableError(error)) {
    return false;
  }
  return !error;
}

export function normalizeMerchantSlug(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, BUSINESS_MAX_SLUG)
    .replace(/-$/g, '');
  return cleaned;
}

export function validateMerchantSlug(slug: string): string | null {
  if (slug === 'demo') {
    return 'The slug "demo" is reserved. Choose your shop name instead.';
  }
  if (slug.length < BUSINESS_MIN_SLUG || slug.length > BUSINESS_MAX_SLUG) {
    return `URL slug must be between ${BUSINESS_MIN_SLUG} and ${BUSINESS_MAX_SLUG} characters.`;
  }
  if (!SLUG_REGEX.test(slug)) {
    return 'Slug can only contain lowercase letters, numbers, and hyphens.';
  }
  return null;
}

export function extractOrNormalizeGoogleUrl(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return '';

  const embeddedMatch = trimmed.match(/https?:\/\/[^\s"'<>]+/i);
  if (embeddedMatch && embeddedMatch[0]) {
    return embeddedMatch[0].replace(/[.,;)]+$/, '').slice(0, BUSINESS_MAX_URL);
  }

  if (
    /^(maps\.app\.goo\.gl|goo\.gl\/maps|g\.page|g\.co|(www\.)?google\.[a-z.]+\/maps|search\.google\.com)/i.test(
      trimmed
    )
  ) {
    return `https://${trimmed}`.slice(0, BUSINESS_MAX_URL);
  }

  if (!trimmed.includes(' ') && /^[a-z0-9.-]+\.[a-z]{2,}\/.+/i.test(trimmed)) {
    return `https://${trimmed}`.slice(0, BUSINESS_MAX_URL);
  }

  return trimmed.slice(0, BUSINESS_MAX_URL);
}

export function buildGoogleMapsFallbackUrl(shopName: string, locationLabel?: string): string {
  const queryText = [shopName.trim(), locationLabel?.trim()].filter(Boolean).join(', ');
  if (!queryText) {
    return 'https://www.google.com/maps';
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryText)}`.slice(
    0,
    BUSINESS_MAX_URL
  );
}

export function validateGoogleReviewUrl(url: string): string | null {
  const normalized = extractOrNormalizeGoogleUrl(url);
  if (normalized.length < BUSINESS_MIN_URL || normalized.length > BUSINESS_MAX_URL) {
    return 'Please paste your Google Maps link (or click "Generate Link from Shop Name").';
  }
  if (!URL_REGEX.test(normalized)) {
    return 'Link must start with https:// or http:// (or paste any Google Maps share link).';
  }
  try {
    new URL(normalized);
    return null;
  } catch {
    return 'Please enter a valid Google Maps or Google Business URL.';
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

function mapRowToBusiness(row: Record<string, unknown>): RealBusinessRecord {
  return {
    name: String(row.name ?? ''),
    category: String(row.category ?? ''),
    slug: String(row.slug ?? ''),
    locationLabel: String(row.location_label ?? ''),
    googleReviewUrl: String(row.google_review_url ?? ''),
    ownerId: String(row.owner_id ?? ''),
    isActive: Boolean(row.is_active),
    planId: row.plan_id ? (String(row.plan_id) as SubscriptionPlanId) : undefined,
    subscriptionEndsAtMs:
      row.subscription_ends_at_ms !== null && row.subscription_ends_at_ms !== undefined
        ? Number(row.subscription_ends_at_ms)
        : undefined,
    createdAtMs: isoToMillis(row.created_at),
    updatedAtMs: isoToMillis(row.updated_at),
  };
}

function mapRowToSubscription(row: Record<string, unknown>): MerchantSubscriptionRecord {
  const planId = (row.plan_id as SubscriptionPlanId) ?? 'starter';
  return {
    userId: String(row.user_id ?? ''),
    accountLabel: String(row.account_label ?? 'Merchant Account'),
    planId,
    billingCycle: (row.billing_cycle as BillingCycle) ?? 'monthly',
    status: (row.status as SubscriptionStatus) ?? 'active',
    maxBusinesses: Number(row.max_businesses ?? getMaxBusinessesForPlan(planId)),
    priceInr: Number(row.price_inr ?? 0),
    paymentReference: String(row.payment_reference ?? ''),
    currentPeriodEndMs: Number(row.current_period_end_ms ?? Date.now()),
    createdAtMs: isoToMillis(row.created_at),
    updatedAtMs: isoToMillis(row.updated_at),
  };
}

async function requireAuthenticatedUser(): Promise<{ id: string; email: string | null; name: string | null }> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error('Please sign in to your merchant account first.');
  }
  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  const name =
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta.name === 'string' && meta.name.trim()) ||
    null;
  return {
    id: data.user.id,
    email: data.user.email ?? null,
    name,
  };
}

// ============================================================================
// SaaS Subscription & Billing Config Services (Supabase PostgreSQL)
// ============================================================================

export function subscribeMerchantSubscription(
  userId: string,
  onSubscription: (sub: MerchantSubscriptionRecord | null) => void,
  onErrorCallback?: (err: Error) => void
): Unsubscribe {
  let cancelled = false;

  const fetchSub = async () => {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (cancelled) return;
    if (error) {
      if (isMissingSupabaseTableError(error)) {
        onErrorCallback?.(makeSchemaMissingError());
        return;
      }
      onErrorCallback?.(new Error(error.message));
      return;
    }

    onSubscription(data ? mapRowToSubscription(data as Record<string, unknown>) : null);
  };

  void fetchSub();

  const channel = supabase
    .channel(`sub_${userId}_${Math.random().toString(36).slice(2, 7)}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'subscriptions',
        filter: `user_id=eq.${userId}`,
      },
      () => {
        void fetchSub();
      }
    )
    .subscribe();

  return () => {
    cancelled = true;
    void supabase.removeChannel(channel);
  };
}

export async function activateOrUpdateMerchantSubscription(params: {
  accountLabel: string;
  planId: SubscriptionPlanId;
  billingCycle: BillingCycle;
  paymentReference: string;
  trialDays?: number;
}): Promise<MerchantSubscriptionRecord> {
  const currentUser = await requireAuthenticatedUser();
  const userId = currentUser.id;

  const cleanAccountLabel = (
    params.accountLabel.trim() ||
    currentUser.name ||
    currentUser.email?.split('@')[0] ||
    'Merchant Shop'
  ).slice(0, 80);

  const isTrial = params.planId === 'trial';
  const maxBusinesses = getMaxBusinessesForPlan(params.planId);
  const priceInr = isTrial
    ? 0
    : getPlanPriceInr(params.planId as PaidPlanId, params.billingCycle);
  const status: SubscriptionStatus = isTrial ? 'trialing' : 'active';

  const durationDays = isTrial
    ? Math.max(1, Math.min(30, params.trialDays ?? 7))
    : params.billingCycle === 'annual'
      ? 365
      : 30;
  const currentPeriodEndMs = Date.now() + durationDays * 24 * 60 * 60 * 1000;
  const cleanRef = (
    isTrial ? 'FREE_TRIAL' : params.paymentReference.trim() || 'SELF_ACTIVATED'
  ).slice(0, 80);

  const { data, error } = await supabase
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        account_label: cleanAccountLabel,
        plan_id: params.planId,
        billing_cycle: params.billingCycle,
        status,
        max_businesses: maxBusinesses,
        price_inr: priceInr,
        payment_reference: cleanRef,
        current_period_end_ms: currentPeriodEndMs,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select('*')
    .single();

  if (error) {
    if (isMissingSupabaseTableError(error)) {
      throw makeSchemaMissingError();
    }
    throw new Error(error.message);
  }

  // Sync updated subscription expiry onto all shops owned by this merchant
  await supabase
    .from('businesses')
    .update({
      plan_id: params.planId,
      subscription_ends_at_ms: currentPeriodEndMs,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq('owner_id', userId);

  return mapRowToSubscription(data as Record<string, unknown>);
}

export async function fetchPlatformBillingConfig(): Promise<PlatformBillingConfigRecord> {
  const { data, error } = await supabase
    .from('platform_settings')
    .select('*')
    .eq('id', 'billing')
    .maybeSingle();

  if (error || !data) {
    return DEFAULT_BILLING_CONFIG;
  }

  const row = data as Record<string, unknown>;
  return {
    upiId: String(row.upi_id ?? ''),
    payeeName: String(row.payee_name ?? 'ReviewEase AI'),
    paymentLinkStarter: String(row.payment_link_starter ?? ''),
    paymentLinkGrowth: String(row.payment_link_growth ?? ''),
    paymentLinkAgency: String(row.payment_link_agency ?? ''),
    supportContact: String(row.support_contact ?? ''),
    trialDays: Number(row.trial_days ?? 7),
    updatedByUid: String(row.updated_by_uid ?? ''),
    updatedAtMs: isoToMillis(row.updated_at),
  };
}

export async function savePlatformBillingConfig(input: {
  upiId: string;
  payeeName: string;
  paymentLinkStarter: string;
  paymentLinkGrowth: string;
  paymentLinkAgency: string;
  supportContact: string;
  trialDays: number;
}): Promise<void> {
  const currentUser = await requireAuthenticatedUser();

  const cleanOptionalUrl = (raw: string) => {
    const t = raw.trim().slice(0, 300);
    if (!t) return '';
    if (!/^https?:\/\/.+/i.test(t)) {
      throw new Error(`Payment link "${t}" must start with https://`);
    }
    return t;
  };

  const { error } = await supabase.from('platform_settings').upsert(
    {
      id: 'billing',
      upi_id: input.upiId.trim().slice(0, 80),
      payee_name: (input.payeeName.trim() || 'ReviewEase AI').slice(0, 80),
      payment_link_starter: cleanOptionalUrl(input.paymentLinkStarter),
      payment_link_growth: cleanOptionalUrl(input.paymentLinkGrowth),
      payment_link_agency: cleanOptionalUrl(input.paymentLinkAgency),
      support_contact: input.supportContact.trim().slice(0, 80),
      trial_days: Math.max(0, Math.min(30, Math.round(input.trialDays))),
      updated_by_uid: currentUser.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (error) {
    if (isMissingSupabaseTableError(error)) {
      throw makeSchemaMissingError();
    }
    throw new Error(error.message);
  }
}

// ============================================================================
// Founder Admin Console Services (Governed by Supabase RLS is_founder_admin())
// ============================================================================

export function subscribeAllPlatformSubscriptions(
  onList: (items: MerchantSubscriptionRecord[]) => void,
  onErrorCallback?: (err: Error) => void
): Unsubscribe {
  let cancelled = false;

  const fetchAll = async () => {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(200);

    if (cancelled) return;
    if (error) {
      if (isMissingSupabaseTableError(error)) {
        onErrorCallback?.(makeSchemaMissingError());
        return;
      }
      onErrorCallback?.(new Error(error.message));
      return;
    }

    onList((data ?? []).map((r) => mapRowToSubscription(r as Record<string, unknown>)));
  };

  void fetchAll();

  const channel = supabase
    .channel(`admin_subs_${Math.random().toString(36).slice(2, 7)}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'subscriptions' },
      () => {
        void fetchAll();
      }
    )
    .subscribe();

  return () => {
    cancelled = true;
    void supabase.removeChannel(channel);
  };
}

export function subscribeAllPlatformBusinesses(
  onList: (items: RealBusinessRecord[]) => void,
  onErrorCallback?: (err: Error) => void
): Unsubscribe {
  let cancelled = false;

  const fetchAll = async () => {
    const { data, error } = await supabase
      .from('businesses')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (cancelled) return;
    if (error) {
      if (isMissingSupabaseTableError(error)) {
        onErrorCallback?.(makeSchemaMissingError());
        return;
      }
      onErrorCallback?.(new Error(error.message));
      return;
    }

    onList((data ?? []).map((r) => mapRowToBusiness(r as Record<string, unknown>)));
  };

  void fetchAll();

  const channel = supabase
    .channel(`admin_biz_${Math.random().toString(36).slice(2, 7)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'businesses' }, () => {
      void fetchAll();
    })
    .subscribe();

  return () => {
    cancelled = true;
    void supabase.removeChannel(channel);
  };
}

export async function adminUpdateMerchantSubscription(
  targetSub: MerchantSubscriptionRecord,
  updates: {
    status?: SubscriptionStatus;
    planId?: SubscriptionPlanId;
    addDays?: number;
  }
): Promise<void> {
  const nextPlan = updates.planId ?? targetSub.planId;
  const nextStatus = updates.status ?? targetSub.status;
  const baseMs = Math.max(Date.now(), targetSub.currentPeriodEndMs);
  const nextEndMs = updates.addDays
    ? baseMs + updates.addDays * 24 * 60 * 60 * 1000
    : targetSub.currentPeriodEndMs;

  const { error } = await supabase
    .from('subscriptions')
    .update({
      plan_id: nextPlan,
      status: nextStatus,
      max_businesses: getMaxBusinessesForPlan(nextPlan),
      current_period_end_ms: nextEndMs,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', targetSub.userId);

  if (error) {
    throw new Error(error.message);
  }

  const shouldBeActive = nextStatus === 'active' || nextStatus === 'trialing';
  await supabase
    .from('businesses')
    .update({
      plan_id: nextPlan,
      subscription_ends_at_ms: nextEndMs,
      is_active: shouldBeActive,
      updated_at: new Date().toISOString(),
    })
    .eq('owner_id', targetSub.userId);
}

// ============================================================================
// Shop / Business Profile & QR Scanner Services (Supabase PostgreSQL)
// ============================================================================

export async function checkBusinessSlugAvailable(slug: string): Promise<boolean> {
  const normalized = normalizeMerchantSlug(slug);
  const slugErr = validateMerchantSlug(normalized);
  if (slugErr) return false;

  const { data, error } = await supabase
    .from('businesses')
    .select('slug')
    .eq('slug', normalized)
    .maybeSingle();

  if (error) {
    if (isMissingSupabaseTableError(error)) {
      return true;
    }
    return false;
  }

  return !data;
}

export async function fetchPublicBusinessBySlug(slug: string): Promise<RealBusinessRecord | null> {
  const normalized = normalizeMerchantSlug(slug);
  if (validateMerchantSlug(normalized)) {
    return null;
  }

  const { data, error } = await supabase
    .from('businesses')
    .select('*')
    .eq('slug', normalized)
    .maybeSingle();

  if (!error && data) {
    return mapRowToBusiness(data as Record<string, unknown>);
  }

  // Optional same-origin API fallback if customer's network blocks supabase.co
  try {
    const res = await fetch(`/api/public/businesses/${encodeURIComponent(normalized)}`);
    const contentType = res.headers.get('content-type') ?? '';
    if (!res.ok || !contentType.includes('application/json')) return null;
    const json = (await res.json()) as {
      found?: boolean;
      business?: RealBusinessRecord;
    };
    return json.found && json.business ? json.business : null;
  } catch {
    return null;
  }
}

export async function createRealBusiness(params: {
  name: string;
  category: string;
  slug: string;
  locationLabel: string;
  googleReviewUrl: string;
  subscription?: MerchantSubscriptionRecord | null;
}): Promise<RealBusinessRecord> {
  const currentUser = await requireAuthenticatedUser();

  const slug = normalizeMerchantSlug(params.slug);
  const slugError = validateMerchantSlug(slug);
  if (slugError) {
    throw new Error(slugError);
  }

  const name = params.name.trim().slice(0, BUSINESS_MAX_NAME);
  const category = (params.category.trim() || 'Local Business').slice(0, BUSINESS_MAX_CATEGORY);
  const locationLabel = params.locationLabel.trim().slice(0, BUSINESS_MAX_LOCATION);
  const googleReviewUrl = extractOrNormalizeGoogleUrl(params.googleReviewUrl);

  if (!name) {
    throw new Error('Shop / Business name is required.');
  }
  const urlError = validateGoogleReviewUrl(googleReviewUrl);
  if (urlError) {
    throw new Error(urlError);
  }

  const available = await checkBusinessSlugAvailable(slug);
  if (!available) {
    throw new Error(
      `The URL "/review/${slug}" is already claimed. Try adding your area or city name.`
    );
  }

  const planId: SubscriptionPlanId = params.subscription?.planId ?? 'starter';
  const subscriptionEndsAtMs =
    params.subscription?.currentPeriodEndMs ?? Date.now() + 30 * 24 * 60 * 60 * 1000;

  const { data, error } = await supabase
    .from('businesses')
    .insert({
      slug,
      name,
      category,
      location_label: locationLabel,
      google_review_url: googleReviewUrl,
      owner_id: currentUser.id,
      is_active: true,
      plan_id: planId,
      subscription_ends_at_ms: subscriptionEndsAtMs,
    })
    .select('*')
    .single();

  if (error) {
    if (isMissingSupabaseTableError(error)) {
      throw makeSchemaMissingError();
    }
    if (error.code === '23505') {
      throw new Error(
        `The URL "/review/${slug}" is already claimed. Try adding your area or city name.`
      );
    }
    throw new Error(error.message);
  }

  return mapRowToBusiness(data as Record<string, unknown>);
}

export async function updateRealBusinessDetails(
  slug: string,
  updates: {
    name: string;
    category: string;
    locationLabel: string;
    googleReviewUrl: string;
    planId?: SubscriptionPlanId;
    subscriptionEndsAtMs?: number;
  }
): Promise<void> {
  const name = updates.name.trim().slice(0, BUSINESS_MAX_NAME);
  const category = (updates.category.trim() || 'Local Business').slice(0, BUSINESS_MAX_CATEGORY);
  const locationLabel = updates.locationLabel.trim().slice(0, BUSINESS_MAX_LOCATION);
  const googleReviewUrl = extractOrNormalizeGoogleUrl(updates.googleReviewUrl);

  if (!name) {
    throw new Error('Shop / Business name is required.');
  }
  const urlError = validateGoogleReviewUrl(googleReviewUrl);
  if (urlError) {
    throw new Error(urlError);
  }

  const payload: Record<string, unknown> = {
    name,
    category,
    location_label: locationLabel,
    google_review_url: googleReviewUrl,
    updated_at: new Date().toISOString(),
  };
  if (updates.planId) {
    payload.plan_id = updates.planId;
  }
  if (typeof updates.subscriptionEndsAtMs === 'number') {
    payload.subscription_ends_at_ms = updates.subscriptionEndsAtMs;
  }

  const { error } = await supabase.from('businesses').update(payload).eq('slug', slug);
  if (error) {
    if (isMissingSupabaseTableError(error)) {
      throw makeSchemaMissingError();
    }
    throw new Error(error.message);
  }
}

export async function setRealBusinessActiveStatus(slug: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('businesses')
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('slug', slug);

  if (error) {
    if (isMissingSupabaseTableError(error)) {
      throw makeSchemaMissingError();
    }
    throw new Error(error.message);
  }
}

export async function deleteRealBusiness(slug: string): Promise<void> {
  const { error } = await supabase.from('businesses').delete().eq('slug', slug);
  if (error) {
    if (isMissingSupabaseTableError(error)) {
      throw makeSchemaMissingError();
    }
    throw new Error(error.message);
  }
}

export function subscribeOwnerBusinesses(
  ownerUid: string,
  onBusinesses: (items: RealBusinessRecord[]) => void,
  onErrorCallback?: (err: Error) => void
): Unsubscribe {
  let cancelled = false;

  const fetchMine = async () => {
    const { data, error } = await supabase
      .from('businesses')
      .select('*')
      .eq('owner_id', ownerUid)
      .order('created_at', { ascending: false });

    if (cancelled) return;
    if (error) {
      if (isMissingSupabaseTableError(error)) {
        onErrorCallback?.(makeSchemaMissingError());
        return;
      }
      onErrorCallback?.(new Error(error.message));
      return;
    }

    onBusinesses((data ?? []).map((r) => mapRowToBusiness(r as Record<string, unknown>)));
  };

  void fetchMine();

  const channel = supabase
    .channel(`owner_biz_${ownerUid}_${Math.random().toString(36).slice(2, 7)}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'businesses',
        filter: `owner_id=eq.${ownerUid}`,
      },
      () => {
        void fetchMine();
      }
    )
    .subscribe();

  return () => {
    cancelled = true;
    void supabase.removeChannel(channel);
  };
}

export function subscribeBusinessSessions(
  slug: string,
  ownerUid: string,
  onSessions: (events: RealSessionEventRecord[]) => void,
  onErrorCallback?: (err: Error) => void
): Unsubscribe {
  let cancelled = false;

  const fetchEvents = async () => {
    const { data, error } = await supabase
      .from('review_sessions')
      .select('*')
      .eq('business_slug', slug)
      .eq('business_owner_id', ownerUid)
      .order('created_at', { ascending: false })
      .limit(250);

    if (cancelled) return;
    if (error) {
      if (isMissingSupabaseTableError(error)) {
        onErrorCallback?.(makeSchemaMissingError());
        return;
      }
      onErrorCallback?.(new Error(error.message));
      return;
    }

    const items: RealSessionEventRecord[] = (data ?? []).map((raw) => {
      const r = raw as Record<string, unknown>;
      return {
        id: String(r.id ?? ''),
        businessSlug: String(r.business_slug ?? slug),
        businessOwnerId: String(r.business_owner_id ?? ownerUid),
        visitId: String(r.visit_id ?? ''),
        rating: Number(r.rating ?? 5),
        language: (r.language as ReviewLanguage) ?? 'English',
        usedOptionalPrompts: Boolean(r.used_optional_prompts),
        stage: (r.stage as SessionStage) ?? 'draft_generated',
        createdAtMs: isoToMillis(r.created_at),
      };
    });

    onSessions(items);
  };

  void fetchEvents();

  const channel = supabase
    .channel(`sessions_${slug}_${Math.random().toString(36).slice(2, 7)}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'review_sessions',
        filter: `business_slug=eq.${slug}`,
      },
      () => {
        void fetchEvents();
      }
    )
    .subscribe();

  return () => {
    cancelled = true;
    void supabase.removeChannel(channel);
  };
}

export function createAnonymousVisitId(): string {
  const randomPart = Math.random().toString(36).slice(2, 10);
  const timePart = Date.now().toString(36);
  return `v_${timePart}_${randomPart}`.slice(0, 40);
}

export async function recordRealCustomerSessionEvent(params: {
  businessSlug: string;
  businessOwnerId: string;
  visitId: string;
  rating: number;
  language: ReviewLanguage;
  usedOptionalPrompts: boolean;
  stage: SessionStage;
}): Promise<void> {
  const slug = normalizeMerchantSlug(params.businessSlug);
  if (validateMerchantSlug(slug)) return;
  if (!params.businessOwnerId || params.rating < 1 || params.rating > 5) return;

  const suffix = Math.random().toString(36).slice(2, 7);
  const cleanVisitId = params.visitId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  const sessionId = `${cleanVisitId}_${params.stage}_${suffix}`.slice(0, 96);

  const { error } = await supabase.from('review_sessions').insert({
    id: sessionId,
    business_slug: slug,
    business_owner_id: params.businessOwnerId,
    visit_id: cleanVisitId,
    rating: Math.round(params.rating),
    language: params.language,
    used_optional_prompts: Boolean(params.usedOptionalPrompts),
    stage: params.stage,
  });

  if (error) {
    // Fallback to same-origin backend proxy if available
    try {
      await fetch(`/api/public/businesses/${encodeURIComponent(slug)}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessOwnerId: params.businessOwnerId,
          visitId: cleanVisitId,
          rating: Math.round(params.rating),
          language: params.language,
          usedOptionalPrompts: Boolean(params.usedOptionalPrompts),
          stage: params.stage,
        }),
      });
    } catch {
      // Non-blocking customer telemetry
    }
  }
}
