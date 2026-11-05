# Implementation audit

Audit date: 2026-11-05. Branch: dev.

This is an implementation and local verification record, not a security certification or a claim that production infrastructure has been accepted.

## First audit and implementation

| Area                  | Initial gap                                        | Implemented control                                                                                                                                                                          |
| --------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication        | Password-only sign-in, no recovery or verification | TOTP MFA, encrypted enrollment secrets, hashed one-use recovery codes, purpose-bound expiring reset/verification tokens                                                                      |
| Sessions              | Global version only                                | Persisted browser sessions, single-device revocation, all-device revocation, revocation on password/MFA changes                                                                              |
| Sign-in abuse         | Per-process IP limit                               | Existing IP limit plus shared PostgreSQL account/IP throttling across application replicas                                                                                                   |
| Organization identity | No SSO                                             | OpenID Connect authorization-code adapter with PKCE, state, nonce and validated ID tokens; existing-account linking pinned to issuer/subject; no role claims or automatic admin provisioning |
| Studio administration | Ownership-only access                              | Delegated manager, reception and finance scopes, owner/admin-controlled grant and revocation, permission checks on data and mutations                                                        |
| Email                 | No delivery worker                                 | Encrypted durable outbox, leased job claims, retry/backoff, provider idempotency, status visibility and heartbeat                                                                            |
| Scheduling            | In-app updates only                                | Confirmed appointment reminders, deduplication by appointment start, notification preferences                                                                                                |
| Payments              | Manual enquiries only                              | Optional Stripe-hosted card checkout, signature-verified webhooks, receipt deduplication, bounded refunds, net received amounts, refund status history                                       |
| Financial conflicts   | No pending card reservation                        | Booking lock and open-checkout reservation prevent conflicting quote/manual-receipt changes                                                                                                  |
| Reporting             | Fixed first page of accounts/bookings/activity     | Bounded server pagination, search and role/status filters, status and financial reports, CSV escaping and audited exports                                                                    |
| Privacy               | No access/request workflow                         | Self-service record export; correction/erasure case intake, staff resolution and retention explanation                                                                                       |
| Operations            | Minimal health endpoint                            | Separate liveness/readiness, request correlation and structured logs, integration status, queue view and worker heartbeat                                                                    |
| Verification          | Configured external database required              | Repeatable isolated real PostgreSQL runner, expanded security/integration suites and CI                                                                                                      |
| Deployment            | Sleeping free host baseline                        | Always-on starter blueprint, explicit encryption key, staff MFA enforcement, deployment/runbook documentation                                                                                |

## Second audit and fixes

The re-audit examined actual route and permission behavior, persistence, concurrency and failure recovery. It identified and corrected:

1. The in-memory database adapter could not validate correlated permission queries. The admin suite now runs against real PostgreSQL.
2. MFA setup needed to preserve access to enrollment while mandatory staff policy blocks staff operations. Security endpoints remain reachable and the workspace defaults to Security until enrollment.
3. An authenticator-field hint changed its accessible name. The input now has an explicit label and a browser sign-in/recovery-code test.
4. A keyboard-opened booking dialog did not reliably restore focus. It now returns focus to its opener.
5. A partial refund could receive an out-of-order provider event or lose its response before the browser could retry. Refund state cannot regress from succeeded to pending, provider metadata links early events to local requests, and pending requests can be retried from persisted server state after reload.
6. Provider-created external refunds needed to affect the local ledger. Signed refund events now import them, with event ordering retried if a Venue receipt has not yet arrived.
7. Delegated finance users could be shown a link to a booking conversation they cannot access. Payment responses now include whether the booking can be opened, and the UI respects that decision.
8. Booking action controls inferred management from global role. Detail responses now expose the exact server-authorized management decision.
9. Sensitive mutation history had gaps. Studio/service mutations and conversation creation now write their audit/notification records transactionally; activity history is paginated.
10. Local browser runs could accidentally reuse another server. Isolated tests now refuse server reuse; provider credentials are cleared by the disposable-database runner.
11. Unknown non-Venue checkout events could create unnecessary provider retries. They are ignored; known Venue captures still require a durable matching receipt write.
12. Automatically navigating to a mailto URL could replace the booking page with a browser error if no email handler was installed. Payment enquiries now stay visible and provide an explicit external email link.
13. A sleeping host cannot run dependable reminder scheduling. The blueprint now requests an always-on tier; applying it is a separate hosting action.

## Verification evidence

- Lint and TypeScript/production build pass.
- 54 tests pass against temporary real PostgreSQL, covering existing booking/payment workflows plus MFA, token purpose and replay, shared throttling, session revocation, tenant boundaries, export scope, privacy outcomes, reminder deduplication, email opt-out, concurrent delivery claims, signed card webhooks, duplicate receipts, partial refunds, event order, persisted retry and SSO state/account boundaries.
- All 12 Chromium workflows pass, exercising authenticator enrollment and recovery-code login, account creation on mobile, operations/reports/privacy/permissions/security screens, existing artist/client/admin workflows, mobile layouts and keyboard focus.
- Production dependency audit: zero known vulnerabilities at the time checked.
- Provider network behavior is tested with controlled adapters; no real payment, external email or organization login is represented as completed.
- Interrupted/overlapping browser runs were discarded; final browser results are taken only from isolated serial execution.

## Production acceptance still required

These items cannot be established by local source changes or invented configuration values:

| Required evidence                                                                                               | Current status                                                    |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Production migration and live workflow validation                                                               | Not deployed by this task                                         |
| Resend sender/domain verification and delivered staging mail                                                    | Credentials/provider verification not supplied                    |
| Stripe test-mode checkout, signed endpoint delivery, settlement/refund reconciliation and live-account approval | Local adapter/signature tests only                                |
| Organization identity provider registration and verified login/logout policy                                    | Generic OIDC adapter tested locally; real provider not configured |
| Encrypted scheduled backup, PITR and timed restore drill                                                        | Provider infrastructure not verified                              |
| Runtime database least privilege and protected audit history                                                    | Requires deployed role/grant review                               |
| Organization-approved privacy retention/erasure process and residency requirements                              | Case workflow exists; legal/operational policy not supplied       |
| Target traffic, latency SLOs, capacity/load, failover and monitoring alerts                                     | Requires representative staging infrastructure and agreed targets |
| Independent security/accessibility review and Firefox/WebKit release testing                                    | Not established by this local audit                               |
| Tax, chargebacks, accounting integration or subscription billing if required                                    | Outside the implemented booking payment ledger                    |

The application now provides a substantially broader enterprise operating baseline. Enterprise production readiness remains conditional on the acceptance evidence above; an app cannot self-certify these external controls from its own configuration.
