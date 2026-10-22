'use client';
import { createContext, useContext, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type Viewer = { signedIn: boolean; welcome: boolean; configured: boolean };
const ViewerContext = createContext<Viewer>({ signedIn: false, welcome: false, configured: true });

/** Whether someone is signed in, as known to the layout, for parts of the page that render without loading data. */
export function ViewerProvider({ value, children }: { value: Viewer; children: React.ReactNode }) {
  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}
export const useViewer = () => useContext(ViewerContext);

/** Navigating keeps the layout as it was: when the page finds the visitor signed in or out elsewhere, the header is refreshed. */
export function ViewerCheck({ signedIn, welcome }: { signedIn: boolean; welcome: boolean }) {
  const viewer = useViewer();
  const router = useRouter();
  const stale = viewer.signedIn !== signedIn || viewer.welcome !== welcome;
  useEffect(() => { if (stale) router.refresh(); }, [stale, router]);
  return null;
}
