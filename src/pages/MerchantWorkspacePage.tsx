import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileImage,
  HelpCircle,
  Loader2,
  LogOut,
  PauseCircle,
  PlayCircle,
  Plus,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { isQuotaExceededError } from '../lib/firebase';
import {
  checkBusinessSlugAvailable,
  createRealBusiness,
  deleteRealBusiness,
  normalizeMerchantSlug,
  setRealBusinessActiveStatus,
  subscribeBusinessSessions,
  subscribeOwnerBusinesses,
  updateRealBusinessDetails,
  validateGoogleReviewUrl,
  validateMerchantSlug,
} from '../services/firestoreService';
import type {
  RealBusinessRecord,
  RealSessionEventRecord,
  ReviewLanguage,
} from '../types/review';
import { copyTextToClipboard } from '../utils/clipboard';
import { generatePrintableQrCardDataUrl } from '../utils/qrPosterExport';

const CATEGORY_SUGGESTIONS = [
  'Cafe & Restaurant',
  'Dental & Medical Clinic',
  'Salon & Wellness',
  'Retail & Boutique',
  'Hotel & Hospitality',
  'Home & Auto Services',
];

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

  const {
    user,
    authReady,
    isSigningIn,
    authError,
    signInWithGoogle,
    signOutUser,
    clearAuthError,
  } = useAuth();
  const { serverAppUrl, liveAiConfigured, activeAiProvider } = useBusiness();

  // Owner's businesses list
  const [businesses, setBusinesses] = useState<RealBusinessRecord[]>([]);
  const [loadingBusinesses, setLoadingBusinesses] = useState<boolean>(true);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [firestoreBannerError, setFirestoreBannerError] = useState<string | null>(null);

  // Create new business form state
  const [newName, setNewName] = useState<string>('');
  const [newCategory, setNewCategory] = useState<string>('Cafe & Restaurant');
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

  // QR assets for selected business
  const [qrPngUrl, setQrPngUrl] = useState<string>('');
  const [qrSvgStr, setQrSvgStr] = useState<string>('');
  const [isExportingPoster, setIsExportingPoster] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  const publicOrigin = useMemo(() => {
    if (serverAppUrl) return serverAppUrl;
    if (typeof window !== 'undefined') return window.location.origin;
    return 'http://localhost:3000';
  }, [serverAppUrl]);

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
        } else {
          setFirestoreBannerError('Unable to load your businesses. Please refresh and try again.');
        }
      }
    );

    return () => unsub();
  }, [authReady, user]);

  const selectedBusiness = useMemo(
    () => businesses.find((b) => b.slug === selectedSlug) ?? null,
    [businesses, selectedSlug]
  );

  // Sync edit form inputs whenever selected business changes
  useEffect(() => {
    if (!selectedBusiness) return;
    setEditName(selectedBusiness.name);
    setEditCategory(selectedBusiness.category);
    setEditLocation(selectedBusiness.locationLabel);
    setEditGoogleUrl(selectedBusiness.googleReviewUrl);
    setEditFeedback(null);
    setConfirmDeleteSlug(null);
  }, [selectedBusiness]);

  // Subscribe to real-time session events for the selected business
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

  // Render QR PNG & SVG for selected business
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

  // Aggregate real conversion metrics by unique visitId
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

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    const normalizedSlug = normalizeMerchantSlug(newSlug);
    const slugErr = validateMerchantSlug(normalizedSlug);
    if (slugErr) {
      setCreateError(slugErr);
      return;
    }
    const urlErr = validateGoogleReviewUrl(newGoogleUrl);
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
        googleReviewUrl: newGoogleUrl,
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
        err instanceof Error ? err.message : 'Could not create business profile.'
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveBusinessEdits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBusiness) return;
    setEditFeedback(null);

    const urlErr = validateGoogleReviewUrl(editGoogleUrl);
    if (urlErr) {
      setEditFeedback({ type: 'error', text: urlErr });
      return;
    }

    setIsSavingEdit(true);
    try {
      await updateRealBusinessDetails(selectedBusiness.slug, {
        name: editName,
        category: editCategory,
        locationLabel: editLocation,
        googleReviewUrl: editGoogleUrl,
      });
      setEditFeedback({
        type: 'success',
        text: 'Live business profile saved to Cloud Firestore.',
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
        text: err instanceof Error ? err.message : 'Unable to delete business.',
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
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${selectedBusiness.slug}-tabletop-qr-poster.png`;
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
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-slate-50/70 py-12 sm:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-5">
              <div className="flex items-center gap-2 text-xs font-medium text-indigo-600">
                <span>Live Cloud Workspace</span>
                <span aria-hidden="true">·</span>
                <span>Google Sign-In</span>
              </div>

              <h1
                className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950"
                style={{ textWrap: 'balance' }}
              >
                Launch a real QR review page for your business in under a minute.
              </h1>

              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                Sign in with your Google account to claim your custom URL slug, connect your official Google Business Profile review link, print counter-ready QR cards, and monitor real-time anonymous customer sessions.
              </p>

              <ul className="space-y-2.5 text-sm text-slate-700 pt-1">
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-indigo-600 shrink-0 mt-1" />
                  <span>
                    Permanent cloud-hosted customer URLs such as{' '}
                    <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                      /review/{claimSlugParam || 'your-business'}
                    </code>
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-indigo-600 shrink-0 mt-1" />
                  <span>
                    Live server-side Gemini AI review drafting in English, Hindi, and Hinglish
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-indigo-600 shrink-0 mt-1" />
                  <span>
                    Print-ready tabletop QR stand posters (1200×1520 PNG + vector SVG)
                  </span>
                </li>
              </ul>

              {authError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs sm:text-sm text-red-800 flex items-start gap-2.5"
                >
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{authError}</span>
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
                  to="/business-demo"
                  className="inline-flex items-center justify-center px-5 py-3 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200/80 transition-colors whitespace-nowrap shrink-0"
                >
                  Preview Sandbox Demo First
                </Link>
              </div>
            </div>

            <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-slate-50/80 p-6 space-y-4">
              <p className="text-xs font-semibold text-slate-800">How Real-World Setup Works</p>
              <div className="space-y-3.5 text-xs text-slate-600">
                <div>
                  <p className="font-semibold text-slate-900">01. Claim your unique slug</p>
                  <p className="mt-0.5">
                    Pick a clean link like <code className="font-mono">/review/aroma-bistro</code> stored in Cloud Firestore.
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    02. Paste your Google &ldquo;Ask for reviews&rdquo; URL
                  </p>
                  <p className="mt-0.5">
                    Copy your direct review link from Google Business Profile so customers land right on your Google rating box.
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-slate-900">03. Print your counter QR card</p>
                  <p className="mt-0.5">
                    Place the QR card at tables, reception, or invoices. Customers scan, draft in seconds, and post on Google themselves.
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
              Your signed-in account does not have a verified email address. Please sign in with a verified Google account to create and manage public merchant QR pages.
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

  // 4. Signed-In Multi-Business Merchant Workspace
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50/70 py-8 sm:py-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-7">
        {/* Workspace Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>Merchant Workspace</span>
              <span aria-hidden="true">·</span>
              <span>{user.displayName || user.email || 'Signed In'}</span>
              <span aria-hidden="true">·</span>
              <span>
                {liveAiConfigured
                  ? `Live AI (${activeAiProvider === 'openrouter' ? 'OpenRouter' : 'Gemini'})`
                  : 'Template AI Mode'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950">
              Your Businesses &amp; Live QR Codes
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setCreateError(null);
                setShowCreateForm((prev) => !prev);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{showCreateForm && businesses.length > 0 ? 'Close Form' : 'New Business'}</span>
            </button>

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

        {firestoreBannerError && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start gap-2.5"
          >
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{firestoreBannerError}</span>
          </div>
        )}

        {/* Business Switcher Tabs when owner has businesses */}
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
                  {!biz.isActive && (
                    <span className="text-[11px] opacity-75">(Paused)</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Create New Business Panel */}
        {showCreateForm && (
          <section
            aria-labelledby="create-business-heading"
            className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 id="create-business-heading" className="text-lg font-semibold text-slate-900">
                  {businesses.length === 0
                    ? 'Create your first real business QR page'
                    : 'Add another business location'}
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Saved directly to Cloud Firestore so any customer scanning your QR code loads your live page.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGoogleUrlGuide((prev) => !prev)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 whitespace-nowrap shrink-0"
              >
                <HelpCircle className="w-4 h-4" />
                <span>How to find my Google Review link?</span>
              </button>
            </div>

            {showGoogleUrlGuide && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 space-y-1.5">
                <p className="font-semibold text-slate-900">
                  Finding your official Google Business Profile review link:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-slate-600">
                  <li>Search your exact business name on Google while signed into your business account.</li>
                  <li>
                    Click <strong>Ask for reviews</strong> in your Google Business Profile manager panel.
                  </li>
                  <li>
                    Copy the <code className="font-mono">https://g.page/r/.../review</code> or{' '}
                    <code className="font-mono">https://search.google.com/local/writereview?placeid=...</code> link and paste it below.
                  </li>
                </ol>
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
                    Business Name *
                  </label>
                  <input
                    id="new-biz-name"
                    type="text"
                    required
                    maxLength={80}
                    value={newName}
                    onChange={(e) => handleNameChangeForCreate(e.target.value)}
                    placeholder="e.g., Third Wave Roasters"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="new-biz-cat" className="block text-xs font-semibold text-slate-700">
                    Category *
                  </label>
                  <input
                    id="new-biz-cat"
                    type="text"
                    required
                    maxLength={60}
                    list="merchant-category-presets"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="e.g., Cafe & Restaurant"
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
                    Unique QR URL Slug *
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
                      placeholder="third-wave-koramangala"
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
                        Already taken or reserved — try adding your city or branch
                      </span>
                    ) : (
                      <span className="text-slate-500">Lowercase letters, numbers, and hyphens</span>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="new-biz-loc" className="block text-xs font-semibold text-slate-700">
                    Neighborhood / City (Optional)
                  </label>
                  <input
                    id="new-biz-loc"
                    type="text"
                    maxLength={80}
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    placeholder="e.g., Koramangala, Bengaluru"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="new-biz-url" className="block text-xs font-semibold text-slate-700">
                  Official Google Review URL *
                </label>
                <input
                  id="new-biz-url"
                  type="url"
                  required
                  maxLength={500}
                  value={newGoogleUrl}
                  onChange={(e) => setNewGoogleUrl(e.target.value)}
                  placeholder="https://g.page/r/.../review or https://search.google.com/local/writereview?placeid=..."
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
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
                      <span>Creating Live Page...</span>
                    </>
                  ) : (
                    <span>Create Live Business &amp; Generate QR</span>
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

        {/* Loading state for initial businesses */}
        {loadingBusinesses && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 h-80 rounded-2xl bg-white border border-slate-200 animate-pulse" />
            <div className="lg:col-span-5 h-80 rounded-2xl bg-white border border-slate-200 animate-pulse" />
          </div>
        )}

        {/* Active Selected Business Workspace */}
        {!loadingBusinesses && selectedBusiness && !showCreateForm && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left 7 Cols: Live Business Settings */}
              <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>Slug: /review/{selectedBusiness.slug}</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          selectedBusiness.isActive
                            ? 'text-emerald-700 font-semibold'
                            : 'text-amber-700 font-semibold'
                        }
                      >
                        {selectedBusiness.isActive ? 'Live & Public' : 'Paused'}
                      </span>
                    </div>
                    <h2 className="text-lg font-semibold text-slate-900 mt-0.5">
                      {selectedBusiness.name} — Configuration
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
                          <span>Pause QR Page</span>
                        </>
                      ) : (
                        <>
                          <PlayCircle className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Resume QR Page</span>
                        </>
                      )}
                    </button>

                    <Link
                      to={`/review/${selectedBusiness.slug}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors whitespace-nowrap shrink-0"
                    >
                      <span>Open Live Page</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>

                <form onSubmit={(e) => void handleSaveBusinessEdits(e)} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label htmlFor="edit-name" className="block text-xs font-semibold text-slate-700">
                        Business Name
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
                      Public Location / Branch Label
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
                    <label htmlFor="edit-url" className="block text-xs font-semibold text-slate-700">
                      Official Google Review URL
                    </label>
                    <input
                      id="edit-url"
                      type="url"
                      required
                      maxLength={500}
                      value={editGoogleUrl}
                      onChange={(e) => setEditGoogleUrl(e.target.value)}
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

                {/* Inline two-step Delete Confirmation (no window.confirm) */}
                <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                  {confirmDeleteSlug === selectedBusiness.slug ? (
                    <div className="flex flex-wrap items-center gap-2 w-full justify-between bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      <span className="text-red-800 font-medium">
                        Permanently release /review/{selectedBusiness.slug}?
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
                        URL slug is permanent once printed on table stands.
                      </span>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteSlug(selectedBusiness.slug)}
                        className="inline-flex items-center gap-1 text-slate-500 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Business</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Right 5 Cols: Print-Ready QR Code Card & Exports */}
              <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-lg font-semibold text-slate-900">
                    Scannable QR &amp; Counter Stand
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Print on table tents, checkout stands, or receipts.
                  </p>
                </div>

                <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50/70 p-5 space-y-2.5">
                  {qrPngUrl ? (
                    <img
                      src={qrPngUrl}
                      alt={`QR code for ${selectedBusiness.name}`}
                      className="w-48 h-48 rounded-lg border border-slate-200 bg-white p-2"
                    />
                  ) : (
                    <div className="w-48 h-48 rounded-lg bg-slate-200/70 animate-pulse" />
                  )}
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-900">{selectedBusiness.name}</p>
                    <p className="text-xs text-slate-500">
                      {[selectedBusiness.category, selectedBusiness.locationLabel]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">Live Customer Review Link</span>
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
                      ? 'Rendering Poster...'
                      : 'Download Printable Tabletop Poster (PNG)'}
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
                    Real-Time Customer QR Analytics — {selectedBusiness.name}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Live anonymous session telemetry from Cloud Firestore · Tracks review drafting, copies, and Google link handoffs (never auto-posts)
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-1">
                  <p className="text-xs font-medium text-slate-500">Unique QR Draft Visits</p>
                  <p className="text-2xl font-bold text-slate-950 font-mono tabular-nums">
                    {realMetrics.totalVisits}
                  </p>
                  <p className="text-xs text-slate-500">Real customer sessions recorded</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-1">
                  <p className="text-xs font-medium text-slate-500">Average Selected Rating</p>
                  <p className="text-2xl font-bold text-slate-950 font-mono tabular-nums">
                    {realMetrics.avgRating}
                    {realMetrics.totalVisits > 0 ? ' / 5.0' : ''}
                  </p>
                  <p className="text-xs text-slate-500">Across live QR review drafts</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-1">
                  <p className="text-xs font-medium text-slate-500">Clipboard Copy Rate</p>
                  <p className="text-2xl font-bold text-slate-950 font-mono tabular-nums">
                    {realMetrics.copyPct}
                  </p>
                  <p className="text-xs text-slate-500">
                    {realMetrics.copiedCount} of {realMetrics.totalVisits} visits copied text
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-1">
                  <p className="text-xs font-medium text-slate-500">Opened Google Link</p>
                  <p className="text-2xl font-bold text-slate-950 font-mono tabular-nums">
                    {realMetrics.googlePct}
                  </p>
                  <p className="text-xs text-slate-500">
                    {realMetrics.googleOpenedCount} clicked through to Google
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Live Star Distribution */}
                <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">
                      Live Rating Distribution
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Ratings selected by customers on /review/{selectedBusiness.slug}
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
                        Live Anonymous Customer Sessions
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Updates automatically in real time as guests scan your QR code
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
                        No customer QR scans recorded yet for {selectedBusiness.name}
                      </p>
                      <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                        Open your live customer review page in a new tab or scan the QR code above with your phone to watch real-time sessions appear here immediately.
                      </p>
                      <div className="pt-1">
                        <a
                          href={`/review/${selectedBusiness.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                          <span>Test Live Customer Page</span>
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
      </div>
    </div>
  );
}
