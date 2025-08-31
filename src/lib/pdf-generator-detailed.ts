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
import type { BrandingOptions } from "~/types/branding";

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
  branding?: BrandingOptions;
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
  
  // Extract branding options with defaults
  const branding = data.branding;
  const primaryColor = branding?.colors?.primary || '#003366';
  const secondaryColor = branding?.colors?.secondary || '#0066CC';
  const accentColor = branding?.colors?.accent || '#00A652';
  const textColor = branding?.colors?.text || '#000000';
  
  // Debug log colors
  console.log('PDF Generator - Colors being used:', {
    primary: primaryColor,
    secondary: secondaryColor,
    accent: accentColor,
    text: textColor
  });
  
  // Helper function to convert hex to RGB with proper null checking
  const hexToRgb = (hex: string | undefined): [number, number, number] => {
    if (!hex) return [0, 0, 0];
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result?.[1] && result[2] && result[3]
      ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
      : [0, 0, 0];
  };

  // Helper functions
  const checkPageBreak = (neededSpace = 30) => {
    // Always leave at least 25mm for footer
    const minFooterSpace = 25;
    const totalSpaceNeeded = Math.max(neededSpace, minFooterSpace);
    
    if (yPosition > pageHeight - totalSpaceNeeded) {
      doc.addPage();
      yPosition = margin;
      pageNumber++;
      addPageNumber();
      return true;
    }
    return false;
  };

  const addPageNumber = () => {
    // Add header logo if configured
    if (branding?.logo?.position === 'header' && pageNumber > 1) {
      addLogo('header');
    }
    
    // Add header text if configured
    if (branding?.header?.enabled && branding?.header?.text && pageNumber > 1) {
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text(branding.header.text, pageWidth / 2, 10, { align: "center" });
    }
    
    // Add footer logo if configured
    if (branding?.logo?.position === 'footer') {
      addLogo('footer');
    }
    
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    
    // Add footer text if configured
    if (branding?.footer?.enabled && branding?.footer?.text) {
      doc.text(branding.footer.text, margin, pageHeight - 10);
    }
    
    // Page number
    doc.text(`Page ${pageNumber}`, pageWidth / 2, pageHeight - 10, { align: "center" });
    
    // Add confidentiality notice if configured
    if (branding?.footer?.enabled && branding?.footer?.confidentialityNotice) {
      doc.setFontSize(8);
      doc.text(branding.footer.confidentialityNotice, pageWidth - margin, pageHeight - 10, { align: "right" });
    }
    
    doc.setTextColor(0, 0, 0);
    
    // Add watermark to every page
    addWatermark();
  };

  const addText = (text: string, fontSize = 11, isBold = false, color: [number, number, number] = [0, 0, 0]) => {
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
    const [r, g, b] = hexToRgb(primaryColor);
    doc.setTextColor(r, g, b);
    doc.text(title, margin, yPosition);
    yPosition += 8;
    
    // Add underline with primary color
    doc.setDrawColor(r, g, b);
    doc.setLineWidth(0.5);
    doc.line(margin, yPosition - 2, pageWidth - margin, yPosition - 2);
    const [tr, tg, tb] = hexToRgb(textColor);
    doc.setTextColor(tr, tg, tb);
    yPosition += 3;
  };

  const addConfigHeader = (name: string, assignments: string, createdDate?: string, modifiedDate?: string) => {
    checkPageBreak(25);
    
    // Configuration name with secondary color
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    const [r, g, b] = hexToRgb(secondaryColor);
    doc.setTextColor(r, g, b);
    const nameLines = doc.splitTextToSize(name, maxWidth);
    nameLines.forEach((line: string) => {
      doc.text(line, margin, yPosition);
      yPosition += 6;
    });
    const [tr, tg, tb] = hexToRgb(textColor);
    doc.setTextColor(tr, tg, tb);
    
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
        const lines: string[] = [];
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
    doc.text("Value", margin + (colWidths[0] || 50) + 2, yPosition + 5);
    doc.text("Description", margin + (colWidths[0] || 50) + (colWidths[1] || 65) + 2, yPosition + 5);
    yPosition += 8;
    
    // Table rows
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8); // Slightly smaller font for more content
    
    settings.forEach((setting, index) => {
      // Prepare text for all columns
      const nameLines = doc.splitTextToSize(setting.name, (colWidths[0] || 50) - 4);
      const valueText = setting.value || "Not configured";
      const valueLines = wrapTechnicalString(valueText, (colWidths[1] || 65) - 4);
      const descLines = setting.description 
        ? doc.splitTextToSize(setting.description, (colWidths[2] || 65) - 4)
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
          doc.text(line, margin + (colWidths[0] || 50) + 2, textY);
          textY += 4;
        }
      });
      
      // Description (all lines)
      if (setting.description) {
        textY = yPosition + 4;
        doc.setTextColor(80, 80, 80);
        descLines.forEach((line: string, lineIndex: number) => {
          if (lineIndex < maxLines) {
            doc.text(line, margin + (colWidths[0] || 50) + (colWidths[1] || 65) + 2, textY);
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
  
  // Helper function to add logo with proper sizing
  const addLogo = (position: 'header' | 'footer' | 'cover' | 'watermark', x?: number, y?: number) => {
    // For header/footer, check if logo should appear there
    // For cover, only show if position is 'cover'
    const shouldShowLogo = branding?.logo?.dataUrl && (
      position === 'cover' ? branding?.logo?.position === 'cover' :
      position === 'header' ? branding?.logo?.position === 'header' :
      position === 'footer' ? branding?.logo?.position === 'footer' :
      false
    );
    
    if (shouldShowLogo && branding?.logo?.dataUrl) {
      try {
        const imgData = branding.logo.dataUrl;
        
        // Use fixed maximum dimensions for logos
        let maxWidth = 40;  // Maximum width in mm
        let maxHeight = 40; // Maximum height in mm
        
        // Smaller sizes for header/footer
        if (position === 'header' || position === 'footer') {
          maxWidth = 15;  // Further reduced to ensure it fits
          maxHeight = 15;
        }
        
        // Extract the actual base64 data and format
        let format = 'PNG';
        if (imgData.includes('image/jpeg') || imgData.includes('image/jpg')) {
          format = 'JPEG';
        } else if (imgData.includes('image/png')) {
          format = 'PNG';
        }
        
        if (position === 'cover') {
          const xPos = x || pageWidth / 2 - maxWidth / 2;
          const yPos = y || 20;
          doc.addImage(imgData, format, xPos, yPos, maxWidth, maxHeight);
        } else if (position === 'header') {
          // Logo on the right side of header - ensure it doesn't overflow
          const xPos = x || Math.min(pageWidth - margin - maxWidth, pageWidth - margin - 20);
          const yPos = y || 5;
          doc.addImage(imgData, format, xPos, yPos, maxWidth, maxHeight);
        } else if (position === 'footer') {
          const xPos = x || margin;
          const yPos = y || pageHeight - 25;
          doc.addImage(imgData, format, xPos, yPos, maxWidth, maxHeight);
        }
      } catch (err) {
        console.error('Error adding logo:', err);
      }
    }
  };
  
  // Add watermark function
  const addWatermark = () => {
    if (branding?.watermark?.enabled && branding?.watermark?.text) {
      // Save current state
      const currentFontSize = 12; // Default font size
      
      // Set watermark style
      doc.setFontSize(branding.watermark.fontSize || 50);
      doc.setTextColor(230, 230, 230); // Light gray for watermark
      
      // Add diagonal watermark text
      const watermarkText = branding.watermark.text;
      const angle = branding.watermark.angle || -45;
      
      // Calculate position for centered diagonal text
      const radians = angle * Math.PI / 180;
      const xPos = pageWidth / 2;
      const yPos = pageHeight / 2;
      
      // Add rotated text (jsPDF doesn't support rotation directly, so we'll add it as simple centered text)
      doc.text(watermarkText, xPos, yPos, { align: 'center' });
      
      // Restore previous font size
      doc.setFontSize(currentFontSize);
      doc.setTextColor(0, 0, 0);
    }
  };
  
  // Professional Cover Page Design
  // Log branding data for debugging
  console.log('Branding data received:', {
    hasLogo: !!branding?.logo?.dataUrl,
    logoPosition: branding?.logo?.position,
    companyName: branding?.companyName,
    department: branding?.department,
    colors: branding?.colors,
    coverPage: branding?.coverPage
  });
  
  // Don't add page number on cover
  // addPageNumber();
  
  // Calculate total configurations first
  const totalCount = 
    data.settingsCatalog.length +
    data.deviceConfigurations.length +
    data.administrativeTemplates.length +
    data.compliancePolicies.length +
    data.securityBaselines.length +
    data.scripts.windows.length +
    data.scripts.macOS.length;
  
  // === TOP SECTION: Company/Department Text ===
  const headerY = 20;
  let titleStartY = 70;
  
  // Show company/dept as small text in corners (if provided)
  if (branding?.companyName || branding?.department) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    
    if (branding?.companyName) {
      doc.text(branding.companyName, margin, headerY);
    }
    
    if (branding?.department) {
      doc.text(branding.department, pageWidth - margin, headerY, { align: "right" });
    }
  }
  
  // === LOGO SECTION: Always show logo on title page if available ===
  if (branding?.logo?.dataUrl) {
    // Add logo centered above title - adjusted size
    const logoY = 35;
    const logoWidth = 35;  // Reduced for better fit
    const logoHeight = 35; // Reduced for better fit
    const logoX = (pageWidth / 2) - (logoWidth / 2);
    
    try {
      const imgData = branding.logo.dataUrl;
      let format = 'PNG';
      if (imgData.includes('image/jpeg') || imgData.includes('image/jpg')) {
        format = 'JPEG';
      }
      
      doc.addImage(imgData, format, logoX, logoY, logoWidth, logoHeight);
      titleStartY = logoY + logoHeight + 15; // Position title below logo
    } catch (err) {
      console.error('Error adding logo to title page:', err);
    }
  }
  
  // === COMPLIANCE BADGE (if classification is set) ===
  if (branding?.metadata?.classification) {
    const badgeText = branding.metadata.classification === 'confidential' ? 'CONFIDENTIAL' : 
                     branding.metadata.classification === 'restricted' ? 'RESTRICTED' : 
                     'AUDIT READY';
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    const badgeColor: [number, number, number] = branding.metadata.classification === 'confidential' || 
                      branding.metadata.classification === 'restricted' 
                      ? [220, 38, 38] : [34, 197, 94];
    doc.setTextColor(badgeColor[0], badgeColor[1], badgeColor[2]);
    doc.text(badgeText, pageWidth - margin, headerY + 10, { align: "right" });
  }
  
  // === TITLE SECTION: Document Title ===
  let titleY = titleStartY;
  
  // Main title - Microsoft Intune (largest, bold)
  doc.setFontSize(44);
  doc.setFont("helvetica", "bold");
  const [tr, tg, tb] = hexToRgb(primaryColor);
  doc.setTextColor(tr, tg, tb);
  
  const coverTitle = branding?.coverPage?.title || "Microsoft Intune";
  doc.text(coverTitle, pageWidth / 2, titleY, { align: "center" });
  titleY += 18;
  
  // Subtitle - Configuration Documentation (lighter gray for less emphasis)
  doc.setFontSize(20);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(140, 140, 140); // Lighter gray instead of secondary color
  doc.text("Configuration Documentation", pageWidth / 2, titleY, { align: "center" });
  titleY += 15;
  
  // Tagline - descriptive subtitle
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 120);
  const tagline = branding?.coverPage?.subtitle || "Comprehensive export of Intune policies, profiles, and assignments";
  doc.text(tagline, pageWidth / 2, titleY, { align: "center" });
  titleY += 40;
  
  // === METADATA SECTION: Centered Table ===
  // Position the metadata box in the center of remaining space
  const metadataHeight = 45;
  const metadataWidth = 140; // Narrower for centered look
  const metadataX = (pageWidth - metadataWidth) / 2;
  const metadataY = titleY + 20; // Position it higher, closer to title
  
  // Metadata table background
  doc.setFillColor(248, 250, 252);
  doc.rect(metadataX, metadataY, metadataWidth, metadataHeight, 'F');
  
  // Table border
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.5);
  doc.rect(metadataX, metadataY, metadataWidth, metadataHeight, 'S');
  
  // Table content
  doc.setFontSize(10);
  const tableX = metadataX + 10;
  const labelX = tableX;
  const valueX = tableX + 45; // Adjusted for narrower table
  let tableY = metadataY + 8;
  const tableRowHeight = 8;
  
  // Helper function to add table row (labels bold, values normal)
  const addTableRow = (label: string, value: string) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 60, 60);
    doc.text(label, labelX, tableY);
    
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(value, valueX, tableY);
    
    tableY += tableRowHeight;
  };
  
  // Company/Department row
  if (branding?.companyName || branding?.department) {
    const orgInfo = [branding?.companyName, branding?.department].filter(Boolean).join(' / ');
    addTableRow('Organization:', orgInfo);
  }
  
  // Prepared by row
  const preparedBy = branding?.metadata?.author || branding?.coverPage?.author || 'Intune Documentation Tool';
  addTableRow('Prepared by:', preparedBy);
  
  // Generated on row - Simplified format: "31 Aug 2025 · 15:43"
  const dateTime = new Date();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = dateTime.getDate();
  const month = monthNames[dateTime.getMonth()];
  const year = dateTime.getFullYear();
  const hours = dateTime.getHours().toString().padStart(2, '0');
  const minutes = dateTime.getMinutes().toString().padStart(2, '0');
  const formattedDateTime = `${day} ${month} ${year} · ${hours}:${minutes}`;
  addTableRow('Generated:', formattedDateTime);
  
  // Version row (using date as version)
  const version = `v${year}.${(dateTime.getMonth() + 1).toString().padStart(2, '0')}.${day.toString().padStart(2, '0')}`;
  addTableRow('Version:', version);
  
  // Classification row if provided
  if (branding?.metadata?.classification) {
    doc.setFont("helvetica", "bold");
    const classColor: [number, number, number] = branding.metadata.classification === 'confidential' || branding.metadata.classification === 'restricted' 
      ? [220, 38, 38] : [80, 80, 80];
    doc.setTextColor(classColor[0], classColor[1], classColor[2]);
    doc.text('Classification:', labelX, tableY);
    doc.text(branding.metadata.classification.toUpperCase(), valueX, tableY);
  }
  
  // Page number at the very bottom
  doc.setFontSize(9);
  doc.setTextColor(150, 150, 150);
  doc.text("Page 1", pageWidth / 2, pageHeight - 10, { align: "center" });
  
  // Add watermark if enabled
  addWatermark();
  
  // === TABLE OF CONTENTS ===
  // Track sections and their page numbers for ToC
  const tocEntries: { title: string; pageNum: number }[] = [];
  
  // Check if ToC is enabled (default to true if not specified)
  const includeToC = branding?.documentSettings?.includeTableOfContents !== false;
  
  // Variables for ToC page reference (declared outside if block)
  let tocPageNumber = 0;
  let tocYStart = 0;
  
  if (includeToC) {
    // Add ToC page
    doc.addPage();
    yPosition = margin;
    pageNumber++;
    addPageNumber();
    
    // Save ToC page reference
    tocPageNumber = pageNumber;
    
    // ToC Title
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    const [tocR, tocG, tocB] = hexToRgb(primaryColor);
    doc.setTextColor(tocR, tocG, tocB);
    doc.text("Table of Contents", pageWidth / 2, yPosition + 10, { align: "center" });
    yPosition += 25;
    
    // Decorative line under title
    doc.setDrawColor(tocR, tocG, tocB);
    doc.setLineWidth(0.5);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 15;
    
    // Save ToC content start position
    tocYStart = yPosition;
    
    // We'll fill in the ToC content at the end after collecting all page numbers
  }
  
  // Helper function to add tenant overview with enhanced visuals
  const addTenantOverview = () => {
    // Tenant Overview Page
    doc.addPage();
    yPosition = margin;
    pageNumber++;
    addPageNumber();
    
    // Track this section
    tocEntries.push({ title: "Tenant Overview", pageNum: pageNumber });
    
    // Start directly with Executive Summary
    addSectionHeader("Executive Summary");
    
    // === KEY METRICS WITH VISUAL INDICATORS ===
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Key Metrics", margin, yPosition);
    yPosition += 10;
    
    // Calculate assignment rate
    const assignmentRate = analytics.totalConfigs > 0 ? (analytics.assignedConfigs / analytics.totalConfigs) * 100 : 0;
    
    // Create metrics cards without emoji icons
    const metricsData: Array<{label: string, value: string, color: [number, number, number]}> = [
      { 
        label: "Total Configurations", 
        value: analytics.totalConfigs.toString(),
        color: [52, 152, 219] // Blue
      },
      { 
        label: "Assigned Policies", 
        value: analytics.assignedConfigs.toString(),
        color: [39, 174, 96] // Green
      },
      { 
        label: "Unassigned Policies", 
        value: analytics.unassignedConfigs.toString(),
        color: analytics.unassignedConfigs > 0 ? [230, 126, 34] : [149, 165, 166] // Orange if > 0, gray if 0
      }
    ];
    
    // Draw metrics cards - improved layout
    let cardX = margin;
    const cardWidth = 55;
    const cardHeight = 25;  // Reduced height for cleaner look
    const cardSpacing = 5;
    
    metricsData.forEach((metric) => {
      // Card background with subtle fill
      doc.setFillColor(250, 251, 252);
      doc.rect(cardX, yPosition, cardWidth, cardHeight, 'F');
      
      // Top colored bar instead of full border
      doc.setFillColor(metric.color[0], metric.color[1], metric.color[2]);
      doc.rect(cardX, yPosition, cardWidth, 3, 'F');
      
      // Card border - subtle
      doc.setDrawColor(230, 230, 230);
      doc.setLineWidth(0.5);
      doc.rect(cardX, yPosition, cardWidth, cardHeight, 'S');
      
      // Value - large and prominent
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(metric.color[0], metric.color[1], metric.color[2]);
      doc.text(metric.value, cardX + cardWidth / 2, yPosition + 12, { align: 'center' });
      
      // Label - centered below value
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.text(metric.label, cardX + cardWidth / 2, yPosition + 20, { align: 'center' });
      
      cardX += cardWidth + cardSpacing;
    });
    
    yPosition += cardHeight + 15;
    
    // === ASSIGNMENT RATE VISUALIZATION ===
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Assignment Coverage", margin, yPosition);
    yPosition += 8;
    
    // Progress bar background
    const progressBarWidth = 120;
    const progressBarHeight = 12;
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, yPosition, progressBarWidth, progressBarHeight, 'F');
    
    // Progress bar fill based on assignment rate
    const fillWidth = (assignmentRate / 100) * progressBarWidth;
    const progressColor: [number, number, number] = assignmentRate >= 80 ? [39, 174, 96] : // Green for good
                         assignmentRate >= 60 ? [52, 152, 219] : // Blue for moderate
                         assignmentRate >= 40 ? [230, 126, 34] : // Orange for low
                         [231, 76, 60]; // Red for critical
    
    doc.setFillColor(progressColor[0], progressColor[1], progressColor[2]);
    doc.rect(margin, yPosition, fillWidth, progressBarHeight, 'F');
    
    // Progress bar border
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.rect(margin, yPosition, progressBarWidth, progressBarHeight, 'S');
    
    // Assignment rate text only
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(progressColor[0], progressColor[1], progressColor[2]);
    doc.text(`${Math.round(assignmentRate)}%`, margin + progressBarWidth + 5, yPosition + 8);
    
    yPosition += progressBarHeight + 15;
    
    // === POTENTIAL GAPS SECTION ===
    if (analytics.unassignedConfigs > 0 || analytics.staleConfigs > 0) {
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text("Potential Gaps", margin, yPosition);
      yPosition += 8;
      
      const risks: Array<{level: string, title: string, description: string, color: [number, number, number]}> = [];
      
      if (analytics.unassignedConfigs > 0) {
        const criticalRisk = analytics.unassignedConfigs >= analytics.totalConfigs * 0.3; // 30% threshold
        risks.push({
          level: criticalRisk ? 'critical' : 'warning',
          title: 'Unassigned Configurations',
          description: `${analytics.unassignedConfigs} policies have no group assignments`,
          color: criticalRisk ? [231, 76, 60] as [number, number, number] : [230, 126, 34] as [number, number, number]
        });
      }
      
      if (analytics.staleConfigs > 0) {
        const criticalRisk = analytics.staleConfigs >= analytics.totalConfigs * 0.5; // 50% threshold
        risks.push({
          level: criticalRisk ? 'critical' : 'warning',
          title: 'Stale Configurations',
          description: `${analytics.staleConfigs} policies haven't been updated in 90+ days`,
          color: criticalRisk ? [231, 76, 60] as [number, number, number] : [241, 196, 15] as [number, number, number]
        });
      }
      
      risks.forEach((risk) => {
        // Risk card with left border indicator
        doc.setFillColor(255, 255, 255);
        doc.rect(margin, yPosition, pageWidth - 2 * margin, 18, 'F');
        
        // Left color indicator bar
        doc.setFillColor(risk.color[0], risk.color[1], risk.color[2]);
        doc.rect(margin, yPosition, 3, 18, 'F');
        
        // Card border
        doc.setDrawColor(risk.color[0], risk.color[1], risk.color[2]);
        doc.setLineWidth(0.5);
        doc.rect(margin, yPosition, pageWidth - 2 * margin, 18, 'S');
        
        // Risk level indicator
        doc.setFillColor(risk.color[0], risk.color[1], risk.color[2]);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        const levelText = risk.level.toUpperCase();
        const levelWidth = doc.getTextWidth(levelText) + 4;
        doc.rect(margin + 8, yPosition + 3, levelWidth, 5, 'F');
        doc.text(levelText, margin + 10, yPosition + 6.5);
        
        // Risk title
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(risk.color[0], risk.color[1], risk.color[2]);
        doc.text(risk.title, margin + 15 + levelWidth, yPosition + 7);
        
        // Risk description
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(80, 80, 80);
        doc.text(risk.description, margin + 8, yPosition + 13);
        
        yPosition += 22;
      });
      
      yPosition += 5;
    }
    
    checkPageBreak(80);
  };
  
  // Call the enhanced tenant overview function
  addTenantOverview();
  
  // Continue with existing content but replace the old metrics section
  yPosition += 10;
  
  // === CONFIGURATION INVENTORY WITH ENHANCED FORMATTING ===
  
  // Enhanced table rows without emoji icons - define first
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
  
  // Check if we need to start a new page for Configuration Inventory
  // Calculate total height needed for the table
  const inventoryHeaderHeight = 12 + 10; // Title + table header
  const activeInventoryCount = inventory.filter(item => item.count > 0).length;
  const inventoryRowHeight = 9;
  const inventoryTotalHeight = inventoryHeaderHeight + (activeInventoryCount * inventoryRowHeight) + 20; // +20 for spacing
  
  // Check if table would overlap with footer (leave 30mm for footer to be safe)
  if (yPosition + inventoryTotalHeight > pageHeight - 30) {
    doc.addPage();
    yPosition = margin;
    pageNumber++;
    addPageNumber();
  }
  
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Configuration Inventory", margin, yPosition);
  yPosition += 10;
  
  // Enhanced table header with color
  const tableWidth = 165;
  const [thr, thg, thb] = hexToRgb(primaryColor);
  doc.setFillColor(thr, thg, thb);
  doc.rect(margin, yPosition, tableWidth, 10, "F");
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("Policy Type", margin + 3, yPosition + 7);
  doc.text("Total", margin + 85, yPosition + 7);
  doc.text("Assigned", margin + 110, yPosition + 7);
  doc.text("Unassigned", margin + 140, yPosition + 7);
  yPosition += 10;
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  
  const activeInventory = inventory.filter(item => item.count > 0);
  activeInventory.forEach((item, index) => {
    const rowHeight = 9;
    
    // Check if we're too close to the bottom of the page (leave 30mm for footer to be safe)
    if (yPosition + rowHeight > pageHeight - 30) {
      // Start a new page
      doc.addPage();
      yPosition = margin;
      pageNumber++;
      addPageNumber();
      
      // Redraw table header on new page
      doc.setFillColor(thr, thg, thb);
      doc.rect(margin, yPosition, tableWidth, 10, "F");
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("Policy Type", margin + 3, yPosition + 7);
      doc.text("Total", margin + 85, yPosition + 7);
      doc.text("Assigned", margin + 110, yPosition + 7);
      doc.text("Unassigned", margin + 140, yPosition + 7);
      yPosition += 10;
      
      // Reset text settings
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
    }
    
    // Alternating row backgrounds
    if (index % 2 === 0) {
      doc.setFillColor(248, 249, 250);
      doc.rect(margin, yPosition, tableWidth, rowHeight, "F");
    }
    
    // Row border
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.1);
    doc.line(margin, yPosition + rowHeight, margin + tableWidth, yPosition + rowHeight);
    
    // Policy type
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(item.type, margin + 3, yPosition + 6);
    
    // Total count
    doc.setFont("helvetica", "bold");
    doc.setTextColor(52, 152, 219); // Blue
    doc.text(item.count.toString(), margin + 90, yPosition + 6);
    
    // Assigned count
    doc.setTextColor(39, 174, 96); // Green
    doc.text(item.assigned.toString(), margin + 120, yPosition + 6);
    
    // Unassigned count (red if > 0, gray if 0)
    const unassigned = item.count - item.assigned;
    doc.setTextColor(unassigned > 0 ? 231 : 149, unassigned > 0 ? 76 : 165, unassigned > 0 ? 60 : 166);
    doc.text(unassigned.toString(), margin + 150, yPosition + 6);
    
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    yPosition += rowHeight;
  });
  
  yPosition += 15;
  
  // === PLATFORM COVERAGE CHART ===
  if (Object.keys(analytics.platformCounts).length > 0 || data.deviceCounts) {
    checkPageBreak(60);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Platform Coverage", margin, yPosition);
    yPosition += 10;
    
    // Combine configuration counts with device counts
    const platformData: Record<string, { configs: number, devices: number }> = {};
    
    // Add configuration counts
    Object.entries(analytics.platformCounts).forEach(([platform, count]) => {
      platformData[platform] = { configs: count, devices: 0 };
    });
    
    // Add device counts (normalize OS names to match configuration platforms)
    if (data.deviceCounts) {
      Object.entries(data.deviceCounts).forEach(([os, count]) => {
        const normalizedPlatform = (() => {
          const lower = os.toLowerCase();
          if (lower.includes("windows")) return "Windows";
          if (lower.includes("mac")) return "macOS";
          if (lower.includes("ios")) return "iOS";
          if (lower.includes("android")) return "Android";
          if (lower.includes("linux")) return "Linux";
          return os;
        })();
        
        if (platformData[normalizedPlatform]) {
          platformData[normalizedPlatform].devices += count;
        } else {
          platformData[normalizedPlatform] = { configs: 0, devices: count };
        }
      });
    }
    
    // Sort platforms by total activity
    const sortedPlatforms = Object.entries(platformData)
      .sort((a, b) => (b[1].configs + b[1].devices) - (a[1].configs + a[1].devices))
      .slice(0, 5); // Show top 5 platforms
    
    // Platform colors
    const platformColors: Record<string, [number, number, number]> = {
      'Windows': [52, 152, 219], // Blue
      'macOS': [155, 89, 182],   // Purple
      'iOS': [46, 204, 113],     // Green
      'Android': [230, 126, 34], // Orange
      'Linux': [231, 76, 60],    // Red
    };
    
    // Find maximum value for chart scaling
    const maxConfigs = Math.max(...sortedPlatforms.map(([_, data]) => data.configs), 1);
    const chartWidth = 100;  // Reduced from 120 to fit better
    const barHeight = 14;
    const barSpacing = 5;
    
    sortedPlatforms.forEach(([platform, data], index) => {
      const barY = yPosition + (index * (barHeight + barSpacing));
      
      const color: [number, number, number] = platformColors[platform] || [52, 152, 219];
      
      // Platform name - simple text, no colored box
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      doc.text(platform, margin, barY + 9);
      
      // Background bar - adjusted position since no colored box
      const barStartX = margin + 45;
      doc.setFillColor(245, 245, 245);
      doc.rect(barStartX, barY, chartWidth, barHeight, 'F');
      
      // Data bar (configurations)
      if (data.configs > 0) {
        const barWidth = Math.min((data.configs / maxConfigs) * chartWidth, chartWidth);
        doc.setFillColor(color[0], color[1], color[2]);
        doc.rect(barStartX, barY, barWidth, barHeight, 'F');
      }
      
      // Bar border
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.rect(barStartX, barY, chartWidth, barHeight, 'S');
      
      // Value labels - positioned to right of bar, showing only configs
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(color[0], color[1], color[2]);
      
      // Show only configuration count
      const labelText = `${data.configs} configs`;
      
      // Position text to the right of the bar
      const textX = barStartX + chartWidth + 3;
      doc.text(labelText, textX, barY + 9);
    });
    
    yPosition += (sortedPlatforms.length * (barHeight + barSpacing)) + 15;
  }
  
  // === TOP GROUPS TABLE WITH ENHANCED FORMATTING ===
  if (analytics.topGroups.length > 0) {
    checkPageBreak(80);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Top Assigned Groups", margin, yPosition);
    yPosition += 10;
    
    // Table header - adjusted width to fit page
    const groupTableWidth = pageWidth - 2 * margin;  // Use full available width
    const [gthr, gthg, gthb] = hexToRgb(secondaryColor);
    doc.setFillColor(gthr, gthg, gthb);
    doc.rect(margin, yPosition, groupTableWidth, 9, "F");
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("Rank", margin + 3, yPosition + 6);
    doc.text("Group Name", margin + 20, yPosition + 6);
    doc.text("Assignments", margin + 95, yPosition + 6);
    doc.text("Platforms", margin + 135, yPosition + 6);
    yPosition += 9;
    
    // Group data rows
    const topGroupsData = analytics.topGroups.slice(0, 5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    
    topGroupsData.forEach(([groupId, count], index) => {
      const rowHeight = 10;
      
      // Alternating row backgrounds
      if (index % 2 === 0) {
        doc.setFillColor(248, 249, 250);
        doc.rect(margin, yPosition, groupTableWidth, rowHeight, "F");
      }
      
      // Row border
      doc.setDrawColor(230, 230, 230);
      doc.setLineWidth(0.1);
      doc.line(margin, yPosition + rowHeight, margin + groupTableWidth, yPosition + rowHeight);
      
      // Rank number with colored background for top 3
      if (index < 3) {
        const rankColors: Array<[number, number, number]> = [
          [255, 215, 0],  // Gold
          [192, 192, 192], // Silver
          [205, 127, 50]  // Bronze
        ];
        const rankColor = rankColors[index]!;
        doc.setFillColor(rankColor[0], rankColor[1], rankColor[2]);
        doc.circle(margin + 6, yPosition + 5, 3, 'F');
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text((index + 1).toString(), margin + 6, yPosition + 6.5, { align: 'center' });
      } else {
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        doc.text(`${index + 1}.`, margin + 3, yPosition + 6);
      }
      
      // Group name (truncate if too long)
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
      const groupName = data.groupNames?.get(groupId) || groupId;
      // Calculate max width for group name to avoid overflow
      const maxNameWidth = 70;  // Reduced to ensure it fits
      const nameLines = doc.splitTextToSize(groupName, maxNameWidth);
      doc.text(nameLines[0], margin + 20, yPosition + 6);
      
      // Assignment count with visual indicator
      const barMaxWidth = 18;  // Slightly reduced
      const barWidth = Math.min((count / Math.max(...analytics.topGroups.map(g => g[1]))) * barMaxWidth, barMaxWidth);
      const barColor: [number, number, number] = count >= 10 ? [39, 174, 96] :  // Green for high activity
                      count >= 5 ? [52, 152, 219] :    // Blue for moderate
                      [230, 126, 34];                  // Orange for low
      
      // Small bar chart
      doc.setFillColor(240, 240, 240);
      doc.rect(margin + 95, yPosition + 3, barMaxWidth, 4, 'F');
      doc.setFillColor(barColor[0], barColor[1], barColor[2]);
      doc.rect(margin + 95, yPosition + 3, barWidth, 4, 'F');
      
      // Count number
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(barColor[0], barColor[1], barColor[2]);
      doc.text(count.toString(), margin + 115, yPosition + 6);
      
      // Platform indicator
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(8);
      doc.text('Multi', margin + 140, yPosition + 6);
      
      doc.setTextColor(0, 0, 0);
      yPosition += rowHeight;
    });
    
    yPosition += 15;
  }
  
  // Settings Catalog Section
  if (data.settingsCatalog.length > 0) {
    doc.addPage();
    yPosition = margin;
    pageNumber++;
    addPageNumber();
    tocEntries.push({ title: "Settings Catalog Policies", pageNum: pageNumber });
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
    tocEntries.push({ title: "Device Configurations", pageNum: pageNumber });
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
    tocEntries.push({ title: "Administrative Templates", pageNum: pageNumber });
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
    tocEntries.push({ title: "Compliance Policies", pageNum: pageNumber });
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
    tocEntries.push({ title: "Security Baselines", pageNum: pageNumber });
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
    tocEntries.push({ title: "Scripts", pageNum: pageNumber });
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
    tocEntries.push({ title: "App Configuration Policies", pageNum: pageNumber });
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
    tocEntries.push({ title: "Windows Update Policies", pageNum: pageNumber });
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
    tocEntries.push({ title: "Enrollment Configurations", pageNum: pageNumber });
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
  
  // === RENDER TABLE OF CONTENTS ===
  // Now go back and fill in the ToC if it was included
  if (includeToC && tocEntries.length > 0) {
    // Save current page
    const currentPage = doc.internal.getCurrentPageInfo().pageNumber;
    
    // Go back to ToC page (page 2, after title page)
    doc.setPage(tocPageNumber);
    
    // Reset position for ToC content
    yPosition = tocYStart;
    
    // ToC entries styling
    doc.setFontSize(11);
    // const dotLeaderWidth = pageWidth - 2 * margin - 80; // Space for dots (unused)
    
    tocEntries.forEach((entry, index) => {
      // Check if we need a new page for ToC
      if (yPosition > pageHeight - 30) {
        doc.addPage();
        yPosition = margin;
        doc.setFontSize(11);
      }
      
      // Section number
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      const sectionNum = `${index + 1}.`;
      doc.text(sectionNum, margin, yPosition);
      
      // Section title
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      doc.text(entry.title, margin + 10, yPosition);
      
      // Calculate position for dots and page number
      const titleWidth = doc.getTextWidth(entry.title);
      const pageNumText = entry.pageNum.toString();
      const pageNumWidth = doc.getTextWidth(pageNumText);
      
      // Draw dot leader
      const dotsStartX = margin + 10 + titleWidth + 5;
      const dotsEndX = pageWidth - margin - pageNumWidth - 5;
      const dotSpacing = 3;
      doc.setFillColor(180, 180, 180);
      
      for (let x = dotsStartX; x < dotsEndX; x += dotSpacing) {
        doc.circle(x, yPosition - 1, 0.3, 'F');
      }
      
      // Page number
      doc.setFont("helvetica", "bold");
      const [pnr, png, pnb] = hexToRgb(primaryColor);
      doc.setTextColor(pnr, png, pnb);
      doc.text(pageNumText, pageWidth - margin, yPosition, { align: "right" });
      
      yPosition += 8;
    });
    
    // Return to the page we were on
    doc.setPage(currentPage);
  }
  
  // Return PDF
  return doc.output("arraybuffer");
}