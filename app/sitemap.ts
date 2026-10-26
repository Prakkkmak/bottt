import type { MetadataRoute } from 'next';
import { guidePath, indexable, siteOrigin } from '@/lib/seo';

// The sessions open on the home page itself (?partie=), which is why it is the only other address.
export default function sitemap(): MetadataRoute.Sitemap {
  if (!indexable()) return [];
  const origin = siteOrigin();
  return [{ url: origin, changeFrequency: 'daily', priority: 1 }, { url: `${origin}${guidePath}`, changeFrequency: 'monthly', priority: 0.8 }];
}
