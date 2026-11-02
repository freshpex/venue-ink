import pg from "pg";
import { createApp, migration } from "./app.mjs";
const { Pool } = pg;
if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
  console.error("DATABASE_URL and JWT_SECRET are required. See .env.example.");
  process.exit(1);
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
});
pool.on("error", (error) =>
  console.error("Idle database connection failed:", error.code || error.name),
);
const origins = (
  process.env.CLIENT_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (
  process.env.NODE_ENV === "production" &&
  (!process.env.CLIENT_ORIGINS ||
    origins.some((o) => !o.startsWith("https://")))
) {
  console.error("Production requires explicit HTTPS CLIENT_ORIGINS.");
  process.exit(1);
}
let migrated = false;
for (let attempt = 1; attempt <= 5; attempt++) {
  try {
    await pool.query(migration);
    migrated = true;
    break;
  } catch (error) {
    console.error(
      `Database startup attempt ${attempt}/5 failed:`,
      error.code || error.name,
    );
    if (attempt < 5)
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(attempt * 2000, 10000)),
      );
  }
}
if (!migrated) {
  console.error(
    "Database unavailable after startup retries. Exiting for host restart.",
  );
  await pool.end();
  process.exit(1);
}
const app = createApp({
  pool,
  secret: process.env.JWT_SECRET,
  origins,
  production: process.env.NODE_ENV === "production",
});
const server = app.listen(Number(process.env.PORT) || 3001, "0.0.0.0", () =>
  console.log("Venue preview workspace API is listening."),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
