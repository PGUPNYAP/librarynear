import { supabaseServer } from "@/lib/supabase-server";
import { getActiveCities } from "@/lib/cities-server";
import { getSiteUrl } from "@/lib/site-url";
import { citySlug } from "@/lib/places";
import { buildAnswerSummary } from "@/lib/library-seo";
import { parseAmenitiesText } from "@/lib/library-filters";

// Regenerated once a day and served from the CDN.
export const revalidate = 86400;

const MAX_LIBRARIES = 1500;

type Row = {
  slug: string;
  city: string;
  display_name: string;
  locality: string | null;
  nearest_metro: string | null;
  nearest_metro_distance_km: number | null;
  total_seats: number | null;
  aggregate_rating: number | null;
  review_count: number | null;
  amenities_text: string | null;
  opening_time: string | null;
  closing_time: string | null;
  verification_status: string | null;
  library_fee_plans: Array<{ price: number; discounted_price: number | null; is_active: boolean | null }> | null;
};

export async function GET() {
  const siteUrl = getSiteUrl();
  const cities = await getActiveCities();
  const total = cities.reduce((sum, city) => sum + city.libraryCount, 0);

  const rows: Row[] = [];
  for (let page = 0; rows.length < MAX_LIBRARIES && page < 10; page++) {
    const { data, error } = await supabaseServer
      .from("library_branches")
      .select(
        "slug, city, display_name, locality, nearest_metro, nearest_metro_distance_km, total_seats, aggregate_rating, review_count, amenities_text, opening_time, closing_time, verification_status, library_fee_plans(price, discounted_price, is_active)",
      )
      .eq("is_active", true)
      .order("profile_completeness_score", { ascending: false, nullsFirst: false })
      .order("id")
      .range(page * 500, page * 500 + 499);
    if (error || !data || data.length === 0) break;
    rows.push(...(data as unknown as Row[]));
    if (data.length < 500) break;
  }

  const lines: string[] = [
    "# LibraryNear: full reference",
    "",
    `> LibraryNear lists ${total.toLocaleString("en-IN")} study libraries and reading rooms in ${cities.length} Indian cities. This file is regenerated daily from the live database.`,
    "",
    "## Cities",
    "",
    ...cities.map((city) => `- [${city.name}](${siteUrl}/${city.slug}): ${city.libraryCount.toLocaleString("en-IN")} libraries${city.state ? `, ${city.state}` : ""}`),
    "",
    `## Library summaries (top ${rows.length} by profile completeness)`,
    "",
  ];

  for (const row of rows) {
    const summary = buildAnswerSummary({
      ...row,
      amenities: parseAmenitiesText(row.amenities_text),
      feePlans: (row.library_fee_plans ?? []).filter((plan) => plan.is_active !== false),
    });
    lines.push(`- [${row.display_name}](${siteUrl}/${citySlug(row.city)}/library/${row.slug}): ${summary}`);
  }

  lines.push("", "Source: LibraryNear. Fees and amenities are reported by libraries; confirm with the library before paying.", "");

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
