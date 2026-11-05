import { expect, it } from 'vitest';
import { canonicalDestination } from '../src/lib/runtime';

it('preserves booking selections and account recovery fragments when moving to the first-party site', () => {
  expect(
    canonicalDestination(
      'https://old.example/account-access?purpose=reset#token=example',
      'https://venue.example',
    ),
  ).toBe('https://venue.example/account-access?purpose=reset#token=example');
  expect(
    canonicalDestination(
      'https://old.example/booking?artistId=artist&serviceId=service',
      'https://venue.example/',
    ),
  ).toBe('https://venue.example/booking?artistId=artist&serviceId=service');
});
it('does not redirect a server-hosted page or an already canonical page', () => {
  expect(canonicalDestination('https://venue.example/login', '')).toBeNull();
  expect(canonicalDestination('https://venue.example/login', 'https://venue.example')).toBeNull();
});
it.each([
  'http://venue.example',
  'https://user:password@venue.example',
  'https://venue.example/path',
  'https://venue.example/?redirect=elsewhere',
  'https://venue.example/#fragment',
])('rejects invalid application origins: %s', (origin) => {
  expect(() => canonicalDestination('https://old.example/login', origin)).toThrow();
});
