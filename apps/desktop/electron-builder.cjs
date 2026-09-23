const signingRequested =
  Boolean(process.env.CSC_LINK) || process.env.MAC_SIGN === "true";
const notarizeRequested =
  Boolean(
    process.env.APPLE_ID &&
      process.env.APPLE_APP_SPECIFIC_PASSWORD &&
      process.env.APPLE_TEAM_ID,
  ) ||
  Boolean(
    process.env.APPLE_API_KEY &&
      process.env.APPLE_API_KEY_ID &&
      process.env.APPLE_API_ISSUER,
  );
const winSigning = Boolean(
  process.env.AZURE_TENANT_ID &&
    process.env.AZURE_CLIENT_ID &&
    process.env.AZURE_CLIENT_SECRET,
);

// Update feed read by electron-updater. The site redirects every file to the
// newest desktop-v* GitHub release (src/app/api/desktop-update).
const updateUrl =
  process.env.INTUNEDOC_UPDATE_URL ??
  "https://intunedocumentation.com/api/desktop-update";

module.exports = {
  appId: "com.ugurlabs.intunedocumentation",
  productName: "Intune Documentation",
  asar: true,
  directories: { output: "release", buildResources: "build" },
  files: ["dist/**/*", "package.json"],
  publish: [{ provider: "generic", url: updateUrl }],
  mac: {
    // The zip is what electron-updater downloads on macOS.
    target: [
      { target: "dmg", arch: ["arm64", "x64"] },
      { target: "zip", arch: ["arm64", "x64"] },
    ],
    category: "public.app-category.business",
    icon: "build/icon.icns",
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "build/entitlements.mac.plist",
    entitlementsInherit: "build/entitlements.mac.plist",
    notarize: notarizeRequested,
    artifactName: "Intunedocumentation-${version}-${arch}.${ext}",
  },
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    icon: "build/icon.ico",
    artifactName: "Intunedocumentation-Setup-${version}.${ext}",
    ...(winSigning
      ? {
          azureSignOptions: {
            // Must equal the CN of the Trusted Signing certificate exactly:
            // electron-updater refuses Windows updates whose signer CN does
            // not match this name ("not signed by the application owner").
            publisherName: "Ugurlabs UG (haftungsbeschr\u00e4nkt)",
            endpoint: process.env.AZURE_TRUSTED_SIGNING_ENDPOINT,
            certificateProfileName: process.env.AZURE_CERT_PROFILE_NAME,
            codeSigningAccountName: process.env.AZURE_CODE_SIGNING_ACCOUNT,
          },
        }
      : {}),
  },
  nsis: {
    oneClick: false,
    license: "build/license_en.txt",
    allowToChangeInstallationDirectory: true,
    perMachine: false,
  },
};
