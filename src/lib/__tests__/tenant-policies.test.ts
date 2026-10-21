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
import {
  buildManagementSummary,
  rankNextActions,
  safeguardPolicies,
  safeguardState,
} from "../compliance/management/management-summary";
import { GERMAN_CAPABILITY_NAMES } from "../compliance/report-pdf";
import {
  CONDITIONAL_ACCESS_ALTERNATIVES,
  TENANT_POLICY_CAPABILITIES,
} from "../compliance/tenant-policies";
import { COMPLIANCE_CAPABILITIES } from "../compliance/capabilities";
import type {
  ComplianceCapability,
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
    status: {
      authenticationMethods: "collected",
      securityDefaults: "collected",
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
      // One phishing-resistant method is enough; the other is no deviation.
      ["authenticationMethodsPolicy/X509Certificate", null],
    ]);
    expect(result.checks[1]).toMatchObject({ assessmentStatus: "checked" });
    expect(result.checks[1]?.reason).toContain("Not required: Fido2");
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

function caPolicy(
  state: string,
  grantControls: Record<string, unknown> = {
    operator: "AND",
    builtInControls: ["mfa"],
  },
) {
  return {
    id: `ca-${state}`,
    displayName: `CA ${state}`,
    state,
    conditions: {
      users: { includeUsers: ["All"] },
      applications: { includeApplications: ["All"] },
    },
    grantControls,
  };
}

function withCa(
  ca: Record<string, unknown>[],
  extra: Partial<DetailedExportData> = {},
): DetailedExportData {
  return { ...data(policies()), conditionalAccessPolicies: ca, ...extra };
}

describe("security defaults as an alternative to Conditional Access", () => {
  const frameworks = [
    "nist-800-53-r5",
    "iso-27001-2022",
    "nist-800-171-r2",
    "nist-800-171-r3",
    "cyber-essentials-v3",
    "nis2-2022-2555",
    "dora-2022-2554",
  ];
  const MFA_CAPABILITIES = [
    "tenant-mfa-required",
    "tenant-mfa-all-apps",
    "tenant-phishing-resistant-mfa",
  ];

  function defaultsOf(assessment: ReturnType<typeof assessCompliance>) {
    return assessment.capabilities.find(
      (result) => result.capability.id === DEFAULTS,
    )!;
  }

  /** Never a next action and, unless unknown, no safeguard to count. */
  function expectNotRecommended(
    assessment: ReturnType<typeof assessCompliance>,
    counted: boolean,
  ) {
    for (const id of frameworks) {
      const fa = assessment.frameworks.find(
        (item) => item.framework.id === id,
      )!;
      expect(
        rankNextActions(fa, assessment.capabilities, 50).map(
          (action) => action.capabilityId,
        ),
        id,
      ).not.toContain(DEFAULTS);
      const summary = buildManagementSummary(assessment, id, { limit: 50 });
      expect(
        summary.nextActions.map((action) => action.capabilityId),
      ).not.toContain(DEFAULTS);
      const mapped = new Set(fa.controls.flatMap((c) => c.capabilityIds));
      expect(mapped.has(DEFAULTS), id).toBe(true);
      expect(summary.metrics.safeguardsTotal, id).toBe(
        counted ? mapped.size : mapped.size - 1,
      );
      for (const control of fa.controls)
        expect(summary.safeguards[control.control.id]?.total).toBe(
          new Set(
            control.capabilityIds.filter((c) => counted || c !== DEFAULTS),
          ).size,
        );
    }
  }

  it("lists only the Conditional Access MFA capabilities as the alternative", () => {
    const defaults = TENANT_POLICY_CAPABILITIES.find(
      (item) => item.id === DEFAULTS,
    )!;
    expect(defaults.alternativeTo).toEqual(CONDITIONAL_ACCESS_ALTERNATIVES);
    expect([...CONDITIONAL_ACCESS_ALTERNATIVES]).toEqual(MFA_CAPABILITIES);
    expect(defaults.exclusiveWithConditionalAccess).toBe(true);
    const ids = new Set(
      assessCompliance(data(policies())).capabilities.map(
        (result) => result.capability.id,
      ),
    );
    for (const id of CONDITIONAL_ACCESS_ALTERNATIVES)
      expect(ids.has(id), id).toBe(true);
  });

  it("names only the assigned enforcing alternatives of an enabled MFA policy", () => {
    const assessment = assessCompliance(withCa([caPolicy("enabled")]));
    const defaults = defaultsOf(assessment);
    expect(defaults.status).toBe("noEvidence");
    // All users and all apps: MFA and MFA for all apps, not phishing resistant.
    expect(defaults.alternative).toEqual({
      state: "inUse",
      capabilityIds: ["tenant-mfa-required", "tenant-mfa-all-apps"],
    });
    // The value stays visible, but it is not a different value.
    expect(defaults.checks).toEqual([
      expect.objectContaining({
        assessmentStatus: "checked",
        result: null,
        actualValue: "Off",
      }),
    ]);
    expect(defaults.checks[0]?.reason).toContain("Not a gap");
    expect(defaults.checks[0]?.reason).not.toMatch(/phishing/i);
    expect(safeguardState(defaults)).toBe("alternativeInUse");
    expectNotRecommended(assessment, false);
  });

  it("does not name MFA for all apps for a plain MFA policy on one app", () => {
    const policy = caPolicy("enabled");
    policy.conditions.applications = {
      includeApplications: ["00000002-0000-0ff1-ce00-000000000000"],
    };
    const defaults = defaultsOf(assessCompliance(withCa([policy])));
    expect(defaults.alternative).toEqual({
      state: "inUse",
      capabilityIds: ["tenant-mfa-required"],
    });
    const reason = defaults.limitations.at(-1)!;
    expect(reason).not.toContain("all cloud apps");
    expect(reason).not.toMatch(/phishing/i);
  });

  it.each([
    ["a report-only MFA policy", caPolicy("enabledForReportingButNotEnforced")],
    // Microsoft Learn makes no distinction by state: any Conditional Access
    // policy prevents enabling security defaults.
    ["a disabled MFA policy", caPolicy("disabled")],
    ["a policy without a readable state", { ...caPolicy("enabled"), state: undefined }],
    [
      "an MFA OR compliant-device policy",
      caPolicy("enabled", {
        operator: "OR",
        builtInControls: ["mfa", "compliantDevice"],
      }),
    ],
    [
      "a compliant-device policy",
      caPolicy("enabled", {
        operator: "AND",
        builtInControls: ["compliantDevice"],
      }),
    ],
    [
      "an unreadable custom authentication strength",
      caPolicy("enabled", {
        operator: "AND",
        authenticationStrength: { id: "custom-strength" },
      }),
    ],
    [
      "an MFA policy without targets",
      {
        ...caPolicy("enabled"),
        conditions: {
          users: { includeUsers: ["None"] },
          applications: { includeApplications: ["All"] },
        },
      },
    ],
  ])("is not applicable, never set up, with %s", (label, policy) => {
    // An enabled policy whose strength cannot be read is a data gap for the
    // MFA capabilities it may provide, never a safeguard to set up.
    const unreadable = label === "an unreadable custom authentication strength";
    const assessment = assessCompliance(withCa([policy]));
    const defaults = defaultsOf(assessment);
    expect(defaults.status).toBe("noEvidence");
    expect(defaults.alternative).toEqual({
      state: "notCombinable",
      capabilityIds: [],
    });
    expect(defaults.checks[0]).toMatchObject({
      assessmentStatus: "checked",
      result: null,
      actualValue: "Off",
    });
    const reason = defaults.checks[0]?.reason ?? "";
    expect(reason).toContain(
      "Not applicable while Conditional Access policies exist",
    );
    expect(reason).toContain("Require MFA through Conditional Access");
    expect(reason).not.toContain("Not a gap");
    expect(reason).not.toMatch(/configured|set up|phishing/i);
    expect(safeguardState(defaults)).toBe("notCombinable");
    // The Conditional Access MFA capabilities stay gaps.
    for (const id of MFA_CAPABILITIES) {
      const result = assessment.capabilities.find(
        (row) => row.capability.id === id,
      )!;
      expect(result.status, id).toBe("noEvidence");
      expect(safeguardState(result), id).toBe(
        unreadable ? "dataMissing" : "notConfigured",
      );
    }
    const summary = buildManagementSummary(assessment, "nist-800-53-r5", {
      limit: 50,
    });
    if (unreadable)
      expect(
        summary.nextActions.map((action) => action.capabilityId),
      ).not.toContain("tenant-mfa-required");
    else
      expect(summary.nextActions.map((action) => action.capabilityId)).toEqual(
        expect.arrayContaining(["tenant-mfa-required"]),
      );
    expectNotRecommended(assessment, false);
  });

  it("keeps security defaults a gap when no Conditional Access policy exists", () => {
    const assessment = assessCompliance(withCa([]));
    const defaults = defaultsOf(assessment);
    expect(defaults.alternative).toBeUndefined();
    expect(defaults.checks[0]).toMatchObject({ result: "different" });
    expect(safeguardState(defaults)).toBe("notConfigured");
    const summary = buildManagementSummary(assessment, "nist-800-53-r5", {
      limit: 50,
    });
    expect(summary.nextActions.map((action) => action.capabilityId)).toContain(
      DEFAULTS,
    );
  });

  it("never recommends security defaults when the only Conditional Access policy is disabled", () => {
    const assessment = assessCompliance(withCa([caPolicy("disabled")]));
    const defaults = defaultsOf(assessment);
    expect(defaults.alternative).toEqual({
      state: "notCombinable",
      capabilityIds: [],
    });
    expect(defaults.checks[0]).toMatchObject({ result: null });
    expect(safeguardState(defaults)).toBe("notCombinable");
    const summary = buildManagementSummary(assessment, "nist-800-53-r5", {
      limit: 50,
    });
    expect(
      summary.nextActions.map((action) => action.capabilityId),
    ).not.toContain(DEFAULTS);
    expectNotRecommended(assessment, false);
  });

  it("counts security defaults as a data gap while Conditional Access is unreadable", () => {
    const assessment = assessCompliance(
      withCa([], { collectionSkippedFamilies: ["conditionalAccessPolicies"] }),
    );
    const defaults = defaultsOf(assessment);
    expect(defaults.alternative?.state).toBe("unknown");
    expect(defaults.checks[0]).toMatchObject({
      assessmentStatus: "unableToCheck",
      result: null,
    });
    expect(safeguardState(defaults)).toBe("dataMissing");
    // Still a safeguard in the totals, and a data gap, never a next action.
    expectNotRecommended(assessment, true);
    const known = assessCompliance(withCa([]));
    for (const id of frameworks) {
      const gaps = buildManagementSummary(assessment, id).metrics.dataGaps;
      const before = buildManagementSummary(known, id).metrics.dataGaps;
      // The Conditional Access capabilities themselves are data gaps too.
      expect(gaps, id).toBeGreaterThan(before);
      const fa = assessment.frameworks.find((f) => f.framework.id === id)!;
      const mapped = new Set(fa.controls.flatMap((c) => c.capabilityIds));
      const expected = assessment.capabilities.filter(
        (result) =>
          mapped.has(result.capability.id) &&
          (["assignmentUnknown", "collectionIncomplete"].includes(
            result.status,
          ) ||
            result.alternative?.state === "unknown"),
      ).length;
      expect(gaps, id).toBe(expected);
    }
  });

  it("is not combinable while a Conditional Access policy has no readable state", () => {
    const policy = { ...caPolicy("enabled"), state: undefined };
    const defaults = defaultsOf(assessCompliance(withCa([policy])));
    expect(defaults.alternative?.state).toBe("notCombinable");
    expect(defaults.checks[0]).toMatchObject({
      assessmentStatus: "checked",
      result: null,
    });
    expect(defaults.checks[0]?.reason).toContain(
      "Not applicable while Conditional Access policies exist",
    );
  });

  const caFailure = {
    policyId: "ca-page",
    policyName: "Conditional Access",
    policyType: "conditionalAccessPolicies",
    familyKey: "conditionalAccessPolicies",
    error: "HTTP 500: Upstream failure",
  };

  it("reads Conditional Access from a sections-based collection", () => {
    const section = (items: unknown[]) => ({
      ...withCa([]),
      sections: [
        {
          key: "Conditional Access Policies",
          familyKey: "conditionalAccessPolicies",
          label: "Conditional Access policies",
          selectionPrefix: "ca",
          items,
        },
      ],
    });
    expect(
      defaultsOf(
        assessCompliance(
          section([caPolicy("enabledForReportingButNotEnforced")]),
        ),
      ).alternative,
    ).toEqual({ state: "notCombinable", capabilityIds: [] });
    expect(
      defaultsOf(assessCompliance(section([caPolicy("enabled")]))).alternative,
    ).toEqual({
      state: "inUse",
      capabilityIds: ["tenant-mfa-required", "tenant-mfa-all-apps"],
    });
    expect(
      defaultsOf(assessCompliance(section([caPolicy("disabled")]))).alternative,
    ).toEqual({ state: "notCombinable", capabilityIds: [] });
    expect(defaultsOf(assessCompliance(section([]))).alternative).toBeUndefined();
  });

  it("is not combinable when an incomplete collection still shows a policy", () => {
    const active = defaultsOf(
      assessCompliance(
        withCa([caPolicy("enabledForReportingButNotEnforced")], {
          fetchErrors: [caFailure],
        }),
      ),
    );
    expect(active.alternative?.state).toBe("notCombinable");
    const disabledOnly = defaultsOf(
      assessCompliance(
        withCa([caPolicy("disabled")], { fetchErrors: [caFailure] }),
      ),
    );
    expect(disabledOnly.alternative?.state).toBe("notCombinable");
    expect(safeguardState(disabledOnly)).toBe("notCombinable");
    const none = defaultsOf(
      assessCompliance(withCa([], { fetchErrors: [caFailure] })),
    );
    expect(none.alternative?.state).toBe("unknown");
    expect(safeguardState(none)).toBe("dataMissing");
  });

  it("is unknown without a collection timestamp unless a policy is seen", () => {
    const undated = (ca: Record<string, unknown>[]) => ({
      ...data(policies(), null),
      conditionalAccessPolicies: ca,
    });
    const none = defaultsOf(assessCompliance(undated([])));
    expect(none.alternative?.state).toBe("unknown");
    expect(none.checks[0]).toMatchObject({
      assessmentStatus: "unableToCheck",
      result: null,
    });
    expect(
      defaultsOf(assessCompliance(undated([caPolicy("disabled")]))).alternative
        ?.state,
    ).toBe("notCombinable");
    expect(
      defaultsOf(
        assessCompliance(
          undated([caPolicy("enabledForReportingButNotEnforced")]),
        ),
      ).alternative?.state,
    ).toBe("notCombinable");
  });

  it("is not combinable, not unknown, for a disabled policy with an unreadable authentication strength", () => {
    const assessment = assessCompliance(
      withCa([
        caPolicy("disabled", {
          operator: "AND",
          authenticationStrength: { id: "custom-strength" },
        }),
      ]),
    );
    const defaults = defaultsOf(assessment);
    expect(defaults.alternative).toEqual({
      state: "notCombinable",
      capabilityIds: [],
    });
    expect(safeguardState(defaults)).toBe("notCombinable");
    expect(
      buildManagementSummary(assessment, "nist-800-53-r5", {
        limit: 50,
      }).nextActions.map((action) => action.capabilityId),
    ).not.toContain(DEFAULTS);
  });

  it("names only readable enforcing alternatives next to an unreadable strength", () => {
    const mfa = caPolicy("enabled");
    mfa.conditions.applications = {
      includeApplications: ["00000002-0000-0ff1-ce00-000000000000"],
    };
    const unreadable = {
      ...caPolicy("enabled", {
        operator: "AND",
        authenticationStrength: { id: "custom-strength" },
      }),
      id: "ca-custom",
    };
    expect(
      defaultsOf(assessCompliance(withCa([mfa, unreadable]))).alternative,
    ).toEqual({ state: "inUse", capabilityIds: ["tenant-mfa-required"] });
    // Enforcing wins over a report-only policy next to it.
    const reportOnly = {
      ...caPolicy("enabledForReportingButNotEnforced"),
      id: "ca-report",
    };
    expect(
      defaultsOf(assessCompliance(withCa([caPolicy("enabled"), reportOnly])))
        .alternative,
    ).toEqual({
      state: "inUse",
      capabilityIds: ["tenant-mfa-required", "tenant-mfa-all-apps"],
    });
  });

  it("leaves security defaults that are on and unreadable unchanged", () => {
    const on = assessCompliance(
      withCa([caPolicy("enabled")], {
        tenantIdentityPolicies: policies({
          securityDefaults: { isEnabled: true },
        }),
      }),
    ).capabilities.find((result) => result.capability.id === DEFAULTS)!;
    expect(on.status).toBe("enforced");
    expect(on.alternative).toBeUndefined();
    const unread = assessCompliance(
      withCa([caPolicy("enabled")], {
        tenantIdentityPolicies: policies({
          status: { ...policies().status, securityDefaults: "failed" },
          securityDefaults: undefined,
        }),
      }),
    ).capabilities.find((result) => result.capability.id === DEFAULTS)!;
    expect(unread.status).toBe("collectionIncomplete");
    expect(unread.alternative).toBeUndefined();
  });

  it("words enabled weak methods as a tenant setting, not a switched-off policy", () => {
    const sms = capability(
      data(
        policies({
          authenticationMethods: methods({ id: "Sms", state: "enabled" }),
        }),
      ),
      WEAK,
    );
    expect(sms.status).toBe("disabledByPolicy");
    expect(safeguardState(sms)).toBe("tenantSettingDiffers");
  });
});

describe("alternative states of a non-exclusive capability", () => {
  const TARGET = "test-alternative-target";
  const target = (alternativeTo: readonly string[]): ComplianceCapability => ({
    id: TARGET,
    platform: "tenant",
    name: "Test capability with an alternative",
    description: "Synthetic capability for the alternative states.",
    alternativeTo,
    signals: [
      {
        source: "tenantPolicy",
        policy: "securityDefaults",
        check: "securityDefaultsEnabled",
      },
    ],
  });
  const encryption = (assignments: unknown) => ({
    id: "encryption",
    displayName: "Encryption",
    "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
    bitLockerEnabled: true,
    assignments,
  });
  const allDevices = [
    {
      target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" },
    },
  ];
  function result(
    exportData: DetailedExportData,
    alternativeTo: readonly string[],
  ) {
    return assessCapabilities(exportData, [
      target(alternativeTo),
      ...COMPLIANCE_CAPABILITIES,
    ]).find((row) => row.capability.id === TARGET)!;
  }

  it("is in use only with assigned enforcing evidence", () => {
    const row = result(
      { ...withCa([]), compliancePolicies: [encryption(allDevices)] },
      ["windows-disk-encryption"],
    );
    expect(row.alternative).toEqual({
      state: "inUse",
      capabilityIds: ["windows-disk-encryption"],
    });
    const unassigned = result(
      { ...withCa([]), compliancePolicies: [encryption([])] },
      ["windows-disk-encryption"],
    );
    expect(unassigned.alternative).toBeUndefined();
  });

  it("is unknown for an alternative with unknown assignment", () => {
    const row = result(
      { ...withCa([]), compliancePolicies: [encryption(undefined)] },
      ["windows-disk-encryption"],
    );
    expect(row.alternative).toEqual({
      state: "unknown",
      capabilityIds: ["windows-disk-encryption"],
    });
    expect(row.checks[0]).toMatchObject({
      assessmentStatus: "unableToCheck",
      result: null,
    });
  });

  it("is unknown for an alternative whose collection is incomplete", () => {
    const row = result(
      withCa([], {
        fetchErrors: [
          {
            policyId: "page",
            policyName: "Compliance policies",
            policyType: "compliancePolicies",
            familyKey: "compliancePolicies",
            error: "HTTP 500: Upstream failure",
          },
        ],
      }),
      ["windows-disk-encryption"],
    );
    expect(row.alternative?.state).toBe("unknown");
  });

  it("stays a gap with a report-only policy when not exclusive", () => {
    const row = result(
      withCa([caPolicy("enabledForReportingButNotEnforced")]),
      ["tenant-mfa-required"],
    );
    expect(row.alternative).toBeUndefined();
    expect(row.checks[0]).toMatchObject({ result: "different" });
  });
});

describe("readable Entra tenant policy values", () => {
  it("states method and security defaults values in plain words, never JSON", () => {
    const exportData = data(
      policies({
        authenticationMethods: methods(
          { id: "Sms", state: "enabled", includeTargets: allUsers },
          {
            id: "Voice",
            state: "enabled",
            includeTargets: [...allUsers, { targetType: "group", id: "g2" }],
          },
          { id: "Email", state: "enabled", includeTargets: [] },
        ),
      }),
    );
    const actual = (id: string) =>
      Object.fromEntries(
        capability(exportData, id).checks.map((check) => [
          check.settingId,
          check.actualValue,
        ]),
      );
    expect(actual(WEAK)).toEqual({
      "authenticationMethodsPolicy/Sms": "Enabled for 1 target",
      "authenticationMethodsPolicy/Voice": "Enabled for 2 targets",
      "authenticationMethodsPolicy/Email": "Enabled, no users targeted",
    });
    expect(actual(PHISHING)).toEqual({
      "authenticationMethodsPolicy/Fido2": "Disabled",
      "authenticationMethodsPolicy/X509Certificate":
        "Disabled; single-factor default mode",
    });
    expect(Object.values(actual(DEFAULTS))).toEqual(["Off"]);
    for (const result of assessCapabilities(exportData))
      if (result.capability.platform === "tenant")
        for (const check of result.checks)
          expect(check.actualValue ?? "").not.toMatch(/[{}"]|^(true|false)$/);
  });

  it("names the weak methods capability so it holds for an untargeted email passcode", () => {
    const weak = TENANT_POLICY_CAPABILITIES.find((item) => item.id === WEAK)!;
    expect(weak.name).toBe(
      "SMS, voice call and email one-time passcode not enabled for users (Entra ID)",
    );
    expect(GERMAN_CAPABILITY_NAMES[WEAK]).toBe(
      "SMS, Sprachanruf und E-Mail-Einmalcode für Benutzer nicht aktiviert (Entra ID)",
    );
    // Email OTP enabled without targets is the Microsoft default and matches.
    const result = capability(
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
    expect(result.status).toBe("enforced");
  });
});

describe("security summary policies of tenant-wide safeguards", () => {
  it("names the security defaults policy that was read, not No policy found", () => {
    const assessment = assessCompliance(withCa([caPolicy("disabled")]));
    const defaults = assessment.capabilities.find(
      (result) => result.capability.id === DEFAULTS,
    )!;
    expect(defaults.alternative?.state).toBe("notCombinable");
    expect(defaults.evidence).toEqual([]);
    expect(safeguardState(defaults)).toBe("notCombinable");
    expect(safeguardPolicies(defaults)).toEqual([
      { name: "Security defaults", assigned: true },
    ]);
  });
});
