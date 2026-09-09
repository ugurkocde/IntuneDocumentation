# Intune Documentation: paid tiers launch plan

**Status:** Implementation planning baseline, updated 9 September 2026. The owner has confirmed the full tier feature set, launch pricing, Microsoft-only authentication, and paid server-side history. Polar billing, EU storage, email support and a 50% founders offer are confirmed. The owner confirmed minimal integrations and founders pricing at 50% for 12 months, ending enrollment on 1 November. Operational defaults are explicitly marked for implementation review. This document authorizes no deployment or tenant permission changes by itself.

## Executive launch brief

**Build:** Microsoft-only paid workspaces with invitations and customer-scoped RBAC; automatic read-only collection; encrypted EU history; diffs, drift, standards and exceptions; audit reviews; scheduled PDF/Word and executive/QBR reports; Enterprise library and MSP customer portal; Polar subscriptions and founders pricing.

**Keep simple:** existing Next.js stack, Supabase database/private storage, Microsoft identity/Graph, Polar, and one email sender. Email support at support@ugurlabs.com. No external authentication platform, PSA/documentation connectors, SharePoint, Teams integration or customer-owned storage integration.

**Prices:** Hobby free; Enterprise $149/month; MSP $249/month. Regular annual billing saves 15%. Founders: $74.50 / $124.50 monthly bases for twelve months, extra tenants also half price, no stacking. Enrollment closes 1 November 2026; exact cutoff proposal below.

**First build gate:** establish organizational sign-in and database isolation, prove unattended collection across all current policy families, prove Polar quantity/discount/trial billing, then fix a calendar launch estimate. All remaining core paid features still ship before broad paid availability.

### First implementation checklist

- [ ] Confirm production Supabase project binding, EU storage/worker placement and current deployment plan.
- [ ] Verify Polar account, sandbox access and business details; prove base + included tenant quantities and founders deadline/trial cases.
- [ ] Confirm one transactional sender and mailbox delivery to support@ugurlabs.com; no new support platform required.
- [ ] Create non-production identity/API and collector configurations; preserve Hobby registrations and consent.
- [ ] Produce app-only beta coverage matrix and large-tenant benchmark.
- [ ] Write membership/invitation/RBAC schema and isolation tests before paid data ingestion.
- [ ] Review proposed operational defaults (trial checkout, founders cutoff/qualification, grace/deletion windows, support hours).

## 1. Outcome and confirmed decisions

Launch Hobby, Enterprise, and MSP with clear product boundaries and working purchase, onboarding, collaboration, monitoring, reporting, and cancellation flows.

- Hobby preserves every existing feature, custom branding, existing compliance checks/evidence exports, and self-hosting. Do not add new limits or require a paid workspace to use the existing product.
- Microsoft organizational sign-in only. No email/password, Supabase Auth, WorkOS, or customer-configured enterprise SSO in this release.
- Microsoft identifies the person. Application memberships and permissions determine workspace/customer access.
- Creating a workspace makes the creator its Owner, not the owner of a Microsoft tenant. Never claim a tenant or auto-enroll teammates based on first sign-in, matching domains, or tenant IDs.
- Team access is invitation-based. Use validated Microsoft tenant ID + object ID for identity, not email as the durable key.
- Supabase Postgres stores application data. Browser clients do not directly access paid tables or configuration storage.
- Paid monitoring uses separately authorized, unattended, read-only Microsoft access. Paid tenants explicitly opt into encrypted server-side configuration history with 12-month retention.
- Preserve the public/app origin boundary: public marketing at intunedocumentation.com; authentication and data at app.intunedocumentation.com. Existing public-only analytics/chat isolation stays intact.
- Microsoft Graph calls use beta, consistent with the owner's project preference. OAuth protocol versions are a separate concern. Do not silently substitute Graph v1.0.
- Launch includes the full comparison-table product feature set, with the owner subsequently removing SharePoint and requesting minimal external integrations. Restore and cross-tenant deployment are deferred. Internal milestones are implementation sequencing, not permission to silently remove the remaining paid workflows.
- Billing provider: Polar. Company: Ugurlabs UG (haftungsbeschränkt), Fährstraße 217, 40221 Düsseldorf, Germany; HRB 113979 (Amtsgericht Düsseldorf); Managing Director: Ugur Koc. These are owner-supplied details, not independently registry-verified. Support: support@ugurlabs.com.
- Launch a founders offer at 50% off monthly list rates, including extra tenants, for 12 months, without stacking the annual discount. Enrollment ends 1 November 2026; no numeric customer cap was requested. Proposed exact boundary: 1 November 2026 00:00 Europe/Berlin (31 October 23:00 UTC).
- Target public paid availability as soon as the complete agreed scope and release gates pass. No prolonged separate pilot is assumed; controlled validation is still required.

## 2. Open decisions and proposed defaults

| Decision | Status / effect |
|---|---|
| Billing provider and selling entity/country | Confirmed: Polar, Ugurlabs UG (haftungsbeschränkt), Germany. Verify Polar account onboarding, settlement and sandbox/production credentials. |
| Paid-data region and existing Supabase region | EU confirmed. Read-only Supabase project lookup verified IntuneDocumentation in eu-central-1, ACTIVE_HEALTHY. Production application binding, worker region, object storage, backups/logs and subprocessors still need verification. |
| Launch mode | Public paid availability ASAP with a 50% founders offer. Complete controlled staging/customer validation before broad enrollment; no long separate paid-pilot phase required. |
| Minimal launch integrations | Confirmed: email alerts, in-app reports/downloads, small read-only API and outbound webhooks. No SharePoint, Teams, customer Azure-storage, HaloPSA, Hudu or IT Glue connectors. Manual ticket references remain. |
| Restore and cross-tenant deployment | Confirmed deferred. No Intune or customer policy writes in launch scope. |
| Workspace duplication | Proposed: allow separate workspaces; no exclusive domain/tenant reservation. Each connection needs its own consent/authorization and isolated records. No automatic sharing between workspaces. |
| Report-portal domains | Proposed: workspace/customer branding on the application origin. Customer-owned vanity domains are not implied by “branded portal”; confirm separately if required. |
| Support commitment | Confirmed email channel: support@ugurlabs.com. Proposed business-day priority response, no new ticketing vendor or 24/7/SLA promise. Agree response window before publishing one. |
| Cadence | Proposed starting contract: daily automatic collection, manual refresh with a per-tenant cooldown; daily/weekly/monthly reports. Drift is detected after successful collection, not described as real-time. Validate load before fixing numeric refresh limits. |
| Commercial lifecycle defaults | 30-day trial confirmed. Simplicity proposal: native Polar trial starting at checkout, payment method collected, automatic charge after trial disclosed. Alternative: app-managed card-free trial. Confirm UX before checkout goes live. Proposed 7-day payment grace and 30-day export/recovery period also need commercial review. |
| Founders offer | Confirmed: 50% off for 12 months including extra tenants, no stacking, enrollment ends 1 November 2026. Proposed operational interpretation: monthly billing only, qualifying completed checkout before 1 November 00:00 Berlin; twelve discounted paid monthly periods begin with first successful charge. Trial reservation/cancellation rules below require review before publishing. |

## 3. Tier contract and prices

All amounts USD, excluding applicable tax. A paid connected tenant is enrolled in background collection/history; manual Hobby use stays free. Workspaces have unlimited human members under the confirmed proposal.

| Contract | Hobby | Enterprise | MSP |
|---|---|---|---|
| Monthly base | Free | $149 | $249 |
| Included tenants | Existing behavior | 1 production + 1 test | 10 customer + 1 internal |
| Extra monitored tenants | Existing behavior | $99/production tenant/month | $20/customer tenant/month |
| Annual discount | N/A | 15% | 15% |
| Base annual charge | N/A | $1,519.80 | $2,539.80 |
| Extra tenant annual charge | N/A | $1,009.80 | $204.00 |
| Trial | Always free | 30 days | 30 days, up to 10 customers |
| Retention | Current behavior | 12 months while subscribed | 12 months while subscribed |

Monthly totals: Enterprise = 149 + 99 × max(production tenants − 1, 0). MSP = 249 + 20 × max(customer tenants − 10, 0). Annual total = monthly total × 12 × 0.85, represented in integer cents.

Proposal: test/internal tenants must be explicitly classified and visible in billing. Reclassification and additions show a price preview; no silent quantity increases. Test/internal slots cannot be treated as an unlimited customer-rotation mechanism. Define removal, replacement, and proration rules before launch. Historic data is not merged when a tenant is replaced.

## 4. Full launch scope and acceptance criteria

| Capability | Enterprise | MSP additions | Release acceptance |
|---|---|---|---|
| Existing product | All Hobby features | Same | Existing export, branding, coverage, Docker and privacy regressions pass. |
| Scheduled documentation | Saved schedules and automatic reports | Customer-specific settings and recipients | Runs without a signed-in admin; timezone, DST, failures and retries visible. |
| Configuration history | Search and setting/assignment diffs | Separate history for each customer | Compare any retained compatible snapshots; additions/removals and scope shown. |
| Drift alerts | Compare against approved baseline; email | Portfolio queue and per-customer email routing | Significant changes alert once; incomplete reads never imply deletion or resolution. |
| Custom standards | Company requirements and approved baseline versions | Reusable templates with customer overrides | Deterministic checks, versioned definitions and evidence; unknown remains unknown. |
| Audit workspace | Annotations, sign-offs, evidence history, expiring auditor membership | Customer-isolated workspaces/packages | Review references an immutable snapshot and ruleset; superseding reviews preserve earlier evidence. |
| Exceptions | Owner, reason, approver and expiry | Per-customer exceptions | Approval and expiry audited; exceptions never alter underlying collected evidence. |
| Change accountability | Ticket references, explanations, audit correlation where available | Maintenance windows and out-of-window findings | No invented actor attribution; distinguish discovered time, event time and user-entered explanation. |
| Team access | Owner/Admin/Analyst/Viewer plus limited reviewer access | Customer-scoped technicians | API and file access enforce current membership, permission and customer scope. |
| Multi-tenant operations | Consolidated corporate-tenant oversight | Portfolio and bulk onboarding workflow | Each tenant independently authorized; partial onboarding and stale data visibly distinguished. |
| Executive/customer reports | Scheduled summaries and historical trends | Quarterly review packs | Reports show changes, open/closed findings, limitations and collection freshness. |
| Portal/library | Private internal report library | Branded, isolated customer portal | Microsoft business sign-in required; no customer sees another customer's data. |
| Integrations | Email, small read-only API and outbound webhooks | Same with customer scope | No external business-tool connectors; scope, signatures, retries and delivery records validated. |
| Retention | Encrypted 12-month history | Same per customer | Automated purge with clear backup expiry; downloadable retained evidence before cancellation purge. |
| Support/onboarding | Priority support and onboarding | Customer onboarding assistance | Published support terms, monitored support@ugurlabs.com mailbox and internal incident runbook. |

The full list above is launch scope. Do not market placeholder integrations or partially working capabilities as available. More framework names alone are not a substitute for the custom standards/audit workflow. Existing policy evidence must never be relabeled certification or effective device compliance.

## 5. Authentication and user journeys

### Sign-in and Hobby

Keep the existing Hobby path usable with no paid setup. Add a paid workspace entry point using a separate organizational Entra sign-in configuration. Prefer separate app registrations for paid identity/API and Graph collector consent so ordinary viewers do not see Intune permission prompts. Preserve the current Hobby app registration and redirects during rollout.

Paid SPA authenticates with MSAL against the organizational audience and obtains access tokens for our API. Backend validates signature, tenant-bound issuer, intended API audience, expiry/not-before, delegated scope and expected client. Configure token version explicitly. Never use Graph tokens, ID tokens, or decoded logging claims as API authorization. Validate through a maintained library and Microsoft's discovery/signing keys, including key rollover. See [Microsoft access tokens](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens).

Bind internal identities to (tenant ID, object ID). Do not infer membership from claims containing an email domain. A person signing in as a guest in another directory can have a different identity; no automatic cross-directory account merging.

### Workspace creation

A signed-in person can create a workspace through an explicit action. Creation is transactional and grants Owner only for that workspace. Other users signing in from the same company see no workspace data unless invited. Give an uninvited user a neutral “No workspace access yet” state; avoid disclosing another workspace's membership or customers.

### Invitation acceptance

Owner/Admin chooses email, permissible role, customer scope and expiry. Backend checks inviter authority, hashes a random single-use token, stores a pending invitation and sends the email. Default proposed expiry: 7 days. An invitation is not an Entra guest invitation.

Recipient signs in with a business identity and explicitly accepts. Bind acceptance to the authenticated identity and verified control of the invited mailbox. Do not trust an arbitrary email/UPN claim or a matching domain. For aliases/missing trustworthy email, use a fresh challenge sent to the original invited address or explicit administrator approval. Do not silently bind a forwarded link to a different user. Invalid, expired, revoked and already-consumed invitations have distinct recoverable states. Acceptance and membership creation are one transaction. Existing members are not duplicated; role upgrades require a separate authorized action.

### Connect a customer tenant

An authorized workspace member creates a short-lived connection request tied to workspace, expected customer tenant and initiating identity. An authorized customer admin completes a separate Microsoft admin-consent flow. The admin may differ from the workspace Owner and need not gain workspace membership.

Validate callback state and actual tenant identity; do not trust a success query parameter alone. Obtain a tenant-specific application token and run permission/read probes. Store the connection only after proof, scope disclosure and acknowledgement of retention. A customer admin from the wrong tenant cannot activate the connection. Bulk onboarding is a queue of individually authorized connections, not a bulk consent bypass.

Disconnect stops future jobs and prevents new token use. Show separate steps for Microsoft consent revocation and stored-data deletion. Local disconnect does not pretend to remove the customer's service principal consent. Other workspaces may depend on that service principal; do not revoke it globally as a side effect.

## 6. RBAC and customer isolation

| Action | Owner | Admin | Analyst | Viewer / Auditor |
|---|---|---|---|---|
| Billing and ownership transfer | Yes | No | No | No |
| Manage ordinary members/invitations | Yes | Yes, within own authority | No | No |
| Grant Owner / remove final Owner | Explicit ownership workflow / never remove final Owner | No | No | No |
| Connect/disconnect tenants | Yes | Authorized scope | No | No |
| Configure integrations/API credentials | Yes | Authorized scope | No | No |
| Set standards/schedules/routing | Yes | Authorized scope | No initially | No |
| Investigate/comment/link tickets | Yes | Authorized scope | Assigned customers | No |
| Request exceptions | Yes | Authorized scope | Assigned customers | No |
| Approve exceptions/baselines | Yes | Assigned approval permission | No initially | No |
| Review/sign off evidence | Yes | Assigned reviewer permission | Only if explicitly granted | Explicit Auditor permission only |
| View/export evidence | Yes | Authorized scope | Assigned customers | Assigned scope; auditor expiry enforced |

Use named permissions in code; roles are mappings to permissions. Customer scope is a separate assignment: all customers or an explicit set. An Admin cannot delegate access beyond their own scope. All-customer assignments explicitly cover future tenants; selected-customer assignments do not.

Auditors/customer viewers are restricted members, not separate Microsoft identities or new paid tiers. Auditor access expires in the database. Request-time checks make membership removal and role reduction effective on the next request even if Microsoft's access token remains valid. Protect the final Owner and support an audited ownership transfer/recovery procedure.

No signed URL with a long life may evade revocation expectations. Prefer authenticated downloads. Any short-lived signed URL exception needs documented expiry semantics; already downloaded files cannot be recalled.

## 7. Data and backend architecture

Browser → authenticated Next.js API → permission service → scoped database/storage access. Worker → tenant-specific collector → validated/redacted snapshot → diff/standards → findings/reports/delivery jobs.

Proposed tables:

| Area | Records and key constraints |
|---|---|
| Identity | users unique on entra_tenant_id + entra_object_id; workspaces; memberships unique on workspace_id + user_id |
| Access | invitations with token hash/status/expiry; membership_customer_access; permission definitions and role mappings |
| Connections | customer_tenants unique per workspace + Microsoft tenant; tenant_connections with consent coverage, status and credential reference |
| Collection | collection_runs, section_results, snapshot manifests, normalized policy objects or object-storage references |
| Analysis | snapshot_diffs, baseline_versions, standard_versions, rule_results, findings, exceptions |
| Audit | annotations, review_signoffs, immutable application audit events, external audit correlations |
| Reporting | report_templates, report_schedules, report_artifacts, recipients, delivery_attempts |
| Integrations | integration_connections, customer mappings, credential references, API credentials, webhook destinations/deliveries |
| Commercial/operations | subscriptions, plan_versions, entitlement snapshots, billing events, usage counters, durable jobs |

All customer-derived records carry workspace and customer identifiers. Composite foreign keys prevent a row in one workspace referencing a tenant/snapshot in another. Version baseline, normalizer, collector and ruleset metadata. Never compare incompatible scopes silently. Unique idempotency keys cover jobs, billing events, invitations, alerts and external tickets.

Minimal stack proposal: keep Next.js on the existing hosting platform; Supabase Postgres plus private object storage in the verified EU region; Microsoft identity/Graph; Polar billing; one transactional email sender. No Redis, external auth provider, PSA, documentation platform or extra queue vendor by default. Implement a small durable Postgres jobs table and bounded dispatch/worker invocations; choose a separate EU worker only if the large-tenant benchmark requires it.

Use a private database schema inaccessible to browser anon/authenticated roles. Prefer a dedicated pooled Postgres runtime role without BYPASSRLS; set validated user/workspace context transaction-locally and enforce membership policies. Context must be cleared by transaction boundaries to prevent pool leakage. Supabase auth.uid() does not automatically identify a Microsoft user when Supabase Auth is not used. This integration must be explicit and tested. See [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and [connections](https://supabase.com/docs/guides/database/connecting-to-postgres).

Worker access gets a separate constrained role. Migrations and administrative maintenance use separate credentials. Do not reuse the current browser anon-key client for paid data. Avoid blanket service-role queries; they bypass RLS and require independent authorization for every action. Apply private storage access as well as table access restrictions.

Encrypt persisted configuration and backups; keep application credentials outside normal tables, referenced through a secret store. Redact sensitive values before persistence where possible; don't store recovery keys, passwords or access tokens as report content. Establish key rotation/recovery, backup restoration, regional placement and deletion coverage before production.

## 8. Unattended collection, history and drift

First perform an endpoint-by-endpoint compatibility spike across existing collectors, including scripts, assignments, endpoint security, optional Conditional Access, group resolution and export enrichment. Record exact beta endpoint, read-only application permission, license requirement, pagination, throttling and app-only result. Do not assume delegated permissions convert one-for-one. If a family cannot be collected app-only, resolve it or explicitly agree a documented coverage exception before sale; never silently drop existing coverage from paid reports.

Use a separate multitenant collector application. The application object lives in the publisher tenant; customer consent creates/authorizes a tenant-local service principal. Prefer workload federation where supported and verified, otherwise a certificate with a rotation runbook. Client-credentials access must be tested against a different customer tenant, not only the publisher's own tenant. See [Microsoft client credentials](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-client-creds-grant-flow).

Current streaming collection is tied to an interactive request, uses maxDuration 120, and initializes a 105-second Graph budget. Extract reusable collection steps from that lifecycle. A durable job has state, lease, heartbeat, attempts, next retry and checkpoint. A scheduler enqueues due jobs; it does not collect all tenants in a single request. Vercel Cron can trigger dispatch, but retries, overlap protection and persistence remain application responsibilities. Confirm worker hosting after a realistic large-tenant benchmark. See [Vercel Cron](https://vercel.com/docs/cron-jobs).

Collection rules:

- Tenant-specific access tokens are never mixed across jobs; concurrency and rate limits are tenant-aware.
- Respect Retry-After, pagination and bounded exponential backoff. Recover from worker restarts and poison jobs.
- Persist section completeness and a manifest; publish a snapshot only with an explicit complete/partial status.
- Failed reads must not become empty inventories, false deletions or resolved findings. Diff only mutually complete comparable sections.
- A removed object requires a successful authoritative list. Exclude volatile metadata from diffs; preserve meaningful settings, assignments, exclusions and filters.
- Compare current snapshots with the previous valid snapshot for change history, and with a separately approved baseline for drift.
- Distinguish baseline drift, standard failure, accepted exception, unassessed and collection failure.
- Preserve the last good snapshot during failures and surface freshness. No “healthy” badge for unknown/stale data.
- Deduplicate alerts; record evidence, current state, ownership and delivery status. Expiring an exception reopens attention without rewriting history.
- Correlate audit events only when source coverage and timing support attribution; otherwise display actor unknown.

## 9. Reports, portals and integrations

Refactor PDF/Word generation into a data-to-document layer usable by workers. Existing UI orchestration obtains Graph access during export, so simply moving the current button into a cron job is insufficient. Scheduled reports must use one identified historical snapshot, not silently fetch newer data. Persist branding/template versions, evidence ruleset, collection time and warnings with the artifact. Verify both report formats and compliance evidence output visually.

Portal: internal library for Enterprise; workspace/customer branding and isolated report views for MSP. Customer users sign in with Microsoft and receive scoped invitations. No public evidence URLs. Baseline audit review includes snapshot selection, comments, sign-off, a dated export and reviewer expiration. QBR templates summarize change volume, resolved/open findings and evidence trends without inventing security scores or time savings.

Launch integration surface is deliberately small:

- Email alerts and report-ready notices, with recipient authorization and delivery status.
- Read-only API: list permitted tenants, retrieve snapshot summaries/diffs/findings, list and download authorized reports. Pagination, rate limits and versioned schema are required. No policy or application mutation endpoints in the public API.
- Outbound webhooks: collection completed/failed, drift opened/resolved and report ready. Minimal metadata and authenticated links by default; full configuration is not sent automatically.
- Human-entered ticket URLs/IDs remain in change accountability, without ticket-system API access.

No SharePoint, Teams, customer Azure-storage, HaloPSA, Hudu or IT Glue integrations at launch. This explicitly supersedes their appearance in the earlier tier-comparison HTML. Private internal storage remains required. Future connectors must use explicit consent, isolated credentials, customer mapping, idempotent writes and sandbox validation before they are advertised.

API credentials are workspace/customer-scoped, expire, rotate, and show their secret only once. Read API does not grant Microsoft write capabilities. Outbound webhooks use signatures and event IDs. Validate destinations against SSRF, redirects and private-network endpoints, cap payloads, and minimize transmitted tenant data.

Email delivery needs a production transactional sender, verified sending domain, templates, bounce handling and suppression. Send authenticated report links by default. Invitation emails and customer report recipients are different permissions. No tenant configuration, credentials or customer names in public analytics.

## 10. Billing and entitlement lifecycle

Use Polar checkout/customer portal and a server-side subscription state machine. Map Polar customer external ID to workspace, not to the first Owner's email; ownership changes must not lose billing. Verify Ugurlabs' Polar account readiness and settlement settings. Polar is a merchant-of-record platform; checkout and legal copy must reflect the actual contractual roles rather than assuming Ugurlabs issues every customer tax invoice. Confirm those details with the configured account before publication. Browser redirects do not activate entitlements: verified, idempotently processed provider events do. Reconcile missed/out-of-order events against provider state.

States: pending setup → trialing → active → past due/grace → read-only/expired → scheduled deletion. Also support canceled-at-period-end, payment failure, refund and reinstatement without duplicate tenant charges.

Store plan version and included/extra tenant quantities, paid-through date and effective feature entitlements. Enforce entitlements in APIs and workers, not only navigation. Checkout shows price, currency, interval, tax treatment, included tenants and upgrade quantity. Draft default: additions prorate after explicit purchase; reductions apply next renewal; confirm with provider behavior before publishing.

At expiration: stop scheduled collection/delivery at the agreed date; retain temporary authenticated export access during the proposed 30-day recovery window; purge after that window unless renewed. Twelve months is the maximum rolling history while subscribed, not an unconditional promise to keep canceled accounts for a year. Document backup expiry and export availability. Hobby continues independently.

Prevent unlimited trial recreation using workspace/customer history and reviewed exceptions, without blocking legitimate separate workspaces or sharing their data. Define downgrade behavior if the workspace exceeds the destination plan's included tenant count.


### Founders pricing and Polar proof

Confirmed discount: 50%. Confirmed discounted monthly list-rate calculation: Enterprise $74.50 + $49.50 per extra production tenant; MSP $124.50 + $10 per extra customer tenant. Proposed simplest checkout packaging: founders use monthly billing; regular customers can choose monthly or annual. No founders-plus-annual stacking. Do not introduce a discounted annual founders product without an explicit decision.

Confirmed: 12 months, including additional tenants, no stacking, date-based enrollment ending 1 November 2026. Exact implementation proposal: completed founders checkout before 1 November 2026 00:00 Europe/Berlin, including a native trial checkout, qualifies; a canceled/abandoned checkout does not. Twelve discounted paid monthly billing periods start with the first successful payment, so the free trial does not consume a discount month. Owner should review this operational interpretation before publishing terms. End-of-period cancellation terminates eligibility when service ends; a later new subscription does not automatically regain it. Proration invoices must not accidentally consume a full discount month. Founder workspaces receive the same plan features; the offer is a billing attribute, not a fourth product tier.

Enforce deadline eligibility on the server using a fixed UTC timestamp and persisted qualification evidence. Close public founders checkout issuance and reject/revalidate expired checkout sessions after the deadline. No numerical cap was requested. Honor pre-deadline completed trial checkouts when their first payment occurs afterward, subject to the published rule. Never expose an unrestricted reusable coupon as the only gate. Show renewal price and discount end date before purchase.

Polar supports recurring discounts and trials; its native trial collects payment details and charges after expiry. This differs from an app-managed card-free trial. Use a current supported SDK and validate webhook signatures over the raw body; test replay, reordering and reconciliation. Newly issued webhook secrets have a documented signing-format change dated 8 September 2026, so do not copy a stale signature implementation.

M0 must prove base-plus-included-tenants pricing and additional tenant quantities in Polar sandbox. Polar documents fixed prices combined with graduated unit-based pricing. Model Enterprise as $149 fixed plus a $0 first production unit then $99/unit; MSP as $249 fixed plus $0 for the first ten customer units then $20/unit. Test zero-rate included tiers, minimum quantity and annual equivalents in sandbox. Internal/test tenants are excluded from the purchased unit count. Do not sell human seats to represent technicians, because members remain unlimited. If native tiers cannot model the exact formula, select an explicit base/add-on model before implementing billing UI, and test how cancellation/discounts apply across its subscriptions. Pin a supported API version; docs index includes future version entries that must not be assumed generally available.

Sources: [Polar unit pricing](https://polar.sh/docs/features/unit-based-pricing), [Polar discounts](https://polar.sh/docs/features/discounts), [Polar trials](https://polar.sh/docs/features/subscriptions/trials), [Polar webhook delivery](https://polar.sh/docs/integrate/webhooks/delivery).

## 11. Delivery sequence and effort planning

Estimates below are engineering planning ranges, not calendar promises or measured velocity. They assume one experienced full-time engineer, existing code reuse, prompt answers and access to representative test tenants. Vendor onboarding, admin consent, deliverability setup and external review can add elapsed time. No agents or extra engineers have been assigned by this plan.

| Milestone | Work and deliverable | Dependency | Rough focused days |
|---|---|---|---|
| M0: decisions and proof | Close decision register; app-only endpoint matrix; large-tenant worker benchmark; report generation proof; billing eligibility | Owner answers/test environments | 3–5 |
| M1: identity and isolation | Microsoft API auth; schema/migrations; workspace creation; invitations; roles/customer scope; negative authorization tests | M0 identity design | 6–10 |
| M2: tenant collection/history | Admin consent; credential lifecycle; durable jobs; snapshots; retention; collection health | M0 feasibility + M1 | 7–12 |
| M3: oversight/governance | Diffs; baseline versions; standards; findings; exceptions; audit correlation; reviews/sign-offs | M2 | 7–12 |
| M4: reports/portals | Worker PDF/Word; executive/QBR templates; scheduling; report libraries; customer/auditor experience | M1 + M2; trends need M3 | 5–9 |
| M5: minimal delivery/API | Transactional email; scoped read API; signed outbound webhooks; delivery monitoring | M1 + M3/M4 + sender setup | 3–5 |
| M6: commercial experience | Checkout; quantities; trial/cancellation; entitlements; marketing/pricing; onboarding; support/privacy docs | M0 commercial decisions + M1 | 4–7 |
| M7: verification/release | Full scenario tests; isolation review; load/failure soak; restore drill; deployment/release verification | All launch milestones | 5–8 |

Estimated full agreed scope: approximately 40–68 focused engineering days using these ranges. The owner removed external adapters; do not add that former scope back into the estimate. Re-estimate after M0 using actual app-only coverage and founders/trial billing requirements. Full-scope launch should not be represented as a few-day change. If a fixed date is essential, reconcile date, staffing and scope explicitly.

Fastest sequence: prove collection/auth early; freeze role and tenant contracts; build one shared permissions service and one adapter interface; reuse existing generators and compliance engine; keep PRs independently verifiable; prepare billing/sender/provider onboarding while technical work proceeds. Integrations may be built independently once contracts are stable, if staffing is available. Do not omit promised features to hit a date.

**Calendar risk:** the full-scope estimate can extend beyond 1 November 2026. Do not sell an unavailable product or silently reduce scope to preserve the founders window. Reconcile the offer cutoff with the measured launch forecast after M0; changing the owner's date requires an explicit decision.

## 12. Repository work map

- Preserve src/lib/msal-config.ts behavior for Hobby; introduce a paid identity configuration and explicit paid API authorization module.
- Do not reuse src/lib/auth-middleware.ts's unverified logging decode as security validation.
- Split paid routes from existing Graph-forwarding routes under src/app/api/intune; add workspace/customer-scoped API routes.
- Introduce server-only database client/repositories. Keep src/lib/supabase.ts's existing public telemetry client outside paid-data access.
- Extract collection steps from src/lib/intune-detailed-client.ts and streaming route orchestration into resumable worker operations.
- Reuse src/lib/intune-policy-registry.ts and compliance engine; add snapshot/normalizer/ruleset version tracking rather than duplicating coverage lists.
- Refactor src/hooks/use-export-handler.ts orchestration from PDF/Word serialization. Test worker and browser outputs from the same fixtures.
- Add paid dashboard, settings/team/billing, standards/audit, portfolio and customer-portal routes/components.
- Add migration history, fixtures, integration contract tests and a non-production test environment. Never develop schema changes against production by default.
- Extend .github/workflows/ci.yml with authorization/isolation, billing/worker and browser checks as implemented. Preserve existing lint/types, tests, build and Docker validation.
- Add release notes under docs/releases matching the tag because release.yml reads that exact path and publishes tagged Docker images.

## 13. Verification and release gates

### Functional and security scenarios

- Microsoft business accounts from two independent organizations can sign in; personal Microsoft identities are rejected for paid identity.
- Wrong audience, forged/expired token and token for another API are rejected; key rotation works.
- Same-company uninvited user cannot read membership, reports, customer names or files.
- A role/customer-scope downgrade is effective next request; no cross-workspace access via IDs, exports, job retries, API credentials or storage paths.
- Invites cannot be replayed, accepted by an unverified different recipient, or used to exceed inviter authority. Last Owner cannot be removed.
- Customer A consent cannot bind customer B; incomplete consent is visible and no collector runs on an unverified connection.
- Failed/partial collection produces no false deletions or healthy claims. Worker crash retries once logically and does not duplicate reports/tickets/charges.
- Revoked Microsoft permission and expired credential produce actionable health states without losing last good history.
- Historical report output does not fetch current data. PDF and DOCX render correctly with large policies, branding, partial data and framework notes.
- Email delivery, scoped API and outbound webhooks pass end-to-end checks; replay and throttle failures are exercised.
- Monthly/annual quantities, rounding, checkout failure, duplicate/out-of-order billing events, trial expiry and downgrade are tested.
- Retention, cancellation export period, deletion and backup restoration are verified with test records.
- Hobby retains all existing features/privacy and Docker starts without paid-service configuration.

### Operational evidence before public launch

Proposed soak: at least 7 consecutive days of daily collection across representative small, large and multi-tenant setups, including induced transient failures. Track end-to-end completion/freshness, queue age, report delivery, false drift, consent failure and cost per tenant. Run a simulated monthly/QBR cycle rather than waiting a quarter. Zero known cross-customer authorization failures; no unresolved high-impact data-loss or billing defects.

Create runbooks for Graph outages/throttling, worker backlog, lost delivery, billing reconciliation, credential rotation, member recovery, data export/deletion and incident communication. Make collection/report/billing kill switches independent. Pause jobs and sends during an incident without making Hobby unavailable.

### Git, deployment and release

1. Validate each PR's exact current head SHA, reviews, unresolved feedback, mergeability and all required checks. At least one relevant current-head PR check must succeed.
2. Run existing checks plus new feature-appropriate integration/browser checks. Never merge on stale or absent checks.
3. Merge only after successful terminal states. Monitor every default-branch build/deployment and verify the resulting commit.
4. Use additive migrations before code rollout. Keep old application versions compatible during deployment. Rehearse rollback without destructive schema reversal.
5. Verify deployed Hobby and paid flows at their intended origins, with analytics/chat isolation and no cached authenticated data.
6. Publish substantive user-facing release notes only after successful CI and confirmation of version/tag, target commit, repository visibility, and stable/prerelease status.
7. Monitor tag/release-triggered packaging and publication to completion, including both Docker architectures; verify release contents and target commit.
8. Open public paid enrollment with the founders offer only after all launch scope and gates pass. An internal feature flag is not feature completion.

## 14. Success criteria and financial check

Measure paid activation (first successful connection and report), team invitation acceptance, weekly active workspaces, collection freshness, useful drift rate, report delivery, support burden, trial-to-paid conversion and renewal. Define numeric commercial targets after pilot/customer volume is known; do not invent proven demand.

Measure monthly tenant costs: worker execution, Graph retries, database/index growth, object storage/backups, report rendering, email, API delivery, payment fees and support. Compare base Enterprise and MSP economics separately, especially MSP extra tenants at $20/month. Twelve months of data and unlimited seats require volume tests, not unlimited unmeasured processing promises.

The launch is complete when the full contracted feature table works end to end, customer isolation and cancellation/deletion are verified, purchases activate correct entitlements, releases/deployments pass, and support can operate the service. Operational interpretations above must be finalized before checkout terms and production behavior are published.

## 15. Sources and evidence limits

Repository evidence inspected: README.md, package.json, vercel.json, src/lib/msal-config.ts, src/lib/auth-middleware.ts, src/lib/supabase.ts, src/env.js, src/app/api/intune/detailed-configurations-stream/route.ts, src/lib/intune-detailed-client.ts, src/hooks/use-export-handler.ts, PDF/Word generators, compliance README, CI and release workflows, tasks/lessons.md.

Current official references reviewed:

- [Microsoft OIDC account audiences](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc): organizational audience and identity protocol.
- [Microsoft API access tokens](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens): resource-specific validation.
- [Microsoft client credentials](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-client-creds-grant-flow): unattended application access and consent.
- [Supabase row security](https://supabase.com/docs/guides/database/postgres/row-level-security): policy behavior and privileged bypass.
- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres): backend pooling options.
- [Vercel Cron](https://vercel.com/docs/cron-jobs): scheduler triggers and operational limits.

Read-only Supabase list/get calls verified the project named IntuneDocumentation is ACTIVE_HEALTHY in eu-central-1. No production tenant, billing provider, deployment configuration or vendor sandbox was modified or live-validated. Local environment files did not expose a Supabase URL to bind the deployed app to that named project, so verify deployment configuration before migration. Exact Graph coverage/scopes and sender/webhook behavior remain M0/M5 implementation evidence, not claims established by this document.
