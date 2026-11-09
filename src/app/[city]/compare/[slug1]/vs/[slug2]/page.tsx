import { notFound } from "next/navigation";
import Image from "next/image";
import { MapPin, Star, CheckCircle2, Clock, Check, X, ArrowRightLeft } from "lucide-react";
import { supabaseServer } from "@/lib/supabase-server";
import { getOptimizedImageUrl } from "@/lib/library-images";
import { getSiteUrl } from "@/lib/site-url";
import { IntentLink } from "@/components/intent-link";
import type { Metadata } from "next";
import { slugToIlikePattern, slugToLabel } from "@/lib/places";

interface PageProps {
  params: Promise<{ city: string; slug1: string; slug2: string }>;
}

async function getLibraryForComparison(slug: string, city: string) {
  const { data, error } = await supabaseServer
    .from("library_branches")
    .select(`
      id,
      slug,
      city,
      display_name,
      locality,
      nearest_metro,
      nearest_metro_distance_km,
      verification_status,
      opening_time,
      closing_time,
      amenities_text,
      total_seats,
      aggregate_rating,
      review_count,
      library_images (
        imagekit_url,
        is_cover,
        sort_order
      )
    `)
    .eq("slug", slug)
    .ilike("city", slugToIlikePattern(city))
    .single();

  if (error || !data) return null;

  // Process cover image
  let coverImageUrl = null;
  const libData = data as any;
  if (libData.library_images && libData.library_images.length > 0) {
    const images = libData.library_images.sort((a: any, b: any) => {
      if (a.is_cover && !b.is_cover) return -1;
      if (!a.is_cover && b.is_cover) return 1;
      return (a.sort_order ?? 999) - (b.sort_order ?? 999);
    });
    if (images[0].imagekit_url) {
      coverImageUrl = getOptimizedImageUrl(images[0].imagekit_url, "card");
    }
  }

  return { ...libData, coverImageUrl };
}

export const revalidate = 86400; // Cache for 24 hours

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { city, slug1, slug2 } = await params;
  
  const [lib1, lib2] = await Promise.all([
    getLibraryForComparison(slug1, city),
    getLibraryForComparison(slug2, city)
  ]);

  if (!lib1 || !lib2) return {};

  const cityLabel = slugToLabel(city);
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/${city}/compare/${slug1}/vs/${slug2}`;
  
  const title = `${lib1.display_name} vs ${lib2.display_name} | Compare Libraries in ${cityLabel}`;
  const description = `Detailed side-by-side comparison of ${lib1.display_name} and ${lib2.display_name} in ${cityLabel}. Compare ratings, amenities, timings, and fees.`;

  return {
    title,
    description,
    alternates: {
      canonical: pageUrl,
    },
    openGraph: {
      type: "website",
      url: pageUrl,
      title,
      description,
      siteName: "LibraryNear",
    },
  };
}

// Utility to parse time string like "09:00:00" to "9:00 AM"
function formatTime(timeStr?: string | null) {
  if (!timeStr) return "N/A";
  try {
    const [h, m] = timeStr.split(":");
    let hours = parseInt(h, 10);
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12; 
    return `${hours}:${m} ${ampm}`;
  } catch (e) {
    return timeStr;
  }
}

export default async function ComparePage({ params }: PageProps) {
  const { city, slug1, slug2 } = await params;
  
  const [lib1, lib2] = await Promise.all([
    getLibraryForComparison(slug1, city),
    getLibraryForComparison(slug2, city)
  ]);

  if (!lib1 || !lib2) notFound();

  const cityLabel = slugToLabel(city);
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/${city}/compare/${slug1}/vs/${slug2}`;

  // Extract common amenities
  const lib1Amenities = new Set((lib1.amenities_text as string)?.split(",").map((a: string) => a.trim().toLowerCase()) || []);
  const lib2Amenities = new Set((lib2.amenities_text as string)?.split(",").map((a: string) => a.trim().toLowerCase()) || []);
  const allAmenities = Array.from(new Set([...lib1Amenities, ...lib2Amenities])).sort();

  return (
    <div className="min-h-screen bg-gray-50/50 py-10 md:py-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="mb-12 text-center">
          <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-full mb-6 text-primary">
            <ArrowRightLeft className="h-6 w-6" />
          </div>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-gray-900 mb-4 max-w-4xl mx-auto leading-tight">
            <span className="text-primary">{lib1.display_name}</span> vs <span className="text-primary">{lib2.display_name}</span>
          </h1>
          <p className="text-lg text-gray-600">
            Compare study libraries in {cityLabel} to find the perfect space for your preparation.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Header Row (Photos and Names) */}
          <div className="grid grid-cols-2 md:grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
            <div className="hidden md:block p-8 bg-gray-50/50">
              <h2 className="text-lg font-bold text-gray-900">Feature Comparison</h2>
              <p className="text-sm text-gray-500 mt-1">Side-by-side analysis</p>
            </div>
            
            <div className="flex flex-col">
              <div className="relative aspect-video w-full bg-gray-100">
                {lib1.coverImageUrl ? (
                  <Image src={lib1.coverImageUrl} alt={lib1.display_name} fill className="object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-gray-300"><MapPin className="h-10 w-10" /></div>
                )}
              </div>
              <div className="p-6 text-center">
                <h3 className="text-xl font-bold text-gray-900 line-clamp-2 min-h-[56px]">{lib1.display_name}</h3>
                <IntentLink href={`/${city}/library/${lib1.slug}`} className="mt-4 inline-flex px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-full hover:bg-gray-800 transition-colors">
                  View Profile
                </IntentLink>
              </div>
            </div>

            <div className="flex flex-col">
              <div className="relative aspect-video w-full bg-gray-100">
                {lib2.coverImageUrl ? (
                  <Image src={lib2.coverImageUrl} alt={lib2.display_name} fill className="object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-gray-300"><MapPin className="h-10 w-10" /></div>
                )}
              </div>
              <div className="p-6 text-center">
                <h3 className="text-xl font-bold text-gray-900 line-clamp-2 min-h-[56px]">{lib2.display_name}</h3>
                <IntentLink href={`/${city}/library/${lib2.slug}`} className="mt-4 inline-flex px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-full hover:bg-gray-800 transition-colors">
                  View Profile
                </IntentLink>
              </div>
            </div>
          </div>

          {/* Data Rows */}
          <div className="divide-y divide-gray-100">
            {/* Rating */}
            <div className="grid grid-cols-2 md:grid-cols-3 divide-x divide-gray-100 group hover:bg-gray-50/50 transition-colors">
              <div className="hidden md:flex items-center p-6 text-sm font-medium text-gray-500">Student Rating</div>
              <div className="p-6 text-center flex flex-col items-center justify-center">
                {lib1.aggregate_rating ? (
                  <>
                    <div className="flex items-center gap-1.5 text-2xl font-bold text-gray-900">
                      <Star className="h-6 w-6 fill-yellow-400 text-yellow-400" />
                      {lib1.aggregate_rating.toFixed(1)}
                    </div>
                    <span className="text-sm text-gray-500 mt-1">{lib1.review_count} reviews</span>
                  </>
                ) : <span className="text-gray-400">N/A</span>}
              </div>
              <div className="p-6 text-center flex flex-col items-center justify-center">
                {lib2.aggregate_rating ? (
                  <>
                    <div className="flex items-center gap-1.5 text-2xl font-bold text-gray-900">
                      <Star className="h-6 w-6 fill-yellow-400 text-yellow-400" />
                      {lib2.aggregate_rating.toFixed(1)}
                    </div>
                    <span className="text-sm text-gray-500 mt-1">{lib2.review_count} reviews</span>
                  </>
                ) : <span className="text-gray-400">N/A</span>}
              </div>
            </div>

            {/* Location */}
            <div className="grid grid-cols-2 md:grid-cols-3 divide-x divide-gray-100 group hover:bg-gray-50/50 transition-colors">
              <div className="hidden md:flex items-center p-6 text-sm font-medium text-gray-500">Location</div>
              <div className="p-6 text-center text-sm font-medium text-gray-900">{lib1.locality || "N/A"}</div>
              <div className="p-6 text-center text-sm font-medium text-gray-900">{lib2.locality || "N/A"}</div>
            </div>

            {/* Metro */}
            <div className="grid grid-cols-2 md:grid-cols-3 divide-x divide-gray-100 group hover:bg-gray-50/50 transition-colors">
              <div className="hidden md:flex items-center p-6 text-sm font-medium text-gray-500">Nearest Metro</div>
              <div className="p-6 text-center">
                {lib1.nearest_metro ? (
                  <span className="text-sm font-medium text-gray-900">{lib1.nearest_metro} ({lib1.nearest_metro_distance_km}km)</span>
                ) : <span className="text-gray-400">-</span>}
              </div>
              <div className="p-6 text-center">
                {lib2.nearest_metro ? (
                  <span className="text-sm font-medium text-gray-900">{lib2.nearest_metro} ({lib2.nearest_metro_distance_km}km)</span>
                ) : <span className="text-gray-400">-</span>}
              </div>
            </div>

            {/* Timings */}
            <div className="grid grid-cols-2 md:grid-cols-3 divide-x divide-gray-100 group hover:bg-gray-50/50 transition-colors">
              <div className="hidden md:flex items-center p-6 text-sm font-medium text-gray-500">Operating Hours</div>
              <div className="p-6 text-center text-sm font-medium text-gray-900 flex items-center justify-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                {formatTime(lib1.opening_time)} - {formatTime(lib1.closing_time)}
              </div>
              <div className="p-6 text-center text-sm font-medium text-gray-900 flex items-center justify-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                {formatTime(lib2.opening_time)} - {formatTime(lib2.closing_time)}
              </div>
            </div>

            {/* Amenities Section Header */}
            <div className="bg-gray-50/80 p-4 border-y border-gray-100">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider text-center md:text-left md:px-4">Amenities</h3>
            </div>

            {/* Dynamic Amenities */}
            {allAmenities.length > 0 ? allAmenities.map(amenity => (
              <div key={amenity} className="grid grid-cols-2 md:grid-cols-3 divide-x divide-gray-100 group hover:bg-gray-50/50 transition-colors">
                <div className="hidden md:flex items-center p-6 text-sm font-medium text-gray-700 capitalize">
                  {amenity}
                </div>
                <div className="p-4 md:p-6 flex items-center justify-center">
                  <div className="md:hidden text-xs font-semibold text-gray-500 mb-2 capitalize absolute top-2">{amenity}</div>
                  {lib1Amenities.has(amenity) ? <Check className="w-6 h-6 text-green-500" /> : <X className="w-6 h-6 text-gray-300" />}
                </div>
                <div className="p-4 md:p-6 flex items-center justify-center relative">
                  <div className="md:hidden text-xs font-semibold text-gray-500 mb-2 capitalize absolute top-2">{amenity}</div>
                  {lib2Amenities.has(amenity) ? <Check className="w-6 h-6 text-green-500" /> : <X className="w-6 h-6 text-gray-300" />}
                </div>
              </div>
            )) : (
              <div className="p-8 text-center text-gray-500">No amenities information available for comparison.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
