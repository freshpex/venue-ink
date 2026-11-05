import { it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createPool } from '../server/db.mjs';

// The advisory lock test is restricted to the disposable database runner.
it.skipIf(process.env.VENUE_ISOLATED_TESTS !== 'true')(
  'opens PORT during a blocked migration, keeps APIs unavailable until ready, and shuts down cleanly',
  async () => {
    const socket = createServer();
    await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
    const port = socket.address().port;
    await new Promise((resolve) => socket.close(resolve));
    const pool = createPool();
    const lock = await pool.connect();
    let child;
    let exited;
    try {
      await lock.query('SELECT pg_advisory_lock($1)', [7912055]);
      child = spawn(process.execPath, ['server/start.mjs'], {
        env: { ...process.env, PORT: String(port), NODE_ENV: 'test', WORKER_ENABLED: 'false' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      exited = new Promise((resolve) => child.once('exit', (code) => resolve(code)));
      const listening = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Server did not open PORT')), 10000);
        child.once('error', reject);
        child.stdout.on('data', (chunk) => {
          if (chunk.toString().includes('Venue HTTP server is listening')) {
            clearTimeout(timer);
            resolve();
          }
        });
        child.once('exit', () => {
          clearTimeout(timer);
          reject(new Error('Server exited before opening PORT'));
        });
      });
      await listening;
      const config = await fetch(`http://127.0.0.1:${port}/venue-config.js`);
      expect(config.headers.get('cache-control')).toBe('no-store');
      expect(await config.text()).toBe('window.__VENUE_CONFIG__={"apiBase":"","appOrigin":""};');
      const base = `http://127.0.0.1:${port}/api`;
      const live = await fetch(base + '/health/live');
      expect(live.status).toBe(200);
      for (const path of ['/health', '/auth/me', '/artists']) {
        const response = await fetch(base + path);
        expect(response.status).toBe(503);
        expect(response.headers.get('retry-after')).toBe('3');
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect((await response.json()).ready).toBe(false);
      }
      const ready = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Server did not become ready')), 10000);
        child.stdout.on('data', (chunk) => {
          if (chunk.toString().includes('Venue API is ready.')) {
            clearTimeout(timer);
            resolve();
          }
        });
      });
      await lock.query('SELECT pg_advisory_unlock($1)', [7912055]);
      await ready;
      expect((await fetch(base + '/health')).status).toBe(200);
      expect((await fetch(base + '/auth/me')).status).toBe(401);
      child.kill('SIGTERM');
      await expect(exited).resolves.toBe(0);
    } finally {
      child?.kill('SIGKILL');
      await exited;
      await lock.query('SELECT pg_advisory_unlock($1)', [7912055]);
      lock.release();
      await pool.end();
    }
  },
);
