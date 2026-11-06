import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export function createProfileStorage(env = process.env) {
  return { provider: 'database', bucket: env.PROFILE_STORAGE_BUCKET || 'profile' };
}

export async function verifyProfileStorage(storage, pool) {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    const ownerId = randomUUID(),
      assetId = randomUUID();
    const bytes = await readFile(new URL('./assets/profile-storage-probe.jpg', import.meta.url));
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
    return { provider: 'postgresql', bucket: storage.bucket, writeReadDeleteVerified: true };
  } finally {
    try {
      await client.query('ROLLBACK');
    } catch {
      discard = true;
    }
    client.release(discard ? new Error('Profile verification connection interrupted') : undefined);
  }
}
