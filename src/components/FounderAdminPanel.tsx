import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  Loader2,
  PauseCircle,
  PlayCircle,
  Plus,
  Search,
} from 'lucide-react';
import { getPlanDisplayName, isSubscriptionCurrentlyValid } from '../data/subscriptionPlans';
import {
  adminUpdateMerchantSubscription,
  savePlatformBillingConfig,
  setRealBusinessActiveStatus,
  subscribeAllPlatformBusinesses,
  subscribeAllPlatformSubscriptions,
} from '../services/firestoreService';
import type {
  MerchantSubscriptionRecord,
  PlatformBillingConfigRecord,
  RealBusinessRecord,
} from '../types/review';

interface FounderAdminPanelProps {
  billingConfig: PlatformBillingConfigRecord;
  onBillingConfigSaved: () => void;
}

export function FounderAdminPanel({
  billingConfig,
  onBillingConfigSaved,
}: FounderAdminPanelProps) {
  const [allSubscriptions, setAllSubscriptions] = useState<MerchantSubscriptionRecord[]>([]);
  const [allBusinesses, setAllBusinesses] = useState<RealBusinessRecord[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);

  // Billing Config Form State
  const [upiId, setUpiId] = useState<string>(billingConfig.upiId);
  const [payeeName, setPayeeName] = useState<string>(billingConfig.payeeName || 'ReviewEase AI');
  const [linkStarter, setLinkStarter] = useState<string>(billingConfig.paymentLinkStarter);
  const [linkGrowth, setLinkGrowth] = useState<string>(billingConfig.paymentLinkGrowth);
  const [linkAgency, setLinkAgency] = useState<string>(billingConfig.paymentLinkAgency);
  const [supportContact, setSupportContact] = useState<string>(billingConfig.supportContact);
  const [trialDays, setTrialDays] = useState<number>(billingConfig.trialDays ?? 7);
  const [savingBilling, setSavingBilling] = useState<boolean>(false);
  const [billingNotice, setBillingNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Filters
  const [subFilter, setSubFilter] = useState<'all' | 'active' | 'trialing' | 'paused'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  useEffect(() => {
    setUpiId(billingConfig.upiId);
    setPayeeName(billingConfig.payeeName || 'ReviewEase AI');
    setLinkStarter(billingConfig.paymentLinkStarter);
    setLinkGrowth(billingConfig.paymentLinkGrowth);
    setLinkAgency(billingConfig.paymentLinkAgency);
    setSupportContact(billingConfig.supportContact);
    setTrialDays(billingConfig.trialDays ?? 7);
  }, [billingConfig]);

  useEffect(() => {
    setLoadingData(true);
    const unsubSubs = subscribeAllPlatformSubscriptions(
      (subs) => {
        setAllSubscriptions(subs);
        setLoadingData(false);
      },
      () => setLoadingData(false)
    );
    const unsubBiz = subscribeAllPlatformBusinesses(() => {
      // Handled below
    });

    const unsubBizFull = subscribeAllPlatformBusinesses((items) => {
      setAllBusinesses(items);
    });

    unsubBiz();
    return () => {
      unsubSubs();
      unsubBizFull();
    };
  }, []);

  const kpis = useMemo(() => {
    const activePaid = allSubscriptions.filter(
      (s) => s.status === 'active' && s.planId !== 'trial' && isSubscriptionCurrentlyValid(s)
    );
    const mrrInr = activePaid.reduce((sum, s) => {
      const monthlyEq = s.billingCycle === 'annual' ? Math.round(s.priceInr / 12) : s.priceInr;
      return sum + monthlyEq;
    }, 0);
    const trialingCount = allSubscriptions.filter(
      (s) => s.status === 'trialing' && isSubscriptionCurrentlyValid(s)
    ).length;
    const activeShopsCount = allBusinesses.filter((b) => b.isActive).length;

    return {
      totalSubscribers: allSubscriptions.length,
      activePaidCount: activePaid.length,
      trialingCount,
      mrrInr,
      totalShops: allBusinesses.length,
      activeShopsCount,
    };
  }, [allSubscriptions, allBusinesses]);

  const filteredSubscriptions = useMemo(() => {
    return allSubscriptions.filter((s) => {
      if (subFilter !== 'all' && s.status !== subFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${s.accountLabel} ${s.planId} ${s.paymentReference} ${s.userId}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allSubscriptions, subFilter, searchQuery]);

  const handleSaveBillingSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setBillingNotice(null);
    setSavingBilling(true);
    try {
      await savePlatformBillingConfig({
        upiId,
        payeeName,
        paymentLinkStarter: linkStarter,
        paymentLinkGrowth: linkGrowth,
        paymentLinkAgency: linkAgency,
        supportContact,
        trialDays,
      });
      setBillingNotice({
        type: 'success',
        text: 'Founder payment settings saved. Merchant checkouts now use your live UPI QR & links.',
      });
      onBillingConfigSaved();
    } catch (err) {
      setBillingNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not save payment settings.',
      });
    } finally {
      setSavingBilling(false);
    }
  };

  const handleAdminSubAction = async (
    sub: MerchantSubscriptionRecord,
    action: 'extend30' | 'pause' | 'activate'
  ) => {
    setBusyUserId(sub.userId);
    try {
      if (action === 'extend30') {
        await adminUpdateMerchantSubscription(sub, { status: 'active', addDays: 30 });
      } else if (action === 'pause') {
        await adminUpdateMerchantSubscription(sub, { status: 'paused' });
      } else {
        await adminUpdateMerchantSubscription(sub, { status: 'active' });
      }
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <div className="space-y-7">
      {/* SaaS Revenue & Platform Overview KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-1">
          <p className="text-xs font-medium text-slate-500">Monthly Recurring Revenue</p>
          <p className="text-2xl font-bold text-slate-950 font-mono tabular-nums">
            ₹{kpis.mrrInr.toLocaleString('en-IN')}
          </p>
          <p className="text-xs text-slate-500">From {kpis.activePaidCount} active paid plans</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-1">
          <p className="text-xs font-medium text-slate-500">Merchant Accounts</p>
          <p className="text-2xl font-bold text-slate-950 font-mono tabular-nums">
            {kpis.totalSubscribers}
          </p>
          <p className="text-xs text-slate-500">{kpis.trialingCount} currently in free trial</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-1">
          <p className="text-xs font-medium text-slate-500">Live Shop QR Scanners</p>
          <p className="text-2xl font-bold text-slate-950 font-mono tabular-nums">
            {kpis.activeShopsCount} / {kpis.totalShops}
          </p>
          <p className="text-xs text-slate-500">Active customer QR pages</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-1">
          <p className="text-xs font-medium text-slate-500">Checkout Payment Mode</p>
          <p className="text-lg font-bold text-slate-950 truncate">
            {billingConfig.upiId ? billingConfig.upiId : 'Self-Serve / Trial'}
          </p>
          <p className="text-xs text-slate-500">
            Free trial: {billingConfig.trialDays} days
          </p>
        </div>
      </div>

      {/* Founder Payment Collection Settings */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7 space-y-5">
        <div className="border-b border-slate-100 pb-4">
          <h2 className="text-lg font-semibold text-slate-950">
            Founder Payment Collection Settings (Sell Monthly Subscriptions)
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Enter your UPI ID (GPay / PhonePe / Paytm Merchant VPA) or Razorpay/Stripe payment links. Every shop owner subscribing on your website will automatically see your scannable UPI QR with the exact plan price.
          </p>
        </div>

        {billingNotice && (
          <div
            role="status"
            className={`rounded-xl border px-4 py-3 text-xs sm:text-sm flex items-start gap-2 ${
              billingNotice.type === 'error'
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900'
            }`}
          >
            {billingNotice.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            ) : (
              <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            )}
            <span>{billingNotice.text}</span>
          </div>
        )}

        <form onSubmit={(e) => void handleSaveBillingSettings(e)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="admin-upi" className="block text-xs font-semibold text-slate-700">
                Your Merchant UPI ID (VPA)
              </label>
              <input
                id="admin-upi"
                type="text"
                maxLength={80}
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="e.g., yourbusiness@okaxis"
                className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="admin-payee" className="block text-xs font-semibold text-slate-700">
                Payee Brand Name *
              </label>
              <input
                id="admin-payee"
                type="text"
                required
                maxLength={80}
                value={payeeName}
                onChange={(e) => setPayeeName(e.target.value)}
                placeholder="ReviewEase AI"
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="admin-trial-days" className="block text-xs font-semibold text-slate-700">
                New Shop Free Trial Days (0–30)
              </label>
              <input
                id="admin-trial-days"
                type="number"
                min={0}
                max={30}
                value={trialDays}
                onChange={(e) => setTrialDays(Number(e.target.value))}
                className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="link-starter" className="block text-xs font-semibold text-slate-700">
                Starter Plan Payment Link (Optional)
              </label>
              <input
                id="link-starter"
                type="url"
                maxLength={300}
                value={linkStarter}
                onChange={(e) => setLinkStarter(e.target.value)}
                placeholder="https://rzp.io/l/starter-499"
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="link-growth" className="block text-xs font-semibold text-slate-700">
                Growth Plan Payment Link (Optional)
              </label>
              <input
                id="link-growth"
                type="url"
                maxLength={300}
                value={linkGrowth}
                onChange={(e) => setLinkGrowth(e.target.value)}
                placeholder="https://rzp.io/l/growth-999"
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="link-agency" className="block text-xs font-semibold text-slate-700">
                Agency Plan Payment Link (Optional)
              </label>
              <input
                id="link-agency"
                type="url"
                maxLength={300}
                value={linkAgency}
                onChange={(e) => setLinkAgency(e.target.value)}
                placeholder="https://rzp.io/l/agency-2499"
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <div className="space-y-1.5">
              <label htmlFor="admin-support" className="block text-xs font-semibold text-slate-700">
                WhatsApp / Billing Support Contact (Optional)
              </label>
              <input
                id="admin-support"
                type="text"
                maxLength={80}
                value={supportContact}
                onChange={(e) => setSupportContact(e.target.value)}
                placeholder="e.g., WhatsApp +91 98765 43210"
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div className="flex justify-start sm:justify-end">
              <button
                type="submit"
                disabled={savingBilling}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
              >
                {savingBilling ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Payment Settings</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* Subscribed Merchants Management Table */}
      <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-slate-950">
              Merchant Subscriptions &amp; Renewals
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Verify UTR references, extend monthly plans by +30 days, or pause unpaid accounts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg">
              {(['all', 'active', 'trialing', 'paused'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setSubFilter(st)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap shrink-0 ${
                    subFilter === st
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search UTR or name..."
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
          </div>
        </div>

        {loadingData ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded-lg bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filteredSubscriptions.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No merchant subscriptions match the current filter yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-5">Merchant</th>
                  <th className="py-2.5 px-3">Plan</th>
                  <th className="py-2.5 px-3">Amount</th>
                  <th className="py-2.5 px-3">Payment / UTR Ref</th>
                  <th className="py-2.5 px-3">Valid Until</th>
                  <th className="py-2.5 px-3">State</th>
                  <th className="py-2.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredSubscriptions.map((sub) => {
                  const isBusy = busyUserId === sub.userId;
                  return (
                    <tr key={sub.userId} className="hover:bg-slate-50/80">
                      <td className="py-3 px-5 font-semibold text-slate-900 whitespace-nowrap">
                        {sub.accountLabel}
                      </td>
                      <td className="py-3 px-3 text-slate-700 whitespace-nowrap">
                        {getPlanDisplayName(sub.planId)} ({sub.billingCycle})
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-slate-900 whitespace-nowrap">
                        ₹{sub.priceInr.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600 whitespace-nowrap">
                        {sub.paymentReference || '—'}
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {new Date(sub.currentPeriodEndMs).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`font-semibold capitalize ${
                            sub.status === 'active'
                              ? 'text-emerald-700'
                              : sub.status === 'trialing'
                                ? 'text-indigo-700'
                                : 'text-amber-700'
                          }`}
                        >
                          {sub.status}
                        </span>
                      </td>
                      <td className="py-3 px-5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleAdminSubAction(sub, 'extend30')}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 rounded hover:bg-indigo-100 disabled:opacity-50"
                          >
                            <Plus className="w-3 h-3" />
                            <span>30d</span>
                          </button>

                          {sub.status === 'paused' || sub.status === 'canceled' ? (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleAdminSubAction(sub, 'activate')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded hover:bg-emerald-100 disabled:opacity-50"
                            >
                              <PlayCircle className="w-3 h-3" />
                              <span>Activate</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleAdminSubAction(sub, 'pause')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-800 bg-amber-50 rounded hover:bg-amber-100 disabled:opacity-50"
                            >
                              <PauseCircle className="w-3 h-3" />
                              <span>Pause</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* All Platform Shop QR Scanners Directory */}
      <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-200">
          <h2 className="text-base sm:text-lg font-semibold text-slate-950">
            All Shop QR Scanners Across Platform ({allBusinesses.length})
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitor every active shop scanner URL and pause or resume access if needed.
          </p>
        </div>

        {allBusinesses.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No shop QR scanners have been created yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-5">Shop Name</th>
                  <th className="py-2.5 px-3">Scanner Slug</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-5 text-right">Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {allBusinesses.map((biz) => (
                  <tr key={biz.slug} className="hover:bg-slate-50/80">
                    <td className="py-3 px-5 font-semibold text-slate-900 whitespace-nowrap">
                      {biz.name}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-700 whitespace-nowrap">
                      /review/{biz.slug}
                    </td>
                    <td className="py-3 px-3 text-slate-600 whitespace-nowrap">{biz.category}</td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`font-semibold ${
                          biz.isActive ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {biz.isActive ? 'Active' : 'Paused'}
                      </span>
                    </td>
                    <td className="py-3 px-5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void setRealBusinessActiveStatus(biz.slug, !biz.isActive)}
                          className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 rounded hover:bg-slate-200/80"
                        >
                          {biz.isActive ? 'Pause QR' : 'Resume QR'}
                        </button>
                        <Link
                          to={`/review/${biz.slug}`}
                          className="inline-flex items-center gap-1 text-indigo-600 font-semibold hover:text-indigo-700"
                        >
                          <span>View</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
