import type { Metadata } from "next";
import { DpaGate } from "~/components/dpa-gate";

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
  // The hosted service runs with separate public and app origins. Self-hosted
  // deployments leave them unset; their operator is the controller, so no
  // DPA with Ugurlabs applies there.
  const hostedService = Boolean(process.env.PUBLIC_SITE_ORIGIN);
  return <DpaGate enabled={hostedService}>{children}</DpaGate>;
}
