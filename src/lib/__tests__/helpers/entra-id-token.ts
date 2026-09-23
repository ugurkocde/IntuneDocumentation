import { generateKeyPairSync } from "crypto";
import jwt from "jsonwebtoken";

// Test signing key served as a mocked Entra JWKS. Never contacts Entra.
export const CLIENT_ID = "11111111-2222-3333-4444-555555555555";
export const TENANT_ID = "00000000-0000-0000-0000-000000000001";
const KID = "test-kid";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const { privateKey: otherKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

export const jwksResponse = () =>
  Response.json({
    keys: [{ ...publicKey.export({ format: "jwk" }), kid: KID, use: "sig" }],
  });

const claims = (overrides: Record<string, unknown> = {}) => ({
  aud: CLIENT_ID,
  iss: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
  tid: TENANT_ID,
  oid: "aaaaaaaa-0000-0000-0000-000000000001",
  preferred_username: "admin@example.invalid",
  ...overrides,
});

export function signedIdToken(
  overrides: Record<string, unknown> = {},
  options: { key?: "valid" | "other"; expiresIn?: number } = {},
) {
  return jwt.sign(
    claims(overrides),
    options.key === "other" ? otherKey : privateKey,
    {
      algorithm: "RS256",
      keyid: KID,
      expiresIn: options.expiresIn ?? 3600,
    },
  );
}

export function unsignedIdToken(overrides: Record<string, unknown> = {}) {
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return `${part({ alg: "none", typ: "JWT", kid: KID })}.${part({
    ...claims(overrides),
    exp: now + 3600,
  })}.`;
}
