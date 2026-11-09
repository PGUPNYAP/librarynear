/**
 * Give libraries the locality their own address states, when Google filed
 * them under a sub-area (e.g. "...Laxmi Nagar, Delhi 110092" saved as
 * locality "Shakarpur").
 *
 * Only libraries whose address mentions the locality AND that lie within
 * --km of the given point are changed (avoids same-named colonies elsewhere).
 *
 *   npx tsx scripts/relabel-locality.ts --city Delhi --locality "Laxmi Nagar" \
 *     --match "laxmi nagar|lakshmi nagar|luxmi nagar" --near 28.6306,77.2774 --km 2.5
 *   ...same... --apply
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const APPLY = process.argv.includes("--apply");
const city = arg("city");
const locality = arg("locality");
const match = (arg("match") ?? locality ?? "").split("|").map((value) => value.trim().toLowerCase()).filter(Boolean);
const [nearLat, nearLng] = (arg("near") ?? "").split(",").map(Number);
const maxKm = Number(arg("km") ?? 2.5);

if (!city || !locality || match.length === 0 || !Number.isFinite(nearLat) || !Number.isFinite(nearLng)) {
  console.error("Usage: --city <City> --locality <Name> --match <a|b> --near <lat,lng> [--km 2.5] [--apply]");
  process.exit(1);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

function km(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const h =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function main() {
  const filter = match.flatMap((term) => [`formatted_address.ilike.%${term}%`, `full_address.ilike.%${term}%`]).join(",");
  const { data, error } = await supabase
    .from("library_branches")
    .select("id, slug, display_name, locality, formatted_address, full_address, latitude, longitude")
    .eq("is_active", true)
    .eq("city", city!)
    .or(filter)
    .limit(2000);
  if (error) throw error;

  const renamed = (name: string, oldLocality: string | null) => {
    if (!oldLocality) return name;
    const suffix = `, ${oldLocality}`;
    if (!name.endsWith(suffix)) return name;
    const base = name.slice(0, -suffix.length).trim();
    // "STS Library - Laxmi Nagar, Arjun Park" -> "STS Library - Laxmi Nagar"
    return base.toLowerCase().includes(locality!.toLowerCase()) ? base : `${base}, ${locality}`;
  };

  const rows = (data ?? []).filter((row) => {
    if (row.locality?.toLowerCase() === locality!.toLowerCase()) return false;
    if (typeof row.latitude !== "number" || typeof row.longitude !== "number") return false;
    return km(nearLat, nearLng, row.latitude, row.longitude) <= maxKm;
  });

  fs.mkdirSync("reports", { recursive: true });
  const file = `reports/relabel-${locality!.toLowerCase().replace(/\s+/g, "-")}${APPLY ? "-applied" : "-dry-run"}.csv`;
  const csv = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  fs.writeFileSync(
    file,
    ["id,slug,old_name,new_name,old_locality,new_locality,address", ...rows.map((row) =>
      [row.id, row.slug, row.display_name, renamed(row.display_name, row.locality), row.locality, locality, row.formatted_address ?? row.full_address]
        .map(csv)
        .join(","),
    )].join("\n"),
  );

  const from: Record<string, number> = {};
  for (const row of rows) from[row.locality ?? "(none)"] = (from[row.locality ?? "(none)"] ?? 0) + 1;
  console.log(`${rows.length} libraries -> "${locality}" (from: ${JSON.stringify(from)})`);
  console.log(`Report / backup: ${file}`);
  if (!APPLY) return console.log("Dry run only. Re-run with --apply.");

  for (const row of rows) {
    const { error: updateError } = await supabase
      .from("library_branches")
      .update({ locality, display_name: renamed(row.display_name, row.locality) })
      .eq("id", row.id);
    if (updateError) console.error(`Failed ${row.slug}: ${updateError.message}`);
  }
  console.log("Applied.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
