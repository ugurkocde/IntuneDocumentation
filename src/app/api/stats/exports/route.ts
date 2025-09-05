import { NextResponse } from "next/server";
import { supabase } from "~/lib/supabase";

export async function GET() {
  try {
    // Return 0 if Supabase is not configured
    if (!supabase) {
      return NextResponse.json({ export_count: 0 });
    }

    const { data, error } = await supabase
      .from("export_statistics")
      .select("export_count")
      .single();

    if (error) {
      console.error("Error fetching export statistics:", error);
      return NextResponse.json({ export_count: 0 });
    }

    return NextResponse.json({ export_count: data?.export_count ?? 0 });
  } catch (error) {
    console.error("Error in stats API:", error);
    return NextResponse.json({ export_count: 0 });
  }
}