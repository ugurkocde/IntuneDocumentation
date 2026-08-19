import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Intune Documentation Dashboard",
  description:
    "Securely collect, review, and export your Microsoft Intune configuration documentation.",
  alternates: { canonical: "/dashboard" },
  robots: { index: false, follow: true },
  openGraph: {
    title: "Intune Documentation Dashboard",
    description:
      "Securely collect, review, and export your Microsoft Intune configuration documentation.",
    url: "/dashboard",
    type: "website",
  },
};

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
