import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IntentLink } from "@/components/intent-link";
import { LibraryCardGrid } from "@/components/library-card-grid";
import { resolveCityParam } from "@/lib/cities-server";
import { cardsFor, getCoachingPlaces, walkLabel, walkMinutes } from "@/lib/aspirant-pages";
import { faqPageSchema, type FaqItem } from "@/lib/library-seo";
import { getSiteUrl } from "@/lib/site-url";

interface PageProps {
  params: Promise<{ city: string; slug: string }>;
}

export const revalidate = 86400;

export async function generateStaticParams() {
  return [];
}

async function load(rawCity: string, slug: string) {
  const city = await resolveCityParam(rawCity);
  if (!city) return null;
  const places = await getCoachingPlaces(city.slug, city.name);
  const place = places.find((item) => item.slug === slug);
  return place ? { city, place, others: places.filter((item) => item.slug !== slug) } : null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { city: rawCity, slug } = await params;
  const data = await load(rawCity, slug);
  if (!data) return { title: "Page not found", robots: { index: false, follow: true } };
  const { city, place } = data;
  const url = `${getSiteUrl()}/${city.slug}/near/${place.slug}`;
  const title = `Libraries near ${place.name}, ${city.name}`;
  const description = `${place.nearby.length} study libraries within walking distance of ${place.name} in ${city.name}. The closest is ${walkLabel(place.nearby[0].km)} away on foot.`;
  return { title, description, alternates: { canonical: url }, robots: { index: true, follow: true }, openGraph: { type: "website", title, description, url, siteName: "LibraryNear" } };
}

export default async function LibrariesNearCoachingPage({ params }: PageProps) {
  const { city: rawCity, slug } = await params;
  const data = await load(rawCity, slug);
  if (!data) notFound();
  const { city, place, others } = data;

  const cards = await cardsFor(place.nearby);
  const closest = place.nearby[0];
  const withinFive = place.nearby.filter((item) => walkMinutes(item.km) <= 5).length;
  const withinTen = place.nearby.filter((item) => walkMinutes(item.km) <= 10).length;
  const localities = [...new Set(place.nearby.map((item) => item.locality).filter((name): name is string => Boolean(name)))].slice(0, 6);
  const summary = `${place.nearby.length} study libraries are within about a 15-minute walk of ${place.name}. The closest listed is ${closest.name}, ${walkLabel(closest.km)} away on foot${withinFive ? `, and ${withinFive} ${withinFive === 1 ? "is" : "are"} within 5 minutes` : ""}.`;

  const faqs: FaqItem[] = [
    { question: `Which library is closest to ${place.name}?`, answer: `${closest.name} is the closest listed library, ${walkLabel(closest.km)} on foot from ${place.name}.` },
    { question: `How many libraries are near ${place.name}?`, answer: `LibraryNear lists ${place.nearby.length} study libraries within about a 15-minute walk: ${withinFive} within 5 minutes and ${withinTen} within 10 minutes.` },
  ];

  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/${city.slug}/near/${place.slug}`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
        { "@type": "ListItem", position: 2, name: city.name, item: `${siteUrl}/${city.slug}` },
        { "@type": "ListItem", position: 3, name: "Coaching institutes", item: `${siteUrl}/${city.slug}/near` },
        { "@type": "ListItem", position: 4, name: place.name, item: pageUrl },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `Libraries near ${place.name}, ${city.name}`,
      url: pageUrl,
      description: summary,
      about: { "@type": "Place", name: place.name, geo: { "@type": "GeoCoordinates", latitude: place.lat, longitude: place.lng } },
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: place.nearby.length,
        itemListElement: place.nearby.slice(0, 20).map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, url: `${siteUrl}/${city.slug}/library/${item.slug}` })),
      },
    },
    faqPageSchema(faqs),
  ];

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="container mx-auto px-4 py-8 sm:px-6 md:px-10">
        <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <IntentLink href="/" className="hover:underline">Home</IntentLink>
          <span>/</span>
          <IntentLink href={`/${city.slug}`} className="hover:underline">{city.name}</IntentLink>
          <span>/</span>
          <IntentLink href={`/${city.slug}/near`} className="hover:underline">Coaching institutes</IntentLink>
          <span>/</span>
          <span className="font-medium text-black">{place.name}</span>
        </nav>

        <header className="mb-8">
          <h1 className="mb-3 text-3xl font-bold tracking-tight text-black">Libraries near {place.name}</h1>
          <p className="max-w-3xl text-muted-foreground">{summary}</p>
        </header>

        <dl className="mb-10 grid max-w-xl grid-cols-3 gap-3">
          {[
            ["5 min walk", withinFive],
            ["10 min walk", withinTen],
            ["15 min walk", place.nearby.length],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-muted/50 px-3 py-3">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-2xl font-bold text-black">{value}</dd>
            </div>
          ))}
        </dl>

        <LibraryCardGrid libraries={cards} altSuffix={`near ${place.name}`} />
        {place.nearby.length > cards.length ? (
          <div className="mt-10">
            <h2 className="mb-3 text-lg font-semibold text-black">More libraries nearby</h2>
            <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              {place.nearby.slice(cards.length).map((item) => (
                <li key={item.id} className="text-sm">
                  <IntentLink href={`/${city.slug}/library/${item.slug}`} className="text-black hover:underline">{item.name}</IntentLink>
                  <span className="text-muted-foreground"> · {walkMinutes(item.km)} min</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <section className="mt-12 max-w-3xl">
          <h2 className="mb-4 text-xl font-bold text-black">Common questions</h2>
          <div className="space-y-4">
            {faqs.map((faq) => (
              <div key={faq.question}>
                <h3 className="font-semibold text-black">{faq.question}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{faq.answer}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs text-muted-foreground">Walking times are estimates from map coordinates. Institute locations come from OpenStreetMap and may not be current, so check before you travel.</p>
        </section>

        {localities.length || others.length ? (
          <section className="mt-12">
            {localities.length ? (
              <>
                <h2 className="mb-3 text-lg font-semibold text-black">Nearby areas</h2>
                <div className="mb-8 flex flex-wrap gap-2">
                  {localities.map((name) => (
                    <IntentLink key={name} href={`/${city.slug}/locality/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`} className="rounded-full border border-border px-4 py-2 text-sm text-black hover:border-primary hover:text-primary">{name}</IntentLink>
                  ))}
                </div>
              </>
            ) : null}
            <h2 className="mb-3 text-lg font-semibold text-black">Other institutes in {city.name}</h2>
            <div className="flex flex-wrap gap-2">
              {others.slice(0, 12).map((item) => (
                <IntentLink key={item.slug} href={`/${city.slug}/near/${item.slug}`} className="rounded-full border border-border px-4 py-2 text-sm text-black hover:border-primary hover:text-primary">{item.name}</IntentLink>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
