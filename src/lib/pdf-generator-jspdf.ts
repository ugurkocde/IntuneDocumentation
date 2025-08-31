import jsPDF from "jspdf";
import type {
  DeviceConfiguration,
  CompliancePolicy,
  AppProtectionPolicy,
  ConditionalAccessPolicy,
  EnrollmentRestriction,
} from "./graph-client";

interface PdfGenerationData {
  deviceConfigurations: DeviceConfiguration[];
  compliancePolicies: CompliancePolicy[];
  appProtectionPolicies: AppProtectionPolicy[];
  conditionalAccessPolicies: ConditionalAccessPolicy[];
  enrollmentRestrictions: EnrollmentRestriction[];
}

export async function generatePDF(data: PdfGenerationData): Promise<Uint8Array> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  let yPosition = 20;
  const pageHeight = doc.internal.pageSize.height;
  const pageWidth = doc.internal.pageSize.width;
  const margin = 20;
  const lineHeight = 7;
  const maxWidth = pageWidth - 2 * margin;

  // Helper function to add text with automatic page breaks
  const addText = (text: string, fontSize: number = 12, isBold: boolean = false) => {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    
    const lines = doc.splitTextToSize(text, maxWidth);
    
    for (const line of lines) {
      if (yPosition > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;
      }
      doc.text(line, margin, yPosition);
      yPosition += fontSize * 0.4;
    }
    yPosition += lineHeight * 0.5;
  };

  // Add title function
  const addTitle = (title: string) => {
    if (yPosition > pageHeight - 40) {
      doc.addPage();
      yPosition = margin;
    }
    addText(title, 18, true);
    yPosition += 5;
  };

  // Add section header
  const addSectionHeader = (header: string) => {
    if (yPosition > pageHeight - 30) {
      doc.addPage();
      yPosition = margin;
    }
    yPosition += 5;
    addText(header, 14, true);
    doc.setDrawColor(229, 231, 235);
    doc.line(margin, yPosition - 3, pageWidth - margin, yPosition - 3);
    yPosition += 3;
  };

  // Calculate totals
  const totalConfigs =
    data.deviceConfigurations.length +
    data.compliancePolicies.length +
    data.appProtectionPolicies.length +
    data.conditionalAccessPolicies.length +
    data.enrollmentRestrictions.length;

  // Cover page
  addTitle("Intune Configuration Documentation");
  yPosition += 10;
  
  addText(`Generated on: ${new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })}`, 12, false);
  
  yPosition += 15;
  addText("Configuration Summary", 16, true);
  yPosition += 5;
  
  addText(`Total Configurations: ${totalConfigs}`, 12, false);
  addText(`Device Configurations: ${data.deviceConfigurations.length}`, 12, false);
  addText(`Compliance Policies: ${data.compliancePolicies.length}`, 12, false);
  addText(`App Protection Policies: ${data.appProtectionPolicies.length}`, 12, false);
  addText(`Conditional Access Policies: ${data.conditionalAccessPolicies.length}`, 12, false);
  addText(`Enrollment Restrictions: ${data.enrollmentRestrictions.length}`, 12, false);

  // Device Configurations
  if (data.deviceConfigurations.length > 0) {
    doc.addPage();
    yPosition = margin;
    addSectionHeader("Device Configurations");
    
    data.deviceConfigurations.forEach((config) => {
      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = margin;
      }
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 64, 175); // Blue color
      doc.text(config.displayName || "Unnamed Configuration", margin, yPosition);
      doc.setTextColor(0, 0, 0); // Reset to black
      yPosition += lineHeight;
      
      if (config.description) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        const descLines = doc.splitTextToSize(config.description, maxWidth);
        descLines.forEach((line: string) => {
          if (yPosition > pageHeight - margin) {
            doc.addPage();
            yPosition = margin;
          }
          doc.text(line, margin, yPosition);
          yPosition += lineHeight * 0.8;
        });
      }
      
      // Metadata
      doc.setFontSize(9);
      doc.setTextColor(128, 128, 128);
      const metadata = [];
      if (config.lastModifiedDateTime) {
        metadata.push(`Modified: ${new Date(config.lastModifiedDateTime).toLocaleDateString()}`);
      }
      if (config.version) {
        metadata.push(`Version: ${config.version}`);
      }
      if (metadata.length > 0) {
        doc.text(metadata.join(" | "), margin, yPosition);
        yPosition += lineHeight;
      }
      doc.setTextColor(0, 0, 0);
      yPosition += lineHeight;
    });
  }

  // Compliance Policies
  if (data.compliancePolicies.length > 0) {
    doc.addPage();
    yPosition = margin;
    addSectionHeader("Compliance Policies");
    
    data.compliancePolicies.forEach((policy) => {
      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = margin;
      }
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 64, 175);
      doc.text(policy.displayName || "Unnamed Policy", margin, yPosition);
      doc.setTextColor(0, 0, 0);
      yPosition += lineHeight;
      
      if (policy.description) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        const descLines = doc.splitTextToSize(policy.description, maxWidth);
        descLines.forEach((line: string) => {
          if (yPosition > pageHeight - margin) {
            doc.addPage();
            yPosition = margin;
          }
          doc.text(line, margin, yPosition);
          yPosition += lineHeight * 0.8;
        });
      }
      
      doc.setFontSize(9);
      doc.setTextColor(128, 128, 128);
      const metadata = [];
      if (policy.lastModifiedDateTime) {
        metadata.push(`Modified: ${new Date(policy.lastModifiedDateTime).toLocaleDateString()}`);
      }
      if (policy.version) {
        metadata.push(`Version: ${policy.version}`);
      }
      if (metadata.length > 0) {
        doc.text(metadata.join(" | "), margin, yPosition);
        yPosition += lineHeight;
      }
      doc.setTextColor(0, 0, 0);
      yPosition += lineHeight;
    });
  }

  // App Protection Policies
  if (data.appProtectionPolicies.length > 0) {
    doc.addPage();
    yPosition = margin;
    addSectionHeader("App Protection Policies");
    
    data.appProtectionPolicies.forEach((policy) => {
      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = margin;
      }
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 64, 175);
      doc.text(policy.displayName || "Unnamed Policy", margin, yPosition);
      doc.setTextColor(0, 0, 0);
      yPosition += lineHeight;
      
      if (policy.description) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        const descLines = doc.splitTextToSize(policy.description, maxWidth);
        descLines.forEach((line: string) => {
          if (yPosition > pageHeight - margin) {
            doc.addPage();
            yPosition = margin;
          }
          doc.text(line, margin, yPosition);
          yPosition += lineHeight * 0.8;
        });
      }
      
      doc.setFontSize(9);
      doc.setTextColor(128, 128, 128);
      const metadata = [];
      if (policy.lastModifiedDateTime) {
        metadata.push(`Modified: ${new Date(policy.lastModifiedDateTime).toLocaleDateString()}`);
      }
      if (policy.version) {
        metadata.push(`Version: ${policy.version}`);
      }
      if (metadata.length > 0) {
        doc.text(metadata.join(" | "), margin, yPosition);
        yPosition += lineHeight;
      }
      doc.setTextColor(0, 0, 0);
      yPosition += lineHeight;
    });
  }

  // Conditional Access Policies
  if (data.conditionalAccessPolicies.length > 0) {
    doc.addPage();
    yPosition = margin;
    addSectionHeader("Conditional Access Policies");
    
    data.conditionalAccessPolicies.forEach((policy) => {
      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = margin;
      }
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 64, 175);
      doc.text(policy.displayName || "Unnamed Policy", margin, yPosition);
      doc.setTextColor(0, 0, 0);
      yPosition += lineHeight;
      
      doc.setFontSize(9);
      doc.setTextColor(128, 128, 128);
      const metadata = [];
      if (policy.state) {
        metadata.push(`State: ${policy.state}`);
      }
      if (policy.modifiedDateTime) {
        metadata.push(`Modified: ${new Date(policy.modifiedDateTime).toLocaleDateString()}`);
      }
      if (metadata.length > 0) {
        doc.text(metadata.join(" | "), margin, yPosition);
        yPosition += lineHeight;
      }
      doc.setTextColor(0, 0, 0);
      yPosition += lineHeight;
    });
  }

  // Enrollment Restrictions
  if (data.enrollmentRestrictions.length > 0) {
    doc.addPage();
    yPosition = margin;
    addSectionHeader("Enrollment Restrictions");
    
    data.enrollmentRestrictions.forEach((restriction) => {
      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = margin;
      }
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 64, 175);
      doc.text(restriction.displayName || "Unnamed Restriction", margin, yPosition);
      doc.setTextColor(0, 0, 0);
      yPosition += lineHeight;
      
      if (restriction.description) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        const descLines = doc.splitTextToSize(restriction.description, maxWidth);
        descLines.forEach((line: string) => {
          if (yPosition > pageHeight - margin) {
            doc.addPage();
            yPosition = margin;
          }
          doc.text(line, margin, yPosition);
          yPosition += lineHeight * 0.8;
        });
      }
      
      doc.setFontSize(9);
      doc.setTextColor(128, 128, 128);
      const metadata = [];
      if (restriction.priority !== undefined) {
        metadata.push(`Priority: ${restriction.priority}`);
      }
      if (restriction.lastModifiedDateTime) {
        metadata.push(`Modified: ${new Date(restriction.lastModifiedDateTime).toLocaleDateString()}`);
      }
      if (restriction.version) {
        metadata.push(`Version: ${restriction.version}`);
      }
      if (metadata.length > 0) {
        doc.text(metadata.join(" | "), margin, yPosition);
        yPosition += lineHeight;
      }
      doc.setTextColor(0, 0, 0);
      yPosition += lineHeight;
    });
  }

  // Return the PDF as a Uint8Array
  return doc.output("arraybuffer");
}