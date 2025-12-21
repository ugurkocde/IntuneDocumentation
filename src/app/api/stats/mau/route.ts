import { NextResponse } from "next/server";
import { supabase } from "~/lib/supabase";

export async function GET() {
  try {
    // Return 0 if Supabase is not configured (graceful degradation)
    if (!supabase) {
      return NextResponse.json({ mau_count: 0 });
    }

    const { data, error } = await supabase.rpc("get_mau_count");

    if (error) {
      console.error("Error fetching MAU count:", error);
      return NextResponse.json({ mau_count: 0 });
    }

    return NextResponse.json({ mau_count: data ?? 0 });
  } catch (error) {
    console.error("Error in MAU stats API:", error);
    return NextResponse.json({ mau_count: 0 });
  }
}
