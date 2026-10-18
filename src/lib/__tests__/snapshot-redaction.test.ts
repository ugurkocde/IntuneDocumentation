import { createHmac } from "node:crypto";
import { inspect } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  compareProjections,
  historyDiffView,
} from "../../../apps/desktop/src/main/history";
import { buildSettingsIndex } from "../../../apps/desktop/src/main/search-index";
import type { HistoryEntry } from "../../../apps/desktop/src/shared/ipc-types";
import type { DetailedExportData } from "../configuration-analyzer";
import type { ConfigurationSectionData } from "../configuration-sections";
import { assessCompliance } from "../compliance/engine";
import { generateDetailedDOCX } from "../docx-generator-detailed";
import {
  REDACTED_VALUE,
  redactedDigests,
  sanitizeGraphData,
  setRedactionDigest,
} from "../intune-policy-registry";
import { generateDetailedPDF } from "../pdf-generator-detailed";
import { diffSnapshots } from "../snapshots/diff";
import {
  contentDigest,
  projectSnapshot,
  type SnapshotProjection,
} from "../snapshots/projection";
import { createReference, encodeReference } from "../snapshots/reference";
import { extractPdfStreamText } from "./helpers/pdf-text";
import { extractZipEntry } from "./helpers/zip";

// The collector to snapshot flow for values the collector redacts: it keeps
// a digest in memory, the snapshot keeps only a keyed fingerprint of it, and
// neither ever reaches an export, the search index, the renderer, a
// reference file or a log.

type Secrets = {
  wifiKey: string;
  catalogPassword: string;
  omaPassword: string;
  profileKey: string;
  apiKey: string;
  script: string;
  detection: string;
};

const SECRETS_1: Secrets = {
  wifiKey: "DUMMY-wifi-1",
  catalogPassword: "DUMMY-catalog-1",
  omaPassword: "DUMMY-oma-1",
  profileKey: "DUMMY-profile-1",
  apiKey: "DUMMY-api-1",
  script: "Write-Host DUMMY-script-1",
  detection: "RFVNTVktZGV0ZWN0aW9uLTE=",
};

const SECRETS_2: Secrets = {
  wifiKey: "DUMMY-wifi-2",
  catalogPassword: "DUMMY-catalog-2",
  omaPassword: "DUMMY-oma-2",
  profileKey: "DUMMY-profile-2",
  apiKey: "DUMMY-api-2",
  script: "Write-Host DUMMY-script-2",
  detection: "RFVNTVktZGV0ZWN0aW9uLTI=",
};

const SIMPLE =
  "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance";

// Graph shaped items, as the collector reads them before sanitizing.
function graph(secrets: Secrets) {
  return {
    settingsCatalog: [
      {
        id: "wifi",
        name: "Wi-Fi",
        platforms: "windows10",
        settings: [
          {
            id: "0",
            settingInstance: {
              "@odata.type": SIMPLE,
              settingDefinitionId: "vendor_msft_wifi_presharedkey",
              simpleSettingValue: {
                "@odata.type":
                  "#microsoft.graph.deviceManagementConfigurationSecretSettingValue",
                value: secrets.wifiKey,
              },
            },
            settingDefinitions: [
              {
                id: "vendor_msft_wifi_presharedkey",
                displayName: "Pre-shared key",
              },
            ],
          },
          {
            id: "1",
            settingInstance: {
              "@odata.type": SIMPLE,
              settingDefinitionId: "com.apple.wifi.managed_password",
              simpleSettingValue: {
                "@odata.type":
                  "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                value: secrets.catalogPassword,
              },
            },
          },
        ],
      },
    ],
    deviceConfigurations: [
      {
        id: "custom",
        "@odata.type": "#microsoft.graph.windows10CustomConfiguration",
        displayName: "Custom",
        omaSettings: [
          {
            "@odata.type": "#microsoft.graph.omaSettingString",
            omaUri: "./Vendor/MSFT/Custom/Password",
            displayName: "Service password",
            value: secrets.omaPassword,
          },
        ],
      },
      {
        id: "wifi-profile",
        "@odata.type": "#microsoft.graph.windowsWifiConfiguration",
        displayName: "Office Wi-Fi",
        ssid: "Office",
        preSharedKey: secrets.profileKey,
      },
    ],
    appConfigurations: [
      {
        id: "mail",
        "@odata.type": "#microsoft.graph.iosMobileAppConfiguration",
        displayName: "Mail app",
        settings: [
          {
            appConfigKey: "apiKey",
            appConfigKeyType: "stringType",
            appConfigKeyValue: secrets.apiKey,
          },
        ],
      },
    ],
    // Decoded by the collector before it sanitizes.
    windowsScripts: [
      {
        id: "script",
        displayName: "Install",
        fileName: "install.ps1",
        scriptContent: secrets.script,
      },
    ],
    deviceHealthScripts: [
      {
        id: "health",
        displayName: "Health",
        detectionScriptContent: secrets.detection,
      },
    ],
  };
}

function section(
  key: string,
  items: unknown[],
  familyKey = key,
): ConfigurationSectionData {
  return { key, familyKey, label: key, selectionPrefix: key, items };
}

// What getAllDetailedConfigurations returns: arrays sanitized as a whole,
// and registry sections sanitized per item, then spread with extra fields.
function collect(secrets: Secrets): DetailedExportData {
  const raw = graph(secrets);
  const sanitized = <T>(value: T) => sanitizeGraphData(value) as T;
  const settingsCatalog = sanitized(raw.settingsCatalog);
  const deviceConfigurations = sanitized(raw.deviceConfigurations);
  const appConfigurations = sanitized(raw.appConfigurations);
  const windows = sanitized(raw.windowsScripts);
  const health = raw.deviceHealthScripts.map((item) => ({
    ...(sanitizeGraphData(item) as Record<string, unknown>),
    configType: "Remediation",
    registryKey: "deviceHealthScripts",
  }));
  return {
    collectedAt: "2026-10-18T10:00:00Z",
    settingsCatalog,
    deviceConfigurations,
    administrativeTemplates: [],
    compliancePolicies: [],
    securityBaselines: [],
    appConfigurations,
    scripts: { windows, macOS: [] },
    sections: [
      section("settingsCatalog", settingsCatalog),
      section("deviceConfigurations", deviceConfigurations),
      section("appConfigurations", appConfigurations),
      section("windowsScripts", windows, "scripts"),
      section("deviceHealthScripts", health, "remediations"),
    ],
    fetchErrors: [],
  } as DetailedExportData;
}

const fingerprint = (digest: string) =>
  createHmac("sha256", "test key").update(digest).digest("hex").slice(0, 32);

function snap(data: DetailedExportData): SnapshotProjection {
  // Through JSON, as the store keeps it.
  return JSON.parse(
    JSON.stringify(
      projectSnapshot(data, assessCompliance(data), new Map(), fingerprint),
    ),
  );
}

// Every digest the collector took and every fingerprint the snapshot keeps.
function digestsOf(secrets: Secrets): string[] {
  return Object.values(secrets).flatMap((secret) => {
    const digest = contentDigest(secret);
    return [digest, digest.slice(0, 16), fingerprint(digest)];
  });
}

function leaked(text: string, secrets: Secrets): string[] {
  return [...digestsOf(secrets), ...Object.values(secrets)].filter((value) =>
    text.includes(value),
  );
}

function entry(id: string, projection: SnapshotProjection): HistoryEntry {
  return {
    id,
    collectedAt: projection.collectedAt,
    items: 0,
    partial: projection.partial,
    rulesetVersion: projection.rulesetVersion,
    bytes: 0,
  };
}

describe("redacted values in history", () => {
  beforeAll(() => setRedactionDigest(contentDigest));
  afterAll(() => setRedactionDigest(null));

  it("keeps a digest of each redacted value next to the redacted field", () => {
    const data = collect(SECRETS_1);
    const profile = data.deviceConfigurations[1] as Record<string, unknown>;
    expect(profile.preSharedKey).toBe(REDACTED_VALUE);
    expect(redactedDigests(profile)).toEqual([
      ["preSharedKey", contentDigest(SECRETS_1.profileKey)],
    ]);
    // An item spread after sanitizing, as registry sections are, keeps it.
    const health = data.sections!.at(-1)!.items[0] as Record<string, unknown>;
    expect(redactedDigests(health)).toEqual([
      ["detectionScriptContent", contentDigest(SECRETS_1.detection)],
    ]);
    // Sanitizing again keeps the first digest, also of a list value.
    expect(redactedDigests(sanitizeGraphData(profile))).toEqual(
      redactedDigests(profile),
    );
    const list = sanitizeGraphData({
      name: "ServerToken",
      values: ["DUMMY-a", "DUMMY-b"],
    });
    expect(redactedDigests(list)).toEqual([
      ["values", contentDigest(JSON.stringify(["DUMMY-a", "DUMMY-b"]))],
    ]);
    expect(redactedDigests(sanitizeGraphData(list))).toEqual(
      redactedDigests(list),
    );
  });

  it("takes no digest unless the desktop turns it on", () => {
    setRedactionDigest(null);
    try {
      const data = collect(SECRETS_1);
      expect(redactedDigests(data.deviceConfigurations[1])).toEqual([]);
      expect(
        snap(data).sections.every((s) => s.items.every((i) => !i.fingerprints)),
      ).toBe(true);
    } finally {
      setRedactionDigest(contentDigest);
    }
  });

  it("shows a changed script and secret as changed, not stored", () => {
    const same = diffSnapshots(
      snap(collect(SECRETS_1)),
      snap(collect(SECRETS_1)),
    );
    expect(same.policies).toEqual([]);

    const from = snap(collect(SECRETS_1));
    const to = snap(collect(SECRETS_2));
    const diff = diffSnapshots(from, to);
    const changes = diff.policies.flatMap((policy) =>
      policy.settings.map((setting) => ({
        policy: policy.displayName,
        name: setting.name,
        change: setting.change,
        before: setting.before,
        after: setting.after,
        notStored: setting.notStored,
        valueNotStored: setting.valueNotStored,
      })),
    );
    const value = {
      change: "changed",
      before: null,
      after: null,
      notStored: true,
    };
    expect(changes).toEqual(
      expect.arrayContaining([
        {
          policy: "Wi-Fi",
          name: "Pre-shared key",
          ...value,
          valueNotStored: true,
        },
        {
          policy: "Wi-Fi",
          name: "com.apple.wifi.managed_password",
          ...value,
          valueNotStored: true,
        },
        {
          policy: "Custom",
          name: "Service password",
          ...value,
          valueNotStored: true,
        },
        {
          policy: "Office Wi-Fi",
          name: "preSharedKey",
          ...value,
          valueNotStored: true,
        },
        { policy: "Mail app", name: "apiKey", ...value, valueNotStored: true },
        {
          policy: "Install",
          name: "Script content",
          ...value,
          valueNotStored: undefined,
        },
        {
          policy: "Health",
          name: "Detection script",
          ...value,
          valueNotStored: undefined,
        },
      ]),
    );
    expect(changes).toHaveLength(7);

    // What the renderer receives: the change, never a digest or fingerprint.
    const view = historyDiffView(
      entry("20261018T100000Z-00000001", from),
      entry("20261018T110000Z-00000002", to),
      compareProjections(from, to),
    );
    expect(leaked(JSON.stringify(view), SECRETS_1)).toEqual([]);
    expect(leaked(JSON.stringify(view), SECRETS_2)).toEqual([]);
    expect(leaked(JSON.stringify(diff), SECRETS_2)).toEqual([]);
  });

  it("keeps digests out of the snapshot except as keyed fingerprints", () => {
    const projection = snap(collect(SECRETS_1));
    const text = JSON.stringify(projection);
    const raw = Object.values(SECRETS_1).map((secret) => contentDigest(secret));
    for (const digest of raw) {
      expect(text).not.toContain(digest);
      expect(text).not.toContain(digest.slice(0, 16));
      expect(text).toContain(fingerprint(digest));
    }
    expect(
      Object.values(SECRETS_1).filter((secret) => text.includes(secret)),
    ).toEqual([]);
  });

  it("never lets a digest reach exports, search, the renderer, references or logs", async () => {
    const data = collect(SECRETS_1);

    // JSON exports and anything else serialized with JSON.
    expect(leaked(JSON.stringify(data), SECRETS_1)).toEqual([]);
    // IPC to the renderer is a structured clone, which drops symbol keys.
    const cloned = structuredClone(data);
    expect(redactedDigests(cloned.deviceConfigurations[1])).toEqual([]);
    // Logs and console output, also with hidden properties shown.
    expect(
      leaked(inspect(data, { depth: Infinity, showHidden: true }), SECRETS_1),
    ).toEqual([]);

    // The settings search index main holds and answers searches from.
    const index = buildSettingsIndex(data.sections!, (entrySection) => ({
      familyKey: entrySection.familyKey,
      label: entrySection.label,
      items: entrySection.items.map((item, position) => ({
        id: `${entrySection.key}-${position}`,
        displayName: entrySection.key,
        odataType: null,
        description: null,
        platforms: null,
        technologies: null,
        lastModifiedDateTime: null,
        assignmentCount: 0,
        assignedToAllUsers: false,
        assignedToAllDevices: false,
        hasFetchError: false,
      })),
    }));
    expect(index.rows.map((row) => row.value)).toContain(REDACTED_VALUE);
    expect(leaked(JSON.stringify(index.rows), SECRETS_1)).toEqual([]);

    // A reference file made from the snapshot projection.
    const reference = await createReference(snap(data), {
      createdAt: "2026-10-18T10:00:00Z",
      sourceLabel: "contoso",
    });
    expect(
      leaked(new TextDecoder().decode(encodeReference(reference)), SECRETS_1),
    ).toEqual([]);

    // PDF and Word documentation, generated from the data main holds.
    const pdf = extractPdfStreamText((await generateDetailedPDF(data)).buffer);
    // The redacted policies are in the document, without digests.
    expect(pdf).toContain("Office Wi-Fi");
    expect(pdf).toContain(REDACTED_VALUE);
    expect(leaked(pdf, SECRETS_1)).toEqual([]);
    const docx = extractZipEntry(
      (await generateDetailedDOCX(data)).buffer,
      "word/document.xml",
    );
    expect(docx).toContain("Office Wi-Fi");
    expect(docx).toContain(REDACTED_VALUE);
    expect(leaked(docx, SECRETS_1)).toEqual([]);
  }, 60_000);
});
