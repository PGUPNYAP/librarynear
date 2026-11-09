import { notFound } from "next/navigation";
import Image from "next/image";
import { unstable_cache } from "next/cache";
import { MapPin, Trophy, Star } from "lucide-react";
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

function formatLocalityName(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

async function getTop10LocalityLibraries(city: string, locality: string): Promise<LibraryCardData[]> {
  return runLibraryCardQuery((selectClause) =>
    supabaseServer
      .from("library_branches")
      .select(selectClause)
      .eq("is_active", true)
      .ilike("city", slugToIlikePattern(city))
      .ilike("locality", locality)
      .order("aggregate_rating", { ascending: false })
      .order("review_count", { ascending: false })
      .limit(10),
  );
}

const getCachedTop10LocalityLibraries = unstable_cache(
  async (city: string, locality: string) => getTop10LocalityLibraries(city, locality),
  ["libraries-top-10-locality"],
  {
    revalidate: 3600,
    tags: ["library-cards"],
  },
);

const getLocalTop10Libraries =
  process.env.NODE_ENV === "development" ? getTop10LocalityLibraries : getCachedTop10LocalityLibraries;

export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { city, slug } = await params;
  const locality = formatLocalityName(slug);
  const cityLabel = slugToLabel(city);
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/${city}/top-10/locality/${slug}`;
  
  return {
    title: `Top 10 Best Libraries in ${locality}, ${cityLabel}`,
    description: `Discover the top 10 highest-rated study libraries and reading rooms in ${locality}, ${cityLabel}. Compare reviews, fees, and amenities.`,
    alternates: {
      canonical: pageUrl,
    },
    openGraph: {
      type: "website",
      url: pageUrl,
      title: `Top 10 Best Libraries in ${locality}, ${cityLabel}`,
      description: `Discover the top 10 highest-rated study libraries and reading rooms in ${locality}, ${cityLabel}.`,
      siteName: "LibraryNear",
    },
  };
}

export default async function Top10LocalityLibrariesPage({ params }: PageProps) {
  const { city, slug } = await params;
  const locality = formatLocalityName(slug);

  const librariesMeasurement = await measureAsync(
    "librariesTop10Locality",
    () => getLocalTop10Libraries(city, locality),
  );
  const libraries = librariesMeasurement.result.map(withCardImage);
  if (libraries.length === 0) notFound();
  
  logPerf("top-10-locality", [librariesMeasurement.metric], `city="${city}" locality="${locality}" count=${libraries.length}`);

  const cityLabel = slugToLabel(city);
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/${city}/top-10/locality/${slug}`;
  
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
          name: locality,
          item: `${siteUrl}/${city}/locality/${slug}`,
        },
        {
          "@type": "ListItem",
          position: 4,
          name: `Top 10 Libraries in ${locality}`,
          item: pageUrl,
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `Top 10 Best Libraries in ${locality}, ${cityLabel}`,
      numberOfItems: libraries.length,
      itemListElement: libraries.map((lib, i) => ({
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
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-16">
        <div className="mb-12 text-center">
          <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-full mb-4">
            <Trophy className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-gray-900 mb-4">
            Top 10 Libraries in {locality}
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            We analyzed hundreds of reviews to bring you the highest-rated study spaces in {locality}, {cityLabel}. Here are the top {libraries.length} libraries ranked by student satisfaction.
          </p>
        </div>

        <div className="space-y-8">
          {libraries.map((lib, index) => (
            <div key={lib.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col sm:flex-row group transition-all hover:shadow-md">
              <div className="relative sm:w-1/3 aspect-[4/3] sm:aspect-auto sm:min-h-[240px] shrink-0 bg-gray-100">
                {lib.coverImageUrl ? (
                  <Image
                    src={lib.coverImageUrl}
                    alt={lib.display_name}
                    fill
                    sizes="(max-width: 640px) 100vw, 33vw"
                    className="object-cover"
                    priority={index < 3}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-gray-300">
                    <MapPin className="h-10 w-10" />
                  </div>
                )}
                
                {/* Ranking Badge */}
                <div className="absolute top-4 left-4 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-white shadow-md text-xl font-bold text-gray-900 ring-1 ring-black/5">
                  #{index + 1}
                </div>

                <div className="absolute top-4 right-4 z-10">
                  <DeferredSaveButton libraryId={lib.id} />
                </div>
              </div>

              <div className="p-6 sm:p-8 flex flex-col justify-center flex-1">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <h2 className="text-2xl font-bold text-gray-900 line-clamp-2">
                    <IntentLink href={`/${city}/library/${lib.slug}`} className="hover:text-primary transition-colors">
                      {lib.display_name}
                    </IntentLink>
                  </h2>
                </div>

                <div className="flex items-center gap-2 mb-4">
                  {lib.aggregate_rating && lib.aggregate_rating > 0 ? (
                    <div className="flex items-center gap-1.5 text-lg font-semibold text-gray-900">
                      <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                      <span>{lib.aggregate_rating.toFixed(1)}</span>
                      <span className="text-sm font-normal text-gray-500">
                        ({lib.review_count} reviews)
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-500">New Listing</span>
                  )}
                </div>

                <div className="space-y-2 mb-6 text-gray-600">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 shrink-0 text-gray-400" />
                    <span className="line-clamp-1">{lib.locality}, {cityLabel}</span>
                  </div>
                  {lib.nearest_metro && (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                      </div>
                      <span className="line-clamp-1">Near {lib.nearest_metro} Metro Station</span>
                    </div>
                  )}
                </div>

                <div className="mt-auto flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap gap-2">
                  </div>
                  <IntentLink 
                    href={`/${city}/library/${lib.slug}`}
                    className="inline-flex items-center justify-center px-6 py-2.5 bg-primary text-white text-sm font-medium rounded-full hover:bg-primary/90 transition-colors shrink-0"
                  >
                    View Details
                  </IntentLink>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
