import "~/styles/globals.css";

import { type Metadata } from "next";
// Removed Google Fonts to allow offline builds in restricted environments
import { AuthProvider } from "~/components/auth-provider";
import PlausibleProvider from "next-plausible";

export const metadata: Metadata = {
  metadataBase: new URL('https://intunedocumentation.com'),
  applicationName: 'Intune Documentation',
  title: {
    default: "Free Intune Documentation Generator | Microsoft Intune PDF Export Tool",
    template: "%s | Intune Documentation"
  },
  description: "Generate comprehensive PDF documentation for Microsoft Intune configurations in minutes. Export policies, compliance settings, scripts, and security baselines automatically. Free tool trusted by IT administrators and MSPs worldwide.",
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
    "Microsoft 365 Intune reports"
  ],
  authors: [{
    name: "Intune Documentation",
    url: "https://intunedocumentation.com"
  }],
  creator: "Intune Documentation",
  publisher: "Intune Documentation",
  category: "IT Management Software",
  classification: "Business Software",
  openGraph: {
    title: "Free Microsoft Intune Documentation Generator | Export to PDF in Minutes",
    description: "Transform hours of manual Intune documentation into minutes. Generate professional PDF reports covering all policies, compliance settings, security baselines, and device configurations. Trusted by IT professionals worldwide.",
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
        type: "image/png"
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@IntuneDocGen",
    creator: "@IntuneDocGen",
    title: "Free Microsoft Intune Documentation Generator | PDF Export Tool",
    description: "Generate professional PDF documentation for Microsoft Intune configurations automatically. Export policies, compliance settings, scripts & more in minutes. Free for IT professionals.",
    images: {
      url: "/og-image.png",
      alt: "Microsoft Intune Documentation Generator - Free PDF export tool for IT administrators"
    },
  },
  robots: {
    index: true,
    follow: true,
    nocache: true,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "https://intunedocumentation.com",
    languages: {
      'en': 'https://intunedocumentation.com',
      'en-US': 'https://intunedocumentation.com'
    }
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
    "theme-color": "#3b82f6",
    "color-scheme": "light",
    "HandheldFriendly": "True",
    "MobileOptimized": "320"
  },
  icons: [
    { rel: "icon", url: "/favicon.ico", sizes: "any" },
    { rel: "icon", url: "/icon.svg", type: "image/svg+xml" },
    { rel: "apple-touch-icon", url: "/apple-touch-icon.png" },
    { rel: "manifest", url: "/manifest.json" }
  ],
};

// Using system fonts; add custom fonts via local files if needed

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "Intune Documentation Generator",
    "alternateName": "Free Microsoft Intune PDF Export Tool",
    "description": "Generate comprehensive PDF documentation for Microsoft Intune configurations in minutes. Export policies, compliance settings, scripts, and security baselines automatically. Save 10+ hours per audit.",
    "url": "https://intunedocumentation.com",
    "applicationCategory": "BusinessApplication",
    "applicationSubCategory": "IT Management Software",
    "operatingSystem": "Web Browser",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD",
      "availability": "https://schema.org/InStock",
      "priceValidUntil": "2030-12-31"
    },
    "author": {
      "@type": "Organization",
      "name": "Intune Documentation",
      "url": "https://intunedocumentation.com",
      "sameAs": [
        "https://github.com/IntuneDocumentation"
      ]
    },
    "publisher": {
      "@type": "Organization",
      "name": "Intune Documentation",
      "url": "https://intunedocumentation.com"
    },
    "softwareVersion": "1.0",
    "dateCreated": "2024-01-01",
    "dateModified": "2024-12-01",
    "keywords": "Microsoft Intune, Documentation Generator, PDF Export, IT Management, Device Configuration, Compliance Policies, Security Baselines",
    "about": [
      {
        "@type": "Thing",
        "name": "Microsoft Intune",
        "description": "Microsoft's cloud-based mobile device management and mobile application management service"
      },
      {
        "@type": "Thing", 
        "name": "IT Documentation",
        "description": "Professional documentation for IT infrastructure and device management"
      },
      {
        "@type": "Thing",
        "name": "PDF Export",
        "description": "Export functionality to generate PDF reports and documentation"
      }
    ],
    "featureList": [
      "Export Microsoft Intune configurations to PDF",
      "Generate comprehensive policy documentation", 
      "Document compliance and security settings",
      "Export device configuration profiles",
      "Generate administrative template reports",
      "Document PowerShell scripts and applications",
      "Create audit-ready documentation",
      "Free tool for IT professionals"
    ],
    "screenshot": "https://intunedocumentation.com/og-image.png",
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.8",
      "ratingCount": "150",
      "bestRating": "5",
      "worstRating": "1"
    },
    "review": [
      {
        "@type": "Review",
        "reviewRating": {
          "@type": "Rating",
          "ratingValue": "5",
          "bestRating": "5"
        },
        "author": {
          "@type": "Person",
          "name": "IT Administrator"
        },
        "reviewBody": "This tool saved me hours of manual documentation work. Perfect for compliance audits."
      }
    ]
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": "https://intunedocumentation.com"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Dashboard",
        "item": "https://intunedocumentation.com/dashboard"
      }
    ]
  };

  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(breadcrumbSchema),
          }}
        />
      </head>
      <body>
        <PlausibleProvider domain="intunedocumentation.com">
          <AuthProvider>{children}</AuthProvider>
        </PlausibleProvider>
      </body>
    </html>
  );
}
