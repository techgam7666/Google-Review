import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  Building2,
  Check,
  Copy,
  Database,
  Download,
  ExternalLink,
  Loader2,
  Lock,
  LogOut,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
} from 'lucide-react';
import { FounderAdminPanel } from './FounderAdminPanel';
import { useAuth } from '../context/AuthContext';
import {
  SUPABASE_BOOTSTRAP_SQL,
  SUPABASE_SQL_EDITOR_URL,
} from '../lib/supabaseSchemaSql';
import {
  DEFAULT_BILLING_CONFIG,
  fetchPlatformBillingConfig,
  isSupabaseSchemaMissing,
  subscribeAllPlatformBusinesses,
  subscribeMerchantAnalyticsSessions,
  subscribeOwnerBusinesses,
  verifySupabaseSchemaReady,
} from '../services/firestoreService';
import type {
  PlatformBillingConfigRecord,
  RealBusinessRecord,
  RealSessionEventRecord,
  ReviewLanguage,
} from '../types/review';
import { copyTextToClipboard } from '../utils/clipboard';

export interface AdminDashboardProps {
  embedded?: boolean;
}

type TimeRangeFilter = '7d' | '30d' | '90d' | 'all';

interface AggregatedVisit {
  visitId: string;
  businessSlug: string;
  rating: number;
  language: ReviewLanguage;
  usedOptionalPrompts: boolean;
  hasDraft: boolean;
  hasCopied: boolean;
  hasOpenedGoogle: boolean;
  highestStage: RealSessionEventRecord['stage'];
  latestAtMs: number;
}

function formatRelativeTime(timestampMs: number): string {
  if (!timestampMs) return '—';
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

function formatStageLabel(stage: RealSessionEventRecord['stage']): string {
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

export function AdminDashboard({ embedded = false }: AdminDashboardProps) {
  const {
    user,
    authReady,
    isSigningIn,
    authError,
    authNotice,
    isPlatformAdmin,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signOutUser,
    clearAuthError,
  } = useAuth();

  // Signed-out login gate form state
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authFullName, setAuthFullName] = useState<string>('');
  const [authEmail, setAuthEmail] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');

  // Standalone /admin view switcher (Analytics vs Founder Admin Console)
  const [adminSection, setAdminSection] = useState<'analytics' | 'founder'>('analytics');
  const [billingConfig, setBillingConfig] =
    useState<PlatformBillingConfigRecord>(DEFAULT_BILLING_CONFIG);

  // Supabase analytics & filter state (only active when user is authenticated)
  const [platformScope, setPlatformScope] = useState<'mine' | 'all'>('mine');
  const [businesses, setBusinesses] = useState<RealBusinessRecord[]>([]);
  const [sessionEvents, setSessionEvents] = useState<RealSessionEventRecord[]>([]);
  const [loadingBusinesses, setLoadingBusinesses] = useState<boolean>(true);
  const [loadingSessions, setLoadingSessions] = useState<boolean>(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [schemaMissing, setSchemaMissing] = useState<boolean>(false);
  const [checkingSchema, setCheckingSchema] = useState<boolean>(false);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);
  const [reloadNonce, setReloadNonce] = useState<number>(0);

  // Interactive client-side analytics filters
  const [timeRange, setTimeRange] = useState<TimeRangeFilter>('30d');
  const [selectedShopSlug, setSelectedShopSlug] = useState<string>('all');
  const [languageFilter, setLanguageFilter] = useState<'All' | ReviewLanguage>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const includeAllPlatform = Boolean(isPlatformAdmin && platformScope === 'all');

  const reloadBillingConfig = () => {
    if (!authReady || !user || !isPlatformAdmin) return;
    fetchPlatformBillingConfig()
      .then((cfg) => setBillingConfig(cfg))
      .catch(() => {
        // Keep defaults
      });
  };

  useEffect(() => {
    if (authReady && user && isPlatformAdmin) {
      setPlatformScope('all');
      reloadBillingConfig();
    }
  }, [authReady, user, isPlatformAdmin]);

  // Strictly fetch from Supabase ONLY when merchant is authenticated
  useEffect(() => {
    if (!authReady || !user) {
      setBusinesses([]);
      setSessionEvents([]);
      setLoadingBusinesses(false);
      setLoadingSessions(false);
      setErrorBanner(null);
      setSchemaMissing(false);
      return;
    }

    setLoadingBusinesses(true);
    setLoadingSessions(true);
    setErrorBanner(null);

    const handleFetchError = (err: Error) => {
      if (isSupabaseSchemaMissing(err)) {
        setSchemaMissing(true);
        setErrorBanner(null);
      } else {
        setErrorBanner(
          err.message || 'Unable to load analytics from Supabase. Click Refresh to try again.'
        );
      }
    };

    const unsubBusinesses = includeAllPlatform
      ? subscribeAllPlatformBusinesses(
          (items) => {
            setBusinesses(items);
            setLoadingBusinesses(false);
            setSchemaMissing(false);
          },
          (err) => {
            setLoadingBusinesses(false);
            handleFetchError(err);
          }
        )
      : subscribeOwnerBusinesses(
          user.uid,
          (items) => {
            setBusinesses(items);
            setLoadingBusinesses(false);
            setSchemaMissing(false);
          },
          (err) => {
            setLoadingBusinesses(false);
            handleFetchError(err);
          }
        );

    const unsubSessions = subscribeMerchantAnalyticsSessions(
      user.uid,
      includeAllPlatform,
      (events) => {
        setSessionEvents(events);
        setLoadingSessions(false);
        setSchemaMissing(false);
      },
      (err) => {
        setLoadingSessions(false);
        handleFetchError(err);
      }
    );

    return () => {
      unsubBusinesses();
      unsubSessions();
    };
  }, [authReady, user, includeAllPlatform, reloadNonce]);

  // Reset selected shop filter if no longer in current list
  useEffect(() => {
    if (
      selectedShopSlug !== 'all' &&
      businesses.length > 0 &&
      !businesses.some((b) => b.slug === selectedShopSlug)
    ) {
      setSelectedShopSlug('all');
    }
  }, [businesses, selectedShopSlug]);

  const businessLookup = useMemo(() => {
    const map = new Map<string, RealBusinessRecord>();
    for (const biz of businesses) {
      map.set(biz.slug, biz);
    }
    return map;
  }, [businesses]);

  // Group raw Supabase session events by anonymous visitId + businessSlug
  const analytics = useMemo(() => {
    const now = Date.now();
    const cutoffMs =
      timeRange === '7d'
        ? now - 7 * 24 * 60 * 60 * 1000
        : timeRange === '30d'
          ? now - 30 * 24 * 60 * 60 * 1000
          : timeRange === '90d'
            ? now - 90 * 24 * 60 * 60 * 1000
            : 0;

    const visitMap = new Map<string, AggregatedVisit>();

    for (const ev of sessionEvents) {
      if (cutoffMs > 0 && ev.createdAtMs < cutoffMs) continue;
      if (selectedShopSlug !== 'all' && ev.businessSlug !== selectedShopSlug) continue;
      if (languageFilter !== 'All' && ev.language !== languageFilter) continue;

      const compositeKey = `${ev.businessSlug}::${ev.visitId}`;
      const existing = visitMap.get(compositeKey);
      if (!existing) {
        visitMap.set(compositeKey, {
          visitId: ev.visitId,
          businessSlug: ev.businessSlug,
          rating: ev.rating,
          language: ev.language,
          usedOptionalPrompts: ev.usedOptionalPrompts,
          hasDraft: true,
          hasCopied: ev.stage === 'copied_review' || ev.stage === 'opened_google',
          hasOpenedGoogle: ev.stage === 'opened_google',
          highestStage: ev.stage,
          latestAtMs: ev.createdAtMs,
        });
      } else {
        existing.rating = ev.rating;
        existing.language = ev.language;
        existing.usedOptionalPrompts = existing.usedOptionalPrompts || ev.usedOptionalPrompts;
        if (ev.stage === 'copied_review') existing.hasCopied = true;
        if (ev.stage === 'opened_google') {
          existing.hasCopied = true;
          existing.hasOpenedGoogle = true;
          existing.highestStage = 'opened_google';
        } else if (ev.stage === 'copied_review' && existing.highestStage !== 'opened_google') {
          existing.highestStage = 'copied_review';
        }
        if (ev.createdAtMs > existing.latestAtMs) {
          existing.latestAtMs = ev.createdAtMs;
        }
      }
    }

    const visits = Array.from(visitMap.values()).sort((a, b) => b.latestAtMs - a.latestAtMs);
    const totalReviewsGenerated = visits.length;
    const totalCopied = visits.filter((v) => v.hasCopied).length;
    const totalOpenedGoogle = visits.filter((v) => v.hasOpenedGoogle).length;
    const totalPromptEnriched = visits.filter((v) => v.usedOptionalPrompts).length;

    const ratingDist: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    const languageDist: Record<ReviewLanguage, number> = {
      English: 0,
      Hindi: 0,
      Hinglish: 0,
    };

    let ratingSum = 0;
    for (const v of visits) {
      if (ratingDist[v.rating] !== undefined) {
        ratingDist[v.rating] += 1;
      }
      if (languageDist[v.language] !== undefined) {
        languageDist[v.language] += 1;
      }
      ratingSum += v.rating;
    }

    const avgRating =
      totalReviewsGenerated > 0 ? (ratingSum / totalReviewsGenerated).toFixed(2) : '—';
    const copyRatePct =
      totalReviewsGenerated > 0
        ? Math.round((totalCopied / totalReviewsGenerated) * 100)
        : 0;
    const googleConversionPct =
      totalReviewsGenerated > 0
        ? Math.round((totalOpenedGoogle / totalReviewsGenerated) * 100)
        : 0;
    const promptDepthPct =
      totalReviewsGenerated > 0
        ? Math.round((totalPromptEnriched / totalReviewsGenerated) * 100)
        : 0;

    // Per-business breakdown rows
    const perShopMap = new Map<
      string,
      {
        slug: string;
        name: string;
        category: string;
        isActive: boolean;
        generated: number;
        copied: number;
        openedGoogle: number;
        ratingSum: number;
        latestAtMs: number;
      }
    >();

    for (const biz of businesses) {
      if (selectedShopSlug !== 'all' && biz.slug !== selectedShopSlug) continue;
      perShopMap.set(biz.slug, {
        slug: biz.slug,
        name: biz.name,
        category: biz.category,
        isActive: biz.isActive,
        generated: 0,
        copied: 0,
        openedGoogle: 0,
        ratingSum: 0,
        latestAtMs: 0,
      });
    }

    for (const v of visits) {
      const bizMeta = businessLookup.get(v.businessSlug);
      const row =
        perShopMap.get(v.businessSlug) ??
        {
          slug: v.businessSlug,
          name: bizMeta?.name ?? v.businessSlug,
          category: bizMeta?.category ?? 'Merchant Shop',
          isActive: bizMeta?.isActive ?? true,
          generated: 0,
          copied: 0,
          openedGoogle: 0,
          ratingSum: 0,
          latestAtMs: 0,
        };
      row.generated += 1;
      if (v.hasCopied) row.copied += 1;
      if (v.hasOpenedGoogle) row.openedGoogle += 1;
      row.ratingSum += v.rating;
      if (v.latestAtMs > row.latestAtMs) row.latestAtMs = v.latestAtMs;
      perShopMap.set(v.businessSlug, row);
    }

    const perShopRows = Array.from(perShopMap.values()).sort(
      (a, b) => b.generated - a.generated || b.latestAtMs - a.latestAtMs
    );

    return {
      visits,
      totalReviewsGenerated,
      totalCopied,
      totalOpenedGoogle,
      totalPromptEnriched,
      avgRating,
      copyRatePct,
      googleConversionPct,
      promptDepthPct,
      ratingDist,
      languageDist,
      perShopRows,
    };
  }, [sessionEvents, timeRange, selectedShopSlug, languageFilter, businesses, businessLookup]);

  const filteredVisits = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return analytics.visits.slice(0, 60);
    return analytics.visits
      .filter((v) => {
        const shopName = businessLookup.get(v.businessSlug)?.name ?? v.businessSlug;
        const hay = `${shopName} ${v.businessSlug} ${v.language} ${formatStageLabel(
          v.highestStage
        )} ${v.rating} star`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 60);
  }, [analytics.visits, searchQuery, businessLookup]);

  const handleCopySchemaSql = async () => {
    const res = await copyTextToClipboard(SUPABASE_BOOTSTRAP_SQL);
    if (res.ok) {
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 3000);
    }
  };

  const handleVerifySchema = async () => {
    setCheckingSchema(true);
    setErrorBanner(null);
    try {
      const ready = await verifySupabaseSchemaReady();
      if (ready) {
        setSchemaMissing(false);
        setReloadNonce((n) => n + 1);
      } else {
        setSchemaMissing(true);
        setErrorBanner(
          'Supabase tables not detected yet. Paste the SQL schema into your Supabase SQL Editor and click Run.'
        );
      }
    } finally {
      setCheckingSchema(false);
    }
  };

  const handleExportCsv = () => {
    if (analytics.visits.length === 0) return;
    const header = [
      'Timestamp_ISO',
      'Business_Slug',
      'Business_Name',
      'Rating',
      'Language',
      'Used_Prompts',
      'Copied_Review',
      'Opened_Google',
      'Farthest_Stage',
    ];
    const rows = analytics.visits.map((v) => {
      const name = (businessLookup.get(v.businessSlug)?.name ?? v.businessSlug).replace(
        /"/g,
        '""'
      );
      return [
        new Date(v.latestAtMs).toISOString(),
        v.businessSlug,
        `"${name}"`,
        String(v.rating),
        v.language,
        v.usedOptionalPrompts ? 'Yes' : 'No',
        v.hasCopied ? 'Yes' : 'No',
        v.hasOpenedGoogle ? 'Yes' : 'No',
        `"${formatStageLabel(v.highestStage)}"`,
      ].join(',');
    });

    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reviewease-analytics-${timeRange}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authMode === 'signup') {
      await signUpWithEmail({
        fullName: authFullName,
        email: authEmail,
        password: authPassword,
      });
    } else {
      await signInWithEmail(authEmail, authPassword);
    }
  };

  // 1. Auth Loading Skeleton
  if (!authReady) {
    const skeletonBody = (
      <div className="space-y-6">
        <div className="h-10 w-72 rounded-lg bg-slate-200/70 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-28 rounded-xl bg-white border border-slate-200 animate-pulse"
            />
          ))}
        </div>
        <div className="h-72 rounded-2xl bg-white border border-slate-200 animate-pulse" />
      </div>
    );

    if (embedded) return skeletonBody;
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-slate-50/70 py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">{skeletonBody}</div>
      </div>
    );
  }

  // 2. Strict Authentication Gate: Block unauthenticated access to Supabase analytics
  if (!user) {
    return (
      <div className={embedded ? '' : 'min-h-[calc(100vh-4rem)] bg-slate-50/70 py-12 sm:py-16'}>
        <div className={embedded ? '' : 'max-w-4xl mx-auto px-4 sm:px-6'}>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-6 space-y-4">
              <div className="flex items-center gap-2 text-xs font-medium text-indigo-600">
                <Lock className="w-3.5 h-3.5" />
                <span>Authenticated Merchant Access Only</span>
              </div>

              <h1
                className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950"
                style={{ textWrap: 'balance' }}
              >
                Sign in to view your live Supabase business analytics.
              </h1>

              <p className="text-sm text-slate-600 leading-relaxed">
                Business review counts, clipboard engagement rates, language breakdowns, and Google conversion metrics are private to verified merchant accounts.
              </p>

              <ul className="space-y-2 text-xs sm:text-sm text-slate-700 pt-1">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <span>Total AI reviews generated across all your shop QR scanners</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <span>Draft-to-copy and Google review handoff conversion funnel</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <span>Protected by Supabase Row Level Security (RLS)</span>
                </li>
              </ul>
            </div>

            <div className="lg:col-span-6 lg:border-l lg:border-slate-200 lg:pl-8 space-y-4">
              <div
                role="tablist"
                aria-label="Merchant sign in mode"
                className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={authMode === 'signin'}
                  onClick={() => {
                    clearAuthError();
                    setAuthMode('signin');
                  }}
                  className={`py-2 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    authMode === 'signin'
                      ? 'bg-white text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Merchant Sign In
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={authMode === 'signup'}
                  onClick={() => {
                    clearAuthError();
                    setAuthMode('signup');
                  }}
                  className={`py-2 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    authMode === 'signup'
                      ? 'bg-white text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Create Shop Account
                </button>
              </div>

              {authNotice && (
                <div
                  role="status"
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900 flex items-start gap-2"
                >
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{authNotice}</span>
                </div>
              )}

              {authError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}

              <form onSubmit={(e) => void handleAuthSubmit(e)} className="space-y-3.5">
                {authMode === 'signup' && (
                  <div className="space-y-1">
                    <label
                      htmlFor="analytics-full-name"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Owner or Shop Name
                    </label>
                    <input
                      id="analytics-full-name"
                      type="text"
                      required
                      maxLength={80}
                      value={authFullName}
                      onChange={(e) => setAuthFullName(e.target.value)}
                      placeholder="e.g., Aroma Bistro"
                      className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label
                    htmlFor="analytics-email"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Merchant Email
                  </label>
                  <input
                    id="analytics-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="you@yourshop.com"
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="analytics-password"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Password
                  </label>
                  <input
                    id="analytics-password"
                    type="password"
                    required
                    minLength={6}
                    autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSigningIn}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
                >
                  {isSigningIn ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4" />
                      <span>
                        {authMode === 'signup'
                          ? 'Create Account & View Analytics'
                          : 'Sign In to Analytics'}
                      </span>
                    </>
                  )}
                </button>
              </form>

              <button
                type="button"
                disabled={isSigningIn}
                onClick={() => {
                  clearAuthError();
                  void signInWithGoogle();
                }}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-slate-800 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
              >
                <span>Continue with Google</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isLoading = loadingBusinesses || loadingSessions;

  // 3. Authenticated Merchant Business Analytics Content
  const dashboardContent = (
    <div className="space-y-6">
      {/* Standalone Header when opened on /admin */}
      {!embedded && (
        <div className="space-y-4 pb-5 border-b border-slate-200">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{user.displayName || user.email || 'Merchant Account'}</span>
                <span aria-hidden="true">·</span>
                <span>{isPlatformAdmin ? 'Founder Admin Verified' : 'Merchant Verified'}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {businesses.length}{' '}
                  {businesses.length === 1 ? 'Shop Connected' : 'Shops Connected'}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950">
                {isPlatformAdmin
                  ? 'Admin & Business Analytics Console'
                  : 'Merchant Business & Engagement Analytics'}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                disabled={analytics.visits.length === 0}
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>

              <Link
                to="/dashboard"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap shrink-0"
              >
                <Building2 className="w-4 h-4" />
                <span>Shop Scanners</span>
              </Link>

              <button
                type="button"
                onClick={() => void signOutUser()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>

          {isPlatformAdmin && (
            <div
              role="tablist"
              aria-label="Admin sections"
              className="inline-flex items-center p-1 bg-slate-200/75 rounded-xl"
            >
              <button
                type="button"
                role="tab"
                aria-selected={adminSection === 'analytics'}
                onClick={() => setAdminSection('analytics')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  adminSection === 'analytics'
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Business Analytics</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={adminSection === 'founder'}
                onClick={() => setAdminSection('founder')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  adminSection === 'founder'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Founder Admin Settings &amp; Subscriptions</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* 1-Time Supabase SQL Schema Banner if tables aren't initialized yet */}
      {schemaMissing && (
        <div
          role="region"
          aria-label="Initialize Supabase Tables"
          className="rounded-2xl border border-amber-300 bg-amber-50/90 p-5 space-y-3.5 text-amber-950"
        >
          <div className="flex items-start gap-3">
            <Database className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-slate-950">
                Initialize Supabase tables to record &amp; view analytics
              </h2>
              <p className="text-xs sm:text-sm text-amber-900 leading-relaxed">
                Copy the schema SQL below, run it once in your Supabase SQL Editor, then click Verify Tables Connected.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => void handleCopySchemaSql()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-900 bg-white border border-amber-300 rounded-lg hover:bg-amber-100/60 transition-colors whitespace-nowrap shrink-0"
            >
              {copiedSql ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>1. SQL Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>1. Copy SQL Schema</span>
                </>
              )}
            </button>

            <a
              href={SUPABASE_SQL_EDITOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <span>2. Open Supabase SQL Editor</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              type="button"
              disabled={checkingSchema}
              onClick={() => void handleVerifySchema()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
            >
              {checkingSchema ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Checking...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>3. Verify Tables Connected</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {errorBanner && (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs sm:text-sm text-amber-950 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <span>{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setReloadNonce((n) => n + 1)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-950 bg-white border border-amber-300 rounded-lg hover:bg-amber-100/60 transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      )}

      {!embedded && isPlatformAdmin && adminSection === 'founder' ? (
        <FounderAdminPanel
          billingConfig={billingConfig}
          onBillingConfigSaved={reloadBillingConfig}
        />
      ) : (
        <>
      {/* Filter & Controls Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Timeframe Segmented Control */}
          <div
            role="group"
            aria-label="Analytics timeframe"
            className="inline-flex items-center p-1 bg-slate-100 rounded-lg"
          >
            {(
              [
                { id: '7d', label: '7 Days' },
                { id: '30d', label: '30 Days' },
                { id: '90d', label: '90 Days' },
                { id: 'all', label: 'All Time' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTimeRange(item.id)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  timeRange === item.id
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Shop Selector */}
          <select
            aria-label="Filter analytics by shop"
            value={selectedShopSlug}
            onChange={(e) => setSelectedShopSlug(e.target.value)}
            className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600"
          >
            <option value="all">
              All {includeAllPlatform ? 'Platform' : 'My'} Shops ({businesses.length})
            </option>
            {businesses.map((biz) => (
              <option key={biz.slug} value={biz.slug}>
                {biz.name} (/review/{biz.slug})
              </option>
            ))}
          </select>

          {/* Founder Admin Scope Toggle */}
          {isPlatformAdmin && (
            <div
              role="group"
              aria-label="Founder analytics scope"
              className="inline-flex items-center p-1 bg-slate-100 rounded-lg"
            >
              <button
                type="button"
                onClick={() => setPlatformScope('mine')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  platformScope === 'mine'
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                My Shops
              </button>
              <button
                type="button"
                onClick={() => setPlatformScope('all')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  platformScope === 'all'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Platform
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {embedded && (
            <button
              type="button"
              disabled={analytics.visits.length === 0}
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          )}

          <button
            type="button"
            disabled={isLoading}
            onClick={() => setReloadNonce((n) => n + 1)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200/80 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Data</span>
          </button>
        </div>
      </div>

      {/* 4 Primary Business & Engagement KPIs */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-28 rounded-xl bg-white border border-slate-200 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-1">
            <p className="text-xs font-medium text-slate-500">Total Reviews Generated</p>
            <p className="text-2xl sm:text-3xl font-bold text-slate-950 font-mono tabular-nums">
              {analytics.totalReviewsGenerated}
            </p>
            <p className="text-xs text-slate-500">
              AI drafts across {selectedShopSlug === 'all' ? `${businesses.length} shops` : selectedShopSlug}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-1">
            <p className="text-xs font-medium text-slate-500">Copy Engagement Rate</p>
            <p className="text-2xl sm:text-3xl font-bold text-slate-950 font-mono tabular-nums">
              {analytics.copyRatePct}%
            </p>
            <p className="text-xs text-slate-500 font-mono tabular-nums">
              {analytics.totalCopied} of {analytics.totalReviewsGenerated} copied to clipboard
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-1">
            <p className="text-xs font-medium text-slate-500">Google Review Handoff</p>
            <p className="text-2xl sm:text-3xl font-bold text-indigo-600 font-mono tabular-nums">
              {analytics.googleConversionPct}%
            </p>
            <p className="text-xs text-slate-500 font-mono tabular-nums">
              {analytics.totalOpenedGoogle} opened Google review link
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-1">
            <p className="text-xs font-medium text-slate-500">Average Rating &amp; Depth</p>
            <p className="text-2xl sm:text-3xl font-bold text-slate-950 font-mono tabular-nums">
              {analytics.avgRating}
              {analytics.totalReviewsGenerated > 0 ? ' / 5.0' : ''}
            </p>
            <p className="text-xs text-slate-500 font-mono tabular-nums">
              {analytics.promptDepthPct}% answered experience prompts
            </p>
          </div>
        </div>
      )}

      {/* Engagement Funnel + Language & Rating Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 6 Cols: 3-Stage Customer Engagement Funnel */}
        <section
          aria-labelledby="engagement-funnel-heading"
          className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-5"
        >
          <div className="border-b border-slate-100 pb-3.5">
            <h2 id="engagement-funnel-heading" className="text-base font-semibold text-slate-900">
              Customer Review Engagement Funnel
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Conversion progression from QR scan draft generation to opening Google Reviews
            </p>
          </div>

          <div className="space-y-4">
            {[
              {
                step: '01. AI Review Draft Generated',
                count: analytics.totalReviewsGenerated,
                pct: analytics.totalReviewsGenerated > 0 ? 100 : 0,
                barClass: 'bg-slate-900',
              },
              {
                step: '02. Review Copied by Customer',
                count: analytics.totalCopied,
                pct: analytics.copyRatePct,
                barClass: 'bg-indigo-600',
              },
              {
                step: '03. Opened Google Review Link',
                count: analytics.totalOpenedGoogle,
                pct: analytics.googleConversionPct,
                barClass: 'bg-emerald-600',
              },
            ].map((stage) => (
              <div key={stage.step} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="font-medium text-slate-800">{stage.step}</span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {stage.count} ({stage.pct}%)
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-200 ${stage.barClass}`}
                    style={{ width: `${stage.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-100 space-y-2.5">
            <p className="text-xs font-semibold text-slate-800">Language Engagement Split</p>
            <div className="grid grid-cols-3 gap-3">
              {(['English', 'Hindi', 'Hinglish'] as const).map((lang) => {
                const count = analytics.languageDist[lang] ?? 0;
                const pct =
                  analytics.totalReviewsGenerated > 0
                    ? Math.round((count / analytics.totalReviewsGenerated) * 100)
                    : 0;
                return (
                  <div key={lang} className="space-y-0.5">
                    <p className="text-xs text-slate-500">{lang}</p>
                    <p className="text-sm font-bold text-slate-900 font-mono tabular-nums">
                      {count}{' '}
                      <span className="text-xs font-normal text-slate-500">({pct}%)</span>
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Right 6 Cols: Star Sentiment Distribution */}
        <section
          aria-labelledby="sentiment-dist-heading"
          className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-5"
        >
          <div className="border-b border-slate-100 pb-3.5">
            <h2 id="sentiment-dist-heading" className="text-base font-semibold text-slate-900">
              Customer Star Rating Distribution
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Ratings chosen by guests before generating their AI review draft
            </p>
          </div>

          <div className="space-y-3.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = analytics.ratingDist[star] ?? 0;
              const pct =
                analytics.totalReviewsGenerated > 0
                  ? Math.round((count / analytics.totalReviewsGenerated) * 100)
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
                  <div className="w-20 text-right font-mono text-xs text-slate-700 tabular-nums shrink-0">
                    {count} ({pct}%)
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Per-Shop Performance Breakdown Table */}
      <section
        aria-labelledby="shop-breakdown-heading"
        className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
      >
        <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="shop-breakdown-heading" className="text-base font-semibold text-slate-900">
              Shop-by-Shop QR Scanner Performance
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Compare generated reviews, clipboard copies, and Google clicks across each location
            </p>
          </div>
          <BarChart3 className="w-4 h-4 text-slate-400 hidden sm:block" aria-hidden="true" />
        </div>

        {isLoading ? (
          <div className="p-5 space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-10 rounded-lg bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : analytics.perShopRows.length === 0 ? (
          <div className="p-8 sm:p-10 text-center space-y-3">
            <p className="text-sm font-semibold text-slate-900">
              No shop QR scanners registered yet
            </p>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              Add your first shop and Google Maps link in the Merchant Portal to generate your printable QR standee and start tracking live customer review analytics.
            </p>
            {!embedded && (
              <div className="pt-1">
                <Link
                  to="/dashboard"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <span>Create First Shop QR Scanner</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4 sm:px-5">Shop / Scanner Slug</th>
                  <th className="py-2.5 px-3 text-right">Reviews Generated</th>
                  <th className="py-2.5 px-3 text-right">Copied</th>
                  <th className="py-2.5 px-3 text-right">Opened Google</th>
                  <th className="py-2.5 px-3 text-right">Google Rate</th>
                  <th className="py-2.5 px-3 text-right">Avg Rating</th>
                  <th className="py-2.5 px-4 sm:px-5 text-right">Last Scan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {analytics.perShopRows.map((shop) => {
                  const googleRate =
                    shop.generated > 0
                      ? `${Math.round((shop.openedGoogle / shop.generated) * 100)}%`
                      : '0%';
                  const avg =
                    shop.generated > 0 ? (shop.ratingSum / shop.generated).toFixed(2) : '—';
                  return (
                    <tr key={shop.slug} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 sm:px-5">
                        <div className="font-semibold text-slate-900">{shop.name}</div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                          <Link
                            to={`/review/${shop.slug}`}
                            className="font-mono text-indigo-600 hover:underline"
                          >
                            /review/{shop.slug}
                          </Link>
                          <span aria-hidden="true">·</span>
                          <span>{shop.isActive ? 'Active' : 'Paused'}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                        {shop.generated}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-700 tabular-nums">
                        {shop.copied}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-700 tabular-nums">
                        {shop.openedGoogle}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                        {googleRate}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-800 tabular-nums">
                        {avg}
                      </td>
                      <td className="py-3 px-4 sm:px-5 text-right text-slate-500 whitespace-nowrap tabular-nums">
                        {formatRelativeTime(shop.latestAtMs)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent Customer Engagement Log */}
      <section
        aria-labelledby="recent-engagement-heading"
        className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
      >
        <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 id="recent-engagement-heading" className="text-base font-semibold text-slate-900">
              Recent Customer Review Sessions
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live anonymous session log from Supabase (`review_sessions`)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg">
              {(['All', 'English', 'Hindi', 'Hinglish'] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLanguageFilter(lang)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    languageFilter === lang
                      ? 'bg-white text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-44">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search shop or stage..."
                aria-label="Search recent review sessions"
                className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-9 rounded-lg bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filteredVisits.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <p className="text-sm font-medium text-slate-800">
              {analytics.totalReviewsGenerated === 0
                ? 'No customer review sessions recorded in this timeframe yet'
                : 'No review sessions match your search or language filter'}
            </p>
            {analytics.totalReviewsGenerated > 0 && (
              <button
                type="button"
                onClick={() => {
                  setLanguageFilter('All');
                  setSearchQuery('');
                }}
                className="px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100"
              >
                Clear Session Filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4 sm:px-5">Time</th>
                  <th className="py-2.5 px-3">Shop</th>
                  <th className="py-2.5 px-3">Rating</th>
                  <th className="py-2.5 px-3">Language</th>
                  <th className="py-2.5 px-3">Experience Prompts</th>
                  <th className="py-2.5 px-4 sm:px-5 text-right">Engagement Stage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredVisits.map((visit) => {
                  const shopName =
                    businessLookup.get(visit.businessSlug)?.name ?? visit.businessSlug;
                  return (
                    <tr
                      key={`${visit.businessSlug}-${visit.visitId}`}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3 px-4 sm:px-5 text-slate-600 whitespace-nowrap tabular-nums">
                        {formatRelativeTime(visit.latestAtMs)}
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-900">{shopName}</td>
                      <td className="py-3 px-3 font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {visit.rating} ★
                      </td>
                      <td className="py-3 px-3 text-slate-700">{visit.language}</td>
                      <td className="py-3 px-3 text-slate-600">
                        {visit.usedOptionalPrompts ? 'Detailed' : 'Quick Star'}
                      </td>
                      <td
                        className={`py-3 px-4 sm:px-5 text-right font-semibold whitespace-nowrap ${
                          visit.highestStage === 'opened_google'
                            ? 'text-emerald-700'
                            : visit.highestStage === 'copied_review'
                              ? 'text-indigo-700'
                              : 'text-slate-600'
                        }`}
                      >
                        {formatStageLabel(visit.highestStage)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
        </>
      )}
    </div>
  );

  if (embedded) {
    return dashboardContent;
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50/70 py-8 sm:py-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">{dashboardContent}</div>
    </div>
  );
}

export default AdminDashboard;
