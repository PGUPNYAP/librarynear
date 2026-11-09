import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveCityParam } from "@/lib/cities-server";
import { getCityPlaces } from "@/lib/places-data";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Resolve "a place" to coordinates for "libraries near <place>".
 * Order: our data (OSM landmarks, localities, metros) -> geocode cache ->
 * Google Places (last resort, rate limited, capped per day, cached 30 days).
 */
export const dynamic = "force-dynamic";

const CACHE_DAYS = 30;
const MAX_KM_FROM_CITY = 60;
const DAILY_GOOGLE_CAP = Number(process.env.GOOGLE_PLACES_DAILY_CAP ?? 800);

type Resolved = { label: string; lat: number; lng: number; source: "ours" | "cache" | "google" };

const memoryCache = new Map<string, { value: Resolved; at: number }>();

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(library|libraries|near|nearby|around|close to|next to|in|the)\b/g, " ")
    .replace(/[^a-z0-9ऀ-ॿ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Centre of the city's libraries (median), used to bias and sanity-check Google. */
async function cityCentre(cityName: string) {
  const { data } = await supabaseServer
    .from("library_branches")
    .select("latitude, longitude")
    .eq("is_active", true)
    .eq("city", cityName)
    .not("latitude", "is", null)
    .limit(1000);
  const lats = (data ?? []).map((row) => row.latitude as number).sort((a, b) => a - b);
  const lngs = (data ?? []).map((row) => row.longitude as number).sort((a, b) => a - b);
  if (lats.length === 0) return null;
  return { lat: lats[Math.floor(lats.length / 2)], lng: lngs[Math.floor(lngs.length / 2)] };
}

async function fromOurData(citySlug: string, key: string): Promise<Resolved | null> {
  const places = await getCityPlaces(citySlug);
  if (!places) return null;
  const words = key.split(" ");
  let best: { score: number; value: Resolved } | null = null;
  for (const [name, , lat, lng, alt] of places.landmarks) {
    for (const candidate of [name, ...alt.split("|").filter(Boolean)]) {
      const target = normalize(candidate);
      let score = 0;
      if (target === key) score = 3;
      else if (target.startsWith(key)) score = 2;
      else if (words.every((word) => target.split(" ").some((part) => part.startsWith(word)))) score = 1;
      if (score && (!best || score > best.score)) best = { score, value: { label: name, lat, lng, source: "ours" } };
    }
  }
  return best?.value ?? null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawQuery = (url.searchParams.get("q") ?? "").slice(0, 120);
  const city = await resolveCityParam(url.searchParams.get("city") ?? "");
  const key = normalize(rawQuery);
  if (!city || key.length < 2) {
    return NextResponse.json({ error: "Missing place or city" }, { status: 400 });
  }

  const cacheKey = `${city.slug}|${key}`;
  const memory = memoryCache.get(cacheKey);
  if (memory && Date.now() - memory.at < 6 * 3600_000) return NextResponse.json(memory.value);

  // 1. Our own data
  const ours = await fromOurData(city.slug, key);
  if (ours) {
    memoryCache.set(cacheKey, { value: ours, at: Date.now() });
    return NextResponse.json(ours);
  }

  // 2. Cache of earlier Google answers (<= 30 days old)
  const since = new Date(Date.now() - CACHE_DAYS * 86_400_000).toISOString();
  const cached = await supabaseServer
    .from("geocode_cache" as never)
    .select("label, latitude, longitude")
    .eq("city" as never, city.slug as never)
    .eq("query_key" as never, key as never)
    .gte("created_at" as never, since as never)
    .maybeSingle();
  const cachedRow = cached.data as { label: string; latitude: number; longitude: number } | null;
  if (cachedRow) {
    const value: Resolved = { label: cachedRow.label, lat: cachedRow.latitude, lng: cachedRow.longitude, source: "cache" };
    memoryCache.set(cacheKey, { value, at: Date.now() });
    return NextResponse.json(value);
  }

  // 3. Google (last resort)
  const apiKey = process.env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Place not found" }, { status: 404 });

  const ip = getClientIp(await headers());
  const [perMinute, perDay, global] = await Promise.all([
    rateLimit(ip, { id: "places-resolve", maxRequests: 10, windowMs: 60_000 }),
    rateLimit(ip, { id: "places-resolve-day", maxRequests: 60, windowMs: 86_400_000 }),
    rateLimit("all", { id: "places-google-day", maxRequests: DAILY_GOOGLE_CAP, windowMs: 86_400_000 }),
  ]);
  if (!perMinute.success || !perDay.success || !global.success) {
    return NextResponse.json({ error: "Too many lookups, try again later" }, { status: 429 });
  }

  const centre = await cityCentre(city.name);
  const params = new URLSearchParams({
    input: `${rawQuery.replace(/\b(library|libraries|near|nearby|around)\b/gi, " ").trim()}, ${city.name}`,
    inputtype: "textquery",
    fields: "name,geometry,place_id",
    key: apiKey,
  });
  if (centre) params.set("locationbias", `circle:40000@${centre.lat},${centre.lng}`);

  try {
    const response = await fetch(`https://maps.googleapis.com/maps/api/place/findplacefromtext/json?${params}`, {
      signal: AbortSignal.timeout(5000),
    });
    const json = (await response.json()) as {
      status: string;
      candidates?: Array<{ name: string; place_id: string; geometry: { location: { lat: number; lng: number } } }>;
    };
    const candidate = json.candidates?.[0];
    if (json.status !== "OK" || !candidate) return NextResponse.json({ error: "Place not found" }, { status: 404 });

    const location = candidate.geometry.location;
    // Reject answers far outside the city (e.g. a same-named place elsewhere).
    if (centre && haversineKm(centre, location) > MAX_KM_FROM_CITY) {
      return NextResponse.json({ error: "Place not found in this city" }, { status: 404 });
    }

    const value: Resolved = { label: candidate.name, lat: location.lat, lng: location.lng, source: "google" };
    memoryCache.set(cacheKey, { value, at: Date.now() });
    await supabaseServer.from("geocode_cache" as never).upsert({
      city: city.slug,
      query_key: key,
      label: candidate.name,
      latitude: location.lat,
      longitude: location.lng,
      place_id: candidate.place_id,
      source: "google",
      created_at: new Date().toISOString(),
    } as never);
    return NextResponse.json(value);
  } catch {
    return NextResponse.json({ error: "Lookup failed" }, { status: 502 });
  }
}
