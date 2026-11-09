import { notFound } from "next/navigation";
import Image from "next/image";
import { unstable_cache } from "next/cache";
import { MapPin } from "lucide-react";
import { supabaseServer } from "@/lib/supabase-server";
import { type LibraryCardData, runLibraryCardQuery, withCardImage } from "@/lib/library-card-data";
import { logPerf, measureAsync } from "@/lib/perf";
import { getSiteUrl } from "@/lib/site-url";
import { DeferredSaveButton } from "@/components/deferred-save-button";
import { IntentLink } from "@/components/intent-link";
import type { Metadata } from "next";
import { slugToIlikePattern, slugToLabel } from "@/lib/places";

interface PageProps {
  params: Promise<{ city: string }>;
}

async function get24HourLibraries(city: string): Promise<LibraryCardData[]> {
  return runLibraryCardQuery((selectClause) =>
    supabaseServer
      .from("library_branches")
      .select(selectClause)
      .eq("is_active", true)
      .ilike("city", slugToIlikePattern(city))
      .in("opening_time", ["00:00:00", "00:00"])
      .order("profile_completeness_score", { ascending: false }),
  );
}

const getCached24HourLibraries = unstable_cache(
  async (city: string) => get24HourLibraries(city),
  ["libraries-24-hour"],
  {
    revalidate: 3600,
    tags: ["library-cards"],
  },
);

const getCity24HourLibraries =
  process.env.NODE_ENV === "development" ? get24HourLibraries : getCached24HourLibraries;

export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { city } = await params;
  const cityLabel = slugToLabel(city);
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/${city}/24-hour-libraries`;
  
  return {
    title: `Best 24-Hour Libraries in ${cityLabel} | Open 24/7`,
    description: `Find the best 24-hour study libraries in ${cityLabel}. Compare late night reading rooms, fees, amenities, and metro access.`,
    alternates: {
      canonical: pageUrl,
    },
    openGraph: {
      type: "website",
      url: pageUrl,
      title: `Best 24-Hour Libraries in ${cityLabel} | Open 24/7`,
      description: `Compare late night reading rooms and 24-hour study libraries in ${cityLabel}.`,
      siteName: "LibraryNear",
    },
  };
}

export default async function TwentyFourHourLibrariesPage({ params }: PageProps) {
  const { city } = await params;

  const librariesMeasurement = await measureAsync(
    "libraries24Hour",
    () => getCity24HourLibraries(city),
  );
  const libraries = librariesMeasurement.result.map(withCardImage);
  if (libraries.length === 0) notFound();
  
  logPerf("24-hour", [librariesMeasurement.metric], `city="${city}" count=${libraries.length}`);

  const cityLabel = slugToLabel(city);
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/${city}/24-hour-libraries`;
  
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
          name: "24-Hour Libraries",
          item: pageUrl,
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `Best 24-Hour Libraries in ${cityLabel}`,
      url: pageUrl,
      description: `Browse 24-hour study libraries in ${cityLabel}.`,
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
  ];

  return (
    <div className="min-h-screen bg-gray-50/50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900 mb-2">
            24-Hour Libraries in {cityLabel}
          </h1>
          <p className="text-lg text-gray-600">
            Find study spaces and reading rooms open 24/7 in {cityLabel}. Perfect for late-night exam prep.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 gap-y-10">
          {libraries.map((lib, index) => (
            <IntentLink
              href={`/${city}/library/${lib.slug}`}
              key={lib.id}
              className="group flex flex-col gap-2 cursor-pointer"
            >
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-gray-100 ring-1 ring-black/5">
                {lib.coverImageUrl ? (
                  <Image
                    src={lib.coverImageUrl}
                    alt={lib.display_name}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    priority={index < 4}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-gray-300">
                    <MapPin className="h-10 w-10" />
                  </div>
                )}
                
                {/* 24/7 Badge */}
                <div className="absolute top-2 left-2 z-10">
                  <span className="inline-flex items-center rounded-md bg-green-500/90 px-2 py-1 text-xs font-semibold text-white shadow-sm ring-1 ring-inset ring-green-600/20 backdrop-blur-sm">
                    Open 24/7
                  </span>
                </div>

                <div className="absolute top-2 right-2 z-10">
                  <DeferredSaveButton libraryId={lib.id}  />
                </div>
              </div>

              <div className="flex flex-col gap-1 px-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-gray-900 line-clamp-1">{lib.display_name}</h3>
                  {lib.aggregate_rating && lib.aggregate_rating > 0 ? (
                    <div className="flex items-center gap-1 text-sm font-medium shrink-0">
                      <span>★</span>
                      <span>{lib.aggregate_rating.toFixed(1)}</span>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center text-sm text-gray-500 line-clamp-1">
                  <span>{lib.locality}</span>
                  {lib.locality && lib.nearest_metro && (
                    <span className="mx-1.5 h-1 w-1 rounded-full bg-gray-300 shrink-0" />
                  )}
                  {lib.nearest_metro && (
                    <span className="truncate">Near {lib.nearest_metro} Metro</span>
                  )}
                </div>

                
              </div>
            </IntentLink>
          ))}
        </div>
      </div>
    </div>
  );
}
