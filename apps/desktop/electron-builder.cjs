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

module.exports = {
  appId: "com.ugurlabs.intunedocumentation",
  productName: "Intune Documentation",
  asar: true,
  directories: { output: "release", buildResources: "build" },
  files: ["dist/**/*", "package.json"],
  mac: {
    target: [{ target: "dmg", arch: ["arm64", "x64"] }],
    category: "public.app-category.business",
    icon: "build/icon.png",
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "build/entitlements.mac.plist",
    entitlementsInherit: "build/entitlements.mac.plist",
    notarize: notarizeRequested,
    artifactName: "Intunedocumentation-${version}-${arch}.${ext}",
  },
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    icon: "build/icon.png",
    artifactName: "Intunedocumentation Setup ${version}.${ext}",
    ...(winSigning
      ? {
          azureSignOptions: {
            publisherName: process.env.AZURE_PUBLISHER_NAME,
            endpoint: process.env.AZURE_TRUSTED_SIGNING_ENDPOINT,
            certificateProfileName: process.env.AZURE_CERT_PROFILE_NAME,
            codeSigningAccountName: process.env.AZURE_CODE_SIGNING_ACCOUNT,
          },
        }
      : {}),
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    perMachine: false,
  },
};
