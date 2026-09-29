import { describe, expect, it } from "vitest";
import {
  licenseAllowRule,
  licenseIssueCause,
  licenseIssueReport,
  licenseIssueText,
} from "./license-issues";

describe("licenseIssueCause", () => {
  it.each([
    ["net::ERR_CERT_AUTHORITY_INVALID", "certificate"],
    ["net::ERR_CERT_DATE_INVALID", "certificate"],
    ["net::ERR_SSL_PROTOCOL_ERROR", "certificate"],
    ["net::ERR_PROXY_CONNECTION_FAILED", "proxy"],
    ["net::ERR_TUNNEL_CONNECTION_FAILED", "proxy"],
    ["net::ERR_PROXY_AUTH_UNSUPPORTED", "proxyAuth"],
    ["HTTP 407", "proxyAuth"],
    ["HTTP 403", "blocked"],
    ["net::ERR_CONNECTION_REFUSED", "blocked"],
    ["net::ERR_CONNECTION_RESET", "blocked"],
    ["net::ERR_BLOCKED_BY_ADMINISTRATOR", "blocked"],
    ["net::ERR_NAME_NOT_RESOLVED", "dns"],
    ["net::ERR_INTERNET_DISCONNECTED", "offline"],
    ["net::ERR_CONNECTION_TIMED_OUT", "timeout"],
    ["Timeout", "timeout"],
    ["HTTP 502", "service"],
    ["net::ERR_SOMETHING_NEW", "unknown"],
    ["fetch failed", "unknown"],
  ])("maps %s to %s", (code, cause) => {
    expect(licenseIssueCause(code)).toBe(cause);
  });
});

describe("licenseIssueText", () => {
  it("names the URL pattern to allow", () => {
    const endpoint = "https://intunedocumentation.com/api/desktop-license/activate";
    expect(licenseAllowRule(endpoint)).toBe("https://intunedocumentation.com/api/desktop-license/*");
    expect(licenseIssueText("blocked", endpoint).steps.join(" ")).toContain(
      "https://intunedocumentation.com/api/desktop-license/*",
    );
  });

  it("builds a report without anything beyond the issue fields", () => {
    const report = licenseIssueReport({
      cause: "certificate",
      code: "net::ERR_CERT_AUTHORITY_INVALID",
      endpoint: "https://intunedocumentation.com/api/desktop-license/refresh",
      at: "2026-09-29T15:00:00.000Z",
      appVersion: "0.1.3",
      platform: "Windows x64",
    });
    expect(report).toContain("Error code: net::ERR_CERT_AUTHORITY_INVALID");
    expect(report).toContain("Platform: Windows x64");
    expect(report.split("\n")).toHaveLength(9);
  });
});
