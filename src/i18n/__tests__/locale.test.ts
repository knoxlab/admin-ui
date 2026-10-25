import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAntdLocale, initialLanguage, translate, DEFAULT_LANGUAGE } from '../locale';

// i18n 依赖 localStorage；每个测试前后清理。
beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
});

describe('translate', () => {
  it('returns the zh key for zh-CN (default language, no dictionary)', () => {
    expect(translate('zh-CN', '概览')).toBe('概览');
  });

  it('returns the zh key when the key is empty string', () => {
    expect(translate('zh-CN', '')).toBe('');
  });

  it('interpolates variables in the template', () => {
    const out = translate('zh-CN', '语言偏好已保存: {tag}', { tag: 'en-US' });
    expect(out).toBe('语言偏好已保存: en-US');
  });

  it('leaves unmatched placeholders intact', () => {
    const out = translate('zh-CN', 'Hello {name}, age {age}', { name: 'Alice' });
    expect(out).toBe('Hello Alice, age {age}');
  });

  it('returns the key unchanged when vars is undefined', () => {
    expect(translate('zh-CN', '测试')).toBe('测试');
  });

  it('converts numeric variables to string', () => {
    const out = translate('zh-CN', '已处理 {count} 条', { count: 42 });
    expect(out).toBe('已处理 42 条');
  });
});

describe('getAntdLocale', () => {
  it('returns the zh_CN locale object for zh-CN', () => {
    const locale = getAntdLocale('zh-CN');
    expect(locale).toBeDefined();
    expect(locale.locale).toBe('zh-cn');
  });

  it('returns zhCN as fallback for unknown tags', () => {
    const locale = getAntdLocale('xx-YY');
    expect(locale.locale).toBe('zh-cn');
  });

  it('returns enUS for en-US', () => {
    const locale = getAntdLocale('en-US');
    expect(locale.locale).toBe('en');
  });
});

describe('initialLanguage', () => {
  it('returns the stored language when set', () => {
    localStorage.setItem('powercms.language', 'ja-JP');
    expect(initialLanguage()).toBe('ja-JP');
  });

  it('falls back to DEFAULT_LANGUAGE when nothing is stored', () => {
    expect(initialLanguage()).toBe(DEFAULT_LANGUAGE);
  });
});

describe('DEFAULT_LANGUAGE', () => {
  it('is zh-CN', () => {
    expect(DEFAULT_LANGUAGE).toBe('zh-CN');
  });
});
