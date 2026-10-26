import type { MetadataRoute } from 'next';
import { indexable, siteOrigin } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  if (!indexable()) return { rules: { userAgent: '*', disallow: '/' } };
  // Account pages stay crawlable so that their noindex is read; invitation links and the API have nothing to show.
  return { rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/invite/'] }, sitemap: `${siteOrigin()}/sitemap.xml` };
}
