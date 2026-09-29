import { useEffect, useState } from 'react';
import { store } from './store';
import type { Theme } from './map/icons';

// Light and dark themes. The atlas follows the system setting unless the reader picks
// one; that choice is a per-browser convenience kept in localStorage.
export type ThemePref = 'auto' | Theme;
const KEY = 'uk-atlas-theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

let pref: ThemePref = readPref();
const listeners = new Set<() => void>();

function apply() {
  const theme: Theme = pref === 'auto' ? (media.matches ? 'dark' : 'light') : pref;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#070b14' : '#efe8da');
  store.set({ theme });
}
apply();
media.addEventListener('change', apply);

export function setThemePref(p: ThemePref) {
  pref = p;
  try {
    if (p === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, p);
  } catch {
    /* storage may be blocked; the choice still applies for this visit */
  }
  apply();
  listeners.forEach((l) => l());
}

export function useThemePref(): ThemePref {
  const [p, setP] = useState(pref);
  useEffect(() => {
    const l = () => setP(pref);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return p;
}

/** Keeps the document's theme in step with the system setting. */
export function useTheme() {
  useEffect(() => apply(), []);
}
