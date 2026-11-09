import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { suggestPlaces } from "@/lib/server/resolve-location";

export const dynamic = "force-dynamic";

/** Suggestions for the library forms. Signed-in users only, because each call can cost money. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, reason: "unauthenticated" }, { status: 401 });

  const [minute, day] = await Promise.all([rateLimit(user.id, RATE_LIMITS.placeSearch), rateLimit(user.id, RATE_LIMITS.placeSearchDaily)]);
  if (!minute.success || !day.success) return NextResponse.json({ ok: false, reason: "rate_limited" }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { query?: unknown; sessionToken?: unknown } | null;
  const query = typeof body?.query === "string" ? body.query.trim().slice(0, 120) : "";
  const sessionToken = typeof body?.sessionToken === "string" && /^[A-Za-z0-9-]{8,64}$/.test(body.sessionToken) ? body.sessionToken : null;
  if (query.length < 3 || !sessionToken) return NextResponse.json({ ok: true, suggestions: [] });

  const suggestions = await suggestPlaces(query, sessionToken);
  return suggestions ? NextResponse.json({ ok: true, suggestions }) : NextResponse.json({ ok: false, reason: "unavailable" });
}
