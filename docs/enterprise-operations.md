# Enterprise and MSP operations

This branch adds a separate paid workspace application at `/enterprise` and the tier comparison at `/pricing`. Hobby continues to work without any paid configuration. **Do not enable paid checkout in production until the external validation checklist below is complete.** No production database migration, Microsoft app registration, customer consent, Polar product, email account, or deployment was changed while building this branch.

## What is implemented

- Organizational Microsoft sign-in using a separate SPA/API configuration; cryptographic access-token validation; no Supabase Auth or external identity provider.
- Explicit workspace creation, mailbox-verified invitations, expiring auditors, five roles, selected-customer access, membership revocation, and final-owner protection.
- Individual and bulk tenant onboarding, tenant-specific consent links and read probes, disconnect, and customer branding.
- Durable database jobs, section-by-section read-only Graph collection, leases/retries, encrypted snapshots, partial-coverage indicators, and rolling retention.
- Setting/assignment comparisons, approved baselines, custom versioned standards, customer overrides, findings, exception approval/expiry, investigation notes, ticket references, maintenance windows, and snapshot sign-offs.
- Best-effort Intune audit-event correlation by resource ID. Candidate events are explicitly distinguished from proof that an actor caused a configuration difference. An unavailable audit feed does not invalidate otherwise complete configuration evidence.
- Private report libraries, customer-scoped portals, PDF/Word documentation, executive/QBR summaries, timezone-aware schedules, email notifications, read-only API credentials, and signed webhooks.
- Polar checkout, agreed tenant pricing, trials/founders configuration checks, customer billing portal, quantity changes, signed event ingestion, event deduplication, and authoritative reconciliation.
- Pricing comparison, configuration diagnostics, loading/empty/error states, support mail links, unit/database/UI contract tests, and PR CI.

The UI contract-test adapter is under `tests/enterprise-browser`. Only the dedicated Vite test configuration substitutes it. The production Next application always uses Microsoft authentication and real API routes. It has no demo-account or authentication-bypass switch.

## Configuration and EU placement

Use [enterprise-environment.example](enterprise-environment.example) as the configuration inventory. Keep all populated credentials in the deployment secret manager, never in source control. The feature is disabled unless `ENTERPRISE_ENABLED=true`.

The Supabase project named **IntuneDocumentation**, project reference `xoqayektwalbuxlkocyr`, was verified read-only as `eu-central-1` during planning. The deployed application's project binding was not available for verification. Before migration, verify the actual database hostname/project reference and EU region in deployment configuration. Confirm backup, worker, and logging placement separately.

The implementation stores AES-256-GCM ciphertext in private Postgres records. It does not use public Supabase buckets or browser database access. This keeps the initial system small. Measure database growth, backup size, and large-tenant collection/report memory before assigning production capacity. Move large encrypted artifacts to private object storage through the same authenticated download boundary if measured volume requires it.

The Next paid API prefers Vercel's `fra1` region. Other hosts must place both application and worker execution in the EU. This setting is not a residency guarantee for billing/customer metadata held by Microsoft, Polar, or the email provider. Emails and outbound events contain private application links and identifiers, not configuration attachments.

### Database migration and credentials

1. Rehearse `supabase/migrations/20260909172824_enterprise_workspace_platform.sql` on an isolated development/staging database. The migration is additive and does not touch Hobby/telemetry tables.
2. Apply through the project's reviewed migration workflow. Do not add the `enterprise` schema to Supabase's exposed Data API schemas.
3. Create dedicated login roles using generated passwords in the database secret store. Grant the web login membership in `enterprise_app`, and the worker login membership in `enterprise_worker`. Neither login should own tables, have `BYPASSRLS`, or belong to `postgres`, `service_role`, or another privileged role.
4. Set `ENTERPRISE_DATABASE_URL` and `ENTERPRISE_WORKER_DATABASE_URL` to the EU pooler's connection strings for those logins. The client uses transactions, `SET LOCAL ROLE`, disabled prepared statements, and verified TLS. `ENTERPRISE_LOCAL_DATABASE=true` is only for local tests.
5. Run the migration/isolation tests and database advisors before enabling the feature. The application schema has no grants to browser roles and every paid table has RLS. Privileged identity/provisioning functions live in the private schema and require server-established identity context.

Example role grants, after separately creating the login roles and passwords:

```sql
grant enterprise_app to intunedoc_web_login;
grant enterprise_worker to intunedoc_worker_login;
```

The worker credential is used only by restricted server-side workflows: verified invitation acceptance, external scoped API access, consent verification, billing events, and background jobs. General workspace requests use the app role and current-membership RLS. Authorization must remain in both the permission service and customer-scoped database policies.

### Encryption keys

`ENTERPRISE_ENCRYPTION_KEYS` is a JSON object whose values are base64 encodings of exactly 32 random bytes. `ENTERPRISE_ACTIVE_KEY` identifies the write key. Ciphertext carries a key ID and is authenticated against workspace/customer/record IDs, preventing ciphertext transplantation between records.

To rotate: add a new key, change the active ID, verify new writes and existing downloads, then re-encrypt old records in a separately reviewed maintenance job. Keep old keys until no retained record or required backup references them. Losing keys means losing history. Never log the keyring, raw access tokens, or decrypted configurations. The paid collector suppresses the legacy detailed-service console logger; workflow failures expose sanitized operational messages.

## Microsoft setup

Use independent registrations for paid identity and unattended collection. Keep Hobby registrations unchanged.

**Paid SPA/API**

- Support accounts in organizational directories, not personal Microsoft accounts.
- Set the API's requested access-token version to `2` and `groupMembershipClaims` to `DirectoryRole`, so Microsoft emits signed `wids` claims for customer-admin verification.
- Expose delegated scope `api://<ENTERPRISE_ENTRA_API_ID>/access_as_user`.
- Register `https://app.intunedocumentation.com/enterprise` as a SPA redirect and post-logout return location, plus exact staging/local counterparts.
- Authorize the SPA client to request that scope. Set the SPA ID and API audience ID in their corresponding server environment variables.
- Test independent business tenants, guests, wrong audiences/clients, expired tokens, and key rollover. Authorization uses validated `tid` + `oid`, never email domains.

**Collector**

- Use a separate multi-tenant confidential application. Prefer a certificate (`ENTERPRISE_COLLECTOR_PRIVATE_KEY` and base64url SHA-1 `ENTERPRISE_COLLECTOR_THUMBPRINT`); a managed client secret is supported.
- Register the Web redirect `https://app.intunedocumentation.com/api/enterprise/consent`.
- Configure application read permissions required by the enabled registry: `DeviceManagementConfiguration.Read.All`, `DeviceManagementApps.Read.All`, `DeviceManagementManagedDevices.Read.All`, `DeviceManagementRBAC.Read.All`, `DeviceManagementServiceConfig.Read.All`, `DeviceManagementScripts.Read.All`, `Group.Read.All`, and Conditional Access `Policy.Read.All`. Verify actual application-permission availability for every registry family in staging; endpoints that cannot be read remain visibly incomplete. Do not substitute write permissions to make a probe pass.
- Every Graph endpoint is beta. Large tenants and beta endpoint changes require measured coverage testing.
- A consent callback only advances a short-lived tenant-bound request. It never activates a connection. The customer then signs into the target tenant with the paid identity app, reviews the requesting workspace, and approves using a fresh API token carrying an active Global Administrator or Privileged Role Administrator directory role. Tenant-specific application read probes run after that proof. This prevents shared collector consent from being reused by another workspace without a customer administrator's authorization. Custom directory roles are not accepted by this initial verifier.
- Local disconnect stops scheduling/token use. It does not globally revoke the customer service principal, which another workspace may legitimately use.

First consent checks configuration reads, not the entire policy coverage matrix. Full section coverage is reported by the first collection. Do not promise comprehensive application-permission coverage before testing a representative tenant.

## Polar setup

Use a sandbox organization first. Configure four recurring products: Enterprise monthly/yearly and MSP monthly/yearly. Match recurring intervals exactly and keep all prices in USD. Checkout supplies the validated fixed base and graduated unit-price definitions from `catalogPrices()`.

Polar's SDK names its unit quantity `seats`. In this application those units represent **monitored production/customer tenants**, never people. Do not attach a seat-access benefit. Disable customer-portal seat assignment and uncontrolled product switching; users manage tenant quantity through the workspace UI, which checks connected capacity. Verify checkout labels describe tenant capacity clearly.

| Product | Fixed base | Included zero-price units | Additional unit |
|---|---:|---:|---:|
| Enterprise monthly | $149 | 1 | $99 |
| Enterprise annual | $1,519.80 | 1 | $1,009.80 |
| MSP monthly | $249 | 10 | $20 |
| MSP annual | $2,539.80 | 10 | $204 |

The test/internal tenant is excluded from unit quantity. Membership counts never influence billing. Native checkout trials are 30 days and collect payment details. Quantity changes use Polar's invoice proration behavior and require explicit customer confirmation. Capacity becomes effective through authoritative reconciliation, not a browser redirect.

Create a percentage discount at **5000 basis points**, recurring for **12 months**, with redemption ending **2026-10-31T23:00:00Z** (1 November, 00:00 Berlin). Set its ID as `POLAR_FOUNDERS_DISCOUNT_ID`. No public coupon entry is enabled. Founders checkout is monthly only; annual discount stacking is rejected server-side. The native discount expiry must also reject abandoned checkout completion after the cutoff. Sandbox verification must establish that a trial does not consume a paid discount month and that prorations do not shorten the promised discount.

Set the webhook endpoint to the app origin's `/api/enterprise/billing-webhook`. Subscribe to subscription lifecycle events and relevant order payment/refund events. Store its signing secret. Secrets issued on/after 8 September 2026 use `POLAR_WEBHOOK_SECRET_FORMAT=standard`; older Polar HMAC secrets use `legacy`. Raw bodies are verified before accepting IDs. The handler stores events quickly; workers fetch current subscription state. Modified-time checks prevent stale state from replacing newer state. Daily refresh repairs missed events. Reconciliation errors have bounded retries and remain inspectable in `enterprise.billing_events`.

Do not activate production billing until sandbox evidence proves:

- Fixed base + zero-price included graduated units is accepted by the configured Polar API/account.
- Monthly/annual totals, quantity proration, tax presentation, trial expiry, cancel/refund/reinstatement, and duplicate checkout handling.
- Founders deadline completion behavior, twelve paid discounted months, and the undiscounted renewal price.
- A second unintended subscription is detected and resolved rather than granting conflicting entitlements.

Subscriptions are permanently associated with the workspace customer ID, not the checkout email. Billing errors are independent from collection scheduling; a poison event must not stop unrelated tenants.

## Email and worker execution

Use any authenticated SMTP provider with a verified sender domain. Configure port 465 (TLS) or 587 (required STARTTLS), sender identity, and credentials. Confirm SPF/DKIM/DMARC and actual mailbox delivery. `support@ugurlabs.com` is the reply-to/support address. No support platform is introduced.

Invitation links expire after seven days. Acceptance requires Microsoft sign-in plus an eight-digit code sent to the originally invited mailbox. The code is identity-bound, expires after ten minutes, has a send cooldown and a five-attempt limit. Forwarding the original invitation link is insufficient to join. Failed email delivery revokes the newly created invitation.

Run the worker continuously on EU infrastructure:

```sh
node scripts/enterprise-worker.mjs
```

It calls the authenticated worker endpoint with `CRON_SECRET` (at least 32 characters). Two loops are the default; `ENTERPRISE_WORKER_CONCURRENCY` accepts 1–8. Alternatively configure a trusted one-minute scheduler calling `GET /api/enterprise/worker` with the same bearer secret. No production scheduler is provisioned by this PR. A single invocation performs one section/job, so choose concurrency from measured tenant volume. Collection requests have a 15-minute cooldown.

Each collection progresses through the existing registry steps. Jobs have a six-minute lease, fencing token, bounded retries, and idempotent logical keys. Worker crashes cannot commit through an expired lease. Each Graph step has a 105-second budget. The API route allows 300 seconds; use a deployment plan that supports this duration. Failed/incomplete reads do not imply deletion or resolution. Manual retries are available for failed jobs.

Delivery is at least once. Email has a stable Message-ID; SMTP cannot guarantee exactly-once delivery across a crash after acceptance. Webhook recipients must deduplicate `Webhook-Id`, validate `Webhook-Timestamp`, and verify HMAC SHA-256 over `id.timestamp.rawBody`. The signature header is `v1=<hex>`. Destinations must be public HTTPS; DNS is validated and pinned and redirects are not followed.

## Retention and recovery

Successful paid history/artifacts expire after twelve calendar months. Expired baseline references become visibly expired. Exception expiry never edits underlying evidence. After a subscription lapses, collection stops and an authenticated 30-day export recovery window applies. The scheduler removes expired paid records; backups expire under the Supabase backup policy, which must be documented in the customer terms. A paused worker also pauses physical retention cleanup, so monitor the cleanup process separately.

For a service incident:

- Set `ENTERPRISE_WORKER_PAUSED=true` to stop new work while retaining app access. Disable checkout separately by removing production product configuration or disabling the feature during a commercial incident.
- Inspect sanitized job status, queue age, lease age, and billing reconciliation errors. Fix credentials/consent before retrying.
- Renewing a certificate requires updating the app registration and deployment secret together; do not retain expired credentials as a silent fallback.
- Use retained authenticated downloads for customer evidence recovery. Rehearse database backup restoration on an isolated EU instance, including encryption key restoration, before launch.
- Do not remove a final owner through manual SQL to solve a support issue. Verify the requester through an approved ownership-recovery process, add the replacement owner, record the action, then remove obsolete access.

## Validation and launch gate

Local validation includes real embedded Postgres migration/RLS tests, worker state transitions, token signatures/claims, encryption context, pricing, webhook signatures, snapshot comparisons, timezone scheduling, PDF/Word artifact generation, and browser UI contract tests. Full existing Hobby tests and the Next production build must also pass. CI repeats these and validates the Docker build.

```sh
npm run check
npm test
npm run test:enterprise-ui
SKIP_ENV_VALIDATION=1 npm run build
```

On local Node versions with experimental web storage, use `NODE_OPTIONS=--no-experimental-webstorage npm test`. CI uses Node 22.

**Still requires real environment evidence:** deployment-to-project binding and EU backup/log placement; two-organization Microsoft sign-in and collector permission coverage; large-tenant performance; Polar sandbox/account setup; SMTP deliverability; monitoring; backup restore; cancellation cleanup; and a representative collection reliability run. Do not call these passed because isolated unit or UI fixture tests pass.

Trial claims are restricted to one originating user and one verified customer tenant across recreated workspaces. A customer tenant is claimed only after customer-admin authorization, preventing unverified tenant IDs from consuming another customer's trial. Re-subscription after termination does not restart a trial or an expired founders offer. These provider-dependent commercial edges and the published recovery terms still require staging proof before enrollment.

Microsoft references: [access-token directory-role claims](https://learn.microsoft.com/en-us/entra/identity-platform/access-token-claims-reference), [application permission consent roles](https://learn.microsoft.com/en-us/graph/permissions-overview).

## Review evidence

See [UI screenshots](enterprise-ui/README.md) for desktop, mobile, and sign-in views. Local validation at handoff: 403 tests in 42 suites, five Chromium UI scenarios, lint/type checks, and the production Next build. Default-disabled API and configured public-origin isolation were smoke-tested. Existing image optimization lint warnings remain unchanged. These checks do not replace the external Microsoft, Polar, SMTP, EU deployment, load, and backup-restore validations above.
