import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { BusinessProfile, ReviewLanguage, SampleSessionActivity } from '../types/review';

const STORAGE_PROFILE_KEY = 'reviewease_business_profile_v1';
const STORAGE_SESSIONS_KEY = 'reviewease_local_sessions_v1';

export const DEFAULT_BUSINESS_PROFILE: BusinessProfile = {
  name: 'The Urban Cafe',
  category: 'Cafe & Restaurant',
  slug: 'urban-cafe',
  locationNote: 'Indiranagar · Sample Demo',
  googleReviewUrl: 'https://search.google.com/local/reviews?q=The+Urban+Cafe',
};

const INITIAL_SAMPLE_ACTIVITIES: SampleSessionActivity[] = [
  {
    id: 'sample-1',
    timestampLabel: '14 mins ago',
    rating: 5,
    language: 'English',
    usedOptionalPrompts: true,
    actionTaken: 'Opened Google Link',
  },
  {
    id: 'sample-2',
    timestampLabel: '42 mins ago',
    rating: 4,
    language: 'Hinglish',
    usedOptionalPrompts: true,
    actionTaken: 'Drafted & Copied',
  },
  {
    id: 'sample-3',
    timestampLabel: '2 hours ago',
    rating: 5,
    language: 'English',
    usedOptionalPrompts: false,
    actionTaken: 'Opened Google Link',
  },
  {
    id: 'sample-4',
    timestampLabel: '3 hours ago',
    rating: 3,
    language: 'Hindi',
    usedOptionalPrompts: true,
    actionTaken: 'Draft Generated',
  },
  {
    id: 'sample-5',
    timestampLabel: '5 hours ago',
    rating: 5,
    language: 'Hinglish',
    usedOptionalPrompts: true,
    actionTaken: 'Drafted & Copied',
  },
  {
    id: 'sample-6',
    timestampLabel: 'Yesterday',
    rating: 2,
    language: 'English',
    usedOptionalPrompts: true,
    actionTaken: 'Drafted & Copied',
  },
];

interface BusinessContextValue {
  profile: BusinessProfile;
  updateProfile: (updates: Partial<BusinessProfile>) => void;
  resetProfile: () => void;
  activities: SampleSessionActivity[];
  recordLocalDraftSession: (params: {
    rating: number;
    language: ReviewLanguage;
    usedOptionalPrompts: boolean;
    actionTaken: SampleSessionActivity['actionTaken'];
  }) => void;
  clearLocalSessions: () => void;
  liveAiConfigured: boolean;
  activeAiProvider: 'gemini' | 'openrouter' | 'fallback';
  serverAppUrl: string | null;
}

const BusinessContext = createContext<BusinessContextValue | null>(null);

export function sanitizeSlug(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || 'urban-cafe';
}

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<BusinessProfile>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PROFILE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<BusinessProfile>;
        return {
          ...DEFAULT_BUSINESS_PROFILE,
          ...parsed,
          slug: sanitizeSlug(parsed.slug ?? DEFAULT_BUSINESS_PROFILE.slug),
        };
      }
    } catch {
      // Ignore storage access errors
    }
    return DEFAULT_BUSINESS_PROFILE;
  });

  const [localSessions, setLocalSessions] = useState<SampleSessionActivity[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_SESSIONS_KEY);
      if (saved) {
        return JSON.parse(saved) as SampleSessionActivity[];
      }
    } catch {
      // Ignore
    }
    return [];
  });

  const [liveAiConfigured, setLiveAiConfigured] = useState<boolean>(true);
  const [activeAiProvider, setActiveAiProvider] = useState<'gemini' | 'openrouter' | 'fallback'>(
    'gemini'
  );
  const [serverAppUrl, setServerAppUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/config/status')
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            liveAiConfigured?: boolean;
            activeProvider?: 'gemini' | 'openrouter' | 'fallback';
            appUrl?: string | null;
          } | null
        ) => {
          if (active && data) {
            setLiveAiConfigured(Boolean(data.liveAiConfigured));
            if (data.activeProvider) {
              setActiveAiProvider(data.activeProvider);
            }
            setServerAppUrl(data.appUrl ?? null);
          }
        }
      )
      .catch(() => {
        // Offline fallback
      });
    return () => {
      active = false;
    };
  }, []);

  const updateProfile = (updates: Partial<BusinessProfile>) => {
    setProfile((prev) => {
      const next: BusinessProfile = {
        ...prev,
        ...updates,
        slug: updates.slug !== undefined ? sanitizeSlug(updates.slug) : prev.slug,
      };
      try {
        localStorage.setItem(STORAGE_PROFILE_KEY, JSON.stringify(next));
      } catch {
        // Ignore
      }
      return next;
    });
  };

  const resetProfile = () => {
    setProfile(DEFAULT_BUSINESS_PROFILE);
    try {
      localStorage.removeItem(STORAGE_PROFILE_KEY);
    } catch {
      // Ignore
    }
  };

  const recordLocalDraftSession: BusinessContextValue['recordLocalDraftSession'] = ({
    rating,
    language,
    usedOptionalPrompts,
    actionTaken,
  }) => {
    const newEntry: SampleSessionActivity = {
      id: `live-${Date.now()}`,
      timestampLabel: 'Just now (Your test)',
      rating,
      language,
      usedOptionalPrompts,
      actionTaken,
      isLiveLocalSession: true,
    };

    setLocalSessions((prev) => {
      const updated = [newEntry, ...prev.slice(0, 14)];
      try {
        localStorage.setItem(STORAGE_SESSIONS_KEY, JSON.stringify(updated));
      } catch {
        // Ignore
      }
      return updated;
    });
  };

  const clearLocalSessions = () => {
    setLocalSessions([]);
    try {
      localStorage.removeItem(STORAGE_SESSIONS_KEY);
    } catch {
      // Ignore
    }
  };

  const activities = useMemo(
    () => [...localSessions, ...INITIAL_SAMPLE_ACTIVITIES],
    [localSessions]
  );

  return (
    <BusinessContext.Provider
      value={{
        profile,
        updateProfile,
        resetProfile,
        activities,
        recordLocalDraftSession,
        clearLocalSessions,
        liveAiConfigured,
        activeAiProvider,
        serverAppUrl,
      }}
    >
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  const ctx = useContext(BusinessContext);
  if (!ctx) {
    throw new Error('useBusiness must be used inside BusinessProvider');
  }
  return ctx;
}
