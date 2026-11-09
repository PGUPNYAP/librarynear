import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { supabaseServer } from "@/lib/supabase-server";
import { getClientIp, rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getActiveCityBySlug } from "@/lib/cities-server";
import { getCityLocalities } from "@/lib/library-search";
import { createStartToken, getStudyLeaderboard, readStartToken, STUDY_MAX_MINUTES, STUDY_MIN_MINUTES } from "@/lib/study-room";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("city");
  const city = slug && /^[a-z0-9-]{1,60}$/.test(slug) ? await getActiveCityBySlug(slug) : null;
  const board = await getStudyLeaderboard(city?.name ?? null);
  return NextResponse.json(board, { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" } });
}

type Body = { action?: unknown; token?: unknown; minutes?: unknown; city?: unknown; locality?: unknown };

export async function POST(request: Request) {
  const ip = getClientIp(await headers());
  const body = (await request.json().catch(() => null)) as Body | null;

  if (body?.action === "start") {
    const limit = await rateLimit(ip, RATE_LIMITS.studySessionStart);
    if (!limit.success) return NextResponse.json({ ok: false, reason: "rate_limited" }, { status: 429 });
    return NextResponse.json({ ok: true, token: createStartToken() });
  }

  if (body?.action !== "finish") return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });

  const limit = await rateLimit(ip, RATE_LIMITS.studySessionFinish);
  if (!limit.success) return NextResponse.json({ ok: false, reason: "rate_limited" }, { status: 429 });

  const started = typeof body.token === "string" ? readStartToken(body.token) : null;
  const minutes = Math.floor(Number(body.minutes));
  if (!started || !Number.isFinite(minutes) || minutes < STUDY_MIN_MINUTES) return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });

  // Credit no more time than really passed since the signed start.
  const elapsed = Math.floor((Date.now() - started.startedAt) / 60000);
  if (elapsed > 24 * 60) return NextResponse.json({ ok: false, reason: "expired" }, { status: 400 });
  const credited = Math.min(minutes, elapsed + 1, STUDY_MAX_MINUTES);
  if (credited < STUDY_MIN_MINUTES) return NextResponse.json({ ok: false, reason: "too_short" }, { status: 400 });

  // Each start can be counted once.
  const once = await rateLimit(started.hash, { id: "study-token", maxRequests: 1, windowMs: 86_400_000 });
  if (!once.success) return NextResponse.json({ ok: false, reason: "already_counted" }, { status: 409 });

  const citySlug = typeof body.city === "string" && /^[a-z0-9-]{1,60}$/.test(body.city) ? body.city : "";
  const city = citySlug ? await getActiveCityBySlug(citySlug) : null;
  if (!city) return NextResponse.json({ ok: false, reason: "invalid_area" }, { status: 400 });
  const wanted = typeof body.locality === "string" ? body.locality.trim().toLowerCase() : "";
  const locality = (await getCityLocalities(city.name)).find((row) => row.name.toLowerCase() === wanted);
  if (!locality) return NextResponse.json({ ok: false, reason: "invalid_area" }, { status: 400 });

  const { error } = await supabaseServer.rpc("record_study_minutes" as never, { p_city: city.name, p_locality: locality.name, p_minutes: credited } as never);
  if (error) return NextResponse.json({ ok: false, reason: "unavailable" }, { status: 503 });
  return NextResponse.json({ ok: true, credited });
}
