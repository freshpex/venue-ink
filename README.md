# Venue platform

React 19, TypeScript, Vite, Tailwind, Motion, Radix, TanStack Query and an Express 5 / Neon PostgreSQL backend. Public photography is licensed and documented in `docs/PHOTOGRAPHY.md` and `src/data/image-manifest.json`.

## Local development

Use Node 22.14 or newer. Run `npm ci`. Copy `.env.example` to `.env` and set the database URL, a random JWT secret of at least 32 characters, initial administrator email and password. Never commit `.env`.

Run `npm run db:setup` to apply migrations and seed. Setup affects only `venue_app`; it preserves other database tables. Existing administrator passwords are never reset by seeding. Run `npm run dev:server` and `npm run dev` in separate terminals. Open http://localhost:5173. Vite forwards `/api` to port 3001.

For a production build, run `npm run build`. Set `NODE_ENV=production`, `CLIENT_ORIGINS` to the exact HTTPS origin and `SITE_URL` to the public HTTPS URL; then `npm start` serves both the site and API. Set environment variables in the hosting service, not in source. Development uses ports 5173 and 3001. Production uses the host's `PORT`.

## Workflows

- Client, artist and studio registration; secure HttpOnly sessions; password visibility controls; password changes; session revocation.
- Published artist/studio pages, themes, service menu, availability and original artwork uploads.
- Booking requests with private references, timezone-aware slots, review, conflict-protected confirmation, rescheduling, cancellation and completion.
- Persisted booking conversations, notifications, saved artwork and personal ideas.
- Studio invitations, service management and event booking with capacity controls.
- Checkout saves a payment enquiry and opens email to `payment@venue.com`. Methods: Western Union, MoneyGram, Bank Transfer, IBAN Bank Transfer, Apple Pay, PayPal, Apple iTunes and Cryptocurrency (BTC / ETH / USDT). Payment remains requested until staff verify receipt. No card or wallet credentials are collected.
- Support enquiries, admin replies, account restrictions/roles, journal publishing, settings and an activity log.

Uploaded images are compressed in the browser and stored durably in PostgreSQL (2 MB per image, 40 MB per user). Reference images are private; publishing a profile photograph or flash image makes that image public. The application does not use ephemeral Render disk for uploads.

## Render

Connect this folder's repository to Render using `render.yaml`. The blueprint defines one free Node web service for the frontend and API, avoiding cross-site cookie restrictions. Set `DATABASE_URL`, `CLIENT_ORIGINS`, `SITE_URL`, `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in Render. Use the assigned Render HTTPS URL for both origin variables. `VITE_API_URL` stays empty for this same-origin setup. The blueprint generates a JWT secret. Change the initial admin password from the account screen after first sign-in.

Startup applies tracked migrations using a direct Neon connection and an advisory lock, retries transient failures, then serves readiness at `/api/health`. Login retains entered details, displays connection progress and waits up to 150 seconds while a free Render service starts. It supports cancellation and retry. Database health remains independent of browser rendering.

The repository includes deployment configuration. A hosted deployment still requires the owner's Render account and environment configuration.

## Verification

Run `npm run format`, `npm run format:check`, `npm run lint`, `npm test`, `npm run build` and `npm run test:e2e`. API integration tests use temporary accounts and records in the configured application schema and remove only their own records. They do not reset the database. Chromium, Firefox and WebKit browser projects cover public routes, mobile layouts, authentication and real booking/payment flows. Actual results are recorded in `docs/IMPLEMENTATION_STATUS.md`.
