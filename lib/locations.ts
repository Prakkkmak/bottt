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

const searchedServices = [
  { label: 'OpenStreetMap', host: /(^|\.)(openstreetmap\.org|osm\.org)$/, search: 'https://www.openstreetmap.org/search?query=' },
  { label: 'Google Maps', host: /(^|\.)(google\.[a-z]{2,3}(\.[a-z]{2})?|goo\.gl)$/, search: 'https://www.google.com/maps/search/?api=1&query=' },
];
const otherServices = [{ label: 'Apple Plans', host: /(^|\.)apple\.com$/ }, { label: 'Waze', host: /(^|\.)waze\.com$/ }];

/** OpenStreetMap and Google Maps search the postal address, unless the pasted link belongs to one of them; a link to another service comes after them. */
export function mapLinks(value: string) {
  const parsed = splitAddress(value);
  const host = parsed.mapsUrl && new URL(parsed.mapsUrl).hostname;
  const query = postalAddress(parsed.address);
  const links = searchedServices.flatMap(service => service.host.test(host) ? [{ label: service.label, href: parsed.mapsUrl }]
    : query ? [{ label: service.label, href: service.search + encodeURIComponent(query) }] : []);
  if (host && !searchedServices.some(service => service.host.test(host))) {
    links.push({ label: otherServices.find(service => service.host.test(host))?.label ?? host.replace(/^www\./, ''), href: parsed.mapsUrl });
  }
  return links;
}
