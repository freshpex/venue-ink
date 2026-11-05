import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { HttpError } from './validation.mjs';

export const digest = (value) => createHash('sha256').update(value).digest('hex');
export function seal(value, key) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(key).digest(), nonce);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString('base64url');
}
export function unseal(value, key) {
  const bytes = Buffer.from(value, 'base64url');
  const cipher = createDecipheriv(
    'aes-256-gcm',
    createHash('sha256').update(key).digest(),
    bytes.subarray(0, 12),
  );
  cipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8');
}
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function authenticatorSecret() {
  let bits = '';
  for (const n of randomBytes(20)) bits += n.toString(2).padStart(8, '0');
  return bits
    .match(/.{5}/g)
    .map((part) => alphabet[parseInt(part, 2)])
    .join('');
}
export function totp(secret, step = Math.floor(Date.now() / 30000)) {
  const bits = [...secret].map((c) => alphabet.indexOf(c).toString(2).padStart(5, '0')).join('');
  const key = Buffer.from(bits.match(/.{8}/g).map((part) => parseInt(part, 2)));
  const count = Buffer.alloc(8);
  count.writeBigUInt64BE(BigInt(step));
  const hash = createHmac('sha1', key).update(count).digest();
  const offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
export function matchingStep(secret, code, last = -1, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30000);
  for (const step of [current, current - 1, current + 1]) {
    if (step > Number(last) && timingSafeEqual(Buffer.from(totp(secret, step)), Buffer.from(code)))
      return step;
  }
  return null;
}
// Caller must lock the user row so a TOTP step or recovery code cannot be consumed twice.
export async function checkSecondFactor(db, user, code, key) {
  if (!user.mfa_secret) return;
  const step = matchingStep(unseal(user.mfa_secret, key), code, user.mfa_last_step);
  if (step !== null) {
    await db.query('UPDATE venue_app.users SET mfa_last_step=$1 WHERE id=$2', [step, user.id]);
    return;
  }
  const hash = digest(code.toUpperCase());
  const hashes = user.recovery_hashes || [];
  if (hashes.includes(hash)) {
    await db.query('UPDATE venue_app.users SET recovery_hashes=$1 WHERE id=$2', [
      JSON.stringify(hashes.filter((v) => v !== hash)),
      user.id,
    ]);
    return;
  }
  throw new HttpError(401, 'Enter a valid authenticator or unused recovery code.');
}
export function pagination(query, defaultLimit = 50) {
  const limit = query.limit === undefined ? defaultLimit : Number(query.limit);
  const page = query.page === undefined ? 1 : Number(query.page);
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 200 ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 1000000
  )
    throw new HttpError(400, 'Choose a valid page and a page size from 1 to 200.');
  return { limit, page, offset: (page - 1) * limit };
}
export function csv(rows, columns) {
  const cell = (value) => {
    let text = String(value ?? '');
    if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return [
    columns.map((c) => cell(c.label)).join(','),
    ...rows.map((row) => columns.map((c) => cell(row[c.key])).join(',')),
  ].join('\r\n');
}
