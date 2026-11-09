import type { MetadataRoute } from 'next';
import { guidePath, indexable, siteOrigin } from '@/lib/seo';
import { baseScripts, scriptPath } from '@/lib/scripts';

// The sessions open on the home page itself (?partie=); the pages that teach the game have their own addresses.
export default function sitemap(): MetadataRoute.Sitemap {
  if (!indexable()) return [];
  const origin = siteOrigin();
  return [{ url: origin, changeFrequency: 'daily', priority: 1 }, { url: `${origin}${guidePath}`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${origin}/apprendre`, changeFrequency: 'weekly', priority: 0.7 }, { url: `${origin}/apprendre/roles`, changeFrequency: 'monthly', priority: 0.6 },
    ...baseScripts.map(s => ({ url: `${origin}${scriptPath(s.name)}`, changeFrequency: 'monthly' as const, priority: 0.6 }))];
}
