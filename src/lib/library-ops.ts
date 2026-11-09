import "server-only";

import { supabaseServer } from "@/lib/supabase-server";
import { calculateLibraryProfileCompleteness } from "@/lib/library-profile-score";
import { sanitizeSearchTerm } from "@/lib/postgrest";
import type { Tables } from "@/types/supabase";

type FeePlan = Tables<"library_fee_plans">;
type LibraryImage = Tables<"library_images">;

export type AdminLibraryBranch = Tables<"library_branches"> & {
  library_fee_plans?: FeePlan[];
  library_images?: LibraryImage[];
};

export type LibraryOpsFilters = {
  q?: string;
  city?: string;
  locality?: string;
  verified?: string;
  sort?: string;
  page?: number;
  allowedLocalityIds?: string[];
};

export async function getLibraryOpsPage({
  q,
  city,
  locality,
  verified,
  sort,
  page = 1,
  allowedLocalityIds,
}: LibraryOpsFilters) {
  const pageSize = 100;
  const safePage = Math.max(1, page);
  const from = (safePage - 1) * pageSize;
  const to = from + pageSize - 1;

  if (Array.isArray(allowedLocalityIds) && allowedLocalityIds.length === 0) {
    return {
      libraries: [] as AdminLibraryBranch[],
      totalCount: 0,
      pageSize,
      error: null,
    };
  }

  // Filtering, sorting and paging all happen in the database. Loading
  // everything and slicing in JS silently stopped at PostgREST's 1000-row cap.
  let query = supabaseServer
    .from("library_branches")
    .select("*, library_fee_plans(*), library_images(*)", { count: "exact" })
    .eq("is_active", true);

  if (q) {
    const safeQ = sanitizeSearchTerm(q);
    if (safeQ) {
      query = query.or(`display_name.ilike.%${safeQ}%,locality.ilike.%${safeQ}%,phone_number.ilike.%${safeQ}%,slug.ilike.%${safeQ}%`);
    }
  }

  if (city) {
    query = query.eq("city", city);
  }

  if (locality) {
    query = query.eq("locality", locality);
  }

  if (allowedLocalityIds && allowedLocalityIds.length > 0) {
    query = query.in("locality_id", allowedLocalityIds);
  }

  if (verified === "verified") {
    query = query.eq("verification_status", "verified");
  } else if (verified === "unverified") {
    query = query.or("verification_status.is.null,verification_status.neq.verified");
  }

  switch (sort) {
    case "score_asc":
      query = query.order("profile_completeness_score", { ascending: true, nullsFirst: true });
      break;
    case "name_asc":
      query = query.order("display_name", { ascending: true });
      break;
    case "recent":
      query = query.order("updated_at", { ascending: false, nullsFirst: false });
      break;
    default:
      query = query.order("profile_completeness_score", { ascending: false, nullsFirst: false });
  }
  query = query.order("id", { ascending: true }).range(from, to);

  const { data, count, error } = await query;

  const libraries = ((data ?? []) as AdminLibraryBranch[]).map((library) => ({
    ...library,
    profile_completeness_score: calculateLibraryProfileCompleteness(library),
  }));

  return {
    libraries,
    totalCount: count ?? libraries.length,
    pageSize,
    error,
  };
}
