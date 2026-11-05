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
- Dedicated administration overview with platform counts, account creation for every role, named studio assignment, public artist name editing and publishing controls. Studio owners manage studios and teams; artist tools are shown to artists, with studio management available when they own a studio.
- Support enquiries, admin replies, account restrictions/roles, journal publishing, settings and an activity log with readable record names.

Uploaded images are compressed in the browser and stored durably in PostgreSQL (2 MB per image, 40 MB per user). Reference images are private; publishing a profile photograph or flash image makes that image public. The application does not use ephemeral Render disk for uploads.

## Verification

Run `npm run format`, `npm run format:check`, `npm run lint`, `npm test`, `npm run build` and `npm run test:e2e`. API integration tests use temporary accounts and records in the configured application schema and remove only their own records.

## Administration and remaining enterprise work

Administrators use **Accounts & access → Create an account** for clients, artists, studio owners and other administrators. Artists can join an existing studio or receive a new one. Studio owners receive a studio without becoming a bookable artist automatically. Initial passwords must be shared privately; the owner can change them in My account. Creating another account preserves the administrator's session.

New admin-created artist profiles and studios start unpublished; books start closed. Use **Artists** to review the public name and visibility, **Studios** to publish the studio, and **Services** to set its menu. The artist sets working hours in their own workspace. Booking requires published profiles, an active service and availability. Existing test-looking display names are stored data: review and rename or unpublish them under Artists rather than inventing real identities or deleting associated bookings.

This is an operational foundation, not a complete enterprise platform. Material remaining work includes SSO/MFA and verified-email recovery; fine-grained team permissions beyond the four account roles; automated transactional email and reminders; a payment provider with webhooks/refunds and financial reconciliation (current payments are manually verified enquiries); paginated reporting beyond existing collection limits; and production monitoring, backup/restore verification and retention controls. These require implementation and environment-specific verification before enterprise readiness can be claimed.

The isolated admin API suite can run without the configured database:
`npx vitest run tests/admin.test.mjs tests/connection.test.ts tests/transaction.test.mjs`.
It checks authorization, account provisioning for each role, named studio assignment, publishing restrictions and session protections against an in-memory PostgreSQL adapter. The full API suite still requires PostgreSQL and browser tests require Playwright browsers.
