import { RootProvider } from 'fumadocs-ui/provider/next';
import type { Metadata, Viewport } from 'next';
import './global.css';
import { ogImage, siteDescription, siteName, siteUrl } from '@/lib/shared';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteName,
    template: '%s | Intune Documentation Docs',
  },
  description: siteDescription,
  applicationName: siteName,
  alternates: { canonical: '/' },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    type: 'website',
    siteName,
    locale: 'en_US',
    url: '/',
    title: siteName,
    description: siteDescription,
    images: [ogImage],
  },
  twitter: {
    card: 'summary_large_image',
    images: [ogImage.url],
  },
};

export const viewport: Viewport = {
  themeColor: '#fbfcfc',
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider
          // Light by default for every visitor; the toggle still offers dark.
          theme={{ defaultTheme: 'light' }}
          search={{
            links: [
              ['Install the desktop app', '/desktop/install'],
              ['Create the app registration', '/desktop/app-registration'],
              ['Troubleshooting', '/help/troubleshooting'],
            ],
          }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
