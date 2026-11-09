import "server-only";

import { unstable_cache } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { runLibraryCardQuery, withCardImage, type LibraryCardData } from "@/lib/library-card-data";
import { amenityOrFilter, type AmenityDefinition } from "@/lib/amenities";
import { slugToIlikePattern } from "@/lib/places";

const isDev = process.env.NODE_ENV === "development";

export type CardWithImage = LibraryCardData & { coverImageUrl: string | null };

async function librariesByAmenity(city: string, amenitySlug: string, amenityOr: string, localitySlug: string | null) {
  void amenitySlug;
  const rows = await runLibraryCardQuery((selectClause) => {
    let query = supabaseServer
      .from("library_branches")
      .select(selectClause)
      .eq("is_active", true)
      .eq("city", city)
      .or(amenityOr)
      .order("profile_completeness_score", { ascending: false })
      .limit(60);
    if (localitySlug) query = query.ilike("locality", slugToIlikePattern(localitySlug));
    return query;
  });
  return rows.map(withCardImage) as CardWithImage[];
}

const cachedLibrariesByAmenity = unstable_cache(librariesByAmenity, ["place-libraries-by-amenity-v1"], {
  revalidate: 3600,
  tags: ["library-cards"],
});

export function getLibrariesByAmenity(city: string, amenity: AmenityDefinition, localitySlug: string | null = null) {
  const fn = isDev ? librariesByAmenity : cachedLibrariesByAmenity;
  return fn(city, amenity.slug, amenityOrFilter(amenity), localitySlug);
}

async function librariesByLocality(city: string, localitySlug: string) {
  const rows = await runLibraryCardQuery((selectClause) =>
    supabaseServer
      .from("library_branches")
      .select(selectClause)
      .eq("is_active", true)
      .eq("city", city)
      .ilike("locality", slugToIlikePattern(localitySlug))
      .order("profile_completeness_score", { ascending: false })
      .limit(200),
  );
  return rows.map(withCardImage) as CardWithImage[];
}

const cachedLibrariesByLocality = unstable_cache(librariesByLocality, ["place-libraries-by-locality-v1"], {
  revalidate: 3600,
  tags: ["library-cards"],
});

export function getLibrariesByLocalitySlug(city: string, localitySlug: string) {
  return (isDev ? librariesByLocality : cachedLibrariesByLocality)(city, localitySlug);
}

/**
 * When a locality has no libraries in the requested city, find the city it
 * really belongs to (used to 308 old /delhi/locality/x URLs after the city
 * data fix).
 */
async function findLocalityCity(localitySlug: string): Promise<string | null> {
  const { data } = await supabaseServer
    .from("library_branches")
    .select("city")
    .eq("is_active", true)
    .ilike("locality", slugToIlikePattern(localitySlug))
    .limit(20);
  const counts = new Map<string, number>();
  for (const row of data ?? []) counts.set(row.city, (counts.get(row.city) ?? 0) + 1);
  // Only redirect when the locality clearly belongs to one other city; a single
  // stray library (e.g. one "Laxmi Nagar" in Mumbai) must not hijack a Delhi URL.
  const entries = [...counts.entries()];
  return entries.length === 1 && entries[0][1] >= 2 ? entries[0][0] : null;
}

const cachedFindLocalityCity = unstable_cache(findLocalityCity, ["place-locality-city-v1"], {
  revalidate: 86400,
  tags: ["library-cards"],
});

export function getLocalityHomeCity(localitySlug: string) {
  return (isDev ? findLocalityCity : cachedFindLocalityCity)(localitySlug);
}

export type FeeStats = { libraries: number; withFees: number; min: number | null; median: number | null; max: number | null };

/** Fee statistics for a set of library ids (monthly-ish plans, effective price). */
async function feeStatsForLibraries(ids: string[]): Promise<FeeStats> {
  if (ids.length === 0) return { libraries: 0, withFees: 0, min: null, median: null, max: null };
  const { data } = await supabaseServer
    .from("library_fee_plans")
    .select("library_branch_id, price, discounted_price, is_active")
    .in("library_branch_id", ids.slice(0, 300));
  const cheapestByLibrary = new Map<string, number>();
  for (const plan of data ?? []) {
    if (plan.is_active === false) continue;
    const price = plan.discounted_price ?? plan.price;
    if (typeof price !== "number" || price <= 0) continue;
    const current = cheapestByLibrary.get(plan.library_branch_id);
    if (current === undefined || price < current) cheapestByLibrary.set(plan.library_branch_id, price);
  }
  const prices = [...cheapestByLibrary.values()].sort((a, b) => a - b);
  if (prices.length === 0) return { libraries: ids.length, withFees: 0, min: null, median: null, max: null };
  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2);
  return { libraries: ids.length, withFees: prices.length, min: prices[0], median, max: prices[prices.length - 1] };
}

const cachedFeeStats = unstable_cache(
  async (key: string, ids: string[]) => {
    void key;
    return feeStatsForLibraries(ids);
  },
  ["place-fee-stats-v1"],
  { revalidate: 86400, tags: ["library-cards", "fee-stats"] },
);

export function getFeeStats(cacheKey: string, ids: string[]) {
  return isDev ? feeStatsForLibraries(ids) : cachedFeeStats(cacheKey, ids);
}
