import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import {
  extractSettingValue,
  parseAdministrativeTemplate,
  parseAssignments,
  parseComplianceRules,
  parseDeviceConfiguration,
  parseSecurityBaseline,
} from "./configuration-parser";
import type { BrandingOptions } from "~/types/branding";

interface DetailedDocxData {
  settingsCatalog: any[];
  deviceConfigurations: any[];
  administrativeTemplates: any[];
  compliancePolicies: any[];
  appProtectionPolicies?: any[];
  securityBaselines: any[];
  scripts: {
    windows: any[];
    macOS: any[];
  };
  appConfigurations?: any[];
  windowsUpdatePolicies?: any[];
  enrollmentConfigurations?: any[];
  conditionalAccessPolicies?: any[];
  groupNames?: Map<string, string>;
  deviceCounts?: Record<string, number>;
  branding?: BrandingOptions;
}

function enhanceAssignmentText(text: string, groupNames?: Map<string, string>): string {
  if (!text) return text;
  if (groupNames && groupNames.size > 0) {
    groupNames.forEach((name, id) => {
      const reGroup = new RegExp(`(Group: )${id}`, "g");
      const reExcl = new RegExp(`(Excluded: )${id}`, "g");
      text = text.replace(reGroup, `$1${name}`).replace(reExcl, `$1${name}`);
    });
  }
  return text;
}

export async function generateDetailedDOCX(data: DetailedDocxData): Promise<Uint8Array> {
  const sections: Array<{ properties: any; children: Array<Paragraph | Table> }> = [];

  const company = data.branding?.companyName || "";
  const titleText = company
    ? `${company} - Intune Configuration Report`
    : "Intune Configuration Report";

  // Cover / Title section
  sections.push({
    properties: {},
    children: [
      new Paragraph({
        children: [new TextRun({ text: titleText, bold: true })],
        heading: HeadingLevel.TITLE,
      }),
      new Paragraph({ text: new Date().toLocaleString(), alignment: AlignmentType.LEFT }),
    ],
  });

  // Helper to push a section with a heading
  const addSection = (title: string, children: Paragraph[] | (Paragraph | Table)[]) => {
    sections.push({
      properties: {},
      children: [
        new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
        ...children,
      ],
    });
  };

  // Settings Catalog
  if (data.settingsCatalog?.length) {
    const children: (Paragraph | Table)[] = [];
    data.settingsCatalog.forEach((policy) => {
      children.push(
        new Paragraph({
          text: policy.displayName || policy.name || "Settings Catalog Policy",
          heading: HeadingLevel.HEADING_2,
        })
      );
      const assn = enhanceAssignmentText(
        parseAssignments(policy.assignments),
        data.groupNames
      );
      children.push(new Paragraph({ text: `Assignments: ${assn}` }));
      if (policy.description) {
        children.push(new Paragraph({ text: policy.description }));
      }

      // Settings table
      if (policy.settings?.length) {
        const rows: TableRow[] = [];
        // Header row
        rows.push(
          new TableRow({
            children: ["Setting", "Value", "Description"].map(
              (h) =>
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: h, bold: true })],
                    }),
                  ],
                })
            ),
          })
        );

        // Process each setting and flatten nested settings
        const formatted: Array<{name: string, value: string, description?: string}> = [];
        for (const setting of policy.settings) {
          const extracted = extractSettingValue(setting);

          // Add the main setting
          formatted.push({
            name: extracted.name,
            value: extracted.value,
            description: extracted.description
          });

          // Add nested settings if they exist
          if (extracted.nestedSettings && extracted.nestedSettings.length > 0) {
            formatted.push(...extracted.nestedSettings);
          }
        }

        formatted.forEach((s: any) => {
          rows.push(
            new TableRow({
              children: [s.name, s.value, s.description || ""].map(
                (t) => new TableCell({ children: [new Paragraph(String(t))] })
              ),
            })
          );
        });
        children.push(
          new Table({
            columnWidths: [5000, 3000, 5000],
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows,
          })
        );
      } else {
        children.push(new Paragraph({ text: "No settings configured" }));
      }
    });
    addSection("Settings Catalog Policies", children);
  }

  // Device Configurations
  if (data.deviceConfigurations?.length) {
    const children: (Paragraph | Table)[] = [];
    data.deviceConfigurations.forEach((config) => {
      children.push(
        new Paragraph({ text: config.displayName || "Device Configuration", heading: HeadingLevel.HEADING_2 })
      );
      const assn = enhanceAssignmentText(
        parseAssignments(config.assignments),
        data.groupNames
      );
      children.push(new Paragraph({ text: `Assignments: ${assn}` }));
      if (config.description) children.push(new Paragraph({ text: config.description }));

      const categories = parseDeviceConfiguration(config);
      categories.forEach((cat) => {
        children.push(
          new Paragraph({ text: cat.category, heading: HeadingLevel.HEADING_3 })
        );
        const rows: TableRow[] = [
          new TableRow({
            children: ["Setting", "Value", "Description"].map((h) =>
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
              })
            ),
          }),
        ];
        cat.settings.forEach((s) => {
          rows.push(
            new TableRow({
              children: [s.name, s.value, s.description || ""].map((t) =>
                new TableCell({ children: [new Paragraph(String(t))] })
              ),
            })
          );
        });
        children.push(
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })
        );
      });
    });
    addSection("Device Configurations", children);
  }

  // Administrative Templates
  if (data.administrativeTemplates?.length) {
    const children: (Paragraph | Table)[] = [];
    data.administrativeTemplates.forEach((template) => {
      children.push(
        new Paragraph({ text: template.displayName || "Administrative Template", heading: HeadingLevel.HEADING_2 })
      );
      const assn = enhanceAssignmentText(
        parseAssignments(template.assignments),
        data.groupNames
      );
      children.push(new Paragraph({ text: `Assignments: ${assn}` }));

      const defs = parseAdministrativeTemplate(template.definitionValues || []);
      const rows: TableRow[] = [
        new TableRow({
          children: ["Setting", "State", "Value", "Category"].map((h) =>
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })
          ),
        }),
      ];
      defs.forEach((d) => {
        rows.push(
          new TableRow({
            children: [d.name, d.state, d.value, d.category].map((t) =>
              new TableCell({ children: [new Paragraph(String(t))] })
            ),
          })
        );
      });
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
    });
    addSection("Administrative Templates", children);
  }

  // Compliance Policies
  if (data.compliancePolicies?.length) {
    const children: (Paragraph | Table)[] = [];
    data.compliancePolicies.forEach((policy) => {
      children.push(
        new Paragraph({ text: policy.displayName || "Compliance Policy", heading: HeadingLevel.HEADING_2 })
      );
      const assn = enhanceAssignmentText(
        parseAssignments(policy.assignments),
        data.groupNames
      );
      children.push(new Paragraph({ text: `Assignments: ${assn}` }));

      const rules = parseComplianceRules(policy);
      const rows: TableRow[] = [
        new TableRow({
          children: ["Category", "Rule", "Value", "Action"].map((h) =>
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })
          ),
        }),
      ];
      rules.forEach((r) => {
        rows.push(
          new TableRow({
            children: [r.category, r.rule, r.value, r.action].map((t) =>
              new TableCell({ children: [new Paragraph(String(t))] })
            ),
          })
        );
      });
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
    });
    addSection("Compliance Policies", children);
  }

  // App Protection Policies
  if (data.appProtectionPolicies?.length) {
    const children: (Paragraph | Table)[] = [];
    data.appProtectionPolicies.forEach((policy) => {
      children.push(
        new Paragraph({ text: policy.displayName || "App Protection Policy", heading: HeadingLevel.HEADING_2 })
      );
      const assn = enhanceAssignmentText(
        parseAssignments(policy.assignments),
        data.groupNames
      );
      children.push(new Paragraph({ text: `Assignments: ${assn}` }));

      if (policy.description) {
        children.push(new Paragraph({ text: `Description: ${policy.description}` }));
      }

      if (policy.platformType) {
        children.push(new Paragraph({ text: `Platform: ${policy.platformType}` }));
      }

      // Build MAM settings table
      const rows: TableRow[] = [
        new TableRow({
          children: ["Setting", "Value"].map((h) =>
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })
          ),
        }),
      ];

      // Add MAM settings comprehensively
      const settings: Array<{name: string; value: string}> = [];

      // Data Transfer Settings
      if (policy.allowedInboundDataTransferSources !== undefined) {
        settings.push({ name: "Allowed Inbound Data Transfer Sources", value: String(policy.allowedInboundDataTransferSources) });
      }
      if (policy.allowedOutboundDataTransferDestinations !== undefined) {
        settings.push({ name: "Allowed Outbound Data Transfer Destinations", value: String(policy.allowedOutboundDataTransferDestinations) });
      }
      if (policy.allowedOutboundClipboardSharingLevel !== undefined) {
        settings.push({ name: "Allowed Outbound Clipboard Sharing Level", value: String(policy.allowedOutboundClipboardSharingLevel) });
      }

      // Data Protection Settings
      if (policy.dataBackupBlocked !== undefined) {
        settings.push({ name: "Block Data Backup", value: String(policy.dataBackupBlocked) });
      }
      if (policy.saveAsBlocked !== undefined) {
        settings.push({ name: "Block Save As", value: String(policy.saveAsBlocked) });
      }
      if (policy.printBlocked !== undefined) {
        settings.push({ name: "Block Printing", value: String(policy.printBlocked) });
      }
      if (policy.organizationalCredentialsRequired !== undefined) {
        settings.push({ name: "Organizational Credentials Required", value: String(policy.organizationalCredentialsRequired) });
      }

      // Compliance & Security
      if (policy.deviceComplianceRequired !== undefined) {
        settings.push({ name: "Device Compliance Required", value: String(policy.deviceComplianceRequired) });
      }
      if (policy.managedBrowserToOpenLinksRequired !== undefined) {
        settings.push({ name: "Managed Browser Required", value: String(policy.managedBrowserToOpenLinksRequired) });
      }
      if (policy.maximumAllowedDeviceThreatLevel !== undefined) {
        settings.push({ name: "Maximum Allowed Device Threat Level", value: String(policy.maximumAllowedDeviceThreatLevel) });
      }
      if (policy.mobileThreatDefenseRemediationAction !== undefined) {
        settings.push({ name: "Mobile Threat Defense Remediation Action", value: String(policy.mobileThreatDefenseRemediationAction) });
      }
      if (policy.appActionIfUnableToAuthenticateUser !== undefined && policy.appActionIfUnableToAuthenticateUser !== null) {
        settings.push({ name: "Action If Unable to Authenticate User", value: String(policy.appActionIfUnableToAuthenticateUser) });
      }

      // Access Requirements
      if (policy.pinRequired !== undefined) {
        settings.push({ name: "PIN Required", value: String(policy.pinRequired) });
      }
      if (policy.fingerprintBlocked !== undefined) {
        settings.push({ name: "Block Fingerprint", value: String(policy.fingerprintBlocked) });
      }
      if (policy.faceIdBlocked !== undefined) {
        settings.push({ name: "Block Face ID", value: String(policy.faceIdBlocked) });
      }

      // Version Requirements - Minimum Required
      if (policy.minimumRequiredSdkVersion) {
        settings.push({ name: "Minimum Required SDK Version", value: policy.minimumRequiredSdkVersion });
      }
      if (policy.minimumRequiredOsVersion) {
        settings.push({ name: "Minimum Required OS Version", value: policy.minimumRequiredOsVersion });
      }
      if (policy.minimumRequiredAppVersion) {
        settings.push({ name: "Minimum Required App Version", value: policy.minimumRequiredAppVersion });
      }

      // Version Requirements - Warning
      if (policy.minimumWarningOsVersion) {
        settings.push({ name: "Minimum Warning OS Version", value: policy.minimumWarningOsVersion });
      }
      if (policy.minimumWarningAppVersion) {
        settings.push({ name: "Minimum Warning App Version", value: policy.minimumWarningAppVersion });
      }

      // Version Requirements - Wipe
      if (policy.minimumWipeSdkVersion) {
        settings.push({ name: "Minimum Wipe SDK Version", value: policy.minimumWipeSdkVersion });
      }
      if (policy.minimumWipeOsVersion) {
        settings.push({ name: "Minimum Wipe OS Version", value: policy.minimumWipeOsVersion });
      }
      if (policy.minimumWipeAppVersion) {
        settings.push({ name: "Minimum Wipe App Version", value: policy.minimumWipeAppVersion });
      }

      // Version Requirements - Maximum
      if (policy.maximumRequiredOsVersion) {
        settings.push({ name: "Maximum Required OS Version", value: policy.maximumRequiredOsVersion });
      }
      if (policy.maximumWarningOsVersion) {
        settings.push({ name: "Maximum Warning OS Version", value: policy.maximumWarningOsVersion });
      }
      if (policy.maximumWipeOsVersion) {
        settings.push({ name: "Maximum Wipe OS Version", value: policy.maximumWipeOsVersion });
      }

      // Offline/Grace Periods
      if (policy.periodOfflineBeforeWipeIsEnforced) {
        settings.push({ name: "Period Offline Before Wipe Is Enforced", value: policy.periodOfflineBeforeWipeIsEnforced });
      }
      if (policy.periodOfflineBeforeAccessCheck) {
        settings.push({ name: "Period Offline Before Access Check", value: policy.periodOfflineBeforeAccessCheck });
      }
      if (policy.periodOnlineBeforeAccessCheck) {
        settings.push({ name: "Period Online Before Access Check", value: policy.periodOnlineBeforeAccessCheck });
      }

      // Additional Settings
      if (policy.isAssigned !== undefined) {
        settings.push({ name: "Is Assigned", value: String(policy.isAssigned) });
      }
      if (policy.deployedAppCount !== undefined) {
        settings.push({ name: "Deployed App Count", value: String(policy.deployedAppCount) });
      }

      settings.forEach((s) => {
        rows.push(
          new TableRow({
            children: [s.name, s.value].map((t) =>
              new TableCell({ children: [new Paragraph(String(t))] })
            ),
          })
        );
      });

      if (settings.length > 0) {
        children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
      } else {
        children.push(new Paragraph({ text: "No protection settings configured" }));
      }
    });
    addSection("App Protection Policies", children);
  }

  // Security Baselines
  if (data.securityBaselines?.length) {
    const children: (Paragraph | Table)[] = [];
    data.securityBaselines.forEach((baseline) => {
      children.push(
        new Paragraph({ text: baseline.displayName || "Security Baseline", heading: HeadingLevel.HEADING_2 })
      );
      const assn = enhanceAssignmentText(
        parseAssignments(baseline.assignments),
        data.groupNames
      );
      children.push(new Paragraph({ text: `Assignments: ${assn}` }));

      const cats = parseSecurityBaseline(baseline.categories || []);
      cats.forEach((cat) => {
        children.push(new Paragraph({ text: cat.category, heading: HeadingLevel.HEADING_3 }));
        const rows: TableRow[] = [
          new TableRow({
            children: ["Setting", "Value", "Description"].map((h) =>
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })
            ),
          }),
        ];
        cat.settings.forEach((s) => {
          rows.push(
            new TableRow({
              children: [s.name, s.value, s.description || ""].map((t) =>
                new TableCell({ children: [new Paragraph(String(t))] })
              ),
            })
          );
        });
        children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
      });
    });
    addSection("Security Baselines", children);
  }

  // Scripts
  const scriptsCount = (data.scripts?.windows?.length || 0) + (data.scripts?.macOS?.length || 0);
  if (scriptsCount > 0) {
    const children: Paragraph[] = [];
    if (data.scripts?.windows?.length) {
      children.push(new Paragraph({ text: "Windows Scripts", heading: HeadingLevel.HEADING_2 }));
      data.scripts.windows.forEach((s: any) => {
        children.push(new Paragraph({ text: s.displayName || "Windows Script", heading: HeadingLevel.HEADING_3 }));
        if (s.description) children.push(new Paragraph({ text: s.description }));
      });
    }
    if (data.scripts?.macOS?.length) {
      children.push(new Paragraph({ text: "macOS Scripts", heading: HeadingLevel.HEADING_2 }));
      data.scripts.macOS.forEach((s: any) => {
        children.push(new Paragraph({ text: s.displayName || "macOS Script", heading: HeadingLevel.HEADING_3 }));
        if (s.description) children.push(new Paragraph({ text: s.description }));
      });
    }
    addSection("Scripts", children);
  }

  // App Configuration Policies Section with detailed settings
  if (data.appConfigurations && data.appConfigurations.length > 0) {
    const children: (Paragraph | Table)[] = [];
    data.appConfigurations.forEach((config: any) => {
      children.push(
        new Paragraph({
          text: config.displayName || config.name || "Unnamed Configuration",
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 },
        })
      );

      if (config.description) {
        children.push(new Paragraph({ text: config.description, spacing: { after: 100 } }));
      }

      // Build settings table
      const configSettings: Array<{name: string; value: string}> = [];

      if (config['@odata.type']) {
        configSettings.push({
          name: "Configuration Type",
          value: config['@odata.type'].replace('#microsoft.graph.', '')
        });
      }

      if (config.targetedMobileApps && config.targetedMobileApps.length > 0) {
        configSettings.push({
          name: "Number of Targeted Apps",
          value: config.targetedMobileApps.length.toString()
        });
      }

      // For managed app configurations (iOS/Android)
      if (config.encodedSettingXml) {
        try {
          const decodedXml = atob(config.encodedSettingXml);
          configSettings.push({
            name: "Configuration Settings (XML)",
            value: decodedXml.substring(0, 500) + (decodedXml.length > 500 ? '...' : '')
          });
        } catch {
          configSettings.push({
            name: "Configuration Settings",
            value: "XML settings present (base64 encoded)"
          });
        }
      }

      // For managed device configurations
      if (config.payloadJson) {
        try {
          const payload = JSON.parse(config.payloadJson);
          Object.entries(payload).forEach(([key, value]) => {
            configSettings.push({
              name: key,
              value: String(value)
            });
          });
        } catch {
          configSettings.push({
            name: "Configuration Payload",
            value: config.payloadJson.substring(0, 200) + (config.payloadJson.length > 200 ? '...' : '')
          });
        }
      }

      // For settings array (generic configurations)
      if (config.settings && Array.isArray(config.settings)) {
        config.settings.forEach((setting: any) => {
          configSettings.push({
            name: setting.settingName || setting.name || setting.key || "Setting",
            value: String(setting.settingValue || setting.value || setting.valueJson || '')
          });
        });
      }

      // Additional common properties
      if (config.payload && typeof config.payload === 'string') {
        configSettings.push({
          name: "Payload",
          value: config.payload.substring(0, 200) + (config.payload.length > 200 ? '...' : '')
        });
      }

      if (config.permissionActions && config.permissionActions.length > 0) {
        configSettings.push({
          name: "Permission Actions",
          value: config.permissionActions.join(', ')
        });
      }

      // Add settings table if we have settings
      if (configSettings.length > 0) {
        const rows = configSettings.map(
          (s) =>
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({ text: s.name, style: "TableText" })],
                  width: { size: 35, type: WidthType.PERCENTAGE },
                  shading: { fill: "F3F4F6" },
                }),
                new TableCell({
                  children: [new Paragraph({ text: String(s.value || ""), style: "TableText" })],
                  width: { size: 65, type: WidthType.PERCENTAGE },
                }),
              ],
            })
        );

        children.push(
          new Table({
            rows,
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: tableBorders,
          })
        );
      }

      // Add targeted apps if available
      if (config.targetedMobileApps && config.targetedMobileApps.length > 0) {
        children.push(
          new Paragraph({
            text: "Targeted Apps:",
            bold: true,
            spacing: { before: 100, after: 50 },
          })
        );
        config.targetedMobileApps.forEach((appId: string) => {
          children.push(
            new Paragraph({
              text: appId,
              bullet: { level: 0 },
            })
          );
        });
      }

      // Add assignments
      if (config.assignments && config.assignments.length > 0) {
        children.push(
          new Paragraph({
            text: "Assignments:",
            bold: true,
            spacing: { before: 100, after: 50 },
          })
        );
        config.assignments.forEach((a: any) => {
          const groupId = a.target?.groupId;
          const groupName = groupId && data.groupNames ? data.groupNames.get(groupId) : undefined;
          const displayName = groupName || groupId || getTargetDescription(a.target);
          children.push(new Paragraph({ text: displayName, bullet: { level: 0 } }));
        });
      }
    });
    addSection("App Configuration Policies", children);
  }

  // Optional sections - simple listing for now
  const simpleListSection = (title: string, items?: any[]) => {
    if (!items || items.length === 0) return;
    const children: Paragraph[] = [];
    items.forEach((i) => {
      children.push(new Paragraph({ text: i.displayName || i.name || "Item", bullet: { level: 0 } }));
    });
    addSection(title, children);
  };
  simpleListSection("Windows Update Policies", data.windowsUpdatePolicies);
  simpleListSection("Enrollment Configurations", data.enrollmentConfigurations);
  simpleListSection("Conditional Access Policies", data.conditionalAccessPolicies);

  const doc = new Document({ sections });
  const buffer = await Packer.toBuffer(doc);
  return new Uint8Array(buffer);
}
