# Full SEO Audit: Intune Documentation

**Site:** https://intunedocumentation.com/
**Audit date:** 2026-08-19
**Scope:** All five sitemap URLs, homepage-discovered internal links, live HTTP responses, rendered HTML, repository implementation, structured data, mobile/desktop Lighthouse, visual UX, GEO, and SXO.
**Business type:** Free B2B SaaS/web application and open-source Microsoft Intune administration tool.
**Overall SEO health score:** **74/100**

> This report records the pre-remediation state observed during the audit. The accompanying implementation subsequently addressed the route metadata, structured data, crawler access, sitemap, security-header, legal-date, and tablet-navigation findings described below.

## Executive summary

The site is fast, crawlable, visually polished, and unusually strong on trust explanations for a free administration tool. Its main SEO weakness is not content or speed; it is route-level metadata architecture. Four child pages declare the homepage as canonical, while global structured data labels every page, including legal pages and 404s, as the application and as `Home > Dashboard`. This creates strong consolidation and relevance conflicts.

No critical indexing block was found. The highest-impact work is to fix page-specific canonicals and metadata, scope structured data by route, and decide whether `/dashboard` should be an indexable landing page or a noindex application surface.

### Category scores

| Category                  | Weight | Score | Status                       |
| ------------------------- | -----: | ----: | ---------------------------- |
| Technical SEO             |    22% |    68 | Needs improvement            |
| Content quality / E-E-A-T |    23% |    76 | Good                         |
| On-page SEO               |    20% |    67 | Needs improvement            |
| Schema / structured data  |    10% |    45 | Poor                         |
| Performance / CWV         |    10% |    85 | Good; field data unavailable |
| AI search readiness       |    10% |    84 | Good                         |
| Images                    |     5% |    91 | Excellent                    |

The weighted score is rounded. Performance is deliberately scored below the 99/100 Lighthouse result because CrUX p75 field LCP, INP, and CLS were unavailable.

### Top five issues

1. **High:** Four child URLs canonicalize to the homepage despite being indexable and listed in the sitemap.
2. **High:** Global breadcrumb and WebApplication schema are irrelevant or incorrect on every non-home route and on 404 output.
3. **High:** `/dashboard` duplicates homepage metadata, has no server-rendered H1, and lacks a clear index/noindex strategy.
4. **High:** `robots.txt` blocks `/_next/`, risking crawler access to render-critical assets.
5. **High:** `llms.txt` is missing, and freshness/architecture claims are inconsistent across current HTML, stale search excerpts, schema dates, and sitemap dates.

### Quick wins

1. Add self-referencing canonicals and route-correct Open Graph URLs.
2. Remove the global breadcrumb and emit breadcrumbs only on appropriate inner pages.
3. Remove homepage HowTo markup and set realistic expectations for FAQ markup.
4. Shorten the 70-character homepage title and 232-character description.
5. Remove `Disallow: /_next/`, update meaningful `lastmod` values, and add `llms.txt`.

## Crawl and indexation

The sitemap contains five URLs and all returned HTTP 200:

- `/`
- `/dashboard`
- `/privacy-policy`
- `/terms`
- `/impressum`

The repository route inventory also contains these five non-API pages, so sitemap route coverage is 5/5. HTTP redirects once to HTTPS, `www` redirects once to the apex domain, and `/dashboard/` normalizes in one hop. A deliberate unknown path correctly returned 404.

### Canonicals and alternates

| URL               | Current canonical | Finding         |
| ----------------- | ----------------- | --------------- |
| `/`               | `/`               | Correct         |
| `/dashboard`      | `/`               | High: incorrect |
| `/privacy-policy` | `/`               | High: incorrect |
| `/terms`          | `/`               | High: incorrect |
| `/impressum`      | `/`               | High: incorrect |

The cause is the global `metadata.alternates` definition in `src/app/layout.tsx`. The same inheritance makes `en` and `en-US` hreflang declarations on child routes point to the homepage. Because no translated route set exists, remove hreflang; `lang="en"` is sufficient.

### Robots and sitemap

`robots.txt` is reachable, permits normal crawling, and references the absolute sitemap URL. However:

- Remove `Disallow: /_next/` so search engines can fetch render-critical Next.js resources.
- Remove `/static/` unless it protects genuinely private/non-render resources.
- `Allow: /dashboard` is redundant after `Allow: /`.
- `Crawl-delay` is ignored by Google; the `Cache-Control:` line inside the file is not an HTTP cache directive.
- AI crawlers currently inherit `User-agent: *` access. Document explicit bot policy if this is intentional.
- Sitemap `lastmod` values are stale for home, dashboard, privacy, and terms. Generate them from meaningful content changes.
- Remove ignored `<priority>` and `<changefreq>` fields for a simpler sitemap.

## On-page SEO

| URL               |        Title |  Description |  H1 | Key issue                            |
| ----------------- | -----------: | -----------: | --: | ------------------------------------ |
| `/`               |     70 chars |    232 chars |   1 | Both snippets are likely to truncate |
| `/dashboard`      | Same as home | Same as home |   0 | Duplicate and non-descriptive        |
| `/privacy-policy` |     37 chars |    158 chars |   1 | Canonical points home                |
| `/terms`          |     35 chars |    123 chars |   1 | Canonical points home                |
| `/impressum`      |     47 chars |    127 chars |   1 | Canonical points home                |

The homepage has substantial server-rendered content (about 1,791 words), one H1, six H2s, clear navigation, and no broken internal HTTP links in the tested crawl. Its answer-first sections and FAQ match tool-search intent well.

For `/dashboard`, make an explicit decision:

- **Indexable landing page:** add a unique title, description, canonical, Open Graph metadata, one descriptive H1, and meaningful anonymous copy.
- **Authenticated utility:** set `noindex, follow` and remove it from the sitemap. Do not block it in robots, because crawlers need to see the noindex directive.

## Structured data

**Score: 45/100**

All JSON-LD parsed successfully, but route relevance is poor:

- The homepage emits WebApplication, BreadcrumbList, FAQPage, and HowTo.
- Every child page emits the same WebApplication and `Home > Dashboard` breadcrumb.
- The global schemas also leak into the 404 page.

Actions:

1. Keep WebApplication on the homepage only; add stable `@id` values and link Organization/WebSite identities where useful.
2. Remove the global BreadcrumbList. Omit it on home; create route-correct breadcrumbs only on inner pages where the hierarchy is visible and truthful.
3. Remove HowTo JSON-LD. Google removed HowTo rich results, though the visible three-step content should remain.
4. FAQPage markup is syntactically valid but this commercial software site is not eligible for Google's restricted FAQ rich results. Keep it only for semantic/GEO value, not for expected Google enhancements.
5. Replace the hard-coded WebApplication `dateModified` (`2025-10-01`) with a truthful release/content date.

## Content quality and E-E-A-T

**Score: 76/100** — Experience 17/25, Expertise 20/25, Authority 17/25, Trust 22/25.

Strengths include a named legal operator, address/contact information, privacy and terms pages, open-source repository, detailed permission explanations, redaction behavior, and transparent hosted/self-hosted options. The homepage provides direct answers and detailed coverage suitable for both users and AI retrieval.

Gaps:

- Add a visible named reviewer/maintainer with relevant Microsoft Intune experience and a truthful last-reviewed date.
- Link security and Microsoft Graph claims to authoritative Microsoft documentation and public architecture/source evidence.
- Substantiate claims such as “minutes, not hours,” “trusted worldwide,” and changing coverage counts with a versioned coverage matrix, methodology, or public evidence.
- The privacy page derives its effective date from the current date. Use a fixed policy date changed only when the policy materially changes.
- Create focused pages for distinct search intents such as Intune audit documentation, MSP handover documentation, and Intune policy export instead of expecting one long homepage to satisfy every query.

## Performance and Core Web Vitals

One Lighthouse 13.0.1 run of the homepage produced:

| Profile | Performance |  FCP |  LCP |  TBT | CLS | Speed Index |
| ------- | ----------: | ---: | ---: | ---: | --: | ----------: |
| Mobile  |          99 | 1.0s | 2.1s | 60ms |   0 |        1.0s |
| Desktop |         100 | 0.3s | 0.6s |  0ms |   0 |        0.4s |

Lab LCP and CLS pass. INP and overall field CWV status are **unknown**: PageSpeed/CrUX requests returned HTTP 429 quota exhaustion, and no Google API credentials were configured. TBT is not an INP substitute.

Residual opportunities:

- A render-blocking stylesheet transfers about 14.4 KB (79.9 KB decoded), plus a small synchronous runtime config script.
- Lighthouse estimated about 84 KiB unused JavaScript and up to roughly 450 ms potential savings.
- Raw uncompressed linked CSS/JS totaled roughly 1.1 MB across the main pages. Reduce client boundaries and dynamically load below-fold/modal/dashboard code where practical.
- Monitor CrUX p75 LCP, INP, and CLS after sufficient real-user traffic is available.

## Visual UX and SXO

**SXO score: 86/100.** Mobile and desktop screenshots showed a clean hierarchy, strong contrast, clear primary and sample-report CTAs, useful trust badges, and no visible horizontal overflow or layout shift.

The main mobile concern is the cookie banner, which occupies roughly the bottom quarter of the initial viewport and visually favors Accept over a small Decline control. Make both choices equally legible, compact the banner, and avoid obscuring trust details.

The page format aligns strongly with mixed informational/tool intent. Persona fit was strongest for Intune administrators (92/100), followed by self-hosters (86), MSPs/auditors (84), and security reviewers (80). A comparison table covering manual documentation, Microsoft's scripts, and hosted/self-hosted use would help evaluators.

## Images

**Score: 91/100.** Across 11 rendered `<img>` instances, none lacked alt text or dimensions. Decorative marks correctly use empty alt text, and assets are small SVGs or optimized PNGs. The 1200×630 Open Graph PNG is about 86 KB.

Improvements:

- The Microsoft sign-in asset appears twice with eager/high-priority loading; reserve priority for the above-fold instance.
- The global Open Graph image/alt text describes the homepage and is semantically wrong on legal routes. Use route-specific social metadata or neutralize it where sharing value is low.

## AI search / GEO readiness

**Score: 84/100.** Raw HTML is fully server-rendered, headings are clear, direct-answer passages are strong, crawler access is open by default, and Organization links provide useful entity corroboration.

`https://intunedocumentation.com/llms.txt` returns a real 404. Add a concise text/plain file linking to the homepage, security/privacy explanation, sample report, self-hosting guide, FAQ, changelog, and authority/contact pages. This is an AI-discovery aid, not a replacement for normal crawlability or structured data.

Freshness and consistency need attention: current copy describes transient server processing and expanded coverage, while stale indexed excerpts and hard-coded metadata still reflect older architecture/count claims. Align public copy, schema, sitemap dates, and release evidence, then request recrawling through Search Console when available.

## Security and delivery observations

HTTPS and HSTS (`max-age=63072000`) are present. The live homepage did not expose CSP, X-Frame-Options/frame-ancestors, X-Content-Type-Options, Referrer-Policy, or Permissions-Policy, and it exposes `x-powered-by: Next.js`. Add appropriate headers, carefully allowing required Microsoft authentication endpoints in CSP.

These are primarily security hardening items rather than direct ranking factors, but they reinforce trust and reduce avoidable delivery risk.

## Data limitations

- Google Search Console, GA4, PageSpeed API, and CrUX API credentials were not configured.
- PSI/CrUX attempts hit HTTP 429 quota exhaustion, so no field CWV or indexation/performance analytics were available.
- Moz and Bing Webmaster backlink credentials were unavailable; no authoritative DA/PA, spam, anchor, or complete referring-domain analysis is claimed.
- No historical SEO drift baseline exists.
- Lighthouse screenshots covered static homepage states; authenticated dashboard interactions and real-device behavior were not exercised.

## Evidence consulted

- Live homepage: https://intunedocumentation.com/
- Robots: https://intunedocumentation.com/robots.txt
- Sitemap: https://intunedocumentation.com/sitemap.xml
- Repository metadata/schema: `src/app/layout.tsx`
- Homepage content/schema: `src/app/home-page.tsx`
- Robots/sitemap sources: `public/robots.txt`, `public/sitemap.xml`
- Google structured data policies: https://developers.google.com/search/docs/appearance/structured-data/sd-policies
- Google breadcrumb documentation: https://developers.google.com/search/docs/appearance/structured-data/breadcrumb
- Google robots guidance: https://developers.google.com/search/docs/crawling-indexing/robots/intro
