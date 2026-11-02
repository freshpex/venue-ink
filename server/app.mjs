import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { z } from "zod";
export const migration = `CREATE TABLE IF NOT EXISTS workspace_users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'artist', session_version INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS workspace_ideas (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES workspace_users(id) ON DELETE CASCADE, title TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP); CREATE INDEX IF NOT EXISTS workspace_ideas_user_idx ON workspace_ideas(user_id);`;
const credentials = z.object({
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(12).max(128),
});
const signup = credentials.extend({ name: z.string().trim().min(2).max(100) });
const ideaSchema = z
  .object({ title: z.string().trim().min(1).max(200) })
  .strict();
const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
});
export function createApp({
  pool,
  secret,
  origins,
  production = false,
  limit = 20,
}) {
  if (!secret || secret.length < 32)
    throw new Error("JWT_SECRET must contain at least 32 characters");
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) =>
        callback(null, !origin || origins.includes(origin)),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "12kb" }));
  app.use(cookieParser());
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  const cookieOptions = {
    httpOnly: true,
    secure: production,
    sameSite: production ? "none" : "lax",
    path: "/api",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
  app.get("/api/health", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ ready: true, service: "venue-preview-workspace" });
    } catch {
      res
        .status(503)
        .json({ ready: false, message: "Database is not ready yet." });
    }
  });
  app.use("/api", (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (
      req.get("X-Requested-With") !== "VenueWorkspace" ||
      !origins.includes(req.get("Origin") || "")
    )
      return res
        .status(403)
        .json({ message: "Request origin is not allowed." });
    next();
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      message: "Too many sign-in attempts. Please wait before trying again.",
    },
  });
  const writeLimiter = rateLimit({
    windowMs: 60000,
    limit: 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Please wait a moment before saving more changes." },
  });
  const issue = (res, user) =>
    res.cookie(
      "venue_workspace",
      jwt.sign({ sub: user.id, sv: user.session_version }, secret, {
        expiresIn: "7d",
        issuer: "venue-preview",
        audience: "workspace",
      }),
      cookieOptions,
    );
  const dummyHash = bcrypt.hashSync("dummy-password-never-used-7654", 12);
  app.post("/api/auth/register", authLimiter, async (req, res) => {
    const parsed = signup.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        message:
          "Enter a name, valid email and a password of 12–128 characters.",
      });
    const { name, email, password } = parsed.data;
    try {
      const hash = await bcrypt.hash(password, 12);
      const id = randomUUID();
      const result = await pool.query(
        "INSERT INTO workspace_users(id,email,name,password_hash) VALUES($1,$2,$3,$4) RETURNING *",
        [id, email, name, hash],
      );
      const user = result.rows[0];
      issue(res, user);
      res.status(201).json({ user: publicUser(user) });
    } catch (error) {
      if (error.code === "23505")
        return res.status(409).json({
          message:
            "An account could not be created with these details. Try signing in.",
        });
      throw error;
    }
  });
  app.post("/api/auth/login", authLimiter, async (req, res) => {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ message: "Enter a valid email and password." });
    const result = await pool.query(
      "SELECT * FROM workspace_users WHERE email=$1",
      [parsed.data.email],
    );
    const user = result.rows[0];
    const valid = await bcrypt.compare(
      parsed.data.password,
      user?.password_hash || dummyHash,
    );
    if (!user || !valid)
      return res
        .status(401)
        .json({ message: "The email or password is incorrect." });
    issue(res, user);
    res.json({ user: publicUser(user) });
  });
  app.use("/api", async (req, res, next) => {
    try {
      const token = req.cookies.venue_workspace;
      if (!token)
        return res
          .status(401)
          .json({ message: "Sign in to your preview workspace." });
      const claims = jwt.verify(token, secret, {
        issuer: "venue-preview",
        audience: "workspace",
        algorithms: ["HS256"],
      });
      const result = await pool.query(
        "SELECT * FROM workspace_users WHERE id=$1",
        [claims.sub],
      );
      const user = result.rows[0];
      if (!user || user.session_version !== claims.sv)
        return res
          .status(401)
          .json({ message: "Your session has ended. Please sign in again." });
      req.user = user;
      next();
    } catch (error) {
      if (
        error.name === "JsonWebTokenError" ||
        error.name === "TokenExpiredError"
      )
        return res
          .status(401)
          .json({ message: "Your session has ended. Please sign in again." });
      next(error);
    }
  });
  app.get("/api/auth/me", (req, res) =>
    res.json({ user: publicUser(req.user) }),
  );
  app.post("/api/auth/logout", async (req, res) => {
    await pool.query(
      "UPDATE workspace_users SET session_version=session_version+1 WHERE id=$1",
      [req.user.id],
    );
    res.clearCookie("venue_workspace", { ...cookieOptions, maxAge: undefined });
    res.json({ ok: true });
  });
  app.get("/api/ideas", async (req, res) => {
    const result = await pool.query(
      "SELECT id,title,created_at FROM workspace_ideas WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200",
      [req.user.id],
    );
    res.json({ ideas: result.rows });
  });
  app.post("/api/ideas", writeLimiter, async (req, res) => {
    const parsed = ideaSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ message: "Enter an idea title between 1 and 200 characters." });
    const count = await pool.query(
      "SELECT COUNT(*) AS total FROM workspace_ideas WHERE user_id=$1",
      [req.user.id],
    );
    if (Number(count.rows[0].total) >= 200)
      return res.status(409).json({
        message:
          "Your workspace has 200 ideas. Remove one before adding another.",
      });
    const result = await pool.query(
      "INSERT INTO workspace_ideas(id,user_id,title) VALUES($1,$2,$3) RETURNING id,title,created_at",
      [randomUUID(), req.user.id, parsed.data.title],
    );
    res.status(201).json({ idea: result.rows[0] });
  });
  app.delete("/api/ideas/:id", writeLimiter, async (req, res) => {
    const result = await pool.query(
      "DELETE FROM workspace_ideas WHERE id=$1 AND user_id=$2 RETURNING id",
      [req.params.id, req.user.id],
    );
    if (!result.rowCount)
      return res.status(404).json({ message: "Idea not found." });
    res.json({ ok: true });
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ message: "API route not found." }),
  );
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === "entity.too.large")
      return res.status(413).json({ message: "This request is too large." });
    if (error.type === "entity.parse.failed")
      return res.status(400).json({ message: "Invalid JSON request." });
    console.error("API operation failed:", error.code || error.name);
    res.status(503).json({
      message: "The workspace is temporarily unavailable. Please try again.",
    });
  });
  return app;
}
