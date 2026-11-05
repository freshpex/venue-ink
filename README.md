# Venue platform

React 19, TypeScript, Vite, Tailwind, Motion, Radix, TanStack Query and an Express 5 / Neon PostgreSQL backend. Public photography is licensed and documented in `docs/PHOTOGRAPHY.md` and `src/data/image-manifest.json`.

## Local development

Use Node 22.14 or newer. Run `npm ci`. Copy `.env.example` to `.env` and set the database URL, a random JWT secret of at least 32 characters, initial administrator email and password. Never commit `.env`.

Run `npm run db:setup` to apply migrations and seed. Setup affects only `venue_app`; it preserves other database tables. Existing administrator passwords are never reset by seeding. Run `npm run dev:server` and `npm run dev` in separate terminals. Open http://localhost:5173. Vite forwards `/api` to port 3001.

For a production build, run `npm run build`. Set `NODE_ENV=production`, `CLIENT_ORIGINS` to the exact HTTPS origin and `SITE_URL` to the public HTTPS URL; then `npm start` serves both the site and API. Set environment variables in the hosting service, not in source. Development uses ports 5173 and 3001. Production uses the host's `PORT`.

## Workflows

- Client, artist and studio registration; secure HttpOnly sessions; password changes; per-device and all-device session revocation; authenticator MFA and recovery codes.
- Published artist/studio pages, themes, service menu, availability and original artwork uploads.
- Booking requests with private references, timezone-aware slots, review, conflict-protected confirmation, rescheduling, cancellation and completion.
- Persisted booking conversations, notifications, saved artwork and personal ideas.
- Studio invitations, service management and event booking with capacity controls.
- Dedicated administration overview with platform counts, account creation for every role, named studio assignment, public artist name editing and publishing controls. Studio owners manage studios and teams; artist tools are shown to artists, with studio management available when they own a studio.
- Support enquiries, admin replies, account restrictions/roles, journal publishing, settings and an activity log with readable record names.

Uploaded images are compressed in the browser and stored durably in PostgreSQL (2 MB per image, 40 MB per user). Reference images are private; publishing a profile photograph or flash image makes that image public. The application does not use ephemeral Render disk for uploads.

## Verification

Run `npm run format`, `npm run format:check`, `npm run lint`, `npm test`, `npm run build` and `npm run test:e2e`. API integration tests use temporary accounts and records in the configured application schema and remove only their own records.

## Administration and enterprise operations

Administrators use **Accounts & access → Create an account** for clients, artists, studio owners and administrators. Artists can join an existing studio or receive a new one. Studio owners receive a studio without becoming a bookable artist automatically. New admin-created profiles and studios start unpublished. Use Artists to review public names and open books, Studios to publish the studio and Services to set its menu. The artist sets working hours.

Run `npm run test:local` for the API/security suites against disposable real PostgreSQL without using configured databases or providers. Run `npm run build`, then `npm run test:local -- --e2e --project=chromium` for browser workflows. CI executes those checks plus lint and a production dependency audit.
