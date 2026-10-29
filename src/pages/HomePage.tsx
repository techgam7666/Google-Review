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
import cafeQrStandImg from '../assets/images/cafe_table_qr_stand_1793280830536.jpg';
import { ResilientImage } from '../components/ResilientImage';
import { SUBSCRIPTION_PLANS } from '../data/subscriptionPlans';
import { generateMockReviewSync, getRatingLabel } from '../services/reviewAiService';
import type { BillingCycle, ReviewLanguage } from '../types/review';

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
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');

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

  const scrollToPricing = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const target = document.getElementById('pricing');
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
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
                <span>AI QR Scanner SaaS for Local Shops</span>
                <span aria-hidden="true">·</span>
                <span>English, हिन्दी &amp; Hinglish</span>
              </div>

              <h1
                className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-950 leading-[1.12]"
                style={{ textWrap: 'balance' }}
              >
                Your Experience. Your Words. Powered by AI.
              </h1>

              <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
                Subscribe in 60 seconds, paste your Google Maps link, and place our QR standee on your shop counter. When customers scan, AI helps them write a genuine Google review in seconds.
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                <a
                  href="#pricing"
                  onClick={scrollToPricing}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                >
                  <span>Get Shop QR Scanner</span>
                  <ArrowRight className="w-4 h-4" />
                </a>

                <Link
                  to="/review/demo"
                  className="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 hover:text-slate-950 transition-colors duration-150 whitespace-nowrap shrink-0"
                >
                  Generate a Demo Review
                </Link>
              </div>

              <div className="pt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span>Plans start at ₹499/month · Includes 7-day free shop trial</span>
                <span aria-hidden="true">·</span>
                <Link
                  to="/dashboard"
                  className="font-semibold text-indigo-600 hover:text-indigo-700 underline underline-offset-4 whitespace-nowrap shrink-0"
                >
                  Open Merchant Portal →
                </Link>
              </div>
            </div>

            {/* Interactive Hero Preview */}
            <div className="lg:col-span-6">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200/80">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">The Urban Cafe</p>
                    <p className="text-xs text-slate-500">
                      What your customer sees after scanning your shop QR
                    </p>
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

      {/* How It Works Section: Both Shop Owner Setup & Customer QR Scan */}
      <section id="how-it-works" className="py-16 sm:py-24 border-b border-slate-200/80 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-14">
          <div className="max-w-2xl space-y-3">
            <p className="text-xs font-semibold text-indigo-600">How ReviewEase AI Works</p>
            <h2
              className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950"
              style={{ textWrap: 'balance' }}
            >
              Set up your shop scanner once. Turn everyday visits into thoughtful Google reviews.
            </h2>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              Built for clinics, salons, cafes, retail stores, and restaurants. Shop owners subscribe in three simple steps, and customers scan without installing any app.
            </p>
          </div>

          {/* 3-Step Shop Owner Setup Strip */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                step: '01. Subscribe Monthly',
                title: 'Pick your shop plan or 7-day free trial',
                body: 'Sign in with Google and choose Starter (1 shop), Growth (up to 5 outlets), or Agency (up to 25 outlets).',
              },
              {
                step: '02. Paste Your Google Maps Link',
                title: 'Connect any Google Maps or Business link',
                body: 'Paste your Google Maps share link (maps.app.goo.gl or g.page) or generate it directly from your shop name and city.',
              },
              {
                step: '03. Print & Place Counter Scanner',
                title: 'Put the QR standee on your shop desk',
                body: 'Download your print-ready shop standee poster. Whenever a customer scans it, your dedicated AI review page opens.',
              },
            ].map((card) => (
              <div
                key={card.step}
                className="rounded-2xl border border-slate-200 bg-slate-50/70 p-6 space-y-2.5"
              >
                <p className="font-mono text-xs font-semibold text-indigo-600 tabular-nums">
                  {card.step}
                </p>
                <h3 className="text-base font-semibold text-slate-950">{card.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{card.body}</p>
              </div>
            ))}
          </div>

          {/* 5-Step Customer Experience Split */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch pt-2">
            <div className="lg:col-span-7 divide-y divide-slate-200 border-y border-slate-200">
              {[
                {
                  num: '01',
                  title: 'Customer scans your shop QR standee',
                  desc: 'Guests point their phone camera at your counter stand, billing desk, or receipt to open your shop’s dedicated review page.',
                },
                {
                  num: '02',
                  title: 'Selects their star rating (1 to 5 stars)',
                  desc: 'Every rating path is treated fairly and transparently — no rating gating or hidden diversion away from Google.',
                },
                {
                  num: '03',
                  title: 'Taps a few optional quick details',
                  desc: 'Short, rating-aware prompts ask what stood out or what needs improvement. Guests in a rush can skip straight to generating.',
                },
                {
                  num: '04',
                  title: 'AI writes a natural draft in English, Hindi, or Hinglish',
                  desc: 'Server-side AI drafts a concise, authentic review inside an editable text box so the customer stays in full control.',
                },
                {
                  num: '05',
                  title: 'Copies review & posts directly on your Google Maps page',
                  desc: 'One tap copies the text and opens your exact Google Maps / Business review link so the customer pastes and submits.',
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
                  src={cafeQrStandImg}
                  alt="Specialty coffee cup beside a matte tabletop QR stand at a sunlit cafe table"
                  fallbackLabel="Shop Counter QR Standee"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>Clinics · Salons · Cafes · Retail Stores</span>
                    <span aria-hidden="true">·</span>
                    <span>Zero app install</span>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    Ready-to-print counter QR standee included in every plan
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Choose from Classic White, Executive Navy, or Warm Gold standee designs and print at any local stationery or acrylic stand shop.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-4 pt-1">
                  <Link
                    to="/dashboard"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700 whitespace-nowrap shrink-0"
                  >
                    <span>Create Your Shop Scanner</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Monthly SaaS Subscription Pricing Section */}
      <section id="pricing" className="py-16 sm:py-24 bg-slate-50/60 border-b border-slate-200/80 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="max-w-2xl space-y-2.5">
              <p className="text-xs font-semibold text-indigo-600">Monthly SaaS Subscriptions</p>
              <h2
                className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950"
                style={{ textWrap: 'balance' }}
              >
                Simple monthly pricing for every shop size.
              </h2>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                Start with a 7-day free trial or subscribe monthly. Paste your Google Maps link and download your shop QR scanner immediately.
              </p>
            </div>

            {/* Interactive Monthly / Annual Cadence Toggle */}
            <div
              role="group"
              aria-label="Select billing cycle"
              className="inline-flex items-center p-1 bg-slate-200/80 rounded-xl self-start md:self-auto shrink-0"
            >
              <button
                type="button"
                onClick={() => setBillingCycle('monthly')}
                className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  billingCycle === 'monthly'
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Monthly Billing
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle('annual')}
                className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  billingCycle === 'annual'
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Annual (Save 20%)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
            {SUBSCRIPTION_PLANS.map((plan) => {
              const displayMonthlyInr =
                billingCycle === 'annual' ? plan.annualMonthlyEquivalentInr : plan.monthlyPriceInr;
              const isHighlighted = Boolean(plan.popular);

              return (
                <div
                  key={plan.id}
                  className={`rounded-2xl p-6 sm:p-7 flex flex-col justify-between gap-6 ${
                    isHighlighted
                      ? 'bg-slate-950 text-white border border-slate-900'
                      : 'bg-white text-slate-900 border border-slate-200'
                  }`}
                >
                  <div className="space-y-5">
                    <div className="space-y-1.5">
                      <div
                        className={`flex items-center gap-2 text-xs font-medium ${
                          isHighlighted ? 'text-indigo-300' : 'text-slate-500'
                        }`}
                      >
                        <span>{plan.audience}</span>
                        {isHighlighted && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold text-indigo-300">Most Popular</span>
                          </>
                        )}
                      </div>
                      <h3
                        className={`text-xl font-bold tracking-tight ${
                          isHighlighted ? 'text-white' : 'text-slate-950'
                        }`}
                      >
                        {plan.name}
                      </h3>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-baseline gap-1.5">
                        <span
                          className={`text-3xl sm:text-4xl font-bold font-mono tabular-nums ${
                            isHighlighted ? 'text-white' : 'text-slate-950'
                          }`}
                        >
                          ₹{displayMonthlyInr.toLocaleString('en-IN')}
                        </span>
                        <span
                          className={`text-xs sm:text-sm ${
                            isHighlighted ? 'text-slate-300' : 'text-slate-500'
                          }`}
                        >
                          / month
                        </span>
                      </div>
                      <p
                        className={`text-xs font-mono tabular-nums ${
                          isHighlighted ? 'text-slate-400' : 'text-slate-500'
                        }`}
                      >
                        {billingCycle === 'annual'
                          ? `Billed ₹${plan.annualTotalInr.toLocaleString('en-IN')} yearly · Up to ${plan.maxBusinesses} ${plan.maxBusinesses === 1 ? 'shop' : 'shops'}`
                          : `Billed monthly · Up to ${plan.maxBusinesses} ${plan.maxBusinesses === 1 ? 'shop' : 'shops'}`}
                      </p>
                    </div>

                    <ul
                      className={`space-y-2.5 text-sm pt-2 border-t ${
                        isHighlighted
                          ? 'border-slate-800 text-slate-200'
                          : 'border-slate-100 text-slate-700'
                      }`}
                    >
                      {plan.highlights.map((feature) => (
                        <li key={feature} className="flex items-start gap-2.5">
                          <Check
                            className={`w-4 h-4 shrink-0 mt-0.5 ${
                              isHighlighted ? 'text-indigo-400' : 'text-indigo-600'
                            }`}
                          />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-2.5 pt-2">
                    <Link
                      to={`/dashboard?plan=${plan.id}&cycle=${billingCycle}`}
                      className={`w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 ${
                        isHighlighted
                          ? 'bg-indigo-500 text-white hover:bg-indigo-400'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700'
                      }`}
                    >
                      <span>Choose {plan.name}</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                    <p
                      className={`text-center text-xs ${
                        isHighlighted ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      Instant QR scanner setup · Cancel anytime
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features Asymmetric Bento Grid */}
      <section id="features" className="py-16 sm:py-24 bg-white border-b border-slate-200/80 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="max-w-2xl space-y-3 mb-12">
            <p className="text-xs font-semibold text-indigo-600">Core Capabilities</p>
            <h2
              className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950"
              style={{ textWrap: 'balance' }}
            >
              Everything local shops and customers need for clear, honest Google reviews.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            <div className="md:col-span-7 rounded-2xl border border-slate-200 bg-slate-50/50 p-6 sm:p-7 flex flex-col justify-between gap-5">
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
              <div className="pt-3 border-t border-slate-200/70 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>Sentiment-matched</span>
                <span aria-hidden="true">·</span>
                <span>Zero invented items</span>
                <span aria-hidden="true">·</span>
                <span>One-tap Regenerate</span>
              </div>
            </div>

            <div className="md:col-span-5 rounded-2xl border border-slate-200 bg-slate-50/50 p-6 sm:p-7 flex flex-col justify-between gap-5">
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
              <div className="pt-3 border-t border-slate-200/70 text-xs text-slate-500 flex items-center gap-2">
                <span>English</span>
                <span aria-hidden="true">·</span>
                <span>हिन्दी</span>
                <span aria-hidden="true">·</span>
                <span>Conversational Hinglish</span>
              </div>
            </div>

            <div className="md:col-span-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-6 flex flex-col justify-between gap-4">
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

            <div className="md:col-span-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-6 flex flex-col justify-between gap-4">
              <div className="space-y-2.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Copy className="w-5 h-5" />
                </div>
                <h3 className="text-base font-semibold text-slate-900">Works with any Google Maps link</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Paste your Google Maps mobile share link, g.page review link, or let ReviewEase build your link from your shop name and city.
                </p>
              </div>
            </div>

            <div className="md:col-span-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-6 flex flex-col justify-between gap-4">
              <div className="space-y-2.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <h3 className="text-base font-semibold text-slate-900">Mobile-friendly QR scan</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Engineered for compact 360px phone screens with generous tap targets, fast load times, and zero sign-up barriers for guests.
                </p>
              </div>
            </div>

            <div className="md:col-span-12 rounded-2xl border border-slate-200 bg-slate-50/50 p-6 sm:p-7 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex items-start gap-4 max-w-2xl">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                  <QrCode className="w-5 h-5" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-lg font-semibold text-slate-900">
                    Multi-outlet QR scanners &amp; real-time customer scan analytics
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Claim permanent shop slugs like{' '}
                    <code className="font-mono text-xs bg-slate-200/70 px-1.5 py-0.5 rounded text-slate-800">
                      /review/your-shop
                    </code>
                    , print counter standees, and watch anonymous draft, copy, and Google handoff metrics update live.
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
                Put a smart AI Review Scanner on your shop counter today.
              </h2>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed tracking-[0.01em]">
                Start your 7-day free trial or monthly plan, paste your Google Maps link, and print your shop QR standee in under two minutes.
              </p>
              <div className="pt-1 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-300">
                <span className="inline-flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-indigo-400" />
                  Works with any Google Maps share link
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-indigo-400" />
                  100% customer-edited &amp; published on Google
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto shrink-0">
              <Link
                to="/dashboard"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-slate-950 bg-white rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
              >
                <span>Start Shop Subscription</span>
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
