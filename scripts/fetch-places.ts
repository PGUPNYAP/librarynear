/**
 * Download metro stations and landmarks (colleges, universities, coaching
 * institutes, hospitals, malls, stations) from OpenStreetMap for every city
 * we list, into src/data/places/<city>.json.
 *
 * Data © OpenStreetMap contributors, ODbL. Attribution is shown in the footer.
 *
 *   npx tsx scripts/fetch-places.ts            # all cities with >= 15 libraries
 *   npx tsx scripts/fetch-places.ts delhi pune # specific city slugs
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const OVERPASS = "https://overpass-api.de/api/interpreter";
const OUT_DIR = path.join(process.cwd(), "src", "data", "places");
const MIN_LIBRARIES = 15;

type Row = { city: string; latitude: number | null; longitude: number | null };
export type PlacesFile = {
  city: string;
  generatedAt: string;
  /** [name, lat, lng] */
  metros: Array<[string, number, number]>;
  /** [name, category, lat, lng, altNames("|"-joined)] */
  landmarks: Array<[string, string, number, number, string]>;
};

const slugOf = (city: string) => city.trim().toLowerCase().replace(/\s+/g, "-");
const round5 = (value: number) => Math.round(value * 1e5) / 1e5;

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))];
}

async function loadCityBoxes() {
  const byCity = new Map<string, { name: string; lats: number[]; lngs: number[]; count: number }>();
  for (let page = 0; page < 30; page++) {
    const { data, error } = await supabase
      .from("library_branches")
      .select("city, latitude, longitude")
      .eq("is_active", true)
      .order("id")
      .range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data as Row[]) {
      const slug = slugOf(row.city);
      const entry = byCity.get(slug) ?? { name: row.city, lats: [], lngs: [], count: 0 };
      entry.count++;
      if (typeof row.latitude === "number" && typeof row.longitude === "number") {
        entry.lats.push(row.latitude);
        entry.lngs.push(row.longitude);
      }
      byCity.set(slug, entry);
    }
    if (data.length < 1000) break;
  }
  return [...byCity.entries()]
    .filter(([, entry]) => entry.count >= MIN_LIBRARIES && entry.lats.length >= 5)
    .map(([slug, entry]) => {
      // 3rd-97th percentile of library locations, padded ~6 km, ignores stray coordinates.
      const pad = 0.06;
      return {
        slug,
        name: entry.name,
        count: entry.count,
        box: [
          percentile(entry.lats, 0.03) - pad,
          percentile(entry.lngs, 0.03) - pad,
          percentile(entry.lats, 0.97) + pad,
          percentile(entry.lngs, 0.97) + pad,
        ] as [number, number, number, number],
      };
    });
}

async function overpass(query: string, attempt = 0): Promise<{ elements: Array<Record<string, any>> }> {
  const response = await fetch(OVERPASS, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "LibraryNear-data-script/1.0" },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504) {
    if (attempt >= 4) throw new Error(`Overpass busy (${response.status})`);
    await new Promise((resolve) => setTimeout(resolve, 15_000 * (attempt + 1)));
    return overpass(query, attempt + 1);
  }
  if (!response.ok) throw new Error(`Overpass ${response.status}`);
  return response.json();
}

function categoryOf(tags: Record<string, string>) {
  const name = (tags.name ?? "").toLowerCase();
  if (tags.amenity === "university") return "university";
  if (tags.amenity === "college") return "college";
  if (/\b(ias|upsc|coaching|classes|tutorial|academy|institute)\b/.test(name)) return "coaching";
  if (tags.amenity === "hospital") return "hospital";
  if (tags.shop === "mall") return "mall";
  if (tags.amenity === "bus_station") return "bus_station";
  if (tags.railway === "station") return "rail_station";
  if (tags.amenity === "library") return "public_library";
  if (tags.tourism === "attraction" || tags.historic) return "landmark";
  return "place";
}

function altNames(tags: Record<string, string>) {
  return [tags.short_name, tags.alt_name, tags.official_name, tags["name:en"], tags.old_name]
    .flatMap((value) => (value ? value.split(";") : []))
    .map((value) => value.trim())
    .filter((value) => value && value !== tags.name)
    .join("|");
}

async function fetchCity(slug: string, box: [number, number, number, number]): Promise<PlacesFile> {
  const bbox = box.map((value) => value.toFixed(4)).join(",");
  const query = `
    [out:json][timeout:120];
    (
      node["railway"="station"]["station"="subway"](${bbox});
      node["railway"="station"]["subway"="yes"](${bbox});
      node["public_transport"="station"]["subway"="yes"](${bbox});
      node["railway"="station"]["station"="light_rail"](${bbox});
      nwr["amenity"~"^(university|college|hospital|bus_station|library)$"]["name"](${bbox});
      nwr["shop"="mall"]["name"](${bbox});
      nwr["railway"="station"]["name"](${bbox});
      nwr["office"="educational_institution"]["name"](${bbox});
      nwr["amenity"~"^(school|training|prep_school)$"]["name"~"IAS|UPSC|coaching|classes|academy|institute|tutorial",i](${bbox});
      nwr["tourism"="attraction"]["name"](${bbox});
    );
    out center tags;`;
  const result = await overpass(query);

  const metros = new Map<string, [string, number, number]>();
  const landmarks = new Map<string, [string, string, number, number, string]>();
  for (const element of result.elements) {
    const tags = (element.tags ?? {}) as Record<string, string>;
    const name = (tags["name:en"] && /[a-z]/i.test(tags["name:en"]) ? tags["name:en"] : tags.name)?.trim();
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;
    if (!name || !/[a-z]/i.test(name) || typeof lat !== "number" || typeof lng !== "number") continue;

    const isMetro = tags.station === "subway" || tags.subway === "yes" || tags.station === "light_rail";
    if (isMetro) {
      const clean = name.replace(/\s+metro\s+station$/i, "").replace(/\s+station$/i, "").trim();
      if (!metros.has(clean.toLowerCase())) metros.set(clean.toLowerCase(), [clean, round5(lat), round5(lng)]);
      continue;
    }
    const category = categoryOf(tags);
    const key = `${name.toLowerCase()}|${category}`;
    if (!landmarks.has(key)) landmarks.set(key, [name, category, round5(lat), round5(lng), altNames(tags)]);
  }

  return {
    city: slug,
    generatedAt: new Date().toISOString(),
    metros: [...metros.values()].sort((a, b) => a[0].localeCompare(b[0])),
    landmarks: [...landmarks.values()].sort((a, b) => a[0].localeCompare(b[0])),
  };
}

async function main() {
  const only = process.argv.slice(2).map((value) => value.toLowerCase());
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const cities = (await loadCityBoxes()).filter((city) => only.length === 0 || only.includes(city.slug));
  console.log(`Fetching places for ${cities.length} cities`);
  for (const city of cities) {
    try {
      const file = await fetchCity(city.slug, city.box);
      fs.writeFileSync(path.join(OUT_DIR, `${city.slug}.json`), JSON.stringify(file));
      console.log(`  ${city.name.padEnd(18)} metros ${String(file.metros.length).padStart(4)}  landmarks ${String(file.landmarks.length).padStart(5)}`);
    } catch (error) {
      console.error(`  ${city.name}: ${error instanceof Error ? error.message : error}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 4000)); // be polite to the public Overpass server
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
