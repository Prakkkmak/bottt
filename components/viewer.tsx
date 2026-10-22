'use client';
import { createContext, useContext, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type Viewer = { signedIn: boolean; configured: boolean; header: string };
const ViewerContext = createContext<Viewer>({ signedIn: false, configured: true, header: '' });

/** Whether someone is signed in, as known to the layout, for parts of the page that render without loading data. */
export function ViewerProvider({ value, children }: { value: Viewer; children: React.ReactNode }) {
  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}
export const useViewer = () => useContext(ViewerContext);

/** Navigating keeps the layout as it was: when the page finds the header out of date (signed in elsewhere, new pseudo or rank), it is refreshed. */
export function ViewerCheck({ header }: { header: string }) {
  const router = useRouter();
  const stale = useViewer().header !== header;
  useEffect(() => { if (stale) router.refresh(); }, [stale, router]);
  return null;
}
