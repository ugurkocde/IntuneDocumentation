// Internal CIS Benchmarks access requires both server-side allowlists to match:
// the validated Polar license key id and the installation id, and it is only
// issued when the caller presented the license key itself (key activation and
// refresh). The organization sharing path supplies the key server side while
// the installation id comes from the caller, so it never receives the claim. This exists only
// for internal development and testing until the CIS commercial-use agreement
// covers Intune Documentation, and is never a customer entitlement.
function allowlist(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

// Read on every call, so removing an entry takes effect on the next request
// rather than when the 14 day token expires.
export function cisInternalAllowed(fields: {
  sub: string;
  installId: string;
}): boolean {
  return (
    allowlist("DESKTOP_CIS_INTERNAL_LICENSE_KEY_IDS").includes(
      fields.sub.toLowerCase(),
    ) &&
    allowlist("DESKTOP_CIS_INTERNAL_INSTALL_IDS").includes(
      fields.installId.toLowerCase(),
    )
  );
}

export function cisInternalClaim(fields: {
  sub: string;
  installId: string;
}): { cis: "internal" } | Record<string, never> {
  return cisInternalAllowed(fields) ? { cis: "internal" } : {};
}
