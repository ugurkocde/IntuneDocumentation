import { useState } from "react";
import type { ExportFormat, ExportConfig, ExportResult, PolicyExportError } from "~/components/export-modal";

interface UseExportHandlerProps {
  configurations: any;
  selectedConfigs: Set<string>;
  brandingOptions: any;
  includeCA: boolean;
  caConsentStatus: string;
  getAccessToken: () => Promise<string>;
}

export function useExportHandler({
  configurations,
  selectedConfigs,
  brandingOptions,
  includeCA,
  caConsentStatus,
  getAccessToken,
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

      // Build selected data
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

      let response;

      if (format === 'docx') {
        // DOCX export
        response = await fetch("/api/docx/generate-detailed", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(selectedData),
        });
      } else if (format === 'pdf-executive') {
        // Executive PDF export
        response = await fetch("/api/pdf/generate-executive", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(selectedData),
        });
      } else {
        // Detailed PDF export (default)
        response = await fetch("/api/pdf/generate-detailed", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(selectedData),
        });
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Export failed" }));
        return {
          success: false,
          error: errorData.message || errorData.error || "Failed to generate export",
        };
      }

      // Check for partial success (export errors in headers)
      const exportErrorsHeader = response.headers.get("X-Export-Errors");
      const totalPoliciesHeader = response.headers.get("X-Export-Total");
      const successfulPoliciesHeader = response.headers.get("X-Export-Success");

      let exportErrors: PolicyExportError[] | undefined;
      let totalPolicies: number | undefined;
      let successfulPolicies: number | undefined;

      if (exportErrorsHeader) {
        try {
          exportErrors = JSON.parse(exportErrorsHeader);
          totalPolicies = totalPoliciesHeader ? parseInt(totalPoliciesHeader, 10) : undefined;
          successfulPolicies = successfulPoliciesHeader ? parseInt(successfulPoliciesHeader, 10) : undefined;
        } catch (e) {
          console.error("Failed to parse export error headers:", e);
        }
      }

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      // Set appropriate filename based on format
      const date = new Date().toISOString().split("T")[0];
      if (format === 'docx') {
        a.download = `Intune-Configuration-Documentation-${date}.docx`;
      } else if (format === 'pdf-executive') {
        a.download = `Intune-Executive-Summary-${date}.pdf`;
      } else {
        a.download = `Intune-Configuration-Documentation-${date}.pdf`;
      }

      document.body.appendChild(a);
      a.click();

      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      return {
        success: true,
        exportErrors,
        totalPolicies,
        successfulPolicies
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
