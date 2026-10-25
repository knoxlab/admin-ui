export const LANGUAGE_STORAGE_KEY = 'powercms.language';

export function getStoredLanguage(): string | null {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredLanguage(tag: string | null) {
  try {
    if (tag) localStorage.setItem(LANGUAGE_STORAGE_KEY, tag);
    else localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}
