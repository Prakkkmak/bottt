import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isConfigured } from './config';
export async function supabase() {
  if (!isConfigured()) throw new Error('La connexion n’est pas encore configurée.');
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookieOptions: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 30, path: '/' },
    cookies: { getAll: () => jar.getAll(), setAll: values => { try { values.forEach(({ name, value, options }) => jar.set(name, value, options)); } catch { /* Server Components cannot write cookies; proxy refreshes them. */ } } }
  });
}
export async function authenticatedClient() {
  const db = await supabase();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) throw new Error('Connecte-toi pour continuer.');
  const { data: active } = await db.rpc('active_user');
  if (!active) throw new Error('Ta connexion a expiré ou ton compte est suspendu. Reconnecte-toi ou contacte un organisateur.');
  return { db, user };
}
