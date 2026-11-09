import type { Metadata } from "next";
import { IntentLink } from "@/components/intent-link";
import { CityIcon } from "@/components/city-icon";
import { getActiveCities } from "@/lib/cities-server";
import { getSiteUrl } from "@/lib/site-url";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const cities = await getActiveCities();
  const total = cities.reduce((sum, city) => sum + city.libraryCount, 0);
  return {
    title: "Study libraries by city in India",
    description: `Browse ${total.toLocaleString("en-IN")} study libraries across ${cities.length} Indian cities. Pick a city to compare fees, timings, amenities and reviews.`,
    alternates: { canonical: `${getSiteUrl()}/cities` },
  };
}

export default async function CitiesPage() {
  const cities = await getActiveCities();
  const siteUrl = getSiteUrl();
  const byState = new Map<string, typeof cities>();
  for (const city of cities) {
    const state = city.state ?? "Other";
    byState.set(state, [...(byState.get(state) ?? []), city]);
  }
  const states = [...byState.entries()].sort(
    (a, b) => b[1].reduce((s, c) => s + c.libraryCount, 0) - a[1].reduce((s, c) => s + c.libraryCount, 0),
  );
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Study libraries by city",
    numberOfItems: cities.length,
    itemListElement: cities.slice(0, 50).map((city, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: `Libraries in ${city.name}`,
      url: `${siteUrl}/${city.slug}`,
    })),
  };

  return (
    <div className="container mx-auto px-6 py-12 md:px-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\u003c") }} />
      <h1 className="text-3xl font-bold text-black md:text-4xl">Study libraries by city</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        LibraryNear lists {cities.reduce((sum, city) => sum + city.libraryCount, 0).toLocaleString("en-IN")} study libraries and
        reading rooms in {cities.length} cities. Choose a city to filter by locality, fees, amenities and hours.
      </p>

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-bold text-black">Biggest cities</h2>
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
      </section>

      <section className="mt-12 grid gap-10 md:grid-cols-2 lg:grid-cols-3">
        {states.map(([state, list]) => (
          <div key={state}>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-muted-foreground">{state}</h2>
            <ul className="space-y-1.5">
              {list.map((city) => (
                <li key={city.slug}>
                  <IntentLink href={`/${city.slug}`} className="text-sm text-black hover:text-primary hover:underline">
                    {city.name}
                  </IntentLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
