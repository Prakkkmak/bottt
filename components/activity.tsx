'use client';
import { useEffect, useSyncExternalStore } from 'react';

// Server actions in progress anywhere on the page, shown by one thin bar at the top.
let running = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/** Counts the caller's request in the top bar while `pending` is true. */
export function useActivity(pending: boolean) {
  useEffect(() => { if (!pending) return; running++; notify(); return () => { running--; notify(); }; }, [pending]);
}

export function ActivityBar() {
  const busy = useSyncExternalStore(subscribe, () => running > 0, () => false);
  return <div className={`activity-bar ${busy ? 'is-busy' : ''}`} aria-hidden="true" />;
}
