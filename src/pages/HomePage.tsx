import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  Copy,
  Edit3,
  ExternalLink,
  Globe,
  QrCode,
  Smartphone,
  Sparkles,
  Star,
} from 'lucide-react';
import { ResilientImage } from '../components/ResilientImage';
import { generateMockReviewSync, getRatingLabel } from '../services/reviewAiService';
import type { ReviewLanguage } from '../types/review';

const CAFE_QR_STAND_IMAGE = '/src/assets/images/cafe_table_qr_stand_1793280830536.jpg';

const PREVIEW_PRESETS: Record<
  number,
  { q1Label: string; q1Value: string; q2Label: string; q2Value: string }
> = {
  5: {
    q1Label: 'What did you like?',
    q1Value: 'the hazelnut cold brew and warm sourdough toast',
    q2Label: 'How was the service?',
    q2Value: 'the staff was welcoming and quick with our order',
  },
  4: {
    q1Label: 'What did you like?',
    q1Value: 'cozy seating and fresh filter coffee',
    q2Label: 'How was the service?',
    q2Value: 'polite team at the counter',
  },
  3: {
    q1Label: 'What went well?',
    q1Value: 'coffee tasted good and the music was calm',
    q2Label: 'What could be improved?',
    q2Value: 'table clearing took longer than expected during lunch hour',
  },
  2: {
    q1Label: 'What went wrong?',
    q1Value: 'our sandwiches arrived lukewarm after a 35-minute wait',
    q2Label: 'What should be improved?',
    q2Value: 'faster kitchen turnaround and clearer wait-time updates',
  },
  1: {
    q1Label: 'What went wrong?',
    q1Value: 'wrong order was served twice and tables were sticky',
    q2Label: 'What should be improved?',
    q2Value: 'basic cleanliness and order accuracy',
  },
};

export function HomePage() {
  const location = useLocation();
  const [previewRating, setPreviewRating] = useState<number>(5);
  const [previewLang, setPreviewLang] = useState<ReviewLanguage>('English');

  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace('#', '');
      const el = document.getElementById(id);
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth' });
        }, 60);
      }
    }
  }, [location.hash]);

  const currentPreset = PREVIEW_PRESETS[previewRating] ?? PREVIEW_PRESETS[5];
  const previewDraft = generateMockReviewSync({
    businessName: 'The Urban Cafe',
    category: 'Cafe & Restaurant',
    rating: previewRating,
    language: previewLang,
    primaryAnswer: currentPreset.q1Value,
    secondaryAnswer: currentPreset.q2Value,
    variationIndex: 0,
  });

  const scrollToHowItWorks = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const target = document.getElementById('how-it-works');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="bg-white text-slate-900">
      {/* Hero Section */}
      <section className="pt-12 pb-16 sm:pt-16 sm:pb-24 border-b border-slate-200/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            <div className="lg:col-span-6 space-y-6">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <span>Live AI Review Drafting</span>
                <span aria-hidden="true">·</span>
                <span>English, Hindi &amp; Hinglish</span>
              </div>

              <h1
                className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-950 leading-[1.12]"
                style={{ textWrap: 'balance' }}
              >
                Your Experience. Your Words. Powered by AI.
              </h1>

              <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
                Generate a natural Google review in seconds. No more struggling to find the right words.
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                <Link
                  to="/review/demo"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                >
                  <span>Generate a Review</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>

                <a
                  href="#how-it-works"
                  onClick={scrollToHowItWorks}
                  className="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 hover:text-slate-950 transition-colors duration-150 whitespace-nowrap shrink-0"
                >
                  See How It Works
                </a>
              </div>

              <div className="pt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span>Own a cafe, clinic, or store?</span>
                <Link
                  to="/dashboard"
                  className="font-semibold text-indigo-600 hover:text-indigo-700 underline underline-offset-4 whitespace-nowrap shrink-0"
                >
                  Create your live QR code →
                </Link>
              </div>
            </div>

            {/* Interactive Hero Preview */}
            <div className="lg:col-span-6">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200/80">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">The Urban Cafe</p>
                    <p className="text-xs text-slate-500">Cafe &amp; Restaurant · Interactive Preview</p>
                  </div>

                  <div
                    role="group"
                    aria-label="Preview review language"
                    className="inline-flex items-center p-1 bg-slate-200/70 rounded-lg"
                  >
                    {(['English', 'Hindi', 'Hinglish'] as ReviewLanguage[]).map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => setPreviewLang(lang)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 ${
                          previewLang === lang
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="py-4 space-y-2 border-b border-slate-200/80">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-600">
                      Tap a rating to preview sentiment matching:
                    </span>
                    <span className="text-xs font-medium text-slate-700 tabular-nums">
                      {previewRating}/5 · {getRatingLabel(previewRating)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((star) => {
                      const active = star <= previewRating;
                      return (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setPreviewRating(star)}
                          aria-label={`Preview ${star} star rating`}
                          className="p-1.5 rounded-md hover:bg-white transition-colors focus-visible:outline-2 focus-visible:outline-indigo-600"
                        >
                          <Star
                            className={`w-6 h-6 transition-colors ${
                              active
                                ? 'fill-amber-400 text-amber-400'
                                : 'fill-transparent text-slate-300'
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="py-4 space-y-2.5 border-b border-slate-200/80 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                    <span className="font-medium text-slate-500">{currentPreset.q1Label}</span>
                    <span className="text-slate-800 sm:text-right">{currentPreset.q1Value}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                    <span className="font-medium text-slate-500">{currentPreset.q2Label}</span>
                    <span className="text-slate-800 sm:text-right">{currentPreset.q2Value}</span>
                  </div>
                </div>

                <div className="pt-4 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-medium text-slate-700">AI Review Draft</span>
                    <span className="font-mono tabular-nums">{previewDraft.length} chars</span>
                  </div>

                  <p className="text-sm text-slate-800 leading-relaxed bg-white border border-slate-200 rounded-xl p-3.5">
                    {previewDraft}
                  </p>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-slate-500">
                      Matches {previewRating}-star sentiment honestly
                    </span>
                    <Link
                      to="/review/demo"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 whitespace-nowrap shrink-0"
                    >
                      <span>Test live AI generator</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-16 sm:py-24 border-b border-slate-200/80 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="max-w-2xl space-y-3 mb-12">
            <p className="text-xs font-semibold text-indigo-600">Customer Workflow</p>
            <h2
              className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950"
              style={{ textWrap: 'balance' }}
            >
              From tabletop QR scan to a thoughtful Google review in under thirty seconds.
            </h2>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              Customers often want to leave feedback after a visit, but freeze at a blank text box. ReviewEase AI removes the writing friction while keeping every word authentic and customer-approved.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-7 divide-y divide-slate-200 border-y border-slate-200">
              {[
                {
                  num: '01',
                  title: 'Scan the business QR code',
                  desc: 'Guests point their phone camera at the tabletop stand, receipt, or front-desk card to open your dedicated cloud review page in their mobile browser.',
                },
                {
                  num: '02',
                  title: 'Select your star rating',
                  desc: 'Choose from 1 to 5 stars. Every rating path is treated fairly — there is no rating gating or hidden diversion away from Google.',
                },
                {
                  num: '03',
                  title: 'Answer a few optional questions',
                  desc: 'Short, rating-aware prompts ask what stood out or what needs improvement. Guests in a hurry can skip questions completely.',
                },
                {
                  num: '04',
                  title: 'Generate and edit your review',
                  desc: 'Live AI writes a concise draft in English, Hindi, or Hinglish based solely on what was shared, inside an editable text box.',
                },
                {
                  num: '05',
                  title: 'Copy the review and publish it yourself on Google',
                  desc: 'Copy with one tap, open the business’s official Google Reviews page, paste the text, and submit directly under your own Google account.',
                },
              ].map((step) => (
                <div key={step.num} className="py-5 flex items-start gap-4 sm:gap-6">
                  <span className="font-mono text-sm font-medium text-indigo-600 tabular-nums pt-0.5 shrink-0">
                    {step.num}.
                  </span>
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold text-slate-900">{step.title}</h3>
                    <p className="text-sm text-slate-600 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/60 overflow-hidden">
              <div className="aspect-4/3 w-full overflow-hidden bg-slate-100">
                <ResilientImage
                  src={CAFE_QR_STAND_IMAGE}
                  alt="Specialty coffee cup beside a matte tabletop QR stand at a sunlit cafe table"
                  fallbackLabel="Tabletop QR Stand at The Urban Cafe"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>Built for tables, counters &amp; clinics</span>
                    <span aria-hidden="true">·</span>
                    <span>Zero app install</span>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    Claim your real business QR link &amp; print counter cards
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Sign in with Google to save your permanent business slug in Cloud Firestore, download print-ready tabletop posters, and view live session telemetry.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-4 pt-1">
                  <Link
                    to="/dashboard"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700 whitespace-nowrap shrink-0"
                  >
                    <span>Launch Your Business QR</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Asymmetric Bento Grid */}
      <section id="features" className="py-16 sm:py-24 bg-slate-50/60 border-b border-slate-200/80 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="max-w-2xl space-y-3 mb-12">
            <p className="text-xs font-semibold text-indigo-600">Core Capabilities</p>
            <h2
              className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950"
              style={{ textWrap: 'balance' }}
            >
              Everything guests and local businesses need for clear, honest reviews.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            <div className="md:col-span-7 rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 flex flex-col justify-between gap-5">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Live AI review writing grounded in real input
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Powered server-side by Gemini AI, turning brief customer notes into natural first-person sentences that strictly respect their star rating. Positive visits read warmly; negative visits stay candid without fabricated praise.
                </p>
              </div>
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>Sentiment-matched</span>
                <span aria-hidden="true">·</span>
                <span>Zero invented menu items</span>
                <span aria-hidden="true">·</span>
                <span>One-tap Regenerate</span>
              </div>
            </div>

            <div className="md:col-span-5 rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 flex flex-col justify-between gap-5">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Globe className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">
                  English, Hindi, and Hinglish support
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Guests can switch languages effortlessly so their review sounds like how they naturally speak — whether in crisp English, Devanagari Hindi, or everyday conversational Hinglish.
                </p>
              </div>
              <div className="pt-3 border-t border-slate-100 text-xs text-slate-500 flex items-center gap-2">
                <span>English</span>
                <span aria-hidden="true">·</span>
                <span>हिन्दी</span>
                <span aria-hidden="true">·</span>
                <span>Conversational Hinglish</span>
              </div>
            </div>

            <div className="md:col-span-4 rounded-2xl border border-slate-200 bg-white p-6 flex flex-col justify-between gap-4">
              <div className="space-y-2.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Edit3 className="w-5 h-5" />
                </div>
                <h3 className="text-base font-semibold text-slate-900">Editable review text</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Every generated draft opens inside an editable text box with a live character count so guests have complete final control.
                </p>
              </div>
            </div>

            <div className="md:col-span-4 rounded-2xl border border-slate-200 bg-white p-6 flex flex-col justify-between gap-4">
              <div className="space-y-2.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Copy className="w-5 h-5" />
                </div>
                <h3 className="text-base font-semibold text-slate-900">One-click copy &amp; handoff</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Copies the final review to the clipboard with graceful permission fallbacks, then opens the configured Google review link in a new tab.
                </p>
              </div>
            </div>

            <div className="md:col-span-4 rounded-2xl border border-slate-200 bg-white p-6 flex flex-col justify-between gap-4">
              <div className="space-y-2.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <h3 className="text-base font-semibold text-slate-900">Mobile-friendly experience</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Engineered for compact 360px phone screens with generous tap targets, fast load times, and zero sign-up barriers for guests.
                </p>
              </div>
            </div>

            <div className="md:col-span-12 rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex items-start gap-4 max-w-2xl">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                  <QrCode className="w-5 h-5" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-lg font-semibold text-slate-900">
                    Multi-business cloud QR codes &amp; real-time session analytics
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Claim permanent merchant slugs like{' '}
                    <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-800">
                      /review/your-cafe
                    </code>
                    , download print-ready tabletop posters, and watch anonymous draft, copy, and Google handoff metrics update live.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <Link
                  to="/dashboard"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap shrink-0"
                >
                  <span>Open Merchant Portal</span>
                  <ExternalLink className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom Action Section */}
      <section className="py-16 sm:py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-900 text-white p-8 sm:p-12 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
            <div className="space-y-3 max-w-xl">
              <h2
                className="text-2xl sm:text-3xl font-bold tracking-tight text-white"
                style={{ textWrap: 'balance' }}
              >
                Ready to put ReviewEase AI on your counter?
              </h2>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed tracking-[0.01em]">
                Sign in with Google to set up your live business QR code in seconds, or test the interactive customer review flow first.
              </p>
              <div className="pt-1 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-300">
                <span className="inline-flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-indigo-400" />
                  Cloud Firestore persistence &amp; real QR codes
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-indigo-400" />
                  100% manual customer review publishing
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto shrink-0">
              <Link
                to="/dashboard"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-slate-950 bg-white rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
              >
                <span>Launch Your Business</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/review/demo"
                className="inline-flex items-center justify-center px-5 py-3 text-sm font-semibold text-white border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                Try Customer Demo
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
