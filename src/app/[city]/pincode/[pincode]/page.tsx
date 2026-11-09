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
  params: Promise<{ city: string; pincode: string }>;
}

// Convert pincode back to pincode name (e.g. "mukherjee-nagar" → "Mukherjee Nagar")
function formatPincode(pincode: string): string { return pincode; }

async function getLibrariesByPincode(city: string, pincode: string): Promise<LibraryCardData[]> {
  return runLibraryCardQuery((selectClause) =>
    supabaseServer
      .from("library_branches")
      .select(selectClause)
      .eq("is_active", true)
      .ilike("city", slugToIlikePattern(city))
      .eq("pin_code", pincode)
      .order("profile_completeness_score", { ascending: false }),
  );
}

const getCachedLibrariesByPincode = unstable_cache(
  async (city: string, pincode: string) => getLibrariesByPincode(city, pincode),
  ["libraries-by-pincode"],
  {
    revalidate: 3600,
    tags: ["library-cards"],
  },
);

const getPincodeLibraries =
  process.env.NODE_ENV === "development" ? getLibrariesByPincode : getCachedLibrariesByPincode;

// Rendered on first request, then cached (ISR).
export async function generateStaticParams() {
  return [];
}

export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { city, pincode } = await params;
  const formattedPincode = formatPincode(pincode);
  const cityLabel = slugToLabel(city);
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/${city}/pincode/${pincode}`;
  return {
    title: `Best Libraries in ${formattedPincode}, ${cityLabel}`,
    description: `Find the best study libraries in ${formattedPincode}, ${cityLabel}. Compare fees, amenities, timings, and metro access before choosing a study space.`,
    alternates: {
      canonical: pageUrl,
    },
    openGraph: {
      type: "website",
      url: pageUrl,
      title: `Best Libraries in ${formattedPincode}, ${cityLabel} | LibraryNear`,
      description: `Compare study libraries, reading rooms, fees, amenities, and metro access in ${formattedPincode}, ${cityLabel}.`,
      siteName: "LibraryNear",
    },
  };
}

export default async function PincodePage({ params }: PageProps) {
  const { city, pincode } = await params;
  const formattedPincode = formatPincode(pincode);

  const librariesMeasurement = await measureAsync(
    "librariesByPincode",
    () => getPincodeLibraries(city, pincode),
  );
  const libraries = librariesMeasurement.result.map(withCardImage);
  if (libraries.length === 0) notFound();
  logPerf("pincode", [librariesMeasurement.metric], `city="${city}" pincode="${pincode}" count=${libraries.length}`);

  const cityLabel = slugToLabel(city);

  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/${city}/pincode/${pincode}`;
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
          name: formattedPincode,
          item: pageUrl,
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `Best Libraries in ${formattedPincode}, ${cityLabel}`,
      url: pageUrl,
      description: `Browse study libraries and reading rooms in ${formattedPincode}, ${cityLabel}.`,
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
          name: `Why do students choose libraries in ${pincode}?`,
          acceptedAnswer: {
            "@type": "Answer",
            text: `Students usually compare metro access, study environment, timings, amenities, and monthly fees before choosing a library in ${pincode}.`,
          },
        },
        {
          "@type": "Question",
          name: `What should I compare before selecting a library in ${pincode}?`,
          acceptedAnswer: {
            "@type": "Answer",
            text: `Shortlist libraries by location, seating, quiet environment, cleanliness, operating hours, and how close they are to your nearest metro station.`,
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
          <span className="text-black font-medium">{pincode}</span>
        </div>

        {/* Hero */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-black mb-3">
            Best Libraries in {pincode}
          </h1>
          <p className="text-muted-foreground max-w-2xl">
            Browse {libraries.length} study libraries and reading rooms in {pincode}, {cityLabel}.
            Compare fees, amenities, timings, and distance from metro stations.
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
                    alt={`${lib.display_name} — study library in ${pincode}, ${cityLabel}`}
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
                  <p className="text-[13px] text-muted-foreground truncate">
                    {lib.nearest_metro_distance_km
                      ? `${lib.nearest_metro_distance_km} km from ${lib.nearest_metro} metro`
                      : `Near ${lib.nearest_metro}`}
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

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-border/70 bg-slate-50/40 p-6">
            <h2 className="text-xl font-bold text-black">Why students shortlist libraries in {pincode}</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              {pincode} attracts students who want a practical mix of accessibility, study-friendly
              surroundings, and reliable daily routines. Start by comparing metro distance, seat
              availability, cleanliness, and how quiet the study environment feels during peak hours.
            </p>
          </section>

          <section className="rounded-3xl border border-border/70 bg-slate-50/40 p-6">
            <h2 className="text-xl font-bold text-black">Popular filters in {pincode}</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              <IntentLink href={`/${city}/amenity/ac/pincode/${pincode}`} className="px-3 py-1.5 bg-white border border-border rounded-full text-sm font-medium hover:bg-muted/50 transition-colors">AC Libraries</IntentLink>
              <IntentLink href={`/${city}/amenity/wifi/pincode/${pincode}`} className="px-3 py-1.5 bg-white border border-border rounded-full text-sm font-medium hover:bg-muted/50 transition-colors">WiFi Enabled</IntentLink>
              <IntentLink href={`/${city}/amenity/24x7/pincode/${pincode}`} className="px-3 py-1.5 bg-white border border-border rounded-full text-sm font-medium hover:bg-muted/50 transition-colors">24x7 Open</IntentLink>
              <IntentLink href={`/${city}/amenity/discussion-room/pincode/${pincode}`} className="px-3 py-1.5 bg-white border border-border rounded-full text-sm font-medium hover:bg-muted/50 transition-colors">Discussion Rooms</IntentLink>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
