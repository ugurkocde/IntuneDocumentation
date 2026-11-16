import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { verifyIdTokenFromRequest } from "~/lib/auth-middleware";
import { DPA_VERSION } from "~/lib/legal/dpa";
import { supabaseWriter } from "~/lib/supabase";
import { env } from "~/env";

// Records that a signed-in user accepted the current DPA version on behalf of
// their organization. Only hashes are stored, like the MAU tracker.
const TABLE = "dpa_acceptances";

const hash = (value: string) =>
  createHash("sha256").update(value.toLowerCase()).digest("hex");

// The table is readable and writable by the service role only; the anon
// fallback of supabaseWriter cannot reach it.
function store() {
  return env.SUPABASE_SERVICE_ROLE_KEY ? supabaseWriter : null;
}

async function identity(request: Request) {
  const verified = await verifyIdTokenFromRequest(request);
  if (!verified) return null;
  return {
    user_hash: hash(verified.userPrincipalName),
    tenant_hash: hash(verified.tenantId),
  };
}

export async function GET(request: Request) {
  const who = await identity(request);
  if (!who)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = store();
  if (!db) return NextResponse.json({ version: DPA_VERSION, accepted: false });

  const { data, error } = await db
    .from(TABLE)
    .select("accepted_at")
    .eq("user_hash", who.user_hash)
    .eq("tenant_hash", who.tenant_hash)
    .eq("dpa_version", DPA_VERSION)
    .maybeSingle();
  if (error) {
    console.error("[DPA] Failed to read acceptance:", error.message);
    return NextResponse.json({ version: DPA_VERSION, accepted: false });
  }
  return NextResponse.json({ version: DPA_VERSION, accepted: Boolean(data) });
}

export async function POST(request: Request) {
  const who = await identity(request);
  if (!who)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let version: unknown;
  try {
    version = ((await request.json()) as { version?: unknown }).version;
  } catch {
    version = undefined;
  }
  if (version !== DPA_VERSION) {
    return NextResponse.json(
      { error: "Outdated agreement version", version: DPA_VERSION },
      { status: 409 },
    );
  }

  const db = store();
  if (!db) {
    console.error(
      "[DPA] No service role store configured; acceptance not recorded",
    );
    return NextResponse.json({ version: DPA_VERSION, recorded: false });
  }
  const { error } = await db.from(TABLE).upsert(
    { ...who, dpa_version: DPA_VERSION },
    {
      onConflict: "user_hash,tenant_hash,dpa_version",
      ignoreDuplicates: true,
    },
  );
  if (error) {
    console.error("[DPA] Failed to record acceptance:", error.message);
    return NextResponse.json(
      { error: "Could not record acceptance" },
      { status: 503 },
    );
  }
  return NextResponse.json({ version: DPA_VERSION, recorded: true });
}
