import { mapLinks } from '@/lib/locations';

/** A link per map service for the place, each opening in a new tab. */
export function MapLinks({ value, className, external = false }: { value: string; className: string; external?: boolean }) {
  return <>{mapLinks(value).map(link => <a key={link.label} className={className} href={link.href} target="_blank" rel="noopener noreferrer" title={`Ouvrir le lieu dans ${link.label}`}>{link.label}{external && ' ↗'}</a>)}</>;
}
