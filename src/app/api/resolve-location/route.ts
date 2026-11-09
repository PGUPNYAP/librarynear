import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { describeLocation, resolveLocationInput } from "@/lib/server/resolve-location";

export const dynamic = "force-dynamic";

/** Live location check for library forms. Signed-in users only: it follows links and can call Google. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, reason: "unauthenticated" }, { status: 401 });

  const limit = await rateLimit(user.id, RATE_LIMITS.resolveLocation);
  if (!limit.success) return NextResponse.json({ ok: false, reason: "rate_limited" }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { input?: unknown } | null;
  const input = typeof body?.input === "string" ? body.input.slice(0, 4000) : "";
  const result = await resolveLocationInput(input);
  if (!result.ok) return NextResponse.json(result);
  const details = await describeLocation({ latitude: result.latitude, longitude: result.longitude }, result.mapLink, result.label);
  return NextResponse.json({ ...result, details });
}
