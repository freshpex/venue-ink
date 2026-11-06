import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { transaction } from './db.mjs';
import { HttpError } from './validation.mjs';

export function createAssetStorage(env = process.env, client) {
  const bucket = env.PROFILE_STORAGE_BUCKET || 'profile';
  const fields = ['AWS_ENDPOINT_URL_S3', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];
  if (!fields.some((key) => env[key])) return { provider: 'database', bucket };
  for (const key of fields)
    if (!env[key]?.trim()) throw new Error(`${key} is required for image storage.`);
  let endpoint;
  try {
    endpoint = new URL(env.AWS_ENDPOINT_URL_S3.trim().replace(/^https\\:/, 'https:'));
    if (
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash ||
      endpoint.pathname !== '/' ||
      (endpoint.protocol !== 'https:' &&
        !(
          env.NODE_ENV === 'test' &&
          endpoint.protocol === 'http:' &&
          endpoint.hostname === '127.0.0.1'
        ))
    )
      throw new Error();
  } catch {
    throw new Error('AWS_ENDPOINT_URL_S3 must be a valid HTTPS storage origin.');
  }
  const s3 =
    client ||
    new S3Client({
      endpoint: endpoint.origin,
      region: env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID.trim(),
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY.trim(),
      },
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      requestHandler: { connectionTimeout: 5000, requestTimeout: 20000 },
      maxAttempts: 3,
    });
  return {
    provider: 's3',
    bucket,
    async put(key, bytes, mimeType, targetBucket = bucket) {
      await s3.send(
        new PutObjectCommand({
          Bucket: targetBucket,
          Key: key,
          Body: bytes,
          ContentLength: bytes.length,
          ContentType: mimeType,
        }),
      );
    },
    async get(key, targetBucket = bucket) {
      const response = await s3.send(new GetObjectCommand({ Bucket: targetBucket, Key: key }));
      if (!response.Body) throw new Error('Image body is missing.');
      return Buffer.from(await response.Body.transformToByteArray());
    },
    async remove(key, targetBucket = bucket) {
      await s3.send(new DeleteObjectCommand({ Bucket: targetBucket, Key: key }));
    },
  };
}

export async function persistAsset(pool, storage, asset, finalize = async () => {}) {
  const { id, ownerId, bytes, mimeType } = asset;
  const key = `images/${ownerId}/${id}`;
  const external = storage.provider === 's3';
  try {
    if (external) await storage.put(key, bytes, mimeType);
    await transaction(pool, async (db) => {
      await db.query('SELECT id FROM venue_app.users WHERE id=$1 FOR UPDATE', [ownerId]);
      const usage = Number(
        (
          await db.query(
            'SELECT COALESCE(sum(byte_size),0) AS bytes FROM venue_app.assets WHERE owner_id=$1',
            [ownerId],
          )
        ).rows[0].bytes,
      );
      if (usage + bytes.length > 40 * 1024 * 1024)
        throw new HttpError(
          409,
          'This account’s image storage is full. Remove unused images before uploading more.',
        );
      await db.query(
        'INSERT INTO venue_app.assets(id,owner_id,mime_type,filename,byte_size,data,public,bucket,storage_provider,storage_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [
          id,
          ownerId,
          mimeType,
          asset.filename.replace(/[^a-zA-Z0-9._ -]/g, '').slice(0, 150) || 'image',
          bytes.length,
          external ? null : bytes,
          !!asset.public,
          storage.bucket,
          storage.provider,
          external ? key : null,
        ],
      );
      await finalize(db);
    });
  } catch (error) {
    if (external) {
      // Delay compensation so a lost COMMIT response cannot delete a saved image.
      // The cleanup worker checks for a committed asset again before deleting.
      try {
        await pool.query(
          "INSERT INTO venue_app.asset_object_deletions(bucket,storage_key,next_attempt_at) SELECT $1,$2,now()+interval '1 hour' WHERE NOT EXISTS(SELECT 1 FROM venue_app.assets WHERE storage_provider='s3' AND bucket=$1 AND storage_key=$2) ON CONFLICT DO NOTHING",
          [storage.bucket, key],
        );
      } catch {
        /* Preserve the original failure when the database is unavailable. */
      }
    }
    throw error;
  }
}

export async function readAsset(pool, storage, asset) {
  if (asset.storage_provider === 's3') {
    if (storage.provider !== 's3')
      throw new HttpError(503, 'Images are temporarily unavailable. Please try again.');
    const bytes = await storage.get(asset.storage_key, asset.bucket);
    if (bytes.length !== asset.byte_size) throw new Error('Image size verification failed.');
    return bytes;
  }
  const row = (await pool.query('SELECT data FROM venue_app.assets WHERE id=$1', [asset.id]))
    .rows[0];
  if (!row?.data) throw new HttpError(404, 'Image not found.');
  return row.data;
}

export async function drainAssetDeletions(pool, storage) {
  if (storage.provider !== 's3') return;
  const jobs = (
    await pool.query(
      'SELECT id,bucket,storage_key FROM venue_app.asset_object_deletions WHERE next_attempt_at<=now() ORDER BY next_attempt_at LIMIT 20',
    )
  ).rows;
  for (const job of jobs) {
    try {
      if (
        !(
          await pool.query(
            "SELECT 1 FROM venue_app.assets WHERE storage_provider='s3' AND bucket=$1 AND storage_key=$2",
            [job.bucket, job.storage_key],
          )
        ).rowCount
      )
        await storage.remove(job.storage_key, job.bucket);
      await pool.query('DELETE FROM venue_app.asset_object_deletions WHERE id=$1', [job.id]);
    } catch {
      await pool.query(
        "UPDATE venue_app.asset_object_deletions SET attempts=attempts+1,next_attempt_at=now()+interval '1 minute'*LEAST(60,power(2,LEAST(attempts,6))::int) WHERE id=$1",
        [job.id],
      );
    }
  }
}

export function startAssetCleanup(pool, storage) {
  let stopped = false,
    timer,
    running = Promise.resolve();
  function tick() {
    running = drainAssetDeletions(pool, storage)
      .catch(() => {
        console.error('Image cleanup will retry.');
      })
      .finally(() => {
        if (!stopped) {
          timer = setTimeout(tick, 30000);
          timer.unref();
        }
      });
  }
  if (storage.provider === 's3') tick();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await running;
  };
}
