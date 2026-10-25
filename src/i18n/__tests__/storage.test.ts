import { afterEach, describe, expect, it } from 'vitest';
import { getStoredLanguage, LANGUAGE_STORAGE_KEY, setStoredLanguage } from '../storage';

describe('storage', () => {
  afterEach(() => {
    localStorage.clear();
  });

  describe('getStoredLanguage', () => {
    it('returns null when no language is stored', () => {
      expect(getStoredLanguage()).toBeNull();
    });

    it('returns the stored language tag', () => {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en-US');
      expect(getStoredLanguage()).toBe('en-US');
    });
  });

  describe('setStoredLanguage', () => {
    it('stores a language tag in localStorage', () => {
      setStoredLanguage('ja-JP');
      expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('ja-JP');
    });

    it('removes the key when null is passed', () => {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en-US');
      setStoredLanguage(null);
      expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
    });

    it('does nothing when empty string is passed', () => {
      setStoredLanguage('');
      // empty string is falsy → removeItem path
      expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
    });
  });
});
