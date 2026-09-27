import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import { api, getAuthToken, setAuthToken, getSessionExpiry, isSessionExpired } from '../lib/api';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  sessionExpiresAt: number | null;
  sessionRemainingHours: number | null;
  login: (token: string, user: User, expiresAt?: string | number) => void;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(getAuthToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(getSessionExpiry());

  const logout = useCallback(async () => {
    try {
      if (token) {
        await api.post('/api/auth/logout');
      }
    } catch (_) {
      // Ignore network errors on logout
    } finally {
      setUser(null);
      setToken(null);
      setSessionExpiresAt(null);
      setAuthToken(null);
    }
  }, [token]);

  const refreshUser = useCallback(async () => {
    // Check 2-day expiration
    if (isSessionExpired()) {
      setUser(null);
      setToken(null);
      setSessionExpiresAt(null);
      setAuthToken(null);
      setIsLoading(false);
      return;
    }

    const currentToken = getAuthToken();
    if (!currentToken) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const res = await api.get<{ user: User }>('/api/auth/me');
      setUser(res.user);
      setSessionExpiresAt(getSessionExpiry());
    } catch (err: any) {
      if (err.status === 401 || err.status === 403) {
        setToken(null);
        setAuthToken(null);
        setSessionExpiresAt(null);
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Periodic check for 2-day session expiration
  useEffect(() => {
    refreshUser();

    // Check expiration every 60 seconds
    const interval = setInterval(() => {
      if (isSessionExpired()) {
        logout();
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [refreshUser, logout]);

  const login = (newToken: string, loggedInUser: User, expiresAt?: string | number) => {
    setAuthToken(newToken, expiresAt);
    setToken(newToken);
    setUser(loggedInUser);
    setSessionExpiresAt(getSessionExpiry());
  };

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
  };

  const sessionRemainingHours = sessionExpiresAt
    ? Math.max(0, Math.round((sessionExpiresAt - Date.now()) / (1000 * 60 * 60) * 10) / 10)
    : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        sessionExpiresAt,
        sessionRemainingHours,
        login,
        logout,
        updateUser,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
};
