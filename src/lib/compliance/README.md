# Compliance evidence engine

Maps an Intune tenant export to evidence for ISO/IEC 27001:2022, SOC 2, NIST
SP 800-53 rev 5, NIST SP 800-171 revisions 2 and 3, NIST CSF 2.0, BSI IT-Grundschutz,
UK MOD Def Stan 05-138 Issue 4, and NCSC Cyber Essentials.

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
supporting mappings for 11 of its 110 published requirements. Revision 3
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
