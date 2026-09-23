import { describe, expect, it } from "vitest";
import { inspectAppLocker } from "../compliance/applocker";

const types = { EXE: "Exe", DLL: "Dll", MSI: "Msi", Script: "Script" };
function policy(mode = "Enabled") {
  return {
    omaSettings: Object.entries(types).map(([path, type]) => ({
      omaUri: `./Vendor/MSFT/AppLocker/ApplicationLaunchRestrictions/group/${path}/Policy`,
      value: `<RuleCollection Type="${type}" EnforcementMode="${mode}"><FilePathRule Id="rule" Name="Approved folder" UserOrGroupSid="S-1-1-0" Action="Allow"><Conditions><FilePathCondition Path="%PROGRAMFILES%\\*"/></Conditions></FilePathRule></RuleCollection>`,
    })),
  };
}
describe("AppLocker rule inspection", () => {
  it("respects an explicit enforcement-mode override", () => {
    const input = policy();
    input.omaSettings.push({
      omaUri: input.omaSettings[0]!.omaUri.replace(
        /\/Policy$/,
        "/EnforcementMode",
      ),
      value: "AuditOnly",
    });
    expect(inspectAppLocker(input)).toMatchObject({
      complete: true,
      matches: false,
    });
  });
  it.each([
    "./Device/Vendor/MSFT/AppLocker/ApplicationLaunchRestrictions/group/EXE/EnforcementMode",
    "./device/vendor/MSFT/AppLocker/ApplicationLaunchRestrictions/group/EXE/EnforcementMode",
  ])("detects an override under the equivalent URI %s", (omaUri) => {
    const input = policy();
    input.omaSettings.push({ omaUri, value: "AuditOnly" });
    expect(inspectAppLocker(input)).toMatchObject({
      complete: true,
      matches: false,
    });
  });
  it("treats overrides under both device spellings as ambiguous", () => {
    const input = policy();
    const uri =
      "./Vendor/MSFT/AppLocker/ApplicationLaunchRestrictions/group/EXE/EnforcementMode";
    input.omaSettings.push(
      { omaUri: uri, value: "Enabled" },
      { omaUri: uri.replace("./", "./Device/"), value: "AuditOnly" },
    );
    expect(inspectAppLocker(input)).toMatchObject({
      complete: false,
      matches: false,
    });
  });
  it("does not treat a user-scope or differently cased CSP node as the device override", () => {
    const input = policy();
    input.omaSettings.push(
      {
        omaUri:
          "./User/Vendor/MSFT/AppLocker/ApplicationLaunchRestrictions/group/EXE/EnforcementMode",
        value: "AuditOnly",
      },
      {
        omaUri:
          "./Vendor/MSFT/applocker/ApplicationLaunchRestrictions/group/EXE/EnforcementMode",
        value: "AuditOnly",
      },
    );
    expect(inspectAppLocker(input)!.matches).toBe(true);
  });
  it("reports a mode override without rule collections as contrary evidence", () => {
    const override = (value: string) => ({
      omaSettings: [
        {
          omaUri:
            "./Device/Vendor/MSFT/AppLocker/ApplicationLaunchRestrictions/group/DLL/EnforcementMode",
          value,
        },
      ],
    });
    expect(inspectAppLocker(override("AuditOnly"))).toMatchObject({
      complete: true,
      matches: false,
    });
    expect(inspectAppLocker(override("Enabled"))).toBeUndefined();
    expect(inspectAppLocker(override("Sometimes"))).toMatchObject({
      complete: false,
    });
    const input = policy();
    input.omaSettings.push(override("AuditOnly").omaSettings[0]!);
    input.omaSettings.forEach((setting) => {
      setting.omaUri = setting.omaUri.replace(
        "/group/DLL/Policy",
        "/other/DLL/Policy",
      );
    });
    expect(inspectAppLocker(input)!.matches).toBe(false);
  });
  it("inspects collection types, mode, counts and rule paths", () => {
    const result = inspectAppLocker(policy())!;
    expect(result).toMatchObject({ complete: true, matches: true });
    expect(result.actual).toContain("%PROGRAMFILES%");
    expect(result.reason).toContain("approved inventory");
  });
  it.each(["AuditOnly", "NotConfigured"])(
    "does not accept %s as enforced",
    (mode) => {
      expect(inspectAppLocker(policy(mode))).toMatchObject({
        complete: true,
        matches: false,
      });
    },
  );
  it("does not combine different CSP groups or ignore absent collections", () => {
    const input = policy();
    input.omaSettings[0]!.omaUri = input.omaSettings[0]!.omaUri.replace(
      "/group/",
      "/other/",
    );
    expect(inspectAppLocker(input)!.matches).toBe(false);
    input.omaSettings.pop();
    expect(inspectAppLocker(input)!.matches).toBe(false);
  });
  it.each([
    "<RuleCollection>",
    '<!DOCTYPE xml [<!ENTITY x "data">]><RuleCollection/>',
    '<RuleCollection Type="Dll" EnforcementMode="Enabled"/>',
  ])("rejects malformed or unsupported XML", (xml) => {
    const input = policy();
    input.omaSettings[0]!.value = xml;
    expect(inspectAppLocker(input)).toMatchObject({
      complete: false,
      matches: false,
    });
  });
  it("does not interpret WIP paths as application control", () => {
    const input = policy();
    input.omaSettings.forEach((setting) => {
      setting.omaUri = setting.omaUri.replace(
        "ApplicationLaunchRestrictions",
        "EnterpriseDataProtection",
      );
    });
    expect(inspectAppLocker(input)).toBeUndefined();
  });
});
