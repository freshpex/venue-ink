# Venue Ink: More ink. Less admin.

An independent React/TypeScript redesign concept for Venue’s artist and studio booking platform. Includes a multipage editorial site, 20 licensed stock photographs, interactive examples and a separate Node.js/PostgreSQL preview workspace.

## Run locally

Requirements: Node 22.14+ and npm. Install once with `npm ci`, then `npm run dev` (http://localhost:5173). The public site and local demos do not require a backend.

For the private preview workspace, create a PostgreSQL database and copy `.env.example` to `.env`. Set `DATABASE_URL`, a random `JWT_SECRET` of at least 32 characters and `CLIENT_ORIGINS`. Run `npm run dev:server` in another terminal. Vite proxies `/api` to port 3001. The server creates its two namespaced tables and index idempotently at startup. No production Venue tables are accessed.

## Scripts

| Command              | Purpose                                                                    |
| -------------------- | -------------------------------------------------------------------------- |
| `npm run dev`        | Vite frontend                                                              |
| `npm run dev:server` | Node API with watch                                                        |
| `npm run build`      | Strict TypeScript, production Vite bundle, route metadata/static fallbacks |
| `npm run preview`    | Serve production frontend                                                  |
| `npm start`          | Node API                                                                   |
| `npm run lint`       | ESLint                                                                     |
| `npm test`           | Fee calculations, server readiness and API/security tests                  |
| `npm run test:e2e`   | Chromium, Firefox, WebKit journeys and responsive checks                   |

Install test browsers using `npx playwright install chromium firefox webkit` if not present. Tests use one worker. Do not run package installation and other npm tasks concurrently on this Windows checkout.

## What works

- Home, artist, studio, feature, booking, flash, artist website, payment, pricing, mobile app, service, about, journal, article, help, contact, onboarding, credits, demo, workspace and 404 routes.
- Five-step example booking, in-memory image previews, validation and collision checks. Only the fictional request summary persists locally; example contact details and reference files are not persisted.
- Calendar month/day navigation, team filtering, request approval/decline, local messaging and collection selection. Reset clears local requests.
- Flash search/category filtering, saving preferences during the session, keyboard dismissible lightbox and navigation.
- Three artist-page visual themes, published-plan fee estimator, journal search/filter and searchable FAQs.
- Contact validates inputs and prepares an email draft. It never claims the message was sent.
- Separate workspace authentication, bcrypt password hashes, HttpOnly signed cookies, session revocation on logout, allowlisted origins, CSRF request header, rate limiting, private idea creation/list/delete and parameterized database queries.
- Cold start: health polling for up to 150 seconds before sending login once. Button states explain connection progress; cancellation and retries preserve entered details. Every password field has an eye control.

## Render deployment

Use `render.yaml` as a Blueprint with this directory at the repository root. If the repository root is the parent `tatoos` directory, set `rootDir: venue-ink` for both services. Choose a **persistent external PostgreSQL database** and set `DATABASE_URL`; never store user records on the free service filesystem. The blueprint deliberately does not create a short-lived free database.

1. Set API `CLIENT_ORIGINS` to the exact HTTPS frontend origin (comma-separated if needed; no trailing slash).
2. Set frontend `VITE_API_URL` to the API’s HTTPS Render URL and rebuild. The API secret stays server-side.
3. The API listens on Render’s `PORT`, binds `0.0.0.0`, checks `/api/health`, retries initial database connection and shuts down gracefully.
4. Verify registration, login, cookies and private records on the deployed origins. Cross-site cookies may be blocked by browser privacy settings; use same-site custom subdomains or a reverse proxy for reliable production sessions. Never put JWTs into localStorage as a workaround.
5. Free Render services sleep after inactivity; the UI tolerates ordinary wake-up delays, but cannot guarantee provider uptime. See [Render free-service limitations](https://render.com/docs/free).

The private Sites preview hosts the static frontend only. The Node API must be deployed separately to Render, then its URL supplied at build time. No Render credentials or database service were provided during implementation. The marketing site and examples remain usable without them; private workspace authentication will show a clear connection error until configured.

## Architecture and boundaries

Feature folders contain the booking wizard and shared demo state. Radix provides focus-managed dialogs/accordions; the shadcn-style Button uses CVA/Slot and shared tokens. Motion handles coordinated animations; Embla handles touch-friendly stories; Zustand persists fictional requests; React Hook Form/Zod validates forms; TanStack Query manages authenticated asynchronous state; Sonner supplies honest feedback. No unnecessary GSAP/Lenis/Lottie runtime is loaded for effects already handled by Motion/CSS.

The app preserves verified external Venue actions, not an unavailable production integration. No payment endpoint, fake checkout, live stock inventory, unauthorized testimonial or automatic newsletter subscription was introduced. Only official links can reach real Venue records.

See [discovery and source audit](docs/DISCOVERY.md), [photography licensing](docs/PHOTOGRAPHY.md) and [verification report](docs/VERIFICATION.md). The public image manifest lives at `src/data/image-manifest.json`. The concept remains noindex; authorized production release needs final legal/content review, live provider integration and full SEO prerendering.
