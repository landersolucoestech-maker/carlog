'use client';

import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { modules } from '../platform/module-registry';

export type CurrentUser = {
  id: string;
  email: string;
  displayName: string;
  active: boolean;
  roles: string[];
  permissions: string[];
};

type AuthState = {
  session: Session | null;
  user: CurrentUser | null;
  loading: boolean;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  refreshUser(): Promise<void>;
};

const previewMode = process.env.NEXT_PUBLIC_PREVIEW_MODE === '1';
const previewUser: CurrentUser = {
  id: 'github-pages-preview',
  email: 'preview@carlogconnection.com',
  displayName: 'Car Log Preview',
  active: true,
  roles: ['preview'],
  permissions: [...new Set(modules.map(module => module.permission))],
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(previewMode ? previewUser : null);
  const [loading, setLoading] = useState(!previewMode);

  async function refreshUser() {
    if (previewMode) {
      setUser(previewUser);
      return;
    }
    const profile = await apiRequest<CurrentUser>('/v1/me');
    setUser(profile);
  }

  useEffect(() => {
    if (previewMode) {
      setUser(previewUser);
      setLoading(false);
      return;
    }

    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      if (data.session) {
        try { await refreshUser(); } catch { if (alive) setUser(null); }
      }
      if (alive) setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) setUser(null);
      queueMicrotask(async () => {
        if (next) { try { await refreshUser(); } catch { setUser(null); } }
        setLoading(false);
      });
    });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);

  const value = useMemo<AuthState>(() => ({
    session, user, loading,
    async signIn(email, password) {
      if (previewMode) throw new Error('GitHub Pages preview is read-only');
      setLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setLoading(false); throw error; }
      setSession(data.session);
      await refreshUser();
      setLoading(false);
    },
    async signOut() {
      if (previewMode) return;
      await supabase.auth.signOut();
      setSession(null);
      setUser(null);
    },
    refreshUser,
  }), [session, user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
