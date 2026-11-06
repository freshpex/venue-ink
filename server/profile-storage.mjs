import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createAssetStorage } from './asset-storage.mjs';

export function createProfileStorage(env = process.env) {
  return createAssetStorage(env);
}

export async function verifyProfileStorage(storage, pool) {
  const bytes = await readFile(new URL('./assets/profile-storage-probe.jpg', import.meta.url));
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    const ownerId = randomUUID(),
      assetId = randomUUID();
    await client.query(
      "INSERT INTO venue_app.users(id,email,name,password_hash,role,active) VALUES($1,$2,'Storage verification','disabled-storage-probe','client',false)",
      [ownerId, 'storage-check-' + ownerId + '@venue.invalid'],
    );
    await client.query(
      'INSERT INTO venue_app.assets(id,owner_id,mime_type,filename,byte_size,data,public,bucket) VALUES($1,$2,$3,$4,$5,$6,false,$7)',
      [
        assetId,
        ownerId,
        'image/jpeg',
        'profile-storage-probe.jpg',
        bytes.length,
        bytes,
        storage.bucket,
      ],
    );
    const saved = (
      await client.query('SELECT data,bucket FROM venue_app.assets WHERE id=$1 AND owner_id=$2', [
        assetId,
        ownerId,
      ])
    ).rows[0];
    if (!saved?.data.equals(bytes) || saved.bucket !== storage.bucket)
      throw new Error('Profile image storage verification failed.');
    const changed = await client.query(
      "UPDATE venue_app.assets SET filename='profile-storage-verified.jpg' WHERE id=$1 RETURNING id",
      [assetId],
    );
    const removed = await client.query('DELETE FROM venue_app.assets WHERE id=$1 RETURNING id', [
      assetId,
    ]);
    if (changed.rowCount !== 1 || removed.rowCount !== 1)
      throw new Error('Profile image storage lifecycle verification failed.');
    await client.query('DELETE FROM venue_app.users WHERE id=$1', [ownerId]);
  } finally {
    try {
      await client.query('ROLLBACK');
    } catch {
      discard = true;
    }
    client.release(discard ? new Error('Profile verification connection interrupted') : undefined);
  }
  if (storage.provider === 's3') {
    const key = `verification/${randomUUID()}.jpg`;
    try {
      await storage.put(key, bytes, 'image/jpeg');
      if (!(await storage.get(key)).equals(bytes))
        throw new Error('Object storage read verification failed.');
      await storage.put(key, bytes, 'image/jpeg');
    } finally {
      await storage.remove(key);
    }
  }
  return {
    provider: storage.provider === 's3' ? 's3' : 'postgresql',
    bucket: storage.bucket,
    writeReadDeleteVerified: true,
  };
}
