import { DOMParser } from "@xmldom/xmldom";

// Public CSP schema: https://learn.microsoft.com/windows/client-management/mdm/applocker-csp
// Only ApplicationLaunchRestrictions policies, never similarly named WIP rules.
export function inspectAppLocker(config: Record<string, any>) {
  if (!Array.isArray(config.omaSettings)) return;
  const candidates = config.omaSettings.flatMap((setting: any) => {
    const match =
      /^\.\/(?:Device\/)?Vendor\/MSFT\/AppLocker\/ApplicationLaunchRestrictions\/([^/]+)\/(EXE|DLL|MSI|Script)\/Policy$/.exec(
        setting?.omaUri ?? "",
      );
    return match ? [{ setting, group: match[1]!, type: match[2]! }] : [];
  });
  if (!candidates.length) return;
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
      const overrideUri = setting.omaUri.replace(
        /\/Policy$/,
        "/EnforcementMode",
      );
      const overrides = config.omaSettings.filter(
        (item: any) => item?.omaUri === overrideUri,
      );
      if (overrides.length > 1)
        throw new Error("Ambiguous enforcement override");
      const mode = overrides.length
        ? overrides[0].value
        : (root.getAttribute("EnforcementMode") ?? "");
      if (!["Enabled", "AuditOnly", "NotConfigured"].includes(mode))
        throw new Error("Unknown enforcement mode");
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
    actual: JSON.stringify(rows),
    reason:
      "Checks EXE, DLL, MSI and Script collection types, rule counts and enforcement mode together in one CSP group. Allowed publishers/hashes/paths still need comparison with the approved inventory. Compiled HTML, HTML applications, control-panel applets and actual device blocking require separate verification.",
  };
}
