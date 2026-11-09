/**
 * Recompute the stored profile_completeness_score for every library so the
 * admin/sales "sort by score" (done in the database) matches the live score.
 *   npx tsx scripts/recompute-scores.ts            # dry run: prints how many differ
 *   npx tsx scripts/recompute-scores.ts --apply
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { calculateLibraryProfileCompleteness } from "../src/lib/library-profile-score";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const APPLY = process.argv.includes("--apply");

async function main() {
  let changed = 0;
  let total = 0;
  for (let page = 0; page < 100; page++) {
    const { data, error } = await supabase
      .from("library_branches")
      .select(
        "id, profile_completeness_score, display_name, city, locality, full_address, formatted_address, pin_code, phone_number, whatsapp_number, map_link, opening_time, closing_time, nearest_metro, nearest_metro_distance_km, description, amenities_text, total_seats, library_fee_plans(id, is_active), library_images(id)",
      )
      .order("id")
      .range(page * 500, page * 500 + 499);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      total++;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const score = calculateLibraryProfileCompleteness(row as any);
      if (score !== row.profile_completeness_score) {
        changed++;
        if (APPLY) await supabase.from("library_branches").update({ profile_completeness_score: score }).eq("id", row.id);
      }
    }
    if (data.length < 500) break;
  }
  console.log(`${changed} of ${total} libraries have a stale score${APPLY ? " (updated)" : " (dry run)"}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
