import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertCircle,
  Check,
  CreditCard,
  ExternalLink,
  Loader2,
  Sparkles,
} from 'lucide-react';
import {
  buildUpiPaymentUri,
  getPlanCatalogItem,
  getPlanDisplayName,
  getPlanPriceInr,
  isSubscriptionCurrentlyValid,
  SUBSCRIPTION_PLANS,
} from '../data/subscriptionPlans';
import { activateOrUpdateMerchantSubscription } from '../services/firestoreService';
import type {
  BillingCycle,
  MerchantSubscriptionRecord,
  PaidPlanId,
  PlatformBillingConfigRecord,
} from '../types/review';

interface SubscriptionBillingPanelProps {
  subscription: MerchantSubscriptionRecord | null;
  billingConfig: PlatformBillingConfigRecord;
  currentBusinessesCount: number;
  defaultAccountLabel: string;
  initialPlanId?: PaidPlanId;
  initialCycle?: BillingCycle;
  onActivated?: (sub: MerchantSubscriptionRecord) => void;
}

export function SubscriptionBillingPanel({
  subscription,
  billingConfig,
  currentBusinessesCount,
  defaultAccountLabel,
  initialPlanId,
  initialCycle,
  onActivated,
}: SubscriptionBillingPanelProps) {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(
    initialCycle ?? subscription?.billingCycle ?? 'monthly'
  );
  const [selectedPlanId, setSelectedPlanId] = useState<PaidPlanId>(
    initialPlanId ??
      (subscription?.planId && subscription.planId !== 'trial'
        ? subscription.planId
        : 'starter')
  );
  const [accountLabel, setAccountLabel] = useState<string>(
    subscription?.accountLabel || defaultAccountLabel || 'My Shop'
  );
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [upiQrDataUrl, setUpiQrDataUrl] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const selectedPlan = useMemo(
    () => getPlanCatalogItem(selectedPlanId),
    [selectedPlanId]
  );

  const payableAmountInr = useMemo(
    () => getPlanPriceInr(selectedPlanId, billingCycle),
    [selectedPlanId, billingCycle]
  );

  const upiUri = useMemo(() => {
    if (!billingConfig.upiId.trim()) return '';
    return buildUpiPaymentUri({
      upiId: billingConfig.upiId,
      payeeName: billingConfig.payeeName || 'ReviewEase AI',
      amountInr: payableAmountInr,
      note: `ReviewEase ${selectedPlan.name} (${billingCycle})`,
    });
  }, [billingConfig.upiId, billingConfig.payeeName, payableAmountInr, selectedPlan.name, billingCycle]);

  const planPaymentLink = useMemo(() => {
    if (selectedPlanId === 'starter') return billingConfig.paymentLinkStarter.trim();
    if (selectedPlanId === 'growth') return billingConfig.paymentLinkGrowth.trim();
    return billingConfig.paymentLinkAgency.trim();
  }, [selectedPlanId, billingConfig]);

  useEffect(() => {
    if (!upiUri) {
      setUpiQrDataUrl('');
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(upiUri, {
      width: 360,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (!cancelled) setUpiQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setUpiQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [upiUri]);

  const subValid = isSubscriptionCurrentlyValid(subscription);
  const canStartFreeTrial = !subscription && billingConfig.trialDays > 0;

  const handleStartTrial = async () => {
    setFeedback(null);
    setIsSubmitting(true);
    try {
      const created = await activateOrUpdateMerchantSubscription({
        accountLabel,
        planId: 'trial',
        billingCycle: 'monthly',
        paymentReference: 'FREE_TRIAL',
        trialDays: billingConfig.trialDays || 7,
      });
      setFeedback({
        type: 'success',
        text: `${billingConfig.trialDays || 7}-day free shop trial activated. You can now create your shop QR scanner.`,
      });
      onActivated?.(created);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to start trial right now.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleActivatePaidPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const requiresRef = Boolean(billingConfig.upiId.trim() || planPaymentLink);
    if (requiresRef && paymentReference.trim().length < 4) {
      setFeedback({
        type: 'error',
        text: 'Please enter your UPI UTR / Transaction ID after completing payment.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await activateOrUpdateMerchantSubscription({
        accountLabel,
        planId: selectedPlanId,
        billingCycle,
        paymentReference:
          paymentReference.trim() || `PLAN_${selectedPlanId.toUpperCase()}_${billingCycle.toUpperCase()}`,
      });
      setPaymentReference('');
      setFeedback({
        type: 'success',
        text: `${selectedPlan.name} (${billingCycle}) subscription is now active.`,
      });
      onActivated?.(updated);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to activate subscription.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Current Subscription Summary Banner */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Current Plan Status</span>
            <span aria-hidden="true">·</span>
            <span
              className={
                subValid ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'
              }
            >
              {subscription
                ? subValid
                  ? subscription.status === 'trialing'
                    ? 'Active Free Trial'
                    : 'Active Subscription'
                  : 'Expired / Action Needed'
                : 'No Active Plan Yet'}
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-950">
            {subscription
              ? `${getPlanDisplayName(subscription.planId)} (${subscription.billingCycle})`
              : 'Step 1: Choose a monthly subscription for your shop QR scanner'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-600">
            {subscription ? (
              <>
                Shop QR Scanners used:{' '}
                <strong className="font-mono tabular-nums text-slate-900">
                  {currentBusinessesCount} / {subscription.maxBusinesses}
                </strong>{' '}
                · Valid until{' '}
                <strong className="font-mono tabular-nums text-slate-900">
                  {new Date(subscription.currentPeriodEndMs).toLocaleDateString()}
                </strong>
                {subscription.paymentReference ? ` · Ref: ${subscription.paymentReference}` : ''}
              </>
            ) : (
              'Activate your plan below (or start a free trial) to unlock your Google Maps QR standee and live AI review page.'
            )}
          </p>
        </div>

        {canStartFreeTrial && (
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => void handleStartTrial()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-4 h-4" />
            <span>Start {billingConfig.trialDays}-Day Free Trial (₹0)</span>
          </button>
        )}
      </div>

      {feedback && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-xs sm:text-sm flex items-start gap-2.5 ${
            feedback.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          {feedback.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          ) : (
            <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Plan Selection Grid */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-slate-900">
              Select Shop Subscription Tier
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Upgrade or renew anytime. All plans include print-ready shop counter QR standees.
            </p>
          </div>

          <div
            role="group"
            aria-label="Billing cycle"
            className="inline-flex items-center p-1 bg-slate-100 rounded-lg self-start sm:self-auto"
          >
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                billingCycle === 'monthly'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('annual')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                billingCycle === 'annual'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Annual (Save 20%)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SUBSCRIPTION_PLANS.map((plan) => {
            const active = selectedPlanId === plan.id;
            const monthlyDisplay =
              billingCycle === 'annual' ? plan.annualMonthlyEquivalentInr : plan.monthlyPriceInr;

            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlanId(plan.id)}
                className={`text-left rounded-xl p-5 border transition-colors flex flex-col justify-between gap-4 ${
                  active
                    ? 'border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-600'
                    : 'border-slate-200 bg-white hover:bg-slate-50/70'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-950">{plan.name}</span>
                    <span className="text-xs font-mono font-medium text-indigo-600 tabular-nums">
                      Up to {plan.maxBusinesses} {plan.maxBusinesses === 1 ? 'shop' : 'shops'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{plan.audience}</p>
                  <div className="pt-1 flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-slate-950 font-mono tabular-nums">
                      ₹{monthlyDisplay.toLocaleString('en-IN')}
                    </span>
                    <span className="text-xs text-slate-500">/ mo</span>
                  </div>
                </div>

                <ul className="space-y-1.5 text-xs text-slate-600 border-t border-slate-200/70 pt-3">
                  {plan.highlights.slice(0, 3).map((item) => (
                    <li key={item} className="flex items-start gap-1.5">
                      <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        {/* Checkout & Activation Form */}
        <form
          onSubmit={(e) => void handleActivatePaidPlan(e)}
          className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center"
        >
          <div className="lg:col-span-7 space-y-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Selected Checkout</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums font-semibold text-slate-800">
                  ₹{payableAmountInr.toLocaleString('en-IN')}{' '}
                  {billingCycle === 'annual' ? 'for 12 months' : 'for 30 days'}
                </span>
              </div>
              <h4 className="text-base font-semibold text-slate-950">
                Activate {selectedPlan.name} ({billingCycle === 'annual' ? 'Annual' : 'Monthly'})
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="sub-account-label" className="block text-xs font-semibold text-slate-700">
                  Business / Account Name
                </label>
                <input
                  id="sub-account-label"
                  type="text"
                  required
                  maxLength={80}
                  value={accountLabel}
                  onChange={(e) => setAccountLabel(e.target.value)}
                  placeholder="e.g., Sharma Enterprises"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="sub-utr-ref" className="block text-xs font-semibold text-slate-700">
                  {billingConfig.upiId || planPaymentLink
                    ? 'UPI UTR / Transaction ID *'
                    : 'Payment Reference (Optional)'}
                </label>
                <input
                  id="sub-utr-ref"
                  type="text"
                  maxLength={80}
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder={
                    billingConfig.upiId || planPaymentLink
                      ? '12-digit UPI UTR or Txn ID'
                      : 'Optional reference note'
                  }
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
            </div>

            {planPaymentLink && (
              <div className="pt-1">
                <a
                  href={planPaymentLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 underline underline-offset-4"
                >
                  <span>Pay ₹{payableAmountInr.toLocaleString('en-IN')} via Online Payment Link</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Activating Plan...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4" />
                    <span>
                      Activate {selectedPlan.name} — ₹{payableAmountInr.toLocaleString('en-IN')}
                    </span>
                  </>
                )}
              </button>

              {billingConfig.supportContact && (
                <span className="text-xs text-slate-500">
                  Billing support: {billingConfig.supportContact}
                </span>
              )}
            </div>
          </div>

          {/* Right 5 Cols: Dynamic UPI Checkout QR or Instant Setup Info */}
          <div className="lg:col-span-5">
            {upiQrDataUrl ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col items-center text-center space-y-2">
                <p className="text-xs font-semibold text-slate-900">
                  Scan with GPay, PhonePe, or Paytm
                </p>
                <img
                  src={upiQrDataUrl}
                  alt="UPI Checkout QR Code"
                  className="w-36 h-36 rounded-lg border border-slate-200 p-1.5 bg-white"
                />
                <p className="text-xs font-mono text-slate-700 tabular-nums">
                  {billingConfig.upiId} · ₹{payableAmountInr.toLocaleString('en-IN')}
                </p>
                <p className="text-[11px] text-slate-500">
                  Pay exact amount, then enter your 12-digit UTR on the left to unlock immediately.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 text-xs text-slate-600">
                <p className="font-semibold text-slate-900">What unlocks immediately:</p>
                <ul className="space-y-1.5">
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                    <span>
                      Up to <strong>{selectedPlan.maxBusinesses}</strong> live shop QR scanner{' '}
                      {selectedPlan.maxBusinesses === 1 ? 'page' : 'pages'}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                    <span>Paste any Google Maps link &amp; download print-ready counter standee</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                    <span>Unlimited AI customer reviews in English, हिन्दी &amp; Hinglish</span>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
