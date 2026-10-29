export type ReviewLanguage = 'English' | 'Hindi' | 'Hinglish';

export type SentimentBucket = 'positive' | 'neutral' | 'negative';

export type SessionStage = 'draft_generated' | 'copied_review' | 'opened_google';

export interface BusinessProfile {
  name: string;
  category: string;
  slug: string;
  locationNote: string;
  googleReviewUrl: string;
}

export interface RealBusinessRecord {
  name: string;
  category: string;
  slug: string;
  locationLabel: string;
  googleReviewUrl: string;
  ownerId: string;
  isActive: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface RealSessionEventRecord {
  id: string;
  businessSlug: string;
  businessOwnerId: string;
  visitId: string;
  rating: number;
  language: ReviewLanguage;
  usedOptionalPrompts: boolean;
  stage: SessionStage;
  createdAtMs: number;
}

export interface ReviewGenerationInput {
  businessName: string;
  category: string;
  locationLabel?: string;
  rating: number;
  language: ReviewLanguage;
  primaryAnswer: string;
  secondaryAnswer: string;
  variationIndex: number;
}

export interface ReviewGenerationResult {
  review: string;
  source: 'gemini' | 'openrouter' | 'mock';
}

export interface SampleSessionActivity {
  id: string;
  timestampLabel: string;
  rating: number;
  language: ReviewLanguage;
  usedOptionalPrompts: boolean;
  actionTaken: 'Drafted & Copied' | 'Opened Google Link' | 'Draft Generated';
  isLiveLocalSession?: boolean;
}
