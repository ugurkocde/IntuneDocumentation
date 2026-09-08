# Compliance evidence engine

Maps an Intune tenant export to evidence for ISO/IEC 27001:2022, SOC 2, NIST
SP 800-53 rev 5, NIST SP 800-171 revisions 2 and 3, NIST CSF 2.0, BSI IT-Grundschutz,
UK MOD Def Stan 05-138 Issue 4, NCSC Cyber Essentials, and ASD Essential Eight
with target Maturity Levels 1, 2 and 3.

## Design rules

1. **Precision over recall.** Configuration evidence is only claimed when a known setting is
   present with the value that actually enforces the capability, on a policy
   with at least one non-exclusion assignment. Anything unrecognized produces
   no claim in either direction. False negatives are fixed by adding signals to
   `capabilities.ts`; false positives are treated as bugs.
2. **No substring matching.** Settings Catalog signals match
   `settingDefinitionId` exactly and compare the configured choice/simple
   value. Graph property signals match the exact `@odata.type` plus a property
   path and a typed predicate.
3. **Counter-evidence is surfaced.** A setting explicitly configured to the
   non-enforcing value (for example BitLocker set to "not required") is
   reported as `disabled`, never as coverage. Assigned positive and negative
   evidence produces `conflictingEvidence`. This means mixed policy evidence,
   not proof of an effective conflict on a device. Required setting groups,
   such as the three Windows firewall profiles, must occur together on one
   assigned policy. Different policies are not combined into a complete profile.
4. **Assignment-aware.** Enforcing policies that are unassigned (or assigned
   via exclusions only) yield `configuredNotAssigned`, not `enforced`.
   Failed or missing assignment reads yield `assignmentUnknown`. Filters and
   exclusion targets are preserved, and effective coverage remains unverified.
5. **No verdicts.** Output statuses are evidence statements
   (`evidenceFound` / `partialEvidence` / `noEvidence`), never "compliant".
   `COMPLIANCE_DISCLAIMER` must accompany any rendered report.
6. **Mappings are data.** Capability-to-control tables live in `frameworks/`
   and can be reviewed without touching detection logic. ISO/IEC 27001 and the
   SOC 2 Trust Services Criteria are referenced by identifier with original
   summaries. NIST is public domain; BSI mobile Bausteine (SYS.3.2.1,
   SYS.3.2.2) are mapped at
   requirement level, verified against the Edition 2023 Baustein PDFs, while
   the remaining Bausteine stay at Baustein level until verified the same way.
   Only requirements with technical Intune evidence are listed as controls;
   organizational requirements are intentionally absent. Def Stan 05-138 is
   marked "Copying Only as Agreed with DStan", so it is referenced by control
   identifier with original titles and summaries, never the official wording.
   Cyber Essentials is Crown copyright under the Open Government Licence v3.0;
   the five themes serve as identifiers because the document has none, and the
   logo is excluded from the licence. Do not add frameworks that require a
   commercial license (for example CIS Benchmarks or CIS Controls).
7. **Match the control's technical requirement.** Firewall activation is not
   evidence of default-deny rules, password presence is not evidence of
   credential quality, and app-source restrictions are not evidence of an
   executable allow/block list. Def Stan controls 2213, 2409, 2429 and 2507,
   and NIST SP 800-171 requirements 3.4.8 and 3.13.6, are omitted until suitable
   detectors exist. App-source restrictions map to NIST 3.4.9 instead.
8. **Keep findings within the selected framework.** Report deviation and
   unassigned-configuration counts include only capabilities mapped to that
   framework's listed controls. Unmapped capabilities, such as encryption for
   Cyber Essentials, must not affect those counts.

## NIST SP 800-171 revisions

Revision 2 (`nist-800-171-r2`) remains available for CMMC Level 2 and has
supporting mappings for 12 of its 110 published requirements. Revision 3
(`nist-800-171-r3`, May 2024) is a separate assessment with supporting mappings
for 11 of its 97 active requirements. These counts describe mapping coverage,
not satisfied requirements or a compliance score. Unmapped requirements need
separate assessment, including requirements that cannot be assessed through
Intune. Neither report produces a CMMC certification or an SPRS score.

Revision 3 is independently mapped to the [official NIST publication](https://csrc.nist.gov/pubs/sp/800/171/r3/final).
It combines mobile encryption under 03.01.18, transmission and storage
confidentiality under 03.13.08, and periodic scanning under 03.14.02. Withdrawn
requirements are not retained as active controls. MFA maps to 03.05.03, not to
ordinary password requirements. Only application-control enforcement supports
03.04.08; app-source restrictions alone do not establish allow-by-exception.

Organization-defined parameters (such as remediation periods and scan
frequencies), effective enforcement and remaining requirement elements are
explicitly unassessed. A configured 14-day update schedule does not establish
that an organization's required remediation period is met. Revision 3 is not
an automatic replacement for Revision 2 in CMMC assessments; see the
[official CMMC FAQ](https://dodcio.defense.gov/cmmc/FAQs/).

## Evidence semantics and scope (ruleset 2026.09.2)

`CapabilityEvidence.kind` distinguishes a configuration setting, a compliance
requirement and an access policy. The legacy `enforced` identifier means a
recognized setting is configured on an assigned policy; the displayed label is
"Setting configured and assigned". Compliance requirements use
`requirementAssigned`. Neither status proves a device's actual state.

A compliance scheduled action named `block` marks a device noncompliant after
its grace period. It does not prove resource access is blocked. Enabled
Conditional Access policies are assessed independently, including grant
operators and preserved conditions. Report-only, disabled and optional OR
grants are not counted as mandatory requirements. Effective sign-in access is
always unverified by this configuration-only engine.

Pass `assessmentScope` on an export, or the second argument to
`assessCompliance`, to select platforms and a Def Stan risk level. The dashboard
provides these controls. Policy absence and empty inventory counts never
automatically exclude platforms. Platform-specific BSI requirements outside
scope become `notApplicable`; a general control lacking a detector for the
selected platform becomes `notAssessed`. Outside-scope controls do not affect
the applicable denominator or deviation counters. Tenant access capabilities
are independent of endpoint platform selection.

Framework controls carry evidence strength, mapping granularity, publisher
references and explicitly unassessed aspects. Supporting mappings stay partial
even when every registered detector matches. A minimum OS version does not
establish hardware support or patch currency. Update deadline evidence checks
the configured timing tuple and pause state, not actual release-to-install
time. Scan evidence checks a configured scan type, day and time, not execution.
All frameworks remain selected technical subsets, not complete audit programs.

## Collection, formats and provenance

The collector preserves partial relation pages and records relation errors.
Policy-level assignment status survives exported data, so a failed request
cannot become a confirmed empty assignment. Security baselines now collect
their actual `/settings` relation separately from category metadata.

Compliance scheduled actions are read by expanding the parent policy with
`scheduledActionsForRule($expand=scheduledActionConfigurations)`, avoiding the
direct relation GET rejected by some Intune backends. Both expanded collections
follow continuation links. Missing or failed action reads are explicitly marked
incomplete; successfully collected policy settings, assignments and partial
action results are retained. This request pattern is also used by
[Microsoft365DSC](https://github.com/microsoft/Microsoft365DSC/blob/Dev/Modules/Microsoft365DSC/DscResources/MSFT_IntuneDeviceCompliancePolicyWindows10/MSFT_IntuneDeviceCompliancePolicyWindows10.psm1).

Supported adapters are Settings Catalog values, exact Graph properties,
verified OMA-URIs, Administrative Template definition IDs and security baseline
definition IDs. The last two require individually verified identifier bindings;
unrecognized definitions are exposed in coverage and never matched by title.
Legacy adapters accept typed values and do not coerce arbitrary strings into
booleans or numbers. Script contents are not evaluated as deployment evidence.

The coverage ledger lists collection state and policies with and without a
recognized evidence match. The latter includes unsupported settings/formats and
indeterminate values, not just absent protections. Older exports without a
collection timestamp retain unknown collection provenance.

The JSON evidence record and dedicated PDF contain the snapshot timestamp,
policy version and modification time, ruleset version, selected scope, remaining
requirements and SHA-256 fingerprints. Snapshot fingerprints use canonical JSON
with sorted object keys (Map group names become objects); branding and assessment
scope are excluded. Array order is retained. Ruleset fingerprints cover the
version, signal definitions, control metadata and mappings. Bump the ruleset
version whenever evaluation logic changes. Fingerprints detect changes; they
are not signatures or independent proof of authentic tenant data.

Publisher references use Microsoft, BSI, NIST, NCSC, ISO, AICPA and GOV.UK.
Reference review dates are not certification or independent validation of every
licensed standard requirement. Third-party document mirrors are not sources.

## Adding a signal

Add it to the capability in `capabilities.ts` with both `enforcedWhen` and,
where a non-enforcing value exists, `disabledWhen`. Verify the exact
`settingDefinitionId` or Graph property against a real tenant export or the
Microsoft Graph documentation before adding it, and cover it in
`src/lib/__tests__/compliance-engine.test.ts`.

## Expanded technical detectors (ruleset 2026.09.6)

Every exposed framework uses working setting detectors. The regression matrix in
`framework-detectors.test.ts` exercises an assigned, enforcing Office policy and
its disabled counterpart through all ten framework assessments.

`technical-capabilities.ts` adds Office VBA restrictions and scanning, signed
macros, Internet Explorer disablement, browser Java and intrusive-ad restrictions,
PowerShell logging, all-cloud-app MFA and phishing-resistant authentication
strengths. Existing ASR, Credential Guard and memory-integrity checks also recognize
their actual Settings Catalog choice identifiers. ADMX dropdowns require an enabled
parent on the same policy; Administrative Template dropdowns match both definition
and presentation IDs. Audit, warning, unassigned and optional OR-grant configurations
do not become enforced evidence.

Exact setting definitions and options were read from Microsoft Graph beta on
7 September 2026 using Greybeard. `verified-technical-settings.json` contains public
definition metadata, not tenant policy data. Assessment runs locally against the
already collected snapshot and adds no server-side retention or runtime metadata
requests.

Essential Eight now has supporting detectors for 14 of 48 Level 1 entries, 24 of
107 Level 2 entries and 30 of 149 Level 3 entries. These counts describe technical
mapping coverage, not passed requirements. The other entries explain the necessary
external evidence, such as backup restoration reports, patch installation times,
vulnerability scans and access approvals. Collection completeness is separate from
detector coverage and operational effectiveness. Blocking intrusive advertisements
does not establish blocking all advertisements; a logging policy does not establish
central ingestion; an MFA policy does not prove every service or user is covered.

## ASD Essential Eight target levels (ruleset 2026.09.3)

Essential Eight is one framework with target Maturity Levels 1, 2 and 3.
The default target is Level 1. `assessmentScope.essentialEightMaturityLevel`
selects the target for the engine, JSON manifest, framework PDF and full
PDF/Word previews. The dashboard selector passes this scope into its PDF and
JSON downloads. Full documentation generated without scope uses the labelled
Level 1 default. This is a target evidence review, never an achieved maturity
rating or a percentage maturity score.

The checked-in `frameworks/essential-eight-requirements.json` reproduces all
requirement entries from Appendices A, B and C of ASD's November 2023 model:
48, 107 and 149 entries, respectively, across all eight strategies. Local
`ML1-PA-01` style identifiers preserve appendix, strategy and row position;
they are not official ISM identifiers. Repeated requirements in different
strategies remain separate. No runtime download or website dependency is needed.

Sources verified 6 September 2026:

- [ASD Essential Eight maturity model](https://www.cyber.gov.au/business-government/asds-cyber-security-frameworks/essential-eight/essential-eight-maturity-model), November 2023.
- [ASD assessment process guide](https://www.cyber.gov.au/business-government/asds-cyber-security-frameworks/essential-eight/essential-eight-assessment-process-guide), for assessment boundaries and effectiveness requirements.
- [ASD ISM mapping](https://www.cyber.gov.au/business-government/asds-cyber-security-frameworks/essential-eight/essential-eight-maturity-model-and-ism-mapping), October 2024. This implementation uses the model's own appendix entries, not ISM control numbering.
- [ASD consultation on evolution](https://www.cyber.gov.au/about-us/view-all-content/news/consultation-on-evolution-of-essential-eight), June 2026. The proposed Essentials series is not substituted for the published model.
- [Microsoft endpoint-protection schema](https://learn.microsoft.com/en-us/graph/api/resources/intune-deviceconfig-windows10endpointprotectionconfiguration?view=graph-rest-beta), for Office/Adobe ASR enums. `block` for attack-surface enums and `enable` for the Adobe protection enum are blocking values; audit and warning modes do not count.

Requirements are reproduced under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/),
attributed to the Australian Signals Directorate, © Commonwealth of Australia
2026, in accordance with [ASD's copyright notice](https://www.cyber.gov.au/about-us/copyright).
Local identifiers, mappings and limitation notes are additions by this project.
No official logos or endorsement claims are included.

Only exact, verified detector-to-requirement bindings produce supporting evidence.
A 14-day Windows update configuration is not evidence for the separate 48-hour
patch requirement, nor application patching. Generic MFA does not prove phishing
resistance. Credential Guard does not prove Remote Credential Guard or LSA
protection. Memory integrity compliance requirements do not prove device state.
Adobe Reader protection does not establish protection of every PDF application.
Backups, recovery exercises, incident response, access reviews, rule validation,
central logging and other unmapped requirements remain explicitly unassessed.

## Pre-merge evidence corrections (ruleset 2026.09.4)

Quality-update timing above the shared 14-day evidence threshold is indeterminate,
not an assigned deviation across frameworks with different remediation periods.
Explicitly paused updates still produce counter-evidence. Scheduled noncompliance
actions and app relation collection warnings remain in collection coverage but do
not invalidate settings evidence; missing settings, details and assignments still do.
NIST Revision 2 MFA evidence maps to 3.5.3, and Credential Guard supports 3.4.2.
Conditional Access is excluded from Intune assignment coverage because it uses
conditions rather than an assignment relation. The Word contents are populated
section links and do not request field refresh on open. Oversized PDF evidence
register rows continue across pages without omitting condition values.

### Graph collection reliability (ruleset 2026.09.5)

Baseline category reads fall back to parent expansion on the observed OData route rejection. Category-only failures remain visible in collection coverage without invalidating settings or assignment evidence. App-protection paging preserves each platform independently, including partial pages, before enriching retained policies.

Registry entries now collect assignment relations supported by Microsoft's published beta metadata, including update profiles, apps, scripts, scope tags and policy sets. Every collected child has an explicit completeness status. A partial assignment read is unknown, even when its first page is empty or contains an inclusion.

Paging rejects malformed collection responses and repeated continuation links while retaining retrieved items. Valid empty pages with a continuation link remain supported. A shared Graph request policy bounds each client's GET and batch concurrency to six, retries transient HTTP and SDK-wrapped network failures with Retry-After support, and prevents nested retry multiplication. Detailed collection has a 105-second budget inside the 120-second API route limit; disconnects cancel collection, and exhausted budgets produce partial-result diagnostics. This is a per-request-client limit, not a tenant-wide limit across concurrent exports.

The two legacy collection APIs retain their existing payload fields and now include `fetchErrors` and `collectionStatus`. Permission probes distinguish denied access from unavailable probes. Streaming completion reports incomplete results instead of claiming all reads succeeded. Group-name batch failures preserve group identifiers and expose resolution warnings; assignment targeting never depends on successful name resolution. Transient inner batch failures are retried together after one shared wait per retry pass, with at most two retry passes per batch. Only batches containing exclusively GET requests receive automatic envelope retries. Registry types without an assignment relation are excluded from assignment coverage as not applicable. Update-ring detail failures retain collected assignments and explicit incomplete-detail markers.

Validation includes fault-injection regression tests and sampled read-only Greybeard lab calls against the actual modified collector methods. Empty lab families, every subtype, and large-tenant load are not covered by that sample. Microsoft beta schemas are referenced at https://github.com/microsoftgraph/msgraph-metadata/blob/master/schemas/beta-Prod.csdl.

## Separate check and configuration results (ruleset 2026.09.7)

Every capability now returns `checks`. Each check has an `assessmentStatus`
(`checked`, `unableToCheck`, or `outsideScope`) and an independent `result`
(`matches`, `missing`, `different`, or null when no comparison is possible).
Expected and actual values, policy identity, assignment information and reasons
are retained in JSON. The dashboard and framework PDFs display the comparisons.
Existing supporting-evidence statuses remain available for deployment context and
compatibility; a matching value on an unassigned policy is still not deployed.

A missing result requires a collection timestamp and no relevant collection gaps.
Imported snapshots of unknown completeness, skipped collections, API errors,
unsupported value types and unreadable compound inputs produce an unavailable
comparison. Successfully read settings remain checked even if another source
failed. Required setting groups are reported individually when absent. Values
outside the legacy positive/negative predicates are retained as comparisons
instead of disappearing. The shared 14-day update threshold is a supporting
configuration check, not a framework-specific remediation verdict.

The review covers all ten framework definitions: ISO 27001, SOC 2, NIST 800-53,
NIST CSF, BSI IT-Grundschutz, Def Stan, Cyber Essentials, both NIST 800-171
revisions and Essential Eight. Every listed in-scope requirement has mapped
checks or an explicit `unavailableCheck` with a reason. Automated tests enforce
this invariant and exercise matching and different configurations across every
framework mapping. It does not expand the licensed/selected framework subsets
into full audit programs.

AppLocker ApplicationLaunchRestrictions OMA-URI XML now has a detector for EXE,
DLL, MSI and Script collection types, rule counts and Enabled enforcement mode
in one CSP group. It rejects malformed/encrypted XML, DTD/entity declarations,
unsupported collection types and payloads over 1 MB. Audit mode and incomplete
collection sets do not match. Paths and Allow/Deny counts are reported; approval
of the actual rule set and device execution remain separate checks. The source
contract is Microsoft's [AppLocker CSP documentation](https://learn.microsoft.com/en-us/windows/client-management/mdm/applocker-csp),
reviewed 7 September 2026. Essential Eight now has supporting mappings for 15,
25 and 31 entries at Levels 1, 2 and 3 respectively.

Remaining coverage boundaries are explicit rather than treated as missing
configuration: compiled WDAC policy interpretation, organizational application
approval inventories, actual execution and patch timing, vulnerability telemetry,
backup platform configuration/recovery results, external customer identity,
privilege approvals and operational monitoring are not established by this
collector. These need additional parsers, sources or supplied evidence. No new
Graph scopes, server-side tenant storage or retention changes are introduced.

## Policy-only assessment scope (ruleset 2026.09.8)

The user-facing assessment includes only requirements with working Intune or
Conditional Access policy detectors. Backup restore tests, patch installation
times, approval processes and other reference-only operational requirements are
excluded from the dashboard, its counters and all generated assessment exports.
The complete published Essential Eight requirements remain in the source snapshot
for provenance; the displayed subset is 15, 27 and 35 entries at Levels 1, 2 and 3.
Published totals are labelled separately from displayed check counts.

Unavailable data for a supported detector remains visible as Unable to check.
Unsupported platform selection produces Outside selected scope. Collection errors
are never hidden by the policy-only filter. Context explaining the boundary of
supporting policy evidence is available under Scope of these policy checks.

Added public-definition-verified detectors cover LSA protected-process policy,
Remote Credential Guard (with its parent prerequisite), Windows LAPS directory
backup configuration, process creation success auditing plus command-line logging,
and PowerShell all-module logging. This checks configuration values only, not
central log ingestion, device execution or password escrow results. Source IDs
and choices were read using seven scoped, read-only Graph beta requests on
8 September 2026 and are stored in additional-verified-settings.json; no tenant
policy data was saved. Only DeviceManagementConfiguration.Read.All was needed.
