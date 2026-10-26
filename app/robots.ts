import type { MetadataRoute } from 'next';
import { indexable, siteOrigin } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  if (!indexable()) return { rules: { userAgent: '*', disallow: '/' } };
  // Account pages and invitation links stay crawlable so that their noindex is read: a blocked link shared publicly could still be listed, token included.
  return { rules: { userAgent: '*', allow: '/', disallow: '/api/' }, sitemap: `${siteOrigin()}/sitemap.xml` };
}
