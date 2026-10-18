import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getStoredUser, clearAuthSession } from '../identity';
import {
  fetchCurrentUser,
  loginWithEmail,
  registerWithEmail,
  loginWithGoogleToken,
  logoutUser,
} from '../api';

export interface UserProfile {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  role: 'USER' | 'ADMIN';
  subscriptionTier: 'FREE' | 'STANDARD' | 'PREMIUM';
  referralCode: string;
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

interface AuthContextType {
  user: UserProfile | null;
  dailyTestStatus: DailyTestStatus | null;
  isLoading: boolean;
  login: (params: { email: string; password: string }) => Promise<void>;
  register: (params: { email: string; password: string; name?: string; referralCode?: string }) => Promise<void>;
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

  const handleLogin = async (params: { email: string; password: string }) => {
    setIsLoading(true);
    try {
      const res = await loginWithEmail(params);
      setUser(res.user);
      await refreshProfile();
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (params: {
    email: string;
    password: string;
    name?: string;
    referralCode?: string;
  }) => {
    setIsLoading(true);
    try {
      const res = await registerWithEmail(params);
      setUser(res.user);
      await refreshProfile();
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async (idToken: string, referralCode?: string) => {
    setIsLoading(true);
    try {
      const res = await loginWithGoogleToken(idToken, referralCode);
      setUser(res.user);
      await refreshProfile();
    } finally {
      setIsLoading(false);
    }
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
