import { NextResponse } from "next/server";
import { githubReleases, resolveDesktopAsset } from "~/lib/desktop-update";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  if (!/^[\w.-]{1,200}$/.test(file)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  try {
    const url = await resolveDesktopAsset(
      file,
      githubReleases(process.env.GITHUB_RELEASES_TOKEN),
      process.env.DESKTOP_UPDATE_PINNED_TAG || undefined,
    );
    if (!url) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.redirect(url, {
      status: 302,
      headers: { "Cache-Control": "public, max-age=60" },
    });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
