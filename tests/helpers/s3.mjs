import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

export async function s3Fixture() {
  const objects = new Map(),
    requests = [];
  const failures = new Set();
  const accessKey = randomBytes(12).toString('hex');
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    requests.push({
      method: req.method,
      path,
      contentType: req.headers['content-type'],
      acl: req.headers['x-amz-acl'],
    });
    if (!req.headers.authorization?.startsWith(`AWS4-HMAC-SHA256 Credential=${accessKey}/`)) {
      res.writeHead(403);
      return res.end('<Error><Code>AccessDenied</Code></Error>');
    }
    if (failures.has(req.method)) {
      res.writeHead(503);
      return res.end('<Error><Code>ServiceUnavailable</Code></Error>');
    }
    if (req.method === 'PUT') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      objects.set(path, Buffer.concat(chunks));
      res.writeHead(200, { ETag: '"fixture"' });
      return res.end();
    }
    if (req.method === 'GET' && objects.has(path)) {
      const bytes = objects.get(path);
      res.writeHead(200, { 'Content-Length': bytes.length, 'Content-Type': 'image/webp' });
      return res.end(bytes);
    }
    if (req.method === 'DELETE') {
      objects.delete(path);
      res.writeHead(204);
      return res.end();
    }
    res.writeHead(404);
    res.end('<Error><Code>NoSuchKey</Code></Error>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    objects,
    requests,
    failures,
    env: {
      NODE_ENV: 'test',
      AWS_ENDPOINT_URL_S3: `http://127.0.0.1:${server.address().port}`,
      AWS_ACCESS_KEY_ID: accessKey,
      AWS_SECRET_ACCESS_KEY: randomBytes(24).toString('hex'),
      AWS_REGION: 'us-east-1',
      PROFILE_STORAGE_BUCKET: 'profile',
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
