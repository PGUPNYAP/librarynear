import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { supabaseServer } from "@/lib/supabase-server";
import { getOptimizedImageUrl } from "@/lib/library-images";
import { AMENITIES, amenitySlugsFor } from "@/lib/amenities";
import { formatInr, formatTimingLabel, getPriceRange } from "@/lib/library-seo";
import { citySlug } from "@/lib/places";
import { MAX_COMPARE } from "@/store/use-compare-store";

export const metadata: Metadata = {
  title: "Compare libraries",
  description: "Compare study libraries side by side: fees, hours, amenities, seats, rating and metro distance.",
  robots: { index: false, follow: true },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CompareRow = {
  id: string;
  slug: string;
  city: string;
  display_name: string;
  locality: string | null;
  nearest_metro: string | null;
  nearest_metro_distance_km: number | null;
  opening_time: string | null;
  closing_time: string | null;
  total_seats: number | null;
  amenities_text: string | null;
  aggregate_rating: number | null;
  review_count: number | null;
  verification_status: string | null;
  cover_image_url: string | null;
  library_fee_plans: Array<{ price: number; discounted_price: number | null; is_active: boolean | null; plan_name: string }> | null;
};

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids: rawIds } = await searchParams;
  const ids = [...new Set((rawIds ?? "").split(",").map((id) => id.trim()).filter((id) => UUID.test(id)))].slice(0, MAX_COMPARE);

  let libraries: CompareRow[] = [];
  if (ids.length > 0) {
    const { data } = await supabaseServer
      .from("library_branches")
      .select(
        "id, slug, city, display_name, locality, nearest_metro, nearest_metro_distance_km, opening_time, closing_time, total_seats, amenities_text, aggregate_rating, review_count, verification_status, cover_image_url, library_fee_plans(price, discounted_price, is_active, plan_name)",
      )
      .in("id", ids)
      .eq("is_active", true);
    const byId = new Map(((data ?? []) as unknown as CompareRow[]).map((row) => [row.id, row]));
    libraries = ids.map((id) => byId.get(id)).filter(Boolean) as CompareRow[];
  }

  if (libraries.length < 2) {
    return (
      <div className="container mx-auto max-w-2xl px-6 py-20 text-center">
        <h1 className="text-3xl font-bold text-black">Compare libraries</h1>
        <p className="mt-3 text-muted-foreground">
          Tap <span className="font-semibold text-black">Compare</span> on two to four libraries in any listing, then open the tray at the bottom of the screen.
        </p>
        <Link href="/delhi/libraries" className="mt-8 inline-block rounded-full bg-primary px-6 py-3 font-semibold text-white">
          Browse libraries
        </Link>
      </div>
    );
  }

  const enriched = libraries.map((lib) => {
    const plans = (lib.library_fee_plans ?? []).filter((plan) => plan.is_active !== false);
    const range = getPriceRange(plans);
    return {
      ...lib,
      range,
      amenitySlugs: new Set(amenitySlugsFor(lib.amenities_text)),
      timing: formatTimingLabel(lib),
      image: getOptimizedImageUrl(lib.cover_image_url, "card"),
    };
  });

  const cheapest = Math.min(...enriched.map((lib) => lib.range?.min ?? Number.POSITIVE_INFINITY));
  const bestRating = Math.max(...enriched.map((lib) => (lib.review_count ? lib.aggregate_rating ?? 0 : 0)));
  const closestMetro = Math.min(...enriched.map((lib) => lib.nearest_metro_distance_km ?? Number.POSITIVE_INFINITY));
  const usedAmenities = AMENITIES.filter((amenity) => enriched.some((lib) => lib.amenitySlugs.has(amenity.slug)));

  const best = (condition: boolean) => (condition ? "bg-emerald-50 font-semibold text-emerald-800" : "");
  const removeHref = (id: string) => {
    const rest = ids.filter((other) => other !== id);
    return rest.length ? `/compare?ids=${rest.join(",")}` : "/compare";
  };

  const rows: Array<{ label: string; render: (lib: (typeof enriched)[number]) => React.ReactNode; highlight?: (lib: (typeof enriched)[number]) => boolean }> = [
    {
      label: "Starting fee",
      render: (lib) => (lib.range ? formatInr(lib.range.min) : "Not listed"),
      highlight: (lib) => Boolean(lib.range && lib.range.min === cheapest),
    },
    { label: "Fee range", render: (lib) => (lib.range ? `${formatInr(lib.range.min)} – ${formatInr(lib.range.max)}` : "—") },
    {
      label: "Rating",
      render: (lib) => (lib.aggregate_rating && lib.review_count ? `★ ${lib.aggregate_rating.toFixed(1)} (${lib.review_count})` : "No reviews"),
      highlight: (lib) => bestRating > 0 && Boolean(lib.review_count) && lib.aggregate_rating === bestRating,
    },
    { label: "Hours", render: (lib) => lib.timing ?? "Not listed" },
    {
      label: "Nearest metro",
      render: (lib) =>
        lib.nearest_metro
          ? `${lib.nearest_metro}${lib.nearest_metro_distance_km ? ` · ${lib.nearest_metro_distance_km} km` : ""}`
          : "—",
      highlight: (lib) => Number.isFinite(closestMetro) && lib.nearest_metro_distance_km === closestMetro,
    },
    { label: "Seats", render: (lib) => (lib.total_seats ? String(lib.total_seats) : "—") },
    { label: "Locality", render: (lib) => lib.locality ?? "—" },
    { label: "Verified", render: (lib) => (lib.verification_status === "verified" ? "Yes" : "No") },
  ];

  return (
    <div className="container mx-auto px-4 py-10 md:px-10">
      <h1 className="text-3xl font-bold text-black">Compare libraries</h1>
      <p className="mt-2 text-sm text-muted-foreground">Green cells show the best value in each row. Details are reported by each library.</p>

      <div className="mt-8 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr>
              <th scope="col" className="w-40 bg-muted/40 p-4 text-left align-bottom text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Library
              </th>
              {enriched.map((lib) => (
                <th key={lib.id} scope="col" className="min-w-[180px] border-l border-border p-4 text-left align-top">
                  <div className="relative mb-3 aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted">
                    {lib.image ? <Image src={lib.image} alt={lib.display_name} fill sizes="240px" className="object-cover" /> : null}
                  </div>
                  <Link href={`/${citySlug(lib.city)}/library/${lib.slug}`} className="block font-semibold text-black hover:text-primary">
                    {lib.display_name}
                  </Link>
                  <Link href={removeHref(lib.id)} className="mt-1 inline-block text-xs font-medium text-muted-foreground underline">
                    Remove
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-border">
                <th scope="row" className="bg-muted/40 p-4 text-left font-semibold text-black">{row.label}</th>
                {enriched.map((lib) => (
                  <td key={lib.id} className={`border-l border-border p-4 ${best(row.highlight?.(lib) ?? false)}`}>
                    {row.render(lib)}
                  </td>
                ))}
              </tr>
            ))}
            {usedAmenities.length > 0 ? (
              <tr className="border-t border-border">
                <th scope="rowgroup" colSpan={enriched.length + 1} className="bg-muted/60 p-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Amenities
                </th>
              </tr>
            ) : null}
            {usedAmenities.map((amenity) => (
              <tr key={amenity.slug} className="border-t border-border">
                <th scope="row" className="bg-muted/40 p-4 text-left font-medium text-black">{amenity.label}</th>
                {enriched.map((lib) => (
                  <td key={lib.id} className="border-l border-border p-4">
                    {lib.amenitySlugs.has(amenity.slug) ? (
                      <Check className="h-4 w-4 text-emerald-600" aria-label="Yes" />
                    ) : (
                      <Minus className="h-4 w-4 text-muted-foreground/50" aria-label="Not listed" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
