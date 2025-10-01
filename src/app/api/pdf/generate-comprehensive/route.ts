import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import jsPDF from "jspdf";

interface ComprehensiveData {
  settingsCatalog: any[];
  deviceConfigurations: any[];
  administrativeTemplates: any[];
  securityBaselines: any[];
  compliancePolicies: any[];
  scripts: {
    macOS: any[];
    windows: any[];
  };
  appConfigurations: any[];
  windowsUpdatePolicies: any[];
  enrollmentConfigurations: any[];
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data: ComprehensiveData = await request.json();

    // Generate PDF
    const pdfBuffer = await generateComprehensivePDF(data);

    // Return PDF as response
    return new NextResponse(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Intune-Configuration-Documentation-${new Date().toISOString().split("T")[0]}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generating PDF:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}

async function generateComprehensivePDF(data: ComprehensiveData): Promise<Uint8Array> {
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
  const addText = (text: string, fontSize = 12, isBold = false) => {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    
    const lines = doc.splitTextToSize(text, maxWidth);
    
    for (const line of lines) {
      if (yPosition > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;
        addPageNumber();
      }
      doc.text(line, margin, yPosition);
      yPosition += fontSize * 0.4;
    }
    yPosition += lineHeight * 0.5;
  };

  // Add page numbers
  let pageNumber = 1;
  const addPageNumber = () => {
    doc.setFontSize(10);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${pageNumber}`, pageWidth / 2, pageHeight - 10, { align: "center" });
    doc.setTextColor(0, 0, 0);
    pageNumber++;
  };

  // Add section header
  const addSectionHeader = (header: string) => {
    if (yPosition > pageHeight - 30) {
      doc.addPage();
      yPosition = margin;
      addPageNumber();
    }
    yPosition += 5;
    addText(header, 14, true);
    doc.setDrawColor(229, 231, 235);
    doc.line(margin, yPosition - 3, pageWidth - margin, yPosition - 3);
    yPosition += 3;
  };

  // Calculate totals
  const totalConfigs = 
    data.settingsCatalog.length +
    data.deviceConfigurations.length +
    data.administrativeTemplates.length +
    data.securityBaselines.length +
    data.compliancePolicies.length +
    data.scripts.macOS.length +
    data.scripts.windows.length +
    data.appConfigurations.length +
    data.windowsUpdatePolicies.length +
    data.enrollmentConfigurations.length;

  // Cover page
  addPageNumber();
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.text("Intune Configuration", pageWidth / 2, 50, { align: "center" });
  doc.text("Documentation", pageWidth / 2, 65, { align: "center" });
  
  yPosition = 90;
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated on: ${new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })}`, pageWidth / 2, yPosition, { align: "center" });
  doc.setTextColor(0, 0, 0);
  
  yPosition = 120;
  addText("Configuration Summary", 16, true);
  yPosition += 5;
  
  const summaryItems = [
    { label: "Settings Catalog", count: data.settingsCatalog.length },
    { label: "Device Configurations", count: data.deviceConfigurations.length },
    { label: "Administrative Templates", count: data.administrativeTemplates.length },
    { label: "Security Baselines", count: data.securityBaselines.length },
    { label: "Compliance Policies", count: data.compliancePolicies.length },
    { label: "Scripts (Windows)", count: data.scripts.windows.length },
    { label: "Scripts (macOS)", count: data.scripts.macOS.length },
    { label: "App Configuration Policies", count: data.appConfigurations.length },
    { label: "Windows Update Policies", count: data.windowsUpdatePolicies.length },
    { label: "Enrollment Configurations", count: data.enrollmentConfigurations.length },
  ];

  doc.setFontSize(11);
  summaryItems.forEach((item) => {
    if (item.count > 0) {
      doc.setFont("helvetica", "normal");
      doc.text(`${item.label}:`, margin + 10, yPosition);
      doc.setFont("helvetica", "bold");
      doc.text(item.count.toString(), pageWidth - margin - 10, yPosition, { align: "right" });
      yPosition += 8;
    }
  });

  yPosition += 5;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin + 10, yPosition, pageWidth - margin - 10, yPosition);
  yPosition += 8;
  
  doc.setFont("helvetica", "bold");
  doc.text("Total Configurations:", margin + 10, yPosition);
  doc.setFontSize(12);
  doc.text(totalConfigs.toString(), pageWidth - margin - 10, yPosition, { align: "right" });

  // Add configuration details
  const addConfigurationDetails = (configs: any[], title: string, _type: string) => {
    if (configs.length === 0) return;
    
    doc.addPage();
    yPosition = margin;
    addPageNumber();
    addSectionHeader(title);
    
    configs.forEach((config) => {
      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = margin;
        addPageNumber();
      }
      
      // Configuration name
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 64, 175);
      const name = config.displayName || config.name || "Unnamed Configuration";
      const nameLines = doc.splitTextToSize(name, maxWidth);
      nameLines.forEach((line: string) => {
        if (yPosition > pageHeight - margin) {
          doc.addPage();
          yPosition = margin;
          addPageNumber();
        }
        doc.text(line, margin, yPosition);
        yPosition += lineHeight;
      });
      doc.setTextColor(0, 0, 0);
      
      // Description
      if (config.description) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        const descLines = doc.splitTextToSize(config.description, maxWidth);
        descLines.forEach((line: string) => {
          if (yPosition > pageHeight - margin) {
            doc.addPage();
            yPosition = margin;
            addPageNumber();
          }
          doc.text(line, margin, yPosition);
          yPosition += lineHeight * 0.8;
        });
        doc.setTextColor(0, 0, 0);
      }
      
      // Metadata
      doc.setFontSize(9);
      doc.setTextColor(128, 128, 128);
      const metadata = [];
      
      if (config.configType) {
        metadata.push(`Type: ${config.configType}`);
      }
      if (config.platformType || config.platforms) {
        metadata.push(`Platform: ${config.platformType || config.platforms}`);
      }
      if (config.lastModifiedDateTime) {
        metadata.push(`Modified: ${new Date(config.lastModifiedDateTime).toLocaleDateString()}`);
      }
      if (config.version) {
        metadata.push(`Version: ${config.version}`);
      }
      if (config.fileName) {
        metadata.push(`File: ${config.fileName}`);
      }
      
      if (metadata.length > 0) {
        const metadataText = metadata.join(" | ");
        const metadataLines = doc.splitTextToSize(metadataText, maxWidth);
        metadataLines.forEach((line: string) => {
          if (yPosition > pageHeight - margin) {
            doc.addPage();
            yPosition = margin;
            addPageNumber();
          }
          doc.text(line, margin, yPosition);
          yPosition += lineHeight * 0.7;
        });
      }
      doc.setTextColor(0, 0, 0);
      yPosition += lineHeight;
    });
  };

  // Add all configuration sections
  addConfigurationDetails(data.settingsCatalog, "Settings Catalog", "catalog");
  addConfigurationDetails(data.deviceConfigurations, "Device Configurations", "device");
  addConfigurationDetails(data.administrativeTemplates, "Administrative Templates", "admx");
  addConfigurationDetails(data.securityBaselines, "Security Baselines & Endpoint Security", "security");
  addConfigurationDetails(data.compliancePolicies, "Compliance Policies", "compliance");
  
  // Scripts section
  if (data.scripts.windows.length > 0 || data.scripts.macOS.length > 0) {
    doc.addPage();
    yPosition = margin;
    addPageNumber();
    addSectionHeader("Scripts");
    
    if (data.scripts.windows.length > 0) {
      addText("Windows PowerShell Scripts", 12, true);
      addConfigurationDetails(data.scripts.windows, "", "script");
    }
    
    if (data.scripts.macOS.length > 0) {
      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = margin;
        addPageNumber();
      }
      addText("macOS Shell Scripts", 12, true);
      addConfigurationDetails(data.scripts.macOS, "", "script");
    }
  }
  
  addConfigurationDetails(data.appConfigurations, "App Configuration Policies", "app");
  addConfigurationDetails(data.windowsUpdatePolicies, "Windows Update Policies", "update");
  addConfigurationDetails(data.enrollmentConfigurations, "Enrollment Configurations", "enrollment");

  // Return the PDF as a Uint8Array
  return doc.output("arraybuffer");
}