/**
 * Synthetic fixtures with the Settings Catalog shapes verified live in WP0
 * (tasks/briefs/cis-wp0-graph-shapes.md). Benchmark id "synthetic-bench",
 * invented setting ids and recommendation text; no real benchmark content.
 */
import type { BenchmarkCollection } from "../tenant-settings";
import type { BenchmarkPack, RecommendationList } from "../pack";
import type { ResultCode, StoredBenchmarkRun } from "../history";

type Instance = Record<string, unknown>;

const T = "#microsoft.graph.deviceManagementConfiguration";

export const BENCH = "synthetic-bench";
export const VERSION = "1.0.0";

/** A choice instance as Graph returns it: value is "<definition id>_<option>". */
export function choice(
  id: string,
  option: string,
  children: Instance[] = [],
): Instance {
  return {
    "@odata.type": `${T}ChoiceSettingInstance`,
    settingDefinitionId: id,
    settingInstanceTemplateReference: null,
    auditRuleInformation: null,
    choiceSettingValue: {
      settingValueTemplateReference: null,
      value: `${id}_${option}`,
      children,
    },
  };
}

export function simpleInteger(id: string, value: unknown): Instance {
  return {
    "@odata.type": `${T}SimpleSettingInstance`,
    settingDefinitionId: id,
    settingInstanceTemplateReference: null,
    auditRuleInformation: null,
    simpleSettingValue: {
      "@odata.type": `${T}IntegerSettingValue`,
      settingValueTemplateReference: null,
      value,
    },
  };
}

export function simpleString(id: string, value: unknown): Instance {
  return {
    "@odata.type": `${T}SimpleSettingInstance`,
    settingDefinitionId: id,
    settingInstanceTemplateReference: null,
    auditRuleInformation: null,
    simpleSettingValue: {
      "@odata.type": `${T}StringSettingValue`,
      settingValueTemplateReference: null,
      value,
    },
  };
}

/** A secret value: never readable, whatever Graph returned. */
export function simpleSecret(id: string, value?: string): Instance {
  return {
    "@odata.type": `${T}SimpleSettingInstance`,
    settingDefinitionId: id,
    settingInstanceTemplateReference: null,
    auditRuleInformation: null,
    simpleSettingValue: {
      "@odata.type": `${T}SecretSettingValue`,
      settingValueTemplateReference: null,
      ...(value === undefined ? {} : { value }),
      valueState: "encryptedValueToken",
    },
  };
}

export function simpleCollection(id: string, values: string[]): Instance {
  return {
    "@odata.type": `${T}SimpleSettingCollectionInstance`,
    settingDefinitionId: id,
    settingInstanceTemplateReference: null,
    auditRuleInformation: null,
    simpleSettingCollectionValue: values.map((value) => ({
      "@odata.type": `${T}StringSettingValue`,
      settingValueTemplateReference: null,
      value,
    })),
  };
}

export function choiceCollection(id: string, options: string[]): Instance {
  return {
    "@odata.type": `${T}ChoiceSettingCollectionInstance`,
    settingDefinitionId: id,
    settingInstanceTemplateReference: null,
    auditRuleInformation: null,
    choiceSettingCollectionValue: options.map((option) => ({
      settingValueTemplateReference: null,
      value: `${id}_${option}`,
      children: [],
    })),
  };
}

export function groupCollection(id: string, entries: Instance[][]): Instance {
  return {
    "@odata.type": `${T}GroupSettingCollectionInstance`,
    settingDefinitionId: id,
    settingInstanceTemplateReference: null,
    auditRuleInformation: null,
    groupSettingCollectionValue: entries.map((children) => ({
      settingValueTemplateReference: null,
      children,
    })),
  };
}

/** The same instance as a policy created from a template returns it. */
export function templated(instance: Instance): Instance {
  const value = structuredClone(instance);
  value.settingInstanceTemplateReference = {
    settingInstanceTemplateId: "00000000-0000-0000-0000-00000000a001",
  };
  const choiceValue = value.choiceSettingValue as Instance | undefined;
  if (choiceValue)
    choiceValue.settingValueTemplateReference = {
      settingValueTemplateId: "00000000-0000-0000-0000-00000000a002",
      useTemplateDefault: false,
    };
  return value;
}

export const ASSIGNED = [
  {
    id: "assignment-1",
    source: "direct",
    target: {
      "@odata.type": "#microsoft.graph.allLicensedUsersAssignmentTarget",
      deviceAndAppManagementAssignmentFilterId: null,
      deviceAndAppManagementAssignmentFilterType: "none",
    },
  },
];

let counter = 0;

export interface TenantPolicyInput {
  id?: string;
  name?: string;
  platforms?: unknown;
  technologies?: string;
  settings: Instance[];
  assignments?: unknown[];
  settingsStatus?: "complete" | "incomplete" | null;
  assignmentsStatus?: "complete" | "incomplete" | null;
  templateId?: string;
}

/** One collected Settings Catalog item, as intune-detailed-client.ts stores it. */
export function tenantPolicy(
  input: TenantPolicyInput,
): Record<string, unknown> {
  counter += 1;
  const id =
    input.id ?? `00000000-0000-0000-0000-${String(counter).padStart(12, "0")}`;
  const name = input.name ?? `Tenant policy ${counter}`;
  const status: Record<string, string> = {};
  if (input.settingsStatus !== null)
    status.settings = input.settingsStatus ?? "complete";
  if (input.assignmentsStatus !== null)
    status.assignments = input.assignmentsStatus ?? "complete";
  return {
    id,
    name,
    displayName: name,
    description: "",
    platforms: input.platforms === undefined ? "windows10" : input.platforms,
    technologies: input.technologies ?? "mdm",
    settingCount: input.settings.length,
    templateReference: {
      templateId: input.templateId ?? "",
      templateFamily: input.templateId ? "endpointSecurityAntivirus" : "none",
      templateDisplayName: null,
      templateDisplayVersion: null,
    },
    configType: "Settings Catalog",
    settings: input.settings.map((settingInstance, index) => ({
      id: String(index),
      settingInstance,
    })),
    assignments: input.assignments ?? ASSIGNED,
    ...(Object.keys(status).length ? { collectionStatus: status } : {}),
    hasFetchError: false,
  };
}

export interface CollectionInput {
  policies: Record<string, unknown>[];
  collectedAt?: string | null;
  fetchErrors?: BenchmarkCollection["fetchErrors"];
  sectionError?: string;
  /** Items of the older profile families; each is an empty section by default. */
  other?: Partial<Record<(typeof OTHER_FAMILIES)[number], unknown[]>>;
  /** Older profile families left out of the sections, as if not collected. */
  omit?: Array<(typeof OTHER_FAMILIES)[number]>;
}

/** Families of profile types outside the Settings Catalog. */
export const OTHER_FAMILIES = [
  "deviceConfigurations",
  "windowsUpdatePolicies",
  "administrativeTemplates",
  "securityBaselines",
] as const;

/** A device configuration item of a Graph type, for example "macOSCustomConfiguration". */
export function deviceConfiguration(type: string, id = "synthetic-config-1") {
  return {
    "@odata.type": `#microsoft.graph.${type}`,
    id,
    displayName: "Synthetic device configuration",
    assignments: [],
  };
}

/**
 * A finished collection: the Settings Catalog section plus the older profile
 * families, empty unless given.
 */
export function collection(input: CollectionInput): BenchmarkCollection {
  const others = OTHER_FAMILIES.filter(
    (family) => !input.omit?.includes(family),
  ).map((family) => ({
    key: family,
    familyKey: family,
    label: family,
    selectionPrefix: family,
    items: input.other?.[family] ?? [],
  }));
  return {
    ...(input.collectedAt === null
      ? {}
      : { collectedAt: input.collectedAt ?? "2026-10-20T09:00:00.000Z" }),
    collectionSkippedFamilies: [],
    sections: [
      {
        key: "settingsCatalog",
        familyKey: "settingsCatalog",
        label: "Settings Catalog",
        selectionPrefix: "catalog",
        items: input.policies,
        ...(input.sectionError
          ? { error: { message: input.sectionError } }
          : {}),
      },
      ...others,
    ],
    fetchErrors: input.fetchErrors ?? [],
    settingsCatalog: input.policies,
    deviceConfigurations: input.other?.deviceConfigurations ?? [],
    administrativeTemplates: input.other?.administrativeTemplates ?? [],
    compliancePolicies: [],
    securityBaselines: input.other?.securityBaselines ?? [],
    scripts: { windows: [], macOS: [] },
  };
}

export interface PackPolicyInput {
  name?: string;
  platforms?: string;
  description?: string;
  settings: Instance[];
}

export function pack(
  policies: PackPolicyInput[],
  recommendations?: BenchmarkPack["recommendations"],
  level: 1 | 2 = 1,
): BenchmarkPack {
  return {
    benchmark: BENCH,
    version: VERSION,
    level,
    policies: policies.map((policy, index) => ({
      name: policy.name ?? `Synthetic pack policy ${index + 1}`,
      platforms: policy.platforms ?? "windows10",
      technologies: "mdm",
      description: policy.description ?? "",
      settings: policy.settings.map((settingInstance) => ({ settingInstance })),
    })),
    ...(recommendations ? { recommendations } : {}),
  };
}

export function list(
  items: RecommendationList["items"],
  identity: Partial<Pick<RecommendationList, "benchmark" | "version">> = {},
): RecommendationList {
  return { benchmark: BENCH, version: VERSION, ...identity, items };
}

export const NOW = "2026-10-21T10:00:00.000Z";

export const DIGEST_A = `sha256:${"a".repeat(64)}`;

/** A stored run with the given numbers of pass, fail and review results. */
export function storedRun(
  assessedAt: string,
  pass: number,
  fail: number,
  extra: Partial<StoredBenchmarkRun> & { review?: number } = {},
): StoredBenchmarkRun {
  const { review = 0, ...rest } = extra;
  const results = (code: ResultCode, count: number, offset: number) =>
    Array.from(
      { length: count },
      (_, index): [string, ResultCode, string[]] => [
        `1.${offset + index + 1}`,
        code,
        code === "pass" ? [] : [`synthetic_${offset + index}`],
      ],
    );
  return {
    benchmark: "synthetic-bench",
    version: "1.0.0",
    level: 1,
    assessedAt,
    packDigest: DIGEST_A,
    basis: "recommendations",
    results: [
      ...results("pass", pass, 0),
      ...results("fail", fail, pass),
      ...results("review", review, pass + fail),
    ],
    ...rest,
  };
}
