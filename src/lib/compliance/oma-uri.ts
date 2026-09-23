// OMA DM: a LocURL without a ./Device or ./User prefix is device targeted, and
// Microsoft documents the scope prefix in both cases (./device/vendor/MSFT).
// https://learn.microsoft.com/windows/client-management/oma-dm-protocol-support
// ./User targets a different node, and CSP node names stay case sensitive.
export function canonicalOmaUri(uri: unknown): string | undefined {
  if (typeof uri !== "string") return;
  const device = /^\.\/(?:[Dd]evice\/)?[Vv]endor\/MSFT\//.exec(uri);
  return device ? `./Vendor/MSFT/${uri.slice(device[0].length)}` : uri;
}
