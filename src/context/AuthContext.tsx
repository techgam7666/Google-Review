import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { auth, googleProvider } from '../lib/firebase';

const BOOTSTRAPPED_ADMIN_EMAIL = 'techgam766@gmail.com';

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  isSigningIn: boolean;
  authError: string | null;
  isUnauthorizedDomainError: boolean;
  currentHostname: string;
  firebaseConsoleAuthSettingsUrl: string;
  isPlatformAdmin: boolean;
  signInWithGoogle: () => Promise<boolean>;
  signOutUser: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isUnauthorizedDomainError, setIsUnauthorizedDomainError] = useState<boolean>(false);

  const currentHostname =
    typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const firebaseConsoleAuthSettingsUrl = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        setUser(firebaseUser);
        setAuthReady(true);
      },
      (err) => {
        console.error('Firebase Auth listener error:', err);
        setAuthReady(true);
      }
    );

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async (): Promise<boolean> => {
    setAuthError(null);
    setIsUnauthorizedDomainError(false);
    setIsSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
      return true;
    } catch (error) {
      const code = (error as { code?: string })?.code ?? '';
      const rawMessage = error instanceof Error ? error.message : String(error);

      if (code === 'auth/popup-closed-by-user') {
        setAuthError('Sign-in popup was closed before completing login.');
      } else if (code === 'auth/popup-blocked') {
        setAuthError(
          'Your browser blocked the Google sign-in popup. Please allow popups for this site and try again.'
        );
      } else if (
        code === 'auth/unauthorized-domain' ||
        rawMessage.includes('auth/unauthorized-domain')
      ) {
        setIsUnauthorizedDomainError(true);
        setAuthError(
          `Your custom domain "${currentHostname}" needs to be added to Firebase Authorized Domains before Google Sign-In can open.`
        );
      } else {
        setAuthError(rawMessage || 'Unable to complete Google sign-in right now.');
      }
      return false;
    } finally {
      setIsSigningIn(false);
    }
  };

  const signOutUser = async (): Promise<void> => {
    setAuthError(null);
    setIsUnauthorizedDomainError(false);
    await signOut(auth);
  };

  const clearAuthError = () => {
    setAuthError(null);
    setIsUnauthorizedDomainError(false);
  };

  const isPlatformAdmin = Boolean(
    user &&
      user.emailVerified &&
      user.email &&
      user.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        isSigningIn,
        authError,
        isUnauthorizedDomainError,
        currentHostname,
        firebaseConsoleAuthSettingsUrl,
        isPlatformAdmin,
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
