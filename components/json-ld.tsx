import { serializeJsonLd } from '@/lib/seo';

/** Structured data for search engines, rendered with the page rather than as a script to run. */
export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
