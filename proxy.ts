import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  // Anonymous visitors have no Auth session to refresh; database permissions still apply.
  if (!request.cookies.getAll().some(cookie => /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name))) return response;
  const db = createServerClient(url, key, {
    cookieOptions: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 2592000, path: '/' },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });
  // Refreshes an expired token. Unlike getUser, a token signed with an asymmetric key is verified here without calling Auth.
  await db.auth.getClaims();
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}
// Link prefetches skip the proxy: they only render loading states, which read no data, and the token is refreshed on the real navigation.
export const config = { matcher: [{ source: '/((?!_next/static|_next/image|favicon.svg|logo-tour-tanguy.svg|fonts/|api/cron).*)', missing: [{ type: 'header', key: 'next-router-prefetch' }] }] };
