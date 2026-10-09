# Threat model

## What this project does and where untrusted input enters

Intune Documentation reads a Microsoft Intune tenant through Microsoft Graph and turns its configuration into PDF, DOCX and compliance evidence reports. It ships as two products built from this repository:

- **Web app** (`src/`, Next.js App Router). Hosted on Vercel and self-hostable through the root `Dockerfile`. Users sign in with MSAL in the browser; Graph access tokens stay client-side except where they are sent as a Bearer header to the `/api/intune/*` routes, which call Graph on the user's behalf and never store the token.
- **Desktop app** (`apps/desktop/`, Electron). A paid product licensed through Polar. It signs in with `@azure/msal-node` over a loopback redirect, talks to the renderer through IPC, and updates itself through `electron-updater` from `/api/desktop-update`.

Untrusted input enters through:

- Every HTTP request to `src/app/api/**` (request bodies, query strings, headers including `Host` and `x-forwarded-for`, bearer tokens and Entra ID tokens).
- `src/middleware.ts` and `src/lib/site-boundary.ts`, which split the site into a public origin and an app origin by `Host` and set the CSP.
- Microsoft Graph responses. Treat tenant data as attacker-controlled: any Intune admin, or anyone who can name a policy, app, group or script, controls strings that end up in PDF, DOCX, XML and UI output.
- Files a desktop user opens: baseline JSON and crosswalk CSV imports, `license.bin`, and the settings JSON in userData.
- The desktop loopback OAuth listener and the auto-update feed.

## Components that matter most / least

Most important:

- `src/lib/desktop-license/**` and `src/app/api/desktop-license/**`: licence issuance and verification (Ed25519 signing), Polar API calls with the server's access token, rate limiting, organisation licences bound to Entra tenants. Licence forgery, privilege or tenant confusion, and leaking `POLAR_ACCESS_TOKEN` or the signing key are critical.
- `src/lib/entra-id-token.ts` and `src/lib/auth-middleware.ts`: ID token verification (JWKS, algorithm, audience, issuer, nonce, lifetime).
- `src/app/api/intune/**`, `src/lib/graph-request.ts`, `src/lib/intune-detailed-client.ts`: the Graph proxy. Sending the user's token anywhere other than Microsoft Graph, or mixing data between users or tenants, is critical; SSRF that does neither is high.
- `src/app/api/desktop-update/**` and `apps/desktop/src/main/updater.ts`: the update supply chain. Anything that makes the desktop app install a binary not published in this repository's GitHub releases is critical.
- `apps/desktop/src/main/**` and `apps/desktop/src/preload/**`: IPC handlers, sender checks, `shell.openExternal`, navigation and permission hardening, the loopback auth listener, licence verification and file imports.
- `src/middleware.ts`, `src/lib/site-boundary.ts`: CSP and origin separation.
- `src/app/api/support/**`: Turnstile verification and mail sent through Resend (header or recipient injection, abuse as a mail relay).
- `src/app/api/log-tenant`, `src/app/api/stats/**`, `src/lib/supabase.ts`, `src/lib/tenant-tracker.ts`, `src/lib/site-stats.ts`: server-side Supabase writes with the service role key.

In scope but lower value:

- PDF and DOCX generators (`src/lib/pdf-generator-*.ts`, `src/lib/docx-generator-*.ts`, `apps/desktop` export code) and XML handling of Graph data (`src/lib/compliance/applocker.ts`, `src/lib/docx-compatibility.ts`).
- The compliance engine under `src/lib/compliance/`: incorrect pass/fail results are correctness bugs, not security bugs, unless an attacker can force them.

Out of scope:

- Marketing and legal pages (`src/app/_landing`, `impressum`, `privacy-policy`, `terms`, the `desktop` landing page), `src/app/api/pdf/sample`, sample PDFs, `docs/`, `scripts/`, root Markdown and image files.
- Secrets that are meant to be public: `NEXT_PUBLIC_*` values and the output of `/api/config` and `/api/config/script`.

## How to exercise it

- The image builds the web app (`npm run build`) and bundles the desktop app (`apps/desktop`, `npm run build`).
- Tests: `npm run test` (Vitest) from `/src`; typecheck with `npm run check` and `cd apps/desktop && npm run typecheck`.
- API route handlers are plain functions in `src/app/api/**/route.ts` and can be imported and called from a Vitest test with a constructed `Request`. Set required environment variables in the test; `SKIP_ENV_VALIDATION=1` is set in the image.
- There is no live tenant, Polar account or Supabase project available offline. Mock `fetch` for Graph, Polar, Resend, Turnstile and Supabase.

## How you rate severity

- Critical: licence forgery or bypass of licence checks, leaking any server-side secret (`POLAR_ACCESS_TOKEN`, `DESKTOP_LICENSE_SIGNING_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `GITHUB_RELEASES_TOKEN`), leaking or redirecting a user's Graph token, reading one tenant's data from another tenant's session, code execution in the desktop main process, and update feed hijacking.
- High: authentication or ID token verification bypass, SSRF from the Graph proxy that does not carry the user's token or cross tenants, stored XSS in the web app from tenant data, renderer to main process escalation through IPC, `shell.openExternal` with attacker-controlled URLs, CSP or origin split bypass that exposes app routes on the public origin.
- Medium: rate limit bypass, abuse of the support form to send mail to arbitrary recipients, unauthenticated writes that inflate public statistics, content injection into generated PDF or DOCX files that misleads a reader.
- Low: denial of service from large or malformed Graph responses or imported files, information disclosure of non-secret configuration, missing hardening without a demonstrated exploit.

## Anything to leave alone

- Do not report the unverified `jwt.decode` in `extractTenantFromRequest`: it is used only for logging, never for an authorisation decision. Report it if you find a path where the decoded value does drive authorisation.
- Do not report public values (`NEXT_PUBLIC_*`, the Entra client ID, the Supabase anon key) as leaked secrets.
- Do not report that users with Intune admin rights can read their own tenant's Intune configuration; that is the product's purpose.
- Dependency version advisories without a reachable path in this code are not useful.
