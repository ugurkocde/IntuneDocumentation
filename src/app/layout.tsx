import "~/styles/globals.css";

import { type Metadata } from "next";
import Script from "next/script";
import { headers } from "next/headers";
import { AppSupportChat } from "~/components/app-support-chat";
import { getCrispWebsiteId } from "~/lib/crisp-config";
import { SiteBoundaryProvider } from "~/components/site-boundary-provider";
// Removed Google Fonts to allow offline builds in restricted environments
import { AuthProvider } from "~/components/auth-provider";
import PlausibleProvider from "next-plausible";
import { CookieConsentBanner } from "~/components/cookie-consent-banner";

export const metadata: Metadata = {
  metadataBase: new URL("https://intunedocumentation.com"),
  applicationName: "Intune Documentation",
  title: {
    default:
      "Free Intune Documentation Generator | Microsoft Intune PDF Export Tool",
    template: "%s | Intune Documentation",
  },
  description:
    "Generate comprehensive PDF documentation for Microsoft Intune configurations in minutes. Export policies, compliance settings, scripts, and security baselines automatically. Free tool trusted by IT administrators and MSPs worldwide.",
  keywords: [
    // Primary keywords
    "Intune documentation generator",
    "Microsoft Intune PDF export",
    "Intune configuration documentation",
    "Intune policy export",

    // Long-tail keywords
    "export Intune policies to PDF",
    "Microsoft Intune reporting tool free",
    "Intune compliance documentation generator",
    "MDM configuration documentation tool",
    "Intune security baseline export",
    "Microsoft Intune audit documentation",

    // Technical keywords
    "Intune Graph API documentation",
    "Microsoft Intune PowerShell export",
    "Intune administrative templates export",
    "device configuration policy documentation",
    "Intune enrollment profile documentation",

    // Use case keywords
    "IT audit Intune documentation",
    "MSP Intune documentation tool",
    "Intune consultant documentation",
    "enterprise mobility documentation",
    "Microsoft 365 Intune reports",
  ],
  authors: [
    {
      name: "Intune Documentation",
      url: "https://intunedocumentation.com",
    },
  ],
  creator: "Intune Documentation",
  publisher: "Intune Documentation",
  category: "IT Management Software",
  classification: "Business Software",
  openGraph: {
    title:
      "Free Microsoft Intune Documentation Generator | Export to PDF in Minutes",
    description:
      "Transform hours of manual Intune documentation into minutes. Generate professional PDF reports covering all policies, compliance settings, security baselines, and device configurations. Trusted by IT professionals worldwide.",
    type: "website",
    url: "https://intunedocumentation.com",
    siteName: "Intune Documentation",
    locale: "en_US",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Free Microsoft Intune Documentation Generator - Export comprehensive PDF reports of your Intune configuration policies, compliance settings, and security baselines",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@IntuneDocGen",
    creator: "@IntuneDocGen",
    title: "Free Microsoft Intune Documentation Generator | PDF Export Tool",
    description:
      "Generate professional PDF documentation for Microsoft Intune configurations automatically. Export policies, compliance settings, scripts & more in minutes. Free for IT professionals.",
    images: {
      url: "/og-image.png",
      alt: "Microsoft Intune Documentation Generator - Free PDF export tool for IT administrators",
    },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    // google: "", // Already verified via Google Search Console
    // bing: "", // Add if using Bing Webmaster Tools
  },
  other: {
    "application-name": "Intune Documentation",
    "apple-mobile-web-app-title": "Intune Docs",
    "format-detection": "telephone=no",
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "theme-color": "#f1f5f3",
    "color-scheme": "light",
    HandheldFriendly: "True",
    MobileOptimized: "320",
  },
  icons: [
    { rel: "icon", url: "/favicon.ico", sizes: "any" },
    { rel: "icon", url: "/icon.svg", type: "image/svg+xml" },
    { rel: "apple-touch-icon", url: "/apple-touch-icon.png" },
    { rel: "manifest", url: "/manifest.json" },
  ],
};

// Using system fonts; add custom fonts via local files if needed

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  const nonce = requestHeaders.get("x-nonce") ?? "";
  const publicSite = requestHeaders.get("x-site-mode") === "public";
  const appOrigin = requestHeaders.get("x-app-origin") ?? "";
  const configuredCrispId = getCrispWebsiteId();
  const crispWebsiteId = publicSite && configuredCrispId;
  const supportOrigin = requestHeaders.get("x-support-origin") ?? "";
  const app = (
    <SiteBoundaryProvider
      publicSite={publicSite}
      appOrigin={appOrigin}
      nonce={nonce}
    >
      {publicSite ? children : <AuthProvider>{children}</AuthProvider>}
    </SiteBoundaryProvider>
  );
  return (
    <html lang="en">
      <head>
        {publicSite ? (
          <script
            nonce={nonce}
            dangerouslySetInnerHTML={{
              __html: `try { sessionStorage.clear(); } catch {} if (/[#?](?:code|id_token|access_token|error)=/.test(location.href)) history.replaceState(null, "", location.pathname);`,
            }}
          />
        ) : (
          // The public configuration must exist before MSAL initializes.
          // eslint-disable-next-line @next/next/no-sync-scripts
          <script nonce={nonce} src="/api/config/script" />
        )}
      </head>
      <body
        className={
          crispWebsiteId || (configuredCrispId && supportOrigin)
            ? "crisp-chat-enabled"
            : undefined
        }
      >
        {publicSite && process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === "true" ? (
          <PlausibleProvider
            domain="intunedocumentation.com"
            scriptProps={{ nonce }}
          >
            {app}
          </PlausibleProvider>
        ) : (
          app
        )}
        {publicSite ? <CookieConsentBanner /> : null}
        {!publicSite && configuredCrispId && supportOrigin ? (
          <AppSupportChat supportOrigin={supportOrigin} />
        ) : null}
        {crispWebsiteId ? (
          <>
            <Script
              nonce={nonce}
              id="crisp-chat-config"
              strategy="afterInteractive"
            >
              {`window.$crisp = []; window.CRISP_WEBSITE_ID = ${JSON.stringify(crispWebsiteId)};`}
            </Script>
            <Script
              nonce={nonce}
              id="crisp-chat-loader"
              src="https://client.crisp.chat/l.js"
              strategy="lazyOnload"
            />
          </>
        ) : null}
      </body>
    </html>
  );
}
