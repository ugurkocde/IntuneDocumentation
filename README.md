# Intune Documentation Website

A Next.js application that generates comprehensive PDF and DOCX documentation for Microsoft Intune configurations. Sign in with your Microsoft account to fetch and export your Intune policies and settings.

## Features

- **Multi-tenant Azure AD authentication** - Works with any Microsoft 365 tenant
- **Comprehensive Intune coverage** - Documents Settings Catalog, device
  configuration templates, Administrative Templates, compliance, app
  protection/configuration, security baselines, scripts, update rings,
  enrollment configuration, and optional Conditional Access.
- **Extended policy and settings inventory** - Registry-driven Microsoft Graph
  beta coverage for Windows feature/quality/driver updates, remediations,
  compliance and custom-attribute scripts, Autopilot and platform enrollment,
  mobile apps, assignment filters, reusable settings, scope tags and RBAC,
  tenant/service settings, connectors, policy sets, notifications, terms,
  Microsoft Tunnel, and specialist configurations.
- **Honest partial results** - Collections stream into the dashboard as they
  finish. Paging or endpoint failures are shown as scoped warnings rather than
  being presented as an empty tenant.
- **Sensitive-field redaction** - Enrollment tokens, QR content, scripts,
  provisioning payloads, icons, and configuration-file content are redacted
  before configuration data reaches the browser.
- **Professional PDF & DOCX export** - Generates well-formatted documents entirely in the browser with:
  - Cover page with summary
  - Table of contents
  - Organized sections for each configuration type
  - Detailed configuration settings
- **Secure & Private** - Read-only access with no permanent data storage

## Prerequisites

- Node.js 18+ and npm
- Azure AD App Registration with proper permissions
- Microsoft 365 tenant with Intune configured

## Azure AD App Registration Setup

### 1. Create App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to Azure Active Directory > App registrations
3. Click "New registration"
4. Configure:
   - Name: "Intune Documentation"
   - Supported account types: "Accounts in any organizational directory (Multitenant)"
   - Redirect URI:
     - Type: Single-page application (SPA)
     - URI: `http://localhost:3000` (for development)

### 2. Configure Authentication

1. In your app registration, go to "Authentication"
2. Ensure the platform is set to "Single-page application"
3. Add redirect URIs:
   - `http://localhost:3000` (development)
   - `https://yourdomain.com` (production)
4. Under "Implicit grant and hybrid flows", enable:
   - Access tokens
   - ID tokens
5. Save changes

### 3. Add API Permissions

Go to "API permissions" and add the following Microsoft Graph delegated permissions:

- `User.Read` - Sign in and read user profile
- `DeviceManagementConfiguration.Read.All` - Read device configurations
- `DeviceManagementApps.Read.All` - Read app management policies
- `DeviceManagementManagedDevices.Read.All` - Read managed devices
- `DeviceManagementRBAC.Read.All` - Read RBAC settings
- `DeviceManagementServiceConfig.Read.All` - Read service configuration
- `DeviceManagementScripts.Read.All` - Read scripts and remediations
- `Group.Read.All` - Resolve assignment group names

Optional delegated permission:

- `Policy.Read.All` - Include Conditional Access policies

Click "Grant admin consent" if you're an admin, or users will need to consent on first sign-in.

## Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/IntuneDocumentation-Website.git
cd IntuneDocumentation-Website
```

2. Install dependencies:

```bash
npm install
```

3. Create `.env` file from the example:

```bash
cp .env.example .env
```

4. Update `.env` with your Azure AD details:

```env
NEXT_PUBLIC_AZURE_AD_CLIENT_ID="your-client-id"
NEXT_PUBLIC_AZURE_AD_TENANT_ID="common"  # Keep as "common" for multi-tenant
NEXT_PUBLIC_REDIRECT_URI="http://localhost:3000"
```

Note: No client secret is needed as we're using the SPA flow with MSAL.

## Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Production Deployment

1. Update environment variables for production:
   - `NEXT_PUBLIC_AZURE_AD_CLIENT_ID` - Your production client ID
   - `NEXT_PUBLIC_REDIRECT_URI` - Your production URL (e.g., `https://yourdomain.com`)

2. Add production redirect URI in Azure AD:
   - Go to your app registration > Authentication
   - Add redirect URI: `https://yourdomain.com` (as SPA type)

3. Build and start:

```bash
npm run build
npm start
```

## Usage

1. **Sign In**: Click "Sign in with Microsoft" on the homepage
2. **Authenticate**: Sign in with your organizational account
3. **Grant Permissions**: Accept the permission request (first time only)
4. **View Configurations**: Browse all your Intune configurations in the dashboard
5. **Select Items**: Choose which configurations to include in the document
6. **Generate a document**: Download the selection as PDF or DOCX

## Security Notes

- The application uses read-only permissions
- All PDF and DOCX generation happens entirely in the browser -- no data leaves your device during export
- Microsoft Graph data is streamed through the application server for
  normalization and redaction, but is not persisted
- Intune configuration data and generated documents are not persisted
- Pseudonymous usage records (hashed user and tenant identifiers), operational
  access logs, and an aggregate export counter may be retained for service
  measurement
- Authentication tokens are stored securely in browser session storage
- All API calls are authenticated and authorized

## Troubleshooting

### "Access Denied" error

- Ensure your account has the necessary Intune permissions
- Check that API permissions are granted in Azure AD
- Verify admin consent is granted for the permissions

### Empty configuration list

- Verify your tenant has Intune configured
- Check that your account can access Intune in the Microsoft Endpoint Manager admin center
- Ensure API permissions are correctly configured

### PDF generation fails

- Check browser console for errors
- Ensure all selected configurations loaded properly
- Try generating with fewer configurations selected

## Tech Stack

- **Next.js 15** - React framework
- **MSAL.js** - Microsoft Authentication Library
- **Microsoft Graph API** - Intune data access
- **jsPDF / docx** - Client-side PDF and DOCX generation
- **TypeScript** - Type safety
- **Vitest** - Parser and redaction regression tests
- **Tailwind CSS** - Styling

## License

MIT

## Support

For issues or questions, please create an issue in the GitHub repository.
