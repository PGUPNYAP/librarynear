import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { IntentLink } from "@/components/intent-link";
import { LibraryCardGrid } from "@/components/library-card-grid";
import { resolveCityParam } from "@/lib/cities-server";
import { getFeeStats, getLibrariesByLocalitySlug, getLocalityHomeCity } from "@/lib/place-pages";
import { citySlug, slugToLabel, toPlaceSlug } from "@/lib/places";
import { formatInr, faqPageSchema, type FaqItem } from "@/lib/library-seo";
import { getSiteUrl } from "@/lib/site-url";
import { logPerf, measureAsync } from "@/lib/perf";

interface PageProps {
  params: Promise<{ city: string; slug: string }>;
}

export const revalidate = 3600;

export async function generateStaticParams() {
  return [];
}

async function loadLocality(rawCity: string, slug: string) {
  const city = await resolveCityParam(rawCity);
  if (!city) return null;
  const libraries = await getLibrariesByLocalitySlug(city.name, slug);
  if (libraries.length === 0) return { city, libraries, locality: slugToLabel(slug) };
  return { city, libraries, locality: libraries[0].locality ?? slugToLabel(slug) };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { city: rawCity, slug } = await params;
  const data = await loadLocality(rawCity, slug);
  if (!data || data.libraries.length === 0) {
    return { title: "Page not found", robots: { index: false, follow: true } };
  }
  const { city, libraries, locality } = data;
  const pageUrl = `${getSiteUrl()}/${city.slug}/locality/${toPlaceSlug(locality)}`;
  const title = `Best Libraries in ${locality}, ${city.name} (${libraries.length})`;
  const description = `Compare ${libraries.length} study ${libraries.length === 1 ? "library" : "libraries"} in ${locality}, ${city.name}: fees, timings, photos, reviews and nearest metro.`;
  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    robots: { index: libraries.length >= 2, follow: true },
    openGraph: { type: "website", url: pageUrl, title: `${title} | LibraryNear`, description, siteName: "LibraryNear" },
  };
}

export default async function LocalityPage({ params }: PageProps) {
  const { city: rawCity, slug } = await params;
  const measurement = await measureAsync("librariesByLocality", () => loadLocality(rawCity, slug));
  const data = measurement.result;
  if (!data) notFound();

  if (data.libraries.length === 0) {
    // Old URL from before the city data fix (e.g. /delhi/locality/<bengaluru area>).
    const homeCity = await getLocalityHomeCity(slug);
    if (homeCity && citySlug(homeCity) !== data.city.slug) {
      permanentRedirect(`/${citySlug(homeCity)}/locality/${slug}`);
    }
    notFound();
  }

  const { city, libraries, locality } = data;
  const canonicalSlug = toPlaceSlug(locality);
  if (canonicalSlug && canonicalSlug !== slug && decodeURIComponent(slug) !== canonicalSlug) {
    permanentRedirect(`/${city.slug}/locality/${canonicalSlug}`);
  }
  logPerf("locality", [measurement.metric], `city="${city.slug}" locality="${locality}" count=${libraries.length}`);

  const fees = await getFeeStats(`locality:${city.slug}:${canonicalSlug}`, libraries.map((lib) => lib.id));
  const verifiedCount = libraries.filter((lib) => lib.verification_status === "verified").length;
  const rated = libraries.filter((lib) => lib.aggregate_rating && lib.review_count);
  const topRated = [...rated].sort((a, b) => (b.aggregate_rating ?? 0) - (a.aggregate_rating ?? 0))[0];
  const metroCounts = new Map<string, number>();
  for (const lib of libraries) {
    if (lib.nearest_metro) metroCounts.set(lib.nearest_metro, (metroCounts.get(lib.nearest_metro) ?? 0) + 1);
  }
  const metros = [...metroCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  const summaryParts = [
    `There are ${libraries.length} study ${libraries.length === 1 ? "library" : "libraries"} listed in ${locality}, ${city.name}`,
    verifiedCount ? `${verifiedCount} verified by the LibraryNear team` : null,
    fees.median ? `with a typical starting fee of ${formatInr(fees.median)}` : null,
    metros[0] ? `and most are near ${metros[0][0]} metro` : null,
  ].filter(Boolean);
  const summary = `${summaryParts.join(", ")}.`;

  const faqs: FaqItem[] = [
    {
      question: `How many study libraries are there in ${locality}?`,
      answer: `LibraryNear lists ${libraries.length} study ${libraries.length === 1 ? "library" : "libraries"} in ${locality}, ${city.name}${verifiedCount ? `, of which ${verifiedCount} are verified` : ""}.`,
    },
    ...(fees.min && fees.max
      ? [{
          question: `What is the fee for a library in ${locality}?`,
          answer: `Starting fees for libraries in ${locality} range from ${formatInr(fees.min)} to ${formatInr(fees.max)}${fees.median ? `, with a median of ${formatInr(fees.median)}` : ""}, based on ${fees.withFees} ${fees.withFees === 1 ? "library" : "libraries"} that publish fees.`,
        }]
      : []),
    ...(topRated
      ? [{
          question: `Which is the best-rated library in ${locality}?`,
          answer: `${topRated.display_name} has the highest student rating in ${locality} on LibraryNear: ${topRated.aggregate_rating?.toFixed(1)}/5 from ${topRated.review_count} reviews.`,
        }]
      : []),
    ...(metros.length
      ? [{
          question: `Which metro stations are near libraries in ${locality}?`,
          answer: `Libraries in ${locality} are closest to ${metros.map(([name]) => name).join(", ")} metro.`,
        }]
      : []),
  ];

  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/${city.slug}/locality/${canonicalSlug}`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
        { "@type": "ListItem", position: 2, name: city.name, item: `${siteUrl}/${city.slug}` },
        { "@type": "ListItem", position: 3, name: locality, item: pageUrl },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `Best Libraries in ${locality}, ${city.name}`,
      url: pageUrl,
      description: summary,
      about: { "@type": "Place", name: `${locality}, ${city.name}` },
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
    faqPageSchema(faqs),
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
          <span className="font-medium text-black">{locality}</span>
        </nav>

        <header className="mb-8">
          <h1 className="mb-3 text-3xl font-bold tracking-tight text-black">Best libraries in {locality}, {city.name}</h1>
          <p id="locality-summary" className="max-w-3xl text-muted-foreground">{summary}</p>
        </header>


        <div className="mb-6 flex flex-wrap gap-2">
          <IntentLink
            href={`/${city.slug}/libraries?locality=${encodeURIComponent(locality)}`}
            rel="nofollow"
            className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-black hover:border-primary hover:text-primary"
          >
            Filter by fees & amenities
          </IntentLink>
          <IntentLink
            href={`/${city.slug}/top-10/locality/${canonicalSlug}`}
            className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-black hover:border-primary hover:text-primary"
          >
            Top 10 in {locality}
          </IntentLink>
        </div>

        <LibraryCardGrid libraries={libraries} altSuffix={city.name} />

        {faqs.length > 0 ? (
          <section className="mt-16 max-w-3xl">
            <h2 className="mb-4 text-xl font-bold text-black">Libraries in {locality}: common questions</h2>
            <div className="divide-y divide-border rounded-2xl border border-border">
              {faqs.map((faq) => (
                <div key={faq.question} className="p-5">
                  <h3 className="font-semibold text-black">{faq.question}</h3>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">{faq.answer}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
