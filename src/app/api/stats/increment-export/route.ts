import { NextResponse } from "next/server";
import { verifyIdTokenFromRequest } from "~/lib/auth-middleware";
import { supabaseWriter as supabase } from "~/lib/supabase";

// Best effort, per instance throttle so one caller cannot inflate the public
// export counter. Mirrors the desktop license limiter; a hard limit belongs in
// the Vercel firewall. The client IP comes from the proxy's X-Forwarded-For.
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_IP = 60;
const MAX_PER_USER = 30;
const hits = new Map<string, { count: number; reset: number }>();

function limited(key: string, max: number): boolean {
  const now = Date.now();
  if (hits.size > 10000) {
    for (const [k, entry] of hits) if (entry.reset <= now) hits.delete(k);
  }
  const entry = hits.get(key);
  if (!entry || entry.reset <= now) {
    hits.set(key, { count: 1, reset: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}

export async function POST(request: Request) {
  try {
    if (!supabase) {
      return NextResponse.json({ ok: true });
    }

    const identity = await verifyIdTokenFromRequest(request);
    if (!identity) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const user = `${identity.tenantId}:${identity.objectId ?? identity.userPrincipalName.toLowerCase()}`;
    // Evaluate both so each key is counted even when the other is over limit
    const ipLimited = limited(`ip:${ip}`, MAX_PER_IP);
    const userLimited = limited(`user:${user}`, MAX_PER_USER);
    if (ipLimited || userLimited) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }

    const { error } = await supabase.rpc("increment_export_count");
    if (error) {
      console.error("Failed to increment export count:", error);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error incrementing export count:", error);
    return NextResponse.json({ ok: true });
  }
}
