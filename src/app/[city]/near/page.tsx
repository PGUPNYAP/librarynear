import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IntentLink } from "@/components/intent-link";
import { resolveCityParam } from "@/lib/cities-server";
import { getCoachingPlaces } from "@/lib/aspirant-pages";
import { getSiteUrl } from "@/lib/site-url";

interface PageProps {
  params: Promise<{ city: string }>;
}

export const revalidate = 86400;

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { city: rawCity } = await params;
  const city = await resolveCityParam(rawCity);
  if (!city) return { title: "Page not found", robots: { index: false, follow: true } };
  const places = await getCoachingPlaces(city.slug, city.name);
  const url = `${getSiteUrl()}/${city.slug}/near`;
  return {
    title: `Libraries near coaching institutes in ${city.name}`,
    description: `Find study libraries within walking distance of ${places.length} coaching institutes in ${city.name}.`,
    alternates: { canonical: url },
    robots: { index: places.length >= 3, follow: true },
  };
}

export default async function CoachingIndexPage({ params }: PageProps) {
  const { city: rawCity } = await params;
  const city = await resolveCityParam(rawCity);
  if (!city) notFound();
  const places = await getCoachingPlaces(city.slug, city.name);
  if (places.length === 0) notFound();

  return (
    <div className="container mx-auto min-h-screen px-4 py-8 sm:px-6 md:px-10">
      <h1 className="mb-3 text-3xl font-bold tracking-tight text-black">Libraries near coaching institutes in {city.name}</h1>
      <p className="mb-8 max-w-3xl text-muted-foreground">Pick your institute to see the study libraries within about a 15-minute walk.</p>
      <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {places.map((place) => (
          <li key={place.slug} className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-3">
            <IntentLink href={`/${city.slug}/near/${place.slug}`} className="text-sm font-medium text-black hover:underline">{place.name}</IntentLink>
            <span className="shrink-0 text-xs text-muted-foreground">{place.nearby.length} libraries</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
