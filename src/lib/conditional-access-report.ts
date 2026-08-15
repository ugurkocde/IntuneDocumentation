export interface ConditionalAccessReportRow {
  name: string;
  value: string;
}

const APPLICATION_NAMES: Record<string, string> = {
  All: "All resources",
  Office365: "Office 365",
  MicrosoftAdminPortals: "Microsoft Admin Portals",
  "00000003-0000-0ff1-ce00-000000000000": "Office 365",
};

const USER_TARGET_NAMES: Record<string, string> = {
  All: "All users",
  GuestsOrExternalUsers: "Guests or external users",
};

const LOCATION_NAMES: Record<string, string> = {
  All: "All locations",
  AllTrusted: "All trusted locations",
};

const LABELS: Record<string, string> = {
  "conditions.userRiskLevels": "User Risk Levels",
  "conditions.signInRiskLevels": "Sign-in Risk Levels",
  "conditions.servicePrincipalRiskLevels": "Service Principal Risk Levels",
  "conditions.agentIdRiskLevels": "Agent ID Risk Levels",
  "conditions.insiderRiskLevels": "Insider Risk Levels",
  "conditions.clientAppTypes": "Client Apps",
  "conditions.users.includeUsers": "Include Users",
  "conditions.users.excludeUsers": "Exclude Users",
  "conditions.users.includeGroups": "Include Groups",
  "conditions.users.excludeGroups": "Exclude Groups",
  "conditions.users.includeRoles": "Include Roles",
  "conditions.users.excludeRoles": "Exclude Roles",
  "conditions.users.includeGuestsOrExternalUsers.guestOrExternalUserTypes":
    "Include Guest or External User Types",
  "conditions.users.includeGuestsOrExternalUsers.externalTenants.members":
    "Include External Tenants",
  "conditions.users.includeGuestsOrExternalUsers.externalTenants.membershipKind":
    "Included External Tenant Scope",
  "conditions.users.excludeGuestsOrExternalUsers.guestOrExternalUserTypes":
    "Exclude Guest or External User Types",
  "conditions.users.excludeGuestsOrExternalUsers.externalTenants.members":
    "Exclude External Tenants",
  "conditions.users.excludeGuestsOrExternalUsers.externalTenants.membershipKind":
    "Excluded External Tenant Scope",
  "conditions.applications.includeApplications": "Include Applications",
  "conditions.applications.excludeApplications": "Exclude Applications",
  "conditions.applications.includeUserActions": "Include User Actions",
  "conditions.applications.includeAuthenticationContextClassReferences":
    "Include Authentication Contexts",
  "conditions.applications.applicationFilter.mode": "Application Filter Mode",
  "conditions.applications.applicationFilter.rule": "Application Filter Rule",
  "conditions.platforms.includePlatforms": "Include Platforms",
  "conditions.platforms.excludePlatforms": "Exclude Platforms",
  "conditions.locations.includeLocations": "Include Locations",
  "conditions.locations.excludeLocations": "Exclude Locations",
  "conditions.deviceStates.includeStates": "Include Device States",
  "conditions.deviceStates.excludeStates": "Exclude Device States",
  "conditions.devices.includeDevices": "Include Devices",
  "conditions.devices.excludeDevices": "Exclude Devices",
  "conditions.devices.includeDeviceStates": "Include Device States (Legacy)",
  "conditions.devices.excludeDeviceStates": "Exclude Device States (Legacy)",
  "conditions.devices.deviceFilter.mode": "Device Filter Mode",
  "conditions.devices.deviceFilter.rule": "Device Filter Rule",
  "conditions.clientApplications.includeServicePrincipals":
    "Include Service Principals",
  "conditions.clientApplications.excludeServicePrincipals":
    "Exclude Service Principals",
  "conditions.clientApplications.servicePrincipalFilter.mode":
    "Service Principal Filter Mode",
  "conditions.clientApplications.servicePrincipalFilter.rule":
    "Service Principal Filter Rule",
  "conditions.clientApplications.includeAgentIdServicePrincipals":
    "Include Agent ID Service Principals",
  "conditions.clientApplications.excludeAgentIdServicePrincipals":
    "Exclude Agent ID Service Principals",
  "conditions.clientApplications.agentIdServicePrincipalFilter.mode":
    "Agent ID Service Principal Filter Mode",
  "conditions.clientApplications.agentIdServicePrincipalFilter.rule":
    "Agent ID Service Principal Filter Rule",
  "grantControls.operator": "Grant Operator",
  "grantControls.builtInControls": "Grant Controls",
  "grantControls.customAuthenticationFactors": "Custom Auth Factors",
  "grantControls.termsOfUse": "Terms of Use",
  "grantControls.authenticationStrength.id": "Authentication Strength ID",
  "grantControls.authenticationStrength.displayName": "Authentication Strength",
  "grantControls.authenticationStrength.description":
    "Authentication Strength Description",
  "grantControls.authenticationStrength.policyType":
    "Authentication Strength Policy Type",
  "grantControls.authenticationStrength.requirementsSatisfied":
    "Authentication Strength Requirements",
  "grantControls.authenticationStrength.allowedCombinations":
    "Authentication Strength Combinations",
  "sessionControls.applicationEnforcedRestrictions.isEnabled":
    "App Enforced Restrictions",
  "sessionControls.cloudAppSecurity.isEnabled": "Cloud App Security",
  "sessionControls.cloudAppSecurity.cloudAppSecurityType":
    "Cloud App Security Type",
  "sessionControls.continuousAccessEvaluation.mode":
    "Continuous Access Evaluation",
  "sessionControls.disableResilienceDefaults": "Disable Resilience Defaults",
  "sessionControls.persistentBrowser.isEnabled": "Persistent Browser",
  "sessionControls.persistentBrowser.mode": "Persistent Browser Mode",
  "sessionControls.secureSignInSession.isEnabled": "Secure Sign-in Session",
  "sessionControls.signInFrequency.isEnabled": "Sign-in Frequency",
  "sessionControls.signInFrequency.value": "Sign-in Frequency Value",
  "sessionControls.signInFrequency.type": "Sign-in Frequency Type",
  "sessionControls.signInFrequency.authenticationType":
    "Sign-in Frequency Authentication Type",
  "sessionControls.signInFrequency.frequencyInterval":
    "Sign-in Frequency Interval",
  "sessionControls.globalSecureAccessFilteringProfile.isEnabled":
    "Global Secure Access Filtering Profile",
  "sessionControls.globalSecureAccessFilteringProfile.profileId":
    "Global Secure Access Filtering Profile ID",
};

function humanize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .replace(/Id\b/g, "ID")
    .replace(/^./, (character) => character.toUpperCase());
}

function labelFor(path: string[]): string {
  const key = path.join(".");
  if (LABELS[key]) return LABELS[key];

  return path
    .filter((segment) => segment !== "conditions")
    .map(humanize)
    .join(" ");
}

function mapListValue(path: string, value: unknown): string {
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  if (typeof value !== "string") return String(value);

  if (
    path === "conditions.users.includeGroups" ||
    path === "conditions.users.excludeGroups"
  ) {
    return value;
  }
  if (
    path === "conditions.applications.includeApplications" ||
    path === "conditions.applications.excludeApplications"
  ) {
    return APPLICATION_NAMES[value] || value;
  }
  if (
    path === "conditions.users.includeUsers" ||
    path === "conditions.users.excludeUsers"
  ) {
    return USER_TARGET_NAMES[value] || value;
  }
  if (
    path === "conditions.locations.includeLocations" ||
    path === "conditions.locations.excludeLocations"
  ) {
    return LOCATION_NAMES[value] || value;
  }

  return value;
}

function isOdataAnnotation(key: string): boolean {
  return key.startsWith("@odata.") || key.includes("@odata.");
}

/**
 * Flatten every configured Conditional Access condition and control into
 * report-ready rows. Known Graph fields receive concise labels, while unknown
 * beta fields are still emitted with a generated path label so new settings do
 * not silently disappear from exports.
 */
export function buildConditionalAccessReportRows(
  policy: any,
  groupNames?: Map<string, string>,
): ConditionalAccessReportRow[] {
  const rows: ConditionalAccessReportRow[] = [];

  const visit = (value: unknown, path: string[]) => {
    if (value == null) return;

    const pathKey = path.join(".");
    if (Array.isArray(value)) {
      if (value.length === 0) return;

      const rendered = value.map((item) => {
        if (
          typeof item === "string" &&
          (pathKey === "conditions.users.includeGroups" ||
            pathKey === "conditions.users.excludeGroups")
        ) {
          return groupNames?.get(item) || item;
        }
        if (item !== null && typeof item === "object") {
          return JSON.stringify(item);
        }
        return mapListValue(pathKey, item);
      });

      rows.push({ name: labelFor(path), value: rendered.join(", ") });
      return;
    }

    if (typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (!isOdataAnnotation(key)) visit(child, [...path, key]);
      }
      return;
    }

    if (typeof value === "string" && value.length === 0) return;
    rows.push({
      name: labelFor(path),
      value: mapListValue(pathKey, value),
    });
  };

  visit(policy?.conditions, ["conditions"]);
  visit(policy?.grantControls, ["grantControls"]);
  visit(policy?.sessionControls, ["sessionControls"]);

  return rows;
}

export function conditionalAccessStateLabel(state: unknown): string {
  switch (state) {
    case "enabled":
      return "Enabled";
    case "disabled":
      return "Disabled";
    case "enabledForReportingButNotEnforced":
      return "Report-only";
    default:
      return typeof state === "string" && state ? state : "Unknown";
  }
}
