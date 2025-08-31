// Compliance framework mappings for Intune configurations

export interface ComplianceControl {
  id: string;
  title: string;
  description: string;
  intuneSettings: string[];
  category: string;
}

export interface ComplianceFramework {
  name: string;
  version: string;
  controls: ComplianceControl[];
}

export interface SecurityControl {
  name: string;
  description: string;
  platforms: string[];
  relatedSettings: string[];
  complianceMapping: {
    ISO27001?: string[];
    SOC2?: string[];
    NIST?: string[];
    BSI?: string[];
  };
}

// Security controls that map to Intune settings
export const SECURITY_CONTROLS: Record<string, SecurityControl> = {
  diskEncryption: {
    name: "Disk Encryption",
    description: "Full disk encryption for data at rest protection",
    platforms: ["Windows", "macOS", "iOS", "Android"],
    relatedSettings: [
      "bitLocker",
      "bitLockerEnabled",
      "fileVault",
      "fileVaultEnabled",
      "storageRequireEncryption",
      "requireDeviceEncryption"
    ],
    complianceMapping: {
      ISO27001: ["A.8.2.3", "A.10.1.1"],
      SOC2: ["CC6.1", "CC6.6"],
      NIST: ["SC-28", "SC-13"],
      BSI: ["CON.1", "CON.11"]
    }
  },
  
  antimalware: {
    name: "Antimalware Protection",
    description: "Endpoint protection against malware and viruses",
    platforms: ["Windows", "macOS"],
    relatedSettings: [
      "defender",
      "defenderEnabled",
      "antivirusRequired",
      "antispywareRequired",
      "realtimeProtection",
      "behaviorMonitoring",
      "intrusionPreventionSystem"
    ],
    complianceMapping: {
      ISO27001: ["A.12.2.1"],
      SOC2: ["CC6.8"],
      NIST: ["SI-3", "SI-8"],
      BSI: ["SYS.2.1", "OPS.1.1.4"]
    }
  },
  
  firewall: {
    name: "Firewall Configuration",
    description: "Network protection and traffic filtering",
    platforms: ["Windows", "macOS"],
    relatedSettings: [
      "firewall",
      "firewallEnabled",
      "firewallBlockAllIncoming",
      "firewallEnableStealthMode",
      "networkProtection"
    ],
    complianceMapping: {
      ISO27001: ["A.13.1.1", "A.13.1.3"],
      SOC2: ["CC6.1", "CC6.6"],
      NIST: ["SC-7", "AC-4"],
      BSI: ["NET.3.2", "NET.1.1"]
    }
  },
  
  passwordPolicy: {
    name: "Password Requirements",
    description: "Strong authentication and password policies",
    platforms: ["Windows", "macOS", "iOS", "Android"],
    relatedSettings: [
      "passwordRequired",
      "passwordMinimumLength",
      "passwordRequiredType",
      "passwordExpirationDays",
      "passwordComplexity",
      "passwordHistory"
    ],
    complianceMapping: {
      ISO27001: ["A.9.4.3", "A.9.2.4"],
      SOC2: ["CC6.1", "CC6.2"],
      NIST: ["IA-5", "AC-2"],
      BSI: ["ORP.4", "APP.3.1"]
    }
  },
  
  systemUpdates: {
    name: "System Updates",
    description: "Operating system and security update management",
    platforms: ["Windows", "macOS", "iOS", "Android"],
    relatedSettings: [
      "windowsUpdate",
      "automaticUpdates",
      "osMinimumVersion",
      "osMaximumVersion",
      "updatePolicy",
      "defenderUpdates"
    ],
    complianceMapping: {
      ISO27001: ["A.12.6.1", "A.18.2.3"],
      SOC2: ["CC7.1", "CC7.2"],
      NIST: ["SI-2", "CM-3"],
      BSI: ["OPS.1.1.3", "SYS.1.2.2"]
    }
  },
  
  deviceCompliance: {
    name: "Device Compliance",
    description: "Device health and compliance validation",
    platforms: ["Windows", "macOS", "iOS", "Android"],
    relatedSettings: [
      "jailBroken",
      "rooted",
      "deviceThreatProtectionEnabled",
      "systemIntegrityProtectionEnabled",
      "codeIntegrityEnabled",
      "secureBootEnabled"
    ],
    complianceMapping: {
      ISO27001: ["A.8.1.1", "A.8.1.3"],
      SOC2: ["CC6.3"],
      NIST: ["CM-2", "CM-6"],
      BSI: ["SYS.3.1", "SYS.3.4"]
    }
  },
  
  dataProtection: {
    name: "Data Protection",
    description: "Data loss prevention and information protection",
    platforms: ["Windows", "macOS", "iOS", "Android"],
    relatedSettings: [
      "appLocker",
      "dataProtection",
      "copyPaste",
      "screenCapture",
      "printBlocked",
      "saveAs",
      "shareToPersonalApps"
    ],
    complianceMapping: {
      ISO27001: ["A.8.2.1", "A.8.2.2", "A.13.2.1"],
      SOC2: ["CC6.7"],
      NIST: ["AC-3", "AC-4", "SC-8"],
      BSI: ["CON.3", "APP.1.1"]
    }
  },
  
  auditLogging: {
    name: "Audit & Logging",
    description: "Security event logging and monitoring",
    platforms: ["Windows", "macOS"],
    relatedSettings: [
      "auditLogs",
      "eventLogging",
      "securityAuditing",
      "logRetention",
      "advancedAuditing"
    ],
    complianceMapping: {
      ISO27001: ["A.12.4.1", "A.12.4.3"],
      SOC2: ["CC7.1", "CC2.2"],
      NIST: ["AU-2", "AU-3", "AU-12"],
      BSI: ["OPS.1.1.5", "DER.1"]
    }
  },
  
  accessControl: {
    name: "Access Control",
    description: "User access management and authentication",
    platforms: ["Windows", "macOS", "iOS", "Android"],
    relatedSettings: [
      "conditionalAccess",
      "mfa",
      "biometrics",
      "certificateAuth",
      "smartCardRequired",
      "trustedPlatformModule"
    ],
    complianceMapping: {
      ISO27001: ["A.9.1.1", "A.9.2.1", "A.9.4.2"],
      SOC2: ["CC6.1", "CC6.2", "CC6.3"],
      NIST: ["AC-2", "AC-3", "IA-2"],
      BSI: ["ORP.4", "APP.2.1"]
    }
  },
  
  networkSecurity: {
    name: "Network Security",
    description: "Network access and VPN configuration",
    platforms: ["Windows", "macOS", "iOS", "Android"],
    relatedSettings: [
      "vpn",
      "wifi",
      "certificateProfiles",
      "trustedNetworkDomains",
      "blockPersonalHotspot",
      "networkIsolation"
    ],
    complianceMapping: {
      ISO27001: ["A.13.1.1", "A.13.1.2", "A.13.2.1"],
      SOC2: ["CC6.6"],
      NIST: ["SC-8", "SC-12", "SC-17"],
      BSI: ["NET.1.1", "NET.3.1", "NET.3.3"]
    }
  }
};

// Analyze a configuration and identify applicable security controls
export function identifySecurityControls(configuration: any): string[] {
  const identifiedControls = new Set<string>();
  
  // Convert configuration to string for searching
  const configString = JSON.stringify(configuration).toLowerCase();
  
  // Check each security control
  for (const [controlKey, control] of Object.entries(SECURITY_CONTROLS)) {
    // Check if any related settings are present in the configuration
    for (const setting of control.relatedSettings) {
      if (configString.includes(setting.toLowerCase())) {
        identifiedControls.add(controlKey);
        break;
      }
    }
  }
  
  return Array.from(identifiedControls);
}

// Get compliance mappings for identified controls
export function getComplianceMappings(controlKeys: string[], framework: 'ISO27001' | 'SOC2' | 'NIST' | 'BSI'): string[] {
  const mappings = new Set<string>();
  
  for (const key of controlKeys) {
    const control = SECURITY_CONTROLS[key];
    if (control?.complianceMapping[framework]) {
      control.complianceMapping[framework].forEach(mapping => mappings.add(mapping));
    }
  }
  
  return Array.from(mappings).sort();
}

// Analyze all configurations and generate compliance summary
export interface ComplianceSummary {
  totalConfigurations: number;
  coveredControls: Record<string, {
    covered: boolean;
    configurations: string[];
    platforms: string[];
  }>;
  frameworkCoverage: {
    ISO27001: { covered: string[]; total: number; percentage: number };
    SOC2: { covered: string[]; total: number; percentage: number };
    NIST: { covered: string[]; total: number; percentage: number };
    BSI: { covered: string[]; total: number; percentage: number };
  };
}

export function generateComplianceSummary(configurations: any[]): ComplianceSummary {
  const summary: ComplianceSummary = {
    totalConfigurations: configurations.length,
    coveredControls: {},
    frameworkCoverage: {
      ISO27001: { covered: [], total: 0, percentage: 0 },
      SOC2: { covered: [], total: 0, percentage: 0 },
      NIST: { covered: [], total: 0, percentage: 0 },
      BSI: { covered: [], total: 0, percentage: 0 }
    }
  };
  
  // Initialize all controls as not covered
  for (const key of Object.keys(SECURITY_CONTROLS)) {
    summary.coveredControls[key] = {
      covered: false,
      configurations: [],
      platforms: []
    };
  }
  
  // Analyze each configuration
  for (const config of configurations) {
    const controls = identifySecurityControls(config);
    
    for (const controlKey of controls) {
      summary.coveredControls[controlKey].covered = true;
      summary.coveredControls[controlKey].configurations.push(config.displayName || config.name || 'Unnamed');
      
      // Identify platform
      const platform = config.platforms || config.platformType || 'Unknown';
      if (!summary.coveredControls[controlKey].platforms.includes(platform)) {
        summary.coveredControls[controlKey].platforms.push(platform);
      }
    }
  }
  
  // Calculate framework coverage
  const frameworks: Array<'ISO27001' | 'SOC2' | 'NIST' | 'BSI'> = ['ISO27001', 'SOC2', 'NIST', 'BSI'];
  
  for (const framework of frameworks) {
    const allControls = new Set<string>();
    const coveredControlsSet = new Set<string>();
    
    // Collect all controls and covered controls for this framework
    for (const [key, control] of Object.entries(SECURITY_CONTROLS)) {
      if (control.complianceMapping[framework]) {
        control.complianceMapping[framework].forEach(c => allControls.add(c));
        
        if (summary.coveredControls[key].covered) {
          control.complianceMapping[framework].forEach(c => coveredControlsSet.add(c));
        }
      }
    }
    
    summary.frameworkCoverage[framework] = {
      covered: Array.from(coveredControlsSet).sort(),
      total: allControls.size,
      percentage: allControls.size > 0 ? Math.round((coveredControlsSet.size / allControls.size) * 100) : 0
    };
  }
  
  return summary;
}

// Group configurations by security control
export function groupConfigurationsByControl(configurations: any[]): Record<string, any[]> {
  const grouped: Record<string, any[]> = {};
  
  // Initialize groups
  for (const key of Object.keys(SECURITY_CONTROLS)) {
    grouped[key] = [];
  }
  
  // Group configurations
  for (const config of configurations) {
    const controls = identifySecurityControls(config);
    for (const control of controls) {
      grouped[control].push(config);
    }
  }
  
  return grouped;
}

// Get detailed compliance evidence for a specific framework
export interface ComplianceEvidence {
  framework: string;
  control: string;
  title: string;
  description: string;
  status: 'Compliant' | 'Partial' | 'Non-Compliant';
  evidence: Array<{
    configurationName: string;
    configurationType: string;
    settings: Array<{
      name: string;
      value: string;
    }>;
    assignedTo: string[];
  }>;
}

export function generateComplianceEvidence(
  configurations: any[],
  framework: 'ISO27001' | 'SOC2' | 'NIST' | 'BSI'
): ComplianceEvidence[] {
  const evidence: ComplianceEvidence[] = [];
  const grouped = groupConfigurationsByControl(configurations);
  
  for (const [controlKey, control] of Object.entries(SECURITY_CONTROLS)) {
    if (!control.complianceMapping[framework]) continue;
    
    for (const frameworkControl of control.complianceMapping[framework]) {
      const relatedConfigs = grouped[controlKey] || [];
      
      evidence.push({
        framework,
        control: frameworkControl,
        title: control.name,
        description: control.description,
        status: relatedConfigs.length > 0 ? 'Compliant' : 'Non-Compliant',
        evidence: relatedConfigs.map(config => ({
          configurationName: config.displayName || config.name,
          configurationType: config.configType || config["@odata.type"],
          settings: extractRelevantSettings(config, control.relatedSettings),
          assignedTo: parseAssignmentTargets(config.assignments)
        }))
      });
    }
  }
  
  return evidence;
}

// Helper function to extract relevant settings from a configuration
function extractRelevantSettings(config: any, relevantSettings: string[]): Array<{name: string, value: string}> {
  const settings: Array<{name: string, value: string}> = [];
  const configString = JSON.stringify(config).toLowerCase();
  
  for (const setting of relevantSettings) {
    if (configString.includes(setting.toLowerCase())) {
      // Try to find the actual value
      if (config[setting] !== undefined) {
        settings.push({
          name: setting,
          value: String(config[setting])
        });
      }
    }
  }
  
  return settings;
}

// Helper function to parse assignment targets
function parseAssignmentTargets(assignments: any[]): string[] {
  if (!assignments || assignments.length === 0) {
    return ["Not assigned"];
  }
  
  return assignments.map(assignment => {
    const target = assignment.target;
    if (!target) return "Unknown";
    
    const type = target["@odata.type"];
    if (type?.includes("allDevices")) return "All Devices";
    if (type?.includes("allUsers")) return "All Users";
    if (type?.includes("group")) return `Group: ${target.groupId}`;
    
    return "Custom Assignment";
  });
}