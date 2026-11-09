import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";

/**
 * Nightly (Vercel Cron): learn aliases and popularity from anonymous search
 * logs, then refresh the search indexes so the browser picks them up.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseServer.rpc("learn_search_aliases" as never);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag("search-index", "max");
  return NextResponse.json({ ok: true, result: data });
}
