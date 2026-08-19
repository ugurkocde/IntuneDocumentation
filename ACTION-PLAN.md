# SEO Action Plan

Based on the full audit of https://intunedocumentation.com/ on 2026-08-19.

> The implementation delivered with this plan completes the high-priority technical items and selected UX quick wins. The remaining content growth, field-data monitoring, and bundle-reduction work stays in the backlog.

## High priority — complete within one week

| Action                                                                                                                      | Owner                | Effort | Success check                                                         |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------- | -----: | --------------------------------------------------------------------- |
| Add self-referencing canonical and Open Graph URL metadata to all child routes                                              | Engineering          |      S | Each of 5 sitemap URLs declares itself canonical                      |
| Decide `/dashboard` indexability; either create a unique landing page or apply `noindex, follow` and remove it from sitemap | Product + SEO        |    S–M | Metadata, sitemap, and page purpose agree                             |
| Remove global BreadcrumbList; emit accurate route-level breadcrumbs only where appropriate                                  | Engineering          |      S | No homepage/404 breadcrumb; legal pages identify themselves correctly |
| Scope WebApplication schema to homepage and remove HowTo JSON-LD                                                            | Engineering          |      S | Rich Results/schema validation shows only page-relevant entities      |
| Remove `Disallow: /_next/` and unnecessary `/static/` block                                                                 | Engineering          |     XS | Googlebot can fetch CSS/JS resources                                  |
| Add core security headers with an auth-compatible CSP                                                                       | Engineering/Security |      M | Live header check passes without breaking Microsoft sign-in           |

## Medium priority — complete within one month

| Action                                                                                            | Owner                 | Effort | Success check                                         |
| ------------------------------------------------------------------------------------------------- | --------------------- | -----: | ----------------------------------------------------- |
| Rewrite homepage title to ~50–60 characters and description to ~150–160 characters                | Content               |     XS | Unique, accurate, non-truncated SERP copy             |
| Add unique dashboard title, description, H1, and social metadata if it remains indexable          | Content + Engineering |      S | No homepage duplication                               |
| Generate sitemap `lastmod` from meaningful content updates and remove ignored priority/changefreq | Engineering           |      S | Dates match actual page revisions                     |
| Add `/llms.txt` with 200 text/plain response and curated authoritative links                      | Content + Engineering |     XS | File resolves and links remain valid                  |
| Add named expert reviewer, review date, source citations, and a versioned coverage matrix         | Product/Content       |      M | Major technical/security claims have visible evidence |
| Replace dynamic privacy effective date with a fixed revision date                                 | Legal + Engineering   |     XS | Date changes only on material policy revision         |
| Align coverage/security claims across visible copy, schema, social metadata, and indexed snippets | Product/Content       |      M | No contradictory architecture or stale numeric claims |

## Performance and UX backlog

| Action                                                                        | Effort | Expected impact                                |
| ----------------------------------------------------------------------------- | -----: | ---------------------------------------------- |
| Track CrUX p75 LCP, INP, and CLS through Search Console or CrUX tooling       |      S | High confidence; protects excellent lab result |
| Make runtime config non-blocking or safely inline it                          |      S | Small LCP/headroom improvement                 |
| Reduce client boundaries and dynamically load below-fold/modal/dashboard code |    M–L | Better slow-device INP and payload efficiency  |
| Compact the mobile cookie banner and give Accept/Decline equal visual clarity |      S | Better first-viewport SXO and trust            |
| Deprioritize the below-fold duplicate Microsoft sign-in asset                 |     XS | Minor network-priority improvement             |

## Content growth opportunities

1. Publish a durable “Intune documentation for audits” page with sample output, coverage, limitations, and authoritative references.
2. Create an MSP handover/use-case page focused on repeatable tenant documentation and branded reports.
3. Create a focused Intune policy export guide that compares manual export, Microsoft scripts, and this hosted/self-hosted workflow fairly.
4. Surface changelog/release proof and independent community mentions near claims that benefit from corroboration.

## Measurement plan

After the high-priority release:

1. Re-crawl all five routes and validate canonical, robots, headings, and JSON-LD.
2. Submit the sitemap and inspect representative URLs in Google Search Console.
3. Monitor canonical selection, indexed-page count, impressions, CTR, and branded/non-branded queries for 28 days.
4. Record CrUX p75 LCP, INP, and CLS monthly; targets are LCP <2.5s, INP <200ms, CLS <0.1.
5. Capture a drift baseline after deployment so future metadata/schema regressions are detectable.

## Acceptance criteria

- No indexable child page canonicalizes to `/`.
- No route emits irrelevant global breadcrumb or application schema.
- Dashboard indexability is explicit and consistent across meta robots and sitemap.
- Search crawlers can fetch required Next.js resources.
- All five route titles/descriptions are intentional and non-duplicative.
- Field CWV status is measured rather than inferred from lab data.
