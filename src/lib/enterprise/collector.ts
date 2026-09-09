import { importPKCS8, SignJWT } from "jose";
import { randomUUID } from "node:crypto";
import { DetailedIntuneService } from "~/lib/intune-detailed-client";
import { COLLECTION_STEPS } from "~/lib/collection-progress";
import { EnterpriseError, uuid, type Snapshot, type Section } from "./domain";
import {
  type ConfigurationSectionData,
  getStableItemId,
} from "~/lib/configuration-sections";
export const collectionSteps = COLLECTION_STEPS.slice(1);
export async function collectorToken(tenant: string) {
  uuid.parse(tenant);
  const client = process.env.ENTERPRISE_COLLECTOR_CLIENT_ID;
  if (!client)
    throw new EnterpriseError(503, "Unattended collection is not configured.");
  const endpoint = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: client,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  });
  if (
    process.env.ENTERPRISE_COLLECTOR_PRIVATE_KEY &&
    process.env.ENTERPRISE_COLLECTOR_THUMBPRINT
  ) {
    const key = await importPKCS8(
      process.env.ENTERPRISE_COLLECTOR_PRIVATE_KEY.replace(/\\n/g, "\n"),
      "RS256",
    );
    const assertion = await new SignJWT({})
      .setProtectedHeader({
        alg: "RS256",
        x5t: process.env.ENTERPRISE_COLLECTOR_THUMBPRINT,
      })
      .setIssuer(client)
      .setSubject(client)
      .setAudience(endpoint)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(key);
    body.set(
      "client_assertion_type",
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    );
    body.set("client_assertion", assertion);
  } else if (process.env.ENTERPRISE_COLLECTOR_CLIENT_SECRET)
    body.set("client_secret", process.env.ENTERPRISE_COLLECTOR_CLIENT_SECRET);
  else
    throw new EnterpriseError(503, "Collector credentials are not configured.");
  const response = await fetch(endpoint, {
    method: "POST",
    body,
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new EnterpriseError(
      502,
      "Microsoft application access failed. Check tenant consent and collector credentials.",
    );
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token)
    throw new EnterpriseError(
      502,
      "Microsoft did not return an application token.",
    );
  return data.access_token;
}
export async function probeTenant(tenant: string) {
  const token = await collectorToken(tenant);
  for (const path of [
    "deviceManagement/deviceConfigurations?$top=1",
    "deviceManagement/configurationPolicies?$top=1",
  ]) {
    const response = await fetch(`https://graph.microsoft.com/beta/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
    if (!response.ok)
      throw new EnterpriseError(
        422,
        "Microsoft consent is incomplete. Configuration read access could not be verified.",
      );
  }
}
export async function collectStep(
  tenant: string,
  index: number,
): Promise<Record<string, Section>> {
  const step = collectionSteps[index];
  if (!step) throw new Error("Invalid collection step");
  const token = await collectorToken(tenant);
  const service = new DetailedIntuneService(
    token,
    undefined,
    AbortSignal.timeout(105000),
    { log: () => undefined, warn: () => undefined, error: () => undefined },
  );
  const result = await service.getAllDetailedConfigurations(true, [step.name]);
  const sections: Record<string, Section> = {};
  for (const item of result.sections.filter((s) =>
    step.families.includes(s.familyKey),
  )) {
    const failed =
      item.error ||
      result.fetchErrors.some(
        (e) => e.familyKey === item.familyKey || e.policyType === step.name,
      ) ||
      result.permissionErrors.length > 0 ||
      item.items.some(
        (policy: { hasFetchError?: boolean }) => policy.hasFetchError,
      );
    sections[item.key] = {
      status: failed ? "failed" : "complete",
      data: item.items.map(
        (policy: Record<string, unknown>, index: number) => ({
          ...policy,
          id: getStableItemId(item, policy, index),
        }),
      ),
      error: failed
        ? "Some configuration data could not be read. Check permissions and retry."
        : undefined,
      familyKey: item.familyKey,
      label: item.label,
      selectionPrefix: item.selectionPrefix,
    };
  }
  if (!Object.keys(sections).length)
    for (const family of step.families)
      sections[family] = {
        status: "failed",
        data: [],
        error: "Collection returned no coverage manifest.",
      };
  return sections;
}
export function exportSections(snapshot: Snapshot): ConfigurationSectionData[] {
  return Object.entries(snapshot.sections).map(([key, value]) => ({
    key,
    familyKey: value.familyKey ?? key,
    label: value.label ?? key,
    selectionPrefix: value.selectionPrefix ?? key,
    items: value.data,
    error:
      value.status === "failed"
        ? { message: value.error ?? "Incomplete collection" }
        : undefined,
  }));
}

export type AuditCorrelation = {
  id: string;
  activityDateTime: string;
  activity: string;
  actor: unknown;
  resources: Array<{ resourceId?: string }>;
};
export async function collectAuditEvents(
  tenant: string,
  since: string,
): Promise<{ events: AuditCorrelation[]; complete: boolean }> {
  try {
    const deadline = Date.now() + 20000;
    const token = await collectorToken(tenant),
      events: AuditCorrelation[] = [];
    let next = `https://graph.microsoft.com/beta/deviceManagement/auditEvents?$filter=${encodeURIComponent(`activityDateTime ge ${since}`)}&$top=100`;
    for (let page = 0; next && page < 20; page++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return { events, complete: false };
      const url = new URL(next);
      if (
        url.origin !== "https://graph.microsoft.com" ||
        !url.pathname.startsWith("/beta/")
      )
        throw new Error("Unexpected Graph pagination URL");
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(Math.min(15000, remaining)),
        cache: "no-store",
      });
      if (!response.ok) return { events, complete: false };
      const result = (await response.json()) as {
        value: AuditCorrelation[];
        "@odata.nextLink"?: string;
      };
      events.push(...result.value);
      next = result["@odata.nextLink"] ?? "";
    }
    return { events, complete: !next };
  } catch {
    return { events: [], complete: false };
  }
}
