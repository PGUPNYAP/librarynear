import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
// High-volume endpoints use the per-instance limiter to avoid a Redis call
// on every keystroke; forms and uploads use the shared limiter.
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";

export const revalidate = 0;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const rateCheck = checkRateLimit(ip, RATE_LIMITS.logSearch);
  if (!rateCheck.success) {
    return NextResponse.json(
      { ok: false, error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.resetAt - Date.now()) / 1000)) } },
    );
  }

  try {
    const body = await req.json();
    const { query, result_count, city, session_id, clicked_slug, clicked_type, clicked_label, position, source } = body;
    if (!query || typeof query !== "string") return NextResponse.json({ ok: false });
    if (query.length > 500) return NextResponse.json({ ok: false });
    if (session_id && (typeof session_id !== "string" || session_id.length > 128)) {
      return NextResponse.json({ ok: false });
    }
    if (city && (typeof city !== "string" || city.length > 100)) {
      return NextResponse.json({ ok: false });
    }

    const base = {
      query: query.slice(0, 500),
      result_count: typeof result_count === "number" ? Math.max(0, Math.min(result_count, 10000)) : 0,
      city: typeof city === "string" ? city.slice(0, 100).toLowerCase() : null,
      session_id: typeof session_id === "string" ? session_id.slice(0, 128) : null,
      clicked_slug: typeof clicked_slug === "string" ? clicked_slug.slice(0, 200) : null,
    };
    const { error } = await supabaseServer.from("search_events" as never).insert({
      ...base,
      clicked_type: ["library", "locality", "metro"].includes(clicked_type) ? clicked_type : null,
      clicked_label: typeof clicked_label === "string" ? clicked_label.slice(0, 200) : null,
      position: Number.isInteger(position) ? Math.max(-1, Math.min(position, 100)) : null,
      source: typeof source === "string" ? source.slice(0, 20) : null,
    } as never);
    // Before the search-learning migration the extra columns don't exist yet.
    if (error) await supabaseServer.from("search_events" as never).insert(base as never);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
