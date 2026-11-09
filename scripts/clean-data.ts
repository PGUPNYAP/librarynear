/**
 * Data cleanup for library listings.
 *
 *  1. Builds src/data/metro-stations-india.json from Delhi's curated station
 *     list + OpenStreetMap stations for every other city (src/data/places).
 *  2. Tidies library names (spacing, stray commas, SHOUTING CAPS, trailing city).
 *  3. Merges locality spellings that differ only in case/spacing/punctuation.
 *  4. Recalculates nearest metro from coordinates (within 2.5 km, else none).
 *
 *   npx tsx scripts/clean-data.ts           # dry run: reports/clean-data-dry-run.csv
 *   npx tsx scripts/clean-data.ts --apply   # writes changes (backup CSV first)
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const MAX_METRO_KM = 2.5;
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

type Station = [string, number, number, string];

// ---------------------------------------------------------------------------
// 1. Station list
// ---------------------------------------------------------------------------
function buildStations(): Station[] {
  const stations: Station[] = [];
  const seen = new Set<string>();
  const add = (name: string, lat: number, lng: number, line: string) => {
    const key = `${name.toLowerCase()}|${lat.toFixed(3)}|${lng.toFixed(3)}`;
    if (seen.has(key)) return;
    seen.add(key);
    stations.push([name, lat, lng, line]);
  };
  const delhi = JSON.parse(fs.readFileSync("src/data/delhi-metro-stations.json", "utf8")) as Array<{
    station_name: string;
    line_name: string;
    latitude: number;
    longitude: number;
  }>;
  for (const station of delhi) add(station.station_name, station.latitude, station.longitude, station.line_name || "Delhi Metro");
  const dir = path.join("src", "data", "places");
  for (const file of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const places = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as { metros: Array<[string, number, number]> };
    for (const [name, lat, lng] of places.metros) add(name, lat, lng, "");
  }
  fs.writeFileSync("src/data/metro-stations-india.json", JSON.stringify(stations));
  return stations;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function nearestStation(stations: Station[], lat: number, lng: number) {
  let best: Station | null = null;
  let bestKm = Infinity;
  for (const station of stations) {
    if (Math.abs(station[1] - lat) > 0.05 || Math.abs(station[2] - lng) > 0.05) continue; // ~5 km box
    const km = haversineKm(lat, lng, station[1], station[2]);
    if (km < bestKm) {
      best = station;
      bestKm = km;
    }
  }
  return best && bestKm <= MAX_METRO_KM ? { name: best[0], line: best[3] || null, km: Math.round(bestKm * 100) / 100 } : null;
}

// ---------------------------------------------------------------------------
// 2. Names
// ---------------------------------------------------------------------------
const KEEP_UPPER = /^(IAS|IPS|UPSC|SSC|NEET|JEE|CA|CS|AC|DU|IIT|NIT|DTU|JNU|AIIMS|RO|PG|IT|BHU|CBSE|NCR|II|III|IV|VI|VII|VIII|IX|XI|XII)$/;
const LOWER_WORDS = new Set(["of", "and", "the", "for", "in", "at", "by", "to", "on"]);

const COMMON_SHORT = new Set(["THE", "AND", "FOR", "OF", "IN", "AT", "BY", "TO", "ON", "NEW", "OLD", "ROAD", "HALL", "ROOM", "CLUB", "HOME", "CITY", "GALI", "MARG", "PARK", "NEAR", "STUDY", "SELF", "LIB"]);

function smartCase(word: string, index: number) {
  if (!/[a-z]/i.test(word)) return word;
  const bare = word.replace(/[^A-Za-z]/g, "");
  if (KEEP_UPPER.test(bare.toUpperCase()) && bare.length <= 4) return word.toUpperCase();
  // Short all-caps words are acronyms when they're 2 letters or unpronounceable
  // (KKC, CS, DK); pronounceable ones are ordinary words (GYAN, SYED, GHAT).
  if (bare.length <= 4 && bare === bare.toUpperCase() && !COMMON_SHORT.has(bare)) {
    if (bare.length <= 2 || !/[AEIOU]/.test(bare)) return word;
  }
  const lower = word.toLowerCase();
  if (index > 0 && LOWER_WORDS.has(lower)) return lower;
  return lower.replace(/(^|[-(/])([a-z])/g, (_, prefix: string, letter: string) => prefix + letter.toUpperCase());
}

export function tidyName(raw: string, city: string) {
  let name = raw
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,(?=\S)/g, ", ")
    .replace(/[,\s\-|]+$/g, "")
    .replace(/^[,\s\-|]+/g, "")
    .trim();

  // Drop a trailing city ("... Mukherjee Nagar Delhi" / "..., New Delhi") when more remains.
  const cityPattern = new RegExp(`(,?\\s+(new\\s+)?${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})$`, "i");
  const withoutCity = name.replace(cityPattern, "").trim();
  if (withoutCity.split(" ").length >= 2) name = withoutCity;

  // Judge capitalisation on the name itself, not the ", Locality" suffix added at import.
  const commaAt = name.indexOf(", ");
  const head = commaAt > 0 ? name.slice(0, commaAt) : name;
  const tail = commaAt > 0 ? name.slice(commaAt) : "";
  const letters = head.replace(/[^A-Za-z]/g, "");
  const upper = letters.replace(/[^A-Z]/g, "").length;
  const shouting = letters.length >= 6 && upper / letters.length > 0.7;
  const allLower = letters.length >= 4 && upper === 0;
  const fixWord = (word: string, index: number) => (/^[A-Z'’]{5,}[,.]?$/.test(word) ? smartCase(word, index) : word);
  const fixedHead =
    shouting || allLower
      ? head.split(" ").map((word, index) => smartCase(word, index)).join(" ")
      : head.split(" ").map(fixWord).join(" ");
  const fixedTail = tail.split(" ").map((word, index) => (index === 0 ? word : fixWord(word, index))).join(" ");
  return fixedHead + fixedTail;
}

function tidyLocality(raw: string) {
  const name = raw.replace(/\s+/g, " ").replace(/\s+,/g, ",").replace(/[,\s]+$/g, "").trim();
  // A single short all-caps word is an acronym (MIDC, HUDA): leave it.
  if (/^[A-Z]{2,5}$/.test(name)) return name;
  const letters = name.replace(/[^A-Za-z]/g, "");
  const upper = letters.replace(/[^A-Z]/g, "").length;
  if ((letters.length >= 4 && upper / letters.length > 0.7) || (letters.length >= 4 && upper === 0)) {
    return name
      .split(" ")
      .map((word, index) => smartCase(word, index))
      .join(" ");
  }
  return name;
}

const localityKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

// ---------------------------------------------------------------------------
type Row = {
  id: string;
  slug: string;
  city: string;
  display_name: string;
  locality: string | null;
  latitude: number | null;
  longitude: number | null;
  nearest_metro: string | null;
  nearest_metro_line: string | null;
  nearest_metro_distance_km: number | null;
};

async function fetchAll(): Promise<Row[]> {
  const rows: Row[] = [];
  for (let page = 0; page < 30; page++) {
    const { data, error } = await supabase
      .from("library_branches")
      .select("id, slug, city, display_name, locality, latitude, longitude, nearest_metro, nearest_metro_line, nearest_metro_distance_km")
      .eq("is_active", true)
      .order("id")
      .range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as Row[]));
    if (data.length < 1000) break;
  }
  return rows;
}

const csv = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

async function main() {
  const stations = buildStations();
  console.log(`Stations: ${stations.length} (src/data/metro-stations-india.json)`);
  const rows = await fetchAll();
  console.log(`Libraries: ${rows.length}`);

  // Most common spelling per (city, locality key)
  const spellings = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!row.locality) continue;
    const tidy = tidyLocality(row.locality);
    const key = `${row.city}|${localityKey(tidy)}`;
    const counts = spellings.get(key) ?? new Map<string, number>();
    counts.set(tidy, (counts.get(tidy) ?? 0) + 1);
    spellings.set(key, counts);
  }
  const canonicalLocality = (city: string, locality: string) => {
    const tidy = tidyLocality(locality);
    const counts = spellings.get(`${city}|${localityKey(tidy)}`);
    if (!counts) return tidy;
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || (/[a-z]/.test(b[0]) ? 1 : -1))[0][0];
  };

  const changes: Array<{ row: Row; patch: Record<string, unknown> }> = [];
  let names = 0;
  let localities = 0;
  let metrosChanged = 0;
  let metrosCleared = 0;
  for (const row of rows) {
    const patch: Record<string, unknown> = {};
    const name = tidyName(row.display_name, row.city);
    if (name && name !== row.display_name) {
      patch.display_name = name;
      names++;
    }
    if (row.locality) {
      const locality = canonicalLocality(row.city, row.locality);
      if (locality !== row.locality) {
        patch.locality = locality;
        localities++;
      }
    }
    if (typeof row.latitude === "number" && typeof row.longitude === "number") {
      const metro = nearestStation(stations, row.latitude, row.longitude);
      if (metro) {
        if (metro.name !== row.nearest_metro || Math.abs((row.nearest_metro_distance_km ?? -1) - metro.km) > 0.05) {
          patch.nearest_metro = metro.name;
          patch.nearest_metro_line = metro.line;
          patch.nearest_metro_distance_km = metro.km;
          metrosChanged++;
        }
      } else if (row.nearest_metro && (row.nearest_metro_distance_km ?? 0) > 5) {
        // Our station list may miss some systems, so only clear values that are clearly wrong.
        patch.nearest_metro = null;
        patch.nearest_metro_line = null;
        patch.nearest_metro_distance_km = null;
        metrosCleared++;
      }
    } else if (row.nearest_metro && (row.nearest_metro_distance_km ?? 0) > 5) {
      patch.nearest_metro = null;
      patch.nearest_metro_line = null;
      patch.nearest_metro_distance_km = null;
      metrosCleared++;
    }
    if (Object.keys(patch).length) changes.push({ row, patch });
  }

  fs.mkdirSync("reports", { recursive: true });
  const header = "id,slug,city,old_name,new_name,old_locality,new_locality,old_metro,new_metro,new_metro_km";
  const lines = changes.map(({ row, patch }) =>
    [
      row.id,
      row.slug,
      row.city,
      row.display_name,
      patch.display_name ?? "",
      row.locality ?? "",
      patch.locality ?? "",
      row.nearest_metro ?? "",
      "nearest_metro" in patch ? patch.nearest_metro ?? "(none)" : "",
      patch.nearest_metro_distance_km ?? "",
    ]
      .map(csv)
      .join(","),
  );
  const report = APPLY ? "reports/clean-data-applied.csv" : "reports/clean-data-dry-run.csv";
  fs.writeFileSync(report, [header, ...lines].join("\n"));
  console.log(`Changes: ${changes.length} libraries | names ${names} | localities ${localities} | metros set/updated ${metrosChanged} | metros removed (stored distance over 5 km) ${metrosCleared}`);
  console.log(`Report (old and new values, also the backup): ${report}`);

  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply.");
    return;
  }
  let done = 0;
  for (const { row, patch } of changes) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await supabase.from("library_branches").update(patch).eq("id", row.id);
      if (!error) break;
      if (attempt === 2) console.error(`Failed ${row.slug}: ${error.message}`);
    }
    if (++done % 500 === 0) console.log(`  updated ${done}/${changes.length}`);
  }
  console.log("Applied.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
