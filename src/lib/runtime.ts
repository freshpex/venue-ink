type VenueConfig = { apiBase?: string };
declare global {
  interface Window {
    __VENUE_CONFIG__?: VenueConfig;
  }
}

const runtime = typeof window === 'undefined' ? undefined : window.__VENUE_CONFIG__;
export const configuredApiBase = runtime?.apiBase ?? import.meta.env.VITE_API_URL ?? '';
