import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getActiveCities } from "@/lib/cities-server";
import { getCityLocalities } from "@/lib/library-search";

/**
 * Tiny all-India index of cities and their localities (2+ libraries), so a
 * search for a locality in another city still finds it.
 *   c: [slug, name][]                 cities
 *   p: [cityIndex, localityName, n][] localities
 */
export const revalidate = 86400;

export type PlacesIndex = { v: 1; c: Array<[string, string]>; p: Array<[number, string, number]> };

async function build(): Promise<PlacesIndex> {
  const cities = await getActiveCities();
  const c: PlacesIndex["c"] = cities.map((city) => [city.slug, city.name]);
  const p: PlacesIndex["p"] = [];
  // A few cities at a time: firing ~175 queries at once exhausts connections
  // and makes unrelated requests fail with "fetch failed".
  const perCity: Array<Awaited<ReturnType<typeof getCityLocalities>>> = [];
  for (let i = 0; i < cities.length; i += 6) {
    const batch = await Promise.all(cities.slice(i, i + 6).map((city) => getCityLocalities(city.name)));
    perCity.push(...batch);
  }
  perCity.forEach((localities, index) => {
    for (const locality of localities) {
      if (locality.count >= 2) p.push([index, locality.name, locality.count]);
    }
  });
  return { v: 1, c, p };
}

const getCached = unstable_cache(build, ["search-places-v1"], { revalidate: 86400, tags: ["library-cards", "search-index"] });

let devCache: { at: number; value: PlacesIndex } | null = null;

export async function GET() {
  let index: PlacesIndex;
  if (process.env.NODE_ENV === "development") {
    // unstable_cache is bypassed in dev; keep a short in-memory copy instead.
    if (!devCache || Date.now() - devCache.at > 30 * 60_000) devCache = { at: Date.now(), value: await build() };
    index = devCache.value;
  } else {
    index = await getCached();
  }
  return NextResponse.json(index, {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
