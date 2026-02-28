import { NextResponse } from "next/server";
import { supabase } from "~/lib/supabase";

export async function POST() {
  try {
    if (!supabase) {
      return NextResponse.json({ ok: true });
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
