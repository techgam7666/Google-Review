import {
  collection,
  deleteDoc,
  doc,
  getDoc,
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
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import type {
  RealBusinessRecord,
  RealSessionEventRecord,
  ReviewLanguage,
  SessionStage,
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
    return 'The slug "demo" is reserved for the public walkthrough. Choose your business name instead.';
  }
  if (slug.length < BUSINESS_MIN_SLUG || slug.length > BUSINESS_MAX_SLUG) {
    return `URL slug must be between ${BUSINESS_MIN_SLUG} and ${BUSINESS_MAX_SLUG} characters.`;
  }
  if (!SLUG_REGEX.test(slug)) {
    return 'Slug can only contain lowercase letters, numbers, and hyphens.';
  }
  return null;
}

export function validateGoogleReviewUrl(url: string): string | null {
  const trimmed = url.trim();
  if (trimmed.length < BUSINESS_MIN_URL || trimmed.length > BUSINESS_MAX_URL) {
    return `Google Review URL must be between ${BUSINESS_MIN_URL} and ${BUSINESS_MAX_URL} characters.`;
  }
  if (!URL_REGEX.test(trimmed)) {
    return 'URL must start with https:// or http://';
  }
  try {
    new URL(trimmed);
    return null;
  } catch {
    return 'Please enter a valid web URL.';
  }
}

function toMillis(val: unknown): number {
  if (val instanceof Timestamp) {
    return val.toMillis();
  }
  if (typeof val === 'object' && val !== null && 'seconds' in val) {
    return Number((val as { seconds: number }).seconds) * 1000;
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
    createdAtMs: toMillis(data.createdAt),
    updatedAtMs: toMillis(data.updatedAt),
  };
}

export async function checkBusinessSlugAvailable(slug: string): Promise<boolean> {
  const normalized = normalizeMerchantSlug(slug);
  const slugErr = validateMerchantSlug(normalized);
  if (slugErr) return false;

  const path = `businesses/${normalized}`;
  try {
    const snap = await getDoc(doc(db, 'businesses', normalized));
    return !snap.exists();
  } catch (error) {
    // If the slug exists but isActive == false and belongs to someone else,
    // getDoc returns PERMISSION_DENIED — which also means the slug is already taken!
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('permission')) {
      return false;
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
    // If paused by owner (isActive == false), rules block unauthenticated reads
    if (msg.toLowerCase().includes('permission')) {
      return null;
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
}): Promise<RealBusinessRecord> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('You must sign in with Google before creating a business.');
  }

  const slug = normalizeMerchantSlug(params.slug);
  const slugError = validateMerchantSlug(slug);
  if (slugError) {
    throw new Error(slugError);
  }

  const name = params.name.trim().slice(0, BUSINESS_MAX_NAME);
  const category = (params.category.trim() || 'Local Business').slice(0, BUSINESS_MAX_CATEGORY);
  const locationLabel = params.locationLabel.trim().slice(0, BUSINESS_MAX_LOCATION);
  const googleReviewUrl = params.googleReviewUrl.trim().slice(0, BUSINESS_MAX_URL);

  if (!name) {
    throw new Error('Business name is required.');
  }
  const urlError = validateGoogleReviewUrl(googleReviewUrl);
  if (urlError) {
    throw new Error(urlError);
  }

  const available = await checkBusinessSlugAvailable(slug);
  if (!available) {
    throw new Error(`The URL "/review/${slug}" is already claimed. Try adding your neighborhood or city.`);
  }

  const path = `businesses/${slug}`;
  const payload = {
    name,
    category,
    slug,
    locationLabel,
    googleReviewUrl,
    ownerId: currentUser.uid,
    isActive: true,
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
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
    };
  } catch (error) {
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
  }
): Promise<void> {
  const name = updates.name.trim().slice(0, BUSINESS_MAX_NAME);
  const category = (updates.category.trim() || 'Local Business').slice(0, BUSINESS_MAX_CATEGORY);
  const locationLabel = updates.locationLabel.trim().slice(0, BUSINESS_MAX_LOCATION);
  const googleReviewUrl = updates.googleReviewUrl.trim().slice(0, BUSINESS_MAX_URL);

  if (!name) {
    throw new Error('Business name is required.');
  }
  const urlError = validateGoogleReviewUrl(googleReviewUrl);
  if (urlError) {
    throw new Error(urlError);
  }

  const path = `businesses/${slug}`;
  try {
    await updateDoc(doc(db, 'businesses', slug), {
      name,
      category,
      locationLabel,
      googleReviewUrl,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
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
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteRealBusiness(slug: string): Promise<void> {
  const path = `businesses/${slug}`;
  try {
    await deleteDoc(doc(db, 'businesses', slug));
  } catch (error) {
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
    try {
      handleFirestoreError(error, OperationType.CREATE, path);
    } catch {
      // Logged structured error without blocking customer from copying review
    }
  }
}
