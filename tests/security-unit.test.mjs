import { it, expect } from 'vitest';
import { seal, unseal, totp, matchingStep, csv, pagination } from '../server/security.mjs';
it('matches the RFC 6238 SHA1 vector and rejects replayed steps', () => {
  // Public RFC 6238 Appendix B sample bytes, not an account credential.
  const bytes = Buffer.from('1234567890'.repeat(2), 'ascii');
  const bits = Array.from(bytes, (byte) => byte.toString(2).padStart(8, '0')).join('');
  const vectorKey = bits
    .match(/.{5}/g)
    .map((chunk) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[Number.parseInt(chunk, 2)])
    .join('');
  expect(totp(vectorKey, 1)).toBe('287082');
  expect(matchingStep(vectorKey, '287082', -1, 59000)).toBe(1);
  expect(matchingStep(vectorKey, '287082', 1, 59000)).toBeNull();
  expect(matchingStep(vectorKey, 'x', -1, 59000)).toBeNull();
});
it('authenticates encrypted payloads and rejects a changed key or ciphertext', () => {
  const encrypted = seal('private-reset-token', 'a-test-key');
  expect(encrypted).not.toContain('private-reset-token');
  expect(unseal(encrypted, 'a-test-key')).toBe('private-reset-token');
  expect(() => unseal(encrypted, 'wrong-key')).toThrow();
  const bytes = Buffer.from(encrypted, 'base64url');
  bytes[29] ^= 1;
  expect(() => unseal(bytes.toString('base64url'), 'a-test-key')).toThrow();
});
it('escapes spreadsheet formulas, quotes and newlines in exported data', () => {
  const output = csv(
    [{ name: ' =HYPERLINK("bad")', note: 'one\ntwo' }],
    [
      { key: 'name', label: 'Name' },
      { key: 'note', label: 'Note' },
    ],
  );
  expect(output).toContain('"\' =HYPERLINK(""bad"")"');
  expect(output).toContain('"one\ntwo"');
});
it('rejects unbounded and malformed pagination', () => {
  expect(pagination({ page: '2', limit: '25' })).toEqual({ page: 2, limit: 25, offset: 25 });
  for (const args of [{ limit: '201' }, { page: '0' }, { page: '1 OR 1=1' }, { limit: 'NaN' }])
    expect(() => pagination(args)).toThrow();
});
