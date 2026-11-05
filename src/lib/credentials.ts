const storageKey = 'venue-browser-session';
let memoryToken: string | null = null;

export function usesBrowserSession(
  api: string,
  origin = typeof window === 'undefined' ? '' : window.location.origin,
) {
  return !!api && !!origin && new URL(api, origin).origin !== origin;
}
export function getSessionCredential(): string | null {
  try {
    return sessionStorage.getItem(storageKey) || memoryToken;
  } catch {
    return memoryToken;
  }
}
export function saveSessionCredential(token: string | null) {
  memoryToken = token;
  try {
    if (token) sessionStorage.setItem(storageKey, token);
    else sessionStorage.removeItem(storageKey);
  } catch {
    /* The current tab can still authenticate without persistent storage. */
  }
}
export function sessionHeaders(api: string): Record<string, string> {
  if (!usesBrowserSession(api)) return {};
  const token = getSessionCredential();
  return { 'X-Venue-Session': 'browser', ...(token ? { Authorization: 'Bearer ' + token } : {}) };
}
