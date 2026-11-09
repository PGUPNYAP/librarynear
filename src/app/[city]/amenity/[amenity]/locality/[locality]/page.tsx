import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { IntentLink } from "@/components/intent-link";
import { LibraryCardGrid } from "@/components/library-card-grid";
import { AMENITY_SLUG_ALIASES, getAmenityBySlug, MIN_LIBRARIES_TO_INDEX } from "@/lib/amenities";
import { resolveCityParam } from "@/lib/cities-server";
import { getLibrariesByAmenity } from "@/lib/place-pages";
import { getSiteUrl } from "@/lib/site-url";
import { slugToLabel, toPlaceSlug } from "@/lib/places";

interface PageProps {
  params: Promise<{ city: string; amenity: string; locality: string }>;
}

export const revalidate = 3600;

export async function generateStaticParams() {
  return [];
}

async function load(params: PageProps["params"]) {
  const { city: rawCity, amenity: rawAmenity, locality: localitySlug } = await params;
  const city = await resolveCityParam(rawCity);
  const amenity = getAmenityBySlug(rawAmenity);
  if (!city || !amenity) return null;
  const libraries = await getLibrariesByAmenity(city.name, amenity, localitySlug);
  const locality = libraries[0]?.locality ?? slugToLabel(localitySlug);
  return { city, amenity, libraries, locality, localitySlug: toPlaceSlug(locality) || localitySlug };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const data = await load(params);
  if (!data || data.libraries.length === 0) return { title: "Page not found", robots: { index: false, follow: true } };
  const { city, amenity, libraries, locality, localitySlug } = data;
  const pageUrl = `${getSiteUrl()}/${city.slug}/amenity/${amenity.slug}/locality/${localitySlug}`;
  const title = `Libraries with ${amenity.label} in ${locality}, ${city.name}`;
  const description = `${libraries.length} study ${libraries.length === 1 ? "library" : "libraries"} with ${amenity.label} in ${locality}, ${city.name}. Compare fees, timings and metro distance.`;
  const indexable = libraries.length >= MIN_LIBRARIES_TO_INDEX;
  return {
    title,
    description,
    ...(indexable ? { alternates: { canonical: pageUrl } } : {}),
    robots: { index: indexable, follow: true },
    openGraph: { type: "website", url: pageUrl, title: `${title} | LibraryNear`, description, siteName: "LibraryNear" },
  };
}

export default async function AmenityLocalityPage({ params }: PageProps) {
  const raw = await params;
  const alias = AMENITY_SLUG_ALIASES[raw.amenity.toLowerCase()];
  if (alias) permanentRedirect(`/${raw.city}/amenity/${alias}/locality/${raw.locality}`);

  const data = await load(params);
  if (!data || data.libraries.length === 0) notFound();
  const { city, amenity, libraries, locality, localitySlug } = data;

  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/${city.slug}/amenity/${amenity.slug}/locality/${localitySlug}`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
        { "@type": "ListItem", position: 2, name: city.name, item: `${siteUrl}/${city.slug}` },
        { "@type": "ListItem", position: 3, name: locality, item: `${siteUrl}/${city.slug}/locality/${localitySlug}` },
        { "@type": "ListItem", position: 4, name: `${amenity.label} libraries`, item: pageUrl },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      numberOfItems: libraries.length,
      itemListElement: libraries.slice(0, 20).map((lib, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: lib.display_name,
        url: `${siteUrl}/${city.slug}/library/${lib.slug}`,
      })),
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="container mx-auto px-6 py-8 md:px-10">
        <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <IntentLink href="/" className="hover:underline">Home</IntentLink>
          <span>/</span>
          <IntentLink href={`/${city.slug}`} className="hover:underline">{city.name}</IntentLink>
          <span>/</span>
          <IntentLink href={`/${city.slug}/locality/${localitySlug}`} className="hover:underline">{locality}</IntentLink>
          <span>/</span>
          <span className="font-medium text-black">{amenity.label}</span>
        </nav>

        <header className="mb-10">
          <h1 className="mb-3 text-3xl font-bold tracking-tight text-black">
            Libraries with {amenity.label} in {locality}
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            {libraries.length} study {libraries.length === 1 ? "library" : "libraries"} in {locality}, {city.name} list {amenity.label}.
            Compare fees, timings and distance from the metro, then send an enquiry.
          </p>
        </header>

        <LibraryCardGrid libraries={libraries} altSuffix={`with ${amenity.label}`} />

        <div className="mt-16 flex flex-wrap gap-3">
          <IntentLink
            href={`/${city.slug}/locality/${localitySlug}`}
            className="rounded-full bg-primary px-6 py-3 font-semibold text-white hover:bg-primary/90"
          >
            All libraries in {locality}
          </IntentLink>
          <IntentLink
            href={`/${city.slug}/amenity/${amenity.slug}`}
            className="rounded-full border border-border px-6 py-3 font-semibold text-black hover:border-primary"
          >
            {amenity.label} libraries across {city.name}
          </IntentLink>
        </div>
      </div>
    </div>
  );
}
