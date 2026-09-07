// Configure both origins together. Unconfigured/self-hosted deployments are
// private app surfaces and never run public-site analytics or chat scripts.
export function siteBoundary(origin: string) {
  const publicValue = process.env.PUBLIC_SITE_ORIGIN;
  const appValue = process.env.APP_SITE_ORIGIN;
  if (!publicValue && !appValue)
    return { mode: "app" as const, appOrigin: origin, publicOrigin: "" };
  if (!publicValue || !appValue)
    throw new Error("Configure both PUBLIC_SITE_ORIGIN and APP_SITE_ORIGIN");
  const publicOrigin = new URL(publicValue).origin;
  const appOrigin = new URL(appValue).origin;
  if (publicOrigin === appOrigin)
    throw new Error("Public and app origins must differ");
  return {
    mode: origin === publicOrigin ? ("public" as const) : ("app" as const),
    appOrigin,
    publicOrigin,
  };
}

export function contentSecurityPolicy(
  nonce: string,
  publicSite: boolean,
  development = false,
  supportOrigin = "",
  frameAncestor = "",
) {
  const crisp = publicSite
    ? " https://*.crisp.chat wss://*.relay.crisp.chat wss://*.relay.rescue.crisp.chat"
    : "";
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    `frame-ancestors ${frameAncestor || "'none'"}`,
    "form-action 'self' https://login.microsoftonline.com",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    `style-src 'self' 'unsafe-inline'${publicSite ? " https://client.crisp.chat" : ""}`,
    "img-src 'self' data: blob: https:",
    `font-src 'self' data:${publicSite ? " https://client.crisp.chat" : ""}`,
    `media-src 'self' blob:${publicSite ? " https://*.crisp.chat" : ""}`,
    `connect-src 'self' https://login.microsoftonline.com https://graph.microsoft.com https://changelog.ugurlabs.com${publicSite ? " https://plausible.io" : ""}${crisp}`,
    `frame-src 'self' https://login.microsoftonline.com${supportOrigin ? ` ${supportOrigin}` : ""}${publicSite ? " https://*.crisp.chat" : ""}`,
    `worker-src 'self' blob:${publicSite ? " https://*.crisp.chat" : ""}`,
    "manifest-src 'self'",
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
