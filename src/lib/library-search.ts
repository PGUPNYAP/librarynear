import "server-only";

import { unstable_cache } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { LIBRARY_CARD_SELECT, withCardImage, type LibraryCardData } from "@/lib/library-card-data";
import { amenityOrFilter, getAmenityByLabel, getAmenityBySlug, type AmenityDefinition } from "@/lib/amenities";
import { parsePriceRange, PRICE_RANGE_OPTIONS } from "@/lib/library-filters";
import { sanitizeSearchTerm, boundSearchTerm } from "@/lib/postgrest";
import { slugToIlikePattern } from "@/lib/places";
import { rpcAll } from "@/lib/rpc-all";

export const SEARCH_PAGE_SIZE = 24;

export const SORT_OPTIONS = [
  { value: "", label: "Recommended" },
  { value: "rating", label: "Top rated" },
  { value: "verified", label: "Verified first" },
  { value: "newest", label: "Newest" },
  { value: "name_asc", label: "Name A–Z" },
] as const;

export const RATING_OPTIONS = [
  { value: "4", label: "4.0+" },
  { value: "3", label: "3.0+" },
] as const;

export type LibrarySearchFilters = {
  q?: string;
  locality?: string;
  amenities: AmenityDefinition[];
  price: (typeof PRICE_RANGE_OPTIONS)[number] | null;
  open24: boolean;
  verifiedOnly: boolean;
  minRating: number | null;
  sort: string;
  page: number;
};

export type SearchCard = LibraryCardData & {
  coverImageUrl: string | null;
  startingPrice: number | null;
};

type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** Parse and validate URL search params into a filter object (never trusts input). */
export function parseLibrarySearchParams(params: RawSearchParams): LibrarySearchFilters {
  const rawAmenities = first(params.amenities) ?? "";
  const amenities = rawAmenities
    .split(",")
    .map((value) => {
      try {
        return decodeURIComponent(value).trim();
      } catch {
        return value.trim();
      }
    })
    .filter(Boolean)
    .map((value) => getAmenityByLabel(value) ?? getAmenityBySlug(value))
    .filter((value): value is AmenityDefinition => Boolean(value))
    .filter((value, index, list) => list.findIndex((other) => other.slug === value.slug) === index)
    .slice(0, 8);

  const rating = Number(first(params.rating));
  const page = Math.min(500, Math.max(1, Number(first(params.page)) || 1));
  const sort = first(params.sort) ?? "";
  const q = first(params.q);

  return {
    q: q ? boundSearchTerm(q) : undefined,
    locality: first(params.locality)?.slice(0, 80) || undefined,
    amenities,
    price: parsePriceRange(first(params.price)),
    open24: first(params.open24) === "1",
    verifiedOnly: first(params.verified) === "1",
    minRating: rating === 3 || rating === 4 ? rating : null,
    sort: SORT_OPTIONS.some((option) => option.value === sort) ? sort : "",
    page,
  };
}

export function hasActiveFilters(filters: LibrarySearchFilters) {
  return Boolean(
    filters.q ||
      filters.locality ||
      filters.amenities.length ||
      filters.price ||
      filters.open24 ||
      filters.verifiedOnly ||
      filters.minRating ||
      filters.sort ||
      filters.page > 1,
  );
}

export function filtersToSearchParams(filters: Partial<LibrarySearchFilters>) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.locality) params.set("locality", filters.locality);
  if (filters.amenities?.length) params.set("amenities", filters.amenities.map((a) => a.label).join(","));
  if (filters.price) params.set("price", filters.price.value);
  if (filters.open24) params.set("open24", "1");
  if (filters.verifiedOnly) params.set("verified", "1");
  if (filters.minRating) params.set("rating", String(filters.minRating));
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  return params;
}

type PlanRow = { price: number | null; discounted_price: number | null; is_active: boolean | null };
type RawRow = LibraryCardData & { library_fee_plans?: PlanRow[] | null };

function startingPrice(plans: PlanRow[] | null | undefined) {
  const prices = (plans ?? [])
    .filter((plan) => plan.is_active !== false)
    .map((plan) => plan.discounted_price ?? plan.price)
    .filter((value): value is number => typeof value === "number" && value > 0);
  return prices.length ? Math.min(...prices) : null;
}

async function runSearch(cityName: string, filtersJson: string) {
  const filters = JSON.parse(filtersJson) as LibrarySearchFilters;
  const from = (filters.page - 1) * SEARCH_PAGE_SIZE;
  const to = from + SEARCH_PAGE_SIZE - 1;

  const planEmbed = filters.price
    ? "library_fee_plans!inner(price,discounted_price,is_active)"
    : "library_fee_plans(price,discounted_price,is_active)";

  let query = supabaseServer
    .from("library_branches")
    .select(`${LIBRARY_CARD_SELECT},${planEmbed}`, { count: "exact" })
    .eq("is_active", true)
    .eq("city", cityName);

  if (filters.q) {
    const safe = sanitizeSearchTerm(filters.q);
    if (safe) {
      query = query.or(
        `display_name.ilike.%${safe}%,name.ilike.%${safe}%,locality.ilike.%${safe}%,nearest_metro.ilike.%${safe}%,amenities_text.ilike.%${safe}%`,
      );
    }
  }
  if (filters.locality) query = query.ilike("locality", slugToIlikePattern(filters.locality.replace(/\s+/g, "-")));
  for (const amenity of filters.amenities) query = query.or(amenityOrFilter(amenity));
  if (filters.price) {
    query = query.gte("library_fee_plans.price", filters.price.min);
    if (filters.price.max !== null) query = query.lte("library_fee_plans.price", filters.price.max);
  }
  if (filters.open24) query = query.in("opening_time", ["00:00", "00:00:00"]);
  if (filters.verifiedOnly) query = query.eq("verification_status", "verified");
  if (filters.minRating) query = query.gte("aggregate_rating", filters.minRating);

  switch (filters.sort) {
    case "rating":
      query = query
        .order("aggregate_rating", { ascending: false, nullsFirst: false })
        .order("review_count", { ascending: false, nullsFirst: false });
      break;
    case "verified":
      query = query
        .order("verification_status", { ascending: false, nullsFirst: false })
        .order("profile_completeness_score", { ascending: false, nullsFirst: false });
      break;
    case "newest":
      query = query.order("created_at", { ascending: false, nullsFirst: false });
      break;
    case "name_asc":
      query = query.order("display_name", { ascending: true });
      break;
    default:
      query = query
        .order("profile_completeness_score", { ascending: false, nullsFirst: false })
        .order("review_count", { ascending: false, nullsFirst: false });
  }
  query = query.order("id", { ascending: true }).range(from, to);

  const { data, count, error } = await query;
  if (error) {
    console.error("Library search failed:", error.message);
    return { results: [] as SearchCard[], total: 0 };
  }

  const results = ((data ?? []) as unknown as RawRow[]).map((row) => {
    const { library_fee_plans, ...card } = row;
    return { ...withCardImage(card), startingPrice: startingPrice(library_fee_plans) } as SearchCard;
  });
  return { results, total: count ?? results.length };
}

const cachedSearch = unstable_cache(runSearch, ["library-search-v2"], {
  revalidate: 1800,
  tags: ["library-cards", "library-search-results"],
});

export function searchLibraryCards(cityName: string, filters: LibrarySearchFilters) {
  const key = JSON.stringify(filters);
  return process.env.NODE_ENV === "development" ? runSearch(cityName, key) : cachedSearch(cityName, key);
}

/** Localities in a city with library counts, for the locality filter. */
async function loadCityLocalities(cityName: string) {
  const { data, error } = await rpcAll<{ locality: string; library_count: number }>("city_locality_counts", {
    p_city: cityName,
  });
  if (!error) {
    return data.map((row) => ({
      name: row.locality,
      count: Number(row.library_count) || 0,
    }));
  }
  // Fallback (RPC not deployed): scan up to 5k rows.
  const counts = new Map<string, number>();
  for (let page = 0; page < 5; page++) {
    const { data: rows } = await supabaseServer
      .from("library_branches")
      .select("locality")
      .eq("is_active", true)
      .eq("city", cityName)
      .not("locality", "is", null)
      .order("id")
      .range(page * 1000, page * 1000 + 999);
    if (!rows || rows.length === 0) break;
    for (const row of rows) {
      const name = row.locality?.trim();
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    if (rows.length < 1000) break;
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count }));
}

const cachedCityLocalities = unstable_cache(loadCityLocalities, ["city-localities-v2"], {
  revalidate: 3600,
  tags: ["library-localities", "library-cards"],
});

export async function getCityLocalities(cityName: string) {
  const rows =
    process.env.NODE_ENV === "development" ? await loadCityLocalities(cityName) : await cachedCityLocalities(cityName);
  return rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** "Near me": closest libraries to a coordinate (not cached; coordinates vary). */
export async function nearbyLibraryCards(citySlugValue: string, latitude: number, longitude: number) {
  const { data, error } = await supabaseServer.rpc(
    "nearby_library_suggestions" as never,
    { user_lat: latitude, user_lng: longitude, city_filter: citySlugValue, max_results: 24 } as never,
  );
  const rows = (Array.isArray(data) ? data : []) as Array<{ slug: string; distance_km: number | null }>;
  if (error || rows.length === 0) return [] as Array<SearchCard & { distance_km: number | null }>;
  const { data: cards } = await supabaseServer
    .from("library_branches")
    .select(`${LIBRARY_CARD_SELECT},library_fee_plans(price,discounted_price,is_active)`)
    .eq("is_active", true)
    .in("slug", rows.map((row) => row.slug));
  const bySlug = new Map(((cards ?? []) as unknown as RawRow[]).map((row) => [row.slug, row]));
  return rows
    .map((row) => {
      const card = bySlug.get(row.slug);
      if (!card) return null;
      const { library_fee_plans, ...rest } = card;
      return { ...withCardImage(rest), startingPrice: startingPrice(library_fee_plans), distance_km: row.distance_km };
    })
    .filter(Boolean) as Array<SearchCard & { distance_km: number | null }>;
}
