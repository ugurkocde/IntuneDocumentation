import { createPrivateKey, sign, verify, type KeyObject } from "node:crypto";

// Entitlement token: base64url(JSON payload) + "." + base64url(Ed25519
// signature over the first segment). The desktop app verifies it offline with
// the embedded public key. It never carries the license key itself.
export interface EntitlementPayload {
  v: 1;
  sub: string;
  act: string;
  plan: "pro" | "msp";
  tenantId: string;
  installId: string;
  tenants: number;
  status: "granted";
  iat: number;
  exp: number;
}

export const TOKEN_LIFETIME_SECONDS = 14 * 24 * 60 * 60;

// Accepts a PKCS8 PEM, or base64 of either the PEM or the DER bytes, so the
// key can be pasted into a single-line environment variable.
export function loadSigningKey(value: string): KeyObject {
  const trimmed = value.trim();
  let key: KeyObject;
  if (trimmed.startsWith("-----BEGIN")) {
    key = createPrivateKey({ key: trimmed, format: "pem" });
  } else {
    const bytes = Buffer.from(trimmed, "base64");
    const text = bytes.toString("utf8");
    key = text.startsWith("-----BEGIN")
      ? createPrivateKey({ key: text, format: "pem" })
      : createPrivateKey({ key: bytes, format: "der", type: "pkcs8" });
  }
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error("DESKTOP_LICENSE_SIGNING_KEY must be an Ed25519 key");
  }
  return key;
}

export function signEntitlement(
  payload: EntitlementPayload,
  key: KeyObject,
): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(null, Buffer.from(body), key).toString("base64url");
  return `${body}.${signature}`;
}

// Returns the payload only when the signature is valid. Expiry and tenant
// checks are left to the caller.
export function verifyEntitlement(
  token: string,
  publicKey: KeyObject | string,
): EntitlementPayload | null {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  try {
    const ok = verify(
      null,
      Buffer.from(body),
      publicKey,
      Buffer.from(signature, "base64url"),
    );
    if (!ok) return null;
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as EntitlementPayload;
    return payload.v === 1 ? payload : null;
  } catch {
    return null;
  }
}
