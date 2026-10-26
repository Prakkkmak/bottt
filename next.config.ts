import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    return [{ source: '/mes-parties', destination: '/', permanent: true }];
  },
  async headers() {
    return [{ source: '/fonts/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' }] }, { source: '/:file(favicon.svg|logo-tour-tanguy.svg|og-image.png|apple-touch-icon.png)', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }] }, { source: '/code.html', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] }, { source: '/invite/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }, { source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      // Browsers only honour it over HTTPS, so the local site on http://127.0.0.1 is unaffected.
      { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' }
      // The Content-Security-Policy, with a nonce for each page, is set by proxy.ts.
    ] }];
  }
};
export default config;
