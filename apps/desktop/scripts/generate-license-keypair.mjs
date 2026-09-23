// Prints a new Ed25519 keypair for the desktop license tokens.
// The private key goes into the DESKTOP_LICENSE_SIGNING_KEY server environment
// variable (never into the repository). The public key is embedded in the
// desktop build through INTUNEDOC_LICENSE_PUBLIC_KEY.
import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privatePem = privateKey.export({ format: "pem", type: "pkcs8" });
const publicPem = publicKey.export({ format: "pem", type: "spki" });

console.log("DESKTOP_LICENSE_SIGNING_KEY (server secret, base64 of the PEM):");
console.log(Buffer.from(privatePem).toString("base64"));
console.log("");
console.log("INTUNEDOC_LICENSE_PUBLIC_KEY (desktop build, public):");
console.log(publicPem.trim());
