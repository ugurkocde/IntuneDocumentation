import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { EnterpriseError } from "./domain";
export const secretToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
function keyring() {
  const raw: unknown = JSON.parse(
    process.env.ENTERPRISE_ENCRYPTION_KEYS ?? "{}",
  );
  if (!raw || typeof raw !== "object")
    throw new EnterpriseError(503, "Encrypted storage is not configured.");
  return raw as Record<string, string>;
}
function key(id: string) {
  const value = keyring()[id];
  const decoded = Buffer.from(value ?? "", "base64");
  if (decoded.length !== 32)
    throw new EnterpriseError(503, "Encrypted storage key is unavailable.");
  return decoded;
}
// AAD binds ciphertext to its workspace, customer and record. Moving blobs cannot move access.
export function encrypt(value: unknown, context: string) {
  const id = process.env.ENTERPRISE_ACTIVE_KEY ?? "";
  const nonce = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(id), nonce);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return JSON.stringify({
    v: 1,
    key: id,
    nonce: nonce.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  });
}
export function decrypt<T>(encrypted: string, context: string): T {
  const envelope = JSON.parse(encrypted) as {
    v: number;
    key: string;
    nonce: string;
    tag: string;
    data: string;
  };
  if (envelope.v !== 1) throw new Error("Unsupported encryption version");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(envelope.key),
    Buffer.from(envelope.nonce, "base64"),
  );
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(envelope.data, "base64")),
      decipher.final(),
    ]).toString("utf8"),
  ) as T;
}
