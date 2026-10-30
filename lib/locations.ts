/** Keep a pasted map link and the address in the existing private address field. */
export function splitAddress(value: string) {
  const match = value.match(/https?:\/\/[^\s<>]+/i);
  if (!match) return { address: value.trim(), mapsUrl: '' };
  const candidate = match[0].replace(/[).;]+$/, '');
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return { address: value.trim(), mapsUrl: '' };
    return { address: value.replace(match[0], '').trim(), mapsUrl: url.href };
  } catch {
    return { address: value.trim(), mapsUrl: '' };
  }
}

/** The postal address alone, as OpenStreetMap finds nothing once access notes come with it. */
function postalAddress(address: string) {
  const lines = address.split(/\r\n|[\r\n\u2028\u2029]/).map(line => line.trim()).filter(Boolean);
  // The line with the postcode, after the street line when it starts with it, as on an envelope; without one, the first line.
  const postcode = lines.findIndex(line => /\b\d{5}\s+\p{L}/u.test(line));
  const start = postcode < 0 ? 0 : /^\d{5}\b/.test(lines[postcode]) ? Math.max(postcode - 1, 0) : postcode;
  return lines.slice(start, Math.max(postcode, start) + 1).join(', ');
}

const googleDomain = /^(www\.|maps\.)?google\.(com|fr|be|ch|lu|ca|de|es|it|nl|pt|ie|at|co\.uk)$/;
// A service's name is only given to its map pages: any other link, a Google redirect for one, is named after its site.
const searchedServices = [
  { label: 'OpenStreetMap', owns: (url: URL) => /^(www\.)?(openstreetmap|osm)\.org$/.test(url.hostname), search: 'https://www.openstreetmap.org/search?query=' },
  { label: 'Google Maps', owns: (url: URL) => ['maps.app.goo.gl', 'g.page', 'share.google'].includes(url.hostname) || (url.hostname === 'goo.gl' && url.pathname.startsWith('/maps')) || (googleDomain.test(url.hostname) && (url.hostname.startsWith('maps.') || url.pathname.startsWith('/maps'))), search: 'https://www.google.com/maps/search/?api=1&query=' },
];
const otherServices = [
  { label: 'Apple Plans', owns: (url: URL) => url.hostname === 'maps.apple.com' },
  { label: 'Waze', owns: (url: URL) => /^(www\.|ul\.)?waze\.com$/.test(url.hostname) },
];

/** OpenStreetMap and Google Maps search the postal address, or the fallback when there is only a link, unless the pasted link belongs to one of them; a link to another service comes after them. */
export function mapLinks(value: string, fallback = '') {
  const parsed = splitAddress(value);
  const pasted = parsed.mapsUrl ? new URL(parsed.mapsUrl) : null;
  const query = postalAddress(parsed.address) || postalAddress(fallback);
  const links = searchedServices.flatMap(service => pasted && service.owns(pasted) ? [{ label: service.label, href: pasted.href }]
    : query ? [{ label: service.label, href: service.search + encodeURIComponent(query) }] : []);
  if (pasted && !searchedServices.some(service => service.owns(pasted))) {
    links.push({ label: otherServices.find(service => service.owns(pasted))?.label ?? pasted.hostname.replace(/^www\./, ''), href: pasted.href });
  }
  return links;
}
