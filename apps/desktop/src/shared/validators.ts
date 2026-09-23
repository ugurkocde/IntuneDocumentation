const GUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOMAIN_PATTERN =
  /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function isGuid(value: string): boolean {
  return GUID_PATTERN.test(value.trim());
}

// Accepts a directory (tenant) id, a verified domain such as
// contoso.onmicrosoft.com, or the multi tenant "organizations" authority.
export function isTenantIdentifier(value: string): boolean {
  const trimmed = value.trim();
  return (
    isGuid(trimmed) ||
    trimmed.toLowerCase() === "organizations" ||
    DOMAIN_PATTERN.test(trimmed)
  );
}
