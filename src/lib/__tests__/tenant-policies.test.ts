import { describe, expect, it } from "vitest";
import type { DetailedExportData } from "../configuration-analyzer";
import { assessCapabilities, assessCompliance } from "../compliance";
import {
  buildCollectionCoverage,
  collectConfigurations,
} from "../compliance/coverage";
import {
  PORTAL_AREAS,
  portalAreaFor,
} from "../compliance/management/portal-links";
import { TENANT_POLICY_CAPABILITIES } from "../compliance/tenant-policies";
import type {
  TenantIdentityPolicies,
  TenantIdentityPolicyName,
  TenantPolicyCollectionStatus,
} from "../compliance/types";

type Method = {
  id: string;
  state: string;
  includeTargets?: unknown[];
  [key: string]: unknown;
};

const allUsers = [{ targetType: "group", id: "all_users" }];

function methods(...configs: Method[]) {
  const byId = new Map(
    [
      { id: "Fido2", state: "disabled", includeTargets: allUsers },
      { id: "Sms", state: "disabled", includeTargets: allUsers },
      { id: "Voice", state: "disabled", includeTargets: allUsers },
      { id: "Email", state: "disabled", includeTargets: [] },
      {
        id: "X509Certificate",
        state: "disabled",
        includeTargets: allUsers,
        authenticationModeConfiguration: {
          x509CertificateAuthenticationDefaultMode:
            "x509CertificateSingleFactor",
        },
      },
    ].map((config) => [config.id, config as Method]),
  );
  for (const config of configs)
    byId.set(config.id, { ...byId.get(config.id), ...config });
  return { authenticationMethodConfigurations: [...byId.values()] };
}

function policies(
  overrides: Partial<TenantIdentityPolicies> = {},
): TenantIdentityPolicies {
  return {
    authenticationMethods: methods(),
    securityDefaults: { isEnabled: false },
    authorization: { allowInvitesFrom: "everyone" },
    status: {
      authenticationMethods: "collected",
      securityDefaults: "collected",
      authorization: "collected",
    },
    ...overrides,
  };
}

function data(
  tenantIdentityPolicies?: TenantIdentityPolicies,
  collectedAt: string | null = "2026-10-18T00:00:00Z",
): DetailedExportData {
  return {
    collectedAt: collectedAt ?? undefined,
    settingsCatalog: [],
    deviceConfigurations: [],
    administrativeTemplates: [],
    compliancePolicies: [],
    securityBaselines: [],
    scripts: { windows: [], macOS: [] },
    conditionalAccessPolicies: [],
    tenantIdentityPolicies,
  };
}

function capability(exportData: DetailedExportData, id: string) {
  return assessCapabilities(exportData).find(
    (row) => row.capability.id === id,
  )!;
}

const PHISHING = "tenant-phishing-resistant-method-enabled";
const WEAK = "tenant-weak-methods-disabled";
const DEFAULTS = "tenant-security-defaults-enabled";

describe("Entra tenant policy signals", () => {
  it("treats a passkey method enabled for a group as supporting evidence", () => {
    const result = capability(
      data(
        policies({
          authenticationMethods: methods({
            id: "Fido2",
            state: "enabled",
            includeTargets: [{ targetType: "group", id: "admins" }],
          }),
        }),
      ),
      PHISHING,
    );
    expect(result.status).toBe("enforced");
    expect(result.evidence[0]).toMatchObject({
      source: "tenantPolicy",
      verdict: "enforced",
      familyKey: "authenticationMethodsPolicy",
      assignment: { state: "assigned", coverage: "unverified" },
    });
    expect(result.limitations.join(" ")).toContain("Tenant-wide Entra ID");
    expect(
      result.checks.map((check) => [check.settingId, check.result]),
    ).toEqual([
      ["authenticationMethodsPolicy/Fido2", "matches"],
      ["authenticationMethodsPolicy/X509Certificate", "different"],
    ]);
  });

  it("does not count disabled or untargeted methods, nor single-factor certificates", () => {
    for (const config of [
      { id: "Fido2", state: "enabled", includeTargets: [] },
      { id: "X509Certificate", state: "enabled" },
    ]) {
      const result = capability(
        data(policies({ authenticationMethods: methods(config) })),
        PHISHING,
      );
      // Windows Hello for Business is phishing resistant and not in this
      // policy, so disabled methods are not counter-evidence.
      expect(result.status).toBe("noEvidence");
      expect(result.evidence).toEqual([]);
      expect(result.checks.every((check) => check.result === "different")).toBe(
        true,
      );
    }
    const multifactor = capability(
      data(
        policies({
          authenticationMethods: methods({
            id: "X509Certificate",
            state: "enabled",
            authenticationModeConfiguration: {
              x509CertificateAuthenticationDefaultMode:
                "x509CertificateMultiFactor",
            },
          }),
        }),
      ),
      PHISHING,
    );
    expect(multifactor.status).toBe("enforced");
  });

  it("treats any enabled SMS, voice or email method as counter-evidence", () => {
    expect(capability(data(policies()), WEAK).status).toBe("enforced");
    const sms = capability(
      data(
        policies({
          authenticationMethods: methods({ id: "Sms", state: "enabled" }),
        }),
      ),
      WEAK,
    );
    expect(sms.status).toBe("disabledByPolicy");
    expect(sms.evidence).toEqual([
      expect.objectContaining({
        verdict: "disabled",
        observedValue: "Sms enabled for at least one user group",
      }),
    ]);
    // Microsoft's default email OTP setting has no member targets.
    const email = capability(
      data(
        policies({
          authenticationMethods: methods({
            id: "Email",
            state: "enabled",
            includeTargets: [],
          }),
        }),
      ),
      WEAK,
    );
    expect(email.status).toBe("enforced");
  });

  it("records security defaults without treating off as counter-evidence", () => {
    const on = capability(
      data(policies({ securityDefaults: { isEnabled: true } })),
      DEFAULTS,
    );
    expect(on.status).toBe("enforced");
    expect(on.checks[0]?.reason).toContain("not phishing-resistant");
    const off = capability(data(policies()), DEFAULTS);
    expect(off.status).toBe("noEvidence");
    expect(off.evidence).toEqual([]);
    expect(off.checks[0]).toMatchObject({
      assessmentStatus: "checked",
      result: "different",
    });
    expect(off.checks[0]?.reason).toContain("Conditional Access");
  });

  it.each([
    ["authenticationMethods", PHISHING],
    ["authenticationMethods", WEAK],
    ["securityDefaults", DEFAULTS],
  ] as Array<[TenantIdentityPolicyName, string]>)(
    "makes %s checks unable to check, never missing, when %s cannot be read",
    (policy, id) => {
      for (const status of [
        "permissionDenied",
        "failed",
        "skipped",
      ] as TenantPolicyCollectionStatus[]) {
        const input = policies({
          status: { ...policies().status, [policy]: status },
          errors: { [policy]: "HTTP 500: upstream failure" },
          [policy]: undefined,
        });
        const result = capability(data(input), id);
        expect(result.status, status).toBe("collectionIncomplete");
        expect(result.checks.every((check) => check.result !== "missing")).toBe(
          true,
        );
        expect(result.checks).toEqual([
          expect.objectContaining({ assessmentStatus: "unableToCheck" }),
        ]);
        if (status === "permissionDenied")
          expect(result.checks[0]?.reason).toContain("Policy.Read.All");
        if (status === "skipped")
          expect(result.limitations.join(" ")).toContain(
            "Include Conditional Access",
          );
      }
    },
  );

  it("does not report missing for snapshots without tenant policies", () => {
    const old = capability(data(undefined), WEAK);
    expect(old.status).toBe("collectionIncomplete");
    expect(old.checks[0]?.assessmentStatus).toBe("unableToCheck");
    const imported = capability(data(undefined, null), WEAK);
    expect(imported.status).toBe("noEvidence");
    expect(imported.checks[0]?.assessmentStatus).toBe("unableToCheck");
  });

  it("keeps tenant policies out of sections, configurations and counts", () => {
    const withPolicies = data(policies());
    const without = data(undefined);
    expect(collectConfigurations(withPolicies)).toEqual(
      collectConfigurations(without),
    );
    const families = (input: DetailedExportData) =>
      buildCollectionCoverage(input, []).map((row) => row.family);
    expect(families(without)).not.toContain("authenticationMethodsPolicy");
    expect(families(withPolicies)).toEqual([
      ...families(without),
      "authenticationMethodsPolicy",
      "identitySecurityDefaultsEnforcementPolicy",
      "authorizationPolicy",
    ]);
    const assessment = assessCompliance(withPolicies);
    expect(
      assessment.collectionCoverage.find(
        (row) => row.family === "authenticationMethodsPolicy",
      ),
    ).toMatchObject({ status: "complete", collectedPolicies: 1 });
  });

  it("maps to identity controls as supporting evidence only", () => {
    const assessment = assessCompliance(
      data(
        policies({
          securityDefaults: { isEnabled: true },
          authenticationMethods: methods({ id: "Fido2", state: "enabled" }),
        }),
      ),
    );
    const control = (frameworkId: string, controlId: string) =>
      assessment.frameworks
        .find((framework) => framework.framework.id === frameworkId)!
        .controls.find((item) => item.control.id === controlId)!;
    for (const [frameworkId, controlId] of [
      ["nist-800-53-r5", "IA-2"],
      ["nist-800-53-r5", "IA-5"],
      ["iso-27001-2022", "8.5"],
      ["nist-800-171-r2", "3.5.3"],
      ["cyber-essentials-v3", "User access control"],
      ["nis2-2022-2555", "21.2.j"],
      ["dora-2022-2554", "RTS 21(f)(ii)"],
    ] as const) {
      const row = control(frameworkId, controlId);
      expect(row.status, `${frameworkId} ${controlId}`).not.toBe(
        "evidenceFound",
      );
      expect(
        row.capabilityIds.some((id) => id.startsWith("tenant-")),
        controlId,
      ).toBe(true);
    }
    expect(control("nist-800-53-r5", "IA-2").enforcedCapabilityIds).toEqual(
      expect.arrayContaining([PHISHING, DEFAULTS]),
    );
  });

  it("routes portal links to the Entra admin pages", () => {
    const area = (id: string) =>
      portalAreaFor(TENANT_POLICY_CAPABILITIES.find((item) => item.id === id)!);
    expect(area(PHISHING)).toBe("entraAuthenticationMethods");
    expect(area(WEAK)).toBe("entraAuthenticationMethods");
    expect(area(DEFAULTS)).toBe("entraSecurityDefaults");
    expect(new URL(PORTAL_AREAS.entraAuthenticationMethods.url).host).toBe(
      "entra.microsoft.com",
    );
    expect(new URL(PORTAL_AREAS.entraSecurityDefaults.url).host).toBe(
      "entra.microsoft.com",
    );
  });
});
