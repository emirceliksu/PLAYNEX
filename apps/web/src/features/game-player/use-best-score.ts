'use client';

import { useCallback, useSyncExternalStore } from 'react';

// Personal bests live in the browser until accounts and server-side verification exist.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function readBest(key: string): number {
  try {
    return Number(window.localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

export function useBestScore(slug: string) {
  const key = `playnex:best:${slug}`;
  // Server snapshot is 0 so hydration matches; the client value arrives right after.
  const best = useSyncExternalStore(
    subscribe,
    () => readBest(key),
    () => 0,
  );

  const record = useCallback(
    (score: number): boolean => {
      if (score <= readBest(key)) {
        return false;
      }
      try {
        window.localStorage.setItem(key, String(score));
      } catch {
        // Private mode or blocked storage: the record still counts for this session.
      }
      listeners.forEach((listener) => listener());
      return true;
    },
    [key],
  );

  return { best, record };
}
