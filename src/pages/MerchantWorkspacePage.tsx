import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  Check,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  FileImage,
  HelpCircle,
  Loader2,
  LogOut,
  MapPin,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  Wand2,
} from 'lucide-react';
import { FounderAdminPanel } from '../components/FounderAdminPanel';
import { SubscriptionBillingPanel } from '../components/SubscriptionBillingPanel';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import {
  getPlanCatalogItem,
  getPlanDisplayName,
  isSubscriptionCurrentlyValid,
} from '../data/subscriptionPlans';
import {
  isOfflineOrUnavailableError,
  isQuotaExceededError,
  reconnectFirestore,
} from '../lib/firebase';
import {
  buildGoogleMapsFallbackUrl,
  checkBusinessSlugAvailable,
  createRealBusiness,
  DEFAULT_BILLING_CONFIG,
  deleteRealBusiness,
  extractOrNormalizeGoogleUrl,
  fetchPlatformBillingConfig,
  normalizeMerchantSlug,
  setRealBusinessActiveStatus,
  subscribeBusinessSessions,
  subscribeMerchantSubscription,
  subscribeOwnerBusinesses,
  updateRealBusinessDetails,
  validateGoogleReviewUrl,
  validateMerchantSlug,
} from '../services/firestoreService';
import type {
  BillingCycle,
  MerchantSubscriptionRecord,
  PaidPlanId,
  PlatformBillingConfigRecord,
  QrStandeeTheme,
  RealBusinessRecord,
  RealSessionEventRecord,
  ReviewLanguage,
} from '../types/review';
import { copyTextToClipboard } from '../utils/clipboard';
import { generatePrintableQrCardDataUrl } from '../utils/qrPosterExport';

const CATEGORY_SUGGESTIONS = [
  'Beauty & Skin Clinic',
  'Cafe & Restaurant',
  'Dental & Medical Clinic',
  'Salon & Spa',
  'Retail & Boutique Shop',
  'Gym & Fitness Studio',
  'Hotel & Hospitality',
  'Auto & Home Services',
];

type WorkspaceTab = 'shops' | 'billing' | 'admin';

function formatRelativeTime(timestampMs: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
  if (diffSec < 45) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(timestampMs).toLocaleDateString();
}

function stageLabel(stage: RealSessionEventRecord['stage']): string {
  switch (stage) {
    case 'opened_google':
      return 'Opened Google Link';
    case 'copied_review':
      return 'Copied Review';
    case 'draft_generated':
    default:
      return 'Generated Draft';
  }
}

export function MerchantWorkspacePage() {
  const [searchParams] = useSearchParams();
  const claimSlugParam = searchParams.get('claim') ?? '';
  const planQueryParam = searchParams.get('plan') as PaidPlanId | null;
  const cycleQueryParam = searchParams.get('cycle') as BillingCycle | null;
  const tabQueryParam = searchParams.get('tab') as WorkspaceTab | null;

  const validInitialPlan: PaidPlanId | undefined =
    planQueryParam && ['starter', 'growth', 'agency'].includes(planQueryParam)
      ? planQueryParam
      : undefined;
  const validInitialCycle: BillingCycle | undefined =
    cycleQueryParam && ['monthly', 'annual'].includes(cycleQueryParam)
      ? cycleQueryParam
      : undefined;

  const {
    user,
    authReady,
    isSigningIn,
    authError,
    isUnauthorizedDomainError,
    currentHostname,
    firebaseConsoleAuthSettingsUrl,
    isPlatformAdmin,
    signInWithGoogle,
    signOutUser,
    clearAuthError,
  } = useAuth();
  const { serverAppUrl, liveAiConfigured, activeAiProvider } = useBusiness();

  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() => {
    if (tabQueryParam === 'billing' || validInitialPlan) return 'billing';
    return 'shops';
  });

  // Subscription & Platform Billing state
  const [subscription, setSubscription] = useState<MerchantSubscriptionRecord | null>(null);
  const [loadingSubscription, setLoadingSubscription] = useState<boolean>(true);
  const [billingConfig, setBillingConfig] =
    useState<PlatformBillingConfigRecord>(DEFAULT_BILLING_CONFIG);

  // Owner's businesses list
  const [businesses, setBusinesses] = useState<RealBusinessRecord[]>([]);
  const [loadingBusinesses, setLoadingBusinesses] = useState<boolean>(true);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [firestoreBannerError, setFirestoreBannerError] = useState<string | null>(null);
  const [copiedDomainHost, setCopiedDomainHost] = useState<boolean>(false);

  // Create new business form state
  const [newName, setNewName] = useState<string>('');
  const [newCategory, setNewCategory] = useState<string>('Beauty & Skin Clinic');
  const [newSlug, setNewSlug] = useState<string>(() =>
    claimSlugParam ? normalizeMerchantSlug(claimSlugParam) : ''
  );
  const [slugTouched, setSlugTouched] = useState<boolean>(Boolean(claimSlugParam));
  const [slugChecking, setSlugChecking] = useState<boolean>(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [newLocation, setNewLocation] = useState<string>('');
  const [newGoogleUrl, setNewGoogleUrl] = useState<string>('');
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showGoogleUrlGuide, setShowGoogleUrlGuide] = useState<boolean>(false);

  // Edit active business form state
  const [editName, setEditName] = useState<string>('');
  const [editCategory, setEditCategory] = useState<string>('');
  const [editLocation, setEditLocation] = useState<string>('');
  const [editGoogleUrl, setEditGoogleUrl] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  const [editFeedback, setEditFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [confirmDeleteSlug, setConfirmDeleteSlug] = useState<string | null>(null);

  // Real-time sessions for selected business
  const [sessionEvents, setSessionEvents] = useState<RealSessionEventRecord[]>([]);
  const [loadingSessions, setLoadingSessions] = useState<boolean>(false);
  const [langFilter, setLangFilter] = useState<'All' | ReviewLanguage>('All');
  const [ratingFilter, setRatingFilter] = useState<'All' | 'Positive' | 'Neutral' | 'Negative'>(
    'All'
  );
  const [searchQuery, setSearchQuery] = useState<string>('');

  // QR Standee assets & theme
  const [standeeTheme, setStandeeTheme] = useState<QrStandeeTheme>('classic');
  const [qrPngUrl, setQrPngUrl] = useState<string>('');
  const [qrSvgStr, setQrSvgStr] = useState<string>('');
  const [isExportingPoster, setIsExportingPoster] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  const publicOrigin = useMemo(() => {
    if (serverAppUrl) return serverAppUrl;
    if (typeof window !== 'undefined') return window.location.origin;
    return 'http://localhost:3000';
  }, [serverAppUrl]);

  const reloadBillingConfig = () => {
    if (!authReady || !user) return;
    fetchPlatformBillingConfig()
      .then((cfg) => setBillingConfig(cfg))
      .catch(() => {
        // Keep defaults
      });
  };

  useEffect(() => {
    if (!authReady || !user) {
      setSubscription(null);
      setLoadingSubscription(false);
      return;
    }

    setLoadingSubscription(true);
    reloadBillingConfig();

    const unsubSub = subscribeMerchantSubscription(
      user.uid,
      (sub) => {
        setSubscription(sub);
        setLoadingSubscription(false);
      },
      () => {
        setLoadingSubscription(false);
      }
    );

    return () => unsubSub();
  }, [authReady, user]);

  // Subscribe to signed-in merchant's businesses
  useEffect(() => {
    if (!authReady || !user) {
      setBusinesses([]);
      setLoadingBusinesses(false);
      return;
    }

    setLoadingBusinesses(true);
    setFirestoreBannerError(null);

    const unsub = subscribeOwnerBusinesses(
      user.uid,
      (records) => {
        setBusinesses(records);
        setLoadingBusinesses(false);

        if (records.length === 0) {
          setShowCreateForm(true);
          setSelectedSlug(null);
        } else {
          setSelectedSlug((prev) => {
            if (prev && records.some((b) => b.slug === prev)) return prev;
            return records[0].slug;
          });
        }
      },
      (err) => {
        setLoadingBusinesses(false);
        if (isQuotaExceededError(err)) {
          setFirestoreBannerError(
            'Daily free Firestore quota exceeded. Quota resets tomorrow — see Firebase Spark/Enterprise pricing for details.'
          );
        } else if (isOfflineOrUnavailableError(err)) {
          setFirestoreBannerError(
            'Your browser is currently offline or blocking Cloud Firestore. Check your connection and click Reconnect.'
          );
        } else {
          setFirestoreBannerError('Unable to load your shops. Please refresh and try again.');
        }
      }
    );

    return () => unsub();
  }, [authReady, user]);

  const hasValidSubscription = useMemo(
    () => isPlatformAdmin || isSubscriptionCurrentlyValid(subscription),
    [isPlatformAdmin, subscription]
  );

  const allowedMaxShops = useMemo(() => {
    if (isPlatformAdmin) return 25;
    return subscription?.maxBusinesses ?? 0;
  }, [isPlatformAdmin, subscription]);

  const hasReachedShopLimit = !isPlatformAdmin && businesses.length >= allowedMaxShops;

  const selectedBusiness = useMemo(
    () => businesses.find((b) => b.slug === selectedSlug) ?? null,
    [businesses, selectedSlug]
  );

  useEffect(() => {
    if (!selectedBusiness) return;
    setEditName(selectedBusiness.name);
    setEditCategory(selectedBusiness.category);
    setEditLocation(selectedBusiness.locationLabel);
    setEditGoogleUrl(selectedBusiness.googleReviewUrl);
    setEditFeedback(null);
    setConfirmDeleteSlug(null);
  }, [selectedBusiness]);

  useEffect(() => {
    if (!authReady || !user || !selectedBusiness) {
      setSessionEvents([]);
      return;
    }

    setLoadingSessions(true);
    const unsub = subscribeBusinessSessions(
      selectedBusiness.slug,
      user.uid,
      (events) => {
        setSessionEvents(events);
        setLoadingSessions(false);
      },
      () => {
        setLoadingSessions(false);
      }
    );

    return () => unsub();
  }, [authReady, user, selectedBusiness]);

  // Debounced slug availability check while creating a new business
  useEffect(() => {
    if (!showCreateForm || !user) return;
    const normalized = normalizeMerchantSlug(newSlug);
    const validationErr = validateMerchantSlug(normalized);
    if (!normalized || validationErr) {
      setSlugAvailable(null);
      setSlugChecking(false);
      return;
    }

    setSlugChecking(true);
    const timer = setTimeout(() => {
      checkBusinessSlugAvailable(normalized)
        .then((avail) => {
          setSlugAvailable(avail);
          setSlugChecking(false);
        })
        .catch(() => {
          setSlugAvailable(null);
          setSlugChecking(false);
        });
    }, 320);

    return () => clearTimeout(timer);
  }, [newSlug, showCreateForm, user]);

  const liveCustomerUrl = selectedBusiness
    ? `${publicOrigin}/review/${selectedBusiness.slug}`
    : '';

  useEffect(() => {
    if (!liveCustomerUrl) {
      setQrPngUrl('');
      setQrSvgStr('');
      return;
    }
    let cancelled = false;
    Promise.all([
      QRCode.toDataURL(liveCustomerUrl, {
        width: 560,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      }),
      QRCode.toString(liveCustomerUrl, {
        type: 'svg',
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      }),
    ])
      .then(([png, svg]) => {
        if (!cancelled) {
          setQrPngUrl(png);
          setQrSvgStr(svg);
        }
      })
      .catch(() => {
        // Ignore transient QR render failure
      });

    return () => {
      cancelled = true;
    };
  }, [liveCustomerUrl]);

  const realMetrics = useMemo(() => {
    const visitsMap = new Map<
      string,
      {
        visitId: string;
        rating: number;
        language: ReviewLanguage;
        usedOptionalPrompts: boolean;
        hasDraft: boolean;
        hasCopied: boolean;
        hasOpenedGoogle: boolean;
        latestAtMs: number;
        highestStage: RealSessionEventRecord['stage'];
      }
    >();

    for (const ev of sessionEvents) {
      const existing = visitsMap.get(ev.visitId);
      if (!existing) {
        visitsMap.set(ev.visitId, {
          visitId: ev.visitId,
          rating: ev.rating,
          language: ev.language,
          usedOptionalPrompts: ev.usedOptionalPrompts,
          hasDraft: ev.stage === 'draft_generated',
          hasCopied: ev.stage === 'copied_review',
          hasOpenedGoogle: ev.stage === 'opened_google',
          latestAtMs: ev.createdAtMs,
          highestStage: ev.stage,
        });
      } else {
        existing.rating = ev.rating;
        existing.language = ev.language;
        existing.usedOptionalPrompts = existing.usedOptionalPrompts || ev.usedOptionalPrompts;
        if (ev.stage === 'draft_generated') existing.hasDraft = true;
        if (ev.stage === 'copied_review') existing.hasCopied = true;
        if (ev.stage === 'opened_google') existing.hasOpenedGoogle = true;
        if (ev.createdAtMs > existing.latestAtMs) {
          existing.latestAtMs = ev.createdAtMs;
        }
        if (ev.stage === 'opened_google') {
          existing.highestStage = 'opened_google';
        } else if (ev.stage === 'copied_review' && existing.highestStage !== 'opened_google') {
          existing.highestStage = 'copied_review';
        }
      }
    }

    const visits = Array.from(visitsMap.values()).sort((a, b) => b.latestAtMs - a.latestAtMs);
    const totalVisits = visits.length;
    const copiedCount = visits.filter((v) => v.hasCopied).length;
    const googleOpenedCount = visits.filter((v) => v.hasOpenedGoogle).length;
    const ratingDist: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let ratingSum = 0;

    for (const v of visits) {
      if (ratingDist[v.rating] !== undefined) {
        ratingDist[v.rating] += 1;
      }
      ratingSum += v.rating;
    }

    const avgRating = totalVisits > 0 ? (ratingSum / totalVisits).toFixed(2) : '—';
    const copyPct = totalVisits > 0 ? `${Math.round((copiedCount / totalVisits) * 100)}%` : '0%';
    const googlePct =
      totalVisits > 0 ? `${Math.round((googleOpenedCount / totalVisits) * 100)}%` : '0%';

    return {
      visits,
      totalVisits,
      copiedCount,
      googleOpenedCount,
      ratingDist,
      avgRating,
      copyPct,
      googlePct,
    };
  }, [sessionEvents]);

  const filteredVisits = useMemo(() => {
    return realMetrics.visits.filter((v) => {
      if (langFilter !== 'All' && v.language !== langFilter) return false;
      if (ratingFilter === 'Positive' && v.rating < 4) return false;
      if (ratingFilter === 'Neutral' && v.rating !== 3) return false;
      if (ratingFilter === 'Negative' && v.rating > 2) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${v.language} ${stageLabel(v.highestStage)} ${v.rating} star`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [realMetrics.visits, langFilter, ratingFilter, searchQuery]);

  const handleNameChangeForCreate = (val: string) => {
    setNewName(val);
    if (!slugTouched) {
      setNewSlug(normalizeMerchantSlug(val));
    }
  };

  const handleAutoBuildCreateGoogleUrl = () => {
    if (!newName.trim()) {
      setCreateError('Enter your Shop Name first, then click Generate Link.');
      return;
    }
    setCreateError(null);
    setNewGoogleUrl(buildGoogleMapsFallbackUrl(newName, newLocation));
  };

  const handleAutoBuildEditGoogleUrl = () => {
    if (!editName.trim()) return;
    setEditGoogleUrl(buildGoogleMapsFallbackUrl(editName, editLocation));
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!hasValidSubscription) {
      setActiveTab('billing');
      return;
    }
    if (hasReachedShopLimit) {
      setCreateError(
        `Your current plan allows up to ${allowedMaxShops} shop QR ${
          allowedMaxShops === 1 ? 'scanner' : 'scanners'
        }. Upgrade your plan in Subscription & Billing to add more branches.`
      );
      return;
    }

    const normalizedSlug = normalizeMerchantSlug(newSlug);
    const slugErr = validateMerchantSlug(normalizedSlug);
    if (slugErr) {
      setCreateError(slugErr);
      return;
    }

    const extractedUrl = extractOrNormalizeGoogleUrl(newGoogleUrl);
    const urlErr = validateGoogleReviewUrl(extractedUrl);
    if (urlErr) {
      setCreateError(urlErr);
      return;
    }

    setIsCreating(true);
    try {
      const created = await createRealBusiness({
        name: newName,
        category: newCategory,
        slug: normalizedSlug,
        locationLabel: newLocation,
        googleReviewUrl: extractedUrl,
        subscription,
      });
      setSelectedSlug(created.slug);
      setShowCreateForm(false);
      setNewName('');
      setNewSlug('');
      setSlugTouched(false);
      setNewLocation('');
      setNewGoogleUrl('');
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : 'Could not create shop QR scanner.'
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveBusinessEdits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBusiness) return;
    setEditFeedback(null);

    const extractedUrl = extractOrNormalizeGoogleUrl(editGoogleUrl);
    const urlErr = validateGoogleReviewUrl(extractedUrl);
    if (urlErr) {
      setEditFeedback({ type: 'error', text: urlErr });
      return;
    }

    setIsSavingEdit(true);
    try {
      setEditGoogleUrl(extractedUrl);
      await updateRealBusinessDetails(selectedBusiness.slug, {
        name: editName,
        category: editCategory,
        locationLabel: editLocation,
        googleReviewUrl: extractedUrl,
        planId: subscription?.planId ?? selectedBusiness.planId,
        subscriptionEndsAtMs:
          subscription?.currentPeriodEndMs ?? selectedBusiness.subscriptionEndsAtMs,
      });
      setEditFeedback({
        type: 'success',
        text: 'Shop details & Google Maps link saved live.',
      });
      setTimeout(() => setEditFeedback(null), 3500);
    } catch (err) {
      setEditFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save changes.',
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleToggleActive = async () => {
    if (!selectedBusiness) return;
    try {
      await setRealBusinessActiveStatus(selectedBusiness.slug, !selectedBusiness.isActive);
    } catch (err) {
      setEditFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to update status.',
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedBusiness) return;
    const targetSlug = selectedBusiness.slug;
    try {
      await deleteRealBusiness(targetSlug);
      setConfirmDeleteSlug(null);
    } catch (err) {
      setEditFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to delete shop.',
      });
    }
  };

  const handleDownloadPosterCard = async () => {
    if (!selectedBusiness || !liveCustomerUrl) return;
    setIsExportingPoster(true);
    try {
      const dataUrl = await generatePrintableQrCardDataUrl({
        businessName: selectedBusiness.name,
        category: selectedBusiness.category,
        locationLabel: selectedBusiness.locationLabel,
        customerReviewUrl: liveCustomerUrl,
        theme: standeeTheme,
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${selectedBusiness.slug}-shop-qr-standee-${standeeTheme}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setIsExportingPoster(false);
    }
  };

  const handleDownloadRawPng = () => {
    if (!qrPngUrl || !selectedBusiness) return;
    const link = document.createElement('a');
    link.href = qrPngUrl;
    link.download = `${selectedBusiness.slug}-qr.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadSvg = () => {
    if (!qrSvgStr || !selectedBusiness) return;
    const blob = new Blob([qrSvgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedBusiness.slug}-qr.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyLiveLink = async () => {
    if (!liveCustomerUrl) return;
    const res = await copyTextToClipboard(liveCustomerUrl);
    if (res.ok) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2400);
    }
  };

  const handleCopyHostname = async () => {
    const res = await copyTextToClipboard(currentHostname);
    if (res.ok) {
      setCopiedDomainHost(true);
      setTimeout(() => setCopiedDomainHost(false), 2400);
    }
  };

  // 1. Auth Loading Skeleton
  if (!authReady) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-slate-50/70 py-14">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 space-y-4">
          <div className="h-10 w-64 rounded-lg bg-slate-200/70 animate-pulse" />
          <div className="h-64 rounded-2xl bg-white border border-slate-200 animate-pulse" />
        </div>
      </div>
    );
  }

  // 2. Signed-Out Onboarding State
  if (!user) {
    const preselectedPlan = validInitialPlan ? getPlanCatalogItem(validInitialPlan) : null;

    return (
      <div className="min-h-[calc(100vh-4rem)] bg-slate-50/70 py-10 sm:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-7 space-y-5">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-indigo-600">
                <span>Merchant Subscription Portal</span>
                <span aria-hidden="true">·</span>
                <span>
                  {preselectedPlan
                    ? `${preselectedPlan.name} Selected`
                    : '7-Day Free Trial Available'}
                </span>
              </div>

              <h1
                className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950"
                style={{ textWrap: 'balance' }}
              >
                Get your shop QR review scanner in three simple steps.
              </h1>

              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                Sign in with Google to activate your monthly subscription (or 7-day free trial), paste your Google Maps link, and download your printable shop counter QR standee.
              </p>

              <ul className="space-y-2.5 text-sm text-slate-700 pt-1">
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-indigo-600 shrink-0 mt-1" />
                  <span>
                    Works with any Google Maps share link (<code className="font-mono text-xs">maps.app.goo.gl/...</code>) or shop name
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-indigo-600 shrink-0 mt-1" />
                  <span>
                    Customers scan your shop QR to generate natural AI reviews in English, हिन्दी &amp; Hinglish
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-indigo-600 shrink-0 mt-1" />
                  <span>
                    Print-ready counter standee posters (Classic, Navy &amp; Warm Gold themes)
                  </span>
                </li>
              </ul>

              {authError && !isUnauthorizedDomainError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs sm:text-sm text-red-800 flex items-start gap-2.5"
                >
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}

              {/* Actionable Self-Service Guide when deployed to Netlify / Vercel / Custom Domain */}
              {isUnauthorizedDomainError && (
                <div
                  role="alert"
                  className="rounded-xl border border-amber-300 bg-amber-50/90 p-4 space-y-3 text-xs sm:text-sm text-amber-950"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold">
                        One-time custom domain setup needed for{' '}
                        <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-amber-200">
                          {currentHostname}
                        </code>
                      </p>
                      <p className="text-xs text-amber-900 leading-relaxed">
                        Firebase blocks Google Sign-In popups on newly deployed domains (such as Netlify or custom domains) until you add the domain in Firebase Console:
                      </p>
                    </div>
                  </div>

                  <ol className="list-decimal list-inside space-y-1 text-xs text-amber-900 pl-1">
                    <li>Click <strong>Copy Domain</strong> below to copy <code className="font-mono">{currentHostname}</code>.</li>
                    <li>Open <strong>Firebase Auth Settings</strong> → scroll to <strong>Authorized domains</strong> → click <strong>Add domain</strong>.</li>
                    <li>Paste <code className="font-mono">{currentHostname}</code>, click Add, then click <strong>Continue with Google</strong> again.</li>
                  </ol>

                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => void handleCopyHostname()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-900 bg-white border border-amber-300 rounded-lg hover:bg-amber-100/50 transition-colors"
                    >
                      {copiedDomainHost ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Copied {currentHostname}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Domain ({currentHostname})</span>
                        </>
                      )}
                    </button>

                    <a
                      href={firebaseConsoleAuthSettingsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
                    >
                      <span>Open Firebase Auth Settings</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
                <button
                  type="button"
                  disabled={isSigningIn}
                  onClick={() => {
                    clearAuthError();
                    void signInWithGoogle();
                  }}
                  className="inline-flex items-center justify-center gap-2.5 px-6 py-3 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
                >
                  {isSigningIn ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <span>Continue with Google</span>
                  )}
                </button>

                <Link
                  to="/#pricing"
                  className="inline-flex items-center justify-center px-5 py-3 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200/80 transition-colors whitespace-nowrap shrink-0"
                >
                  Compare Monthly Plans
                </Link>
              </div>
            </div>

            <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-slate-50/80 p-6 space-y-4">
              <p className="text-xs font-semibold text-slate-800">How Shop Subscription Works</p>
              <div className="space-y-3.5 text-xs text-slate-600">
                <div>
                  <p className="font-semibold text-slate-900">
                    01. Subscribe Monthly (or 7-Day Free Trial)
                  </p>
                  <p className="mt-0.5">
                    Plans start at ₹499/month for single shops, ₹999/month for up to 5 branches.
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    02. Paste Your Google Maps Link
                  </p>
                  <p className="mt-0.5">
                    Paste your Google Maps share link or type your shop name &amp; city — we connect it automatically.
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    03. Place Your Shop Counter QR Standee
                  </p>
                  <p className="mt-0.5">
                    Print your QR standee and place it at reception or billing. Customers scan, AI drafts their review, and they post on Google.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3. Unverified Email Guard
  if (!user.emailVerified) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-slate-50/70 py-14">
        <div className="max-w-lg mx-auto px-4 sm:px-6">
          <div className="rounded-2xl border border-amber-200 bg-white p-6 space-y-4">
            <h1 className="text-xl font-bold text-slate-900">Verified Google Email Required</h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Your signed-in account does not have a verified email address. Please sign in with a verified Google account to manage merchant subscriptions and QR scanners.
            </p>
            <button
              type="button"
              onClick={() => void signOutUser()}
              className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
            >
              Sign Out &amp; Switch Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  const effectiveTab: WorkspaceTab =
    !loadingSubscription && !hasValidSubscription && activeTab === 'shops'
      ? 'billing'
      : activeTab;

  // 4. Signed-In SaaS Merchant & Founder Portal
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50/70 py-8 sm:py-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-6">
        {/* Workspace Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>{user.displayName || user.email || 'Merchant Account'}</span>
              <span aria-hidden="true">·</span>
              <span>
                {subscription
                  ? `${getPlanDisplayName(subscription.planId)} (${
                      isSubscriptionCurrentlyValid(subscription) ? 'Active' : 'Expired'
                    })`
                  : isPlatformAdmin
                    ? 'Founder Admin Account'
                    : 'Choose Plan to Start'}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {liveAiConfigured
                  ? `Live AI (${activeAiProvider === 'openrouter' ? 'OpenRouter' : 'Gemini'})`
                  : 'Smart AI Mode'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950">
              Shop QR Scanners &amp; Subscription Portal
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {hasValidSubscription && effectiveTab === 'shops' && (
              <button
                type="button"
                onClick={() => {
                  setCreateError(null);
                  if (hasReachedShopLimit && !showCreateForm) {
                    setActiveTab('billing');
                    return;
                  }
                  setShowCreateForm((prev) => !prev);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>
                  {showCreateForm && businesses.length > 0
                    ? 'Close Form'
                    : hasReachedShopLimit
                      ? 'Upgrade Plan for More Shops'
                      : 'Add Shop Scanner'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => void signOutUser()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* 3-Step Onboarding Progress Strip + Mode Switcher */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span
              className={`font-medium ${
                hasValidSubscription ? 'text-emerald-700' : 'text-indigo-700 font-semibold'
              }`}
            >
              {hasValidSubscription ? '✓ 01. Plan Active' : '01. Choose Monthly Plan'}
            </span>
            <span className="text-slate-300" aria-hidden="true">
              /
            </span>
            <span
              className={`font-medium ${
                businesses.length > 0
                  ? 'text-emerald-700'
                  : hasValidSubscription
                    ? 'text-indigo-700 font-semibold'
                    : 'text-slate-400'
              }`}
            >
              {businesses.length > 0 ? '✓ 02. Google Maps Linked' : '02. Add Google Maps Link'}
            </span>
            <span className="text-slate-300" aria-hidden="true">
              /
            </span>
            <span
              className={`font-medium ${
                businesses.length > 0 ? 'text-emerald-700' : 'text-slate-400'
              }`}
            >
              {businesses.length > 0 ? '✓ 03. QR Standee Ready' : '03. Download Shop QR Standee'}
            </span>
          </div>

          <div
            role="tablist"
            aria-label="Workspace sections"
            className="inline-flex items-center p-1 bg-slate-200/75 rounded-xl self-start lg:self-auto"
          >
            <button
              type="button"
              role="tab"
              aria-selected={effectiveTab === 'shops'}
              onClick={() => setActiveTab('shops')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                effectiveTab === 'shops'
                  ? 'bg-white text-slate-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>My Shop Scanners ({businesses.length})</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={effectiveTab === 'billing'}
              onClick={() => setActiveTab('billing')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                effectiveTab === 'billing'
                  ? 'bg-white text-slate-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Subscription &amp; Billing</span>
            </button>

            {isPlatformAdmin && (
              <button
                type="button"
                role="tab"
                aria-selected={effectiveTab === 'admin'}
                onClick={() => setActiveTab('admin')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  effectiveTab === 'admin'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Founder Admin</span>
              </button>
            )}
          </div>
        </div>

        {firestoreBannerError && (
          <div
            role="alert"
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span>{firestoreBannerError}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setFirestoreBannerError(null);
                void reconnectFirestore();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-950 bg-white border border-amber-300 rounded-lg hover:bg-amber-100/60 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reconnect</span>
            </button>
          </div>
        )}

        {/* TAB 2: Subscription & Billing */}
        {effectiveTab === 'billing' && (
          <SubscriptionBillingPanel
            subscription={subscription}
            billingConfig={billingConfig}
            currentBusinessesCount={businesses.length}
            defaultAccountLabel={user.displayName || ''}
            initialPlanId={validInitialPlan}
            initialCycle={validInitialCycle}
            onActivated={(sub) => {
              setSubscription(sub);
              setActiveTab('shops');
              if (businesses.length === 0) {
                setShowCreateForm(true);
              }
            }}
          />
        )}

        {/* TAB 3: Founder Admin Console */}
        {effectiveTab === 'admin' && isPlatformAdmin && (
          <FounderAdminPanel
            billingConfig={billingConfig}
            onBillingConfigSaved={reloadBillingConfig}
          />
        )}

        {/* TAB 1: My Shop Scanners */}
        {effectiveTab === 'shops' && hasValidSubscription && (
          <>
            {/* Shop Switcher Tabs */}
            {businesses.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {businesses.map((biz) => {
                  const active = biz.slug === selectedSlug && !showCreateForm;
                  return (
                    <button
                      key={biz.slug}
                      type="button"
                      onClick={() => {
                        setSelectedSlug(biz.slug);
                        setShowCreateForm(false);
                      }}
                      className={`inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-slate-900 border-slate-900 text-white'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      <span>{biz.name}</span>
                      {!biz.isActive && <span className="text-[11px] opacity-75">(Paused)</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Step 2: Create New Shop QR Scanner Form */}
            {showCreateForm && (
              <section
                aria-labelledby="create-business-heading"
                className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <h2 id="create-business-heading" className="text-lg font-semibold text-slate-900">
                      {businesses.length === 0
                        ? 'Step 2: Enter your Shop Details & Google Maps Link'
                        : 'Add another Shop QR Scanner'}
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                      Paste your Google Maps share link (or generate from your shop name) to create your printable shop QR scanner immediately.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowGoogleUrlGuide((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 whitespace-nowrap shrink-0"
                  >
                    <HelpCircle className="w-4 h-4" />
                    <span>Which Google link can I paste?</span>
                  </button>
                </div>

                {showGoogleUrlGuide && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 space-y-1.5">
                    <p className="font-semibold text-slate-900">
                      You can paste ANY of these links — all of them work automatically:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-slate-600">
                      <li>
                        <strong>Google Maps App Share Link:</strong> Open your shop on Google Maps → tap <strong>Share</strong> → Copy &amp; paste right here (<code className="font-mono">https://maps.app.goo.gl/...</code>).
                      </li>
                      <li>
                        <strong>Google Business &ldquo;Ask for reviews&rdquo; Link:</strong> <code className="font-mono">https://g.page/r/.../review</code>
                      </li>
                      <li>
                        <strong>No link handy right now?</strong> Just type your Shop Name &amp; City, then click <strong>Generate Link from Shop Name</strong> below.
                      </li>
                    </ul>
                  </div>
                )}

                {createError && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs sm:text-sm text-red-800 flex items-start gap-2"
                  >
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <span>{createError}</span>
                  </div>
                )}

                <form onSubmit={(e) => void handleCreateSubmit(e)} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label htmlFor="new-biz-name" className="block text-xs font-semibold text-slate-700">
                        Shop / Business Name *
                      </label>
                      <input
                        id="new-biz-name"
                        type="text"
                        required
                        maxLength={80}
                        value={newName}
                        onChange={(e) => handleNameChangeForCreate(e.target.value)}
                        placeholder="e.g., Beyond The Beauty Clinic"
                        className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="new-biz-cat" className="block text-xs font-semibold text-slate-700">
                        Business Category *
                      </label>
                      <input
                        id="new-biz-cat"
                        type="text"
                        required
                        maxLength={60}
                        list="merchant-category-presets"
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        placeholder="e.g., Beauty & Skin Clinic"
                        className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                      <datalist id="merchant-category-presets">
                        {CATEGORY_SUGGESTIONS.map((cat) => (
                          <option key={cat} value={cat} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label htmlFor="new-biz-slug" className="block text-xs font-semibold text-slate-700">
                        Unique Scanner Page Slug *
                      </label>
                      <div className="flex items-center rounded-lg border border-slate-300 bg-slate-50 focus-within:ring-2 focus-within:ring-indigo-600 overflow-hidden">
                        <span className="px-3 py-2.5 text-xs font-mono text-slate-500 border-r border-slate-200 select-none shrink-0">
                          /review/
                        </span>
                        <input
                          id="new-biz-slug"
                          type="text"
                          required
                          maxLength={60}
                          value={newSlug}
                          onChange={(e) => {
                            setSlugTouched(true);
                            setNewSlug(e.target.value.toLowerCase());
                          }}
                          placeholder="beyond-beauty-clinic"
                          className="w-full min-w-0 px-3 py-2.5 text-sm font-mono bg-white text-slate-900 focus:outline-none"
                        />
                      </div>
                      <div className="text-xs">
                        {slugChecking ? (
                          <span className="text-slate-500">Checking availability...</span>
                        ) : newSlug.trim().length >= 2 && slugAvailable === true ? (
                          <span className="text-emerald-700 font-medium">
                            Available: /review/{normalizeMerchantSlug(newSlug)}
                          </span>
                        ) : newSlug.trim().length >= 2 && slugAvailable === false ? (
                          <span className="text-red-600 font-medium">
                            Already taken — try adding your city or branch
                          </span>
                        ) : (
                          <span className="text-slate-500">Lowercase letters, numbers &amp; hyphens</span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="new-biz-loc" className="block text-xs font-semibold text-slate-700">
                        Area / City (Optional)
                      </label>
                      <input
                        id="new-biz-loc"
                        type="text"
                        maxLength={80}
                        value={newLocation}
                        onChange={(e) => setNewLocation(e.target.value)}
                        placeholder="e.g., Andheri West, Mumbai"
                        className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label htmlFor="new-biz-url" className="block text-xs font-semibold text-slate-700">
                        Your Google Maps Link or Review Link *
                      </label>
                      <button
                        type="button"
                        onClick={handleAutoBuildCreateGoogleUrl}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 whitespace-nowrap shrink-0"
                      >
                        <Wand2 className="w-3.5 h-3.5" />
                        <span>Generate Link from Shop Name</span>
                      </button>
                    </div>
                    <input
                      id="new-biz-url"
                      type="text"
                      required
                      maxLength={500}
                      value={newGoogleUrl}
                      onChange={(e) => setNewGoogleUrl(e.target.value)}
                      onBlur={() => {
                        if (newGoogleUrl.trim()) {
                          setNewGoogleUrl(extractOrNormalizeGoogleUrl(newGoogleUrl));
                        }
                      }}
                      placeholder="Paste Google Maps share link (https://maps.app.goo.gl/...) or g.page review link"
                      className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                    <p className="text-[11px] text-slate-500">
                      Tip: Even if you paste full WhatsApp/Google Maps share text, we automatically extract your clean link.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={isCreating || slugAvailable === false}
                      className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
                    >
                      {isCreating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Generating Shop QR Scanner...</span>
                        </>
                      ) : (
                        <span>Create Shop Page &amp; Get QR Standee</span>
                      )}
                    </button>

                    {businesses.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowCreateForm(false)}
                        className="px-4 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200/80 transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              </section>
            )}

            {/* Loading state */}
            {loadingBusinesses && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 h-80 rounded-2xl bg-white border border-slate-200 animate-pulse" />
                <div className="lg:col-span-5 h-80 rounded-2xl bg-white border border-slate-200 animate-pulse" />
              </div>
            )}

            {/* Active Selected Shop Workspace */}
            {!loadingBusinesses && selectedBusiness && !showCreateForm && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Left 7 Cols: Shop Settings & Google Maps Link */}
                  <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-5">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                      <div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span>Scanner URL: /review/{selectedBusiness.slug}</span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              selectedBusiness.isActive
                                ? 'text-emerald-700 font-semibold'
                                : 'text-amber-700 font-semibold'
                            }
                          >
                            {selectedBusiness.isActive ? 'Scanner Active' : 'Scanner Paused'}
                          </span>
                        </div>
                        <h2 className="text-lg font-semibold text-slate-900 mt-0.5">
                          {selectedBusiness.name} — Shop Configuration
                        </h2>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleToggleActive()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200/80 transition-colors whitespace-nowrap shrink-0"
                        >
                          {selectedBusiness.isActive ? (
                            <>
                              <PauseCircle className="w-3.5 h-3.5 text-amber-600" />
                              <span>Pause Scanner</span>
                            </>
                          ) : (
                            <>
                              <PlayCircle className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Resume Scanner</span>
                            </>
                          )}
                        </button>

                        <Link
                          to={`/review/${selectedBusiness.slug}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors whitespace-nowrap shrink-0"
                        >
                          <span>Test Customer Page</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>

                    <form onSubmit={(e) => void handleSaveBusinessEdits(e)} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label htmlFor="edit-name" className="block text-xs font-semibold text-slate-700">
                            Shop / Business Name
                          </label>
                          <input
                            id="edit-name"
                            type="text"
                            required
                            maxLength={80}
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label htmlFor="edit-cat" className="block text-xs font-semibold text-slate-700">
                            Category
                          </label>
                          <input
                            id="edit-cat"
                            type="text"
                            required
                            maxLength={60}
                            list="merchant-category-presets"
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value)}
                            className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label htmlFor="edit-loc" className="block text-xs font-semibold text-slate-700">
                          Area / Branch Label
                        </label>
                        <input
                          id="edit-loc"
                          type="text"
                          maxLength={80}
                          value={editLocation}
                          onChange={(e) => setEditLocation(e.target.value)}
                          placeholder="e.g., Bandra West, Mumbai"
                          className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label htmlFor="edit-url" className="block text-xs font-semibold text-slate-700">
                            Google Maps / Google Review Link
                          </label>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={handleAutoBuildEditGoogleUrl}
                              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                            >
                              <Wand2 className="w-3.5 h-3.5" />
                              <span>Generate from Shop Name</span>
                            </button>
                            <a
                              href={extractOrNormalizeGoogleUrl(editGoogleUrl) || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
                            >
                              <MapPin className="w-3.5 h-3.5" />
                              <span>Verify Link</span>
                            </a>
                          </div>
                        </div>
                        <input
                          id="edit-url"
                          type="text"
                          required
                          maxLength={500}
                          value={editGoogleUrl}
                          onChange={(e) => setEditGoogleUrl(e.target.value)}
                          onBlur={() => {
                            if (editGoogleUrl.trim()) {
                              setEditGoogleUrl(extractOrNormalizeGoogleUrl(editGoogleUrl));
                            }
                          }}
                          className="w-full px-3.5 py-2 text-xs sm:text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                        />
                      </div>

                      <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                        <button
                          type="submit"
                          disabled={isSavingEdit}
                          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
                        >
                          {isSavingEdit ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Saving...</span>
                            </>
                          ) : (
                            <span>Save Live Changes</span>
                          )}
                        </button>

                        {editFeedback && (
                          <span
                            role="status"
                            className={`text-xs font-medium flex items-center gap-1.5 ${
                              editFeedback.type === 'error' ? 'text-red-600' : 'text-emerald-700'
                            }`}
                          >
                            {editFeedback.type === 'error' ? (
                              <AlertCircle className="w-4 h-4 shrink-0" />
                            ) : (
                              <Check className="w-4 h-4 shrink-0" />
                            )}
                            {editFeedback.text}
                          </span>
                        )}
                      </div>
                    </form>

                    {/* Two-step Delete Confirmation */}
                    <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                      {confirmDeleteSlug === selectedBusiness.slug ? (
                        <div className="flex flex-wrap items-center gap-2 w-full justify-between bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                          <span className="text-red-800 font-medium">
                            Permanently delete /review/{selectedBusiness.slug}?
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleConfirmDelete()}
                              className="px-3 py-1 font-semibold text-white bg-red-600 rounded hover:bg-red-700"
                            >
                              Confirm Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteSlug(null)}
                              className="px-3 py-1 font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <span className="text-slate-500">
                            Your QR code stays identical even when you update your Google link above.
                          </span>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteSlug(selectedBusiness.slug)}
                            className="inline-flex items-center gap-1 text-slate-500 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete Shop</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right 5 Cols: Step 3 — Shop Counter QR Standee Studio */}
                  <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900">
                          Shop Counter QR Standee
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Print &amp; place at your shop counter, billing desk, or tables.
                        </p>
                      </div>

                      <div
                        role="group"
                        aria-label="Standee color theme"
                        className="inline-flex items-center p-1 bg-slate-100 rounded-lg"
                      >
                        {(
                          [
                            { id: 'classic', label: 'White' },
                            { id: 'navy', label: 'Navy' },
                            { id: 'gold', label: 'Gold' },
                          ] as const
                        ).map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setStandeeTheme(t.id)}
                            className={`px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                              standeeTheme === t.id
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Visual Standee Card Preview */}
                    <div
                      className={`rounded-xl border p-5 flex flex-col items-center text-center space-y-2.5 transition-colors ${
                        standeeTheme === 'navy'
                          ? 'bg-slate-950 border-slate-800 text-white'
                          : standeeTheme === 'gold'
                            ? 'bg-amber-50/70 border-amber-200 text-slate-900'
                            : 'bg-slate-50/70 border-slate-200 text-slate-900'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <p className="text-sm font-bold tracking-tight">{selectedBusiness.name}</p>
                        <p
                          className={`text-[11px] ${
                            standeeTheme === 'navy' ? 'text-slate-300' : 'text-slate-500'
                          }`}
                        >
                          {[selectedBusiness.category, selectedBusiness.locationLabel]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>

                      <div className="flex items-center gap-1" aria-hidden="true">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className="w-3.5 h-3.5 fill-amber-400 text-amber-400"
                          />
                        ))}
                      </div>

                      <p
                        className={`text-xs font-semibold ${
                          standeeTheme === 'navy' ? 'text-slate-100' : 'text-slate-800'
                        }`}
                      >
                        Scan to Write a Google Review in 10s
                      </p>

                      {qrPngUrl ? (
                        <img
                          src={qrPngUrl}
                          alt={`Shop QR code for ${selectedBusiness.name}`}
                          className="w-44 h-44 rounded-lg border border-slate-200 bg-white p-2"
                        />
                      ) : (
                        <div className="w-44 h-44 rounded-lg bg-slate-200/70 animate-pulse" />
                      )}

                      <p
                        className={`text-[11px] ${
                          standeeTheme === 'navy' ? 'text-slate-400' : 'text-slate-500'
                        }`}
                      >
                        1. Scan QR · 2. Edit AI Draft · 3. Paste on Google
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700">Customer Scanner URL</span>
                        <button
                          type="button"
                          onClick={() => void handleCopyLiveLink()}
                          className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:text-indigo-700"
                        >
                          {copiedLink ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy Link</span>
                            </>
                          )}
                        </button>
                      </div>
                      <div className="px-3 py-2 rounded-lg bg-slate-100 border border-slate-200 text-xs font-mono text-slate-800 break-all">
                        {liveCustomerUrl}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isExportingPoster || !qrPngUrl}
                      onClick={() => void handleDownloadPosterCard()}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                    >
                      <FileImage className="w-4 h-4" />
                      <span>
                        {isExportingPoster
                          ? 'Rendering Standee...'
                          : 'Download Shop Standee Poster (PNG)'}
                      </span>
                    </button>

                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        disabled={!qrPngUrl}
                        onClick={handleDownloadRawPng}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-100 rounded-lg hover:bg-slate-200/80 transition-colors whitespace-nowrap shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Raw QR PNG</span>
                      </button>

                      <button
                        type="button"
                        disabled={!qrSvgStr}
                        onClick={handleDownloadSvg}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-100 rounded-lg hover:bg-slate-200/80 transition-colors whitespace-nowrap shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Vector SVG</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Real-Time Customer Session Analytics */}
                <section aria-labelledby="live-analytics-heading" className="space-y-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <h2 id="live-analytics-heading" className="text-lg font-semibold text-slate-900">
                        Live Customer Scanner Analytics — {selectedBusiness.name}
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Real-time anonymous QR scan telemetry · Tracks AI review drafts, copies, and Google Maps link clicks
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-1">
                      <p className="text-xs font-medium text-slate-500">Customer QR Sessions</p>
                      <p className="text-2xl font-bold text-slate-950 font-mono tabular-nums">
                        {realMetrics.totalVisits}
                      </p>
                      <p className="text-xs text-slate-500">Unique review-drafting visits</p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-1">
                      <p className="text-xs font-medium text-slate-500">Average Selected Rating</p>
                      <p className="text-2xl font-bold text-slate-950 font-mono tabular-nums">
                        {realMetrics.avgRating}
                        {realMetrics.totalVisits > 0 ? ' / 5.0' : ''}
                      </p>
                      <p className="text-xs text-slate-500">Across customer QR drafts</p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-1">
                      <p className="text-xs font-medium text-slate-500">Review Copy Rate</p>
                      <p className="text-2xl font-bold text-slate-950 font-mono tabular-nums">
                        {realMetrics.copyPct}
                      </p>
                      <p className="text-xs text-slate-500">
                        {realMetrics.copiedCount} of {realMetrics.totalVisits} copied draft
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-1">
                      <p className="text-xs font-medium text-slate-500">Opened Google Link</p>
                      <p className="text-2xl font-bold text-slate-950 font-mono tabular-nums">
                        {realMetrics.googlePct}
                      </p>
                      <p className="text-xs text-slate-500">
                        {realMetrics.googleOpenedCount} tapped through to Google
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* Live Star Distribution */}
                    <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">
                          Rating Distribution
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Stars selected by customers scanning /review/{selectedBusiness.slug}
                        </p>
                      </div>

                      <div className="space-y-3">
                        {[5, 4, 3, 2, 1].map((star) => {
                          const count = realMetrics.ratingDist[star] ?? 0;
                          const pct =
                            realMetrics.totalVisits > 0
                              ? Math.round((count / realMetrics.totalVisits) * 100)
                              : 0;
                          return (
                            <div key={star} className="flex items-center gap-3 text-xs sm:text-sm">
                              <div className="w-12 flex items-center gap-1 font-mono font-medium text-slate-700 tabular-nums shrink-0">
                                <span>{star}</span>
                                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                              </div>
                              <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-200 ${
                                    star >= 4
                                      ? 'bg-indigo-600'
                                      : star === 3
                                        ? 'bg-amber-500'
                                        : 'bg-rose-500'
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <div className="w-20 text-right font-mono text-xs text-slate-600 tabular-nums shrink-0">
                                {count} ({pct}%)
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Live Anonymous Sessions Stream */}
                    <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white overflow-hidden">
                      <div className="p-5 sm:p-6 border-b border-slate-200 space-y-4">
                        <div>
                          <h3 className="text-base font-semibold text-slate-900">
                            Recent Customer Scanner Activity
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Updates live as guests scan your counter QR standee
                          </p>
                        </div>

                        {realMetrics.totalVisits > 0 && (
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
                              {(['All', 'English', 'Hindi', 'Hinglish'] as const).map((lang) => (
                                <button
                                  key={lang}
                                  type="button"
                                  onClick={() => setLangFilter(lang)}
                                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                                    langFilter === lang
                                      ? 'bg-white text-slate-900 shadow-xs'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  {lang}
                                </button>
                              ))}
                            </div>

                            <div className="flex items-center gap-2">
                              <select
                                aria-label="Filter by rating sentiment"
                                value={ratingFilter}
                                onChange={(e) =>
                                  setRatingFilter(
                                    e.target.value as 'All' | 'Positive' | 'Neutral' | 'Negative'
                                  )
                                }
                                className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                              >
                                <option value="All">All Ratings</option>
                                <option value="Positive">Positive (4–5★)</option>
                                <option value="Neutral">Neutral (3★)</option>
                                <option value="Negative">Negative (1–2★)</option>
                              </select>

                              <div className="relative flex-1 sm:w-36">
                                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <input
                                  type="search"
                                  value={searchQuery}
                                  onChange={(e) => setSearchQuery(e.target.value)}
                                  placeholder="Filter..."
                                  aria-label="Filter live sessions"
                                  className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {loadingSessions ? (
                        <div className="p-5 space-y-3">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="h-9 rounded-lg bg-slate-100 animate-pulse" />
                          ))}
                        </div>
                      ) : realMetrics.totalVisits === 0 ? (
                        <div className="p-8 sm:p-10 text-center space-y-3">
                          <p className="text-sm font-semibold text-slate-900">
                            No customer QR scans yet for {selectedBusiness.name}
                          </p>
                          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                            Scan your shop QR code above with your phone camera (or click Test Customer Page) to watch live sessions appear here.
                          </p>
                          <div className="pt-1">
                            <a
                              href={`/review/${selectedBusiness.slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                            >
                              <span>Open Customer Scanner Page</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </div>
                      ) : filteredVisits.length === 0 ? (
                        <div className="p-8 text-center space-y-2">
                          <p className="text-sm font-medium text-slate-800">
                            No sessions match your active filters
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setLangFilter('All');
                              setRatingFilter('All');
                              setSearchQuery('');
                            }}
                            className="px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100"
                          >
                            Reset Filters
                          </button>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                                <th className="py-2.5 px-4 sm:px-5">Time</th>
                                <th className="py-2.5 px-3">Rating</th>
                                <th className="py-2.5 px-3">Language</th>
                                <th className="py-2.5 px-3">Prompts</th>
                                <th className="py-2.5 px-4 sm:px-5 text-right">Farthest Step</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs">
                              {filteredVisits.map((visit) => (
                                <tr
                                  key={visit.visitId}
                                  className="hover:bg-slate-50/80 transition-colors"
                                >
                                  <td className="py-3 px-4 sm:px-5 text-slate-700 whitespace-nowrap">
                                    {formatRelativeTime(visit.latestAtMs)}
                                  </td>
                                  <td className="py-3 px-3 font-mono font-medium text-slate-900 tabular-nums whitespace-nowrap">
                                    {visit.rating}.0 ★
                                  </td>
                                  <td className="py-3 px-3 text-slate-700 whitespace-nowrap">
                                    {visit.language}
                                  </td>
                                  <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                                    {visit.usedOptionalPrompts ? 'Answered' : 'Skipped'}
                                  </td>
                                  <td className="py-3 px-4 sm:px-5 text-right font-medium text-slate-800 whitespace-nowrap">
                                    {stageLabel(visit.highestStage)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
