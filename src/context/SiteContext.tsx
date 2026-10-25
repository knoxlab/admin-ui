import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { sitesApi } from '../api';
import type { Site } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { t } from '../i18n/locale';

const SITE_KEY = 'powercms.siteId';

interface SiteState {
  sites: Site[];
  siteId: string | null;
  site: Site | null;
  loading: boolean;
  setSiteId: (id: string | null) => void;
  refresh: () => Promise<void>;
}

const SiteContext = createContext<SiteState | null>(null);

export function SiteProvider({ children }: { children: ReactNode }) {
  const { username } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteIdState] = useState<string | null>(() => localStorage.getItem(SITE_KEY));
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!username) {
      setSites([]);
      return;
    }
    setLoading(true);
    try {
      const list = await sitesApi.list();
      setSites(list);
      // H2 内存库重启后站点 ID 会失效；清理本地缓存中的幽灵站点，避免外键 500
      if (siteId && !list.some((s) => s.id === siteId)) {
        if (list.length) {
          const next = list[0].id;
          localStorage.setItem(SITE_KEY, next);
          setSiteIdState(next);
        } else {
          localStorage.removeItem(SITE_KEY);
          setSiteIdState(null);
        }
      } else if (!siteId && list.length) {
        const next = list[0].id;
        localStorage.setItem(SITE_KEY, next);
        setSiteIdState(next);
      }
    } catch {
      setSites([]);
    } finally {
      setLoading(false);
    }
  }, [username, siteId]);

  useEffect(() => {
    void refresh();
  }, [username]); // eslint-disable-line react-hooks/exhaustive-deps

  const setSiteId = useCallback((id: string | null) => {
    if (id) localStorage.setItem(SITE_KEY, id);
    else localStorage.removeItem(SITE_KEY);
    setSiteIdState(id);
  }, []);

  const site = useMemo(() => sites.find((s) => s.id === siteId) ?? null, [sites, siteId]);

  const value = useMemo(
    () => ({ sites, siteId, site, loading, setSiteId, refresh }),
    [sites, siteId, site, loading, setSiteId, refresh],
  );

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSite() {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error('useSite must be used within SiteProvider');
  return ctx;
}

export function RequireSite({ children }: { children: ReactNode }) {
  const { site, loading } = useSite();
  if (loading) return null;
  if (!site) {
    return (
      <div style={{ padding: 24 }}>
        
        {t('请先在「站点与环境」中创建或选择一个站点。')}
      </div>
    );
  }
  return <>{children}</>;
}
