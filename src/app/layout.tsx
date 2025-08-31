import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";
import { AuthProvider } from "~/components/auth-provider";

export const metadata: Metadata = {
  title: "Free Intune Documentation Generator | PDF Export Tool",
  description: "Generate professional PDF documentation for Microsoft Intune configurations automatically. Free tool for IT admins and consultants. Sign in to start.",
  keywords: ["Intune documentation", "Microsoft Intune", "Intune PDF generator", "Intune configuration documentation", "MDM documentation", "Intune reporting tool", "free Intune tool"],
  authors: [{ name: "Intune Documentation Team" }],
  openGraph: {
    title: "Free Microsoft Intune Documentation Generator",
    description: "Transform hours of manual work into minutes. Generate professional PDF documentation for your entire Microsoft Intune environment automatically.",
    type: "website",
    url: "https://intunedocs.com",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Intune Documentation Generator",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Intune Documentation Generator",
    description: "Generate professional PDF documentation for Microsoft Intune configurations automatically. Free tool for IT professionals.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable}`}>
      <head>
        <script defer data-domain="intunedocumentation.com" src="https://plausible.io/js/script.js"></script>
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
