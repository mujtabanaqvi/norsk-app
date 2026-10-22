import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppState, Platform } from 'react-native';
import { getStoredUser, clearAuthSession } from '../identity';
import {
  fetchCurrentUser,
  loginWithEmail,
  registerWithEmail,
  loginWithGoogleToken,
  verifyEmailCode,
  logoutUser,
  type RegisterResult,
} from '../api';

export interface UserProfile {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  role: 'USER' | 'ADMIN';
  subscriptionTier: 'FREE' | 'STANDARD' | 'PREMIUM';
  referralCode: string;
  /** Sent to the App Store / Play as appAccountToken / obfuscatedAccountId. */
  /** Which payment provider the current paid tier comes from, if any. */
  activeSubscriptionProvider?: 'STRIPE' | 'APPLE' | 'GOOGLE' | null;
}

export interface DailyTestStatus {
  tier: 'FREE' | 'STANDARD' | 'PREMIUM';
  baseLimit: number;
  bonusTests: number;
  activeRewardsCount: number;
  totalAllowedToday: number;
  testsUsedToday: number;
  remainingToday: number;
  canStartTest: boolean;
  resetsAt: string;
}

export interface RegisterParams {
  email: string;
  password: string;
  confirmPassword: string;
  name: string;
  referralCode?: string;
}

interface AuthContextType {
  user: UserProfile | null;
  dailyTestStatus: DailyTestStatus | null;
  isLoading: boolean;
  login: (params: { email: string; password: string }) => Promise<void>;
  register: (params: RegisterParams) => Promise<RegisterResult>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  loginWithGoogle: (idToken: string, referralCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [dailyTestStatus, setDailyTestStatus] = useState<DailyTestStatus | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshProfile = useCallback(async () => {
    try {
      const data = await fetchCurrentUser();
      if (data && data.user) {
        setUser(data.user);
        setDailyTestStatus(data.testQuota);
      } else {
        setUser(null);
        setDailyTestStatus(null);
      }
    } catch {
      setUser(null);
      setDailyTestStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  // A subscription bought on the web (the only way to subscribe on Android) reaches the app
  // through the server, so re-read the profile whenever the app returns to the foreground.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshProfile();
    });
    return () => subscription.remove();
  }, [refreshProfile]);

  // Note: these deliberately don't toggle the global `isLoading` — that flag swaps the whole
  // navigator for a splash screen, which would unmount the auth form and lose its error state.
  const handleLogin = async (params: { email: string; password: string }) => {
    const res = await loginWithEmail(params);
    setUser(res.user);
    await refreshProfile();
  };

  const handleRegister = (params: RegisterParams) => registerWithEmail(params);

  const handleVerifyEmail = async (email: string, code: string) => {
    const res = await verifyEmailCode(email, code);
    setUser(res.user);
    await refreshProfile();
  };

  const handleGoogleLogin = async (idToken: string, referralCode?: string) => {
    const res = await loginWithGoogleToken(idToken, referralCode);
    setUser(res.user);
    await refreshProfile();
  };

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      await logoutUser();
      setUser(null);
      setDailyTestStatus(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        dailyTestStatus,
        isLoading,
        login: handleLogin,
        register: handleRegister,
        verifyEmail: handleVerifyEmail,
        loginWithGoogle: handleGoogleLogin,
        logout: handleLogout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
