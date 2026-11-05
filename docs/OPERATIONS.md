# Venue operations

## Deployment and configuration

Deploy the `dev` branch only after CI passes. Startup applies forward migrations under a PostgreSQL advisory lock. Migration 0001 adds the enterprise tables without deleting existing business records. The session format changes: existing browser sessions must sign in again after deployment.

Use Node 22+, PostgreSQL, an HTTPS public origin, and an always-running application process. A sleeping free hosting tier cannot provide timely background reminders. The checked-in Render blueprint enables staff MFA; existing staff are directed to Security to enroll before accessing their workspace.

Configure secrets in the host's secret manager, never in source:

| Variable                                        | Purpose                                                                                             |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| DATABASE_URL                                    | Application connection, ideally with a least-privileged database role                               |
| DATABASE_URL_UNPOOLED                           | Migration connection with schema-owner privileges                                                   |
| JWT_SECRET                                      | Random session signing secret, at least 32 characters                                               |
| DATA_ENCRYPTION_KEY                             | Independent random key, at least 32 characters, stable across deployments                           |
| CLIENT_ORIGINS                                  | Exact allowed HTTPS frontend origins                                                                |
| SITE_URL                                        | Canonical public HTTPS origin; SSO uses a same-origin API callback                                  |
| REQUIRE_STAFF_MFA                               | Set `true` to require enrollment before staff operations                                            |
| RESEND_API_KEY, MAIL_FROM                       | Transactional email provider and a verified sender                                                  |
| STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET        | Hosted card payments and authenticated webhooks; both are required                                  |
| OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET | Trusted organization identity provider                                                              |
| OIDC_ALLOWED_DOMAINS                            | Optional comma-separated domain restriction in addition to verified provider email                  |
| WORKER_ENABLED                                  | Defaults to enabled outside tests; set false only when another application instance runs the worker |

Preserve DATA_ENCRYPTION_KEY in an independently backed-up secret manager. Rotating JWT_SECRET signs everyone out; rotating the data key without re-encrypting MFA and queued email makes them unreadable. The application deliberately requires an explicit data key in production.

## Email and reminders

Verify the sender domain with Resend, configure both mail variables, then check Admin → Operations. A heartbeat should update at least once per minute. A missing provider leaves messages pending; it never reports them sent. Test a verification email, reset email, booking update and next-day reminder using dedicated staging accounts before enabling production delivery.

The worker claims jobs with PostgreSQL row locks and leases, retries with exponential backoff, and uses the same provider idempotency key for retries. Delivery is at least once; provider idempotency protects duplicate requests inside the provider's retention window. After eight unsuccessful attempts, a job is failed and requires investigation. Error records contain status codes rather than provider response bodies or message contents. Encrypted payloads of completed/failed mail are cleared after seven days. Delivery metadata remains for operational review.

Notifications contain an authenticated workspace link, not private message text. Users may opt out of booking email; account recovery and verification remain available. Next-day reminders are scheduled for confirmed appointments between 1 and 24 hours away, once per appointment start time; rescheduling creates a new reminder. A reminder is not a delivery guarantee.

## Card payments

Configure the Stripe endpoint `POST /api/webhooks/stripe` for:

- checkout.session.completed
- checkout.session.async_payment_succeeded
- checkout.session.expired
- refund.created
- refund.updated
- refund.failed

Use Stripe test mode first. Checkout is hosted by Stripe; Venue does not collect card numbers. A browser success redirect never marks a payment received. Only a verified signed webhook records a receipt. Webhook event IDs and provider payment IDs are unique; database failures return a retryable error.

An open card checkout reserves its amount and blocks quote changes and manual receipt recording until it expires or is cancelled. Cancellation must expire the provider session before releasing it locally. Late captures are still recorded and marked for reconciliation in the activity log, rather than silently discarding money received. Administrators can issue partial refunds up to the unrefunded amount. Pending refunds reserve that amount; an interrupted provider response can be retried from the booking's refund history using the original server-side idempotency key. Provider refunds created outside Venue are imported from signed refund events.

Review failed webhook delivery in Stripe and replay events after resolving an incident. Compare provider receipts and refunds against the Venue booking register and refund report. The current integration depends on webhook delivery and manual reconciliation; it is not a general accounting, tax, chargeback or subscription-billing system.

## Organization SSO

Register `https://YOUR-SITE/api/auth/sso/callback` as the exact redirect URI. Use a trusted HTTPS OpenID Connect issuer. Discovery, authorization code exchange, PKCE, state, nonce and ID-token signature validation use openid-client. SSO is disabled if client credentials are absent.

Provision the local account first. Only verified provider email can establish its first link; subsequent logins are pinned to issuer and subject. Provider role claims never grant application roles and SSO never creates an administrator. If local MFA is enabled it is also required after SSO. Test with a dedicated client and staff account, then test an unprovisioned, inactive and disallowed-domain identity. The generic adapter is not a certification against any particular identity provider.

## Tenant access

Global roles remain administrator, studio, artist and client. Only studio owners and administrators can delegate studio access to an active staff account:

| Studio role  | Access                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------- |
| Manager      | Studio settings, services, team operations, bookings and payment verification               |
| Receptionist | Booking records, reference images and conversations; no payment verification                |
| Finance      | Payment list and receipt verification; no booking conversations or private reference images |

An artist retains access to their own work; a studio owner retains access to their studio. Delegated permissions add scoped access and do not remove inherent ownership rights. Client accounts cannot receive delegated staff access. Revocation takes effect on subsequent requests.

## Monitoring and incidents

`GET /api/health/live` checks the process. `GET /api/health` checks database readiness. Monitor both externally, collect structured request/error logs, and alert on 5xx increases, readiness failure, stalled worker heartbeat and failed mail or provider webhook delivery. Request IDs correlate a user-visible failure with logs. Request query strings, passwords, MFA secrets, reset tokens and message contents are not included in request logs.

During an incident, disable the affected integration through host configuration, preserve audit/delivery/provider evidence, and restore service in staging before production. Session signing-key rotation revokes all tokens. Individual sessions and all devices can be revoked in Security. Resetting a password also invalidates existing sessions and does not bypass MFA.

Database privileges must separate schema migrations from normal application writes. The runtime role should have only required table privileges and INSERT/SELECT on audit logs, not ownership or destructive audit permissions. These privileges must be verified in the deployed database; the application cannot prove them from configuration names.

## Backup and restore

Enable encrypted scheduled backups and point-in-time recovery with the database provider. Preserve the independent data-encryption key separately. Set business-approved RPO/RTO, retention and data-residency requirements; no universal values are assumed by this repository.

Perform a restore drill into an isolated staging database with outbound mail, Stripe and OIDC credentials removed. Use a PostgreSQL client version compatible with the source. A typical archive uses `pg_dump --format=custom --schema=venue_app --no-owner` and `pg_restore --no-owner --exit-on-error`; select connections through protected libpq service configuration rather than placing secrets in commands. Never restore over the live database for a drill.

Verify migration version, record counts, referential integrity, account sign-in, encrypted MFA recovery using the retained key, a representative booking, private-image permissions and ledger totals. Record backup timestamp, restore start/end, checks, operator and evidence in the organization's incident system. Admin → Operations intentionally does not mark backup readiness as verified: a real provider backup and restore drill is still required.

## Privacy and retention

Account holders can download their records and image metadata, and submit correction or erasure requests. Staff record the action or retention explanation before resolving a request. Resolving a request does not delete records. Retention and legal exceptions need an organization-approved policy; financial and shared appointment records should not be blindly deleted.

Apply a reviewed erasure procedure to personal data and associated assets, accounting for shared messages, financial retention, provider records and backups. Test it in staging and preserve an appropriate non-personal audit trail. No automatic legal-compliance claim is made by the privacy request workflow.

## Verification

`npm run test:local` creates and destroys a temporary real PostgreSQL cluster, applies migrations and seeds disposable records. It overrides database, encryption and provider configuration so production data/services are not used.

Run `npm run build`, then `npm run test:local -- --e2e --project=chromium` after installing the Playwright browser. Alternatively set PLAYWRIGHT_EXECUTABLE_PATH to a compatible installed Chromium. Isolated browser tests refuse to reuse another server. Do not run two browser suites or replace build assets during a browser suite.

CI runs lint, real-database tests, build, the production dependency audit and Chromium workflows. Firefox/WebKit projects remain available for release validation when those engines are installed. Production load/failover tests, external-provider verification and backup restoration require a staging environment representative of production.
