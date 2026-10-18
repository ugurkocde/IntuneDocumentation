# Compliance evidence engine

Maps an Intune tenant export to evidence for 13 frameworks: ISO/IEC 27001:2022, SOC 2, NIST
SP 800-53 rev 5, NIST SP 800-171 revisions 2 and 3, NIST CSF 2.0, BSI IT-Grundschutz,
UK MOD Def Stan 05-138 Issue 4, NCSC Cyber Essentials, ASD Essential Eight
with target Maturity Levels 1, 2 and 3, NIS2 (Directive (EU) 2022/2555,
Art. 21(2)), DORA (Regulation (EU) 2022/2554 with RTS (EU) 2024/1774) and the
HIPAA Security Rule (45 CFR Part 164, Subpart C).

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
   logo is excluded from the licence. NIS2 is EU legislation, which may be
   reused; titles are short paraphrases of the Directive. The HIPAA Security
   Rule is US federal regulation in the public domain (17 U.S.C. 105); titles
   are the official specification names with original summaries. Do not add
   frameworks that require a commercial license (for example CIS Benchmarks,
   CIS Controls or HITRUST CSF, whose licence excludes security product
   vendors and derivative works).
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
supporting mappings for 13 of its 110 published requirements. Revision 3
(`nist-800-171-r3`, May 2024) is a separate assessment with supporting mappings
for 12 of its 97 active requirements. These counts describe mapping coverage,
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

## NIS2 Art. 21(2) (ruleset 2026.10.1)

`nis2-2022-2555` lists the ten cybersecurity risk-management measures of
[Directive (EU) 2022/2555](https://eur-lex.europa.eu/eli/dir/2022/2555/oj),
Art. 21(2), as controls `21.2.a` to `21.2.j`. Every mapping is supporting
evidence: device settings support part of a measure and never establish it.

| Measure | Supporting device-management evidence |
| --- | --- |
| (b) incident handling | process creation and PowerShell logging, for detection support |
| (e) acquisition, development and maintenance | automatic updates, quality update deadline, minimum OS versions |
| (g) basic cyber hygiene | antimalware, host firewalls, platform and browser hardening, macro restrictions, application control and app sources, ASR Office and Adobe rules, device integrity |
| (h) cryptography | disk and storage encryption |
| (i) access control and asset management | device unlock, LAPS, LSA protection, Credential Guard, compliant-device Conditional Access, app data transfer |
| (j) MFA | Conditional Access MFA, MFA for all apps, phishing-resistant MFA |

Points (a), (c), (d) and (f) are organisational and have no mapping. They are
exported as `NIS2_OUTSIDE_INTUNE_SCOPE` (English and German titles) so reports
can name them as outside Intune scope instead of counting them as gaps.

Each control carries `aliases` for national transpositions that keep the
Directive order: Denmark `NIS2-loven § 6, stk. 1, nr. 1` to `nr. 10`
([LOV nr 434 af 06/05/2025](https://www.retsinformation.dk/eli/lta/2025/434))
and Germany `§ 30 Abs. 2 Nr. 1` to `Nr. 10 BSIG`
([BSIG § 30](https://www.gesetze-im-internet.de/bsig_2025/__30.html)), both
checked against the official text on 1 October 2026. `nis2MeasureFromCode`
normalizes references such as `21(2)(j)`, `(j)`, `10B` or `Nr. 10` to `21.2.j`.
The website picker does not offer NIS2; it is intended for the desktop app.

## HIPAA Security Rule (ruleset 2026.10.3)

`hipaa-security-rule` lists nine standards and implementation specifications
of [45 CFR Part 164, Subpart C](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C)
by paragraph, for example `164.312(a)(2)(iv)`. `totalRequirements` is 54: the
18 standards and 36 implementation specifications in Appendix A to Subpart C.
The tier follows Appendix A: `Required` for standards without implementation
specifications, `Addressable` for addressable specifications, and `Standard`
for a standard that is mapped as a whole, separately from its specifications. Every mapping is
supporting evidence. The text was checked against the eCFR (last amended in
2013) and the key activities and sample questions of
[NIST SP 800-66 Rev. 2](https://csrc.nist.gov/pubs/sp/800/66/r2/final) on
9 October 2026.

| Control | Supporting device-management evidence |
| --- | --- |
| 164.308(a)(5)(ii)(B) Protection from malicious software | antimalware presence, real-time protection, scans, behavior monitoring, network inspection, Office macro scanning |
| 164.308(a)(5)(ii)(D) Password management | Windows LAPS |
| 164.310(b) Workstation use | application control, AppLocker, Gatekeeper, Android app sources |
| 164.310(c) Workstation security | disk and storage encryption, device unlock credentials |
| 164.312(a)(1) Access control | compliant-device Conditional Access, managed app data transfer |
| 164.312(a)(2)(iv) Encryption and decryption | disk and storage encryption |
| 164.312(b) Audit controls | process creation auditing, PowerShell logging |
| 164.312(c)(1) Integrity | real-time antimalware, behavior monitoring, platform integrity (indirect) |
| 164.312(d) Person or entity authentication | Conditional Access MFA, device unlock credentials |

Encryption is not mapped to 164.310(d)(1) device and media controls, whose key
activities cover disposal, re-use, accountability and backup. Updates, host
firewalls, Office macro restrictions and browser hardening have no HIPAA
counterpart in SP 800-66 Rev. 2 and stay unmapped; antivirus scanning of
macros counts as malware protection under 164.308(a)(5)(ii)(B).
`HIPAA_OUTSIDE_INTUNE_SCOPE` lists the other 45 Appendix A rows for the
management summary. Unique user identification, automatic logoff, transmission
security and its integrity controls and encryption specifications are marked
`notEvaluated`: Intune or Entra settings could support them, but no detector
checks them yet. The screen lock capabilities (ruleset 2026.10.4) do not map to
automatic logoff: a lock does not end the session. The remaining 40 are organizational or physical. The
January 2025 proposed rule (RIN 0945-AA22) is not final and is not reflected.
HITRUST CSF content is not shipped.

## Management summary, baseline and crosswalk (desktop)

`management/` turns one framework assessment into the management one-pager.
Everything it produces is identifiers, statuses and counts.

- **Evidence coverage** is `floor(100 * (evidenceFound + partialEvidence) /
  assessable)`, where assessable excludes `notApplicable` and `notAssessed`.
  It is null when nothing is assessable. It is a coverage figure, never a
  compliance score, and the report carries `COMPLIANCE_DISCLAIMER`.
- **Unassigned security configurations** counts distinct capabilities mapped
  to the framework's assessed controls with status `configuredNotAssigned`.
  `assignmentUnknown` and `collectionIncomplete` count as data gaps instead.
- **Measures outside Intune scope** is `totalRequirements` minus assessed
  controls when the framework publishes a total (NIS2: a, c, d and f), minus
  listed measures marked `notEvaluated`. Those relate to Intune or Entra
  settings without a detector yet; the report counts and labels them apart
  (HIPAA: unique user identification, automatic logoff, transmission security
  and its two specifications).
- **Next actions** (top 5) are deterministic. Candidates are mapped
  capabilities that are not enforced and not a data gap. They are ordered by:
  touching a control without evidence first; then tier (conflicting,
  assigned deviation, partial, unassigned, missing); then the number of
  affected controls; then capability id. The list is then spread across
  controls: each pick is the first candidate that reaches a control no earlier
  pick covers, and controls repeat only when every control is covered. Links
  open admin center list pages from `portal-links.ts`, never a single policy.
- **Baseline files** (`intunedoc.baseline/1`) hold control statuses and
  metrics for one tenant, framework and scope. The SHA-256 checksum over the
  canonical JSON detects accidental edits only; anyone can recompute it.
  Comparisons reject another tenant, framework, scope or a future date.
- **Crosswalk** files are supplied by the customer in the CSV template
  (`iso27001_control`, `nis2_measure`, `cis_safeguard`, `notes`). The product
  ships no CIS Controls content; CIS ids are shown only as read from the
  customer's file, on ISO/IEC 27001 and NIS2 controls. The desktop app keeps
  the file in memory for the session.

## Template defaults are not configured values (ruleset 2026.10.2)

Template resources such as compliance policies, device restriction profiles
and endpoint protection profiles return every property, and a boolean left at
"Not configured" reads `false`. A Graph property signal whose enforcing value
is `true` therefore ignores `false`: it is neither a technical check result
nor counter-evidence. Verified on a live tenant, where a compliance policy that
only requires the firewall returned `bitLockerEnabled: false`, and a device
restriction profile that only blocks Microsoft accounts returned
`defenderRequireBehaviorMonitoring: false`. Administrative template and OMA-URI
values stay explicit, so `false` there is still counter-evidence.

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

## Screen lock, DORA, Entra tenant policies and device status (ruleset 2026.10.4)

### Screen lock after inactivity

`windows-inactivity-lock`, `macos-inactivity-lock`, `ios-inactivity-lock` and
`android-inactivity-lock` read an explicitly configured inactivity limit. Any
positive value is the observation; the engine invents no maximum, because the
acceptable period is organisation-defined. Zero (no timeout) is a different
value and counter-evidence. Not configured template properties read `null` and
produce no result. Sources:

| Platform | Setting | Unit |
| --- | --- | --- |
| Windows | `device_vendor_msft_policy_config_devicelock_maxinactivitytimedevicelock`, only with its parent `devicepasswordenabled_0` (Enabled) on the same policy | minutes, 0 to 999 |
| Windows | `device_vendor_msft_policy_config_localpoliciessecurityoptions_interactivelogon_machineinactivitylimit_v2` | seconds, 0 to 599940 |
| Windows, macOS, Android | compliance `passwordMinutesOfInactivityBeforeLock` | minutes |
| iOS/iPadOS | compliance `passcodeMinutesOfInactivityBeforeScreenTimeout` (not `passcodeMinutesOfInactivityBeforeLock`, which is the grace period before the passcode is required) | minutes |

The Settings Catalog identifiers and options were read with
`GET /beta/deviceManagement/configurationSettings('<id>')` on 18 October 2026
and are stored with source and date in `additional-verified-settings.json`; the
deprecated choice version of the machine inactivity limit is not used. The
compliance properties were checked against the Graph beta schemas and a lab
compliance policy (`passwordMinutesOfInactivityBeforeLock: 15`, and `null` when
not configured). Mappings are supporting: NIST SP 800-53 AC-11, SP 800-171
3.1.10 and 03.01.10, ISO/IEC 27001 8.1 and DORA RTS Art. 13(l). A lock is not
a logoff, so HIPAA 164.312(a)(2)(iii) stays `notEvaluated`.

### DORA (desktop only)

`dora-2022-2554` lists selected points of Regulation (EU) 2022/2554 (prefix
`DORA`, Art. 9(2), 9(4)(c), 9(4)(d), 9(4)(f) and 10(1)) and of Commission
Delegated Regulation (EU) 2024/1774 (prefix `RTS`, Art. 6(2)(a), 10(4)(c),
11(2)(b) to (e), 13(d), 13(l), 21(e)(ii) and 21(f)(ii)). Paragraph numbers
were checked against the Official Journal text on 18 October 2026; the data
protection duty is Art. 9(2), not 9(3). Every control is `supporting` with
unassessed aspects. Titles are paraphrased and the framework note carries the
attribution "Source: EUR-Lex, Regulation (EU) 2022/2554 and Commission
Delegated Regulation (EU) 2024/1774. Titles paraphrased; only the Official
Journal text is authentic." Reuse is permitted under Commission Decision
2011/833/EU and the EUR-Lex legal notice. A minimum OS version is not mapped
to patch deployment, and behaviour monitoring supports malware protection
(RTS 11(2)(d)) rather than Art. 10(1), which uses logging only, as NIS2 point
(b) does. `DORA_OUTSIDE_INTUNE_SCOPE` names governance (Art. 5), the risk
management framework (Art. 6), identification (Art. 8), response, backup and
communication (Art. 11 to 14), incident management and reporting (Art. 17 to
23), resilience testing (Art. 24 to 27), third-party risk (Art. 28 to 30) and
information sharing (Art. 45). The framework has no published total.

NIS2 and DORA are desktop only (`DESKTOP_ONLY_FRAMEWORK_IDS`). The web picker
does not offer them, and `createEvidenceManifest(data, scope, { audience:
"web" })` leaves them out of the web JSON evidence record. The engine still
assesses them, so desktop output and the ruleset fingerprint are unchanged.

### Entra tenant policy signals

The Conditional Access step also reads three tenant-wide Entra policies with
the same token (Policy.Read.All, which Microsoft lists as a higher privileged
permission for each of them): `GET /beta/policies/authenticationMethodsPolicy`,
`/beta/policies/identitySecurityDefaultsEnforcementPolicy` and
`/beta/policies/authorizationPolicy` (beta returns the last one as a `value`
collection with one item; both shapes are read). The desktop app always reads
them; the website only when Conditional Access is included. They are stored on
the collection as `tenantIdentityPolicies` with a status per policy
(`collected`, `permissionDenied`, `failed`, `skipped`) and never in `sections`,
so configuration counts, search, classification and the documentation export
are unchanged.

`tenantPolicy` signals have their own evaluation (`tenant-policies.ts`):
platform `tenant`, a fixed tenant-wide assignment, supporting evidence only,
and a caveat that the setting shows what the tenant allows, not what users
registered or used. A failed, denied, skipped or absent read is a collection
gap: dependent checks are `unableToCheck` with the reason (and the permission
hint for 403), never `missing`. A method counts as enabled only when its state
is `enabled` and it has at least one include target; Microsoft's default email
OTP configuration for guests (enabled, no include targets) is not enabled for
users.

| Capability | Evidence | Counter-evidence | Not counter-evidence |
| --- | --- | --- | --- |
| `tenant-phishing-resistant-method-enabled` | `Fido2` enabled, or `X509Certificate` enabled with default mode `x509CertificateMultiFactor` | none | both disabled: Windows Hello for Business is phishing resistant and not part of this policy; single-factor certificate mode does not count. One enabled method is enough: the other method's check then has no result ("Not required"), never "different" |
| `tenant-weak-methods-disabled` | `Sms`, `Voice` and `Email` all readable and none enabled | any of them enabled | legacy per-user MFA and SSPR settings are not read |
| `tenant-security-defaults-enabled` | `isEnabled: true`, baseline MFA for all users, not phishing resistant | none | `false`: never counter-evidence; not a gap at all while Conditional Access is in use (see Alternative capabilities below) |

Mappings: NIST SP 800-53 IA-2 (phishing-resistant method, security defaults)
and IA-5 (weak methods), ISO/IEC 27001 8.5, SP 800-171 3.5.3 and 03.05.03,
Cyber Essentials user access control, NIS2 21.2.j and DORA 9(4)(d) and RTS
21(f)(ii). Essential Eight is not mapped: an enabled method does not show that
MFA is used. IA-2 also lists the Conditional Access MFA capabilities. The
authorization policy is collected but not evaluated: user consent and guest
invitation settings have no honest control mapping yet. Portal links open the
Entra authentication methods policies page, and the Entra admin center root
labelled with the security defaults path.

### Policy device status annex

The collector reads Intune's per-policy status summaries after the policy
streams: `POST /beta/deviceManagement/reports/getConfigurationPolicyNonComplianceSummaryReport`
(Settings Catalog, ADMX and intents),
`POST /beta/deviceManagement/reports/getCompliancePolicyNonComplianceSummaryReport`
and `GET /beta/deviceManagement/deviceConfigurations?$select=id,displayName&$expand=deviceStatusOverview`
(DeviceManagementConfiguration.Read.All, verified in the lab on 18 October
2026). Report bodies are read as text and may be JSON or a JSON string; values
are read by column name from `Schema`, paged with `top` 1000 and `skip` up to
`TotalRowCount`. Errors are `NumberOfNonCompliantOrErrorDevices` for reports
and `errorCount + failedCount` for the overview; reports have no pending
column, so pending is `null`. The website skips the annex with a recorded
reason when less than 20 seconds of its 105 second budget remain, and the
annex ends 10 seconds before the budget does: the remaining time is an abort
signal on every request, page and retry wait, and a source cut off by it is
`skipped` with the time budget reason (a disconnect stays `failed`). Without
`TotalRowCount`, a report is paged while its pages are full; a report that
returns fewer rows than its `TotalRowCount` is `failed` and contributes no
rows. Policy ids are matched without regard to case. A partial retry keeps
the previous annex.

The result is `policyDeviceStatus` on the collection. It is not a field on
`CapabilityEvidence` and never an input to any status; a test asserts that
statuses, counts, coverage and the management summary are identical with and
without it. `provenance.deviceState` stays `notCollected` (per-device state is
not collected) and `provenance.policyStatusSummary` records whether the annex
was collected (evidence record schema version 2). The framework PDF adds an
annex (English and German) listing the cited device policies; a policy without
a row in the Intune summary shows "No status reported", never zero.

## Alternative capabilities and review corrections (ruleset 2026.10.5)

### Alternative capabilities

`ComplianceCapability.alternativeTo` lists capabilities that deliver the same
safeguard another way. It applies only to a capability with status
`noEvidence` whose own value was read and compared (a `different` or
`missing` check). The engine then judges each listed alternative on the
unchanged first pass:

- **in use**: the alternative has evidence (any verdict and assignment state,
  so report-only and unassigned policies count) or a check that compared a
  collected policy;
- **unknown**: otherwise, when the alternative is `collectionIncomplete` or
  every check of it is `unableToCheck`;
- otherwise the capability stays an ordinary gap.

For in use and unknown, `CapabilityResult.alternative` records the state and
the alternative ids. The status stays `noEvidence` and the observed value
stays visible, but its `different` and `missing` checks carry no result (and
become `unableToCheck` when unknown), with the reason in the check and the
limitations. As a result the capability is in no "Different value" tally and
no red PDF row, `rankNextActions` never proposes it, the management summary
leaves it out of every safeguard count, the fix pack neither drafts nor
lists it, and `safeguardState` reports
`alternativeInUse` ("Not needed, an alternative is set up") or `dataMissing`.
Counter-evidence and unassigned configurations of the capability itself are
never hidden.

`tenant-security-defaults-enabled` lists the four Conditional Access
capabilities (`tenant-mfa-required`, `tenant-mfa-all-apps`,
`tenant-phishing-resistant-mfa`, `tenant-compliant-device-required`).
Creating Conditional Access policies prevents enabling security defaults
([Microsoft Learn, Plan a Conditional Access deployment](https://learn.microsoft.com/entra/identity/conditional-access/plan-conditional-access)),
so the product never recommends security defaults while Conditional Access
MFA or compliant-device evidence exists or Conditional Access could not be
read. A tenant without any such policy still sees security defaults as a gap
next to the Conditional Access MFA capabilities. Conditional Access does not
list security defaults as its alternative: baseline MFA does not replace a
configurable policy.

A tenant-wide Entra setting holding the non-enforcing value, such as SMS
enabled in the authentication methods policy, is `tenantSettingDiffers`
("Tenant-wide Entra setting differs"), not "Switched off by a policy in use".

### Exports

Register Controls rows and the evidence pack index split the cited evidence
into assigned evidence (enforcing values on assigned policies),
counter-evidence (non-enforcing values) and evidence on unassigned policies or
with unknown assignment, so counter-evidence never reads as support. The index
note says "No policy evidence found" only for `noEvidence` and "Not assessed,
see the PDF for the reason." for `notAssessed`. A framework without Purview
template data throws instead of reading as "No Purview template". XLSX cells
with formula-like text keep their value under a `quotePrefix` cell style;
CSV keeps the leading apostrophe. The fix pack requires the collection the
assessment was made from, and keeps descriptions within 1000 characters:
Microsoft documents no maximum, the warning is never shortened and the
README lists every control.

### Lab verification (18 October 2026, GET only)

- Compliance policies in the lab return `null`, not `0`, for unset
  inactivity limits: `windows10CompliancePolicy`
  `passwordMinutesOfInactivityBeforeLock` (`15` where set), five
  `macOSCompliancePolicy` policies, and `iosCompliancePolicy`
  `passcodeMinutesOfInactivityBeforeScreenTimeout` and
  `passcodeMinutesOfInactivityBeforeLock`. The lab has no Android compliance
  policy; the three Android types declare the property as `Int32` like the
  others, which is not observed behaviour.
- The default Email OTP configuration reads `state: "enabled"` with
  `includeTargets: []`, which the engine treats as not enabled for users.
- The device status report endpoints are POST requests, so this GET-only
  round did not call them again (their shape was verified earlier the same
  day, see Policy device status annex) and did not compare their policy id
  casing with Graph ids; matching ignores case.
