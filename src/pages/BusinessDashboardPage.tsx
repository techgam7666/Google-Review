import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  Copy,
  Download,
  Info,
  RefreshCw,
  RotateCcw,
  Search,
  Star,
} from 'lucide-react';
import { sanitizeSlug, useBusiness } from '../context/BusinessContext';
import type { ReviewLanguage } from '../types/review';
import { copyTextToClipboard } from '../utils/clipboard';

const SAMPLE_RATING_BASELINE: Record<number, number> = {
  5: 78,
  4: 34,
  3: 15,
  2: 7,
  1: 4,
};

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function BusinessDashboardPage() {
  const {
    profile,
    updateProfile,
    resetProfile,
    activities,
    clearLocalSessions,
    liveAiConfigured,
    activeAiProvider,
  } = useBusiness();

  // Editable form state
  const [nameInput, setNameInput] = useState(profile.name);
  const [categoryInput, setCategoryInput] = useState(profile.category);
  const [slugInput, setSlugInput] = useState(profile.slug);
  const [googleUrlInput, setGoogleUrlInput] = useState(profile.googleReviewUrl);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // QR Code state
  const currentOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const [customBaseUrl, setCustomBaseUrl] = useState<string>('');
  const [qrPngDataUrl, setQrPngDataUrl] = useState<string>('');
  const [qrSvgMarkup, setQrSvgMarkup] = useState<string>('');
  const [qrError, setQrError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Activity table filter & refresh simulation state
  const [languageFilter, setLanguageFilter] = useState<'All' | ReviewLanguage>('All');
  const [ratingFilter, setRatingFilter] = useState<'All' | 'Positive' | 'Neutral' | 'Negative'>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isRefreshingTable, setIsRefreshingTable] = useState<boolean>(false);

  useEffect(() => {
    setNameInput(profile.name);
    setCategoryInput(profile.category);
    setSlugInput(profile.slug);
    setGoogleUrlInput(profile.googleReviewUrl);
  }, [profile]);

  const effectiveBaseOrigin = useMemo(() => {
    const trimmed = customBaseUrl.trim().replace(/\/+$/, '');
    if (trimmed && isValidHttpUrl(trimmed)) {
      return trimmed;
    }
    return currentOrigin;
  }, [customBaseUrl, currentOrigin]);

  const customerReviewUrl = `${effectiveBaseOrigin}/review/${profile.slug}`;
  const isLocalOrigin =
    effectiveBaseOrigin.includes('localhost') || effectiveBaseOrigin.includes('127.0.0.1');

  useEffect(() => {
    let cancelled = false;
    setQrError(null);

    Promise.all([
      QRCode.toDataURL(customerReviewUrl, {
        width: 560,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
      }),
      QRCode.toString(customerReviewUrl, {
        type: 'svg',
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
      }),
    ])
      .then(([pngUrl, svgStr]) => {
        if (!cancelled) {
          setQrPngDataUrl(pngUrl);
          setQrSvgMarkup(svgStr);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrError('Unable to render QR code for this URL.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [customerReviewUrl]);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = nameInput.trim();
    const trimmedCat = categoryInput.trim() || 'Local Business';
    const cleanedSlug = sanitizeSlug(slugInput);
    const trimmedUrl = googleUrlInput.trim();

    if (!trimmedName) {
      setSaveStatus({ type: 'error', text: 'Business name cannot be empty.' });
      return;
    }

    if (!isValidHttpUrl(trimmedUrl)) {
      setSaveStatus({
        type: 'error',
        text: 'Please provide a valid Google review URL starting with https:// or http://',
      });
      return;
    }

    updateProfile({
      name: trimmedName,
      category: trimmedCat,
      slug: cleanedSlug,
      googleReviewUrl: trimmedUrl,
    });
    setSlugInput(cleanedSlug);
    setSaveStatus({
      type: 'success',
      text: 'Business profile & QR code destination updated.',
    });
    setTimeout(() => setSaveStatus(null), 3500);
  };

  const handleResetDefaults = () => {
    resetProfile();
    clearLocalSessions();
    setCustomBaseUrl('');
    setSaveStatus({
      type: 'success',
      text: 'Restored sample defaults for The Urban Cafe.',
    });
    setTimeout(() => setSaveStatus(null), 3000);
  };

  const handleDownloadPng = () => {
    if (!qrPngDataUrl) return;
    const link = document.createElement('a');
    link.href = qrPngDataUrl;
    link.download = `reviewease-qr-${profile.slug}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadSvg = () => {
    if (!qrSvgMarkup) return;
    const blob = new Blob([qrSvgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reviewease-qr-${profile.slug}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyCustomerLink = async () => {
    const res = await copyTextToClipboard(customerReviewUrl);
    if (res.ok) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2400);
    }
  };

  const handleSimulateRefresh = () => {
    setIsRefreshingTable(true);
    setTimeout(() => {
      setIsRefreshingTable(false);
    }, 320);
  };

  // Combine sample baseline rating distribution with any local test drafts
  const ratingCounts = useMemo(() => {
    const counts: Record<number, number> = { ...SAMPLE_RATING_BASELINE };
    for (const act of activities) {
      if (act.isLiveLocalSession && counts[act.rating] !== undefined) {
        counts[act.rating] += 1;
      }
    }
    return counts;
  }, [activities]);

  const totalDraftSessions = useMemo(
    () => Object.values(ratingCounts).reduce((acc, n) => acc + n, 0),
    [ratingCounts]
  );

  const liveSessionCount = useMemo(
    () => activities.filter((a) => a.isLiveLocalSession).length,
    [activities]
  );

  const filteredActivities = useMemo(() => {
    return activities.filter((item) => {
      if (languageFilter !== 'All' && item.language !== languageFilter) {
        return false;
      }
      if (ratingFilter === 'Positive' && item.rating < 4) return false;
      if (ratingFilter === 'Neutral' && item.rating !== 3) return false;
      if (ratingFilter === 'Negative' && item.rating > 2) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${item.language} ${item.actionTaken} ${item.timestampLabel} ${item.rating} stars`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [activities, languageFilter, ratingFilter, searchQuery]);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50/70 py-8 sm:py-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-8">
        {/* Top Workspace Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>Merchant Workspace</span>
              <span aria-hidden="true">/</span>
              <span>{profile.name}</span>
              <span aria-hidden="true">·</span>
              <span>Prototype Demo</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950">
              Business QR &amp; Review Flow Dashboard
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Sample Data</span>
            </button>

            <Link
              to={`/review/${profile.slug}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap shrink-0"
            >
              <span>Open Customer Page</span>
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Honest Sample Data & Live Portal Upgrade Banner */}
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs sm:text-sm text-slate-600">
          <div className="flex items-start gap-3">
            <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-slate-800 font-medium">
                Interactive Sandbox Demo — Sample Demonstration Metrics
              </p>
              <p className="text-xs text-slate-600 leading-relaxed">
                This page uses sample baseline data ({liveSessionCount} local test{' '}
                {liveSessionCount === 1 ? 'session' : 'sessions'}).{' '}
                <span className="text-slate-500">
                  AI Status:{' '}
                  {liveAiConfigured
                    ? `Live server AI (${activeAiProvider === 'openrouter' ? 'OpenRouter' : 'Gemini'})`
                    : 'Template fallback mode'}
                  .
                </span>{' '}
                Want to claim a permanent cloud QR code for your own business?
              </p>
            </div>
          </div>

          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
          >
            <span>Open Live Merchant Portal</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Configuration + Real QR Code Split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 7 cols: Business Profile & Google URL Configuration */}
          <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-5">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-lg font-semibold text-slate-900">
                Business Profile &amp; Destination Link
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Changes saved here immediately update your customer review page and regenerate your QR code.
              </p>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="biz-name" className="block text-xs font-semibold text-slate-700">
                    Business Name
                  </label>
                  <input
                    id="biz-name"
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    maxLength={80}
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="biz-category"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Business Category
                  </label>
                  <input
                    id="biz-category"
                    type="text"
                    value={categoryInput}
                    onChange={(e) => setCategoryInput(e.target.value)}
                    maxLength={60}
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="biz-slug" className="block text-xs font-semibold text-slate-700">
                  Configurable Business Identifier (URL Slug)
                </label>
                <div className="flex items-center rounded-lg border border-slate-300 bg-slate-50 focus-within:ring-2 focus-within:ring-indigo-600 focus-within:border-transparent overflow-hidden">
                  <span className="px-3 py-2 text-xs font-mono text-slate-500 border-r border-slate-200 select-none shrink-0">
                    /review/
                  </span>
                  <input
                    id="biz-slug"
                    type="text"
                    value={slugInput}
                    onChange={(e) => setSlugInput(e.target.value)}
                    placeholder="urban-cafe"
                    maxLength={50}
                    className="w-full min-w-0 px-3 py-2 text-sm font-mono bg-white text-slate-900 focus:outline-none"
                  />
                </div>
                <p className="text-xs text-slate-500">
                  Customers scanning your QR code will open{' '}
                  <code className="font-mono text-slate-700">
                    /review/{sanitizeSlug(slugInput)}
                  </code>
                  . Note: <code className="font-mono text-slate-700">/review/demo</code> also stays active for testing.
                </p>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="biz-google-url"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Official Google Review URL
                </label>
                <input
                  id="biz-google-url"
                  type="url"
                  value={googleUrlInput}
                  onChange={(e) => setGoogleUrlInput(e.target.value)}
                  placeholder="https://search.google.com/local/writereview?placeid=..."
                  className="w-full px-3.5 py-2 text-xs sm:text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
                />
                <p className="text-xs text-slate-500">
                  Paste the &ldquo;Ask for reviews&rdquo; link from your Google Business Profile manager.
                </p>
              </div>

              <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="submit"
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                >
                  Save Business Configuration
                </button>

                {saveStatus && (
                  <span
                    role="status"
                    className={`text-xs font-medium flex items-center gap-1.5 ${
                      saveStatus.type === 'error' ? 'text-red-600' : 'text-emerald-700'
                    }`}
                  >
                    {saveStatus.type === 'error' ? (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    ) : (
                      <Check className="w-4 h-4 shrink-0" />
                    )}
                    {saveStatus.text}
                  </span>
                )}
              </div>
            </form>
          </div>

          {/* Right 5 cols: Real QR Code Preview & Download */}
          <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-5">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-lg font-semibold text-slate-900">Customer Review QR Code</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Scan with a phone camera to launch {profile.name}&apos;s review generator.
              </p>
            </div>

            <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50/70 p-5 space-y-3">
              {qrError ? (
                <div className="py-12 text-center text-xs text-red-600">{qrError}</div>
              ) : qrPngDataUrl ? (
                <img
                  src={qrPngDataUrl}
                  alt={`QR code pointing to ${customerReviewUrl}`}
                  className="w-48 h-48 sm:w-52 sm:h-52 rounded-lg border border-slate-200 bg-white p-2"
                />
              ) : (
                <div className="w-48 h-48 rounded-lg bg-slate-200/70 animate-pulse" />
              )}

              <div className="text-center space-y-0.5">
                <p className="text-sm font-semibold text-slate-900">{profile.name}</p>
                <p className="text-xs text-slate-500">Scan to draft your Google review</p>
              </div>
            </div>

            {/* Encoded URL & Copy */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">Encoded Customer URL</span>
                <button
                  type="button"
                  onClick={() => void handleCopyCustomerLink()}
                  className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:text-indigo-700 whitespace-nowrap shrink-0"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied URL</span>
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
                {customerReviewUrl}
              </div>
            </div>

            {/* Optional Public Domain Override for Deployment Preview */}
            <div className="space-y-1.5">
              <label htmlFor="public-origin-override" className="block text-xs font-medium text-slate-600">
                Optional: Public Deployed Domain Override
              </label>
              <input
                id="public-origin-override"
                type="url"
                value={customBaseUrl}
                onChange={(e) => setCustomBaseUrl(e.target.value)}
                placeholder={currentOrigin}
                className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
              />
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {isLocalOrigin
                  ? 'Currently showing your local development URL. Deploy the website to a publicly accessible HTTPS URL so customers outside your local network can scan and open this QR code on their phones.'
                  : 'Ensure this URL is publicly reachable without developer login so guests can open the QR code from any mobile network.'}
              </p>
            </div>

            {/* Download Buttons */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                disabled={!qrPngDataUrl}
                onClick={handleDownloadPng}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>Download PNG</span>
              </button>

              <button
                type="button"
                disabled={!qrSvgMarkup}
                onClick={handleDownloadSvg}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-800 bg-slate-100 rounded-lg hover:bg-slate-200/80 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>Download SVG</span>
              </button>
            </div>
          </div>
        </div>

        {/* Sample KPI Strip */}
        <section aria-labelledby="sample-metrics-heading" className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="sample-metrics-heading" className="text-lg font-semibold text-slate-900">
              Review Drafting Overview (Sample Data)
            </h2>
            <span className="text-xs text-slate-500">
              Tracks anonymous draft sessions · Does not claim verified Google publication
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-1">
              <p className="text-xs font-medium text-slate-500">Total Review-Generation Sessions</p>
              <p className="text-2xl font-bold text-slate-950 font-mono tabular-nums">
                {totalDraftSessions}
              </p>
              <p className="text-xs text-slate-500">
                138 sample + {liveSessionCount} from this browser
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-1">
              <p className="text-xs font-medium text-slate-500">Average Selected Rating (Sample)</p>
              <p className="text-2xl font-bold text-slate-950 font-mono tabular-nums">4.28 / 5.0</p>
              <p className="text-xs text-slate-500">Across all 1-to-5 star draft sessions</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-1">
              <p className="text-xs font-medium text-slate-500">Copy Review Clicks (Sample)</p>
              <p className="text-2xl font-bold text-slate-950 font-mono tabular-nums">79%</p>
              <p className="text-xs text-slate-500">Guests copying edited text to clipboard</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-1">
              <p className="text-xs font-medium text-slate-500">Multilingual Draft Share (Sample)</p>
              <p className="text-2xl font-bold text-slate-950 font-mono tabular-nums">38%</p>
              <p className="text-xs text-slate-500">Drafted in Hinglish or Hindi</p>
            </div>
          </div>
        </section>

        {/* Rating Distribution + Recent Anonymous Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Sample Rating Distribution (5 cols) */}
          <section
            aria-labelledby="rating-dist-heading"
            className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-5"
          >
            <div>
              <h2 id="rating-dist-heading" className="text-base sm:text-lg font-semibold text-slate-900">
                Sample Rating Distribution
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Star ratings chosen during review drafting ({totalDraftSessions} sample sessions)
              </p>
            </div>

            <div className="space-y-3.5">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = ratingCounts[star] ?? 0;
                const pct =
                  totalDraftSessions > 0 ? Math.round((count / totalDraftSessions) * 100) : 0;
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

            <p className="pt-2 border-t border-slate-100 text-xs text-slate-500 leading-relaxed">
              Future Supabase integration will persist anonymous session aggregates per merchant without storing personal customer identities.
            </p>
          </section>

          {/* Recent Anonymous Activity Table (7 cols) */}
          <section
            aria-labelledby="recent-activity-heading"
            className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white overflow-hidden"
          >
            <div className="p-5 sm:p-6 border-b border-slate-200 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2
                    id="recent-activity-heading"
                    className="text-base sm:text-lg font-semibold text-slate-900"
                  >
                    Recent Anonymous Activity (Sample Data)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Anonymous review-generation events — never claims unverified Google submission
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleSimulateRefresh}
                  aria-label="Refresh sample activity view"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200/80 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingTable ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {/* Filter controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
                  {(['All', 'English', 'Hindi', 'Hinglish'] as const).map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setLanguageFilter(lang)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        languageFilter === lang
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

                  <div className="relative flex-1 sm:w-40">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filter rows..."
                      aria-label="Filter activity rows"
                      className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Table Body with Loading & Empty States */}
            {isRefreshingTable ? (
              <div className="p-5 space-y-3">
                {[1, 2, 3, 4].map((skeleton) => (
                  <div
                    key={skeleton}
                    className="h-9 rounded-lg bg-slate-100 animate-pulse"
                  />
                ))}
              </div>
            ) : filteredActivities.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <p className="text-sm font-medium text-slate-800">
                  No anonymous sessions match your current filters
                </p>
                <p className="text-xs text-slate-500">
                  Clear the search or switch back to All languages and ratings.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setLanguageFilter('All');
                    setRatingFilter('All');
                    setSearchQuery('');
                  }}
                  className="mt-2 inline-flex items-center justify-center px-3.5 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                >
                  Clear Filters
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                      <th className="py-2.5 px-4 sm:px-5">When</th>
                      <th className="py-2.5 px-3">Rating</th>
                      <th className="py-2.5 px-3">Language</th>
                      <th className="py-2.5 px-3">Prompts</th>
                      <th className="py-2.5 px-4 sm:px-5 text-right">Last Step Reached</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredActivities.map((act) => (
                      <tr key={act.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 sm:px-5 text-slate-700 whitespace-nowrap">
                          {act.timestampLabel}
                        </td>
                        <td className="py-3 px-3 font-mono font-medium text-slate-900 tabular-nums whitespace-nowrap">
                          {act.rating}.0 ★
                        </td>
                        <td className="py-3 px-3 text-slate-700 whitespace-nowrap">
                          {act.language}
                        </td>
                        <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                          {act.usedOptionalPrompts ? 'Answered' : 'Skipped'}
                        </td>
                        <td className="py-3 px-4 sm:px-5 text-right font-medium text-slate-800 whitespace-nowrap">
                          {act.actionTaken}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
