'use client';
import { createContext, useContext } from 'react';

type Viewer = { signedIn: boolean; configured: boolean };
const ViewerContext = createContext<Viewer>({ signedIn: false, configured: true });

/** Whether someone is signed in, as known to the layout, for parts of the page that render without loading data. */
export function ViewerProvider({ value, children }: { value: Viewer; children: React.ReactNode }) {
  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}
export const useViewer = () => useContext(ViewerContext);
