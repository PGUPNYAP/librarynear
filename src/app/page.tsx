import Image from "next/image";
import { unstable_cache } from "next/cache";
import { MapPin, Search, BookOpen, CheckCircle } from "lucide-react";
import { Suspense } from "react";
import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabase-server";
import { type LibraryCardData, runLibraryCardQuery, withCardImage } from "@/lib/library-card-data";
import { logPerf, measureAsync } from "@/lib/perf";
import { DeferredSaveButton } from "@/components/deferred-save-button";
import { HomeSearchShell } from "@/components/home-search-shell";
import { IntentLink } from "@/components/intent-link";
import { CityIcon } from "@/components/city-icon";
import { LibraryGridSkeleton } from "@/components/library-listing-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { getSiteUrl } from "@/lib/site-url";
import { sanitizeSearchTerm } from "@/lib/postgrest";
import { getActiveCities } from "@/lib/cities-server";
import { getCityLocalities } from "@/lib/library-search";


export const revalidate = 1800;

function HomeSkeleton() {
  return (
    <>
      <div className="w-full border-b border-border/50 bg-white shadow-sm">
        <div className="container mx-auto px-4 md:px-10 flex items-center gap-3 overflow-x-auto no-scrollbar py-3 md:py-4">
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-9 w-32 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-20 rounded-full" />
        </div>
      </div>
      <section className="container mx-auto px-6 md:px-10 py-10 pb-20">
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-7 w-48" />
        </div>
        <LibraryGridSkeleton count={10} gridClassName="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 gap-y-10" />
      </section>
    </>
  );
}

async function getLibraries(locality?: string, q?: string): Promise<LibraryCardData[]> {
  return runLibraryCardQuery((selectClause) => {
    let query = supabaseServer
      .from("library_branches")
      .select(selectClause)
      .eq("is_active", true)
      .eq("city", "Delhi")
      .not("cover_image_url", "is", null)
      .neq("cover_image_url", "")
      .order("profile_completeness_score", { ascending: false })
      .limit(20);

    if (locality) query = query.eq("locality", locality);
    if (q) {
      const safeQ = sanitizeSearchTerm(q);
      query = query.or(`name.ilike.%${safeQ}%,locality.ilike.%${safeQ}%,nearest_metro.ilike.%${safeQ}%,display_name.ilike.%${safeQ}%`);
    }

    return query;
  });
}

const getCachedLibraries = unstable_cache(
  async (locality?: string, q?: string) => getLibraries(locality, q),
  ["home-libraries"],
  {
    revalidate: 1800,
    tags: ["library-cards"],
  },
);

const getHomeLibraries =
  process.env.NODE_ENV === "development" ? getLibraries : getCachedLibraries;

async function getTopLocalities(): Promise<string[]> {
  const rows = await getCityLocalities("Delhi");
  return rows.slice(0, 25).map((row) => row.name);
}

const getCachedTopLocalities = unstable_cache(
  async () => getTopLocalities(),
  ["home-top-localities"],
  {
    revalidate: 1800,
    tags: ["library-cards"],
  },
);

const getHomeTopLocalities =
  process.env.NODE_ENV === "development" ? getTopLocalities : getCachedTopLocalities;

function prioritizeLibrariesWithPhotos<T extends { cover_image_url?: string | null }>(libraries: T[]) {
  return [...libraries].sort((a, b) => {
    const aHasPhoto = a.cover_image_url ? 0 : 1;
    const bHasPhoto = b.cover_image_url ? 0 : 1;
    return aHasPhoto - bHasPhoto;
  });
}

export async function generateMetadata(): Promise<Metadata> {
  const siteUrl = getSiteUrl();

  return {
    title: "LibraryNear - Find the Best Study Libraries Near You in Delhi",
    description:
      "Discover and compare study libraries and reading rooms in Delhi. Explore localities, fees, amenities, and nearby metro access on LibraryNear.",
    alternates: {
      canonical: siteUrl,
    },
  };
}

async function HomeContent() {
  const [librariesMeasurement, topLocalitiesMeasurement, cities] = await Promise.all([
    measureAsync("libraries", () => getHomeLibraries()),
    measureAsync("topLocalities", () => getHomeTopLocalities()),
    getActiveCities(),
  ]);
  const libraries = prioritizeLibrariesWithPhotos(librariesMeasurement.result).map(withCardImage);
  const topLocalities = topLocalitiesMeasurement.result;
  logPerf(
    "home",
    [librariesMeasurement.metric, topLocalitiesMeasurement.metric],
    `count=${libraries.length}`,
  );


  const homeFaqs = [
    {
      q: "How do I find the best study library near me in Delhi?",
      a: "Use LibraryNear to search by locality or metro station. Compare fees, amenities, timings, and verified status to shortlist the right library for your study routine.",
    },
    {
      q: "Is LibraryNear free for students?",
      a: "Yes. Browsing, comparing, and shortlisting libraries on LibraryNear is completely free for students. You only pay the library directly when you choose a plan.",
    },
    {
      q: "What amenities can I compare on LibraryNear?",
      a: "You can compare Wi-Fi, AC, power backup, locker facilities, drinking water, CCTV, quiet zones, and more across all listed libraries.",
    },
    {
      q: "How do library owners list on LibraryNear?",
      a: "Library owners can sign up, submit their library details, photos, and fee plans. Each listing is reviewed before going live to maintain quality for students.",
    },
  ];

  // Organization and WebSite markup is site-wide (root layout).
  const homeJsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: homeFaqs.map((faq) => ({
        "@type": "Question",
        name: faq.q,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.a,
        },
      })),
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd) }}
      />


      <div className="w-full border-b border-border/50 bg-white shadow-sm">
        <div className="container mx-auto px-4 md:px-10 flex items-center gap-2 md:gap-3 overflow-x-auto no-scrollbar py-2 md:py-3">
          <IntentLink
            href="/"
            className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] md:text-[13px] font-semibold transition-colors md:px-4 md:py-2 bg-primary text-white shadow-sm shadow-primary/20`}
          >
            All Delhi
          </IntentLink>
          {topLocalities.map((topLocality) => (
            <IntentLink
              key={topLocality}
              href={`/delhi/locality/${topLocality.toLowerCase().replace(/\s+/g, "-")}`}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] md:text-[13px] font-medium transition-colors md:px-4 md:py-2 border border-primary/30 text-muted-foreground hover:border-primary hover:text-primary`}
            >
              {topLocality}
            </IntentLink>
          ))}
        </div>
      </div>

      {/* LISTINGS GRID */}
      <section className="container mx-auto px-6 md:px-10 py-10 pb-20">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-black">
            {libraries.length > 0 ? "20+" : "0"} libraries in Delhi
          </h2>
        </div>

        {libraries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <MapPin className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-lg font-medium">No libraries found</p>
            <p className="text-sm mt-1">Try a different locality</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 gap-y-10">
            {libraries.map((lib, index) => (
              <IntentLink
                href={`/${lib.city.toLowerCase()}/library/${lib.slug}`}
                key={lib.id}
                className="group flex flex-col gap-2 cursor-pointer"
              >
                <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-muted">
                  {lib.coverImageUrl ? (
                    <Image
                      src={lib.coverImageUrl}
                      alt={`${lib.display_name} — study library in ${lib.locality || "Delhi"}`}
                      fill
                      priority={index < 2}
                      fetchPriority={index < 2 ? "high" : "auto"}
                      sizes="(max-width: 768px) 100vw, (max-width: 1280px) 33vw, 20vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
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

                {/* Info */}
                <div className="flex flex-col gap-0.5">
                  <h3 className="font-semibold text-[14px] truncate text-black leading-snug">
                    {lib.display_name}
                  </h3>
                  {lib.locality && (
                    <p className="text-[13px] text-muted-foreground truncate">{lib.locality}</p>
                  )}
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
        )}
      </section>

      {/* RICH CONTENT — How It Works + FAQ (only on default homepage, not filtered views) */}
      {/* How It Works */}
      <section className="border-t border-border/40 bg-slate-50/40">
        <div className="container mx-auto px-6 py-12 md:px-10">
          <h2 className="text-2xl font-bold text-black mb-8">How LibraryNear works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: Search,
                title: "Search by locality or metro",
                body: "Enter your preferred area or nearest metro station to discover study libraries within easy commuting distance.",
              },
              {
                icon: BookOpen,
                title: "Compare fees, amenities & timings",
                body: "View detailed profiles with photos, monthly plans, seating, Wi-Fi, AC, power backup, and operating hours side by side.",
              },
              {
                icon: CheckCircle,
                title: "Shortlist & connect",
                body: "Save libraries to your favourites, send enquiries directly, and choose the study space that fits your routine and budget.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-border bg-white p-6 shadow-sm">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-black">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Browse by locality */}
      {topLocalities.length > 0 && (
        <section className="border-t border-border/40 bg-white">
          <div className="container mx-auto px-6 py-12 md:px-10">
            <h2 className="text-2xl font-bold text-black mb-6">Browse libraries by locality in Delhi</h2>
            <div className="flex flex-wrap gap-3">
              {topLocalities.slice(0, 15).map((loc) => (
                <IntentLink
                  key={loc}
                  href={`/delhi/locality/${loc.toLowerCase().replace(/\s+/g, "-")}`}
                  className="rounded-full border border-primary/25 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-primary hover:text-primary"
                >
                  Libraries in {loc}
                </IntentLink>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Browse by city */}
      {cities.length > 1 && (
        <section className="border-t border-border/40 bg-white">
          <div className="container mx-auto px-6 py-12 md:px-10">
            <div className="mb-6 flex items-end justify-between gap-4">
              <h2 className="text-2xl font-bold text-black">Find libraries in other cities</h2>
              <IntentLink href="/cities" className="text-sm font-semibold text-primary hover:underline">All cities</IntentLink>
            </div>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {cities.slice(0, 12).map((city) => (
                <li key={city.slug}>
                  <IntentLink href={`/${city.slug}`} className="block rounded-2xl border border-border p-4 transition-colors hover:border-black">
                    <CityIcon slug={city.slug} className="mb-2 h-7 w-7 text-primary" />
                    <span className="block font-semibold text-black">{city.name}</span>
                  </IntentLink>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* FAQ */}
      <section className="border-t border-border/40 bg-slate-50/40">
        <div className="container mx-auto px-6 py-12 md:px-10">
          <h2 className="text-2xl font-bold text-black mb-8">Frequently asked questions</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {homeFaqs.map((faq) => (
              <div key={faq.q} className="rounded-2xl border border-border bg-white p-6 shadow-sm">
                <h3 className="text-base font-bold text-black">{faq.q}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <Suspense fallback={null}>
        <HomeSearchShell />
      </Suspense>

      <Suspense fallback={<HomeSkeleton />}>
        <HomeContent />
      </Suspense>
    </div>
  );
}
