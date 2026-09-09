import {
  createRemoteJWKSet,
  decodeJwt,
  jwtVerify,
  type JWTPayload,
} from "jose";
import { EnterpriseError, uuid } from "./domain";
const consumer = "9188040d-6c67-4c5b-b112-36a304b66dad";
const keys = createRemoteJWKSet(
  new URL(
    "https://login.microsoftonline.com/organizations/discovery/v2.0/keys",
  ),
);
export type Identity = {
  tenantId: string;
  objectId: string;
  name: string;
  directoryRoles?: string[];
  issuedAt?: number;
};
export function validateClaims(payload: JWTPayload): Identity {
  const tenantId = uuid.parse(payload.tid),
    objectId = uuid.parse(payload.oid);
  if (
    tenantId === consumer ||
    payload.ver !== "2.0" ||
    payload.iss !== `https://login.microsoftonline.com/${tenantId}/v2.0` ||
    payload.azp !== process.env.ENTERPRISE_ENTRA_CLIENT_ID ||
    typeof payload.scp !== "string" ||
    !payload.scp.split(" ").includes("access_as_user")
  ) {
    throw new EnterpriseError(
      401,
      "A Microsoft business account and an access token for this application are required.",
    );
  }
  return {
    tenantId,
    objectId,
    directoryRoles: Array.isArray(payload.wids)
      ? payload.wids.filter(
          (role): role is string =>
            typeof role === "string" && uuid.safeParse(role).success,
        )
      : [],
    issuedAt: payload.iat,
    name:
      typeof payload.name === "string"
        ? payload.name.slice(0, 200)
        : "Team member",
  };
}
export async function authenticate(request: Request): Promise<Identity> {
  if (process.env.ENTERPRISE_ENABLED !== "true")
    throw new EnterpriseError(
      503,
      "Paid workspaces are not enabled on this installation.",
    );
  const audience = process.env.ENTERPRISE_ENTRA_API_ID;
  if (!audience || !process.env.ENTERPRISE_ENTRA_CLIENT_ID)
    throw new EnterpriseError(503, "Business sign-in is not configured.");
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (\S+)$/)?.[1];
  if (!token)
    throw new EnterpriseError(
      401,
      "Sign in with your Microsoft business account.",
    );
  try {
    // This unverified read only constrains the issuer; it grants no authority.
    const tenant = uuid.parse(decodeJwt(token).tid);
    if (tenant === consumer) throw new Error("Consumer identity");
    const { payload } = await jwtVerify(token, keys, {
      audience,
      issuer: `https://login.microsoftonline.com/${tenant}/v2.0`,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "nbf", "tid", "oid", "scp", "azp"],
      clockTolerance: 10,
    });
    return validateClaims(payload);
  } catch {
    throw new EnterpriseError(
      401,
      "Your sign-in has expired or is not valid for this application. Sign in again.",
    );
  }
}

export function requireTenantAdministrator(
  identity: Identity,
  tenantId: string,
) {
  const permitted = [
    "62e90394-69f5-4237-9190-012177145e10",
    "e8611ab8-c189-46e8-94e1-60213ab1f814",
  ];
  if (
    identity.tenantId !== tenantId ||
    !identity.directoryRoles?.some((role) => permitted.includes(role)) ||
    !identity.issuedAt ||
    Date.now() / 1000 - identity.issuedAt > 300
  )
    throw new EnterpriseError(
      403,
      "Sign in freshly to the customer tenant as an active Global Administrator or Privileged Role Administrator. The API registration must include DirectoryRole claims.",
    );
}
