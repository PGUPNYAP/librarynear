import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getOptimizedImageUrl } from "@/lib/library-images";

/**
 * Card details (photo, starting price) for up to 48 libraries by slug, used by
 * the instant results page to fill in cards it already rendered from the
 * in-browser index. Cached at the CDN.
 */
export const revalidate = 3600;

export async function GET(request: Request) {
  const slugs = [...new Set((new URL(request.url).searchParams.get("slugs") ?? "").split(",").map((slug) => slug.trim()))]
    .filter((slug) => /^[a-z0-9-]{1,200}$/.test(slug))
    .slice(0, 48);
  if (slugs.length === 0) return NextResponse.json({ cards: {} });

  const { data } = await supabaseServer
    .from("library_branches")
    .select("id, slug, cover_image_url, library_fee_plans(price, discounted_price, is_active)")
    .in("slug", slugs)
    .eq("is_active", true);

  const cards: Record<string, { id: string; image: string | null; price: number | null }> = {};
  for (const row of (data ?? []) as unknown as Array<{
    id: string;
    slug: string;
    cover_image_url: string | null;
    library_fee_plans: Array<{ price: number | null; discounted_price: number | null; is_active: boolean | null }> | null;
  }>) {
    const prices = (row.library_fee_plans ?? [])
      .filter((plan) => plan.is_active !== false)
      .map((plan) => plan.discounted_price ?? plan.price)
      .filter((value): value is number => typeof value === "number" && value > 0);
    cards[row.slug] = {
      id: row.id,
      image: getOptimizedImageUrl(row.cover_image_url, "card"),
      price: prices.length ? Math.min(...prices) : null,
    };
  }

  return NextResponse.json(
    { cards },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
