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

export function mapsUrl(value: string) {
  const parsed = splitAddress(value);
  return parsed.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value.trim())}`;
}
