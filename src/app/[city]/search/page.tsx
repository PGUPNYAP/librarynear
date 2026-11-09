import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SearchBar } from "@/components/search-bar";
import { InstantResults } from "@/components/instant-results";
import { resolveCityParam } from "@/lib/cities-server";

/**
 * Instant search results. The page shell is static per city; results are
 * computed in the browser from the city's search index, so opening it after
 * pressing Enter is immediate. Not indexed (the /libraries listing is).
 */
export const revalidate = 86400;

export async function generateStaticParams() {
  return [];
}

export const metadata: Metadata = {
  title: "Search libraries",
  robots: { index: false, follow: true },
};

export default async function SearchPage({ params }: { params: Promise<{ city: string }> }) {
  const { city: rawCity } = await params;
  const city = await resolveCityParam(rawCity);
  if (!city) notFound();

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="search-bar-sticky sticky top-16 z-30 border-b border-border/50 bg-white py-2 md:top-20 md:py-3">
        <div className="container mx-auto px-4 md:px-10">
          <div className="mx-auto w-full max-w-xl">
            <Suspense fallback={null}>
              <SearchBar city={city.slug} />
            </Suspense>
          </div>
        </div>
      </div>
      <div className="container mx-auto px-4 py-8 md:px-10">
        <Suspense fallback={null}>
          <InstantResults city={city.slug} cityLabel={city.name} />
        </Suspense>
      </div>
    </div>
  );
}
