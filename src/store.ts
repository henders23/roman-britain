import { useSyncExternalStore } from 'react';
import type { Theme } from './map/icons';

export interface AtlasState {
  t: number;
  playing: boolean;
  speed: number; // multiples of the dataset's time unit per second of playback
  selected: string | null;
  hovered: string | null;
  autoCamera: boolean;
  showPast: boolean;
  headline: string | null; // event id currently announced during playback
  panel: 'chronicle' | 'about' | null;
  theme: Theme;
}

type Listener = () => void;

function createStore<S extends object>(initial: S) {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(patch: Partial<S> | ((s: S) => Partial<S>)) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      let changed = false;
      for (const k in p) if (!Object.is(p[k], state[k])) changed = true;
      if (!changed) return;
      state = { ...state, ...p };
      listeners.forEach((l) => l());
    },
    subscribe(l: Listener) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export const store = createStore<AtlasState>({
  t: 0,
  playing: false,
  speed: 1,
  selected: null,
  hovered: null,
  autoCamera: true,
  showPast: true,
  headline: null,
  panel: null,
  theme: 'dark',
});

export function useAtlas<T>(pick: (s: AtlasState) => T): T {
  return useSyncExternalStore(store.subscribe, () => pick(store.get()));
}
