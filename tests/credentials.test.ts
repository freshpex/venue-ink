import { afterEach, expect, it, vi } from 'vitest';
import {
  getSessionCredential,
  saveSessionCredential,
  sessionHeaders,
  usesBrowserSession,
} from '../src/lib/credentials';
afterEach(() => {
  saveSessionCredential(null);
  vi.unstubAllGlobals();
});
it('keeps cookie authentication for same-origin pages and uses browser sessions for a separate API', () => {
  expect(usesBrowserSession('', 'https://venue.example')).toBe(false);
  expect(usesBrowserSession('https://venue.example', 'https://venue.example')).toBe(false);
  expect(usesBrowserSession('https://api.example', 'https://venue.example')).toBe(true);
});
it('persists only in tab storage and removes the credential on logout', () => {
  const values = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => values.get(key),
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  vi.stubGlobal('window', { location: { origin: 'https://venue.example' } });
  saveSessionCredential('example-session');
  expect(getSessionCredential()).toBe('example-session');
  expect(sessionHeaders('https://api.example').Authorization).toBe('Bearer example-session');
  expect(sessionHeaders('')).toEqual({});
  saveSessionCredential(null);
  expect(values.size).toBe(0);
  expect(getSessionCredential()).toBeNull();
});
it('keeps the current tab usable if browser storage is unavailable', () => {
  vi.stubGlobal('sessionStorage', {
    setItem() {
      throw new Error('Unavailable');
    },
    getItem() {
      throw new Error('Unavailable');
    },
    removeItem() {
      throw new Error('Unavailable');
    },
  });
  saveSessionCredential('example-session');
  expect(getSessionCredential()).toBe('example-session');
});
