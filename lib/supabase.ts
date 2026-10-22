import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isConfigured } from './config';
import { cache } from 'react';
export const supabase = cache(async () => {
  if (!isConfigured()) throw new Error('La connexion n’est pas encore configurée.');
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookieOptions: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 30, path: '/' },
    cookies: { getAll: () => jar.getAll(), setAll: values => { try { values.forEach(({ name, value, options }) => jar.set(name, value, options)); } catch { /* Server Components cannot write cookies; proxy refreshes them. */ } } }
  });
});
/**
 * The signed-in account, read from the session token once its signature is checked. With asymmetric signing keys this
 * needs no request to Supabase Auth; the database still checks the same token on every query.
 */
export const currentUserId = cache(async (): Promise<string | null> => {
  const db = await supabase();
  const { data } = await db.auth.getClaims();
  return data?.claims.sub ?? null;
});
export async function authenticatedClient() {
  const db = await supabase();
  // Both checks run together; active_user simply answers false without an account.
  const [userId, { data: active }] = await Promise.all([currentUserId(), db.rpc('active_user')]);
  if (!userId) throw new Error('Connecte-toi pour continuer.');
  if (!active) throw new Error('Ta connexion a expiré ou ton compte est suspendu. Reconnecte-toi ou contacte un organisateur.');
  return { db, user: { id: userId } };
}
