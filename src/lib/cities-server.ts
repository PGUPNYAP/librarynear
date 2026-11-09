import "server-only";

import { unstable_cache } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { citySlug, DEFAULT_CITY_NAME, DEFAULT_CITY_SLUG } from "@/lib/places";

export type ActiveCity = {
  name: string;
  slug: string;
  state: string | null;
  libraryCount: number;
};

type CityCountRow = { city: string; state: string | null; library_count: number };

async function scanCities(): Promise<CityCountRow[]> {
  // Fallback used only when the city_library_counts() RPC is not deployed yet.
  const counts = new Map<string, CityCountRow>();
  const pageSize = 1000;
  for (let page = 0; page < 100; page++) {
    const { data, error } = await supabaseServer
      .from("library_branches")
      .select("city, state")
      .eq("is_active", true)
      .order("id")
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error || !data || data.length === 0) break;
    for (const row of data) {
      const name = row.city?.trim();
      if (!name) continue;
      const existing = counts.get(name);
      if (existing) existing.library_count += 1;
      else counts.set(name, { city: name, state: row.state ?? null, library_count: 1 });
    }
    if (data.length < pageSize) break;
  }
  return [...counts.values()];
}

async function loadActiveCities(): Promise<ActiveCity[]> {
  let rows: CityCountRow[] | null = null;
  const { data, error } = await supabaseServer.rpc("city_library_counts" as never);
  if (!error && Array.isArray(data)) {
    rows = data as CityCountRow[];
  } else {
    rows = await scanCities();
  }

  const bySlug = new Map<string, ActiveCity>();
  for (const row of rows) {
    const slug = citySlug(row.city);
    const existing = bySlug.get(slug);
    if (existing) {
      existing.libraryCount += Number(row.library_count) || 0;
    } else {
      bySlug.set(slug, {
        name: row.city.trim(),
        slug,
        state: row.state,
        libraryCount: Number(row.library_count) || 0,
      });
    }
  }

  return [...bySlug.values()]
    .filter((city) => city.libraryCount > 0)
    .sort((a, b) => b.libraryCount - a.libraryCount || a.name.localeCompare(b.name));
}

const getCachedActiveCities = unstable_cache(loadActiveCities, ["active-cities-v1"], {
  revalidate: 3600,
  tags: ["active-cities", "library-cards"],
});

export async function getActiveCities(): Promise<ActiveCity[]> {
  const cities =
    process.env.NODE_ENV === "development" ? await loadActiveCities() : await getCachedActiveCities();
  if (cities.length === 0) {
    return [{ name: DEFAULT_CITY_NAME, slug: DEFAULT_CITY_SLUG, state: "Delhi", libraryCount: 0 }];
  }
  return cities;
}

export async function getActiveCityBySlug(slug: string): Promise<ActiveCity | null> {
  const cities = await getActiveCities();
  return cities.find((city) => city.slug === slug.toLowerCase()) ?? null;
}

/**
 * Resolves a [city] route segment. Returns null when the city has no active
 * libraries so the caller can call notFound() before any streaming starts.
 */
export async function resolveCityParam(rawCity: string): Promise<ActiveCity | null> {
  let decoded = rawCity;
  try {
    decoded = decodeURIComponent(rawCity);
  } catch {
    return null;
  }
  return getActiveCityBySlug(decoded);
}
