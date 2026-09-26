import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Download, Info } from "lucide-react";
import { NavigationHeader } from "~/components/navigation-header";
import { SiteFooter } from "~/components/site-footer";
import { BackToTopButton } from "~/components/back-to-top-button";
import {
  DESKTOP_DOWNLOAD_URL,
  DESKTOP_DOWNLOADS,
  DESKTOP_GRAPH_PERMISSIONS,
  DESKTOP_INSTALLS_PER_TENANT,
  DESKTOP_PORTAL_URL,
  DESKTOP_PRICING_PATH,
} from "~/lib/desktop-app";
import {
  fetchCheckoutLicenseKeys,
  type CheckoutKeyResult,
} from "~/lib/desktop-license/checkout-key";
import { CopyValue } from "./copy-value";

const title = "Desktop App Getting Started";
const description =
  "Install the Intune Documentation desktop app, create the Entra app registration with the Mobile and desktop applications platform, grant the read-only Microsoft Graph permissions, and activate your license.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/desktop/getting-started" },
  openGraph: {
    title: `${title} | Intune Documentation`,
    description,
    url: "/desktop/getting-started",
    type: "article",
  },
};

const REDIRECT_URI = "http://localhost";

const contents = [
  { id: "install", label: "Download and install" },
  { id: "register", label: "Create the app registration" },
  { id: "platform", label: "Add the desktop platform" },
  { id: "permissions", label: "Add API permissions" },
  { id: "consent", label: "Grant admin consent" },
  { id: "ids", label: "Copy the IDs into the app" },
  { id: "sign-in", label: "Sign in" },
  { id: "license", label: "Enter your license key" },
  { id: "export", label: "Collect and export" },
  { id: "troubleshooting", label: "Troubleshooting" },
];

const licenseMessages = [
  {
    message: "This license already covers its maximum number of tenants.",
    action:
      "An MSP license is at its tenant count, or a Pro license is already active for another tenant. Add tenants or release one in the customer portal.",
  },
  {
    message: `This tenant already has ${DESKTOP_INSTALLS_PER_TENANT} active installations.`,
    action:
      "Select Deactivate this machine in the app on a machine you no longer use, or release that installation in the customer portal.",
  },
  {
    message: "This license has no activations left.",
    action:
      "Release an installation you no longer use in the customer portal, then try again.",
  },
  {
    message: "This license key is not valid, has been revoked, or has expired.",
    action:
      "Check that you pasted the whole key and that the subscription is active in the customer portal.",
  },
  {
    message: "A license is required to collect and export.",
    action:
      "Open License and account in the app and paste your key. Sign in first so the app knows which tenant to activate.",
  },
];

function Step({
  id,
  number,
  heading,
  children,
}: {
  id: string;
  number: number;
  heading: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="border-petrol-950/8 shadow-card scroll-mt-24 rounded-2xl border bg-white p-6 sm:p-8"
    >
      <div className="flex items-start gap-4">
        <span className="bg-petrol-950 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white tabular-nums">
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-petrol-950 pt-1 text-xl font-semibold tracking-[-0.02em]">
            {heading}
          </h2>
          <div className="text-petrol-700 mt-4 space-y-4 text-[15px] leading-7">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl border border-teal-600/20 bg-teal-50 px-4 py-3 text-sm leading-6">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
      <div className="text-petrol-800">{children}</div>
    </div>
  );
}

function Ui({ children }: { children: ReactNode }) {
  return <strong className="text-petrol-950 font-semibold">{children}</strong>;
}

const inlineLink =
  "font-semibold text-teal-700 underline decoration-teal-600/35 underline-offset-2";

const downloads = [
  { href: DESKTOP_DOWNLOADS.macArm64, label: "macOS Apple Silicon" },
  { href: DESKTOP_DOWNLOADS.macX64, label: "macOS Intel" },
  { href: DESKTOP_DOWNLOADS.windows, label: "Windows" },
];

function DownloadButtons() {
  return (
    <div className="flex flex-wrap gap-3">
      {downloads.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className="bg-petrol-950 hover:bg-petrol-800 inline-flex min-h-11 items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <Download className="h-4 w-4" />
          {item.label}
        </a>
      ))}
    </div>
  );
}

function PortalLink() {
  return (
    <a href={DESKTOP_PORTAL_URL} rel="noopener" className={inlineLink}>
      customer portal
    </a>
  );
}

function LicenseKeyStatus({ result }: { result: CheckoutKeyResult }) {
  if (result.status === "ready") {
    return (
      <div className="mt-4">
        <p className="text-petrol-950 text-sm font-semibold">
          Your license key
        </p>
        <div className="mt-2 flex flex-col items-start gap-2">
          {result.keys.map((key) => (
            <CopyValue key={key} value={key} wrap />
          ))}
        </div>
        <p className="text-petrol-700 mt-2 text-sm leading-6">
          Paste it in the last setup step. It is also always available in the{" "}
          <PortalLink />.
        </p>
      </div>
    );
  }
  if (result.status === "pending") {
    return (
      <p className="text-petrol-700 mt-1 text-sm leading-6">
        Your license key is being created. Refresh this page in a minute, or
        find it in the <PortalLink />. You paste it in the last setup step.
      </p>
    );
  }
  return (
    <p className="text-petrol-700 mt-1 text-sm leading-6">
      Your license key is in the <PortalLink />. Sign in there with the email
      address you used at checkout. You paste it in the last setup step.
    </p>
  );
}

export default async function DesktopGettingStartedPage({
  searchParams,
}: {
  searchParams: Promise<{
    checkout_id?: string;
    customer_session_token?: string;
  }>;
}) {
  // Polar sends buyers here after checkout with ?checkout_id=... and the
  // buyer's customer portal session, used to show the new license key.
  const { checkout_id: checkoutId, customer_session_token: sessionToken } =
    await searchParams;
  const licenseKey = checkoutId
    ? await fetchCheckoutLicenseKeys(sessionToken)
    : null;
  return (
    <div className="bg-mint-50 min-h-screen">
      <NavigationHeader />
      <main>
        <section className="hero-stripes bg-mint-50 pt-28 pb-12 sm:pt-32 sm:pb-16">
          <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-10">
            <Link
              href="/desktop"
              className="text-sm font-semibold text-teal-700 hover:text-teal-600"
            >
              Desktop app
            </Link>
            <h1 className="text-petrol-950 mt-3 max-w-3xl text-4xl leading-[1.05] font-semibold tracking-[-0.045em] sm:text-5xl">
              Getting started with the desktop app
            </h1>
            <p className="text-petrol-600 mt-5 max-w-2xl text-base leading-7 sm:text-lg">
              About ten minutes from download to your first export. You need an
              administrator who can create an app registration and grant admin
              consent in your Entra tenant. If that is not you, send them{" "}
              <a href="#register" className={inlineLink}>
                steps 2 to 5
              </a>
              .
            </p>
            {licenseKey && (
              <div
                role="status"
                className="mt-8 max-w-2xl rounded-2xl border border-teal-600/20 bg-teal-50 p-5"
              >
                <p className="text-petrol-950 font-semibold">
                  Thank you, your trial has started.
                </p>
                <LicenseKeyStatus result={licenseKey} />
                <div className="mt-5">
                  <DownloadButtons />
                </div>
                <p className="text-petrol-700 mt-4 text-sm leading-6">
                  On an MSP plan, repeat steps 2 to 6 in each customer tenant.
                  The same key covers all of them.
                </p>
              </div>
            )}
          </div>
        </section>

        <div className="mx-auto grid max-w-6xl gap-10 px-5 pb-24 sm:px-8 lg:grid-cols-[220px_1fr] lg:px-10">
          <nav aria-label="On this page" className="hidden lg:block">
            <div className="sticky top-24">
              <p className="text-petrol-950 mb-3 text-[11px] font-bold tracking-[0.2em] uppercase">
                On this page
              </p>
              <ol className="space-y-1 text-sm">
                {contents.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="text-petrol-600 hover:text-petrol-950 block rounded-md px-2 py-1.5 transition-colors hover:bg-white"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>

          <div className="min-w-0 space-y-6">
            <Step id="install" number={1} heading="Download and install">
              <p>Download the newest installer for your platform.</p>
              <DownloadButtons />
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <Ui>macOS:</Ui> choose Apple Silicon for M-series Macs or
                  Intel for older Macs. Open the DMG and drag Intune
                  Documentation to your Applications folder.
                </li>
                <li>
                  <Ui>Windows:</Ui> run the Setup installer and follow the
                  prompts. It installs for the current user.
                </li>
              </ul>
              <p>
                The app tells you when an update is available and installs it
                when you choose. To install updates without asking, turn on{" "}
                <Ui>Install updates automatically</Ui> in Settings. To stop the
                app from checking for updates in the background, turn off{" "}
                <Ui>Check for updates automatically</Ui> in Settings.
              </p>
              <p className="text-petrol-600 text-sm">
                Older versions and release notes are on{" "}
                <a
                  href={DESKTOP_DOWNLOAD_URL}
                  rel="noopener"
                  className={inlineLink}
                >
                  GitHub Releases
                </a>
                .
              </p>
            </Step>

            <Step
              id="register"
              number={2}
              heading="Create the app registration"
            >
              <ol className="list-decimal space-y-2 pl-5">
                <li>
                  Open the{" "}
                  <a
                    href="https://entra.microsoft.com"
                    rel="noopener"
                    className="font-semibold text-teal-700 underline decoration-teal-600/35 underline-offset-2"
                  >
                    Microsoft Entra admin center
                  </a>{" "}
                  and go to <Ui>Entra ID</Ui>, then <Ui>App registrations</Ui>.
                </li>
                <li>
                  Select <Ui>New registration</Ui> and give it a name, for
                  example <CopyValue value="Intune Documentation Desktop" />.
                </li>
                <li>
                  Under <Ui>Supported account types</Ui>, choose{" "}
                  <Ui>Accounts in this organizational directory only</Ui>{" "}
                  (single tenant).
                </li>
                <li>
                  Leave <Ui>Redirect URI</Ui> empty and select <Ui>Register</Ui>
                  . You add it in the next step.
                </li>
              </ol>
              <Note>
                MSPs create one registration in each customer tenant. To switch
                tenants, enter that tenant&apos;s client ID and tenant ID in the
                app and sign in again.
              </Note>
            </Step>

            <Step id="platform" number={3} heading="Add the desktop platform">
              <ol className="list-decimal space-y-2 pl-5">
                <li>
                  In the new registration, open <Ui>Authentication</Ui>.
                </li>
                <li>
                  Select <Ui>Add a platform</Ui> (in the newer view,{" "}
                  <Ui>Add Redirect URI</Ui>) and choose{" "}
                  <Ui>Mobile and desktop applications</Ui>.
                </li>
                <li>
                  Enter this custom redirect URI exactly, with no port and no
                  trailing slash: <CopyValue value={REDIRECT_URI} />
                </li>
                <li>
                  Select <Ui>Configure</Ui>.
                </li>
                <li>
                  Leave <Ui>Allow public client flows</Ui> at <Ui>No</Ui>. The
                  app does not need it.
                </li>
              </ol>
              <Note>
                The app signs in through your system browser and listens on a
                random local port for the response. Entra accepts any port for{" "}
                <code className="font-mono text-[13px]">http://localhost</code>,
                so you only register it once. Do not use the{" "}
                <Ui>Single-page application</Ui> platform: that is what the
                website uses, and it does not work for the desktop app.
              </Note>
            </Step>

            <Step id="permissions" number={4} heading="Add API permissions">
              <p>
                Open <Ui>API permissions</Ui>, select <Ui>Add a permission</Ui>,
                choose <Ui>Microsoft Graph</Ui>, then{" "}
                <Ui>Delegated permissions</Ui>. Add all nine permissions below.
                Every one is read-only.
              </p>
              <div className="border-petrol-950/8 overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-mint-50 text-petrol-950">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Permission
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Why the app needs it
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-petrol-950/8 divide-y">
                    {DESKTOP_GRAPH_PERMISSIONS.map((permission) => (
                      <tr key={permission.scope}>
                        <td className="px-4 py-2.5 align-top">
                          <CopyValue value={permission.scope} />
                        </td>
                        <td className="text-petrol-600 px-4 py-3 align-top leading-6">
                          {permission.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-petrol-600 text-sm">
                Choose <Ui>Delegated permissions</Ui>, not Application
                permissions. The app reads only what the signed-in admin is
                allowed to see.
              </p>
            </Step>

            <Step id="consent" number={5} heading="Grant admin consent">
              <p>
                Still on <Ui>API permissions</Ui>, select{" "}
                <Ui>Grant admin consent for</Ui> your tenant and confirm. Every
                permission should show a green <Ui>Granted</Ui> status.
              </p>
              <p>
                A Global Administrator, Privileged Role Administrator, or Cloud
                Application Administrator can grant tenant-wide consent for
                these delegated permissions. Without consent, sign-in fails with
                AADSTS65001.
              </p>
              <Note>
                No admin at hand right now? Continue with the next steps. When
                the app finds missing permissions after sign-in, a Global
                Administrator can select{" "}
                <Ui>Sign in and consent for the organization</Ui> in the app
                instead.
              </Note>
            </Step>

            <Step id="ids" number={6} heading="Copy the IDs into the app">
              <ol className="list-decimal space-y-2 pl-5">
                <li>
                  Open the registration&apos;s <Ui>Overview</Ui> page.
                </li>
                <li>
                  In the app&apos;s setup wizard, paste{" "}
                  <Ui>Application (client) ID</Ui> and{" "}
                  <Ui>Directory (tenant) ID</Ui> into the fields with the same
                  names.
                </li>
                <li>
                  Select <Ui>Save and continue</Ui>.
                </li>
              </ol>
              <p className="text-petrol-600 text-sm">
                Both values are GUIDs in the form{" "}
                <code className="font-mono text-[13px]">
                  00000000-0000-0000-0000-000000000000
                </code>
                . Neither is a secret, and no client secret is needed.
              </p>
            </Step>

            <Step id="sign-in" number={7} heading="Sign in">
              <p>
                Select <Ui>Sign in with Microsoft</Ui>. Your default browser
                opens the Microsoft sign-in page. Sign in, then return to the
                app. The wizard then checks that all nine permissions were
                granted.
              </p>
              <p>
                The app sees only what the signed-in account can read.{" "}
                <Ui>Security Reader</Ui> or <Ui>Global Reader</Ui> each cover
                everything the app reads. Intune roles such as Intune
                Administrator or Read Only Operator cannot read Conditional
                Access policies, so pair them with Security Reader.
              </p>
              <p>
                Your Microsoft access tokens stay on this machine. The app calls
                Microsoft Graph directly.
              </p>
            </Step>

            <Step id="license" number={8} heading="Enter your license key">
              <p>
                Paste your license key into the last wizard step, or later under{" "}
                <Ui>License and account</Ui>. You find the key in the{" "}
                <PortalLink />. The app activates it for the tenant you signed
                into and stores the license token encrypted with your operating
                system keychain.
              </p>
              <Note>
                <p>
                  <Ui>Already licensed?</Ui> If a colleague activated a shared
                  license for this tenant, you do not need a key. The app finds
                  it when you sign in.
                </p>
                <p className="mt-2">
                  A Pro license is shared with its tenant automatically. An MSP
                  license is shared only in tenants where the key holder turns
                  on <Ui>Let other admins in this tenant use this license</Ui>.
                </p>
              </Note>
              <p>
                Each license check sends your license key (or, for a shared
                license, your Microsoft sign-in token), a random installation
                ID, and your tenant ID. We check the sign-in token, read only
                its tenant ID, and never store it.
              </p>
              <p>
                {checkoutId ? null : (
                  <>
                    No key yet?{" "}
                    <Link href={DESKTOP_PRICING_PATH} className={inlineLink}>
                      Start a 30-day free trial
                    </Link>
                    .{" "}
                  </>
                )}
                Manage your subscription in the <PortalLink />.
              </p>
            </Step>

            <Step id="export" number={9} heading="Collect and export">
              <p>
                On the <Ui>Overview</Ui> screen, select <Ui>Collect</Ui> to read
                your Intune configuration. When collection finishes, the app
                reports any sections it could not read.
              </p>
              <p>
                Then select <Ui>Export documentation</Ui>, choose{" "}
                <Ui>PDF report</Ui> or <Ui>Word document (.docx)</Ui>, and
                select <Ui>Start export</Ui>. Files are saved wherever you
                choose on your machine.
              </p>
              <p>
                For audit evidence, open <Ui>Compliance Evidence</Ui> in the
                sidebar, pick a framework, and download its evidence report.
                Collect again whenever your configuration changes, so your
                documentation stays current.
              </p>
            </Step>

            <section
              id="troubleshooting"
              className="scroll-mt-24 pt-6"
              aria-labelledby="troubleshooting-heading"
            >
              <h2
                id="troubleshooting-heading"
                className="text-petrol-950 text-2xl font-semibold tracking-[-0.03em]"
              >
                Troubleshooting
              </h2>
              <div className="mt-6 space-y-4">
                <div className="border-petrol-950/8 rounded-2xl border bg-white p-6">
                  <h3 className="text-petrol-950 font-semibold">
                    AADSTS50011: the redirect URI does not match
                  </h3>
                  <p className="text-petrol-600 mt-2 text-sm leading-6">
                    The registration has the wrong platform type. Most often
                    this is the <Ui>Single-page application</Ui> platform used
                    for the website, which does not work for the desktop app.
                    Add the <Ui>Mobile and desktop applications</Ui> platform
                    with <CopyValue value={REDIRECT_URI} /> as described in step
                    3. Do not add a port or path.
                  </p>
                </div>
                <div className="border-petrol-950/8 rounded-2xl border bg-white p-6">
                  <h3 className="text-petrol-950 font-semibold">
                    AADSTS65001: consent missing
                  </h3>
                  <p className="text-petrol-600 mt-2 text-sm leading-6">
                    Admin consent has not been granted for this registration.
                    Grant it as described in step 5, and check that the Client
                    ID in the app matches the registration you consented to.
                  </p>
                </div>
                <div className="border-petrol-950/8 rounded-2xl border bg-white p-6">
                  <h3 className="text-petrol-950 font-semibold">
                    Permission gaps after collection
                  </h3>
                  <p className="text-petrol-600 mt-2 text-sm leading-6">
                    If the app reports sections it could not read, compare the
                    registration with the table in step 4. All nine permissions
                    must be Delegated and show <Ui>Granted</Ui>. If you added a
                    permission later, grant consent again, then sign out and
                    back in. The signed-in account also needs a role that can
                    read those areas, as described in step 7.
                  </p>
                </div>
                <div className="border-petrol-950/8 rounded-2xl border bg-white p-6">
                  <h3 className="text-petrol-950 font-semibold">
                    License messages
                  </h3>
                  <dl className="mt-3 space-y-3 text-sm leading-6">
                    {licenseMessages.map((item) => (
                      <div key={item.message}>
                        <dt className="text-petrol-950 font-medium">
                          {item.message}
                        </dt>
                        <dd className="text-petrol-600">{item.action}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
              <p className="text-petrol-600 mt-8 text-sm leading-6">
                Still stuck?{" "}
                <Link
                  href="/support"
                  className="inline-flex items-center gap-1 font-semibold text-teal-700 underline decoration-teal-600/35 underline-offset-2"
                >
                  Contact support
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </p>
            </section>
          </div>
        </div>
      </main>
      <SiteFooter />
      <BackToTopButton />
    </div>
  );
}
