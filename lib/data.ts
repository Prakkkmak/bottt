import 'server-only';
import { isConfigured, isDemo } from './config';
import { initialDemo, demoVenues } from './fixtures';
import type { AppData } from './types';
import type { Booking, Profile, GameSession, Series, Venue } from './types';
import { supabase, authenticatedClient, currentUserId } from './supabase';
import { extendSeries, serviceClient } from './notifications';
import { cache } from 'react';
import { unstable_rethrow } from 'next/navigation';
import { after, connection } from 'next/server';

let seriesCheckedAt = 0;
/**
 * The scheduled job opens the next dates of the recurring games; the site does too, after a page is sent and at most every
 * 10 minutes per server, so that they still open on time when the job runs rarely or not at all.
 */
function openSeriesDates() {
  if (Date.now() - seriesCheckedAt < 10 * 60000) return;
  const db = serviceClient();
  if (!db) return;
  seriesCheckedAt = Date.now();
  after(() => extendSeries(db));
}
export const getData = cache(async (): Promise<AppData> => {
  // Every page carries the nonce of its request's CSP (proxy.ts): none may be prerendered, even before the database is configured.
  await connection();
  if (isDemo()) return initialDemo();
  const empty: AppData = { profile: null, sessions: [], invitations: [], demo: false, configured: isConfigured(), local: process.env.LOCAL_PREVIEW==='true'&&!process.env.VERCEL };
  if (!isConfigured()) return empty;
  openSeriesDates();
  try {
    const db = await supabase();
    // The sessions and the profile load side by side: the profile only waits for the token check, not for the sessions.
    const profileRequest = currentUserId().then(id => id ? db.from('profiles').select('*').eq('id', id).maybeSingle() : null);
    const [{ data: sessions, error }, profile] = await Promise.all([db.rpc('list_sessions'), profileRequest]);
    if (error) throw error;
    if (!profile) return { ...empty, sessions: sessions as GameSession[] };
    if (profile.error) throw profile.error;
    // A valid Auth cookie without a readable profile means the database refused the session: expired after 30 days or suspended.
    if (!profile.data) return { ...empty, sessions: sessions || [], accountNotice: 'Ta connexion a expiré ou ton compte est suspendu. Reconnecte-toi avec un nouveau code. Si le problème persiste, écris à bonjour@bottt.fr.' };
    return { ...empty, sessions: sessions || [], profile: profile.data };
  } catch (err) {
    // Reading the cookies is how Next.js learns the page is rendered per request: that signal must get through.
    unstable_rethrow(err);
    console.error('Data unavailable', err instanceof Error ? err.message : 'database error'); return { ...empty, error: 'BOTTT est momentanément indisponible. Réessaie dans un instant.' }; }
});
export async function getInvitations() {
  if (isDemo() || !isConfigured() || !(await currentUserId())) return [];
  const db = await supabase();
  const { data, error } = await db.from('invitations').select('id,sponsor_id,expires_at,used_by,created_at,sent_to').order('created_at', { ascending: false }).limit(30);
  if (error) throw new Error('Impossible de charger les invitations.');
  return data || [];
}
/** Every address the viewer may read: row security returns only those of sessions they or their guests are confirmed for. */
export async function getAddresses(): Promise<Record<string, string>> {
  if (isDemo() || !isConfigured()) return {};
  try {
    if (!(await currentUserId())) return {};
    const db = await supabase();
    const { data } = await db.from('session_addresses').select('session_id,address');
    return Object.fromEntries((data || []).map(row => [row.session_id, row.address]));
  } catch { return {}; }
}
export async function getAddress(id: string): Promise<string | null> {
  if (isDemo()) return null;
  if (!isConfigured()) return null;
  const db = await supabase();
  const { data } = await db.from('session_addresses').select('address').eq('session_id', id).maybeSingle();
  return data?.address || null;
}
export async function getAdminData(): Promise<{ bookings: Booking[]; profiles: Profile[]; addresses: Record<string, string>; venues: Venue[]; series: Series[] }> {
  if (isDemo()) return { bookings: [], profiles: [], addresses: {}, venues: demoVenues, series: [] };
  const { db } = await authenticatedClient();
  // The rank check runs with the reads, which row security already limits to the viewer's own rows.
  const [{ data: organizer }, bookings, profiles, addresses, venues, series] = await Promise.all([
    db.rpc('is_organizer'),
    db.from('bookings').select('*,profile:profiles(*)').order('created_at'),
    db.from('profiles').select('*').order('display_name'),
    db.from('session_addresses').select('*'),
    db.from('venues').select('id,name,address').order('name'),
    db.from('session_series').select('id,title,script,location,venue_id,capacity,visibility,first_date,starts_local,every_weeks,weeks_ahead,ends_on').order('created_at')
  ]);
  if (!organizer) throw new Error('Accès organisateur requis.');
  if (bookings.error || profiles.error || addresses.error) throw new Error('Impossible de charger les participants.');
  // The page still opens, without these lists, while their migration has not reached the database.
  if (venues.error) console.error('Venues unavailable', venues.error.message);
  if (series.error) console.error('Series unavailable', series.error.message);
  return { bookings: bookings.data || [], profiles: profiles.data || [], addresses: Object.fromEntries((addresses.data || []).map(a => [a.session_id, a.address])), venues: venues.data || [], series: series.data || [] };
}
