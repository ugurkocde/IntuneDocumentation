import { DOMParser } from "@xmldom/xmldom";
import { canonicalOmaUri } from "./oma-uri";

// Public CSP schema: https://learn.microsoft.com/windows/client-management/mdm/applocker-csp
// Only ApplicationLaunchRestrictions policies, never similarly named WIP rules.
const APPLOCKER_NODE =
  /^\.\/Vendor\/MSFT\/AppLocker\/ApplicationLaunchRestrictions\/([^/]+)\/(EXE|DLL|MSI|Script)\/(Policy|EnforcementMode)$/;
const MODES = ["Enabled", "AuditOnly", "NotConfigured"];

export function inspectAppLocker(config: Record<string, any>) {
  if (!Array.isArray(config.omaSettings)) return;
  const nodes = config.omaSettings.flatMap((setting: any) => {
    const match = APPLOCKER_NODE.exec(canonicalOmaUri(setting?.omaUri) ?? "");
    return match
      ? [{ setting, group: match[1]!, type: match[2]!, node: match[3]! }]
      : [];
  });
  // Equivalent URI spellings address one node, so they share one override key.
  const overrides = new Map<string, any[]>();
  for (const { setting, group, type, node } of nodes)
    if (node === "EnforcementMode")
      overrides.set(`${group}/${type}`, [
        ...(overrides.get(`${group}/${type}`) ?? []),
        setting,
      ]);
  const candidates = nodes.filter((item: any) => item.node === "Policy");
  // An override without a rule collection in this profile still changes the
  // rules other profiles deliver to the same CSP group.
  const orphans = nodes
    .filter(
      (item: any) =>
        item.node === "EnforcementMode" &&
        !candidates.some(
          (candidate: any) =>
            candidate.group === item.group && candidate.type === item.type,
        ),
    )
    .map((item: any) => ({
      group: item.group,
      type: item.type,
      mode: item.setting.isEncrypted ? null : item.setting.value,
    }));
  if (orphans.some((item: any) => !MODES.includes(item.mode)))
    return {
      complete: false,
      matches: false,
      actual:
        "AppLocker enforcement mode override is encrypted, unavailable or unsupported.",
      reason: "A readable EnforcementMode value is required.",
    };
  const orphansEnabled = orphans.every((item: any) => item.mode === "Enabled");
  if (!candidates.length)
    return orphansEnabled
      ? undefined
      : {
          complete: true,
          matches: false,
          actual: JSON.stringify(orphans),
          reason:
            "This profile sets the AppLocker enforcement mode without rule collections. The override applies to rule collections delivered by other profiles in the same CSP group.",
        };
  const rows: Array<{
    group: string;
    type: string;
    mode: string;
    rules: number;
    allowRules: number;
    denyRules: number;
    paths: string[];
  }> = [];
  for (const { setting, group, type } of candidates) {
    const xml = setting.value;
    if (
      setting.isEncrypted ||
      typeof xml !== "string" ||
      xml.length > 1_000_000 ||
      /<!DOCTYPE|<!ENTITY/i.test(xml)
    )
      return {
        complete: false,
        matches: false,
        actual:
          "AppLocker policy payload is encrypted, unavailable, too large or contains a document type/entity declaration.",
        reason: "A readable AppLocker RuleCollection XML payload is required.",
      };
    try {
      const document = new DOMParser({
        onError: () => {
          throw new Error("Invalid XML");
        },
      }).parseFromString(xml, "application/xml");
      const root = document.documentElement;
      const expectedType = {
        EXE: "Exe",
        DLL: "Dll",
        MSI: "Msi",
        Script: "Script",
      }[type];
      if (
        !root ||
        root.tagName !== "RuleCollection" ||
        root.getAttribute("Type") !== expectedType
      )
        throw new Error("Unexpected rule collection");
      const override = overrides.get(`${group}/${type}`) ?? [];
      if (override.length > 1)
        throw new Error("Ambiguous enforcement override");
      const mode = override.length
        ? override[0].isEncrypted
          ? null
          : override[0].value
        : (root.getAttribute("EnforcementMode") ?? "");
      if (!MODES.includes(mode)) throw new Error("Unknown enforcement mode");
      const rules = Array.from(root.childNodes).filter((node) =>
        ["FilePathRule", "FilePublisherRule", "FileHashRule"].includes(
          node.nodeName,
        ),
      );
      const elements = rules.map(
        (node) =>
          node as unknown as { getAttribute(name: string): string | null },
      );
      if (
        elements.some(
          (rule) =>
            !["Allow", "Deny"].includes(rule.getAttribute("Action") ?? ""),
        )
      )
        throw new Error("Unknown rule action");
      const paths = Array.from(
        root.getElementsByTagName("FilePathCondition"),
      ).map((node) => node.getAttribute("Path") ?? "");
      rows.push({
        group,
        type,
        mode,
        rules: rules.length,
        allowRules: elements.filter(
          (rule) => rule.getAttribute("Action") === "Allow",
        ).length,
        denyRules: elements.filter(
          (rule) => rule.getAttribute("Action") === "Deny",
        ).length,
        paths,
      });
    } catch {
      return {
        complete: false,
        matches: false,
        actual: `Unreadable or unsupported ${type} rule collection`,
        reason:
          "The XML could not be validated. Review the original policy payload; no configuration result is inferred.",
      };
    }
  }
  const groups = [...new Set(rows.map((row) => row.group))];
  const matches =
    orphansEnabled &&
    rows.every((row) => row.mode === "Enabled" && row.rules > 0) &&
    groups.some((group) =>
      ["EXE", "DLL", "MSI", "Script"].every(
        (type) =>
          rows.filter((row) => row.group === group && row.type === type)
            .length === 1,
      ),
    );
  return {
    complete: true,
    matches,
    actual: JSON.stringify(orphans.length ? [...rows, ...orphans] : rows),
    reason:
      "Checks EXE, DLL, MSI and Script collection types, rule counts and enforcement mode together in one CSP group. Allowed publishers/hashes/paths still need comparison with the approved inventory. Compiled HTML, HTML applications, control-panel applets and actual device blocking require separate verification.",
  };
}
