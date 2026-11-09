import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { BookOpen, SearchX } from "lucide-react";
import { SearchBar } from "@/components/search-bar";
import { IntentLink } from "@/components/intent-link";
import { DeferredSaveButton } from "@/components/deferred-save-button";
import { CompareToggle } from "@/components/compare-controls";
import { LibraryFilterPanel, type FilterPanelState } from "@/components/library-filter-panel";
import { resolveCityParam } from "@/lib/cities-server";
import { FILTERABLE_AMENITIES } from "@/lib/amenities";
import { PRICE_RANGE_OPTIONS } from "@/lib/library-filters";
import { formatInr } from "@/lib/library-seo";
import {
  filtersToSearchParams,
  getCityLocalities,
  hasActiveFilters,
  parseLibrarySearchParams,
  RATING_OPTIONS,
  SEARCH_PAGE_SIZE,
  nearbyLibraryCards,
  searchLibraryCards,
  SORT_OPTIONS,
  type LibrarySearchFilters,
  type SearchCard,
} from "@/lib/library-search";
import { getSiteUrl } from "@/lib/site-url";
import { toPlaceSlug } from "@/lib/places";
import { isValidLatitude, isValidLongitude } from "@/lib/owner-form-validation";

interface PageProps {
  params: Promise<{ city: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const revalidate = 1800;

function describeFilters(filters: LibrarySearchFilters) {
  const parts: string[] = [];
  if (filters.amenities.length) parts.push(`with ${filters.amenities.map((a) => a.label).join(", ")}`);
  if (filters.open24) parts.push("open 24 hours");
  if (filters.price) parts.push(filters.price.label.toLowerCase());
  if (filters.verifiedOnly) parts.push("verified");
  if (filters.minRating) parts.push(`rated ${filters.minRating}+`);
  return parts.join(", ");
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const [{ city: rawCity }, rawSearch] = await Promise.all([params, searchParams]);
  const city = await resolveCityParam(rawCity);
  if (!city) return { title: "Page not found", robots: { index: false, follow: true } };
  const filters = parseLibrarySearchParams(rawSearch);
  const siteUrl = getSiteUrl();
  const filtered = hasActiveFilters(filters);

  // Filtered/search views are useful for people but are near-duplicates of
  // the main listing, so only the unfiltered listing is indexed.
  const canonicalUrl =
    filters.locality && !filters.q && !filters.amenities.length && !filters.price && !filters.open24
      ? `${siteUrl}/${city.slug}/locality/${toPlaceSlug(filters.locality)}`
      : `${siteUrl}/${city.slug}/libraries`;
  const detail = describeFilters(filters);
  const title = filters.q
    ? `“${filters.q}” libraries in ${city.name}`
    : `Study libraries in ${filters.locality ? `${filters.locality}, ` : ""}${city.name}${detail ? ` ${detail}` : ""}`;
  const description = `Search and filter ${city.libraryCount.toLocaleString("en-IN")} study libraries in ${city.name} by amenities, monthly fees, opening hours, rating and locality.`;

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    robots: filtered ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: { type: "website", url: canonicalUrl, title: `${title} | LibraryNear`, description, siteName: "LibraryNear" },
  };
}

function formatDistance(distanceKm?: number | null) {
  if (typeof distanceKm !== "number") return null;
  return distanceKm < 1 ? `${Math.max(50, Math.round(distanceKm * 1000))} m away` : `${distanceKm.toFixed(1)} km away`;
}

function ResultCard({ lib, priority }: { lib: SearchCard & { distance_km?: number | null }; priority: boolean }) {
  return (
    <li className="group relative flex flex-col gap-2">
      <IntentLink href={`/${toPlaceSlug(lib.city)}/library/${lib.slug}`} className="flex flex-col gap-2">
        <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-muted">
          {lib.coverImageUrl ? (
            <Image
              src={lib.coverImageUrl}
              alt={`${lib.display_name} — study library in ${lib.locality || lib.city}`}
              fill
              priority={priority}
              sizes="(max-width: 768px) 100vw, (max-width: 1280px) 33vw, 25vw"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
              <BookOpen className="mb-2 h-10 w-10 text-primary/20" />
              <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50">Library</span>
            </div>
          )}
          <DeferredSaveButton libraryId={lib.id} />
          {lib.verification_status === "verified" ? (
            <div className="absolute left-3 top-3 rounded-md border border-black/5 bg-white/95 px-2 py-0.5 text-xs font-bold shadow-sm">
              Verified
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-start justify-between gap-2">
            <h2 className="truncate text-[14px] font-semibold leading-snug text-black">{lib.display_name}</h2>
            {lib.aggregate_rating && lib.review_count ? (
              <span className="shrink-0 text-[13px] font-medium text-black">★ {lib.aggregate_rating.toFixed(1)}</span>
            ) : null}
          </div>
          {formatDistance(lib.distance_km) ? (
            <p className="truncate text-[13px] font-medium text-sky-700">{formatDistance(lib.distance_km)}</p>
          ) : null}
          {lib.locality ? <p className="truncate text-[13px] text-muted-foreground">{lib.locality}</p> : null}
          {lib.nearest_metro ? (
            <p className="truncate text-[13px] text-muted-foreground">
              {lib.nearest_metro_distance_km ? `${lib.nearest_metro_distance_km} km from ${lib.nearest_metro}` : `Near ${lib.nearest_metro}`}
            </p>
          ) : null}
          {lib.startingPrice ? (
            <p className="text-[13px] text-black">
              <span className="font-semibold">{formatInr(lib.startingPrice)}</span> <span className="text-muted-foreground">onwards</span>
            </p>
          ) : null}
        </div>
      </IntentLink>
      <div>
        <CompareToggle id={lib.id} name={lib.display_name} />
      </div>
    </li>
  );
}

function Pagination({ basePath, filters, total }: { basePath: string; filters: LibrarySearchFilters; total: number }) {
  const totalPages = Math.max(1, Math.ceil(total / SEARCH_PAGE_SIZE));
  if (totalPages <= 1) return null;
  const href = (page: number) => {
    const query = filtersToSearchParams({ ...filters, page }).toString();
    return query ? `${basePath}?${query}` : basePath;
  };
  const pages = new Set<number>([1, totalPages, filters.page - 1, filters.page, filters.page + 1]);
  const ordered = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);

  return (
    <nav aria-label="Pagination" className="mt-12 flex flex-wrap items-center justify-center gap-2">
      {filters.page > 1 ? (
        <IntentLink href={href(filters.page - 1)} rel="prev" className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:border-black">
          Previous
        </IntentLink>
      ) : null}
      {ordered.map((page, index) => (
        <span key={page} className="flex items-center gap-2">
          {index > 0 && page - ordered[index - 1] > 1 ? <span className="text-muted-foreground">…</span> : null}
          <IntentLink
            href={href(page)}
            aria-current={page === filters.page ? "page" : undefined}
            className={`flex h-9 min-w-9 items-center justify-center rounded-full px-3 text-sm font-semibold ${
              page === filters.page ? "bg-black text-white" : "hover:bg-muted"
            }`}
          >
            {page}
          </IntentLink>
        </span>
      ))}
      {filters.page < totalPages ? (
        <IntentLink href={href(filters.page + 1)} rel="next" className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:border-black">
          Next
        </IntentLink>
      ) : null}
    </nav>
  );
}

export default async function LibrariesPage({ params, searchParams }: PageProps) {
  const [{ city: rawCity }, rawSearch] = await Promise.all([params, searchParams]);
  const city = await resolveCityParam(rawCity);
  if (!city) notFound();

  const filters = parseLibrarySearchParams(rawSearch);
  const lat = Number(Array.isArray(rawSearch.lat) ? rawSearch.lat[0] : rawSearch.lat);
  const lng = Number(Array.isArray(rawSearch.lng) ? rawSearch.lng[0] : rawSearch.lng);
  const nearbyMode = rawSearch.nearby === "1" && isValidLatitude(lat) && isValidLongitude(lng);
  const nearLabel = (Array.isArray(rawSearch.near) ? rawSearch.near[0] : rawSearch.near)?.slice(0, 80) ?? null;
  if (nearbyMode) filters.q = undefined;

  const [{ results, total }, localities] = await Promise.all([
    nearbyMode
      ? nearbyLibraryCards(city.slug, lat, lng).then((rows) => ({ results: rows, total: rows.length }))
      : searchLibraryCards(city.name, filters),
    getCityLocalities(city.name),
  ]);

  const basePath = `/${city.slug}/libraries`;
  const detail = describeFilters(filters);
  const heading = nearbyMode
    ? nearLabel
      ? `Libraries near ${nearLabel}`
      : `Libraries near you in ${city.name}`
    : filters.q
    ? `Libraries matching “${filters.q}” in ${city.name}`
    : `Study libraries in ${filters.locality ? `${filters.locality}, ` : ""}${city.name}`;

  const panelState: FilterPanelState = {
    q: filters.q,
    locality: filters.locality,
    amenities: filters.amenities.map((amenity) => amenity.label),
    price: filters.price?.value,
    open24: filters.open24,
    verified: filters.verifiedOnly,
    rating: filters.minRating ? String(filters.minRating) : undefined,
    sort: filters.sort || undefined,
  };

  const siteUrl = getSiteUrl();
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
        { "@type": "ListItem", position: 2, name: city.name, item: `${siteUrl}/${city.slug}` },
        { "@type": "ListItem", position: 3, name: "Libraries", item: `${siteUrl}${basePath}` },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      numberOfItems: total,
      itemListElement: results.slice(0, 12).map((lib, index) => ({
        "@type": "ListItem",
        position: (filters.page - 1) * SEARCH_PAGE_SIZE + index + 1,
        name: lib.display_name,
        url: `${siteUrl}/${toPlaceSlug(lib.city)}/library/${lib.slug}`,
      })),
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="search-bar-sticky sticky top-16 z-30 border-b border-border/50 bg-white py-2 transition-all duration-300 ease-in-out md:top-20 md:py-3">
        <div className="container mx-auto px-4 md:px-10">
          <div className="mx-auto w-full max-w-xl">
            <Suspense fallback={null}>
              <SearchBar city={city.slug} />
            </Suspense>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 md:px-10">
        <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <IntentLink href="/" className="hover:underline">Home</IntentLink>
          <span>/</span>
          <IntentLink href={`/${city.slug}`} className="hover:underline">{city.name}</IntentLink>
          <span>/</span>
          <span className="font-medium text-black">Libraries</span>
        </nav>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-black">{heading}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total.toLocaleString("en-IN")} {total === 1 ? "library" : "libraries"}
            {detail ? ` ${detail}` : ""}
            {filters.page > 1 ? ` · page ${filters.page}` : ""}
          </p>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:gap-10">
          <aside className="w-full shrink-0 lg:sticky lg:top-40 lg:w-72 lg:self-start">
            <LibraryFilterPanel
              state={panelState}
              amenityOptions={FILTERABLE_AMENITIES.map((amenity) => amenity.label)}
              priceOptions={PRICE_RANGE_OPTIONS.map(({ value, label }) => ({ value, label }))}
              ratingOptions={RATING_OPTIONS.map(({ value, label }) => ({ value, label }))}
              sortOptions={SORT_OPTIONS.map(({ value, label }) => ({ value, label }))}
              localities={localities}
              totalCount={total}
            />
          </aside>

          <div className="min-w-0 flex-1">
          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                <SearchX className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <div>
                <p className="text-lg font-semibold text-black">No libraries match these filters</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                  Few libraries have published amenities, fees and hours yet. Try removing a filter.
                </p>
              </div>
              <IntentLink href={basePath} className="text-sm font-semibold text-primary hover:underline">
                Show all libraries in {city.name}
              </IntentLink>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-6 gap-y-10 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {results.map((lib, index) => (
                <ResultCard key={lib.id} lib={lib} priority={index < 4} />
              ))}
            </ul>
          )}
          {nearbyMode ? null : <Pagination basePath={basePath} filters={filters} total={total} />}
          </div>
        </div>
      </div>
    </div>
  );
}
