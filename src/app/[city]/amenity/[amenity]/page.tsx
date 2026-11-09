import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { IntentLink } from "@/components/intent-link";
import { LibraryCardGrid } from "@/components/library-card-grid";
import { AMENITIES, AMENITY_SLUG_ALIASES, getAmenityBySlug, MIN_LIBRARIES_TO_INDEX } from "@/lib/amenities";
import { resolveCityParam } from "@/lib/cities-server";
import { getLibrariesByAmenity } from "@/lib/place-pages";
import { getSiteUrl } from "@/lib/site-url";
import { toPlaceSlug } from "@/lib/places";

interface PageProps {
  params: Promise<{ city: string; amenity: string }>;
}

export const revalidate = 3600;

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { city: rawCity, amenity: rawAmenity } = await params;
  const city = await resolveCityParam(rawCity);
  const amenity = getAmenityBySlug(rawAmenity);
  if (!city || !amenity) return { title: "Page not found", robots: { index: false, follow: true } };

  const libraries = await getLibrariesByAmenity(city.name, amenity);
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/${city.slug}/amenity/${amenity.slug}`;
  const title = `Libraries with ${amenity.label} in ${city.name}`;
  const description = `Compare ${libraries.length} study libraries with ${amenity.label} in ${city.name}. See fees, timings, photos and nearest metro before you visit.`;
  const indexable = libraries.length >= MIN_LIBRARIES_TO_INDEX;

  return {
    title,
    description,
    ...(indexable ? { alternates: { canonical: pageUrl } } : {}),
    robots: { index: indexable, follow: true },
    openGraph: { type: "website", url: pageUrl, title: `${title} | LibraryNear`, description, siteName: "LibraryNear" },
  };
}

export default async function AmenityCityPage({ params }: PageProps) {
  const { city: rawCity, amenity: rawAmenity } = await params;
  const alias = AMENITY_SLUG_ALIASES[rawAmenity.toLowerCase()];
  if (alias) permanentRedirect(`/${rawCity}/amenity/${alias}`);

  const city = await resolveCityParam(rawCity);
  const amenity = getAmenityBySlug(rawAmenity);
  if (!city || !amenity) notFound();

  const libraries = await getLibrariesByAmenity(city.name, amenity);
  if (libraries.length === 0) notFound();

  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/${city.slug}/amenity/${amenity.slug}`;
  const localityCounts = new Map<string, number>();
  for (const lib of libraries) {
    if (lib.locality) localityCounts.set(lib.locality, (localityCounts.get(lib.locality) ?? 0) + 1);
  }
  const topLocalities = [...localityCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
        { "@type": "ListItem", position: 2, name: city.name, item: `${siteUrl}/${city.slug}` },
        { "@type": "ListItem", position: 3, name: `${amenity.label} libraries`, item: pageUrl },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `Libraries with ${amenity.label} in ${city.name}`,
      url: pageUrl,
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: libraries.length,
        itemListElement: libraries.slice(0, 20).map((lib, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: lib.display_name,
          url: `${siteUrl}/${city.slug}/library/${lib.slug}`,
        })),
      },
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="container mx-auto px-6 py-8 md:px-10">
        <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <IntentLink href="/" className="hover:underline">Home</IntentLink>
          <span>/</span>
          <IntentLink href={`/${city.slug}`} className="hover:underline">{city.name}</IntentLink>
          <span>/</span>
          <span className="font-medium text-black">{amenity.label}</span>
        </nav>

        <header className="mb-8">
          <h1 className="mb-3 text-3xl font-bold tracking-tight text-black">
            Libraries with {amenity.label} in {city.name}
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            {libraries.length} {libraries.length === 1 ? "library lists" : "libraries list"} {amenity.label} in {city.name}
            {topLocalities.length > 0 ? `, most of them in ${topLocalities.slice(0, 3).map(([name]) => name).join(", ")}` : ""}.
            Amenities are reported by the library; confirm on your visit.
          </p>
        </header>

        {topLocalities.length > 1 ? (
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-muted-foreground">By locality</h2>
            <div className="flex flex-wrap gap-2">
              {topLocalities.map(([name, count]) => (
                <IntentLink
                  key={name}
                  href={`/${city.slug}/amenity/${amenity.slug}/locality/${toPlaceSlug(name)}`}
                  className="rounded-full border border-primary/25 px-3 py-1.5 text-sm text-black hover:border-primary hover:text-primary"
                >
                  {name} ({count})
                </IntentLink>
              ))}
            </div>
          </section>
        ) : null}

        <LibraryCardGrid libraries={libraries} altSuffix={`with ${amenity.label}`} />

        <section className="mt-16">
          <h2 className="mb-3 text-lg font-bold text-black">Other amenities in {city.name}</h2>
          <div className="flex flex-wrap gap-2">
            {AMENITIES.filter((other) => other.slug !== amenity.slug).map((other) => (
              <IntentLink
                key={other.slug}
                href={`/${city.slug}/libraries?amenities=${encodeURIComponent(other.label)}`}
                className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground hover:border-primary hover:text-primary"
              >
                {other.label}
              </IntentLink>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
