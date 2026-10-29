import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sparkles,
  Star,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  createAnonymousVisitId,
  fetchPublicBusinessBySlug,
  recordRealCustomerSessionEvent,
} from '../services/firestoreService';
import {
  generateCustomerReview,
  getRatingLabel,
  getSentimentBucket,
} from '../services/reviewAiService';
import type { RealBusinessRecord, ReviewLanguage, SentimentBucket } from '../types/review';
import { copyTextToClipboard } from '../utils/clipboard';

interface PromptConfig {
  q1Label: string;
  q1Placeholder: string;
  q1Suggestions: string[];
  q2Label: string;
  q2Placeholder: string;
  q2Suggestions: string[];
}

function getCategoryAwarePrompts(
  bucket: SentimentBucket,
  category: string
): PromptConfig {
  const lowerCat = category.toLowerCase();
  const isClinicOrSalon =
    lowerCat.includes('clinic') ||
    lowerCat.includes('beauty') ||
    lowerCat.includes('salon') ||
    lowerCat.includes('dental') ||
    lowerCat.includes('spa') ||
    lowerCat.includes('medical');

  if (bucket === 'positive') {
    return {
      q1Label: 'What did you like?',
      q1Placeholder: isClinicOrSalon
        ? 'e.g., treatment results, clean clinic, comfortable care...'
        : 'e.g., quality, ambiance, specific item or service...',
      q1Suggestions: isClinicOrSalon
        ? ['visible results & care', 'hygienic & calm clinic', 'clear consultation', 'good value']
        : ['great overall quality', 'welcoming atmosphere', 'clean & well-kept', 'good value'],
      q2Label: 'How was the service?',
      q2Placeholder: 'e.g., polite staff, quick attention, helpful guidance...',
      q2Suggestions: isClinicOrSalon
        ? ['polite & knowledgeable team', 'on-time appointment', 'patient guidance']
        : ['friendly & attentive staff', 'prompt service', 'smooth experience'],
    };
  }

  if (bucket === 'neutral') {
    return {
      q1Label: 'What went well?',
      q1Placeholder: 'e.g., convenient location and decent quality...',
      q1Suggestions: ['decent quality', 'comfortable space', 'helpful staff'],
      q2Label: 'What could be improved?',
      q2Placeholder: 'e.g., waiting time during busy hours, communication...',
      q2Suggestions: ['shorter wait times', 'better consistency', 'faster billing'],
    };
  }

  return {
    q1Label: 'What went wrong?',
    q1Placeholder: 'e.g., long delay, poor communication, below expectations...',
    q1Suggestions: ['long waiting time', 'quality below expectations', 'inattentive service'],
    q2Label: 'What should be improved?',
    q2Placeholder: 'e.g., staff responsiveness, cleanliness, timeliness...',
    q2Suggestions: ['service speed & coordination', 'attention to detail', 'basic cleanliness'],
  };
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function ReviewGeneratorPage() {
  const { businessSlug } = useParams<{ businessSlug?: string }>();
  const { user } = useAuth();

  // Firestore real business resolution state
  const [realBusiness, setRealBusiness] = useState<RealBusinessRecord | null>(null);
  const [resolvingBusiness, setResolvingBusiness] = useState<boolean>(true);
  const [notFoundInCloud, setNotFoundInCloud] = useState<boolean>(false);

  // Ephemeral anonymous visit ID for grouping draft -> copy -> Google handoff
  const visitIdRef = useRef<string>(createAnonymousVisitId());

  useEffect(() => {
    visitIdRef.current = createAnonymousVisitId();

    if (!businessSlug || businessSlug === 'demo') {
      setRealBusiness(null);
      setResolvingBusiness(false);
      setNotFoundInCloud(true);
      return;
    }

    let cancelled = false;
    setResolvingBusiness(true);
    setNotFoundInCloud(false);

    fetchPublicBusinessBySlug(businessSlug)
      .then((found) => {
        if (cancelled) return;
        if (found && found.isActive) {
          setRealBusiness(found);
          setNotFoundInCloud(false);
        } else {
          setRealBusiness(null);
          setNotFoundInCloud(true);
        }
        setResolvingBusiness(false);
      })
      .catch(() => {
        if (!cancelled) {
          setRealBusiness(null);
          setNotFoundInCloud(true);
          setResolvingBusiness(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [businessSlug]);

  const isSubscriptionExpired = Boolean(
    realBusiness &&
      typeof realBusiness.subscriptionEndsAtMs === 'number' &&
      realBusiness.subscriptionEndsAtMs < Date.now()
  );

  // Step 1: Rating
  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);

  // Step 2: Optional questions
  const [primaryAnswer, setPrimaryAnswer] = useState<string>('');
  const [secondaryAnswer, setSecondaryAnswer] = useState<string>('');

  // Step 3: Language & Generated Review
  const [language, setLanguage] = useState<ReviewLanguage>('English');
  const [reviewText, setReviewText] = useState<string>('');
  const [hasGenerated, setHasGenerated] = useState<boolean>(false);
  const [variationIndex, setVariationIndex] = useState<number>(0);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationSource, setGenerationSource] = useState<'gemini' | 'openrouter' | 'mock'>(
    'gemini'
  );
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Step 4: Copy & Handoff
  const [copiedState, setCopiedState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [clipboardError, setClipboardError] = useState<string | null>(null);

  const step3Ref = useRef<HTMLDivElement | null>(null);

  const sentimentBucket: SentimentBucket | null = rating > 0 ? getSentimentBucket(rating) : null;
  const activePrompts = useMemo(
    () =>
      sentimentBucket && realBusiness
        ? getCategoryAwarePrompts(sentimentBucket, realBusiness.category)
        : null,
    [sentimentBucket, realBusiness]
  );

  const handleSelectRating = (newRating: number) => {
    const prevBucket = rating > 0 ? getSentimentBucket(rating) : null;
    const nextBucket = getSentimentBucket(newRating);

    setRating(newRating);
    setErrorBanner(null);

    if (prevBucket && prevBucket !== nextBucket) {
      setPrimaryAnswer('');
      setSecondaryAnswer('');
      if (hasGenerated) {
        setHasGenerated(false);
        setReviewText('');
      }
    }
  };

  const appendSuggestion = (current: string, phrase: string, setter: (v: string) => void) => {
    const trimmed = current.trim();
    if (!trimmed) {
      setter(phrase);
      return;
    }
    if (trimmed.toLowerCase().includes(phrase.toLowerCase())) {
      return;
    }
    setter(`${trimmed}, ${phrase}`);
  };

  const runGeneration = async (options?: {
    overrideLang?: ReviewLanguage;
    nextVariation?: number;
    skipOptionalAnswers?: boolean;
  }) => {
    if (rating < 1 || rating > 5) {
      setErrorBanner('Please select a star rating from 1 to 5 before generating your review.');
      return;
    }

    const targetLang = options?.overrideLang ?? language;
    const targetVariation = options?.nextVariation ?? variationIndex;
    const q1 = options?.skipOptionalAnswers ? '' : primaryAnswer;
    const q2 = options?.skipOptionalAnswers ? '' : secondaryAnswer;

    if (options?.skipOptionalAnswers) {
      setPrimaryAnswer('');
      setSecondaryAnswer('');
    }

    setErrorBanner(null);
    setClipboardError(null);
    setCopiedState('idle');
    setIsGenerating(true);

    if (!realBusiness) return;

    try {
      const result = await generateCustomerReview({
        businessName: realBusiness.name,
        category: realBusiness.category,
        locationLabel: realBusiness.locationLabel,
        rating,
        language: targetLang,
        primaryAnswer: q1,
        secondaryAnswer: q2,
        variationIndex: targetVariation,
      });

      setReviewText(result.review);
      setGenerationSource(result.source);
      setHasGenerated(true);
      setVariationIndex(targetVariation);

      const usedPrompts = Boolean(q1.trim() || q2.trim());

      void recordRealCustomerSessionEvent({
        businessSlug: realBusiness.slug,
        businessOwnerId: realBusiness.ownerId,
        visitId: visitIdRef.current,
        rating,
        language: targetLang,
        usedOptionalPrompts: usedPrompts,
        stage: 'draft_generated',
      });

      setTimeout(() => {
        step3Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 60);
    } catch {
      setErrorBanner(
        'Unable to generate review right now. Please try again or write your review below.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleLanguageChange = (newLang: ReviewLanguage) => {
    setLanguage(newLang);
    if (hasGenerated && rating >= 1) {
      void runGeneration({ overrideLang: newLang, nextVariation: variationIndex });
    }
  };

  const handleRegenerate = () => {
    const nextVar = variationIndex + 1;
    void runGeneration({ nextVariation: nextVar });
  };

  const handleCopyReview = async () => {
    setClipboardError(null);
    const result = await copyTextToClipboard(reviewText);
    if (result.ok) {
      setCopiedState('copied');
      if (rating >= 1 && realBusiness) {
        const usedPrompts = Boolean(primaryAnswer.trim() || secondaryAnswer.trim());
        void recordRealCustomerSessionEvent({
          businessSlug: realBusiness.slug,
          businessOwnerId: realBusiness.ownerId,
          visitId: visitIdRef.current,
          rating,
          language,
          usedOptionalPrompts: usedPrompts,
          stage: 'copied_review',
        });
      }
      setTimeout(() => {
        setCopiedState((prev) => (prev === 'copied' ? 'idle' : prev));
      }, 2800);
    } else {
      setCopiedState('error');
      setClipboardError(result.errorMessage ?? 'Unable to copy automatically.');
    }
  };

  const handleOpenGoogleClick = () => {
    if (rating >= 1 && realBusiness) {
      const usedPrompts = Boolean(primaryAnswer.trim() || secondaryAnswer.trim());
      void recordRealCustomerSessionEvent({
        businessSlug: realBusiness.slug,
        businessOwnerId: realBusiness.ownerId,
        visitId: visitIdRef.current,
        rating,
        language,
        usedOptionalPrompts: usedPrompts,
        stage: 'opened_google',
      });
    }
  };

  // Loading Skeleton while resolving a real QR slug from Firestore
  if (resolvingBusiness) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-slate-50/70 py-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 space-y-5">
          <div className="h-36 rounded-2xl bg-white border border-slate-200 animate-pulse" />
          <div className="h-44 rounded-2xl bg-white border border-slate-200 animate-pulse" />
        </div>
      </div>
    );
  }

  // Unclaimed or Paused Business Slug Screen
  if (notFoundInCloud || !realBusiness) {
    const targetSlug = businessSlug && businessSlug !== 'demo' ? businessSlug : 'your-shop';
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-slate-50/70 py-14">
        <div className="max-w-xl mx-auto px-4 sm:px-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 text-center space-y-4">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-950">
              This shop QR scanner is not active yet
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              No active shop scanner was found at{' '}
              <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-800">
                /review/{targetSlug}
              </code>
              . If you own this shop, you can subscribe and claim this exact scanner URL right now.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link
                to={`/dashboard?claim=${encodeURIComponent(targetSlug)}`}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors"
              >
                <span>Claim /review/{targetSlug}</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/"
                className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200/80 transition-colors"
              >
                Back to Homepage
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const effectiveGoogleUrl = isValidHttpUrl(realBusiness.googleReviewUrl)
    ? realBusiness.googleReviewUrl
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(realBusiness.name)}`;

  // Expired Monthly Subscription Screen
  if (isSubscriptionExpired) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-slate-50/70 py-14">
        <div className="max-w-xl mx-auto px-4 sm:px-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 text-center space-y-4">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-950">
              {realBusiness.name}
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              AI review drafting on this QR scanner is temporarily paused while the shop&apos;s monthly ReviewEase AI subscription is awaiting renewal. You can still open their Google page directly below.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <a
                href={effectiveGoogleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors"
              >
                <span>Open Google Maps Page</span>
                <ExternalLink className="w-4 h-4" />
              </a>
              <Link
                to="/dashboard?tab=billing"
                className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200/80 transition-colors"
              >
                Shop Owner? Renew Plan
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const displayedStars = hoveredRating || rating;
  const isOwnerViewing = Boolean(user && realBusiness.ownerId === user.uid);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50/70 py-6 sm:py-10">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 space-y-6">
        {/* Merchant Profile Header Card */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="p-5 sm:p-6 bg-white">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-950 tracking-tight">
                  {realBusiness.name}
                </h1>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  <span>{realBusiness.category}</span>
                  {realBusiness.locationLabel && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{realBusiness.locationLabel}</span>
                    </>
                  )}
                </div>
              </div>
              {isOwnerViewing && (
                <Link
                  to="/dashboard"
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 whitespace-nowrap shrink-0"
                >
                  Manage Shop →
                </Link>
              )}
            </div>
          </div>

          <div className="px-4 py-3 sm:px-6 bg-slate-50/60 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-slate-600">
              Share your honest experience in your own words. Takes under 30 seconds.
            </span>
          </div>
        </div>

        {/* Error Alert */}
        {errorBanner && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2.5 text-sm text-red-800"
          >
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{errorBanner}</span>
          </div>
        )}

        {/* STEP 1: Select a Rating */}
        <section
          aria-labelledby="step-1-heading"
          className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="step-1-heading" className="text-base sm:text-lg font-semibold text-slate-900">
              1. How was your experience at {realBusiness.name}?
            </h2>
            {rating > 0 && (
              <span className="text-xs font-mono font-medium text-slate-600 tabular-nums shrink-0">
                {rating} / 5 stars
              </span>
            )}
          </div>

          <div className="flex flex-col items-center sm:items-start gap-3 pt-1">
            <div
              role="radiogroup"
              aria-label="Star rating from 1 to 5"
              className="flex items-center gap-1 sm:gap-2"
              onMouseLeave={() => setHoveredRating(0)}
            >
              {[1, 2, 3, 4, 5].map((starValue) => {
                const filled = starValue <= displayedStars;
                const isSelected = rating === starValue;
                return (
                  <button
                    key={starValue}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={`${starValue} ${
                      starValue === 1 ? 'star' : 'stars'
                    } — ${getRatingLabel(starValue)}`}
                    onMouseEnter={() => setHoveredRating(starValue)}
                    onClick={() => handleSelectRating(starValue)}
                    className={`w-12 h-12 sm:w-13 sm:h-13 rounded-xl flex items-center justify-center transition-transform duration-150 active:scale-95 focus-visible:outline-2 focus-visible:outline-indigo-600 ${
                      isSelected
                        ? 'bg-amber-50 border border-amber-200'
                        : 'hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <Star
                      className={`w-7 h-7 sm:w-8 sm:h-8 transition-colors duration-150 ${
                        filled
                          ? 'fill-amber-400 text-amber-400'
                          : 'fill-transparent text-slate-300'
                      }`}
                    />
                  </button>
                );
              })}
            </div>

            <div className="text-sm font-medium text-slate-700">
              {rating > 0 ? (
                <span>
                  Selected: <strong className="text-slate-950">{rating} out of 5</strong> —{' '}
                  {getRatingLabel(rating)}
                </span>
              ) : (
                <span className="text-slate-500">Tap a star above to begin</span>
              )}
            </div>
          </div>
        </section>

        {/* STEP 2: Describe the Experience */}
        {rating > 0 && activePrompts && (
          <section
            aria-labelledby="step-2-heading"
            className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 id="step-2-heading" className="text-base sm:text-lg font-semibold text-slate-900">
                  2. Share a few quick details
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Both questions are optional. Tap quick suggestions or skip straight to generating your review.
                </p>
              </div>
              <span className="text-xs text-slate-500">Optional</span>
            </div>

            <div className="space-y-2">
              <label htmlFor="review-q1" className="block text-sm font-medium text-slate-800">
                {activePrompts.q1Label}
              </label>
              <input
                id="review-q1"
                type="text"
                value={primaryAnswer}
                onChange={(e) => setPrimaryAnswer(e.target.value)}
                placeholder={activePrompts.q1Placeholder}
                maxLength={220}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
              />
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {activePrompts.q1Suggestions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => appendSuggestion(primaryAnswer, item, setPrimaryAnswer)}
                    className="px-2.5 py-1 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200/80 hover:text-slate-900 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    + {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="review-q2" className="block text-sm font-medium text-slate-800">
                {activePrompts.q2Label}
              </label>
              <input
                id="review-q2"
                type="text"
                value={secondaryAnswer}
                onChange={(e) => setSecondaryAnswer(e.target.value)}
                placeholder={activePrompts.q2Placeholder}
                maxLength={220}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
              />
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {activePrompts.q2Suggestions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => appendSuggestion(secondaryAnswer, item, setSecondaryAnswer)}
                    className="px-2.5 py-1 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200/80 hover:text-slate-900 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    + {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <span className="text-sm font-medium text-slate-800">Review language</span>
                <div
                  role="group"
                  aria-label="Select review language"
                  className="inline-flex items-center p-1 bg-slate-100 rounded-lg self-start sm:self-auto"
                >
                  {(['English', 'Hindi', 'Hinglish'] as ReviewLanguage[]).map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => handleLanguageChange(lang)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 ${
                        language === lang
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => void runGeneration()}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Writing Review...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Generate Review</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => void runGeneration({ skipOptionalAnswers: true })}
                  className="inline-flex items-center justify-center px-4 py-3 text-xs sm:text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200/80 hover:text-slate-900 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
                >
                  Skip questions &amp; generate
                </button>
              </div>
            </div>
          </section>
        )}

        {rating === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-6 text-center space-y-1.5">
            <p className="text-sm font-medium text-slate-700">
              Select a star rating above to unlock AI review drafting
            </p>
            <p className="text-xs text-slate-500">
              Supports 1-star through 5-star reviews in English, हिन्दी, and Hinglish.
            </p>
          </div>
        )}

        {/* STEP 3: Editable Generated Review */}
        {hasGenerated && (
          <section
            ref={step3Ref}
            aria-labelledby="step-3-heading"
            className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 id="step-3-heading" className="text-base sm:text-lg font-semibold text-slate-900">
                  3. Review and edit your words
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Edit any phrase below so it reflects your exact experience.
                </p>
              </div>

              <div
                role="group"
                aria-label="Switch generated review language"
                className="inline-flex items-center p-1 bg-slate-100 rounded-lg"
              >
                {(['English', 'Hindi', 'Hinglish'] as ReviewLanguage[]).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    disabled={isGenerating}
                    onClick={() => handleLanguageChange(lang)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 ${
                      language === lang
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="editable-review-textarea" className="sr-only">
                Editable review text
              </label>
              <textarea
                id="editable-review-textarea"
                rows={4}
                value={reviewText}
                onChange={(e) => {
                  setReviewText(e.target.value);
                  if (copiedState !== 'idle') setCopiedState('idle');
                }}
                placeholder="Your generated review appears here. Feel free to edit anything..."
                className="w-full p-3.5 text-sm sm:text-base leading-relaxed bg-slate-50/60 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
              />

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <span>
                    {generationSource === 'gemini' || generationSource === 'openrouter'
                      ? 'Drafted with live AI'
                      : 'AI-assisted draft'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{rating}-star sentiment</span>
                </div>
                <span className="font-mono tabular-nums">{reviewText.length} characters</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                disabled={isGenerating}
                onClick={handleRegenerate}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200/80 hover:text-slate-950 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                <span>Regenerate</span>
              </button>

              <button
                type="button"
                onClick={() => void handleCopyReview()}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                {copiedState === 'copied' ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-700 font-semibold">Copied Review</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Review</span>
                  </>
                )}
              </button>
            </div>

            {clipboardError && (
              <div
                role="alert"
                className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <span>{clipboardError}</span>
              </div>
            )}
          </section>
        )}

        {/* STEP 4: Continue to Google */}
        {hasGenerated && (
          <section
            aria-labelledby="step-4-heading"
            className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5 sm:p-6 space-y-4"
          >
            <div className="space-y-1">
              <h2 id="step-4-heading" className="text-base sm:text-lg font-semibold text-slate-900">
                4. Copy &amp; post on Google Maps
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Copy your review text below, then open Google Maps / Reviews to paste, double-check, and submit it under your own Google account.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                type="button"
                onClick={() => void handleCopyReview()}
                className={`flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold rounded-xl border transition-colors whitespace-nowrap shrink-0 ${
                  copiedState === 'copied'
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'bg-white border-slate-300 text-slate-900 hover:bg-slate-50'
                }`}
              >
                {copiedState === 'copied' ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Copied to Clipboard</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Review</span>
                  </>
                )}
              </button>

              <a
                href={effectiveGoogleUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleOpenGoogleClick}
                className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              >
                <span>Open Google Maps</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              ReviewEase AI never automatically publishes reviews. You always paste and submit your review directly on Google.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
