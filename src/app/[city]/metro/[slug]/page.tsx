import { notFound } from "next/navigation";
import Image from "next/image";
import { unstable_cache } from "next/cache";
import { MapPin, Navigation } from "lucide-react";
import { supabaseServer } from "@/lib/supabase-server";
import { type LibraryCardData, runLibraryCardQuery, withCardImage } from "@/lib/library-card-data";
import { logPerf, measureAsync } from "@/lib/perf";
import { getSiteUrl } from "@/lib/site-url";
import { DeferredSaveButton } from "@/components/deferred-save-button";
import { IntentLink } from "@/components/intent-link";
import type { Metadata } from "next";
import { slugToIlikePattern, slugToLabel } from "@/lib/places";

interface PageProps {
  params: Promise<{ city: string; slug: string }>;
}

// Convert slug back to metro name (e.g. "gtb-nagar" → "Gtb Nagar")
function slugToMetroName(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

async function getLibrariesByMetro(city: string, metro: string): Promise<LibraryCardData[]> {
  return runLibraryCardQuery((selectClause) =>
    supabaseServer
      .from("library_branches")
      .select(selectClause)
      .eq("is_active", true)
      .ilike("city", slugToIlikePattern(city))
      .ilike("nearest_metro", metro)
      .order("nearest_metro_distance_km", { ascending: true, nullsFirst: false }),
  );
}

const getCachedLibrariesByMetro = unstable_cache(
  async (city: string, metro: string) => getLibrariesByMetro(city, metro),
  ["libraries-by-metro"],
  {
    revalidate: 3600,
    tags: ["library-cards"],
  },
);

const getMetroLibraries =
  process.env.NODE_ENV === "development" ? getLibrariesByMetro : getCachedLibrariesByMetro;

// Rendered on first request, then cached (ISR).
export async function generateStaticParams() {
  return [];
}

export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { city, slug } = await params;
  const metro = slugToMetroName(slug);
  const cityLabel = slugToLabel(city);
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/${city}/metro/${slug}`;
  
  return {
    title: `Libraries near ${metro} Metro Station in ${cityLabel}`,
    description: `Find the best study libraries and reading rooms near ${metro} Metro Station in ${cityLabel}. Compare distance, fees, timings, and amenities.`,
    alternates: {
      canonical: pageUrl,
    },
    openGraph: {
      type: "website",
      url: pageUrl,
      title: `Libraries near ${metro} Metro Station in ${cityLabel} | LibraryNear`,
      description: `Compare study libraries, reading rooms, fees, amenities, and metro access near ${metro} in ${cityLabel}.`,
      siteName: "LibraryNear",
    },
    twitter: {
      card: "summary_large_image",
      title: `Libraries near ${metro} Metro Station in ${cityLabel} | LibraryNear`,
      description: `Find the best study libraries and reading rooms near ${metro} Metro Station in ${cityLabel}.`,
    },
  };
}

export default async function MetroPage({ params }: PageProps) {
  const { city, slug } = await params;
  const metro = slugToMetroName(slug);

  const librariesMeasurement = await measureAsync(
    "librariesByMetro",
    () => getMetroLibraries(city, metro),
  );
  const libraries = librariesMeasurement.result.map(withCardImage);
  if (libraries.length === 0) notFound();
  logPerf("metro", [librariesMeasurement.metric], `city="${city}" metro="${metro}" count=${libraries.length}`);

  const cityLabel = slugToLabel(city);

  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/${city}/metro/${slug}`;
  const jsonLd = [
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
          item: `${siteUrl}/${city}`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: `${metro} Metro`,
          item: pageUrl,
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `Libraries near ${metro} Metro Station, ${cityLabel}`,
      url: pageUrl,
      description: `Browse study libraries and reading rooms near ${metro} Metro Station in ${cityLabel}.`,
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      numberOfItems: libraries.length,
      itemListElement: libraries.slice(0, 10).map((lib, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: lib.display_name,
        url: `${siteUrl}/${city}/library/${lib.slug}`,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: `How do I find the closest library to ${metro} Metro Station?`,
          acceptedAnswer: {
            "@type": "Answer",
            text: `The libraries on this page are automatically sorted by walking distance from ${metro} Metro Station. You can compare commute time directly on each listing.`,
          },
        },
        {
          "@type": "Question",
          name: `What should I consider before selecting a library near ${metro}?`,
          acceptedAnswer: {
            "@type": "Answer",
            text: `Shortlist libraries by total commute time from the metro station, seating availability, quiet environment, cleanliness, operating hours, and monthly fees.`,
          },
        },
      ],
    },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="container mx-auto px-6 md:px-10 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <IntentLink href="/" className="hover:underline">Home</IntentLink>
          <span>/</span>
          <IntentLink href={`/${city}`} className="hover:underline capitalize">{cityLabel}</IntentLink>
          <span>/</span>
          <IntentLink href={`/${city}/libraries`} className="hover:underline">Libraries</IntentLink>
          <span>/</span>
          <span className="text-black font-medium">{metro} Metro</span>
        </div>

        {/* Hero */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 mb-4 rounded-full bg-sky-50 text-sky-700 text-xs font-semibold border border-sky-100">
            <Navigation className="w-3.5 h-3.5" />
            Sorted by closest distance
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-black mb-3">
            Libraries near {metro} Metro Station
          </h1>
          <p className="text-muted-foreground max-w-2xl">
            Browse {libraries.length} study libraries and reading rooms located near the {metro} Metro Station in {cityLabel}.
            These listings are sorted by closest walking distance first.
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 gap-y-10">
          {libraries.map((lib, index) => (
            <IntentLink
              href={`/${city}/library/${lib.slug}`}
              key={lib.id}
              className="group flex flex-col gap-2 cursor-pointer"
            >
              <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-muted">
                {lib.coverImageUrl ? (
                  <Image
                    src={lib.coverImageUrl}
                    alt={`${lib.display_name} — study library near ${metro} Metro`}
                    fill
                    priority={index < 4}
                    sizes="(max-width: 768px) 100vw, (max-width: 1280px) 33vw, 20vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <MapPin className="h-10 w-10 text-muted-foreground/20" />
                  </div>
                )}
                <DeferredSaveButton libraryId={lib.id} />
                {lib.verification_status === "verified" && (
                  <div className="absolute top-3 left-3 bg-white/95 px-2 py-0.5 rounded-md text-xs font-bold border border-black/5 shadow-sm">
                    Verified
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-0.5">
                <h2 className="font-semibold text-[14px] truncate text-black leading-snug">
                  {lib.display_name}
                </h2>
                {lib.nearest_metro && (
                  <p className="text-[13px] font-medium text-sky-700 truncate">
                    {lib.nearest_metro_distance_km
                      ? `${lib.nearest_metro_distance_km} km away`
                      : `Near ${lib.nearest_metro}`}
                  </p>
                )}
                {lib.locality && (
                  <p className="text-[13px] text-muted-foreground truncate">
                    {lib.locality}
                  </p>
                )}
              </div>
            </IntentLink>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-16 p-8 bg-muted/40 rounded-2xl text-center">
          <h2 className="text-xl font-bold mb-2">Explore more libraries in {cityLabel}</h2>
          <p className="text-muted-foreground text-sm mb-5">
            Search across all localities, filter by amenities, and find your perfect study spot.
          </p>
          <IntentLink
            href={`/${city}/libraries`}
            className="inline-flex items-center gap-2 bg-primary text-white font-semibold px-6 py-3 rounded-full hover:bg-primary/90 transition-colors"
          >
            Browse all libraries
          </IntentLink>
        </div>
      </div>
    </div>
  );
}
