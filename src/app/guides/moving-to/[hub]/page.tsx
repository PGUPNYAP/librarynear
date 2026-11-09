import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IntentLink } from "@/components/intent-link";
import { LibraryCardGrid } from "@/components/library-card-grid";
import { getAspirantHub } from "@/data/aspirant-hubs";
import { cardsFor, getHubData, getHubFees } from "@/lib/aspirant-pages";
import { getActiveCityBySlug } from "@/lib/cities-server";
import { faqPageSchema, formatInr, type FaqItem } from "@/lib/library-seo";
import { getSiteUrl } from "@/lib/site-url";

interface PageProps {
  params: Promise<{ hub: string }>;
}

export const revalidate = 86400;

export async function generateStaticParams() {
  return [];
}

const FIRST_WEEK = [
  "Stay somewhere short-term first, and see rooms in person before paying a deposit.",
  "Visit two or three libraries at the hour you plan to study, and ask for a trial day.",
  "Before paying, find the exits, check whether the room is in a basement, and ask about power backup.",
  "Get every fee, deposit and refund rule in writing or on a receipt.",
  "Save your library's and landlord's phone numbers, and note the nearest hospital.",
];

async function load(slug: string) {
  const hub = getAspirantHub(slug);
  if (!hub) return null;
  const city = await getActiveCityBySlug(hub.citySlug);
  if (!city) return null;
  const data = await getHubData(hub, city.name);
  return data ? { ...data, city } : null;
}

const titleFor = (name: string, exams: string[]) => `Moving to ${name} for ${exams[0]} preparation`;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { hub: slug } = await params;
  const data = await load(slug);
  if (!data) return { title: "Page not found", robots: { index: false, follow: true } };
  const url = `${getSiteUrl()}/guides/moving-to/${data.hub.slug}`;
  const title = `${titleFor(data.hub.name, data.hub.exams)}: student guide`;
  const description = `Moving to ${data.hub.name}? ${data.libraries.length} study libraries nearby, the closest metro stations, coaching institutes and a first-week checklist.`;
  return { title, description, alternates: { canonical: url }, robots: { index: true, follow: true }, openGraph: { type: "article", title, description, url, siteName: "LibraryNear" } };
}

export default async function MovingToGuidePage({ params }: PageProps) {
  const { hub: slug } = await params;
  const data = await load(slug);
  if (!data) notFound();
  const { hub, city, libraries, metros, coaching } = data;
  const [cards, fees] = await Promise.all([cardsFor(libraries, 12), getHubFees(hub, libraries.slice(0, 300).map((item) => item.id))]);
  const showFees = fees.withFees >= 3 && fees.median;

  const faqs: FaqItem[] = [
    { question: `How many study libraries are there around ${hub.name}?`, answer: `LibraryNear lists ${libraries.length} study libraries within ${hub.radiusKm} km of ${hub.name}, ${city.name}.` },
    ...(metros[0] ? [{ question: `Which metro station is closest to ${hub.name}?`, answer: `${metros[0].name} is the closest station to the centre of the area's libraries, about ${metros[0].km.toFixed(1)} km away.` }] : []),
    ...(showFees ? [{ question: `How much do libraries cost in ${hub.name}?`, answer: `Starting fees run from ${formatInr(fees.min!)} to ${formatInr(fees.max!)}, with a median of ${formatInr(fees.median!)}, based on ${fees.withFees} libraries with confirmed fees.` }] : []),
  ];

  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/guides/moving-to/${hub.slug}`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
        { "@type": "ListItem", position: 2, name: "Moving guides", item: `${siteUrl}/guides/moving-to` },
        { "@type": "ListItem", position: 3, name: hub.name, item: pageUrl },
      ],
    },
    { "@context": "https://schema.org", "@type": "Article", headline: titleFor(hub.name, hub.exams), url: pageUrl, about: { "@type": "Place", name: `${hub.name}, ${city.name}` }, publisher: { "@type": "Organization", name: "LibraryNear", url: siteUrl } },
    faqPageSchema(faqs),
  ];

  return (
    <div className="bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <article className="container mx-auto px-4 py-8 sm:px-6 md:px-10">
        <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <IntentLink href="/" className="hover:underline">Home</IntentLink>
          <span>/</span>
          <IntentLink href="/guides/moving-to" className="hover:underline">Moving guides</IntentLink>
          <span>/</span>
          <span className="font-medium text-black">{hub.name}</span>
        </nav>

        <header className="mb-8 max-w-3xl">
          <h1 className="mb-3 text-3xl font-bold tracking-tight text-black md:text-4xl">{titleFor(hub.name, hub.exams)}</h1>
          <p className="text-lg leading-8 text-muted-foreground">{hub.intro}</p>
        </header>

        <dl className="mb-10 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-muted/50 px-3 py-3">
            <dt className="text-xs text-muted-foreground">Libraries within {hub.radiusKm} km</dt>
            <dd className="text-2xl font-bold text-black">{libraries.length}</dd>
          </div>
          {showFees ? (
            <div className="rounded-xl bg-muted/50 px-3 py-3">
              <dt className="text-xs text-muted-foreground">Median starting fee</dt>
              <dd className="text-2xl font-bold text-black">{formatInr(fees.median!)}</dd>
            </div>
          ) : null}
          {coaching.length ? (
            <div className="rounded-xl bg-muted/50 px-3 py-3">
              <dt className="text-xs text-muted-foreground">Institutes mapped</dt>
              <dd className="text-2xl font-bold text-black">{coaching.length}</dd>
            </div>
          ) : null}
        </dl>

        <div className="grid max-w-3xl gap-10">
          <section>
            <h2 className="mb-3 text-xl font-bold text-black">Getting around</h2>
            <p className="leading-7 text-gray-700">{hub.gettingAround}</p>
            {metros.length ? (
              <ul className="mt-3 space-y-1 text-sm text-gray-700">
                {metros.map((metro) => (
                  <li key={metro.name}>{metro.name} metro, about {metro.km.toFixed(1)} km from the library cluster</li>
                ))}
              </ul>
            ) : null}
          </section>

          {hub.costs?.length ? (
            <section>
              <h2 className="mb-3 text-xl font-bold text-black">Typical costs</h2>
              <ul className="space-y-1 text-gray-700">
                {hub.costs.map((cost) => (
                  <li key={cost.label}>{cost.label}: {cost.value} <span className="text-xs text-muted-foreground">(checked {cost.checkedOn})</span></li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <h2 className="mb-3 text-xl font-bold text-black">Choosing a library in {hub.name}</h2>
            <ul className="list-disc space-y-2 pl-5 leading-7 text-gray-700">
              {hub.tips.map((tip) => <li key={tip}>{tip}</li>)}
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-black">Your first week</h2>
            <ol className="list-decimal space-y-2 pl-5 leading-7 text-gray-700">
              {FIRST_WEEK.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </section>
        </div>

        <section className="mt-12">
          <h2 className="mb-5 text-xl font-bold text-black">Libraries closest to the centre of {hub.name}</h2>
          <LibraryCardGrid libraries={cards} altSuffix={hub.name} />
          <div className="mt-6 flex flex-wrap gap-2">
            {hub.localities.map((name) => (
              <IntentLink key={name} href={`/${hub.citySlug}/locality/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-black hover:border-primary hover:text-primary">All libraries in {name}</IntentLink>
            ))}
          </div>
        </section>

        {coaching.length ? (
          <section className="mt-12">
            <h2 className="mb-3 text-xl font-bold text-black">Libraries near coaching institutes</h2>
            <div className="flex flex-wrap gap-2">
              {coaching.map((place) => (
                <IntentLink key={place.slug} href={`/${hub.citySlug}/near/${place.slug}`} className="rounded-full border border-border px-4 py-2 text-sm text-black hover:border-primary hover:text-primary">{place.name}</IntentLink>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-12 max-w-3xl rounded-2xl bg-muted/50 p-5">
          <h2 className="font-bold text-black">Studying from your room today?</h2>
          <p className="mt-1 text-sm text-muted-foreground">Use the free online study room and add your minutes to {hub.name}&apos;s weekly total.</p>
          <IntentLink href="/study-room" className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">Open the study room</IntentLink>
        </section>

        {faqs.length ? (
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
          </section>
        ) : null}
      </article>
    </div>
  );
}
