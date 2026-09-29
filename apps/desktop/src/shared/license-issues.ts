import type { LicenseConnectionIssue, LicenseIssueCause } from "./ipc-types";

// Maps what a failed license call reported (a Chromium net error such as
// net::ERR_CERT_AUTHORITY_INVALID, "Timeout", or "HTTP <status>") to its
// likely cause.
export function licenseIssueCause(code: string): LicenseIssueCause {
  if (code === "Timeout") return "timeout";
  if (code === "HTTP 407") return "proxyAuth";
  if (code === "HTTP 403") return "blocked";
  if (code.startsWith("HTTP ")) return "service";
  const error = code.replace(/^net::/, "");
  if (/^ERR_(CERT_|CERTIFICATE_|SSL_|BAD_SSL_)/.test(error))
    return "certificate";
  if (/^ERR_PROXY_AUTH/.test(error)) return "proxyAuth";
  if (
    /^ERR_(PROXY_|TUNNEL_CONNECTION_FAILED|MANDATORY_PROXY_|PAC_)/.test(error)
  )
    return "proxy";
  if (/^ERR_(NAME_NOT_RESOLVED|NAME_RESOLUTION_FAILED|DNS_)/.test(error))
    return "dns";
  if (
    /^ERR_(INTERNET_DISCONNECTED|NETWORK_CHANGED|ADDRESS_UNREACHABLE)$/.test(
      error,
    )
  )
    return "offline";
  if (/^ERR_(TIMED_OUT|CONNECTION_TIMED_OUT)$/.test(error)) return "timeout";
  if (
    /^ERR_(CONNECTION_(REFUSED|RESET|CLOSED|ABORTED|FAILED)|EMPTY_RESPONSE|BLOCKED_BY_|NETWORK_ACCESS_DENIED|ACCESS_DENIED)/.test(
      error,
    )
  ) {
    return "blocked";
  }
  return "unknown";
}

export interface LicenseIssueText {
  title: string;
  explanation: string;
  steps: string[];
}

// The URL pattern IT needs to allow, derived from the endpoint that failed.
export function licenseAllowRule(endpoint: string): string {
  try {
    return `${new URL(endpoint).origin}/api/desktop-license/*`;
  } catch {
    return endpoint;
  }
}

export function licenseIssueText(
  cause: LicenseIssueCause,
  endpoint: string,
): LicenseIssueText {
  let host = endpoint;
  try {
    host = new URL(endpoint).host;
  } catch {
    // Keep the raw endpoint.
  }
  const rule = licenseAllowRule(endpoint);
  switch (cause) {
    case "certificate":
      return {
        title:
          "The secure connection to the licensing service could not be verified",
        explanation:
          "Something on your network, usually a proxy or security tool that inspects HTTPS traffic, presented a certificate this device does not trust.",
        steps: [
          `Ask IT to exclude ${host} from HTTPS inspection, or to deploy the inspection root certificate to this device.`,
          "Check that the date and time on this device are correct.",
        ],
      };
    case "proxy":
      return {
        title:
          "Your proxy could not forward the request to the licensing service",
        explanation: `The app uses this device's proxy settings, and the proxy refused or failed the connection to ${host}.`,
        steps: [
          `Ask IT to allow ${rule} through the proxy.`,
          "Check the proxy settings of this device.",
        ],
      };
    case "proxyAuth":
      return {
        title: "Your proxy requires a sign-in the app cannot provide",
        explanation:
          "The proxy asked for credentials (HTTP 407). Browsers answer this automatically, but the app cannot.",
        steps: [
          `Ask IT to allow ${rule} without proxy authentication for the Intune Documentation app.`,
        ],
      };
    case "blocked":
      return {
        title: "A firewall or web filter blocked the licensing service",
        explanation: `The connection to ${host} was refused, reset or answered with a block page. The website can still open in a browser while the app's license requests are blocked.`,
        steps: [`Ask IT to allow ${rule} for the Intune Documentation app.`],
      };
    case "dns":
      return {
        title: "The licensing service address could not be resolved",
        explanation: `This device could not look up ${host} in DNS.`,
        steps: [
          "Check the network connection and DNS settings.",
          `If your network filters DNS, ask IT to allow ${host}.`,
        ],
      };
    case "offline":
      return {
        title: "This device is offline",
        explanation:
          "No network connection was available when the app contacted the licensing service.",
        steps: ["Connect to the internet and retry."],
      };
    case "timeout":
      return {
        title: "The licensing service did not answer in time",
        explanation:
          "No answer arrived within 20 seconds. A firewall that silently drops traffic, or a slow proxy, usually causes this.",
        steps: [
          "Retry in a moment.",
          `If it keeps happening, ask IT to allow ${rule}.`,
        ],
      };
    case "service":
      return {
        title: "The licensing service is unavailable",
        explanation:
          "The service answered with an error. This is usually temporary.",
        steps: [
          "Wait a few minutes and retry.",
          "If it persists, contact support with the details below.",
        ],
      };
    default:
      return {
        title: "The licensing service could not be reached",
        explanation:
          "The connection failed for a reason the app does not recognize.",
        steps: [
          "Retry in a moment.",
          "If it keeps happening, send the details below to your IT team or to support.",
        ],
      };
  }
}

// The error message a failed license call throws. The license panel matches
// it to show the Details view in place of the plain error.
export function licenseIssueMessage(issue: LicenseConnectionIssue): string {
  return `${licenseIssueText(issue.cause, issue.endpoint).title}.`;
}

// Plain text for IT or support. Holds no license key, token or request body.
export function licenseIssueReport(issue: LicenseConnectionIssue): string {
  const text = licenseIssueText(issue.cause, issue.endpoint);
  return [
    "Intune Documentation: licensing service connection problem",
    `Problem: ${text.title}`,
    `Likely cause: ${text.explanation}`,
    `Error code: ${issue.code}`,
    `Endpoint: ${issue.endpoint}`,
    `Allow rule: ${licenseAllowRule(issue.endpoint)}`,
    `Time: ${issue.at}`,
    `App version: ${issue.appVersion}`,
    `Platform: ${issue.platform}`,
  ].join("\n");
}
