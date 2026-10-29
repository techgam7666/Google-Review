import { createClient } from '@supabase/supabase-js';

const env =
  (typeof import.meta !== 'undefined' && import.meta.env) ||
  ({} as Record<string, string | undefined>);

export const SUPABASE_URL =
  env.VITE_SUPABASE_URL?.trim() || 'https://qfftaewsktgvwuqoomsn.supabase.co';

// Public publishable key (safe for browser usage; all data access is governed by Postgres RLS)
export const SUPABASE_PUBLISHABLE_KEY =
  env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  'sb_publishable_k1c1nN3jaOqVGhnxqoHIVg_r8qsOnBw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export function isMissingSupabaseTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = String((error as { code?: unknown }).code ?? '');
  const message = String((error as { message?: unknown }).message ?? '').toLowerCase();
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    message.includes('could not find the table') ||
    (message.includes('relation') && message.includes('does not exist'))
  );
}
