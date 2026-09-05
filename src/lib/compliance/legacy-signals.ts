import type { LegacySettingSignal } from "./types";

// Microsoft Policy/BitLocker/Firewall CSP identifiers. Keep the value types:
// OMA-URI integers and booleans are not Settings Catalog choice suffixes.
// https://learn.microsoft.com/en-us/windows/client-management/mdm/policy-csp-defender
// https://learn.microsoft.com/en-us/windows/client-management/mdm/bitlocker-csp
// https://learn.microsoft.com/en-us/windows/client-management/mdm/firewall-csp
const integer = (
  settingId: string,
  enabled: number,
  disabled: number,
): LegacySettingSignal => ({
  source: "omaUri",
  settingId,
  enforcedWhen: { kind: "equals", value: enabled },
  disabledWhen: { kind: "equals", value: disabled },
});
export const LEGACY_SIGNALS: Readonly<
  Record<string, readonly LegacySettingSignal[]>
> = {
  "windows-disk-encryption": [
    integer("./Device/Vendor/MSFT/BitLocker/RequireDeviceEncryption", 1, 0),
  ],
  "windows-realtime-antimalware": [
    integer(
      "./Device/Vendor/MSFT/Policy/Config/Defender/AllowRealtimeMonitoring",
      1,
      0,
    ),
  ],
  "windows-password-required": [
    integer(
      "./Device/Vendor/MSFT/Policy/Config/DeviceLock/DevicePasswordEnabled",
      0,
      1,
    ),
  ],
  "windows-telemetry-minimized": [
    integer("./Device/Vendor/MSFT/Policy/Config/System/AllowTelemetry", 0, 1),
  ],
  "windows-cortana-disabled": [
    integer("./Device/Vendor/MSFT/Policy/Config/Experience/AllowCortana", 0, 1),
  ],
  "windows-automatic-updates": [
    {
      source: "omaUri",
      settingId: "./Device/Vendor/MSFT/Policy/Config/Update/AllowAutoUpdate",
      enforcedWhen: { kind: "oneOf", values: [1, 2, 3, 4] },
      disabledWhen: { kind: "equals", value: 5 },
    },
  ],
  "windows-firewall": (["Domain", "Private", "Public"] as const).map(
    (profile) => ({
      source: "omaUri",
      settingId: `./Vendor/MSFT/Firewall/MdmStore/${profile}Profile/EnableFirewall`,
      requirementGroup: profile.toLowerCase(),
      enforcedWhen: { kind: "equals", value: true },
      disabledWhen: { kind: "equals", value: false },
    }),
  ),
};
