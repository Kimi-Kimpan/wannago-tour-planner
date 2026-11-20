import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { getProfile } from '../lib/api';
import type { Profile } from '../lib/types';

type Aal = 'aal1' | 'aal2' | null;

interface AuthState {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  aal: Aal;
  nextAal: Aal;
  isAdmin: boolean; // 역할이 관리자
  financeAccess: boolean; // 관리자 + 2단계 인증 완료 → 매출·마진 보기
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [aal, setAal] = useState<Aal>(null);
  const [nextAal, setNextAal] = useState<Aal>(null);

  const load = useCallback(async (s: Session | null) => {
    setSession(s);
    if (!s) {
      setProfile(null);
      setAal(null);
      setNextAal(null);
      return;
    }
    const [p, a] = await Promise.all([
      getProfile(s.user.id).catch(() => null),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    setProfile(p);
    setAal((a.data?.currentLevel as Aal) ?? null);
    setNextAal((a.data?.nextLevel as Aal) ?? null);
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      await load(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'INITIAL_SESSION') return;
      // onAuthStateChange 안에서 바로 await 하지 않음 (supabase-js 권장)
      setTimeout(() => void load(s), 0);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [load]);

  const value = useMemo<AuthState>(() => {
    const isAdmin = profile?.role === 'admin';
    return {
      ready,
      session,
      profile,
      aal,
      nextAal,
      isAdmin,
      financeAccess: isAdmin && aal === 'aal2',
      refresh: async () => {
        const { data } = await supabase.auth.getSession();
        await load(data.session);
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    };
  }, [ready, session, profile, aal, nextAal, load]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider 밖에서 useAuth를 썼어요');
  return v;
}
