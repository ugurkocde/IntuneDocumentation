import jsPDF from "jspdf";
import {
  extractSettingValue,
  parseDeviceConfiguration,
  parseAdministrativeTemplate,
  parseComplianceRules,
  parseSecurityBaseline,
  parseAssignments,
  formatValue
} from "./configuration-parser";

interface DetailedPdfData {
  settingsCatalog: any[];
  deviceConfigurations: any[];
  administrativeTemplates: any[];
  compliancePolicies: any[];
  securityBaselines: any[];
  scripts: {
    windows: any[];
    macOS: any[];
  };
  appConfigurations?: any[];
  windowsUpdatePolicies?: any[];
  enrollmentConfigurations?: any[];
  groupNames?: Map<string, string>;
  deviceCounts?: Record<string, number>;
}

// Helper function to analyze configurations
function analyzeConfigurations(data: DetailedPdfData) {
  const allConfigs = [
    ...data.settingsCatalog,
    ...data.deviceConfigurations,
    ...data.administrativeTemplates,
    ...data.compliancePolicies,
    ...data.securityBaselines,
    ...data.scripts.windows,
    ...data.scripts.macOS
  ];

  // Collect unique groups
  const uniqueGroups = new Set<string>();
  const groupAssignmentCount: Record<string, number> = {};
  let assignedCount = 0;
  let unassignedCount = 0;

  allConfigs.forEach(config => {
    if (config.assignments && config.assignments.length > 0) {
      assignedCount++;
      config.assignments.forEach((assignment: any) => {
        if (assignment.target?.groupId) {
          uniqueGroups.add(assignment.target.groupId);
          const groupId = assignment.target.groupId;
          groupAssignmentCount[groupId] = (groupAssignmentCount[groupId] || 0) + 1;
        } else if (assignment.target?.["@odata.type"]?.includes("allUsers")) {
          uniqueGroups.add("All Users");
          groupAssignmentCount["All Users"] = (groupAssignmentCount["All Users"] || 0) + 1;
        } else if (assignment.target?.["@odata.type"]?.includes("allDevices")) {
          uniqueGroups.add("All Devices");
          groupAssignmentCount["All Devices"] = (groupAssignmentCount["All Devices"] || 0) + 1;
        }
      });
    } else {
      unassignedCount++;
    }
  });

  // Detect platforms and count configurations per platform
  const platformCounts: Record<string, number> = {};
  
  // Helper function to normalize platform names
  const normalizePlatform = (platform: string): string => {
    const lower = platform.toLowerCase();
    if (lower.includes("windows")) return "Windows";
    if (lower.includes("mac")) return "macOS";
    if (lower.includes("ios")) return "iOS";
    if (lower.includes("android")) return "Android";
    if (lower.includes("linux")) return "Linux";
    return platform; // Return as-is if no match
  };
  
  allConfigs.forEach(config => {
    // Check platform from various fields
    let platform: string | null = null;
    
    if (config.platforms) {
      platform = normalizePlatform(config.platforms);
    } else if (config.platformType) {
      platform = normalizePlatform(config.platformType);
    } else if (config["@odata.type"]) {
      const type = config["@odata.type"].toLowerCase();
      if (type.includes("windows")) platform = "Windows";
      else if (type.includes("mac")) platform = "macOS";
      else if (type.includes("ios")) platform = "iOS";
      else if (type.includes("android")) platform = "Android";
    }
    
    if (platform) {
      platformCounts[platform] = (platformCounts[platform] || 0) + 1;
    }
  });

  // Calculate age statistics
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  
  let recentlyCreated = 0;
  let recentlyModified = 0;
  let staleConfigs = 0;

  allConfigs.forEach(config => {
    if (config.createdDateTime) {
      const created = new Date(config.createdDateTime);
      if (created > sevenDaysAgo) recentlyCreated++;
    }
    if (config.lastModifiedDateTime) {
      const modified = new Date(config.lastModifiedDateTime);
      if (modified > thirtyDaysAgo) recentlyModified++;
      if (modified < ninetyDaysAgo) staleConfigs++;
    }
  });

  // Sort groups by assignment count
  const topGroups = Object.entries(groupAssignmentCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return {
    totalConfigs: allConfigs.length,
    assignedConfigs: assignedCount,
    unassignedConfigs: unassignedCount,
    uniqueGroupsCount: uniqueGroups.size,
    topGroups,
    platformCounts,
    recentlyCreated,
    recentlyModified,
    staleConfigs,
    byType: {
      settingsCatalog: data.settingsCatalog.length,
      deviceConfigurations: data.deviceConfigurations.length,
      administrativeTemplates: data.administrativeTemplates.length,
      compliancePolicies: data.compliancePolicies.length,
      securityBaselines: data.securityBaselines.length,
      scriptsWindows: data.scripts.windows.length,
      scriptsMacOS: data.scripts.macOS.length
    }
  };
}

export async function generateDetailedPDF(data: DetailedPdfData): Promise<Uint8Array> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  let yPosition = 20;
  const pageHeight = doc.internal.pageSize.height;
  const pageWidth = doc.internal.pageSize.width;
  const margin = 15;
  const lineHeight = 6;
  const maxWidth = pageWidth - 2 * margin;
  let pageNumber = 1;
  
  // Analyze configurations for overview
  const analytics = analyzeConfigurations(data);

  // Helper functions
  const checkPageBreak = (neededSpace: number = 30) => {
    if (yPosition > pageHeight - neededSpace) {
      doc.addPage();
      yPosition = margin;
      pageNumber++;
      addPageNumber();
      return true;
    }
    return false;
  };

  const addPageNumber = () => {
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${pageNumber}`, pageWidth / 2, pageHeight - 10, { align: "center" });
    doc.setTextColor(0, 0, 0);
  };

  const addText = (text: string, fontSize: number = 11, isBold: boolean = false, color: [number, number, number] = [0, 0, 0]) => {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    doc.setTextColor(...color);
    
    const lines = doc.splitTextToSize(text, maxWidth);
    
    for (const line of lines) {
      checkPageBreak();
      doc.text(line, margin, yPosition);
      yPosition += fontSize * 0.45;
    }
    doc.setTextColor(0, 0, 0);
  };

  const addSectionHeader = (title: string) => {
    checkPageBreak(20);
    yPosition += 3;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 51, 102);
    doc.text(title, margin, yPosition);
    yPosition += 8;
    
    // Add underline
    doc.setDrawColor(0, 51, 102);
    doc.setLineWidth(0.5);
    doc.line(margin, yPosition - 2, pageWidth - margin, yPosition - 2);
    doc.setTextColor(0, 0, 0);
    yPosition += 3;
  };

  const addConfigHeader = (name: string, assignments: string, createdDate?: string, modifiedDate?: string) => {
    checkPageBreak(25);
    
    // Configuration name
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 102, 204);
    const nameLines = doc.splitTextToSize(name, maxWidth);
    nameLines.forEach((line: string) => {
      doc.text(line, margin, yPosition);
      yPosition += 6;
    });
    doc.setTextColor(0, 0, 0);
    
    // Dates and assignments
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    
    // Show dates if available
    if (createdDate || modifiedDate) {
      if (createdDate) {
        const created = new Date(createdDate).toLocaleDateString();
        doc.text(`Created: ${created}`, margin, yPosition);
        yPosition += 4;
      }
      if (modifiedDate) {
        const modified = new Date(modifiedDate).toLocaleDateString();
        doc.text(`Last Modified: ${modified}`, margin, yPosition);
        yPosition += 4;
      }
    }
    
    doc.text(`Assigned to: ${assignments}`, margin, yPosition);
    yPosition += 6;
    doc.setTextColor(0, 0, 0);
  };

  const addSettingsTable = (settings: Array<{name: string, value: string, description?: string}>) => {
    if (settings.length === 0) return;
    
    // Adjusted column widths for better balance
    const colWidths = [50, 65, 65]; // Name, Value, Description columns
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);
    
    // Helper function to wrap long technical strings
    const wrapTechnicalString = (str: string, maxWidth: number): string[] => {
      // For technical strings like "defender_configuration_enableconvertwarntoblock_1"
      // Break at underscores if the string is too long
      if (str.includes('_') && str.length > 40) {
        const parts = str.split('_');
        let lines: string[] = [];
        let currentLine = '';
        
        parts.forEach((part, idx) => {
          const separator = idx > 0 ? '_' : '';
          const testLine = currentLine + separator + part;
          const testWidth = doc.getTextWidth(testLine);
          
          if (testWidth > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = part;
          } else {
            currentLine = testLine;
          }
        });
        
        if (currentLine) lines.push(currentLine);
        return lines;
      }
      
      // For regular text, use the standard split function
      return doc.splitTextToSize(str, maxWidth);
    };
    
    // Table header
    checkPageBreak(15);
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, yPosition, tableWidth, 8, "F");
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Setting", margin + 2, yPosition + 5);
    doc.text("Value", margin + colWidths[0] + 2, yPosition + 5);
    doc.text("Description", margin + colWidths[0] + colWidths[1] + 2, yPosition + 5);
    yPosition += 8;
    
    // Table rows
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8); // Slightly smaller font for more content
    
    settings.forEach((setting, index) => {
      // Prepare text for all columns
      const nameLines = doc.splitTextToSize(setting.name, colWidths[0] - 4);
      const valueText = setting.value || "Not configured";
      const valueLines = wrapTechnicalString(valueText, colWidths[1] - 4);
      const descLines = setting.description 
        ? doc.splitTextToSize(setting.description, colWidths[2] - 4)
        : [""];
      
      // Calculate row height based on maximum lines needed
      const maxLines = Math.max(nameLines.length, valueLines.length, descLines.length);
      const rowHeight = Math.max(8, maxLines * 4 + 4); // Dynamic height based on content
      
      // Check for page break with actual row height
      checkPageBreak(rowHeight + 5);
      
      // Alternate row background
      if (index % 2 === 0) {
        doc.setFillColor(250, 250, 250);
        doc.rect(margin, yPosition, tableWidth, rowHeight, "F");
      }
      
      // Draw cell borders
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.1);
      doc.line(margin, yPosition + rowHeight, margin + tableWidth, yPosition + rowHeight);
      
      // Setting name (all lines)
      let textY = yPosition + 4;
      nameLines.forEach((line: string, lineIndex: number) => {
        if (lineIndex < maxLines) {
          doc.text(line, margin + 2, textY);
          textY += 4;
        }
      });
      
      // Value (all lines)
      textY = yPosition + 4;
      valueLines.forEach((line: string, lineIndex: number) => {
        if (lineIndex < maxLines) {
          doc.text(line, margin + colWidths[0] + 2, textY);
          textY += 4;
        }
      });
      
      // Description (all lines)
      if (setting.description) {
        textY = yPosition + 4;
        doc.setTextColor(80, 80, 80);
        descLines.forEach((line: string, lineIndex: number) => {
          if (lineIndex < maxLines) {
            doc.text(line, margin + colWidths[0] + colWidths[1] + 2, textY);
            textY += 4;
          }
        });
        doc.setTextColor(0, 0, 0);
      }
      
      yPosition += rowHeight;
    });
    
    yPosition += 5;
  };

  // Generate PDF content
  
  // Cover Page
  addPageNumber();
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 51, 102);
  doc.text("Intune Configuration", pageWidth / 2, 50, { align: "center" });
  doc.text("Documentation", pageWidth / 2, 65, { align: "center" });
  
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  yPosition = 85;
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, yPosition, { align: "center" });
  
  // Summary
  yPosition = 110;
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Configuration Summary", pageWidth / 2, yPosition, { align: "center" });
  
  yPosition = 125;
  const totalCount = 
    data.settingsCatalog.length +
    data.deviceConfigurations.length +
    data.administrativeTemplates.length +
    data.compliancePolicies.length +
    data.securityBaselines.length +
    data.scripts.windows.length +
    data.scripts.macOS.length;
  
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  
  const summaryItems = [
    { label: "Settings Catalog Policies", count: data.settingsCatalog.length },
    { label: "Device Configurations", count: data.deviceConfigurations.length },
    { label: "Administrative Templates", count: data.administrativeTemplates.length },
    { label: "Compliance Policies", count: data.compliancePolicies.length },
    { label: "Security Baselines", count: data.securityBaselines.length },
    { label: "PowerShell Scripts", count: data.scripts.windows.length },
    { label: "Shell Scripts", count: data.scripts.macOS.length }
  ];
  
  summaryItems.forEach(item => {
    if (item.count > 0) {
      doc.text(`${item.label}:`, margin + 30, yPosition);
      doc.setFont("helvetica", "bold");
      doc.text(item.count.toString(), pageWidth - margin - 30, yPosition, { align: "right" });
      doc.setFont("helvetica", "normal");
      yPosition += 7;
    }
  });
  
  yPosition += 3;
  doc.setLineWidth(0.5);
  doc.line(margin + 30, yPosition, pageWidth - margin - 30, yPosition);
  yPosition += 7;
  
  doc.setFont("helvetica", "bold");
  doc.text("Total Configurations:", margin + 30, yPosition);
  doc.setFontSize(12);
  doc.text(totalCount.toString(), pageWidth - margin - 30, yPosition, { align: "right" });
  
  // Tenant Overview Page
  doc.addPage();
  yPosition = margin;
  pageNumber++;
  addPageNumber();
  addSectionHeader("Tenant Overview");
  
  // Key Metrics Section
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Key Metrics", margin, yPosition);
  yPosition += 8;
  
  // Metrics grid
  const metrics = [
    { label: "Total Configurations", value: analytics.totalConfigs.toString() },
    { label: "Assigned Policies", value: analytics.assignedConfigs.toString() },
    { label: "Unassigned Policies", value: analytics.unassignedConfigs.toString() },
    { label: "Unique Groups", value: analytics.uniqueGroupsCount.toString() },
    { label: "Platforms", value: Object.keys(analytics.platformCounts).length.toString() },
    { label: "Assignment Rate", value: `${Math.round((analytics.assignedConfigs / analytics.totalConfigs) * 100)}%` }
  ];
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  let xPos = margin;
  let metricsYPos = yPosition;
  metrics.forEach((metric, index) => {
    if (index % 3 === 0 && index > 0) {
      metricsYPos += 15;
      xPos = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.text(metric.value, xPos, metricsYPos);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(metric.label, xPos, metricsYPos + 4);
    doc.setFontSize(10);
    xPos += 60;
  });
  
  yPosition = metricsYPos + 20;
  
  // Configuration Inventory Table
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Configuration Inventory", margin, yPosition);
  yPosition += 8;
  
  // Table header
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, yPosition, 180, 7, "F");
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Type", margin + 2, yPosition + 5);
  doc.text("Count", margin + 100, yPosition + 5);
  doc.text("Assigned", margin + 130, yPosition + 5);
  doc.text("Unassigned", margin + 155, yPosition + 5);
  yPosition += 7;
  
  // Table rows
  const inventory = [
    { 
      type: "Settings Catalog", 
      count: analytics.byType.settingsCatalog,
      assigned: data.settingsCatalog.filter(c => c.assignments?.length > 0).length
    },
    { 
      type: "Device Configurations", 
      count: analytics.byType.deviceConfigurations,
      assigned: data.deviceConfigurations.filter(c => c.assignments?.length > 0).length
    },
    { 
      type: "Administrative Templates", 
      count: analytics.byType.administrativeTemplates,
      assigned: data.administrativeTemplates.filter(c => c.assignments?.length > 0).length
    },
    { 
      type: "Compliance Policies", 
      count: analytics.byType.compliancePolicies,
      assigned: data.compliancePolicies.filter(c => c.assignments?.length > 0).length
    },
    { 
      type: "Security Baselines", 
      count: analytics.byType.securityBaselines,
      assigned: data.securityBaselines.filter(c => c.assignments?.length > 0).length
    },
    { 
      type: "PowerShell Scripts", 
      count: analytics.byType.scriptsWindows,
      assigned: data.scripts.windows.filter(c => c.assignments?.length > 0).length
    },
    { 
      type: "Shell Scripts", 
      count: analytics.byType.scriptsMacOS,
      assigned: data.scripts.macOS.filter(c => c.assignments?.length > 0).length
    }
  ];
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  inventory.forEach((item, index) => {
    if (item.count > 0) {
      if (index % 2 === 0) {
        doc.setFillColor(250, 250, 250);
        doc.rect(margin, yPosition, 180, 6, "F");
      }
      doc.text(item.type, margin + 2, yPosition + 4);
      doc.text(item.count.toString(), margin + 100, yPosition + 4);
      doc.text(item.assigned.toString(), margin + 130, yPosition + 4);
      doc.text((item.count - item.assigned).toString(), margin + 155, yPosition + 4);
      yPosition += 6;
    }
  });
  
  yPosition += 10;
  
  // Platform Coverage
  if (Object.keys(analytics.platformCounts).length > 0 || data.deviceCounts) {
    checkPageBreak(40);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Platform Coverage", margin, yPosition);
    yPosition += 8;
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    
    // Combine configuration counts with device counts
    const platformData: Record<string, { configs: number, devices: number }> = {};
    
    // Add configuration counts
    Object.entries(analytics.platformCounts).forEach(([platform, count]) => {
      platformData[platform] = { configs: count, devices: 0 };
    });
    
    // Add device counts (normalize OS names to match configuration platforms)
    if (data.deviceCounts) {
      Object.entries(data.deviceCounts).forEach(([os, count]) => {
        // Use the same normalization function
        const normalizedPlatform = (() => {
          const lower = os.toLowerCase();
          if (lower.includes("windows")) return "Windows";
          if (lower.includes("mac")) return "macOS";
          if (lower.includes("ios")) return "iOS";
          if (lower.includes("android")) return "Android";
          if (lower.includes("linux")) return "Linux";
          return os; // Return as-is if no match
        })();
        
        if (platformData[normalizedPlatform]) {
          platformData[normalizedPlatform].devices += count;
        } else {
          platformData[normalizedPlatform] = { configs: 0, devices: count };
        }
      });
    }
    
    // Sort platforms by total (configs + devices)
    const sortedPlatforms = Object.entries(platformData)
      .sort((a, b) => (b[1].configs + b[1].devices) - (a[1].configs + a[1].devices));
    
    sortedPlatforms.forEach(([platform, data]) => {
      doc.text(`• ${platform}:`, margin + 5, yPosition);
      doc.setFont("helvetica", "bold");
      const deviceText = data.devices > 0 ? `${data.devices} devices, ` : "";
      doc.text(`${deviceText}${data.configs} configurations`, margin + 50, yPosition);
      doc.setFont("helvetica", "normal");
      yPosition += 6;
    });
    
    yPosition += 10;
  }
  
  // Top Assigned Groups
  if (analytics.topGroups.length > 0) {
    checkPageBreak(60);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Top Assigned Groups", margin, yPosition);
    yPosition += 8;
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    analytics.topGroups.slice(0, 5).forEach(([groupId, count], index) => {
      // Use group name if available, otherwise show the ID
      const groupName = data.groupNames?.get(groupId) || groupId;
      doc.text(`${index + 1}. ${groupName}`, margin + 5, yPosition);
      doc.setTextColor(100, 100, 100);
      doc.text(`(${count} assignments)`, margin + 100, yPosition);
      doc.setTextColor(0, 0, 0);
      yPosition += 5;
    });
    
    yPosition += 10;
  }
  
  // Settings Catalog Section
  if (data.settingsCatalog.length > 0) {
    doc.addPage();
    yPosition = margin;
    pageNumber++;
    addPageNumber();
    addSectionHeader("Settings Catalog Policies");
    
    data.settingsCatalog.forEach(policy => {
      addConfigHeader(
        policy.displayName || policy.name,
        parseAssignments(policy.assignments),
        policy.createdDateTime,
        policy.lastModifiedDateTime
      );
      
      if (policy.description) {
        addText(policy.description, 9, false, [100, 100, 100]);
        yPosition += 2;
      }
      
      // Extract and display settings
      if (policy.settings && policy.settings.length > 0) {
        const formattedSettings = policy.settings.map((setting: any) => extractSettingValue(setting));
        addSettingsTable(formattedSettings);
      } else {
        addText("No settings configured", 9, false, [150, 150, 150]);
        yPosition += 5;
      }
      
      yPosition += 5;
    });
  }
  
  // Device Configurations Section
  if (data.deviceConfigurations.length > 0) {
    doc.addPage();
    yPosition = margin;
    pageNumber++;
    addPageNumber();
    addSectionHeader("Device Configurations");
    
    data.deviceConfigurations.forEach(config => {
      addConfigHeader(
        config.displayName,
        parseAssignments(config.assignments),
        config.createdDateTime,
        config.lastModifiedDateTime
      );
      
      if (config.description) {
        addText(config.description, 9, false, [100, 100, 100]);
        yPosition += 2;
      }
      
      // Parse and display configuration settings
      const categories = parseDeviceConfiguration(config);
      categories.forEach(category => {
        if (category.settings.length > 0) {
          addText(category.category, 10, true);
          yPosition += 2;
          addSettingsTable(category.settings);
        }
      });
      
      yPosition += 5;
    });
  }
  
  // Administrative Templates Section
  if (data.administrativeTemplates.length > 0) {
    doc.addPage();
    yPosition = margin;
    pageNumber++;
    addPageNumber();
    addSectionHeader("Administrative Templates");
    
    data.administrativeTemplates.forEach(template => {
      addConfigHeader(
        template.displayName,
        parseAssignments(template.assignments),
        template.createdDateTime,
        template.lastModifiedDateTime
      );
      
      if (template.description) {
        addText(template.description, 9, false, [100, 100, 100]);
        yPosition += 2;
      }
      
      // Parse and display definition values
      if (template.definitionValues && template.definitionValues.length > 0) {
        const settings = parseAdministrativeTemplate(template.definitionValues);
        const groupedSettings = settings.reduce((acc: any, setting) => {
          if (!acc[setting.category]) acc[setting.category] = [];
          acc[setting.category].push({
            name: setting.name,
            value: `${setting.state}: ${setting.value}`
          });
          return acc;
        }, {});
        
        Object.entries(groupedSettings).forEach(([category, categorySettings]: [string, any]) => {
          addText(category, 10, true);
          yPosition += 2;
          addSettingsTable(categorySettings);
        });
      } else {
        addText("No settings configured", 9, false, [150, 150, 150]);
        yPosition += 5;
      }
      
      yPosition += 5;
    });
  }
  
  // Compliance Policies Section
  if (data.compliancePolicies.length > 0) {
    doc.addPage();
    yPosition = margin;
    pageNumber++;
    addPageNumber();
    addSectionHeader("Compliance Policies");
    
    data.compliancePolicies.forEach(policy => {
      addConfigHeader(
        policy.displayName,
        parseAssignments(policy.assignments),
        policy.createdDateTime,
        policy.lastModifiedDateTime
      );
      
      if (policy.description) {
        addText(policy.description, 9, false, [100, 100, 100]);
        yPosition += 2;
      }
      
      // Parse and display compliance rules
      const rules = parseComplianceRules(policy);
      if (rules.length > 0) {
        const rulesTable = rules.map(rule => ({
          name: rule.rule,
          value: `${rule.value} (Action: ${rule.action})`
        }));
        addSettingsTable(rulesTable);
      } else {
        addText("No compliance rules configured", 9, false, [150, 150, 150]);
        yPosition += 5;
      }
      
      yPosition += 5;
    });
  }
  
  // Security Baselines Section
  if (data.securityBaselines.length > 0) {
    doc.addPage();
    yPosition = margin;
    pageNumber++;
    addPageNumber();
    addSectionHeader("Security Baselines");
    
    data.securityBaselines.forEach(baseline => {
      addConfigHeader(
        baseline.displayName,
        parseAssignments(baseline.assignments),
        baseline.createdDateTime,
        baseline.lastModifiedDateTime
      );
      
      if (baseline.description) {
        addText(baseline.description, 9, false, [100, 100, 100]);
        yPosition += 2;
      }
      
      // Parse and display baseline settings
      if (baseline.categories && baseline.categories.length > 0) {
        const categories = parseSecurityBaseline(baseline.categories);
        categories.forEach(category => {
          if (category.settings.length > 0) {
            addText(category.category, 10, true);
            yPosition += 2;
            addSettingsTable(category.settings);
          }
        });
      } else {
        addText("No settings configured", 9, false, [150, 150, 150]);
        yPosition += 5;
      }
      
      yPosition += 5;
    });
  }
  
  // Scripts Section
  if (data.scripts.windows.length > 0 || data.scripts.macOS.length > 0) {
    doc.addPage();
    yPosition = margin;
    pageNumber++;
    addPageNumber();
    addSectionHeader("Scripts");
    
    // Windows PowerShell Scripts
    if (data.scripts.windows.length > 0) {
      addText("Windows PowerShell Scripts", 12, true);
      yPosition += 5;
      
      data.scripts.windows.forEach(script => {
        addConfigHeader(
          script.displayName,
          parseAssignments(script.assignments),
          script.createdDateTime,
          script.lastModifiedDateTime
        );
        
        const scriptInfo = [
          { name: "File Name", value: script.fileName || "N/A" },
          { name: "Run As", value: script.runAsAccount === "system" ? "System" : "User" },
          { name: "Enforce Signature", value: formatValue(script.enforceSignatureCheck) },
          { name: "Run as 32-bit", value: formatValue(script.runAs32Bit) }
        ];
        
        addSettingsTable(scriptInfo);
        
        if (script.scriptContent) {
          addText("Script Content:", 9, true);
          yPosition += 2;
          
          // Decode base64 script content if needed
          let scriptText = script.scriptContent;
          try {
            // Check if it's base64 encoded
            if (scriptText && !scriptText.includes(' ') && scriptText.length % 4 === 0) {
              const decoded = atob(scriptText);
              scriptText = decoded;
            }
          } catch (e) {
            // Not base64, use as is
          }
          
          doc.setFontSize(8);
          doc.setFont("courier", "normal");
          doc.setTextColor(50, 50, 50);
          
          // Split the full script into lines
          const lines = doc.splitTextToSize(scriptText, maxWidth - 10);
          
          // Add all lines with proper page breaks
          lines.forEach((line: string) => {
            checkPageBreak();
            doc.text(line, margin + 5, yPosition);
            yPosition += 4;
          });
          
          doc.setFont("helvetica", "normal");
          doc.setTextColor(0, 0, 0);
          yPosition += 3;
          
          // Add script length info
          addText(`Total script length: ${scriptText.length} characters`, 8, false, [100, 100, 100]);
          yPosition += 2;
        }
        
        yPosition += 5;
      });
    }
    
    // macOS Shell Scripts
    if (data.scripts.macOS.length > 0) {
      addText("macOS Shell Scripts", 12, true);
      yPosition += 5;
      
      data.scripts.macOS.forEach(script => {
        addConfigHeader(
          script.displayName,
          parseAssignments(script.assignments),
          script.createdDateTime,
          script.lastModifiedDateTime
        );
        
        const scriptInfo = [
          { name: "File Name", value: script.fileName || "N/A" },
          { name: "Run As", value: script.runAsAccount === "system" ? "System" : "User" }
        ];
        
        addSettingsTable(scriptInfo);
        
        if (script.scriptContent) {
          addText("Script Content:", 9, true);
          yPosition += 2;
          
          // Decode base64 script content if needed
          let scriptText = script.scriptContent;
          try {
            // Check if it's base64 encoded
            if (scriptText && !scriptText.includes(' ') && scriptText.length % 4 === 0) {
              const decoded = atob(scriptText);
              scriptText = decoded;
            }
          } catch (e) {
            // Not base64, use as is
          }
          
          doc.setFontSize(8);
          doc.setFont("courier", "normal");
          doc.setTextColor(50, 50, 50);
          
          // Split the full script into lines
          const lines = doc.splitTextToSize(scriptText, maxWidth - 10);
          
          // Add all lines with proper page breaks
          lines.forEach((line: string) => {
            checkPageBreak();
            doc.text(line, margin + 5, yPosition);
            yPosition += 4;
          });
          
          doc.setFont("helvetica", "normal");
          doc.setTextColor(0, 0, 0);
          yPosition += 3;
          
          // Add script length info
          addText(`Total script length: ${scriptText.length} characters`, 8, false, [100, 100, 100]);
          yPosition += 2;
        }
        
        yPosition += 5;
      });
    }
  }
  
  // App Configuration Policies Section
  if (data.appConfigurations && data.appConfigurations.length > 0) {
    doc.addPage();
    yPosition = margin;
    pageNumber++;
    addPageNumber();
    addSectionHeader("App Configuration Policies");
    
    data.appConfigurations.forEach(config => {
      addConfigHeader(
        config.displayName || config.name,
        parseAssignments(config.assignments),
        config.createdDateTime,
        config.lastModifiedDateTime
      );
      
      if (config.description) {
        addText(config.description, 9, false, [100, 100, 100]);
        yPosition += 2;
      }
      
      // Add app configuration settings if available
      if (config.settings && config.settings.length > 0) {
        const settings = config.settings.map((setting: any) => ({
          name: setting.settingName || setting.key || "Setting",
          value: formatValue(setting.settingValue || setting.value)
        }));
        addSettingsTable(settings);
      }
      
      // Show targeted apps if available
      if (config.apps && config.apps.length > 0) {
        addText("Targeted Apps:", 10, true);
        yPosition += 2;
        config.apps.forEach((app: any) => {
          addText(`• ${app.mobileAppIdentifier?.packageId || app.bundleId || app.displayName || "Unknown App"}`, 9, false, [100, 100, 100]);
          yPosition += 1;
        });
        yPosition += 2;
      }
      
      yPosition += 5;
    });
  }
  
  // Windows Update Policies Section
  if (data.windowsUpdatePolicies && data.windowsUpdatePolicies.length > 0) {
    doc.addPage();
    yPosition = margin;
    pageNumber++;
    addPageNumber();
    addSectionHeader("Windows Update Policies");
    
    data.windowsUpdatePolicies.forEach(policy => {
      addConfigHeader(
        policy.displayName || policy.name,
        parseAssignments(policy.assignments),
        policy.createdDateTime,
        policy.lastModifiedDateTime
      );
      
      if (policy.description) {
        addText(policy.description, 9, false, [100, 100, 100]);
        yPosition += 2;
      }
      
      // Add Windows Update specific settings
      const updateSettings = [];
      
      if (policy.deliveryOptimizationMode !== undefined) {
        updateSettings.push({
          name: "Delivery Optimization Mode",
          value: policy.deliveryOptimizationMode
        });
      }
      
      if (policy.prereleaseFeatures !== undefined) {
        updateSettings.push({
          name: "Prerelease Features",
          value: policy.prereleaseFeatures
        });
      }
      
      if (policy.automaticUpdateMode !== undefined) {
        updateSettings.push({
          name: "Automatic Update Mode",
          value: policy.automaticUpdateMode
        });
      }
      
      if (policy.businessReadyUpdatesOnly !== undefined) {
        updateSettings.push({
          name: "Business Ready Updates Only",
          value: formatValue(policy.businessReadyUpdatesOnly)
        });
      }
      
      if (policy.driversExcluded !== undefined) {
        updateSettings.push({
          name: "Drivers Excluded",
          value: formatValue(policy.driversExcluded)
        });
      }
      
      if (policy.qualityUpdatesDeferralPeriodInDays !== undefined) {
        updateSettings.push({
          name: "Quality Updates Deferral (days)",
          value: policy.qualityUpdatesDeferralPeriodInDays
        });
      }
      
      if (policy.featureUpdatesDeferralPeriodInDays !== undefined) {
        updateSettings.push({
          name: "Feature Updates Deferral (days)",
          value: policy.featureUpdatesDeferralPeriodInDays
        });
      }
      
      if (policy.qualityUpdatesPaused !== undefined) {
        updateSettings.push({
          name: "Quality Updates Paused",
          value: formatValue(policy.qualityUpdatesPaused)
        });
      }
      
      if (policy.featureUpdatesPaused !== undefined) {
        updateSettings.push({
          name: "Feature Updates Paused",
          value: formatValue(policy.featureUpdatesPaused)
        });
      }
      
      if (updateSettings.length > 0) {
        addSettingsTable(updateSettings);
      }
      
      yPosition += 5;
    });
  }
  
  // Enrollment Configurations Section
  if (data.enrollmentConfigurations && data.enrollmentConfigurations.length > 0) {
    doc.addPage();
    yPosition = margin;
    pageNumber++;
    addPageNumber();
    addSectionHeader("Enrollment Configurations");
    
    data.enrollmentConfigurations.forEach(config => {
      addConfigHeader(
        config.displayName || config.name,
        parseAssignments(config.assignments),
        config.createdDateTime,
        config.lastModifiedDateTime
      );
      
      if (config.description) {
        addText(config.description, 9, false, [100, 100, 100]);
        yPosition += 2;
      }
      
      // Add enrollment type
      if (config["@odata.type"]) {
        const enrollmentType = config["@odata.type"].split(".").pop()?.replace(/([A-Z])/g, " $1").trim();
        addText(`Type: ${enrollmentType}`, 9, false, [100, 100, 100]);
        yPosition += 2;
      }
      
      // Add priority if available
      if (config.priority !== undefined) {
        addText(`Priority: ${config.priority}`, 9, false, [100, 100, 100]);
        yPosition += 2;
      }
      
      // Add enrollment-specific settings
      const enrollmentSettings = [];
      
      if (config.limit !== undefined) {
        enrollmentSettings.push({
          name: "Device Enrollment Limit",
          value: config.limit
        });
      }
      
      if (config.iosRestriction) {
        enrollmentSettings.push({
          name: "iOS Restrictions",
          value: config.iosRestriction.platformBlocked ? "Blocked" : "Allowed"
        });
        if (config.iosRestriction.personalDeviceEnrollmentBlocked !== undefined) {
          enrollmentSettings.push({
            name: "iOS Personal Devices",
            value: config.iosRestriction.personalDeviceEnrollmentBlocked ? "Blocked" : "Allowed"
          });
        }
      }
      
      if (config.androidRestriction) {
        enrollmentSettings.push({
          name: "Android Restrictions",
          value: config.androidRestriction.platformBlocked ? "Blocked" : "Allowed"
        });
        if (config.androidRestriction.personalDeviceEnrollmentBlocked !== undefined) {
          enrollmentSettings.push({
            name: "Android Personal Devices",
            value: config.androidRestriction.personalDeviceEnrollmentBlocked ? "Blocked" : "Allowed"
          });
        }
      }
      
      if (config.windowsRestriction) {
        enrollmentSettings.push({
          name: "Windows Restrictions",
          value: config.windowsRestriction.platformBlocked ? "Blocked" : "Allowed"
        });
        if (config.windowsRestriction.personalDeviceEnrollmentBlocked !== undefined) {
          enrollmentSettings.push({
            name: "Windows Personal Devices",
            value: config.windowsRestriction.personalDeviceEnrollmentBlocked ? "Blocked" : "Allowed"
          });
        }
      }
      
      if (config.macOSRestriction) {
        enrollmentSettings.push({
          name: "macOS Restrictions",
          value: config.macOSRestriction.platformBlocked ? "Blocked" : "Allowed"
        });
        if (config.macOSRestriction.personalDeviceEnrollmentBlocked !== undefined) {
          enrollmentSettings.push({
            name: "macOS Personal Devices",
            value: config.macOSRestriction.personalDeviceEnrollmentBlocked ? "Blocked" : "Allowed"
          });
        }
      }
      
      if (enrollmentSettings.length > 0) {
        addSettingsTable(enrollmentSettings);
      }
      
      yPosition += 5;
    });
  }
  
  // Return PDF
  return doc.output("arraybuffer");
}