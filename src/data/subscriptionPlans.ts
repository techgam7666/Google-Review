import type {
  BillingCycle,
  MerchantSubscriptionRecord,
  PaidPlanId,
  SubscriptionPlanCatalogItem,
  SubscriptionPlanId,
} from '../types/review';

export const SUBSCRIPTION_PLANS: SubscriptionPlanCatalogItem[] = [
  {
    id: 'starter',
    name: 'Starter Shop',
    audience: 'For single local shops, clinics & cafes',
    monthlyPriceInr: 499,
    annualMonthlyEquivalentInr: 399,
    annualTotalInr: 4788,
    maxBusinesses: 1,
    highlights: [
      '1 dedicated shop QR scanner & custom URL slug',
      'Works with any Google Maps or Google Business link',
      'Unlimited AI customer review drafts (English, हिन्दी & Hinglish)',
      'Print-ready shop counter standee poster (PNG & Vector SVG)',
      'Live anonymous customer scan & copy analytics',
    ],
  },
  {
    id: 'growth',
    name: 'Growth Multi-Outlet',
    audience: 'For busy restaurants, salons & multi-branch businesses',
    monthlyPriceInr: 999,
    annualMonthlyEquivalentInr: 799,
    annualTotalInr: 9588,
    maxBusinesses: 5,
    popular: true,
    highlights: [
      'Up to 5 shop QR scanners & branch-specific URLs',
      '3 counter standee print themes (Classic, Navy, Gold)',
      'Unlimited AI review drafting across all 5 outlets',
      'Branch-by-branch rating & language breakdown',
      'Priority live AI generation & instant Google Maps link builder',
    ],
  },
  {
    id: 'agency',
    name: 'Chain & Agency',
    audience: 'For franchises, hospital groups & local marketing agencies',
    monthlyPriceInr: 2499,
    annualMonthlyEquivalentInr: 1999,
    annualTotalInr: 23988,
    maxBusinesses: 25,
    highlights: [
      'Up to 25 shop QR scanners managed under one account',
      'Centralized multi-location QR & Google Maps URL control',
      'Unlimited AI review drafts in English, Hindi & Hinglish',
      'Bulk counter standee poster & vector SVG exports',
      'Real-time customer conversion funnel tracking',
    ],
  },
];

export function getPlanCatalogItem(planId: PaidPlanId): SubscriptionPlanCatalogItem {
  return SUBSCRIPTION_PLANS.find((p) => p.id === planId) ?? SUBSCRIPTION_PLANS[0];
}

export function getMaxBusinessesForPlan(planId: SubscriptionPlanId): number {
  switch (planId) {
    case 'agency':
      return 25;
    case 'growth':
      return 5;
    case 'starter':
    case 'trial':
    default:
      return 1;
  }
}

export function getPlanDisplayName(planId: SubscriptionPlanId): string {
  switch (planId) {
    case 'trial':
      return 'Free Trial (1 Shop)';
    case 'starter':
      return 'Starter Shop';
    case 'growth':
      return 'Growth Multi-Outlet';
    case 'agency':
      return 'Chain & Agency';
  }
}

export function getPlanPriceInr(planId: PaidPlanId, cycle: BillingCycle): number {
  const item = getPlanCatalogItem(planId);
  return cycle === 'annual' ? item.annualTotalInr : item.monthlyPriceInr;
}

export function isSubscriptionCurrentlyValid(
  sub: MerchantSubscriptionRecord | null,
  nowMs: number = Date.now()
): boolean {
  if (!sub) return false;
  if (sub.status !== 'active' && sub.status !== 'trialing') return false;
  return sub.currentPeriodEndMs > nowMs;
}

export function buildUpiPaymentUri(params: {
  upiId: string;
  payeeName: string;
  amountInr: number;
  note: string;
}): string {
  const cleanUpi = params.upiId.trim();
  if (!cleanUpi) return '';
  const query = new URLSearchParams({
    pa: cleanUpi,
    pn: params.payeeName.trim() || 'ReviewEase AI',
    am: String(params.amountInr),
    cu: 'INR',
    tn: params.note.slice(0, 50),
  });
  return `upi://pay?${query.toString()}`;
}
