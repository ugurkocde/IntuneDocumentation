import source from "./essential-eight-requirements.json";
import type { FrameworkDefinition } from "../types";

export type EssentialEightMaturityLevel = 1 | 2 | 3;
export function essentialEightLevel(
  value: unknown,
): EssentialEightMaturityLevel {
  if (value === undefined) return 1;
  if (value === 1 || value === 2 || value === 3) return value;
  throw new Error("Essential Eight target maturity level must be 1, 2 or 3");
}

// Exact requirement text from the versioned ASD snapshot. No keyword-based evidence detection.
const bindings: ReadonlyArray<readonly [string, string, string]> = [
  [
    "Application control is implemented on workstations.",
    "windows-application-control",
    "Approved executables, rule coverage, exceptions and actual workstation enforcement require verification.",
  ],
  [
    "Patches, updates or other vendor mitigations for vulnerabilities in operating systems of workstations, non-internet-facing servers and non-internet-facing network devices are applied within one month of release.",
    "windows-quality-update-deadline",
    "Windows update settings support scheduling only. Release-to-install timing, vulnerability scans, servers and network devices are unassessed.",
  ],
  [
    "Patches, updates or other vendor mitigations for vulnerabilities in operating systems of workstations, non-internet-facing servers and non-internet-facing network devices are applied within one month of release when vulnerabilities are assessed as non-critical by vendors and no working exploits exist.",
    "windows-quality-update-deadline",
    "A Windows update deadline does not verify installation or vulnerability classification. Critical and exploited vulnerabilities have separate requirements; servers and network devices are unassessed.",
  ],
  [
    "Multi-factor authentication is used to authenticate users to their organisation’s online services that process, store or communicate their organisation’s sensitive data.",
    "tenant-mfa-required",
    "Conditional Access configuration does not establish coverage of every service, actual authentication, exclusions or phishing resistance. Review those separately.",
  ],
  [
    "Memory integrity functionality is enabled.",
    "windows-memory-integrity",
    "An assigned compliance requirement does not prove HVCI is enabled on devices. Device attestation and effective coverage require review.",
  ],
  [
    "Credential Guard functionality is enabled.",
    "windows-credential-guard",
    "Device activation, hardware prerequisites and effective coverage require verification. This does not establish Remote Credential Guard or LSA protection.",
  ],
  [
    "Microsoft Office macros are blocked from making Win32 API calls.",
    "windows-office-macro-win32-block",
    "ASR exclusions, software coverage and effective device enforcement require verification. This does not prove all macro restrictions.",
  ],
  [
    "Microsoft Office is blocked from creating child processes.",
    "windows-office-child-process-block",
    "ASR exclusions and effective device enforcement require verification.",
  ],
  [
    "Microsoft Office is blocked from creating executable content.",
    "windows-office-executable-block",
    "ASR exclusions and effective device enforcement require verification.",
  ],
  [
    "Microsoft Office is blocked from injecting code into other processes.",
    "windows-office-injection-block",
    "ASR exclusions and effective device enforcement require verification.",
  ],
  [
    "PDF software is blocked from creating child processes.",
    "windows-adobe-child-process-block",
    "The detector covers Adobe Reader only. Other PDF software, exclusions and effective enforcement remain unassessed.",
  ],
];

export function essentialEightFramework(
  target: EssentialEightMaturityLevel = 1,
): FrameworkDefinition {
  const level = essentialEightLevel(target);
  const requirements = source.requirements.filter((row) => row.level === level);
  const mappings: Record<string, string[]> = {};
  const controls = Object.fromEntries(
    requirements.map((row) => {
      const binding = bindings.find(
        ([requirement]) => requirement === row.requirement,
      );
      if (binding) (mappings[binding[1]] ??= []).push(row.id);
      return [
        row.id,
        {
          id: row.id,
          title: row.strategy,
          summary: row.requirement,
          tier: `Target Maturity Level ${level}`,
          granularity: "requirement" as const,
          evidenceStrength: "supporting" as const,
          ...(binding && binding[1].startsWith("windows-")
            ? { platforms: ["windows" as const] }
            : {}),
          unassessedAspects: [
            binding?.[2] ??
              "This requirement needs separate technical or operational assessment; no verified detector is available in this export.",
          ],
        },
      ];
    }),
  );
  return {
    id: "essential-eight",
    name: "ASD Essential Eight",
    version: `November 2023; target Maturity Level ${level}`,
    totalRequirements: requirements.length,
    note: `Evidence against target Maturity Level ${level}; no achieved maturity level is calculated. All eight strategies are included. Local ML identifiers identify rows within the published appendix and are not official ISM control IDs. ${source.attribution} Licence: ${source.license} Configuration evidence does not prove implementation effectiveness, patch installation, backup recovery or operational processes. The model targets enterprise IT; mobile and operational technology coverage must be assessed separately.`,
    source: { url: source.source, verifiedAt: source.verifiedAt },
    controls,
    mappings,
  };
}
