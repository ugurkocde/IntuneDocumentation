import { useState } from "react";
import type { ExportFormat, ExportConfig, ExportResult, PolicyExportError } from "~/components/export-modal";

export interface ExportProgress {
  stage: number;
  progress: number;
  message?: string;
}

interface UseExportHandlerProps {
  configurations: any;
  selectedConfigs: Set<string>;
  brandingOptions: any;
  includeCA: boolean;
  caConsentStatus: string;
  getAccessToken: () => Promise<string>;
  onProgress?: (progress: ExportProgress) => void;
}

export function useExportHandler({
  configurations,
  selectedConfigs,
  brandingOptions,
  includeCA,
  caConsentStatus,
  getAccessToken,
  onProgress,
}: UseExportHandlerProps) {
  const [showExportModal, setShowExportModal] = useState(false);

  // Build export config with selected policy counts
  const getExportConfig = (): ExportConfig => {
    const policyTypes: { name: string; count: number }[] = [];

    const catalogCount = configurations?.settingsCatalog?.filter((c: any) =>
      selectedConfigs.has(`catalog-${c.id}`)
    ).length || 0;
    if (catalogCount > 0) policyTypes.push({ name: "Settings Catalog", count: catalogCount });

    const deviceCount = configurations?.deviceConfigurations?.filter((c: any) =>
      selectedConfigs.has(`device-${c.id}`)
    ).length || 0;
    if (deviceCount > 0) policyTypes.push({ name: "Device Configurations", count: deviceCount });

    const admxCount = configurations?.administrativeTemplates?.filter((c: any) =>
      selectedConfigs.has(`admx-${c.id}`)
    ).length || 0;
    if (admxCount > 0) policyTypes.push({ name: "Administrative Templates", count: admxCount });

    const securityCount = configurations?.securityBaselines?.filter((c: any) =>
      selectedConfigs.has(`security-${c.id}`)
    ).length || 0;
    if (securityCount > 0) policyTypes.push({ name: "Security Baselines", count: securityCount });

    const complianceCount = configurations?.compliancePolicies?.filter((c: any) =>
      selectedConfigs.has(`compliance-${c.id}`)
    ).length || 0;
    if (complianceCount > 0) policyTypes.push({ name: "Compliance Policies", count: complianceCount });

    const appProtectionCount = configurations?.appProtectionPolicies?.filter((c: any) =>
      selectedConfigs.has(`app-protection-${c.id}`)
    ).length || 0;
    if (appProtectionCount > 0) policyTypes.push({ name: "App Protection Policies", count: appProtectionCount });

    const scriptWinCount = configurations?.scripts?.windows?.filter((c: any) =>
      selectedConfigs.has(`script-win-${c.id}`)
    ).length || 0;
    const scriptMacCount = configurations?.scripts?.macOS?.filter((c: any) =>
      selectedConfigs.has(`script-mac-${c.id}`)
    ).length || 0;
    if (scriptWinCount + scriptMacCount > 0) {
      policyTypes.push({ name: "Scripts", count: scriptWinCount + scriptMacCount });
    }

    const appCount = configurations?.appConfigurations?.filter((c: any) =>
      selectedConfigs.has(`app-${c.id}`)
    ).length || 0;
    if (appCount > 0) policyTypes.push({ name: "App Configurations", count: appCount });

    const updateCount = configurations?.windowsUpdatePolicies?.filter((c: any) =>
      selectedConfigs.has(`update-${c.id}`)
    ).length || 0;
    if (updateCount > 0) policyTypes.push({ name: "Windows Update Policies", count: updateCount });

    const enrollmentCount = configurations?.enrollmentConfigurations?.filter((c: any) =>
      selectedConfigs.has(`enrollment-${c.id}`)
    ).length || 0;
    if (enrollmentCount > 0) policyTypes.push({ name: "Enrollment Configurations", count: enrollmentCount });

    const caCount = (includeCA && caConsentStatus === 'included')
      ? (configurations?.conditionalAccessPolicies?.filter((c: any) =>
          selectedConfigs.has(`ca-${c.id}`)
        ).length || 0)
      : 0;
    if (caCount > 0) policyTypes.push({ name: "Conditional Access Policies", count: caCount });

    return {
      selectedCount: selectedConfigs.size,
      policyTypes,
    };
  };

  const handleExport = async (format: ExportFormat): Promise<ExportResult> => {
    try {
      const accessToken = await getAccessToken();

      // Stage 0: Preparing data
      onProgress?.({ stage: 0, progress: 5, message: "Preparing export data..." });

      const selectedData = {
        settingsCatalog: configurations?.settingsCatalog?.filter((c: any) =>
          selectedConfigs.has(`catalog-${c.id}`)
        ) ?? [],
        deviceConfigurations: configurations?.deviceConfigurations?.filter((c: any) =>
          selectedConfigs.has(`device-${c.id}`)
        ) ?? [],
        administrativeTemplates: configurations?.administrativeTemplates?.filter((c: any) =>
          selectedConfigs.has(`admx-${c.id}`)
        ) ?? [],
        securityBaselines: configurations?.securityBaselines?.filter((c: any) =>
          selectedConfigs.has(`security-${c.id}`)
        ) ?? [],
        compliancePolicies: configurations?.compliancePolicies?.filter((c: any) =>
          selectedConfigs.has(`compliance-${c.id}`)
        ) ?? [],
        appProtectionPolicies: configurations?.appProtectionPolicies?.filter((c: any) =>
          selectedConfigs.has(`app-protection-${c.id}`)
        ) ?? [],
        scripts: {
          macOS: configurations?.scripts?.macOS?.filter((c: any) =>
            selectedConfigs.has(`script-mac-${c.id}`)
          ) ?? [],
          windows: configurations?.scripts?.windows?.filter((c: any) =>
            selectedConfigs.has(`script-win-${c.id}`)
          ) ?? []
        },
        appConfigurations: configurations?.appConfigurations?.filter((c: any) =>
          selectedConfigs.has(`app-${c.id}`)
        ) ?? [],
        windowsUpdatePolicies: configurations?.windowsUpdatePolicies?.filter((c: any) =>
          selectedConfigs.has(`update-${c.id}`)
        ) ?? [],
        enrollmentConfigurations: configurations?.enrollmentConfigurations?.filter((c: any) =>
          selectedConfigs.has(`enrollment-${c.id}`)
        ) ?? [],
        conditionalAccessPolicies: (includeCA && caConsentStatus === 'included')
          ? (configurations?.conditionalAccessPolicies?.filter((c: any) => selectedConfigs.has(`ca-${c.id}`)) ?? [])
          : [],
        branding: brandingOptions
      };

      onProgress?.({ stage: 0, progress: 10 });

      // Stage 1: Resolve groups
      onProgress?.({ stage: 1, progress: 15, message: "Resolving group names..." });

      const { resolveExportData } = await import("~/lib/client-export-resolver");
      const resolvedData = await resolveExportData(
        selectedData,
        accessToken,
        (p) => {
          if (p.stage === "groups") {
            onProgress?.({ stage: 1, progress: 25, message: p.message });
          } else {
            onProgress?.({ stage: 2, progress: 40, message: p.message });
          }
        }
      );

      // Stage 2: Device counts done (part of resolveExportData)
      onProgress?.({ stage: 2, progress: 50, message: "Device counts fetched" });

      // Stage 3: Generate document
      onProgress?.({ stage: 3, progress: 55, message: "Generating document..." });

      let blob: Blob;
      let exportErrors: PolicyExportError[] | undefined;
      let totalPolicies: number | undefined;
      let successfulPolicies: number | undefined;

      if (format === 'docx') {
        const { generateDetailedDOCX } = await import("~/lib/docx-generator-detailed");
        const docxResult = await generateDetailedDOCX(resolvedData);
        const ab = docxResult.buffer.buffer.slice(
          docxResult.buffer.byteOffset,
          docxResult.buffer.byteOffset + docxResult.buffer.byteLength
        ) as ArrayBuffer;
        blob = new Blob([ab], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
        if (docxResult.errors.length > 0) {
          exportErrors = docxResult.errors;
          totalPolicies = docxResult.totalPolicies;
          successfulPolicies = docxResult.successfulPolicies;
        }
      } else if (format === 'pdf-detailed') {
        const { generateDetailedPDF } = await import("~/lib/pdf-generator-detailed");
        const pdfResult = await generateDetailedPDF(resolvedData);
        const ab = pdfResult.buffer.buffer.slice(
          pdfResult.buffer.byteOffset,
          pdfResult.buffer.byteOffset + pdfResult.buffer.byteLength
        ) as ArrayBuffer;
        blob = new Blob([ab], { type: "application/pdf" });
        if (pdfResult.errors.length > 0) {
          exportErrors = pdfResult.errors;
          totalPolicies = pdfResult.totalPolicies;
          successfulPolicies = pdfResult.successfulPolicies;
        }
      } else {
        throw new Error(`Unknown export format: ${String(format)}`);
      }

      onProgress?.({ stage: 3, progress: 90, message: "Document generated" });

      // Stage 4: Download
      onProgress?.({ stage: 4, progress: 95, message: "Preparing download..." });

      // Fire-and-forget: increment export counter
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      fetch("/api/stats/increment-export", { method: "POST" }).catch(() => {});

      const date = new Date().toISOString().split("T")[0];
      const filename = format === 'docx'
        ? `Intune-Configuration-Documentation-${date}.docx`
        : `Intune-Configuration-Documentation-${date}.pdf`;

      return {
        success: true,
        exportErrors,
        totalPolicies,
        successfulPolicies,
        downloadData: { blob, filename },
      };
    } catch (error: any) {
      console.error('Export failed:', error);
      return {
        success: false,
        error: error?.message || "An unexpected error occurred during export",
      };
    }
  };

  return {
    showExportModal,
    setShowExportModal,
    exportConfig: getExportConfig(),
    handleExport,
  };
}
