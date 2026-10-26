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

/** A shared link opens as is. Otherwise OpenStreetMap searches the postal address alone, as it finds nothing once access notes come with it. */
export function mapsUrl(value: string) {
  const parsed = splitAddress(value);
  if (parsed.mapsUrl) return parsed.mapsUrl;
  const lines = parsed.address.split(/\r\n|[\r\n\u2028\u2029]/).map(line => line.trim()).filter(Boolean);
  // The line with the postcode, after the street line when it starts with it, as on an envelope; without one, the first line.
  const postcode = lines.findIndex(line => /\b\d{5}\s+\p{L}/u.test(line));
  const start = postcode < 0 ? 0 : /^\d{5}\b/.test(lines[postcode]) ? Math.max(postcode - 1, 0) : postcode;
  const query = lines.slice(start, Math.max(postcode, start) + 1).join(', ');
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`;
}
