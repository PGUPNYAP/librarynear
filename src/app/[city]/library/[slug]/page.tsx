import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { MapPin, Clock, ShieldCheck, ExternalLink, Navigation } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabaseServer } from "@/lib/supabase-server";
import { getOptimizedImageUrl } from "@/lib/library-images";
import { logPerf, measureAsync } from "@/lib/perf";
import { EnquiryForm } from "@/components/enquiry-form";
import type { Tables } from "@/types/supabase";
import type { Metadata } from "next";
import { FeePlansList } from "@/components/fee-plans-list";
import { AmenitiesGrid } from "@/components/amenities-grid";
import { MapEmbed } from "@/components/map-embed";
import { LibraryDetailActions } from "@/components/library-detail-actions";
import { LibraryPhotoGallery } from "@/components/library-photo-gallery";
import { getSiteUrl } from "@/lib/site-url";
import { LibraryReviews } from "@/components/library-reviews";
import { citySlug, libraryTitleParts, toPlaceSlug } from "@/lib/places";
import { type LibraryCardData, runLibraryCardQuery, withCardImage } from "@/lib/library-card-data";
import {
  buildAnswerSummary,
  buildLibraryFaqs,
  buildOpeningHoursSpecification,
  faqPageSchema,
  formatPriceRange,
  formatTimingLabel,
  getPriceRange,
} from "@/lib/library-seo";

type LibraryBranch = Tables<"library_branches">;
type FeePlan = Tables<"library_fee_plans">;
type LibraryImage = Pick<Tables<"library_images">, "imagekit_url" | "sort_order" | "is_cover">;

type LibraryDetailData = Pick<
  LibraryBranch,
  | "id"
  | "slug"
  | "city"
  | "display_name"
  | "locality"
  | "district"
  | "formatted_address"
  | "full_address"
  | "latitude"
  | "longitude"
  | "map_link"
  | "nearest_metro"
  | "nearest_metro_distance_km"
  | "verification_status"
  | "opening_time"
  | "closing_time"
  | "pin_code"
  | "description"
  | "amenities_text"
  | "total_seats"
  | "phone_number"
  | "state"
  | "aggregate_rating"
  | "review_count"
> & {
  library_fee_plans: FeePlan[] | null;
  library_images: LibraryImage[] | null;
};

const LIBRARY_DETAIL_SELECT = `
  id,
  slug,
  city,
  display_name,
  locality,
  district,
  formatted_address,
  full_address,
  latitude,
  longitude,
  map_link,
  nearest_metro,
  nearest_metro_distance_km,
  verification_status,
  opening_time,
  closing_time,
  pin_code,
  description,
  amenities_text,
  total_seats,
  phone_number,
  state,
  aggregate_rating,
  review_count,
  library_fee_plans (
    id,
    library_branch_id,
    plan_name,
    price,
    currency,
    description,
    duration_label,
    seat_type,
    hours_per_day,
    base_price,
    discount_percentage,
    discounted_price,
    plan_category,
    offer_name,
    sort_order,
    is_active
  ),
  library_images (
    imagekit_url,
    sort_order,
    is_cover
  )
`;

interface PageProps {
  params: Promise<{ city: string; slug: string }>;
}

// Library pages are rendered on first request and cached (ISR). Pre-rendering
// all ~12k pages at build time is slow and costs build minutes for no benefit.
export async function generateStaticParams() {
  return [];
}

// Edits call revalidatePath() for the page, so a long window is safe and cheap.
export const revalidate = 3600;

function formatTimeLabel(value: string | null | undefined) {
  if (!value) return null;

  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return value;
  }

  const period = hours >= 12 ? "PM" : "AM";
  const normalizedHours = hours % 12 || 12;
  return `${normalizedHours}:${String(minutes).padStart(2, "0")} ${period}`;
}

function formatCurrency(value: number | null | undefined, currency = "INR") {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function getStartingPrice(feePlans: FeePlan[]) {
  const prices = feePlans
    .map((plan) => plan.discounted_price ?? plan.price)
    .filter((value): value is number => typeof value === "number" && !Number.isNaN(value));

  if (prices.length === 0) return null;
  return Math.min(...prices);
}

function buildLibraryDescription(lib: LibraryDetailData, feePlans: FeePlan[], amenities: string[]) {
  const locationParts = [lib.locality, lib.district, lib.city].filter(Boolean);
  const locationLabel = locationParts.join(", ");
  const openingLabel = formatTimeLabel(lib.opening_time);
  const closingLabel = formatTimeLabel(lib.closing_time);
  const startingPrice = getStartingPrice(feePlans);
  const priceLabel = formatCurrency(startingPrice, feePlans[0]?.currency ?? "INR");
  const amenityHighlights = amenities.slice(0, 4).join(", ");

  const parts = [
    `${lib.display_name} is a study library in ${locationLabel || lib.city}.`,
    lib.nearest_metro
      ? lib.nearest_metro_distance_km
        ? `It is around ${lib.nearest_metro_distance_km} km from ${lib.nearest_metro} metro station.`
        : `It is located near ${lib.nearest_metro} metro station.`
      : null,
    openingLabel && closingLabel
      ? `Typical operating hours are from ${openingLabel} to ${closingLabel}.`
      : null,
    lib.total_seats ? `The library lists ${lib.total_seats} seats for students.` : null,
    priceLabel ? `Plans start from ${priceLabel}.` : null,
    amenityHighlights ? `Common amenities include ${amenityHighlights}.` : null,
  ];

  return parts.filter(Boolean).join(" ");
}

function buildMetadataDescription(lib: LibraryDetailData, feePlans: FeePlan[]) {
  const startingPrice = getStartingPrice(feePlans);
  const priceLabel = formatCurrency(startingPrice, feePlans[0]?.currency ?? "INR");

  return [
    `Study at ${lib.display_name}`,
    lib.locality ?? lib.district ?? lib.city,
    lib.nearest_metro ? `Near ${lib.nearest_metro}` : null,
    priceLabel ? `Plans from ${priceLabel}` : null,
    "See photos, fees, amenities, and directions.",
  ]
    .filter(Boolean)
    .join(". ");
}

function buildFeatureHighlights(lib: LibraryDetailData, feePlans: FeePlan[], amenities: string[]) {
  const openingLabel = formatTimeLabel(lib.opening_time);
  const closingLabel = formatTimeLabel(lib.closing_time);
  const startingPrice = getStartingPrice(feePlans);
  const priceLabel = formatCurrency(startingPrice, feePlans[0]?.currency ?? "INR");

  return [
    lib.nearest_metro
      ? lib.nearest_metro_distance_km
        ? `Located about ${lib.nearest_metro_distance_km} km from ${lib.nearest_metro} metro station.`
        : `Located near ${lib.nearest_metro} metro station.`
      : null,
    openingLabel && closingLabel
      ? `Operating hours are listed from ${openingLabel} to ${closingLabel}.`
      : null,
    lib.total_seats ? `This listing mentions ${lib.total_seats} total seats.` : null,
    priceLabel ? `The current price range starts from ${priceLabel}.` : null,
    amenities.length ? `Amenities highlighted include ${amenities.slice(0, 5).join(", ")}.` : null,
  ].filter(Boolean) as string[];
}

function buildComparisonTips(lib: LibraryDetailData, feePlans: FeePlan[]) {
  const hasReservedPlan = feePlans.some((plan) => plan.seat_type === "reserved");
  const hasOffers = feePlans.some((plan) => plan.plan_category === "offer");

  return [
    `Compare ${lib.display_name} with nearby libraries by checking commute time from ${lib.nearest_metro ?? "your nearest metro"}, daily study hours, and the overall environment for focused study.`,
    hasReservedPlan
      ? "This listing includes reserved seating options, which can matter if you want a fixed seat every day."
      : "Check whether you prefer reserved or flexible seating when comparing this library with other options nearby.",
    hasOffers
      ? "Review both regular plans and offer-based pricing so you understand the actual monthly cost before you choose."
      : "Look at the total monthly cost, seating comfort, and amenities together instead of comparing on price alone.",
  ];
}

function normalizeLibraryDetail(data: LibraryDetailData): LibraryDetailData {
  const library_fee_plans = (data.library_fee_plans ?? [])
    .filter((plan) => plan.is_active !== false)
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));

  const library_images = [...(data.library_images ?? [])].sort((a, b) => {
    const aPriority = a.is_cover ? 0 : 1;
    const bPriority = b.is_cover ? 0 : 1;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return (a.sort_order ?? 999) - (b.sort_order ?? 999);
  });

  return {
    ...data,
    library_fee_plans,
    library_images,
  };
}

async function getLibraryDetailData(slug: string): Promise<LibraryDetailData | null> {
  const { data, error } = await supabaseServer
    .from("library_branches")
    .select(LIBRARY_DETAIL_SELECT)
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (error || !data) return null;
  return normalizeLibraryDetail(data as LibraryDetailData);
}

const getCachedLibraryDetailData = unstable_cache(
  async (slug: string) => getLibraryDetailData(slug),
  ["library-detail-data"],
  {
    revalidate: 3600,
    tags: ["library-detail", "library-cards"],
  },
);

const getLibraryDetailForRoute =
  process.env.NODE_ENV === "development" ? getLibraryDetailData : getCachedLibraryDetailData;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { city, slug } = await params;
  const lib = await getLibraryDetailForRoute(slug);
  if (!lib) return { title: "Library not found", robots: { index: false, follow: true } };
  const feePlans = lib.library_fee_plans ?? [];
  const amenities = parseAmenities(lib.amenities_text);

  const siteUrl = getSiteUrl();
  // Canonical always uses the library's real city, whatever city is in the URL.
  const pageUrl = `${siteUrl}/${citySlug(lib.city)}/library/${slug}`;
  void city;
  const previewImage =
    (lib.library_images?.[0]?.imagekit_url
      ? getOptimizedImageUrl(lib.library_images[0].imagekit_url, "detailHero")
      : null) || `${siteUrl}/logo-icon.webp`;
  // The root layout template appends " | LibraryNear"; never add it here too.
  const previewTitle = libraryTitleParts(lib.display_name, lib.locality, lib.city).join(", ");
  const previewDescription = buildMetadataDescription(lib, feePlans);
  const keywords = [
    lib.display_name,
    lib.locality,
    lib.city,
    lib.nearest_metro ? `${lib.nearest_metro} metro` : null,
    "study library",
    "reading room",
    ...(amenities.slice(0, 4)),
  ].filter(Boolean) as string[];

  return {
    title: previewTitle,
    description: previewDescription,
    keywords,
    robots: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
    alternates: {
      canonical: pageUrl,
    },
    openGraph: {
      type: "website",
      url: pageUrl,
      title: `${previewTitle} | LibraryNear`,
      description: previewDescription,
      siteName: "LibraryNear",
      images: [
        {
          url: previewImage,
          width: 1200,
          height: 800,
          alt: `${lib.display_name} on LibraryNear`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${previewTitle} | LibraryNear`,
      description: previewDescription,
      images: [previewImage],
    },
  };
}

function parseAmenities(amenitiesText: string | null): string[] {
  if (!amenitiesText) return [];
  return amenitiesText
    .split(/[,•|\n]/)
    .map((a) => a.trim())
    .filter(Boolean)
    .slice(0, 12);
}

type NearbyLibrary = LibraryCardData & { coverImageUrl: string | null };

async function getNearbyLibraries(city: string, locality: string | null, excludeId: string) {
  if (!locality) return [] as NearbyLibrary[];
  const rows = await runLibraryCardQuery((selectClause) =>
    supabaseServer
      .from("library_branches")
      .select(selectClause)
      .eq("is_active", true)
      .eq("city", city)
      .eq("locality", locality)
      .neq("id", excludeId)
      .order("profile_completeness_score", { ascending: false })
      .limit(6),
  );
  return rows.map(withCardImage) as NearbyLibrary[];
}

const getCachedNearbyLibraries = unstable_cache(getNearbyLibraries, ["library-detail-nearby-v1"], {
  revalidate: 3600,
  tags: ["library-cards"],
});

type PublishedReview = {
  id: string;
  rating: number;
  review_text: string;
  created_at: string;
  reviewer_name: string | null;
  reviewer_photo_url: string | null;
  source: string | null;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
};

async function getPublishedReviews(libraryId: string): Promise<PublishedReview[]> {
  const { data } = await supabaseServer
    .from("library_reviews")
    .select("id, rating, review_text, created_at, reviewer_name, reviewer_photo_url, source, profiles(full_name, avatar_url)")
    .eq("library_branch_id", libraryId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(50);
  return (data || []) as unknown as PublishedReview[];
}

const getCachedPublishedReviews = unstable_cache(getPublishedReviews, ["library-detail-reviews-v1"], {
  revalidate: 3600,
  tags: ["library-detail", "library-reviews"],
});

export default async function LibraryDetailPage({ params }: PageProps) {
  const { city, slug } = await params;

  const libraryMeasurement = await measureAsync(
    "libraryDetailData",
    () => getLibraryDetailForRoute(slug),
  );
  const lib = libraryMeasurement.result;
  // Runs before anything is streamed, so Google receives a real 404.
  if (!lib) notFound();

  // One URL per library: send /any-city/library/x to the library's real city.
  const canonicalCity = citySlug(lib.city);
  if (city !== canonicalCity) {
    permanentRedirect(`/${canonicalCity}/library/${slug}`);
  }

  const feePlans = lib.library_fee_plans ?? [];
  const isDev = process.env.NODE_ENV === "development";
  const [reviews, nearbyLibraries] = await Promise.all([
    isDev ? getPublishedReviews(lib.id) : getCachedPublishedReviews(lib.id),
    isDev
      ? getNearbyLibraries(lib.city, lib.locality, lib.id)
      : getCachedNearbyLibraries(lib.city, lib.locality, lib.id),
  ]);

  const images = (lib.library_images ?? [])
    .map((image, index) =>
      getOptimizedImageUrl(image.imagekit_url, index === 0 ? "detailHero" : "detailThumb"),
    )
    .filter((imageUrl): imageUrl is string => Boolean(imageUrl));
  const amenities = parseAmenities(lib.amenities_text);
  const fallbackDescription = buildLibraryDescription(lib, feePlans, amenities);
  const featureHighlights = buildFeatureHighlights(lib, feePlans, amenities);
  const comparisonTips = buildComparisonTips(lib, feePlans);
  logPerf(
    "libraryDetail",
    [libraryMeasurement.metric],
    `slug="${slug}" city="${city}" images=${images.length} feePlans=${feePlans.length}`,
  );

  const seoInput = {
    ...lib,
    amenities,
    feePlans,
  };
  const answerSummary = buildAnswerSummary(seoInput);
  const faqs = buildLibraryFaqs(seoInput);
  const timingLabel = formatTimingLabel(lib);
  const priceRangeLabel = formatPriceRange(feePlans);
  const priceRange = getPriceRange(feePlans);

  const walkingMins = lib.nearest_metro_distance_km
    ? Math.round(lib.nearest_metro_distance_km * 12)
    : null;
  const siteUrl = getSiteUrl();
  const cityName = lib.city;
  const pageUrl = `${siteUrl}/${canonicalCity}/library/${slug}`;
  const localitySlug = toPlaceSlug(lib.locality);
  const openingHoursSpecification = buildOpeningHoursSpecification(lib);

  // Only first-party reviews written on LibraryNear go into structured data.
  // Imported third-party (Google) reviews are not marked up, per Google's
  // review snippet guidelines, and anonymous reviews are skipped.
  const markupReviews = reviews.filter(
    (review) => review.source !== "google" && Boolean(review.profiles?.full_name),
  );

  const librarySchema = {
    "@context": "https://schema.org",
    "@type": "Library",
    "@id": `${pageUrl}#library`,
    name: lib.display_name,
    url: pageUrl,
    description: lib.description || fallbackDescription,
    image: images.slice(0, 6),
    address: {
      "@type": "PostalAddress",
      streetAddress: lib.full_address ?? lib.formatted_address,
      addressLocality: lib.locality ?? lib.district ?? cityName,
      addressRegion: lib.state ?? undefined,
      postalCode: lib.pin_code,
      addressCountry: "IN",
    },
    areaServed: {
      "@type": "City",
      name: cityName,
    },
    ...(lib.latitude && lib.longitude
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: lib.latitude,
            longitude: lib.longitude,
          },
          hasMap: `https://www.google.com/maps/search/?api=1&query=${lib.latitude},${lib.longitude}`,
        }
      : {}),
    ...(lib.phone_number ? { telephone: lib.phone_number } : {}),
    ...(openingHoursSpecification ? { openingHoursSpecification } : {}),
    ...(priceRange
      ? {
          priceRange:
            priceRange.min === priceRange.max
              ? `₹${priceRange.min}`
              : `₹${priceRange.min}-₹${priceRange.max}`,
        }
      : {}),
    ...(amenities.length
      ? {
          amenityFeature: amenities.map((amenity) => ({
            "@type": "LocationFeatureSpecification",
            name: amenity,
            value: true,
          })),
        }
      : {}),
    ...(lib.total_seats ? { maximumAttendeeCapacity: lib.total_seats } : {}),
    ...(feePlans.length
      ? {
          makesOffer: feePlans.slice(0, 8).map((plan) => ({
            "@type": "Offer",
            priceCurrency: plan.currency || "INR",
            price: plan.discounted_price ?? plan.price,
            name: plan.plan_name,
            description: plan.description || plan.duration_label || undefined,
            availability: "https://schema.org/InStock",
          })),
        }
      : {}),
    ...(lib.aggregate_rating && lib.review_count
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: lib.aggregate_rating,
            reviewCount: lib.review_count,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    ...(markupReviews.length
      ? {
          review: markupReviews.slice(0, 10).map((r) => ({
            "@type": "Review",
            author: { "@type": "Person", name: r.profiles?.full_name },
            datePublished: r.created_at?.split("T")[0],
            reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5 },
            reviewBody: r.review_text,
          })),
        }
      : {}),
  };
  const breadcrumbItems = [
    { name: "Home", item: siteUrl },
    { name: cityName, item: `${siteUrl}/${canonicalCity}` },
    ...(lib.locality
      ? [{ name: lib.locality, item: `${siteUrl}/${canonicalCity}/locality/${localitySlug}` }]
      : []),
    { name: lib.display_name, item: pageUrl },
  ];
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: entry.item,
    })),
  };
  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": pageUrl,
    url: pageUrl,
    name: libraryTitleParts(lib.display_name, lib.locality, cityName).join(", "),
    about: { "@id": `${pageUrl}#library` },
    isPartOf: { "@id": `${siteUrl}/#website` },
    publisher: { "@id": `${siteUrl}/#organization` },
    speakable: { "@type": "SpeakableSpecification", cssSelector: ["#library-summary"] },
  };
  const jsonLd = [librarySchema, breadcrumbSchema, webPageSchema, faqPageSchema(faqs)];

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      {/* BREADCRUMB + TITLE */}
      <div className="container mx-auto px-6 md:px-10 py-6 border-b border-border/50">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 items-center text-sm text-muted-foreground mb-2">
              <Link href="/" className="hover:underline">Home</Link>
              <span>/</span>
              <Link href={`/${canonicalCity}`} className="hover:underline">{cityName}</Link>
              {lib.locality ? (
                <>
                  <span>/</span>
                  <Link href={`/${canonicalCity}/locality/${localitySlug}`} className="hover:underline">
                    {lib.locality}
                  </Link>
                </>
              ) : null}
              <span>/</span>
              <span className="text-black font-medium">{lib.display_name}</span>
            </nav>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-black">{lib.display_name}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-2">
              {lib.verification_status === "verified" && (
                <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200 font-medium text-xs">
                  <ShieldCheck className="w-3 h-3 mr-1" /> Verified
                </Badge>
              )}
              {lib.nearest_metro && (
                <div className="flex items-center text-sm text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5 mr-1" />
                  {lib.nearest_metro}{walkingMins ? ` · ${walkingMins} min walk` : ""}
                </div>
              )}
              {timingLabel && (
                <div className="flex items-center text-sm text-muted-foreground">
                  <Clock className="w-3.5 h-3.5 mr-1" />
                  {timingLabel}
                </div>
              )}
            </div>
          </div>

          <LibraryDetailActions
            libraryId={lib.id}
            libraryName={lib.display_name}
            locality={lib.locality}
            city={lib.city}
          />
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="container mx-auto px-6 md:px-10 py-8 grid grid-cols-1 lg:grid-cols-3 gap-10">

        {/* LEFT COLUMN */}
        <div className="lg:col-span-2 space-y-10">

          {/* Answer-first summary: the sentence answer engines quote. */}
          <section aria-labelledby="library-summary-heading" className="rounded-2xl border border-primary/15 bg-primary/[0.03] p-5">
            <h2 id="library-summary-heading" className="sr-only">Quick facts</h2>
            <p id="library-summary" className="text-[15px] leading-7 text-black">{answerSummary}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fees</dt>
                <dd className="mt-0.5 font-semibold text-black">{priceRangeLabel ?? "Ask library"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hours</dt>
                <dd className="mt-0.5 font-semibold text-black">{timingLabel ?? "Ask library"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nearest metro</dt>
                <dd className="mt-0.5 font-semibold text-black">{lib.nearest_metro ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rating</dt>
                <dd className="mt-0.5 font-semibold text-black">
                  {lib.aggregate_rating && lib.review_count
                    ? `${lib.aggregate_rating.toFixed(1)} ★ (${lib.review_count})`
                    : "No reviews yet"}
                </dd>
              </div>
            </dl>
          </section>

          <LibraryPhotoGallery images={images} libraryName={lib.display_name} />

          {/* About */}
          <section>
            <h2 className="text-xl font-bold mb-4">About {lib.display_name}</h2>
            {lib.description ? (
              <p className="text-muted-foreground leading-relaxed mb-6 whitespace-pre-wrap">
                {lib.description}
              </p>
            ) : (
              <p className="text-muted-foreground leading-relaxed mb-6">
                {fallbackDescription}
              </p>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm text-muted-foreground">
              {lib.total_seats && (
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-black">{lib.total_seats}</span> total seats
                </div>
              )}
            </div>
          </section>

          {featureHighlights.length > 0 ? (
            <section className="rounded-3xl border border-border/70 bg-slate-50/40 p-6">
              <h2 className="text-xl font-bold text-black">Library highlights</h2>
              <ul className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
                {featureHighlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <AmenitiesGrid amenities={amenities} />

          {/* Location */}
          <section>
            <h2 className="text-xl font-bold mb-4">Location</h2>
            <Card className="overflow-hidden border-border/60">
              <CardContent className="p-0">
                {lib.latitude && lib.longitude ? (
                  <MapEmbed
                    lat={lib.latitude}
                    lng={lib.longitude}
                    name={lib.display_name}
                  />
                ) : (
                  <div className="w-full h-52 bg-muted flex items-center justify-center border-b border-border/40">
                    <div className="text-center">
                      <Navigation className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">No location data</p>
                    </div>
                  </div>
                )}
                <div className="p-5 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                  <div>
                    <p className="text-sm font-medium">{lib.full_address ?? lib.formatted_address}</p>
                    {lib.locality && (
                      <p className="text-sm text-muted-foreground mt-0.5">{lib.locality}, {cityName}</p>
                    )}
                  </div>
                  {lib.map_link && (
                    <a href={lib.map_link} target="_blank" rel="noopener noreferrer">
                      <Button className="shrink-0 font-semibold">
                        Get Directions <ExternalLink className="w-4 h-4 ml-1.5" />
                      </Button>
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>

          {/* How to compare */}
          <section className="rounded-3xl border border-border/70 p-6">
            <h2 className="text-xl font-bold text-black">Before you choose {lib.display_name}</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-muted-foreground">
              {comparisonTips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </section>

          {/* Student Reviews */}
          <LibraryReviews
            libraryBranchId={lib.id}
            reviews={reviews}
            aggregateRating={lib.aggregate_rating || 0}
            reviewCount={lib.review_count || 0}
          />

          {/* FAQ (mirrors the FAQPage markup) */}
          <section aria-labelledby="library-faq-heading">
            <h2 id="library-faq-heading" className="text-xl font-bold text-black mb-4">
              Frequently asked questions about {lib.display_name}
            </h2>
            <div className="divide-y divide-border rounded-2xl border border-border">
              {faqs.map((faq, index) => (
                <details key={faq.question} className="group p-5" open={index < 2}>
                  <summary className="cursor-pointer list-none font-semibold text-black">
                    {faq.question}
                  </summary>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">{faq.answer}</p>
                </details>
              ))}
            </div>
          </section>

          {/* Nearby alternatives */}
          {nearbyLibraries.length > 0 ? (
            <section aria-labelledby="nearby-heading">
              <div className="mb-4 flex items-end justify-between gap-4">
                <h2 id="nearby-heading" className="text-xl font-bold text-black">
                  Other libraries in {lib.locality}
                </h2>
                <Link
                  href={`/${canonicalCity}/locality/${localitySlug}`}
                  className="text-sm font-semibold text-primary hover:underline"
                >
                  See all in {lib.locality}
                </Link>
              </div>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {nearbyLibraries.map((other) => (
                  <li key={other.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-4">
                    <div className="min-w-0">
                      <Link
                        href={`/${canonicalCity}/library/${other.slug}`}
                        className="block truncate font-semibold text-black hover:text-primary"
                      >
                        {other.display_name}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {other.nearest_metro ? `Near ${other.nearest_metro}` : other.locality}
                        {other.aggregate_rating && other.review_count
                          ? ` · ${other.aggregate_rating.toFixed(1)} ★`
                          : ""}
                      </p>
                    </div>
                    <Link
                      href={`/compare?ids=${lib.id},${other.id}`}
                      rel="nofollow"
                      className="shrink-0 rounded-full border border-border px-3 py-1 text-xs font-semibold text-black hover:border-primary hover:text-primary"
                    >
                      Compare
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        {/* SIDEBAR */}
        <div>
          <Card className="sticky top-28 border border-border/80 shadow-sm rounded-2xl overflow-hidden">
            <CardContent className="p-6">
              <FeePlansList feePlans={feePlans} />
              <EnquiryForm
                libraryBranchId={lib.id}
                phoneNumber={lib.phone_number}
                sourcePage={`/${canonicalCity}/library/${slug}`}
              />
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
