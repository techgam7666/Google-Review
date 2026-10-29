/**
 * Firestore Security Rules Specification Tests ("Dirty Dozen" Verification Suite)
 * Validates all 12 adversarial payloads defined in security_spec.md against firestore.rules.
 * Run against Firebase Local Emulator with @firebase/rules-unit-testing when emulator is active.
 */

export interface DirtyDozenScenario {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_SCENARIOS: DirtyDozenScenario[] = [
  {
    id: 1,
    name: 'Identity Spoofing on Business Create',
    collectionPath: '/businesses/urban-cafe',
    operation: 'create',
    auth: { uid: 'uid_attacker', email_verified: true },
    payload: {
      name: 'The Urban Cafe',
      category: 'Cafe & Restaurant',
      slug: 'urban-cafe',
      locationLabel: 'Indiranagar',
      googleReviewUrl: 'https://search.google.com/local/reviews?q=Urban+Cafe',
      ownerId: 'uid_victim',
      isActive: true,
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Write',
    collectionPath: '/businesses/my-cafe',
    operation: 'create',
    auth: { uid: 'uid_unverified', email_verified: false },
    payload: {
      name: 'My Cafe',
      category: 'Cafe',
      slug: 'my-cafe',
      locationLabel: '',
      googleReviewUrl: 'https://search.google.com/local/reviews?q=My+Cafe',
      ownerId: 'uid_unverified',
      isActive: true,
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow Field Injection on Create',
    collectionPath: '/businesses/my-cafe',
    operation: 'create',
    auth: { uid: 'uid_owner', email_verified: true },
    payload: {
      name: 'My Cafe',
      category: 'Cafe',
      slug: 'my-cafe',
      locationLabel: '',
      googleReviewUrl: 'https://search.google.com/local/reviews?q=My+Cafe',
      ownerId: 'uid_owner',
      isActive: true,
      isVerifiedMerchant: true,
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Slug Mismatch Poisoning',
    collectionPath: '/businesses/cafe-alpha',
    operation: 'create',
    auth: { uid: 'uid_owner', email_verified: true },
    payload: {
      name: 'Cafe Alpha',
      category: 'Cafe',
      slug: 'cafe-beta',
      locationLabel: '',
      googleReviewUrl: 'https://search.google.com/local/reviews?q=Cafe+Alpha',
      ownerId: 'uid_owner',
      isActive: true,
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Owner Takeover via Update',
    collectionPath: '/businesses/cafe-alpha',
    operation: 'update',
    auth: { uid: 'uid_owner', email_verified: true },
    payload: {
      ownerId: 'uid_new_owner',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Value Poisoning on Update (javascript: URI)',
    collectionPath: '/businesses/cafe-alpha',
    operation: 'update',
    auth: { uid: 'uid_owner', email_verified: true },
    payload: {
      googleReviewUrl: 'javascript:alert(1)',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Unauthorized Directory Scraping (Unfiltered List)',
    collectionPath: '/businesses',
    operation: 'list',
    auth: { uid: 'uid_attacker', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Inactive Business Public Read',
    collectionPath: '/businesses/paused-cafe',
    operation: 'get',
    auth: null,
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Orphaned Session Telemetry Write',
    collectionPath: '/businesses/nonexistent-cafe/sessions/sess_12345678',
    operation: 'create',
    auth: null,
    payload: {
      businessSlug: 'nonexistent-cafe',
      businessOwnerId: 'uid_any',
      visitId: 'visit_12345678',
      rating: 5,
      language: 'English',
      usedOptionalPrompts: true,
      stage: 'draft_generated',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Spoofed Session businessOwnerId',
    collectionPath: '/businesses/cafe-alpha/sessions/sess_12345678',
    operation: 'create',
    auth: null,
    payload: {
      businessSlug: 'cafe-alpha',
      businessOwnerId: 'uid_attacker',
      visitId: 'visit_12345678',
      rating: 5,
      language: 'English',
      usedOptionalPrompts: false,
      stage: 'draft_generated',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Session Mutation / Tampering',
    collectionPath: '/businesses/cafe-alpha/sessions/sess_12345678',
    operation: 'update',
    auth: { uid: 'uid_owner', email_verified: true },
    payload: {
      rating: 5,
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Client Timestamp Forgery',
    collectionPath: '/businesses/cafe-alpha/sessions/sess_99999999',
    operation: 'create',
    auth: null,
    payload: {
      businessSlug: 'cafe-alpha',
      businessOwnerId: 'uid_owner',
      visitId: 'visit_12345678',
      rating: 4,
      language: 'Hinglish',
      usedOptionalPrompts: true,
      stage: 'copied_review',
      createdAt: '2020-01-01T00:00:00Z',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
];
