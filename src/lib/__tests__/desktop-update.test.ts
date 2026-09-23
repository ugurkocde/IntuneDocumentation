import { describe, expect, it } from "vitest";
import { resolveDesktopAsset, selectRelease } from "../desktop-update";

const asset = (tag: string, name: string) => ({
  name,
  browser_download_url: `https://github.com/ugurkocde/IntuneDocumentation/releases/download/${tag}/${name}`,
});

const release = (
  tag: string,
  options: { draft?: boolean; prerelease?: boolean } = {},
) => ({
  tag_name: tag,
  draft: options.draft ?? false,
  prerelease: options.prerelease ?? false,
  assets: [
    asset(tag, "latest.yml"),
    asset(tag, "latest-mac.yml"),
    asset(tag, `Intunedocumentation-${tag.slice(9)}-arm64.dmg`),
    asset(tag, `Intunedocumentation-${tag.slice(9)}-x64.dmg`),
    asset(tag, `Intunedocumentation-${tag.slice(9)}-arm64-mac.zip`),
    asset(tag, `Intunedocumentation-Setup-${tag.slice(9)}.exe`),
    asset(tag, `Intunedocumentation-Setup-${tag.slice(9)}.exe.blockmap`),
  ],
});

const releases = [
  release("v1.0.1"),
  release("desktop-v0.1.2", { draft: true }),
  release("desktop-v0.2.0-beta.1", { prerelease: true }),
  release("desktop-v0.1.1"),
  release("desktop-v0.1.10"),
  release("desktop-v0.1.0"),
];

describe("desktop update feed", () => {
  it("picks the highest published desktop release and ignores web releases", () => {
    expect(selectRelease(releases)?.tag_name).toBe("desktop-v0.1.10");
  });

  it("honours a pinned tag", () => {
    expect(selectRelease(releases, "desktop-v0.1.0")?.tag_name).toBe(
      "desktop-v0.1.0",
    );
    expect(selectRelease(releases, "desktop-v9.9.9")).toBeNull();
  });

  it("resolves feed files and download aliases to GitHub assets", async () => {
    const fetchReleases = async () => releases;
    expect(await resolveDesktopAsset("latest-mac.yml", fetchReleases)).toBe(
      "https://github.com/ugurkocde/IntuneDocumentation/releases/download/desktop-v0.1.10/latest-mac.yml",
    );
    expect(await resolveDesktopAsset("mac-arm64", fetchReleases)).toMatch(
      /desktop-v0\.1\.10\/Intunedocumentation-0\.1\.10-arm64\.dmg$/,
    );
    expect(await resolveDesktopAsset("windows", fetchReleases)).toMatch(
      /Setup-0\.1\.10\.exe$/,
    );
    expect(await resolveDesktopAsset("unknown.bin", fetchReleases)).toBeNull();
  });

  it("returns null when no desktop release exists", async () => {
    expect(
      await resolveDesktopAsset("latest.yml", async () => [release("v1.0.1")]),
    ).toBeNull();
  });
});
