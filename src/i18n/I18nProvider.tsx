import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ConfigProvider } from 'antd';
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_CHANGED_EVENT,
  getAntdLocale,
  initialLanguage,
  translate,
  type TranslateFn,
} from './locale';

type I18nContextValue = { language: string; t: TranslateFn };

const I18nContext = createContext<I18nContextValue>({
  language: DEFAULT_LANGUAGE,
  t: (zh, vars) => translate(DEFAULT_LANGUAGE, zh, vars),
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState(initialLanguage);
  useEffect(() => {
    const sync = (e: Event) => setLanguage((e as CustomEvent<string>).detail);
    window.addEventListener(LANGUAGE_CHANGED_EVENT, sync);
    return () => window.removeEventListener(LANGUAGE_CHANGED_EVENT, sync);
  }, []);
  const tFn = useCallback<TranslateFn>(
    (zh, vars) => translate(language, zh, vars),
    [language],
  );
  return (
    <I18nContext.Provider value={{ language, t: tFn }}>
      <ConfigProvider locale={getAntdLocale(language)}>{children}</ConfigProvider>
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

export function useT(): TranslateFn {
  return useI18n().t;
}
