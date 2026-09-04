# Compliance evidence engine

Maps an Intune tenant export to evidence for ISO/IEC 27001:2022, SOC 2, NIST
SP 800-53 rev 5, NIST SP 800-171 rev 2, NIST CSF 2.0, BSI IT-Grundschutz,
UK MOD Def Stan 05-138 Issue 4, and NCSC Cyber Essentials.

## Design rules

1. **Precision over recall.** Coverage is only claimed when a known setting is
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
   reported as `disabled`, never as coverage.
4. **Assignment-aware.** Enforcing policies that are unassigned (or assigned
   via exclusions only) yield `configuredNotAssigned`, not `enforced`.
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

## Adding a signal

Add it to the capability in `capabilities.ts` with both `enforcedWhen` and,
where a non-enforcing value exists, `disabledWhen`. Verify the exact
`settingDefinitionId` or Graph property against a real tenant export or the
Microsoft Graph documentation before adding it, and cover it in
`src/lib/__tests__/compliance-engine.test.ts`.
