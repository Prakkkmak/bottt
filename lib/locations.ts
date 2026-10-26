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

/** A shared link opens as is; otherwise OpenStreetMap searches the first line, as its search finds nothing once access notes follow the address. */
export function mapsUrl(value: string) {
  const parsed = splitAddress(value);
  if (parsed.mapsUrl) return parsed.mapsUrl;
  const query = parsed.address.split('\n').map(line => line.trim()).find(Boolean) ?? '';
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`;
}
