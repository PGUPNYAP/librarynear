import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveCityParam } from "@/lib/cities-server";
import type { SearchIndex } from "@/lib/client-search";
import { getCityPlaces } from "@/lib/places-data";

/**
 * Compact per-city search index, searched in the browser (no network per
 * keystroke). Coordinates are stored as integers (degrees x 1000, ~100 m).
 *
 *   l:   [slug, name, locality, rating*10, verified, score, lat, lng, clicks]
 *   loc: [name, libraryCount, lat, lng, clicks]
 *   m:   [name, libraryCount, lat, lng]
 *   a:   [alias, "locality" | "metro" | "library", targetNameOrSlug]
 *   p:   [name, category, lat, lng, altNames]   landmarks (OpenStreetMap)
 *   z:   [pin, libraryCount]                    PIN codes
 */
export const revalidate = 86400;

export async function generateStaticParams() {
  return [];
}

const e3 = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(value * 1000) : 0;

async function loadClicks(citySlug: string) {
  const clicks = new Map<string, number>();
  const { data, error } = await supabaseServer
    .from("search_click_stats" as never)
    .select("target_type, target_slug, clicks")
    .eq("city" as never, citySlug as never)
    .limit(5000);
  if (error) return clicks; // table not migrated yet
  for (const row of (data ?? []) as Array<{ target_type: string; target_slug: string; clicks: number }>) {
    clicks.set(`${row.target_type}:${row.target_slug}`, row.clicks);
  }
  return clicks;
}

async function loadAliases(citySlug: string) {
  const { data, error } = await supabaseServer
    .from("place_aliases")
    .select("alias_text, canonical_name, place_type, target_type, target_slug, city, status, is_active")
    .or(`city.eq.${citySlug},city.is.null`)
    .eq("is_active", true)
    .limit(5000);
  if (error) return [] as SearchIndex["a"];
  return ((data ?? []) as unknown as Array<{
    alias_text: string;
    canonical_name: string;
    place_type: string;
    target_type?: string | null;
    target_slug?: string | null;
    status?: string | null;
  }>)
    .filter((row) => (row.status ?? "approved") === "approved")
    .map((row) => {
      const type = (row.target_type ?? row.place_type) as "locality" | "metro" | "library";
      return [row.alias_text.toLowerCase().trim(), type, type === "library" ? row.target_slug ?? row.canonical_name : row.canonical_name] as [
        string,
        "locality" | "metro" | "library",
        string,
      ];
    })
    .filter(([alias, type]) => alias.length >= 2 && ["locality", "metro", "library"].includes(type));
}

async function buildIndex(cityName: string, citySlug: string): Promise<SearchIndex> {
  const [clicks, aliases, places] = await Promise.all([loadClicks(citySlug), loadAliases(citySlug), getCityPlaces(citySlug)]);
  const pins = new Map<string, number>();
  const libraries: SearchIndex["l"] = [];
  const localities = new Map<string, { count: number; lat: number; lng: number; located: number }>();
  const metros = new Map<string, { count: number; lat: number; lng: number; located: number }>();

  const addPlace = (map: typeof localities, name: string, lat: number | null, lng: number | null) => {
    const entry = map.get(name) ?? { count: 0, lat: 0, lng: 0, located: 0 };
    entry.count += 1;
    if (typeof lat === "number" && typeof lng === "number") {
      entry.lat += lat;
      entry.lng += lng;
      entry.located += 1;
    }
    map.set(name, entry);
  };

  for (let page = 0; page < 30; page++) {
    const { data, error } = await supabaseServer
      .from("library_branches")
      .select("slug, display_name, locality, nearest_metro, aggregate_rating, review_count, verification_status, profile_completeness_score, latitude, longitude, pin_code")
      .eq("is_active", true)
      .eq("city", cityName)
      .order("id")
      .range(page * 1000, page * 1000 + 999);
    if (error || !data || data.length === 0) break;
    for (const row of data) {
      const locality = row.locality?.trim() ?? "";
      const metro = row.nearest_metro?.trim() ?? "";
      libraries.push([
        row.slug,
        row.display_name,
        locality,
        row.aggregate_rating && row.review_count ? Math.round(row.aggregate_rating * 10) : 0,
        row.verification_status === "verified" ? 1 : 0,
        row.profile_completeness_score ?? 0,
        e3(row.latitude),
        e3(row.longitude),
        clicks.get(`library:${row.slug}`) ?? 0,
      ]);
      if (locality) addPlace(localities, locality, row.latitude, row.longitude);
      if (row.pin_code && /^\d{6}$/.test(row.pin_code)) pins.set(row.pin_code, (pins.get(row.pin_code) ?? 0) + 1);
      if (metro) addPlace(metros, metro, row.latitude, row.longitude);
    }
    if (data.length < 1000) break;
  }

  const centroid = (entry: { lat: number; lng: number; located: number }) =>
    entry.located ? [e3(entry.lat / entry.located), e3(entry.lng / entry.located)] : [0, 0];

  const slugOf = (name: string) => name.trim().toLowerCase().replace(/\s+/g, "-");

  return {
    v: 2,
    city: citySlug,
    l: libraries,
    loc: [...localities.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([name, entry]) => {
        const [lat, lng] = centroid(entry);
        return [name, entry.count, lat, lng, clicks.get(`locality:${slugOf(name)}`) ?? 0];
      }),
    m: [...metros.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([name, entry]) => {
        const [lat, lng] = centroid(entry);
        return [name, entry.count, lat, lng];
      }),
    a: aliases,
    p: (places?.landmarks ?? []).map(([name, category, lat, lng, alt]) => [name, category, e3(lat), e3(lng), alt]),
    z: [...pins.entries()].sort((a, b) => b[1] - a[1]),
  };
}

// Invalidated with library pages whenever a library changes, and by the
// nightly learning job when new aliases are approved.
const getCachedIndex = unstable_cache(buildIndex, ["search-index-v3"], {
  revalidate: 86400,
  tags: ["library-cards", "search-index"],
});

// unstable_cache is bypassed in dev; avoid rebuilding a city's index on every request.
const devCache = new Map<string, { at: number; value: SearchIndex }>();

export async function GET(_request: Request, { params }: { params: Promise<{ city: string }> }) {
  const { city: rawCity } = await params;
  const city = await resolveCityParam(rawCity);
  if (!city) return NextResponse.json({ error: "Unknown city" }, { status: 404 });

  let index: SearchIndex;
  if (process.env.NODE_ENV === "development") {
    const cached = devCache.get(city.slug);
    if (cached && Date.now() - cached.at < 10 * 60_000) index = cached.value;
    else {
      index = await buildIndex(city.name, city.slug);
      devCache.set(city.slug, { at: Date.now(), value: index });
    }
  } else {
    index = await getCachedIndex(city.name, city.slug);
  }

  return NextResponse.json(index, {
    headers: {
      "Cache-Control": "public, max-age=600, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
