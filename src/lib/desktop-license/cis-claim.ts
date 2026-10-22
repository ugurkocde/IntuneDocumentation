// Internal CIS Benchmarks access requires both server-side allowlists to match:
// the validated Polar license key id and the installation id. The license key
// is the authenticated credential on the key path and is derived server side
// from the stored organization mapping on the tenant path, so a caller-supplied
// tenant id is never sufficient evidence for this capability. This exists only
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
