import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { contentSecurityPolicy } from '@/lib/content-security-policy';
export async function proxy(request: NextRequest) {
  const policy = contentSecurityPolicy(btoa(crypto.randomUUID()));
  // Next.js reads the nonce from the request's policy; the browser enforces the same policy from the response.
  const forward = () => { const headers = new Headers(request.headers); headers.set('Content-Security-Policy', policy); return NextResponse.next({ request: { headers } }); };
  const send = (response: NextResponse) => { response.headers.set('Content-Security-Policy', policy); return response; };
  let response = forward();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return send(response);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  // Anonymous visitors have no Auth session to refresh; database permissions still apply.
  if (!request.cookies.getAll().some(cookie => /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name))) return send(response);
  const db = createServerClient(url, key, {
    cookieOptions: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 2592000, path: '/' },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = forward();
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });
  // Refreshes an expired token. Unlike getUser, a token signed with an asymmetric key is verified here without calling Auth.
  await db.auth.getClaims();
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return send(response);
}
// Prefetches go through here too: they render the root layout, which reads the session, and a token refreshed there could not be saved.
// Static files, robots.txt, the sitemap and the cron are the same for everyone. Each is anchored, so that no other address,
// such as a 404 under /fonts/, renders the layout without the proxy and so without its CSP. A new font file needs adding here.
export const config = { matcher: ['/((?!_next/static/|_next/image$|favicon\\.svg$|logo-tour-tanguy\\.svg$|fonts/(?:cinzel|dm-sans)-latin(?:-ext)?\\.woff2$|api/cron$|robots\\.txt$|sitemap\\.xml$|og-image\\.png$|apple-touch-icon\\.png$).*)'] };
