try {
  process.loadEnvFile('.env');
} catch {
  /* CI provides its environment. */
}
process.env.PORT = '4173';
process.env.NODE_ENV = 'test';
process.env.SERVE_DIST = 'true';
process.env.SECURITY_HEADERS='true';
process.env.CLIENT_ORIGINS = 'http://127.0.0.1:4173,http://localhost:4173';
await import('../server/start.mjs');
