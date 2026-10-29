import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  getMaxBusinessesForPlan,
  getPlanPriceInr,
} from '../data/subscriptionPlans';
import {
  auth,
  db,
  handleFirestoreError,
  isOfflineOrUnavailableError,
  OperationType,
} from '../lib/firebase';
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

// Synchronized verbatim with firebase-blueprint.json & firestore.rules bounds
export const BUSINESS_MAX_NAME = 80;
export const BUSINESS_MAX_CATEGORY = 60;
export const BUSINESS_MIN_SLUG = 2;
export const BUSINESS_MAX_SLUG = 60;
export const BUSINESS_MAX_LOCATION = 80;
export const BUSINESS_MIN_URL = 10;
export const BUSINESS_MAX_URL = 500;
const SLUG_REGEX = /^[a-z0-9-]+$/;
const URL_REGEX = /^https?:\/\/.+/;

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
    return 'The slug "demo" is reserved for the public walkthrough. Choose your shop name instead.';
  }
  if (slug.length < BUSINESS_MIN_SLUG || slug.length > BUSINESS_MAX_SLUG) {
    return `URL slug must be between ${BUSINESS_MIN_SLUG} and ${BUSINESS_MAX_SLUG} characters.`;
  }
  if (!SLUG_REGEX.test(slug)) {
    return 'Slug can only contain lowercase letters, numbers, and hyphens.';
  }
  return null;
}

/**
 * Smart Google Maps / Share URL Extractor:
 * Handles pasted Android/WhatsApp Google Maps share strings ("Shop Name https://maps.app.goo.gl/..."),
 * bare domains ("maps.app.goo.gl/...", "g.page/..."), or builds a direct Google Maps search link.
 */
export function extractOrNormalizeGoogleUrl(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return '';

  // 1. If pasted text contains an embedded https:// or http:// link (e.g. from Google Maps Share button), extract it
  const embeddedMatch = trimmed.match(/https?:\/\/[^\s"'<>]+/i);
  if (embeddedMatch && embeddedMatch[0]) {
    return embeddedMatch[0].replace(/[.,;)]+$/, '').slice(0, BUSINESS_MAX_URL);
  }

  // 2. If user pasted a bare domain without protocol (e.g. maps.app.goo.gl/xyz or google.com/maps/...)
  if (
    /^(maps\.app\.goo\.gl|goo\.gl\/maps|g\.page|g\.co|(www\.)?google\.[a-z.]+\/maps|search\.google\.com)/i.test(
      trimmed
    )
  ) {
    return `https://${trimmed}`.slice(0, BUSINESS_MAX_URL);
  }

  // 3. Generic domain-like input without spaces
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

function toMillis(val: unknown): number {
  if (val instanceof Timestamp) {
    return val.toMillis();
  }
  if (typeof val === 'object' && val !== null && 'seconds' in val) {
    return Number((val as { seconds: number }).seconds) * 1000;
  }
  if (typeof val === 'number' && Number.isFinite(val)) {
    return val;
  }
  return Date.now();
}

function mapDocToBusiness(data: Record<string, unknown>): RealBusinessRecord {
  return {
    name: String(data.name ?? ''),
    category: String(data.category ?? ''),
    slug: String(data.slug ?? ''),
    locationLabel: String(data.locationLabel ?? ''),
    googleReviewUrl: String(data.googleReviewUrl ?? ''),
    ownerId: String(data.ownerId ?? ''),
    isActive: Boolean(data.isActive),
    planId: data.planId ? (String(data.planId) as SubscriptionPlanId) : undefined,
    subscriptionEndsAtMs:
      typeof data.subscriptionEndsAtMs === 'number' ? data.subscriptionEndsAtMs : undefined,
    createdAtMs: toMillis(data.createdAt),
    updatedAtMs: toMillis(data.updatedAt),
  };
}

function mapDocToSubscription(data: Record<string, unknown>): MerchantSubscriptionRecord {
  const planId = (data.planId as SubscriptionPlanId) ?? 'starter';
  return {
    userId: String(data.userId ?? ''),
    accountLabel: String(data.accountLabel ?? 'Merchant Account'),
    planId,
    billingCycle: (data.billingCycle as BillingCycle) ?? 'monthly',
    status: (data.status as SubscriptionStatus) ?? 'active',
    maxBusinesses: Number(data.maxBusinesses ?? getMaxBusinessesForPlan(planId)),
    priceInr: Number(data.priceInr ?? 0),
    paymentReference: String(data.paymentReference ?? ''),
    currentPeriodEndMs: Number(data.currentPeriodEndMs ?? Date.now()),
    createdAtMs: toMillis(data.createdAt),
    updatedAtMs: toMillis(data.updatedAt),
  };
}

// ============================================================================
// SaaS Subscription & Billing Config Services
// ============================================================================

export function subscribeMerchantSubscription(
  userId: string,
  onSubscription: (sub: MerchantSubscriptionRecord | null) => void,
  onErrorCallback?: (err: Error) => void
): Unsubscribe {
  const path = `subscriptions/${userId}`;
  return onSnapshot(
    doc(db, 'subscriptions', userId),
    (snap) => {
      if (!snap.exists()) {
        onSubscription(null);
        return;
      }
      onSubscription(mapDocToSubscription(snap.data() as Record<string, unknown>));
    },
    (error) => {
      if (onErrorCallback) {
        onErrorCallback(error instanceof Error ? error : new Error(String(error)));
      }
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch {
        // Structured diagnostic logged
      }
    }
  );
}

export async function activateOrUpdateMerchantSubscription(params: {
  accountLabel: string;
  planId: SubscriptionPlanId;
  billingCycle: BillingCycle;
  paymentReference: string;
  trialDays?: number;
}): Promise<MerchantSubscriptionRecord> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Please sign in with Google first.');
  }

  const userId = currentUser.uid;
  const path = `subscriptions/${userId}`;
  const cleanAccountLabel = (
    params.accountLabel.trim() ||
    currentUser.displayName ||
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
  const cleanRef = (isTrial ? 'FREE_TRIAL' : params.paymentReference.trim() || 'SELF_ACTIVATED').slice(
    0,
    80
  );

  try {
    const existingSnap = await getDoc(doc(db, 'subscriptions', userId));
    if (!existingSnap.exists()) {
      await setDoc(doc(db, 'subscriptions', userId), {
        userId,
        accountLabel: cleanAccountLabel,
        planId: params.planId,
        billingCycle: params.billingCycle,
        status,
        maxBusinesses,
        priceInr,
        paymentReference: cleanRef,
        currentPeriodEndMs,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'subscriptions', userId), {
        accountLabel: cleanAccountLabel,
        planId: params.planId,
        billingCycle: params.billingCycle,
        status,
        maxBusinesses,
        priceInr,
        paymentReference: cleanRef,
        currentPeriodEndMs,
        updatedAt: serverTimestamp(),
      });
    }

    // Sync updated subscription expiry onto all shops owned by this merchant
    try {
      const bizSnap = await getDocs(
        query(collection(db, 'businesses'), where('ownerId', '==', userId))
      );
      await Promise.all(
        bizSnap.docs.map((bizDoc) =>
          updateDoc(doc(db, 'businesses', bizDoc.id), {
            planId: params.planId,
            subscriptionEndsAtMs: currentPeriodEndMs,
            isActive: true,
            updatedAt: serverTimestamp(),
          })
        )
      );
    } catch {
      // Non-fatal if merchant has zero shops yet
    }

    return {
      userId,
      accountLabel: cleanAccountLabel,
      planId: params.planId,
      billingCycle: params.billingCycle,
      status,
      maxBusinesses,
      priceInr,
      paymentReference: cleanRef,
      currentPeriodEndMs,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
    };
  } catch (error) {
    if (isOfflineOrUnavailableError(error)) {
      throw new Error(
        'Cannot reach Cloud Firestore right now. Check your connection and try again.'
      );
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchPlatformBillingConfig(): Promise<PlatformBillingConfigRecord> {
  const path = 'platformSettings/billing';
  try {
    const snap = await getDoc(doc(db, 'platformSettings', 'billing'));
    if (!snap.exists()) {
      return DEFAULT_BILLING_CONFIG;
    }
    const data = snap.data() as Record<string, unknown>;
    return {
      upiId: String(data.upiId ?? ''),
      payeeName: String(data.payeeName ?? 'ReviewEase AI'),
      paymentLinkStarter: String(data.paymentLinkStarter ?? ''),
      paymentLinkGrowth: String(data.paymentLinkGrowth ?? ''),
      paymentLinkAgency: String(data.paymentLinkAgency ?? ''),
      supportContact: String(data.supportContact ?? ''),
      trialDays: Number(data.trialDays ?? 7),
      updatedByUid: String(data.updatedByUid ?? ''),
      updatedAtMs: toMillis(data.updatedAt),
    };
  } catch (error) {
    if (isOfflineOrUnavailableError(error)) {
      return DEFAULT_BILLING_CONFIG;
    }
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('permission')) {
      return DEFAULT_BILLING_CONFIG;
    }
    handleFirestoreError(error, OperationType.GET, path);
  }
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
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Admin authentication required.');
  }

  const cleanOptionalUrl = (raw: string) => {
    const t = raw.trim().slice(0, 300);
    if (!t) return '';
    if (!/^https?:\/\/.+/i.test(t)) {
      throw new Error(`Payment link "${t}" must start with https://`);
    }
    return t;
  };

  const payload = {
    upiId: input.upiId.trim().slice(0, 80),
    payeeName: (input.payeeName.trim() || 'ReviewEase AI').slice(0, 80),
    paymentLinkStarter: cleanOptionalUrl(input.paymentLinkStarter),
    paymentLinkGrowth: cleanOptionalUrl(input.paymentLinkGrowth),
    paymentLinkAgency: cleanOptionalUrl(input.paymentLinkAgency),
    supportContact: input.supportContact.trim().slice(0, 80),
    trialDays: Math.max(0, Math.min(30, Math.round(input.trialDays))),
    updatedByUid: currentUser.uid,
    updatedAt: serverTimestamp(),
  };

  const path = 'platformSettings/billing';
  try {
    const snap = await getDoc(doc(db, 'platformSettings', 'billing'));
    if (!snap.exists()) {
      await setDoc(doc(db, 'platformSettings', 'billing'), payload);
    } else {
      await updateDoc(doc(db, 'platformSettings', 'billing'), payload);
    }
  } catch (error) {
    if (isOfflineOrUnavailableError(error)) {
      throw new Error('Network unavailable. Billing settings could not be saved.');
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// ============================================================================
// Founder Admin Console Services (Restricted by firestore.rules to isAdmin())
// ============================================================================

export function subscribeAllPlatformSubscriptions(
  onList: (items: MerchantSubscriptionRecord[]) => void,
  onErrorCallback?: (err: Error) => void
): Unsubscribe {
  const path = 'subscriptions';
  const q = query(collection(db, 'subscriptions'), limit(200));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => mapDocToSubscription(d.data() as Record<string, unknown>))
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      onList(items);
    },
    (error) => {
      if (onErrorCallback) {
        onErrorCallback(error instanceof Error ? error : new Error(String(error)));
      }
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Logged structured error
      }
    }
  );
}

export function subscribeAllPlatformBusinesses(
  onList: (items: RealBusinessRecord[]) => void,
  onErrorCallback?: (err: Error) => void
): Unsubscribe {
  const path = 'businesses';
  const q = query(collection(db, 'businesses'), limit(200));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => mapDocToBusiness(d.data() as Record<string, unknown>))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      onList(items);
    },
    (error) => {
      if (onErrorCallback) {
        onErrorCallback(error instanceof Error ? error : new Error(String(error)));
      }
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Logged structured error
      }
    }
  );
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

  const path = `subscriptions/${targetSub.userId}`;
  try {
    await updateDoc(doc(db, 'subscriptions', targetSub.userId), {
      accountLabel: targetSub.accountLabel,
      planId: nextPlan,
      billingCycle: targetSub.billingCycle,
      status: nextStatus,
      maxBusinesses: getMaxBusinessesForPlan(nextPlan),
      priceInr: targetSub.priceInr,
      paymentReference: targetSub.paymentReference,
      currentPeriodEndMs: nextEndMs,
      updatedAt: serverTimestamp(),
    });

    // Sync status & expiry onto the merchant's shop QR pages
    const shouldBeActive = nextStatus === 'active' || nextStatus === 'trialing';
    const bizSnap = await getDocs(
      query(collection(db, 'businesses'), where('ownerId', '==', targetSub.userId))
    );
    await Promise.all(
      bizSnap.docs.map((b) =>
        updateDoc(doc(db, 'businesses', b.id), {
          planId: nextPlan,
          subscriptionEndsAtMs: nextEndMs,
          isActive: shouldBeActive,
          updatedAt: serverTimestamp(),
        })
      )
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// ============================================================================
// Shop / Business Profile & QR Scanner Services
// ============================================================================

export async function checkBusinessSlugAvailable(slug: string): Promise<boolean> {
  const normalized = normalizeMerchantSlug(slug);
  const slugErr = validateMerchantSlug(normalized);
  if (slugErr) return false;

  const path = `businesses/${normalized}`;
  try {
    const snap = await getDoc(doc(db, 'businesses', normalized));
    return !snap.exists();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('permission')) {
      return false;
    }
    if (isOfflineOrUnavailableError(error)) {
      try {
        const res = await fetch(`/api/public/businesses/${encodeURIComponent(normalized)}`);
        return res.status === 404;
      } catch {
        return true;
      }
    }
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function fetchPublicBusinessBySlug(slug: string): Promise<RealBusinessRecord | null> {
  const normalized = normalizeMerchantSlug(slug);
  if (validateMerchantSlug(normalized)) {
    return null;
  }

  const path = `businesses/${normalized}`;
  try {
    const snap = await getDoc(doc(db, 'businesses', normalized));
    if (!snap.exists()) {
      return null;
    }
    return mapDocToBusiness(snap.data() as Record<string, unknown>);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('permission')) {
      return null;
    }
    if (isOfflineOrUnavailableError(error)) {
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
    handleFirestoreError(error, OperationType.GET, path);
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
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('You must sign in with Google before creating a shop QR scanner.');
  }

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

  const path = `businesses/${slug}`;
  const payload = {
    name,
    category,
    slug,
    locationLabel,
    googleReviewUrl,
    ownerId: currentUser.uid,
    isActive: true,
    planId,
    subscriptionEndsAtMs,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'businesses', slug), payload);
    return {
      name,
      category,
      slug,
      locationLabel,
      googleReviewUrl,
      ownerId: currentUser.uid,
      isActive: true,
      planId,
      subscriptionEndsAtMs,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
    };
  } catch (error) {
    if (isOfflineOrUnavailableError(error)) {
      throw new Error(
        'Cannot reach Cloud Firestore from your browser right now. Check your connection and try again.'
      );
    }
    handleFirestoreError(error, OperationType.CREATE, path);
  }
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

  const path = `businesses/${slug}`;
  const payload: Record<string, unknown> = {
    name,
    category,
    locationLabel,
    googleReviewUrl,
    updatedAt: serverTimestamp(),
  };
  if (updates.planId) {
    payload.planId = updates.planId;
  }
  if (typeof updates.subscriptionEndsAtMs === 'number') {
    payload.subscriptionEndsAtMs = updates.subscriptionEndsAtMs;
  }

  try {
    await updateDoc(doc(db, 'businesses', slug), payload);
  } catch (error) {
    if (isOfflineOrUnavailableError(error)) {
      throw new Error('Network unavailable. Changes could not be synced to Cloud Firestore.');
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function setRealBusinessActiveStatus(slug: string, isActive: boolean): Promise<void> {
  const path = `businesses/${slug}`;
  try {
    await updateDoc(doc(db, 'businesses', slug), {
      isActive,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (isOfflineOrUnavailableError(error)) {
      throw new Error('Network unavailable. Status could not be updated.');
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteRealBusiness(slug: string): Promise<void> {
  const path = `businesses/${slug}`;
  try {
    await deleteDoc(doc(db, 'businesses', slug));
  } catch (error) {
    if (isOfflineOrUnavailableError(error)) {
      throw new Error('Network unavailable. Could not delete shop.');
    }
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeOwnerBusinesses(
  ownerUid: string,
  onBusinesses: (items: RealBusinessRecord[]) => void,
  onErrorCallback?: (err: Error) => void
): Unsubscribe {
  const path = 'businesses';
  const q = query(collection(db, 'businesses'), where('ownerId', '==', ownerUid));

  return onSnapshot(
    q,
    (snapshot) => {
      const records = snapshot.docs
        .map((d) => mapDocToBusiness(d.data() as Record<string, unknown>))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      onBusinesses(records);
    },
    (error) => {
      if (onErrorCallback) {
        onErrorCallback(error instanceof Error ? error : new Error(String(error)));
      }
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Logged structured FirestoreErrorInfo for diagnostics
      }
    }
  );
}

export function subscribeBusinessSessions(
  slug: string,
  ownerUid: string,
  onSessions: (events: RealSessionEventRecord[]) => void,
  onErrorCallback?: (err: Error) => void
): Unsubscribe {
  const path = `businesses/${slug}/sessions`;
  const q = query(
    collection(db, 'businesses', slug, 'sessions'),
    where('businessOwnerId', '==', ownerUid),
    limit(250)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: RealSessionEventRecord[] = snapshot.docs
        .map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            businessSlug: String(data.businessSlug ?? slug),
            businessOwnerId: String(data.businessOwnerId ?? ownerUid),
            visitId: String(data.visitId ?? d.id),
            rating: Number(data.rating ?? 5),
            language: (data.language as ReviewLanguage) ?? 'English',
            usedOptionalPrompts: Boolean(data.usedOptionalPrompts),
            stage: (data.stage as SessionStage) ?? 'draft_generated',
            createdAtMs: toMillis(data.createdAt),
          };
        })
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      onSessions(items);
    },
    (error) => {
      if (onErrorCallback) {
        onErrorCallback(error instanceof Error ? error : new Error(String(error)));
      }
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Logged structured FirestoreErrorInfo for diagnostics
      }
    }
  );
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
  const sessionId = `${params.visitId}_${params.stage}_${suffix}`
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 96);

  const path = `businesses/${slug}/sessions/${sessionId}`;

  try {
    await setDoc(doc(db, 'businesses', slug, 'sessions', sessionId), {
      businessSlug: slug,
      businessOwnerId: params.businessOwnerId,
      visitId: params.visitId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48),
      rating: Math.round(params.rating),
      language: params.language,
      usedOptionalPrompts: Boolean(params.usedOptionalPrompts),
      stage: params.stage,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    if (isOfflineOrUnavailableError(error)) {
      try {
        await fetch(`/api/public/businesses/${encodeURIComponent(slug)}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessOwnerId: params.businessOwnerId,
            visitId: params.visitId,
            rating: Math.round(params.rating),
            language: params.language,
            usedOptionalPrompts: Boolean(params.usedOptionalPrompts),
            stage: params.stage,
          }),
        });
        return;
      } catch {
        return;
      }
    }
    try {
      handleFirestoreError(error, OperationType.CREATE, path);
    } catch {
      // Logged structured error without blocking customer from copying review
    }
  }
}
