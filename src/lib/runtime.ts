type VenueConfig = { apiBase?: string; appOrigin?: string };
declare global {
  interface Window {
    __VENUE_CONFIG__?: VenueConfig;
  }
}

const runtime = typeof window === 'undefined' ? undefined : window.__VENUE_CONFIG__;
export const configuredApiBase = runtime?.apiBase ?? import.meta.env.VITE_API_URL ?? '';
export const configuredAppOrigin = runtime?.appOrigin ?? import.meta.env.VITE_APP_ORIGIN ?? '';

export function canonicalDestination(current: string, configured: string): string | null {
  if (!configured) return null;
  const source = new URL(current);
  const target = new URL(configured);
  if (
    target.protocol !== 'https:' ||
    target.username ||
    target.password ||
    target.pathname !== '/' ||
    target.search ||
    target.hash
  )
    throw new Error('VITE_APP_ORIGIN must be an HTTPS origin.');
  if (source.origin === target.origin) return null;
  return target.origin + source.pathname + source.search + source.hash;
}
