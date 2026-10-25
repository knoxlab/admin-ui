import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi } from '../api';
import type { MeProfile } from '../api/types';
import { clearCredentials } from '../api/client';
import { t } from '../i18n/locale';

interface AuthState {
  username: string | null;
  me: MeProfile | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);
  const [me, setMe] = useState<MeProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    try {
      setMe(await authApi.profile());
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    clearCredentials();
    authApi
      .me()
      .then(async (session) => {
        if (session.authenticated && session.username) {
          setUsername(session.username);
          await loadProfile();
        }
      })
      .catch(() => {
        setUsername(null);
        setMe(null);
      })
      .finally(() => setLoading(false));
  }, [loadProfile]);

  const login = useCallback(async (user: string, password: string) => {
    const session = await authApi.login(user, password);
    if (!session.authenticated) {
      throw new Error(t('用户名或密码错误'));
    }
    setUsername(session.username ?? user);
    await loadProfile();
  }, [loadProfile]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* session may already be gone */
    }
    clearCredentials();
    setUsername(null);
    setMe(null);
  }, []);

  const value = useMemo(
    () => ({ username, me, loading, login, logout, refreshProfile: loadProfile }),
    [username, me, loading, login, logout, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function isSystemAdmin(me: MeProfile | null | undefined) {
  return !!me?.organizationRoles?.includes('system-admin');
}

export function hasCapability(me: MeProfile | null | undefined, siteId: string | null | undefined, capability: string) {
  if (!me) return false;
  if (isSystemAdmin(me)) return true;
  if (!siteId) return false;
  return me.sites.some((site) => site.siteId === siteId && site.capabilities.includes(capability));
}
