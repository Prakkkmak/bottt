export const COOKIE_POLICY_KEY = 'bottt-cookie-policy';
export const COOKIE_POLICY_VERSION = 1;
export const COOKIE_SETTINGS_EVENT = 'bottt:cookie-settings';

export function isCookiePolicyAcknowledged(value: string | null, now = Date.now()) {
  if (!value) return false;
  try {
    const choice: unknown = JSON.parse(value);
    return typeof choice === 'object' && choice !== null &&
      'version' in choice && choice.version === COOKIE_POLICY_VERSION &&
      'expiresAt' in choice && typeof choice.expiresAt === 'number' && choice.expiresAt > now;
  } catch {
    return false;
  }
}

export function cookiePolicyAcknowledgement(now = new Date()) {
  const expiry = new Date(now);
  expiry.setUTCMonth(expiry.getUTCMonth() + 6);
  return JSON.stringify({ version: COOKIE_POLICY_VERSION, expiresAt: expiry.getTime() });
}
