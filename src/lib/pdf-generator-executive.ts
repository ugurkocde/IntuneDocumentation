import jsPDF from "jspdf";
import {
  generateComplianceSummary,
  SECURITY_CONTROLS,
  identifySecurityControls,
  getComplianceMappings
} from "./compliance-mapper";

interface ExecutiveSummaryData {
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
}

export async function generateExecutiveSummaryPDF(data: ExecutiveSummaryData): Promise<Uint8Array> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  let yPosition = 20;
  const pageHeight = doc.internal.pageSize.height;
  const pageWidth = doc.internal.pageSize.width;
  const margin = 15;
  const maxWidth = pageWidth - 2 * margin;
  let pageNumber = 1;

  // Combine all configurations
  const allConfigurations = [
    ...data.settingsCatalog,
    ...data.deviceConfigurations,
    ...data.administrativeTemplates,
    ...data.compliancePolicies,
    ...data.securityBaselines,
    ...data.scripts.windows,
    ...data.scripts.macOS,
    ...(data.appConfigurations || []),
    ...(data.windowsUpdatePolicies || []),
    ...(data.enrollmentConfigurations || [])
  ];

  // Generate compliance summary
  const complianceSummary = generateComplianceSummary(allConfigurations);

  // Helper functions
  const checkPageBreak = (neededSpace = 30) => {
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

  const addSectionHeader = (title: string, level: 1 | 2 = 1) => {
    checkPageBreak(20);
    yPosition += level === 1 ? 5 : 3;
    doc.setFontSize(level === 1 ? 16 : 14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 51, 102);
    doc.text(title, margin, yPosition);
    yPosition += level === 1 ? 10 : 8;
    
    // Add underline for level 1 headers
    if (level === 1) {
      doc.setDrawColor(0, 51, 102);
      doc.setLineWidth(0.5);
      doc.line(margin, yPosition - 2, pageWidth - margin, yPosition - 2);
      yPosition += 3;
    }
    doc.setTextColor(0, 0, 0);
  };

  const addText = (text: string, fontSize = 11, isBold = false) => {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    const lines = doc.splitTextToSize(text, maxWidth);
    
    for (const line of lines) {
      checkPageBreak();
      doc.text(line, margin, yPosition);
      yPosition += fontSize * 0.45;
    }
  };

  const addBulletPoint = (text: string, indent = 5) => {
    checkPageBreak();
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("•", margin + indent, yPosition);
    const lines = doc.splitTextToSize(text, maxWidth - indent - 5);
    lines.forEach((line: string, index: number) => {
      if (index > 0) checkPageBreak();
      doc.text(line, margin + indent + 5, yPosition);
      yPosition += 5;
    });
  };

  const drawProgressBar = (x: number, y: number, width: number, height: number, percentage: number, color: [number, number, number]) => {
    // Background
    doc.setFillColor(240, 240, 240);
    doc.rect(x, y, width, height, "F");
    
    // Progress
    doc.setFillColor(...color);
    doc.rect(x, y, width * (percentage / 100), height, "F");
    
    // Border
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.1);
    doc.rect(x, y, width, height, "S");
    
    // Percentage text
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text(`${percentage}%`, x + width + 3, y + height - 1);
  };

  // Cover Page
  addPageNumber();
  doc.setFontSize(32);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 51, 102);
  doc.text("Executive Summary", pageWidth / 2, 50, { align: "center" });
  
  doc.setFontSize(20);
  doc.text("Intune Security & Compliance", pageWidth / 2, 65, { align: "center" });
  
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, 85, { align: "center" });
  
  // Key Metrics Box
  yPosition = 110;
  doc.setFillColor(245, 245, 250);
  doc.rect(margin, yPosition, maxWidth, 60, "F");
  doc.setTextColor(0, 0, 0);
  
  // Metrics
  const metrics = [
    { label: "Total Configurations", value: complianceSummary.totalConfigurations.toString() },
    { label: "Security Controls", value: `${Object.values(complianceSummary.coveredControls).filter(c => c.covered).length}/${Object.keys(SECURITY_CONTROLS).length}` },
    { label: "Device Groups", value: countUniqueGroups(allConfigurations).toString() },
    { label: "Platforms", value: countUniquePlatforms(allConfigurations).join(", ") }
  ];

  let xPos = margin + 10;
  const columnWidth = (maxWidth - 20) / 4;
  
  metrics.forEach(metric => {
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 102, 204);
    doc.text(metric.value, xPos, yPosition + 20);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(metric.label, xPos, yPosition + 28);
    
    xPos += columnWidth;
  });

  // Compliance Framework Coverage
  yPosition = 190;
  addSectionHeader("Compliance Framework Coverage");
  
  const frameworks = [
    { name: "ISO 27001", data: complianceSummary.frameworkCoverage.ISO27001, color: [0, 123, 255] as [number, number, number] },
    { name: "SOC 2", data: complianceSummary.frameworkCoverage.SOC2, color: [40, 167, 69] as [number, number, number] },
    { name: "NIST", data: complianceSummary.frameworkCoverage.NIST, color: [255, 193, 7] as [number, number, number] },
    { name: "BSI", data: complianceSummary.frameworkCoverage.BSI, color: [220, 53, 69] as [number, number, number] }
  ];

  frameworks.forEach(framework => {
    checkPageBreak(15);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(framework.name, margin, yPosition);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`(${framework.data.covered.length}/${framework.data.total} controls)`, margin + 30, yPosition);
    doc.setTextColor(0, 0, 0);
    yPosition += 2;
    
    drawProgressBar(margin, yPosition, 100, 6, framework.data.percentage, framework.color);
    yPosition += 12;
  });

  // New page for Security Controls
  doc.addPage();
  yPosition = margin;
  pageNumber++;
  addPageNumber();
  addSectionHeader("Security Control Coverage");

  // Security controls table
  const controlsData = Object.entries(complianceSummary.coveredControls)
    .filter(([key]) => SECURITY_CONTROLS[key]) // Filter out any undefined controls
    .map(([key, data]) => ({
      name: SECURITY_CONTROLS[key]!.name,
      status: data.covered ? "✓" : "✗",
      covered: data.covered,
      configurations: data.configurations.length,
      platforms: data.platforms
    }));

  // Group by covered/not covered
  const coveredControls = controlsData.filter(c => c.covered);
  const uncoveredControls = controlsData.filter(c => !c.covered);

  addSectionHeader("Implemented Controls", 2);
  
  if (coveredControls.length > 0) {
    coveredControls.forEach(control => {
      checkPageBreak(10);
      doc.setFontSize(10);
      doc.setTextColor(40, 167, 69);
      doc.text("✓", margin, yPosition);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text(control.name, margin + 8, yPosition);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text(`(${control.configurations} configurations, ${control.platforms.join(", ")})`, margin + 8, yPosition + 4);
      doc.setTextColor(0, 0, 0);
      yPosition += 8;
    });
  } else {
    addText("No controls implemented", 10, false);
  }

  yPosition += 5;
  addSectionHeader("Missing Controls", 2);
  
  if (uncoveredControls.length > 0) {
    uncoveredControls.forEach(control => {
      checkPageBreak(8);
      doc.setFontSize(10);
      doc.setTextColor(220, 53, 69);
      doc.text("✗", margin, yPosition);
      doc.setTextColor(0, 0, 0);
      doc.text(control.name, margin + 8, yPosition);
      yPosition += 6;
    });
  } else {
    addText("All controls implemented", 10, false);
  }

  // Configuration by Type Summary
  doc.addPage();
  yPosition = margin;
  pageNumber++;
  addPageNumber();
  addSectionHeader("Configuration Distribution");

  const configTypes = [
    { name: "Settings Catalog", count: data.settingsCatalog.length },
    { name: "Device Configurations", count: data.deviceConfigurations.length },
    { name: "Administrative Templates", count: data.administrativeTemplates.length },
    { name: "Security Baselines", count: data.securityBaselines.length },
    { name: "Compliance Policies", count: data.compliancePolicies.length },
    { name: "Windows Scripts", count: data.scripts.windows.length },
    { name: "macOS Scripts", count: data.scripts.macOS.length },
    { name: "App Configurations", count: data.appConfigurations?.length || 0 },
    { name: "Update Policies", count: data.windowsUpdatePolicies?.length || 0 },
    { name: "Enrollment Configs", count: data.enrollmentConfigurations?.length || 0 }
  ].filter(type => type.count > 0);

  const maxCount = Math.max(...configTypes.map(t => t.count));
  
  configTypes.forEach(type => {
    checkPageBreak(10);
    doc.setFontSize(10);
    doc.text(type.name, margin, yPosition);
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(type.count.toString(), margin + 60, yPosition);
    doc.setTextColor(0, 0, 0);
    
    // Bar chart
    const barWidth = (type.count / maxCount) * 80;
    doc.setFillColor(0, 123, 255);
    doc.rect(margin + 70, yPosition - 3, barWidth, 4, "F");
    
    yPosition += 7;
  });

  // Key Recommendations
  yPosition += 10;
  addSectionHeader("Key Recommendations");
  
  const recommendations = generateRecommendations(complianceSummary);
  recommendations.forEach(rec => {
    addBulletPoint(rec);
  });

  // Group Assignment Summary
  if (data.groupNames && data.groupNames.size > 0) {
    checkPageBreak(40);
    yPosition += 5;
    addSectionHeader("Device Group Coverage");
    
    const groupCoverage = analyzeGroupCoverage(allConfigurations, data.groupNames);
    let groupCount = 0;
    
    for (const [groupId, groupData] of groupCoverage.entries()) {
      if (groupCount >= 10) break; // Limit to top 10 groups
      checkPageBreak(8);
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(groupData.name, margin, yPosition);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text(`${groupData.configCount} configurations`, margin + 80, yPosition);
      doc.setTextColor(0, 0, 0);
      yPosition += 6;
      groupCount++;
    }
  }

  return new Uint8Array(doc.output("arraybuffer"));
}

// Helper functions
function countUniqueGroups(configurations: any[]): number {
  const groups = new Set<string>();
  
  configurations.forEach(config => {
    if (config.assignments) {
      config.assignments.forEach((assignment: any) => {
        if (assignment.target?.groupId) {
          groups.add(assignment.target.groupId);
        }
      });
    }
  });
  
  return groups.size;
}

function countUniquePlatforms(configurations: any[]): string[] {
  const platforms = new Set<string>();
  
  configurations.forEach(config => {
    if (config.platforms) {
      platforms.add(config.platforms);
    } else if (config.platformType) {
      platforms.add(config.platformType);
    } else if (config["@odata.type"]) {
      if (config["@odata.type"].includes("windows")) platforms.add("Windows");
      else if (config["@odata.type"].includes("mac")) platforms.add("macOS");
      else if (config["@odata.type"].includes("ios")) platforms.add("iOS");
      else if (config["@odata.type"].includes("android")) platforms.add("Android");
    }
  });
  
  return Array.from(platforms);
}

function generateRecommendations(summary: any): string[] {
  const recommendations: string[] = [];
  
  // Check for missing critical controls
  const criticalControls = ["diskEncryption", "antimalware", "firewall", "passwordPolicy"];
  criticalControls.forEach(control => {
    if (!summary.coveredControls[control]?.covered && SECURITY_CONTROLS[control]) {
      recommendations.push(`Implement ${SECURITY_CONTROLS[control].name} to enhance security posture`);
    }
  });
  
  // Check compliance coverage
  if (summary.frameworkCoverage.ISO27001.percentage < 80) {
    recommendations.push(`Increase ISO 27001 coverage (currently ${summary.frameworkCoverage.ISO27001.percentage}%)`);
  }
  
  if (summary.frameworkCoverage.SOC2.percentage < 80) {
    recommendations.push(`Improve SOC 2 compliance coverage (currently ${summary.frameworkCoverage.SOC2.percentage}%)`);
  }
  
  // Check for system updates
  if (!summary.coveredControls.systemUpdates?.covered) {
    recommendations.push("Configure automatic system update policies for all platforms");
  }
  
  // Check for audit logging
  if (!summary.coveredControls.auditLogging?.covered) {
    recommendations.push("Enable comprehensive audit logging for compliance requirements");
  }
  
  if (recommendations.length === 0) {
    recommendations.push("Security configuration meets recommended baseline standards");
  }
  
  return recommendations.slice(0, 5); // Limit to 5 recommendations
}

function analyzeGroupCoverage(configurations: any[], groupNames: Map<string, string>): Map<string, {name: string, configCount: number}> {
  const groupCoverage = new Map<string, {name: string, configCount: number}>();
  
  configurations.forEach(config => {
    if (config.assignments) {
      config.assignments.forEach((assignment: any) => {
        if (assignment.target?.groupId) {
          const groupId = assignment.target.groupId;
          const groupName = groupNames.get(groupId) || `Group ${groupId}`;
          
          if (!groupCoverage.has(groupId)) {
            groupCoverage.set(groupId, { name: groupName, configCount: 0 });
          }
          
          groupCoverage.get(groupId)!.configCount++;
        }
      });
    }
  });
  
  // Sort by config count
  return new Map([...groupCoverage.entries()].sort((a, b) => b[1].configCount - a[1].configCount));
}