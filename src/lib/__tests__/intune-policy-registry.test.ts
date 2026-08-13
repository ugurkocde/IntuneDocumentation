import { describe, expect, it } from "vitest";
import {
  INTUNE_POLICY_REGISTRY,
  REDACTED_VALUE,
  sanitizeGraphData,
} from "../intune-policy-registry";

describe("Intune policy registry", () => {
  it("uses beta-relative paths and unique keys", () => {
    const keys = INTUNE_POLICY_REGISTRY.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(
      INTUNE_POLICY_REGISTRY.every(
        (entry) => entry.path.startsWith("/") && !entry.path.includes("v1.0"),
      ),
    ).toBe(true);
  });

  it("redacts enrollment tokens, script bodies, payloads, and icons recursively", () => {
    const sanitized = sanitizeGraphData({
      tokenValue: "secret-token",
      nested: {
        qrCodeContent: "working-enrollment-code",
        scriptContent: "Write-Host secret",
        payload: "base64-payload",
        largeIcon: { value: "base64-icon" },
      },
      displayName: "Safe name",
      preSharedKey: "wifi-secret",
      sharedSecret: "vpn-secret",
      token: "vpp-token",
      apiKey: "api-key",
      payloadJson: "sensitive payload",
      omaSettings: [
        {
          displayName: "VPN pre-shared key",
          omaUri: "./Device/Vendor/MSFT/VPNv2/Profile/PreSharedKey",
          value: "oma-secret",
        },
        {
          displayName: "Password policy",
          omaUri: "./Device/Vendor/MSFT/Policy/PasswordPolicy",
          value: "document-this-policy-value",
        },
      ],
    });

    expect(sanitized).toEqual({
      tokenValue: REDACTED_VALUE,
      nested: {
        qrCodeContent: REDACTED_VALUE,
        scriptContent: REDACTED_VALUE,
        payload: REDACTED_VALUE,
        largeIcon: REDACTED_VALUE,
      },
      displayName: "Safe name",
      preSharedKey: REDACTED_VALUE,
      sharedSecret: REDACTED_VALUE,
      token: REDACTED_VALUE,
      apiKey: REDACTED_VALUE,
      payloadJson: REDACTED_VALUE,
      omaSettings: [
        {
          displayName: "VPN pre-shared key",
          omaUri: "./Device/Vendor/MSFT/VPNv2/Profile/PreSharedKey",
          value: REDACTED_VALUE,
        },
        {
          displayName: "Password policy",
          omaUri: "./Device/Vendor/MSFT/Policy/PasswordPolicy",
          value: "document-this-policy-value",
        },
      ],
    });
  });
});
