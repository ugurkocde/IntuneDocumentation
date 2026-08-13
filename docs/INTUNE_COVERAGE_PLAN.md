# Intune documentation coverage plan

## Goal

Expand the documentation export from its original policy subset into a broad,
read-only inventory of Intune policy, enrollment, application, tenant, RBAC,
connector, and specialist settings. Every Microsoft Graph request uses the beta
endpoint, follows paging links, and exposes partial failures instead of silently
presenting them as empty tenant data.

## Delivery architecture

1. Keep the existing first-class policy sections for Settings Catalog, device
   configuration templates, Administrative Templates, compliance, app
   protection, security baselines, scripts, app configuration, update rings,
   enrollment configuration, and Conditional Access.
2. Add a registry-driven `additionalConfigurations` model. Each registry entry
   defines its Graph beta path, dashboard family, label, required permission,
   collection or singleton shape, stable identity/label fallbacks, optional
   assignment support, and sensitive fields.
3. Build one normalized `sections` array at the service/dashboard boundary for
   both existing and registry-backed resources. Render, select, count, search,
   analyze, and export from that shared shape. The existing named arrays remain
   a temporary compatibility layer for their specialist document layouts, not a
   second source of selection or summary truth.
4. Preserve raw derived-type properties in a sanitized, recursive settings
   representation. Identity, timestamps, scripts, binary data, relationships,
   and internal OData metadata are handled deliberately rather than dumped into
   the document.
5. Record collection-level failures with endpoint, permission, status, and
   message. A failed endpoint must never be indistinguishable from a tenant that
   has zero objects.
6. Stream each completed section to the browser and merge it incrementally.
   Registry requests use bounded concurrency, while expensive per-item detail
   calls are made only for relationships explicitly declared by an entry.
7. Paging returns items plus an explicit complete/partial state. Exhausted
   retries create a partial-data warning and never masquerade as a complete
   collection.
8. Sanitize data before it leaves the server. Enrollment tokens, QR content,
   provisioning payloads, icons, configuration-file content, secrets, script
   bodies, and registry-declared sensitive fields are replaced with a visible
   `[Redacted]` marker.

## Coverage matrix

All paths below are relative to `https://graph.microsoft.com/beta`.

| Dashboard family          | Resource                              | Graph path                                                     | Permission                                |
| ------------------------- | ------------------------------------- | -------------------------------------------------------------- | ----------------------------------------- |
| Windows updates           | Feature update profiles               | `/deviceManagement/windowsFeatureUpdateProfiles`               | `DeviceManagementConfiguration.Read.All`  |
| Windows updates           | Quality update profiles               | `/deviceManagement/windowsQualityUpdateProfiles`               | `DeviceManagementConfiguration.Read.All`  |
| Windows updates           | Expedite quality update policies      | `/deviceManagement/windowsQualityUpdatePolicies`               | `DeviceManagementConfiguration.Read.All`  |
| Windows updates           | Driver update profiles                | `/deviceManagement/windowsDriverUpdateProfiles`                | `DeviceManagementConfiguration.Read.All`  |
| Scripts & remediation     | Remediations                          | `/deviceManagement/deviceHealthScripts`                        | `DeviceManagementScripts.Read.All`        |
| Scripts & remediation     | Compliance scripts                    | `/deviceManagement/deviceComplianceScripts`                    | `DeviceManagementScripts.Read.All`        |
| Scripts & remediation     | macOS custom attributes               | `/deviceManagement/deviceCustomAttributeShellScripts`          | `DeviceManagementScripts.Read.All`        |
| Enrollment & provisioning | Windows Autopilot deployment profiles | `/deviceManagement/windowsAutopilotDeploymentProfiles`         | `DeviceManagementServiceConfig.Read.All`  |
| Enrollment & provisioning | Android device-owner profiles         | `/deviceManagement/androidDeviceOwnerEnrollmentProfiles`       | `DeviceManagementServiceConfig.Read.All`  |
| Enrollment & provisioning | Apple user-initiated profiles         | `/deviceManagement/appleUserInitiatedEnrollmentProfiles`       | `DeviceManagementServiceConfig.Read.All`  |
| Enrollment & provisioning | Apple ADE tokens                      | `/deviceManagement/depOnboardingSettings`                      | `DeviceManagementServiceConfig.Read.All`  |
| Applications              | Mobile apps                           | `/deviceAppManagement/mobileApps`                              | `DeviceManagementApps.Read.All`           |
| Applications              | Targeted managed-app configurations   | `/deviceAppManagement/targetedManagedAppConfigurations`        | `DeviceManagementApps.Read.All`           |
| Applications              | Default managed-app protections       | `/deviceAppManagement/defaultManagedAppProtections`            | `DeviceManagementApps.Read.All`           |
| Applications              | MDM Windows Information Protection    | `/deviceAppManagement/mdmWindowsInformationProtectionPolicies` | `DeviceManagementApps.Read.All`           |
| Applications              | Windows Information Protection        | `/deviceAppManagement/windowsInformationProtectionPolicies`    | `DeviceManagementApps.Read.All`           |
| Applications              | iOS LOB provisioning profiles         | `/deviceAppManagement/iosLobAppProvisioningConfigurations`     | `DeviceManagementApps.Read.All`           |
| Assignment & RBAC         | Assignment filters                    | `/deviceManagement/assignmentFilters`                          | `DeviceManagementConfiguration.Read.All`  |
| Assignment & RBAC         | Reusable policy settings              | `/deviceManagement/reusablePolicySettings`                     | `DeviceManagementConfiguration.Read.All`  |
| Assignment & RBAC         | Scope tags                            | `/deviceManagement/roleScopeTags`                              | `DeviceManagementRBAC.Read.All`           |
| Assignment & RBAC         | Role definitions                      | `/deviceManagement/roleDefinitions`                            | `DeviceManagementRBAC.Read.All`           |
| Assignment & RBAC         | Role assignments                      | `/deviceManagement/roleAssignments`                            | `DeviceManagementRBAC.Read.All`           |
| Tenant & service          | Intune tenant settings                | `/deviceManagement/settings`                                   | `DeviceManagementServiceConfig.Read.All`  |
| Tenant & service          | Android Enterprise settings           | `/deviceManagement/androidForWorkSettings`                     | `DeviceManagementServiceConfig.Read.All`  |
| Tenant & service          | Managed-device cleanup rules          | `/deviceManagement/managedDeviceCleanupRules`                  | `DeviceManagementManagedDevices.Read.All` |
| Connectors                | Mobile threat-defense connectors      | `/deviceManagement/mobileThreatDefenseConnectors`              | `DeviceManagementServiceConfig.Read.All`  |
| Connectors                | Device-management partners            | `/deviceManagement/deviceManagementPartners`                   | `DeviceManagementServiceConfig.Read.All`  |
| Connectors                | Remote-assistance partners            | `/deviceManagement/remoteAssistancePartners`                   | `DeviceManagementServiceConfig.Read.All`  |
| Connectors                | VPP tokens                            | `/deviceAppManagement/vppTokens`                               | `DeviceManagementApps.Read.All`           |
| Specialist policies       | Policy sets                           | `/deviceAppManagement/policySets`                              | `DeviceManagementApps.Read.All`           |
| Specialist policies       | Notification templates                | `/deviceManagement/notificationMessageTemplates`               | `DeviceManagementConfiguration.Read.All`  |
| Specialist policies       | Terms and conditions                  | `/deviceManagement/termsAndConditions`                         | `DeviceManagementConfiguration.Read.All`  |
| Specialist policies       | Microsoft Tunnel configurations       | `/deviceManagement/microsoftTunnelConfigurations`              | `DeviceManagementConfiguration.Read.All`  |
| Specialist policies       | Microsoft Tunnel sites                | `/deviceManagement/microsoftTunnelSites`                       | `DeviceManagementConfiguration.Read.All`  |
| Specialist policies       | Hardware configurations               | `/deviceManagement/hardwareConfigurations`                     | `DeviceManagementConfiguration.Read.All`  |
| Specialist policies       | Remote Assistance settings            | `/deviceManagement/remoteAssistanceSettings`                   | `DeviceManagementServiceConfig.Read.All`  |

The permission column is a consent hint, not a diagnosis. The UI prioritizes the
actual Graph status, error code, and message. For example, the last endpoint is
deliberately fail-soft because live beta verification returned a 403 despite the
review tenant already having `DeviceManagementServiceConfig.Read.All`; the UI
must not incorrectly tell the user that granting that same permission is the
fix. A singleton 404 can be declared `notConfiguredOn404` where the service uses
that response to mean the tenant has not enabled the feature.

## Existing coverage corrections

- App configuration settings use `appConfigKey`, `appConfigKeyType`, and
  `appConfigKeyValue`; both PDF and DOCX exports must preserve those fields.
- Enrollment configurations are fetched as complete derived objects so ESP,
  Windows Hello for Business, restriction, timeout, reset, log collection, and
  selected-app settings are not lost to a narrow `$select`.
- Administrative Template presentation values are fetched from their dedicated
  relationship when supported. Unsupported expansion/detail routes are recorded
  without discarding the parent policy.
- Settings Catalog choice labels match both Graph `itemId` and legacy `name`
  option identifiers.
- App-protection exports use schema-aware property traversal and include their
  targeted apps instead of a fixed, aging field allow-list.
- Windows Update for Business configurations are excluded from the general
  device-configuration list and retained in the update-ring section only.
  Assignment data is merged into full detail responses.
- Conditional Access, group lookup, device inventory, and every other Graph
  call touched by this work explicitly use Microsoft Graph beta.
- Existing policy getters adopt the same explicit success, partial, and failure
  result contract as new collections; current `.catch(() => [])` paths no longer
  hide permissions and endpoint failures.
- Base64 scripts are decoded as UTF-8. Script contents remain redacted in the
  browser payload and document unless a future explicitly authorized secure
  export mode is introduced.

## Product behavior

- The sidebar adds eight concise families: Windows updates, Scripts & remediation,
  Enrollment & provisioning, Applications, Assignment & RBAC, Tenant & service,
  Connectors, and Specialist policies. Empty families remain navigable only when
  they contain a fetch warning that the user should see.
- Overview, search, select all, select filtered, selected counts, and export-modal
  counts include the new resources.
- PDF and DOCX use the same shared normalized settings representation and include
  collection label, source endpoint, type, dates, assignments, and settings.
- Analytics totals and by-type counts include all selected resources.
- Collection errors are visible on the dashboard and remain available to the
  document/export pipeline for honest reporting.
- The landing page, FAQ structured data, permission dialog, security flow, and
  privacy policy describe the expanded coverage, beta endpoints, partial-result
  warnings, transient server processing, and sensitive-value redaction.
- Singleton resources use stable registry-derived IDs and labels, so tenant
  settings can be searched, selected, and exported without `undefined` keys.
- Mobile apps are fetched with a documented `$select` that excludes large icons
  and binary content. Role definitions retain Graph's `isBuiltIn` property so
  built-in and custom roles remain distinguishable in the shared RBAC section.
- Resource-specific enrichments cover policy-set items, notification-template
  localizations, targeted managed-app apps/settings, RBAC assignment members,
  and profile assignments where the live beta relationship supports reads.
  Enriched object arrays are rendered as readable hierarchical settings rather
  than opaque JSON blobs.

## Acceptance criteria

1. No Graph request made by the implemented workflow targets `v1.0`.
2. All list endpoints follow every `@odata.nextLink`.
3. Each resource in the coverage matrix is represented in the returned data,
   dashboard counts, search/selection, PDF, and DOCX, including empty collections.
4. A 403, 404, unsupported relationship, or transient endpoint failure is
   visible as a scoped warning and does not erase successful sibling resources.
5. Existing policy output retains assignments when detail enrichment succeeds
   or fails.
6. App configuration key/value settings, enrollment-specific fields,
   Administrative Template presentations, and Settings Catalog choice labels
   have regression coverage.
7. Vitest is added with captured, sanitized Graph fixtures. Type checking,
   linting, formatting, production build, and targeted tests pass.
8. The dashboard is keyboard usable, responsive, and checked in a real browser.
9. An independent review covers this plan and the final diff before the pull
   request is opened; actionable findings are resolved or documented with
   evidence.

## Deliberate exclusions

Managed devices, discovered apps, Autopilot device identities, audit logs,
reports, status summaries, and per-device state are operational inventory or
telemetry rather than tenant policy/settings documentation. This project may use
managed devices to calculate existing platform counts, but it does not export
device identities or transient deployment status as policy documentation.
