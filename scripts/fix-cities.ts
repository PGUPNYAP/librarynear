/**
 * Fix library city/state data.
 *
 * Every library was imported with city = "Delhi", state = "Delhi". This script
 * works out the real city from (in order) the PIN code, the district and the
 * Google formatted address, then:
 *   - dry run (default): writes reports/city-fix-dry-run.csv and prints a summary
 *   - --apply: updates city/state, upserts localities and sets locality_id
 *
 * Rows outside India (e.g. Singapore) are reported, and with --apply they are
 * set is_active = false so they stop appearing on the site.
 *
 * Usage:
 *   npx tsx scripts/fix-cities.ts            # dry run
 *   npx tsx scripts/fix-cities.ts --apply    # write changes
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const APPLY = process.argv.includes("--apply");

type Row = {
  id: string;
  slug: string;
  city: string;
  state: string | null;
  district: string | null;
  locality: string | null;
  pin_code: string | null;
  formatted_address: string | null;
  full_address: string | null;
  is_active: boolean | null;
  locality_id: string | null;
};

// 3- or 4-digit PIN prefixes that map unambiguously to a city.
const PIN_PREFIX_CITY: Array<[string, string, string]> = [
  ["110", "Delhi", "Delhi"],
  ["2013", "Noida", "Uttar Pradesh"],
  ["2010", "Ghaziabad", "Uttar Pradesh"],
  ["2011", "Ghaziabad", "Uttar Pradesh"],
  ["2012", "Ghaziabad", "Uttar Pradesh"],
  ["122", "Gurugram", "Haryana"],
  ["121", "Faridabad", "Haryana"],
  ["560", "Bengaluru", "Karnataka"],
  ["500", "Hyderabad", "Telangana"],
  ["400", "Mumbai", "Maharashtra"],
  ["600", "Chennai", "Tamil Nadu"],
  ["700", "Kolkata", "West Bengal"],
  ["411", "Pune", "Maharashtra"],
  ["226", "Lucknow", "Uttar Pradesh"],
  ["211", "Prayagraj", "Uttar Pradesh"],
  ["221", "Varanasi", "Uttar Pradesh"],
  ["250", "Meerut", "Uttar Pradesh"],
  ["208", "Kanpur", "Uttar Pradesh"],
  ["224", "Ayodhya", "Uttar Pradesh"],
  ["276", "Azamgarh", "Uttar Pradesh"],
  ["302", "Jaipur", "Rajasthan"],
  ["380", "Ahmedabad", "Gujarat"],
  ["160", "Chandigarh", "Chandigarh"],
  ["800", "Patna", "Bihar"],
  ["751", "Bhubaneswar", "Odisha"],
  ["452", "Indore", "Madhya Pradesh"],
  ["462", "Bhopal", "Madhya Pradesh"],
];

// District / zone names (as Google returns them) -> city.
const DISTRICT_CITY: Array<[RegExp, string, string]> = [
  [/delhi|shahdara|narela|najafgarh|rohini|keshav ?puram|civil lines|city & sadar|karol bagh|^central$|^south$|^north$|^west$|^east$/i, "Delhi", "Delhi"],
  [/hyderabad|medchal|malkajgiri|ranga ?reddy|sangareddy/i, "Hyderabad", "Telangana"],
  [/bengaluru|bangalore/i, "Bengaluru", "Karnataka"],
  [/mumbai/i, "Mumbai", "Maharashtra"],
  [/gautam buddha nagar|noida/i, "Noida", "Uttar Pradesh"],
  [/gurgaon|gurugram/i, "Gurugram", "Haryana"],
  [/ghaziabad/i, "Ghaziabad", "Uttar Pradesh"],
  [/faridabad/i, "Faridabad", "Haryana"],
  [/chennai/i, "Chennai", "Tamil Nadu"],
  [/kolkata/i, "Kolkata", "West Bengal"],
  [/lucknow/i, "Lucknow", "Uttar Pradesh"],
  [/prayagraj|allahabad/i, "Prayagraj", "Uttar Pradesh"],
  [/varanasi/i, "Varanasi", "Uttar Pradesh"],
  [/meerut/i, "Meerut", "Uttar Pradesh"],
  [/pune/i, "Pune", "Maharashtra"],
];

// First two PIN digits -> state (India Post postal circles).
function stateFromPin(pin: string): string | null {
  const two = Number(pin.slice(0, 2));
  const three = Number(pin.slice(0, 3));
  if (two === 11) return "Delhi";
  if (two === 12 || two === 13) return "Haryana";
  if (three === 160) return "Chandigarh";
  if (two >= 14 && two <= 16) return "Punjab";
  if (two === 17) return "Himachal Pradesh";
  if (two === 18 || two === 19) return "Jammu and Kashmir";
  if (three >= 246 && three <= 263) return "Uttarakhand";
  if (two >= 20 && two <= 28) return "Uttar Pradesh";
  if (two >= 30 && two <= 34) return "Rajasthan";
  if (two >= 36 && two <= 39) return "Gujarat";
  if (two >= 40 && two <= 44) return "Maharashtra";
  if (two >= 45 && two <= 48) return "Madhya Pradesh";
  if (two === 49) return "Chhattisgarh";
  if (two === 50) return "Telangana";
  if (two >= 51 && two <= 53) return "Andhra Pradesh";
  if (two >= 56 && two <= 59) return "Karnataka";
  if (two >= 60 && two <= 64) return "Tamil Nadu";
  if (two >= 67 && two <= 69) return "Kerala";
  if (two >= 70 && two <= 74) return "West Bengal";
  if (two >= 75 && two <= 77) return "Odisha";
  if (two === 78) return "Assam";
  if (two === 79) return "North East";
  if (two === 82 || two === 83) return "Jharkhand";
  if (two >= 80 && two <= 85) return "Bihar";
  return null;
}

// Suburban districts that people search as part of the metro city.
const METRO_REGION: Record<string, string> = {
  Howrah: "Kolkata",
  Hooghly: "Kolkata",
  "North 24 Parganas": "Kolkata",
  "South 24 Parganas": "Kolkata",
  Chengalpattu: "Chennai",
  Thiruvallur: "Chennai",
  Kanchipuram: "Chennai",
};

const ZONE_LIKE = /zone|corporation|ward|circle|municipal|division/i;

const NON_INDIA = /singapore|malaysia|nepal|dubai|united arab emirates|usa|united states|united kingdom/i;

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** "..., Dasanapura, Karnataka 562162, India" -> { city: "Dasanapura", state: "Karnataka", pin: "562162" } */
function parseAddress(address: string | null) {
  if (!address) return null;
  const text = address.trim().replace(/,\s*India\s*$/i, "");
  // "..., Prayagraj, Uttar Pradesh 211011" or "..., Gurgaon, Haryana, 122010"
  const match = /,\s*([^,]+?),\s*([A-Za-z .&]+?),?\s+(\d{6})\s*$/.exec(text);
  if (match) return { city: match[1].trim(), state: match[2].trim(), pin: match[3] };
  const pinOnly = /(\d{6})\s*$/.exec(text);
  return pinOnly ? { city: "", state: "", pin: pinOnly[1] } : null;
}

type Resolution = { city: string; state: string | null; source: string; pin?: string | null; outsideIndia?: boolean };

function resolve(row: Row): Resolution | null {
  const result = resolveRaw(row);
  if (result && !result.outsideIndia && METRO_REGION[result.city]) {
    return { ...result, city: METRO_REGION[result.city], source: `${result.source}+metro-region` };
  }
  return result;
}

function resolveRaw(row: Row): Resolution | null {
  const address = row.formatted_address ?? row.full_address ?? "";
  if (NON_INDIA.test(address) || NON_INDIA.test(row.district ?? "")) {
    return { city: row.city, state: row.state, source: "outside-india", outsideIndia: true };
  }

  const parsed = parseAddress(address);
  // The PIN inside Google's formatted address is reliable; the stored
  // pin_code column is often a placeholder (e.g. 560136) or wrong.
  const addressPin = parsed?.pin ?? null;
  const storedPin = row.pin_code && /^\d{6}$/.test(row.pin_code) ? row.pin_code : null;
  const pinFix = addressPin && addressPin !== storedPin ? addressPin : null;

  const byPin = (pin: string | null, source: string): Resolution | null => {
    if (!pin) return null;
    const hit = PIN_PREFIX_CITY.find(([prefix]) => pin.startsWith(prefix));
    return hit ? { city: hit[1], state: hit[2], source: `${source}:${hit[0]}`, pin: pinFix } : null;
  };

  const fromAddressPin = byPin(addressPin, "address-pin");
  if (fromAddressPin) return fromAddressPin;

  if (row.district) {
    const hit = DISTRICT_CITY.find(([pattern]) => pattern.test(row.district!.trim()));
    if (hit) return { city: hit[1], state: hit[2], source: "district", pin: pinFix };
  }

  if (parsed?.city) {
    const hit = DISTRICT_CITY.find(([pattern]) => pattern.test(parsed.city));
    if (hit) return { city: hit[1], state: hit[2], source: "address-city", pin: pinFix };
  }

  // Smaller towns: use the district (or address city) as the city.
  if (addressPin && (row.district || parsed?.city)) {
    const district = row.district && !ZONE_LIKE.test(row.district) ? row.district : null;
    const raw = district ?? (parsed?.city && !ZONE_LIKE.test(parsed.city) ? parsed.city : null);
    if (!raw) return byPin(storedPin, "stored-pin");
    const name = raw.replace(/\s+district$/i, "").trim();
    return {
      city: titleCase(name),
      state: parsed?.state || stateFromPin(addressPin),
      source: "district-generic",
      pin: pinFix,
    };
  }

  const fromStoredPin = byPin(storedPin, "stored-pin");
  if (fromStoredPin) return fromStoredPin;

  return null;
}

async function fetchAll(): Promise<Row[]> {
  const rows: Row[] = [];
  for (let page = 0; page < 100; page++) {
    const { data, error } = await supabase
      .from("library_branches")
      .select("id, slug, city, state, district, locality, pin_code, formatted_address, full_address, is_active, locality_id")
      .order("id")
      .range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...(data as Row[]));
    if (data.length < 1000) break;
  }
  return rows;
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function main() {
  const rows = await fetchAll();
  console.log(`Loaded ${rows.length} libraries`);

  const changes: Array<{ row: Row; next: Resolution }> = [];
  const unresolved: Row[] = [];
  const outside: Row[] = [];
  const transitions = new Map<string, number>();

  for (const row of rows) {
    const next = resolve(row);
    if (!next) {
      unresolved.push(row);
      continue;
    }
    if (next.outsideIndia) {
      outside.push(row);
      continue;
    }
    if (next.city !== row.city || (next.state && next.state !== row.state) || next.pin) {
      changes.push({ row, next });
      const key = `${row.city} -> ${next.city}`;
      transitions.set(key, (transitions.get(key) ?? 0) + 1);
    }
  }

  const reportDir = path.join(process.cwd(), "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const lines = [
    ["id", "slug", "old_city", "old_state", "new_city", "new_state", "source", "district", "pin_code", "new_pin_code", "locality", "formatted_address"].join(","),
    ...changes.map(({ row, next }) =>
      [row.id, row.slug, row.city, row.state, next.city, next.state, next.source, row.district, row.pin_code, next.pin ?? "", row.locality, row.formatted_address]
        .map(csvCell)
        .join(","),
    ),
    ...outside.map((row) =>
      [row.id, row.slug, row.city, row.state, "(deactivate)", "", "outside-india", row.district, row.pin_code, "", row.locality, row.formatted_address]
        .map(csvCell)
        .join(","),
    ),
    ...unresolved.map((row) =>
      [row.id, row.slug, row.city, row.state, "(unresolved)", "", "", row.district, row.pin_code, "", row.locality, row.formatted_address]
        .map(csvCell)
        .join(","),
    ),
  ];
  const reportPath = path.join(reportDir, APPLY ? "city-fix-applied.csv" : "city-fix-dry-run.csv");
  fs.writeFileSync(reportPath, lines.join("\n"), "utf8");

  const finalCounts = new Map<string, number>();
  for (const row of rows) {
    if (outside.includes(row)) continue;
    const change = changes.find((entry) => entry.row.id === row.id);
    const city = change ? change.next.city : row.city;
    finalCounts.set(city, (finalCounts.get(city) ?? 0) + 1);
  }

  console.log(`\nWould change: ${changes.length}  |  outside India: ${outside.length}  |  unresolved (left as is): ${unresolved.length}`);
  console.log("\nTop transitions:");
  for (const [key, count] of [...transitions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
    console.log(`  ${count.toString().padStart(6)}  ${key}`);
  }
  console.log("\nLibraries per city after fix (top 30):");
  for (const [city, count] of [...finalCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
    console.log(`  ${count.toString().padStart(6)}  ${city}`);
  }
  console.log(`\nReport: ${reportPath}`);

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to write changes.");
    return;
  }

  // ---- apply ----
  let done = 0;
  for (const { row, next } of changes) {
    const { error } = await supabase
      .from("library_branches")
      .update({ city: next.city, state: next.state ?? row.state, ...(next.pin ? { pin_code: next.pin } : {}) })
      .eq("id", row.id);
    if (error) console.error(`Failed ${row.slug}: ${error.message}`);
    done++;
    if (done % 500 === 0) console.log(`  updated ${done}/${changes.length}`);
  }
  for (const row of outside) {
    await supabase.from("library_branches").update({ is_active: false }).eq("id", row.id);
  }

  // Re-link every library to the correct locality row (city, name).
  console.log("Re-linking localities…");
  const fresh = await fetchAll();
  const pairs = new Map<string, { city: string; name: string }>();
  for (const row of fresh) {
    const name = row.locality?.trim();
    if (!name || !row.city) continue;
    pairs.set(`${row.city}::${name}`, { city: row.city, name });
  }
  const pairList = [...pairs.values()];
  for (let i = 0; i < pairList.length; i += 500) {
    const chunk = pairList.slice(i, i + 500).map((pair) => ({
      city: pair.city,
      name: pair.name,
      slug: pair.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    }));
    const { error } = await supabase.from("localities").upsert(chunk, { onConflict: "city,name", ignoreDuplicates: true });
    if (error) console.error("locality upsert failed:", error.message);
  }
  const localityIds = new Map<string, string>();
  for (let page = 0; page < 100; page++) {
    const { data } = await supabase.from("localities").select("id, city, name").order("id").range(page * 1000, page * 1000 + 999);
    if (!data || data.length === 0) break;
    for (const loc of data) localityIds.set(`${loc.city}::${loc.name}`, loc.id);
    if (data.length < 1000) break;
  }
  let relinked = 0;
  for (const row of fresh) {
    const name = row.locality?.trim();
    if (!name) continue;
    const id = localityIds.get(`${row.city}::${name}`);
    if (id && id !== row.locality_id) {
      await supabase.from("library_branches").update({ locality_id: id }).eq("id", row.id);
      relinked++;
    }
  }
  // Move sales assignments whose locality now lives in a different city.
  const libraryLocalityIds = new Set(
    fresh
      .map((row) => (row.locality ? localityIds.get(`${row.city}::${row.locality.trim()}`) : undefined))
      .filter(Boolean) as string[],
  );
  const { data: assignments } = await supabase
    .from("sales_locality_assignments")
    .select("id, user_id, city, locality, locality_id");
  let movedAssignments = 0;
  for (const assignment of assignments ?? []) {
    if (assignment.locality_id && libraryLocalityIds.has(assignment.locality_id)) continue;
    const homes = [...localityIds.entries()].filter(
      ([key, id]) => key.endsWith(`::${assignment.locality}`) && libraryLocalityIds.has(id),
    );
    if (homes.length !== 1) continue;
    const [key, id] = homes[0];
    const { error } = await supabase
      .from("sales_locality_assignments")
      .update({ city: key.split("::")[0], locality_id: id })
      .eq("id", assignment.id);
    if (!error) movedAssignments++;
  }
  console.log(`Moved ${movedAssignments} sales assignments to their locality's new city.`);

  console.log(`Applied. Updated ${changes.length} cities, deactivated ${outside.length}, re-linked ${relinked} locality ids.`);
  console.log("Next: refresh the search index (select public.refresh_search_branches();) and revalidate the site cache.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
