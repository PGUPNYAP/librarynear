import type { Tables } from "@/types/supabase";
import { getOptimizedImageUrl } from "@/lib/library-images";
import { supabaseServer } from "@/lib/supabase-server";

export type LibraryCardData = Pick<
  Tables<"library_branches">,
  | "id"
  | "slug"
  | "city"
  | "display_name"
  | "locality"
  | "nearest_metro"
  | "nearest_metro_distance_km"
  | "verification_status"
  | "profile_completeness_score"
  | "aggregate_rating"
  | "review_count"
  | "cover_image_url"
>;

export const LIBRARY_CARD_SELECT =
  "id,slug,city,display_name,locality,nearest_metro,nearest_metro_distance_km,verification_status,profile_completeness_score,aggregate_rating,review_count,cover_image_url";

export const LIBRARY_CARD_SELECT_FALLBACK =
  "id,slug,city,display_name,locality,nearest_metro,nearest_metro_distance_km,verification_status,profile_completeness_score,aggregate_rating,review_count";

type LibraryCardQueryRow = Omit<LibraryCardData, "cover_image_url"> & {
  cover_image_url?: string | null;
};

type LibraryCardQueryResult = {
  data: LibraryCardQueryRow[] | null;
  error: { message: string } | null;
};

function isMissingCoverImageColumn(errorMessage: string) {
  return /cover_image_url/i.test(errorMessage);
}

export async function runLibraryCardQuery(
  queryFactory: (selectClause: string) => PromiseLike<unknown> | unknown,
): Promise<LibraryCardData[]> {
  const primaryResult = (await queryFactory(LIBRARY_CARD_SELECT)) as LibraryCardQueryResult;

  if (!primaryResult.error) {
    return (primaryResult.data ?? []).map((row) => ({
      ...row,
      cover_image_url: row.cover_image_url ?? null,
    }));
  }

  if (!isMissingCoverImageColumn(primaryResult.error.message)) {
    // Throw instead of returning []: an empty result would make pages render
    // "no libraries" or a 404, and ISR would cache that. Throwing keeps the
    // last good cached page in production and shows the error page in dev.
    throw new Error(`Failed to fetch library cards: ${primaryResult.error.message}`);
  }

  const fallbackResult = (await queryFactory(LIBRARY_CARD_SELECT_FALLBACK)) as LibraryCardQueryResult;
  if (fallbackResult.error) {
    throw new Error(`Failed to fetch library cards: ${fallbackResult.error.message}`);
  }

  return (fallbackResult.data ?? []).map((row) => ({
    ...row,
    cover_image_url: null,
  }));
}

export function withCardImage<T extends { cover_image_url?: string | null }>(library: T) {
  return {
    ...library,
    coverImageUrl: getOptimizedImageUrl(library.cover_image_url, "card"),
  };
}

export async function getCardCoverImageUrlMap(ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return {} as Record<string, string | null>;
  }

  const { data, error } = await supabaseServer
    .from("library_branches")
    .select("id, cover_image_url")
    .in("id", uniqueIds);

  if (error || !data) {
    if (error) {
      console.error("Failed to fetch cover image URLs:", error.message);
    }
    return {} as Record<string, string | null>;
  }

  return Object.fromEntries(
    data.map((row) => [row.id, row.cover_image_url ?? null]),
  ) as Record<string, string | null>;
}

export async function withCardImages<T extends { id: string; cover_image_url?: string | null }>(
  libraries: T[],
) {
  if (libraries.length === 0) {
    return [];
  }

  const needsLookup = libraries.some((library) => typeof library.cover_image_url === "undefined");
  const coverImageMap = needsLookup
    ? await getCardCoverImageUrlMap(libraries.map((library) => library.id))
    : null;

  return libraries.map((library) =>
    withCardImage({
      ...library,
      cover_image_url:
        typeof library.cover_image_url === "undefined"
          ? coverImageMap?.[library.id] ?? null
          : library.cover_image_url,
    }),
  );
}
