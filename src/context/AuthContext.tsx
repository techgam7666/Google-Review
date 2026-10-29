import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

const BOOTSTRAPPED_ADMIN_EMAIL = 'techgam766@gmail.com';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
}

interface AuthContextValue {
  user: AppUser | null;
  authReady: boolean;
  isSigningIn: boolean;
  authError: string | null;
  authNotice: string | null;
  isPlatformAdmin: boolean;
  signInWithEmail: (email: string, password: string) => Promise<boolean>;
  signUpWithEmail: (params: {
    fullName: string;
    email: string;
    password: string;
  }) => Promise<boolean>;
  signInWithGoogle: () => Promise<boolean>;
  signOutUser: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function mapSupabaseUser(sbUser: SupabaseUser | null): AppUser | null {
  if (!sbUser) return null;
  const meta = (sbUser.user_metadata ?? {}) as Record<string, unknown>;
  const fullName =
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta.name === 'string' && meta.name.trim()) ||
    null;

  return {
    uid: sbUser.id,
    email: sbUser.email ?? null,
    displayName: fullName,
    emailVerified: true,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setUser(mapSupabaseUser(data.session?.user ?? null));
        setAuthReady(true);
      })
      .catch(() => {
        if (mounted) setAuthReady(true);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const mapped = mapSupabaseUser(session?.user ?? null);
      setUser(mapped);
      if (mapped) {
        setAuthError(null);
        setAuthNotice(null);
      }
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithEmail = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      setAuthError(null);
      setAuthNotice(null);
      setIsSigningIn(true);

      try {
        const cleanEmail = email.trim().toLowerCase();
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (error) {
          if (error.message.toLowerCase().includes('email not confirmed')) {
            setAuthError(
              `Please click the confirmation link sent to ${cleanEmail} (or disable "Confirm email" under Supabase Dashboard → Authentication → Providers → Email).`
            );
          } else {
            setAuthError(error.message);
          }
          return false;
        }
        return true;
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Unable to sign in right now.');
        return false;
      } finally {
        setIsSigningIn(false);
      }
    },
    []
  );

  const signUpWithEmail = useCallback(
    async (params: {
      fullName: string;
      email: string;
      password: string;
    }): Promise<boolean> => {
      setAuthError(null);
      setAuthNotice(null);
      setIsSigningIn(true);

      const cleanEmail = params.email.trim().toLowerCase();
      const cleanName = params.fullName.trim();

      if (params.password.length < 6) {
        setAuthError('Password must be at least 6 characters.');
        setIsSigningIn(false);
        return false;
      }

      try {
        // 1. Try server-assisted instant signup when backend is running (auto-confirms email)
        try {
          const res = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: cleanEmail,
              password: params.password,
              fullName: cleanName,
            }),
          });
          const contentType = res.headers.get('content-type') ?? '';
          if (res.ok && contentType.includes('application/json')) {
            const payload = (await res.json()) as { created?: boolean };
            if (payload.created) {
              const { error: loginErr } = await supabase.auth.signInWithPassword({
                email: cleanEmail,
                password: params.password,
              });
              if (!loginErr) {
                return true;
              }
            }
          }
        } catch {
          // Static host (e.g. Netlify) — fall through to direct Supabase browser signUp
        }

        // 2. Direct browser Supabase signUp (works on Netlify, Vercel, custom domains)
        const redirectTo =
          typeof window !== 'undefined'
            ? `${window.location.origin}/dashboard`
            : undefined;

        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password: params.password,
          options: {
            emailRedirectTo: redirectTo,
            data: {
              full_name: cleanName || cleanEmail.split('@')[0],
            },
          },
        });

        if (error) {
          setAuthError(error.message);
          return false;
        }

        if (data.session) {
          return true;
        }

        // Email confirmation is turned on in Supabase project settings
        setAuthNotice(
          `Account created! We sent a verification link to ${cleanEmail}. Click that link in your email to finish signing in (tip: you can also turn off "Confirm email" in Supabase → Authentication → Sign In / Providers → Email for instant login).`
        );
        return true;
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Unable to create account.');
        return false;
      } finally {
        setIsSigningIn(false);
      }
    },
    []
  );

  const signInWithGoogle = useCallback(async (): Promise<boolean> => {
    setAuthError(null);
    setAuthNotice(null);
    setIsSigningIn(true);

    try {
      const redirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}/dashboard`
          : undefined;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
        },
      });

      if (error) {
        if (error.message.toLowerCase().includes('provider is not enabled')) {
          setAuthError(
            'Google OAuth is not enabled yet in your Supabase project. Sign in with Email & Password above right now, or enable Google under Supabase Dashboard → Authentication → Sign In / Providers.'
          );
        } else {
          setAuthError(error.message);
        }
        return false;
      }
      return true;
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Unable to start Google Sign-In.'
      );
      return false;
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  const signOutUser = async (): Promise<void> => {
    setAuthError(null);
    setAuthNotice(null);
    await supabase.auth.signOut();
  };

  const clearAuthError = () => {
    setAuthError(null);
    setAuthNotice(null);
  };

  const isPlatformAdmin = Boolean(
    user && user.email && user.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        isSigningIn,
        authError,
        authNotice,
        isPlatformAdmin,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        signOutUser,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
