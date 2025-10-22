import { Shield, AlertCircle } from "lucide-react";
import type { PermissionError, FetchError } from "~/types/dashboard";

interface PermissionErrorBannerProps {
  errors: PermissionError[];
}

export function PermissionErrorBanner({ errors }: PermissionErrorBannerProps) {
  if (errors.length === 0) return null;

  return (
    <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4" role="alert">
      <div className="flex items-start gap-3">
        <Shield className="w-5 h-5 text-amber-600 mt-0.5" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-sm text-amber-900 font-medium">Limited permissions detected</p>
          <p className="text-sm text-amber-700 mt-1 mb-2">
            Some configuration types could not be retrieved due to missing permissions.
            To access all features, ensure your Azure AD app has the following permissions:
          </p>
          <ul className="text-sm text-amber-700 space-y-1">
            {errors.map((error, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="text-amber-600" aria-hidden="true">•</span>
                <span>
                  <strong>{error.resource}:</strong> Requires {error.requiredPermission}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-amber-600 mt-3">
            Contact your administrator to grant these permissions to the application.
          </p>
        </div>
      </div>
    </div>
  );
}

interface FetchErrorBannerProps {
  errors: FetchError[];
}

export function FetchErrorBanner({ errors }: FetchErrorBannerProps) {
  if (errors.length === 0) return null;

  return (
    <div className="mb-6 bg-orange-50 border border-orange-200 rounded-lg p-4" role="alert">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-sm text-orange-900 font-medium">
            {errors.length} {errors.length === 1 ? "policy" : "policies"} could not be fully
            loaded
          </p>
          <p className="text-sm text-orange-700 mt-1 mb-2">
            The following policies are visible but their settings could not be retrieved due to
            Microsoft Graph API errors. The policies appear correctly in the Intune admin center
            but have issues when accessed via the API.
          </p>
          <details className="mt-2">
            <summary className="text-sm font-medium text-orange-900 cursor-pointer hover:text-orange-800">
              View affected policies
            </summary>
            <ul className="text-sm text-orange-700 space-y-1 mt-2">
              {errors.map((error, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 bg-white border border-orange-200 rounded p-2"
                >
                  <span className="text-orange-600 mt-0.5" aria-hidden="true">•</span>
                  <span className="flex-1">
                    <strong>{error.policyType}:</strong> {error.policyName}
                    <br />
                    <span className="text-xs text-orange-600">{error.error}</span>
                  </span>
                </li>
              ))}
            </ul>
          </details>
          <p className="text-xs text-orange-600 mt-3">
            These policies will still appear in the list but may have incomplete settings data in
            exports. This is a known Microsoft Graph API issue with certain policies.
          </p>
        </div>
      </div>
    </div>
  );
}
