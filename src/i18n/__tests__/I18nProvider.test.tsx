import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { I18nProvider, useI18n, useT } from '../I18nProvider';
import { LANGUAGE_CHANGED_EVENT, DEFAULT_LANGUAGE } from '../locale';

// Helper component that exposes context values for testing
function LangDisplay() {
  const { language } = useI18n();
  return <span data-testid="lang">{language}</span>;
}

function TDisplay() {
  const t = useT();
  return <span data-testid="translated">{t('概览')}</span>;
}

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

afterEach(() => {
  localStorage.clear();
  cleanup();
});

describe('I18nProvider', () => {
  it('provides default language zh-CN when nothing is stored', () => {
    render(
      <I18nProvider>
        <LangDisplay />
      </I18nProvider>,
    );
    expect(screen.getByTestId('lang').textContent).toBe(DEFAULT_LANGUAGE);
  });

  it('provides stored language from localStorage', () => {
    localStorage.setItem('powercms.language', 'en-US');
    render(
      <I18nProvider>
        <LangDisplay />
      </I18nProvider>,
    );
    expect(screen.getByTestId('lang').textContent).toBe('en-US');
  });

  it('updates language when LANGUAGE_CHANGED_EVENT is dispatched', () => {
    localStorage.setItem('powercms.language', 'zh-CN');
    render(
      <I18nProvider>
        <LangDisplay />
      </I18nProvider>,
    );
    expect(screen.getByTestId('lang').textContent).toBe('zh-CN');

    act(() => {
      localStorage.setItem('powercms.language', 'ja-JP');
      window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGED_EVENT, { detail: 'ja-JP' }));
    });
    expect(screen.getByTestId('lang').textContent).toBe('ja-JP');
  });

  it('useT returns a translate function that uses the current language', () => {
    localStorage.setItem('powercms.language', 'en-US');
    render(
      <I18nProvider>
        <TDisplay />
      </I18nProvider>,
    );
    expect(screen.getByTestId('translated').textContent).toBe('Overview');
  });

  it('useT with zh-CN returns the Chinese key unchanged', () => {
    localStorage.setItem('powercms.language', 'zh-CN');
    render(
      <I18nProvider>
        <TDisplay />
      </I18nProvider>,
    );
    expect(screen.getByTestId('translated').textContent).toBe('概览');
  });
});
