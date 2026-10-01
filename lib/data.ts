import 'server-only';
import { isConfigured, isDemo } from './config';
import { initialDemo } from './fixtures';
import type { AppData } from './types';
import type { Booking, Profile, GameSession } from './types';
import { supabase, authenticatedClient } from './supabase';
import { cache } from 'react';
export const getData = cache(async (): Promise<AppData> => {
  if (isDemo()) return initialDemo();
  const empty: AppData = { profile: null, sessions: [], invitations: [], notices: [], demo: false, configured: isConfigured(), local: process.env.LOCAL_PREVIEW==='true'&&!process.env.VERCEL };
  if (!isConfigured()) return empty;
  try {
    const db = await supabase();
    const [{ data: { user } }, { data: sessions, error }] = await Promise.all([db.auth.getUser(), db.rpc('list_sessions')]);
    if (error) throw error;
    if (!user) return { ...empty, sessions: sessions as GameSession[] };
    const profile = await db.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (profile.error) throw profile.error;
    return { ...empty, sessions: sessions || [], profile: profile.data };
  } catch (err) { console.error('Data unavailable', err instanceof Error ? err.message : 'database error'); return { ...empty, error: 'BOTTT est momentanément indisponible. Réessaie dans un instant.' }; }
});
export async function getInvitations() {
  if (isDemo() || !isConfigured()) return [];
  const db = await supabase();
  const { data, error } = await db.from('invitations').select('id,sponsor_id,expires_at,used_by,created_at').order('created_at', { ascending: false }).limit(30);
  if (error) throw new Error('Impossible de charger les invitations.');
  return data || [];
}
export async function getAddresses(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length || isDemo() || !isConfigured()) return {};
  const db = await supabase();
  const { data } = await db.from('session_addresses').select('session_id,address').in('session_id', ids);
  return Object.fromEntries((data || []).map(row => [row.session_id, row.address]));
}
export async function getAddress(id: string): Promise<string | null> {
  if (isDemo()) return null;
  if (!isConfigured()) return null;
  const db = await supabase();
  const { data } = await db.from('session_addresses').select('address').eq('session_id', id).maybeSingle();
  return data?.address || null;
}
export async function getAdminData(): Promise<{ bookings: Booking[]; profiles: Profile[]; addresses: Record<string, string> }> {
  if (isDemo()) return { bookings: [], profiles: [], addresses: {} };
  const { db } = await authenticatedClient();
  const { data: organizer } = await db.rpc('is_organizer');
  if (!organizer) throw new Error('Accès organisateur requis.');
  const [bookings, profiles, addresses] = await Promise.all([
    db.from('bookings').select('*,profile:profiles(*)').order('created_at'),
    db.from('profiles').select('*').order('display_name'),
    db.from('session_addresses').select('*')
  ]);
  if (bookings.error || profiles.error || addresses.error) throw new Error('Impossible de charger les participants.');
  return { bookings: bookings.data || [], profiles: profiles.data || [], addresses: Object.fromEntries((addresses.data || []).map(a => [a.session_id, a.address])) };
}
