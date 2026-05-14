// Applies the user's theme preference to <html data-theme="…">.
// 'auto' clears the attribute so prefers-color-scheme rules in styles.css apply.

import type { ThemePreference } from '../types/settings';
import { STORAGE_KEYS } from '../lib/storage';

export function applyTheme(pref: ThemePreference): void {
  const root = document.documentElement;
  if (pref === 'light' || pref === 'dark') {
    root.setAttribute('data-theme', pref);
  } else {
    root.removeAttribute('data-theme');
  }
}

/** Read stored theme, apply it, and watch chrome.storage for live updates. */
export function initTheme(): void {
  chrome.storage.local.get(STORAGE_KEYS.SETTINGS, (out) => {
    const stored = out?.[STORAGE_KEYS.SETTINGS] as { theme?: ThemePreference } | undefined;
    applyTheme(stored?.theme ?? 'auto');
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const change = changes[STORAGE_KEYS.SETTINGS];
    if (!change) return;
    const next = change.newValue as { theme?: ThemePreference } | undefined;
    applyTheme(next?.theme ?? 'auto');
  });
}
