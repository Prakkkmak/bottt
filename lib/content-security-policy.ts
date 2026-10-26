/** Only scripts carrying this request's nonce run, and those they load: Next.js adds it to its own, which load Turnstile. */
export function contentSecurityPolicy(nonce: string, development = process.env.NODE_ENV === 'development') {
  return [
    "default-src 'self'",
    // React rebuilds server error stacks with eval, in development only.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com${development ? " 'unsafe-eval'" : ''}`,
    // The seats around the tower are placed with style attributes, which a nonce does not cover.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
