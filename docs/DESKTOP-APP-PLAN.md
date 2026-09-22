# Desktop app plan

Status: planned. Decisions below are agreed and locked unless a phase explicitly
revisits them.

## Purpose

The hosted and self-hosted web app require a Microsoft Entra app registration
that is not the customer's own, plus interactive sign-in through the browser.
Some customers operate under strict access policies where this is not acceptable,
and they do not want to maintain a Docker environment. This plan adds a paid
desktop application for macOS and Windows that runs collection locally, so tenant
configuration and tokens never reach our infrastructure, and that uses only the
customer's own app registration.

## Locked decisions

| Area | Decision |
| --- | --- |
| Product | Paid desktop app (Electron) for macOS and Windows, sold as a subscription |
| Commercial model | Annual organization subscription with an included operator allowance, plus an MSP tier for work across customer tenants |
| Paid value over free | Local execution (no tenant data to us), tenant history and diffing, multi-tenant and client management, scheduled and repeatable reporting |
| Hosted auth | Unchanged: our vendor-owned multi-tenant public client with interactive sign-in |
| Desktop auth | Customer-owned Entra app registration only. Delegated interactive by default, app-only certificate or secret as an opt-in for controlled machines, MSP, and scheduled runs |
| Borrowed identity | Not used. The Microsoft Graph CLI Tools client id is dropped entirely |
| Framework content | Ship public-domain and permissively licensed frameworks; ISO, SOC 2, and Def Stan referenced by identifier with original summaries; CIS excluded until licensed |
| Repository | Monorepo in this public repository using npm workspaces. Licensed or closed content moves to a private package later, not now |
| Distribution | Signed and notarized installers, authenticated auto-update, Apple Developer and Azure Trusted Signing already available |

## Non-goals

- No vendor-owned Entra application and no borrowed client id in the desktop app.
- No customer-side app registration for the hosted app. Hosted keeps the vendor app.
- No anti-tamper or DRM investment. The source is public under Elastic-2.0; the
  gate is contractual and trust based.
- No CIS Benchmarks or CIS Controls content until a commercial license exists.
- No PowerShell collector in the first release. Revisit only if a pilot requires it.

## Target architecture

Electron, single codebase, shared packages. The main process owns all privileged
work; the renderer never receives tokens or unredacted secrets.

```
apps/
  web/            existing Next.js app (consumer)
  desktop/        Electron main + preload + renderer (consumer)
packages/
  core/           Graph collection, parsing, policy registry, redaction  (auth-agnostic)
  exporters/      PDF and DOCX generators
  auth/           collection and authenticated-request adapters (not a token provider)
  license/        Polar entitlement and offline grace
  ui/             framework-agnostic dashboard components
```

- Main process: auth, token cache in OS-protected storage, Graph collection,
  redaction, licensing, auto-update.
- Preload: thin typed `contextBridge` API. `sandbox: true`, `contextIsolation: true`,
  no renderer Node access.
- Renderer: share dashboard React components with the web app. Replace the
  server-sent-events boundary with typed IPC (`collection:progress`,
  `collection:section`).

## Authentication

Hosted and desktop intentionally differ. The trust level of the data flow
determines the identity.

- Hosted app: vendor-owned multi-tenant public client, delegated interactive
  sign-in, transient server-side processing. This is the existing behavior.
- Desktop app: customer-owned app registration. Two flows:
  - Delegated interactive (default). Runs as the signed-in administrator's own
    Intune role, and is the safer choice on an endpoint.
  - App-only certificate or secret (opt-in). Enables unattended and scheduled
    collection, but places a tenant-wide read credential on the machine. Only
    recommended on controlled hosts and in MSP scenarios.

The app must include a setup wizard that documents the exact delegated or
application permissions, supports admin consent, and validates the registration
with actionable errors. No shared or borrowed identity is used anywhere.

## Subscription and licensing

- Polar subscription with license keys. Annual organization tier plus an MSP tier.
- Activation uses a license key plus a random installation id. The activation id
  is stored in OS-protected storage.
- Bounded offline grace. Distinguish network failure from confirmed revocation.
  Never interrupt an already authorized collection or export. Generated documents
  remain accessible after expiry.
- Entitlement is enforced in the privileged main-process handlers, never only in
  the renderer.
- No privileged Polar credentials in the application. Merchant secrets stay in CI
  and server-side services.
- Before implementation, define the full lifecycle: trial, cancellation,
  paid-through, failed payment, grace, refunds, revocation, ownership transfer,
  and reactivation.

## Framework licensing

Maintain a per-publication rights register covering edition, attribution,
modification, and redistribution inside customer reports.

- Include: NIST (public domain), ASD Essential Eight (CC BY 4.0), NCSC Cyber
  Essentials (Open Government Licence v3.0), BSI IT-Grundschutz (verify terms).
- Reference by identifier with original summaries: ISO/IEC 27001, SOC 2, UK MOD
  Def Stan 05-138.
- Exclude until licensed: CIS Benchmarks and CIS Controls.
- No framework logos. No certification or endorsement claims. Output remains
  evidence statements, never a compliance verdict.
- Independent practitioner review of mappings before the paid pilot.

## Security and privacy

- Tokens only in the main process, in an OS credential store. Never plaintext,
  logs, command arguments, or the renderer.
- Validate IPC payloads and senders, allowlist operations, and enforce
  entitlements in privileged handlers. Treat tenant-supplied text as untrusted.
- Preserve redaction, tenant isolation, and explicit partial-collection warnings
  end to end.
- Reports memory-only by default. Qualify the claim: crash dumps, swap, temp
  files, and explicitly saved reports all exist. Optional persistence must be
  encrypted with purge controls.
- Telemetry off by default. Keep activation traffic disclosed and distinct.
- Accurate privacy claim: tenant configuration and tokens are never sent to our
  infrastructure. Not "nothing leaves the device."

## Distribution and release

- `electron-builder` targets: macOS `dmg`/`pkg`, Windows `nsis`/portable.
- macOS signing and notarization with the existing Apple Developer account.
- Windows signing through Azure Trusted Signing.
- `electron-updater` with signature verification, staged rollout, and a rollback
  path. Provide an administrator-controlled or manual update route for locked-down
  fleets.
- Desktop releases are tagged separately, for example `desktop-v1.0.0`, and built
  by a dedicated signed-release workflow. Secrets live only in GitHub Actions.
- Keep the Docker self-host and Vercel web deployments working through the
  monorepo migration.

## Phased plan

### Phase 0, contracts and gates

Deliverables: subscription contract spec; paid-versus-free differentiation;
committed framework rights register; BSI reuse basis resolved; private-package
boundary designed for licensed content. No application code.

Acceptance: written and approved. This gates all coding.

### Phase 1, vertical slice on both platforms

Deliverables: minimal Electron shell; customer-owned delegated interactive
sign-in; collect one policy family; preserve partial failures; export PDF and
DOCX with existing generators; dev install and a basic update on Windows and
macOS.

Validate: paging, throttling, cancellation, tenant switching, token expiry, and a
large report.

Acceptance: the full slice runs end to end on both operating systems.

### Phase 2, auth modes and hardening

Default delegated interactive with a customer-owned app; app-only certificate or
secret as an opt-in; setup wizard and permission validation; collection-boundary
adapter interface.

Acceptance: documented scenario matrix passes, including consent states,
Conditional Access, tenant switching, and token renewal.

### Phase 3, monorepo extraction

Move to `apps/web`, `apps/desktop`, `packages/core|exporters|auth|license|ui`.
Introduce an explicit token renewal strategy where the Graph client currently
captures a fixed token (`src/lib/graph-client.ts`). Abstract authenticated
requests in the export resolver (`src/lib/client-export-resolver.ts`). Update
Vercel root, Dockerfile, CI, `outputFileTracingRoot`, and bundle the Electron main
process with esbuild to avoid workspace symlink issues.

Acceptance: web deploys, desktop slice still passes, CI green.

### Phase 4, subscription licensing

Polar activation, validation, bounded offline grace, trial, deactivation, and
transfer. Entitlement enforcement in privileged handlers. Sandbox verification of
the full lifecycle defined in Phase 0.

Acceptance: lifecycle matrix passes; generated documents remain accessible after
expiry.

### Phase 5, distribution, signing, and updates

Windows Azure Trusted Signing, macOS notarization, authenticated auto-update,
staged rollout, rollback, and enterprise deployment documentation including proxy
compatibility.

Acceptance: signed and notarized installers on both platforms with a verified
update and rollback.

### Phase 6, security and compliance hardening

IPC validation and allowlist, entitlements in main, untrusted tenant text, exports
off the main event loop, memory-only qualification, telemetry defaults, and
redacted support bundles.

Acceptance: security checklist complete.

### Phase 7, paid desktop pilot

Pre-purchase authentication diagnostics, a real customer or MSP pilot, and a
feedback loop into scope.

Acceptance: pilot customer completes setup, collection, and export; findings
triaged.

## Primary risks

| Risk | Mitigation |
| --- | --- |
| Setup friction from customer-owned registration reduces adoption | Excellent setup wizard, documented permissions, actionable validation errors |
| App-only credentials on endpoints | Default to delegated interactive; app-only is opt-in and documented |
| Free hosted app cannibalizes the paid desktop | Paid differentiation: local execution, history and diffing, MSP multi-tenant, scheduled reports |
| Subscription renewal value is thin | Sell recurring outcomes; validate with MSP pilots |
| Monorepo migration breaks Vercel or Docker | Dedicated migration phase, existing Docker CI job as the early warning |
| Graph beta API drift | Registry-driven endpoints; continuous maintenance is the product value |
| Licensed framework content leaks into the public repo | Private-package boundary from day one; rights register |
| Client-side gate is bypassable | Accept; rely on trust, maintenance, and ELv2 contractual terms |

## References

- Product repository: the current web app, collection engine, and exporters.
- Authentication research: vendor-owned multi-tenant apps are the norm for SaaS;
  customer-owned registrations are the norm for installed and self-hosted tools.
- POLAR license keys: activation, validation, and subscription-linked revocation.
