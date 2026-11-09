import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { pingIndexNow } from "@/lib/indexnow";
import { citySlug, toPlaceSlug } from "@/lib/places";
import { supabaseServer } from "@/lib/supabase-server";
import type { Tables } from "@/types/supabase";

type LibraryCacheTarget = Pick<Tables<"library_branches">, "city" | "slug" | "locality">;

function localityToSlug(locality: string) {
  return toPlaceSlug(locality);
}

export async function getLibraryCacheTarget(id: string): Promise<LibraryCacheTarget | null> {
  const { data, error } = await supabaseServer
    .from("library_branches")
    .select("city, slug, locality")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Failed to load library cache target:", error.message);
    return null;
  }

  return (data as LibraryCacheTarget | null) ?? null;
}

export function revalidateLibraryContent(target?: LibraryCacheTarget | null) {
  revalidateTag("library-cards", "max");
  revalidateTag("library-search-results", "max");
  revalidateTag("library-localities", "max");
  revalidateTag("zero-result-suggestions", "max");
  revalidateTag("home-top-localities", "max");
  revalidateTag("active-cities", "max");
  revalidateTag("fee-stats", "max");

  revalidatePath("/");
  revalidatePath("/admin/libraries");

  if (!target) {
    return;
  }

  const city = citySlug(target.city);
  const libraryPath = `/${city}/library/${target.slug}`;
  const localityPath = target.locality ? `/${city}/locality/${localityToSlug(target.locality)}` : null;

  revalidatePath(`/${city}`);
  revalidatePath(`/${city}/libraries`);
  revalidatePath(libraryPath);
  if (localityPath) revalidatePath(localityPath);

  // Tell Bing/IndexNow engines about the change after the response is sent.
  try {
    after(() => pingIndexNow([libraryPath, ...(localityPath ? [localityPath] : [])]));
  } catch {
    // after() is unavailable outside a request (e.g. scripts); skip the ping.
  }
}
