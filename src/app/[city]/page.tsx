import Image from "next/image";
import type { Metadata } from "next";
import { slugToIlikePattern, slugToLabel } from "@/lib/places";
import { unstable_cache } from "next/cache";
import { MapPin } from "lucide-react";
import { supabaseServer } from "@/lib/supabase-server";
import { type LibraryCardData, runLibraryCardQuery, withCardImage } from "@/lib/library-card-data";
import { getSiteUrl } from "@/lib/site-url";
import { DeferredSaveButton } from "@/components/deferred-save-button";
import { IntentLink } from "@/components/intent-link";
import { Suspense } from "react";
import { HomeSearchShell } from "@/components/home-search-shell";
import { CityIcon } from "@/components/city-icon";
import { resolveCityParam } from "@/lib/cities-server";
import { getCityLocalities } from "@/lib/library-search";

interface PageProps {
  params: Promise<{ city: string }>;
}

async function getCityOverview(city: string): Promise<{
  libraries: LibraryCardData[];
  localities: string[];
}> {
  const [libraries, localityRows] = await Promise.all([
    runLibraryCardQuery((selectClause) =>
      supabaseServer
        .from("library_branches")
        .select(selectClause)
        .ilike("city", slugToIlikePattern(city))
        .eq("is_active", true)
        .order("profile_completeness_score", { ascending: false })
        .limit(12),
    ),
    resolveCityParam(city).then((resolved) => (resolved ? getCityLocalities(resolved.name) : [])),
  ]);

  return { libraries, localities: localityRows.slice(0, 24).map((row) => row.name) };
}

const getCachedCityOverview = unstable_cache(
  async (city: string) => getCityOverview(city),
  ["city-overview"],
  {
    revalidate: 3600,
    tags: ["library-cards", "city-overview"],
  },
);

const getCityOverviewForRoute =
  process.env.NODE_ENV === "development" ? getCityOverview : getCachedCityOverview;

// Rendered on first request, then cached (ISR).
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { city } = await params;
  const cityLabel = slugToLabel(city);
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/${city}`;

  const resolved = await resolveCityParam(city);
  const count = resolved?.libraryCount ?? 0;
  return {
    robots: { index: count >= 3, follow: true },
    title: `Best Libraries in ${resolved?.name ?? cityLabel} (${count.toLocaleString("en-IN")} listed)`,
    description: `Find the best study libraries in ${cityLabel}. Explore top localities, compare amenities and fees, and discover verified library listings near you.`,
    alternates: {
      canonical: pageUrl,
    },
    openGraph: {
      type: "website",
      url: pageUrl,
      title: `Libraries in ${cityLabel} | LibraryNear`,
      description: `Explore study libraries in ${cityLabel} and browse top localities on LibraryNear.`,
      siteName: "LibraryNear",
    },
  };
}

export const revalidate = 3600;

function toLocalitySlug(locality: string) {
  return locality.toLowerCase().replace(/\s+/g, "-");
}

export default async function CityPage({ params }: PageProps) {
  const { city } = await params;
  const resolvedCity = await resolveCityParam(city);
  const cityLabel = resolvedCity?.name ?? slugToLabel(city);
  const { libraries, localities } = await getCityOverviewForRoute(city);
  const cards = libraries.map(withCardImage);
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/${city}`;
  const citySchema = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: siteUrl,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: cityLabel,
          item: pageUrl,
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `Best Libraries in ${cityLabel}`,
      url: pageUrl,
      description: `Find study libraries in ${cityLabel}, compare localities, and shortlist the best places to study.`,
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: cards.length,
        itemListElement: cards.slice(0, 10).map((lib, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: lib.display_name,
          url: `${siteUrl}/${city}/library/${lib.slug}`,
        })),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: `How do I choose the best library in ${cityLabel}?`,
          acceptedAnswer: {
            "@type": "Answer",
            text: `Compare locality, metro access, amenities, opening hours, and fees before shortlisting a library in ${cityLabel}.`,
          },
        },
        {
          "@type": "Question",
          name: `Can I browse libraries by locality in ${cityLabel}?`,
          acceptedAnswer: {
            "@type": "Answer",
            text: `Yes. LibraryNear groups libraries by locality so you can discover study spaces close to where you live or travel.`,
          },
        },
      ],
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(citySchema).replace(/</g, "\\u003c") }}
      />
      <Suspense fallback={null}>
        <HomeSearchShell />
      </Suspense>

      {/* Locality ribbon, same as the homepage */}
      <div className="w-full border-b border-border/50 bg-white shadow-sm">
        <div className="container mx-auto flex items-center gap-2 overflow-x-auto px-4 py-2 no-scrollbar md:gap-3 md:px-10 md:py-3">
          <IntentLink
            href={`/${city}`}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm shadow-primary/20 transition-colors md:px-4 md:py-2 md:text-[13px]"
          >
            <CityIcon slug={city} className="h-4 w-4" />
            All {cityLabel}
          </IntentLink>
          {localities.map((locality) => (
            <IntentLink
              key={locality}
              href={`/${city}/locality/${toLocalitySlug(locality)}`}
              className="shrink-0 rounded-full border border-primary/30 px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary md:px-4 md:py-2 md:text-[13px]"
            >
              {locality}
            </IntentLink>
          ))}
        </div>
      </div>

      <section className="border-b border-border/50 bg-white">
        <div className="container mx-auto px-5 py-8 sm:px-6 md:px-10 md:py-16">
          <h1 className="max-w-3xl text-[28px] font-bold leading-tight tracking-tight text-black sm:text-4xl md:text-5xl">
            Find the best libraries in {cityLabel}
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-6 text-muted-foreground md:mt-4 md:text-lg md:leading-7">
            Filter by locality, fees, amenities and opening hours, then compare your shortlist side by side.
          </p>

          <div className="mt-6 flex flex-wrap gap-3 md:mt-8">
            <IntentLink
              href={`/${city}/libraries`}
              className="rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
            >
              Browse all libraries
            </IntentLink>
            <IntentLink
              href="/for-owners"
              className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-muted/60"
            >
              List your library
            </IntentLink>
          </div>
        </div>
      </section>

      <section className="container mx-auto min-h-screen px-5 py-8 pb-20 sm:px-6 md:px-10 md:py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 className="text-xl font-bold text-black md:text-2xl">Featured libraries in {cityLabel}</h2>
          <IntentLink href={`/${city}/libraries`} className="shrink-0 whitespace-nowrap text-sm font-semibold text-primary hover:underline">
            See all
          </IntentLink>
        </div>

        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-border/60 bg-slate-50/40 py-16 text-center">
            <MapPin className="h-10 w-10 text-muted-foreground/30" />
            <p className="mt-4 text-lg font-semibold text-black">No public libraries yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We are still building coverage for {cityLabel}.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 gap-y-10 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {cards.map((lib, index) => (
              <IntentLink
                href={`/${city}/library/${lib.slug}`}
                key={lib.id}
                className="group flex flex-col gap-2"
              >
                <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-muted">
                  {lib.coverImageUrl ? (
                    <Image
                      src={lib.coverImageUrl}
                      alt={`${lib.display_name} — study library in ${lib.locality || cityLabel}`}
                      fill
                      priority={index < 2}
                      fetchPriority={index < 2 ? "high" : "auto"}
                      sizes="(max-width: 768px) 100vw, (max-width: 1280px) 33vw, 25vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <MapPin className="h-10 w-10 text-muted-foreground/20" />
                    </div>
                  )}
                  <DeferredSaveButton libraryId={lib.id} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <h3 className="truncate text-[14px] font-semibold leading-snug text-black">
                    {lib.display_name}
                  </h3>
                  {lib.locality ? (
                    <p className="truncate text-[13px] text-muted-foreground">{lib.locality}</p>
                  ) : null}
                  {lib.nearest_metro ? (
                    <p className="truncate text-[13px] text-muted-foreground">
                      {lib.nearest_metro_distance_km
                        ? `${lib.nearest_metro_distance_km} km from ${lib.nearest_metro} metro`
                        : `Near ${lib.nearest_metro}`}
                    </p>
                  ) : null}
                </div>
              </IntentLink>
            ))}
          </div>
        )}

        <div className="mt-16 grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-border/70 bg-slate-50/40 p-6">
            <h2 className="text-xl font-bold text-black">How to choose a library in {cityLabel}</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Start with the locality that fits your daily route, then compare metro distance,
              seating, timings, amenities, and pricing. Verified libraries are a good place to begin
              when you want the strongest quality signals.
            </p>
          </section>
          <section className="rounded-3xl border border-border/70 bg-slate-50/40 p-6">
            <h2 className="text-xl font-bold text-black">Popular ways students search</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Most students narrow their shortlist by nearest metro station, quiet localities,
              extended opening hours, and budget-friendly monthly plans. Use the locality pages and
              full libraries index to compare options faster.
            </p>
          </section>
        </div>
      </section>
    </div>
  );
}
