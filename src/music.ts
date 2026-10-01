import { useEffect, useState } from 'react';

// Background music: "Quiet Roman Dawn", looped quietly. It is on unless the reader turns it
// off; that choice is a per-browser convenience kept in localStorage. Browsers will not
// start sound before the reader has interacted with the page, so if the first attempt is
// refused, playback begins on the first click, tap or key press.
const KEY = 'uk-atlas-music';
const audio = new Audio(`${import.meta.env.BASE_URL}audio/quiet-roman-dawn.mp3`);
audio.loop = true;
audio.volume = 0.35;
audio.preload = 'none';

function readOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

let on = readOn();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

const GESTURES = ['pointerdown', 'keydown'] as const;
function waitForGesture() {
  const start = () => {
    GESTURES.forEach((g) => window.removeEventListener(g, start, true));
    if (on && audio.paused) audio.play().catch(() => {});
  };
  GESTURES.forEach((g) => window.addEventListener(g, start, true));
}

function play() {
  audio.play().catch(() => waitForGesture());
}

if (on) play();

export function setMusic(next: boolean) {
  on = next;
  try {
    localStorage.setItem(KEY, next ? 'on' : 'off');
  } catch {
    /* storage may be blocked; the choice still applies for this visit */
  }
  if (next) play();
  else audio.pause();
  notify();
}

export function useMusic(): boolean {
  const [v, setV] = useState(on);
  useEffect(() => {
    const l = () => setV(on);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return v;
}
