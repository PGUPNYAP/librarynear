import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { IntentLink } from "@/components/intent-link";
import { resolveCityParam } from "@/lib/cities-server";
import { supabaseServer } from "@/lib/supabase-server";
import { formatInr, faqPageSchema, type FaqItem } from "@/lib/library-seo";
import { getSiteUrl } from "@/lib/site-url";
import { toPlaceSlug } from "@/lib/places";

interface PageProps {
  params: Promise<{ city: string }>;
}

export const revalidate = 86400;

export async function generateStaticParams() {
  return [];
}

const MIN_LIBRARIES_FOR_INDEX = 10;
const MIN_LIBRARIES_PER_LOCALITY = 2;

type LocalityFees = { locality: string; libraries: number; min: number; median: number; max: number };
type FeeReport = {
  libraries: number;
  min: number | null;
  median: number | null;
  max: number | null;
  reservedMedian: number | null;
  unreservedMedian: number | null;
  localities: LocalityFees[];
  updatedAt: string;
};

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

type Row = {
  id: string;
  locality: string | null;
  library_fee_plans: Array<{
    price: number | null;
    discounted_price: number | null;
    is_active: boolean | null;
    seat_type: string | null;
    duration_key: string | null;
  }>;
};

async function buildFeeReport(cityName: string): Promise<FeeReport> {
  const rows: Row[] = [];
  for (let page = 0; page < 20; page++) {
    const { data, error } = await supabaseServer
      .from("library_branches")
      .select("id, locality, library_fee_plans!inner(price, discounted_price, is_active, seat_type, duration_key)")
      .eq("is_active", true)
      .eq("city", cityName)
      .order("id")
      .range(page * 1000, page * 1000 + 999);
    if (error || !data || data.length === 0) break;
    rows.push(...(data as unknown as Row[]));
    if (data.length < 1000) break;
  }

  // Use each library's cheapest active monthly plan (or cheapest plan if no monthly one).
  const perLibrary: Array<{ locality: string | null; price: number; reserved: number | null; unreserved: number | null }> = [];
  for (const row of rows) {
    const active = row.library_fee_plans.filter((plan) => plan.is_active !== false);
    const priced = (plans: typeof active) =>
      plans
        .map((plan) => plan.discounted_price ?? plan.price)
        .filter((value): value is number => typeof value === "number" && value > 0);
    const monthly = active.filter((plan) => !plan.duration_key || plan.duration_key === "1_month");
    const prices = priced(monthly).length ? priced(monthly) : priced(active);
    if (prices.length === 0) continue;
    const reserved = priced(monthly.filter((plan) => plan.seat_type === "reserved"));
    const unreserved = priced(monthly.filter((plan) => plan.seat_type !== "reserved"));
    perLibrary.push({
      locality: row.locality?.trim() || null,
      price: Math.min(...prices),
      reserved: reserved.length ? Math.min(...reserved) : null,
      unreserved: unreserved.length ? Math.min(...unreserved) : null,
    });
  }

  const byLocality = new Map<string, number[]>();
  for (const entry of perLibrary) {
    if (!entry.locality) continue;
    byLocality.set(entry.locality, [...(byLocality.get(entry.locality) ?? []), entry.price]);
  }
  const localities = [...byLocality.entries()]
    .filter(([, prices]) => prices.length >= MIN_LIBRARIES_PER_LOCALITY)
    .map(([locality, prices]) => ({
      locality,
      libraries: prices.length,
      min: Math.min(...prices),
      median: median(prices)!,
      max: Math.max(...prices),
    }))
    .sort((a, b) => b.libraries - a.libraries || a.median - b.median);

  const all = perLibrary.map((entry) => entry.price);
  return {
    libraries: perLibrary.length,
    min: all.length ? Math.min(...all) : null,
    median: median(all),
    max: all.length ? Math.max(...all) : null,
    reservedMedian: median(perLibrary.map((entry) => entry.reserved).filter((value): value is number => value !== null)),
    unreservedMedian: median(perLibrary.map((entry) => entry.unreserved).filter((value): value is number => value !== null)),
    localities,
    updatedAt: new Date().toISOString(),
  };
}

const getFeeReport = unstable_cache(buildFeeReport, ["city-fee-report-v1"], {
  revalidate: 86400,
  tags: ["fee-stats", "library-cards"],
});

async function load(rawCity: string) {
  const city = await resolveCityParam(rawCity);
  if (!city) return null;
  const report = process.env.NODE_ENV === "development" ? await buildFeeReport(city.name) : await getFeeReport(city.name);
  return { city, report };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { city: rawCity } = await params;
  const data = await load(rawCity);
  if (!data) return { title: "Page not found", robots: { index: false, follow: true } };
  const { city, report } = data;
  const title = `Library fees in ${city.name} (${new Date().getFullYear()}): median price by locality`;
  const description = report.median
    ? `The median starting fee for a study library in ${city.name} is ${formatInr(report.median)} a month, based on ${report.libraries} libraries. Compare fees by locality.`
    : `Study library fees in ${city.name}, by locality.`;
  const indexable = report.libraries >= MIN_LIBRARIES_FOR_INDEX;
  return {
    title,
    description,
    ...(indexable ? { alternates: { canonical: `${getSiteUrl()}/${city.slug}/library-fees` } } : {}),
    robots: { index: indexable, follow: true },
  };
}

export default async function LibraryFeesPage({ params }: PageProps) {
  const { city: rawCity } = await params;
  const data = await load(rawCity);
  if (!data) notFound();
  const { city, report } = data;
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/${city.slug}/library-fees`;
  const top = report.localities.slice(0, 15);
  const maxMedian = Math.max(1, ...top.map((row) => row.median));
  const cheapest = [...report.localities].sort((a, b) => a.median - b.median)[0];
  const priciest = [...report.localities].sort((a, b) => b.median - a.median)[0];

  const faqs: FaqItem[] = report.median
    ? [
        {
          question: `How much does a study library cost in ${city.name}?`,
          answer: `The median starting fee is ${formatInr(report.median)} per month across ${report.libraries} libraries in ${city.name} that publish fees. Fees range from ${formatInr(report.min!)} to ${formatInr(report.max!)}.`,
        },
        ...(report.reservedMedian && report.unreservedMedian
          ? [{
              question: `Is a reserved seat more expensive than an unreserved seat in ${city.name}?`,
              answer: `Yes. The median monthly fee is ${formatInr(report.reservedMedian)} for a reserved seat and ${formatInr(report.unreservedMedian)} for an unreserved seat.`,
            }]
          : []),
        ...(cheapest && priciest && cheapest.locality !== priciest.locality
          ? [{
              question: `Which locality in ${city.name} has the cheapest libraries?`,
              answer: `Among localities with at least ${MIN_LIBRARIES_PER_LOCALITY} libraries listing fees, ${cheapest.locality} has the lowest median (${formatInr(cheapest.median)}) and ${priciest.locality} the highest (${formatInr(priciest.median)}).`,
            }]
          : []),
      ]
    : [];

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: `Study library fees in ${city.name}`,
      description: `Starting monthly fees of ${report.libraries} study libraries in ${city.name}, summarised by locality.`,
      url: pageUrl,
      creator: { "@id": `${siteUrl}/#organization` },
      license: `${siteUrl}/editorial-policy`,
      isAccessibleForFree: true,
      spatialCoverage: { "@type": "Place", name: `${city.name}, India` },
      dateModified: report.updatedAt,
      variableMeasured: ["median monthly fee (INR)", "minimum fee (INR)", "maximum fee (INR)"],
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
        { "@type": "ListItem", position: 2, name: city.name, item: `${siteUrl}/${city.slug}` },
        { "@type": "ListItem", position: 3, name: "Library fees", item: pageUrl },
      ],
    },
    ...(faqs.length ? [faqPageSchema(faqs)] : []),
  ];

  return (
    <div className="container mx-auto max-w-5xl px-6 py-10 md:px-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <IntentLink href="/" className="hover:underline">Home</IntentLink>
        <span>/</span>
        <IntentLink href={`/${city.slug}`} className="hover:underline">{city.name}</IntentLink>
        <span>/</span>
        <span className="font-medium text-black">Library fees</span>
      </nav>

      <h1 className="text-3xl font-bold tracking-tight text-black md:text-4xl">Study library fees in {city.name}</h1>
      <p id="fees-summary" className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
        {report.median
          ? `A study library in ${city.name} typically costs ${formatInr(report.median)} a month (median of ${report.libraries} libraries that publish fees). Prices run from ${formatInr(report.min!)} to ${formatInr(report.max!)}.`
          : `Not enough libraries in ${city.name} have published fees yet. Owners can add fees from the For Owners page.`}
      </p>

      {report.median ? (
        <dl className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: "Median monthly fee", value: formatInr(report.median) },
            { label: "Lowest", value: formatInr(report.min!) },
            { label: "Reserved seat (median)", value: report.reservedMedian ? formatInr(report.reservedMedian) : "—" },
            { label: "Libraries with fees", value: report.libraries.toLocaleString("en-IN") },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-border p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{stat.label}</dt>
              <dd className="mt-1 text-xl font-bold text-black">{stat.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {top.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-black">Median fee by locality</h2>
          <p className="mt-1 text-sm text-muted-foreground">Localities with at least {MIN_LIBRARIES_PER_LOCALITY} libraries that list fees.</p>
          <figure className="mt-6 space-y-2" aria-label={`Bar chart of median library fee by locality in ${city.name}`}>
            {top.map((row) => (
              <div key={row.locality} className="grid grid-cols-[minmax(110px,180px)_1fr_auto] items-center gap-3 text-sm">
                <IntentLink href={`/${city.slug}/locality/${toPlaceSlug(row.locality)}`} className="truncate text-black hover:text-primary hover:underline">
                  {row.locality}
                </IntentLink>
                <div className="h-5 rounded bg-muted">
                  <div className="h-5 rounded bg-primary" style={{ width: `${Math.max(4, (row.median / maxMedian) * 100)}%` }} />
                </div>
                <span className="w-20 text-right font-semibold text-black">{formatInr(row.median)}</span>
              </div>
            ))}
          </figure>

          <div className="mt-10 overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm">
              <caption className="sr-only">Library fees by locality in {city.name}</caption>
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3">Locality</th>
                  <th scope="col" className="px-4 py-3 text-right">Libraries</th>
                  <th scope="col" className="px-4 py-3 text-right">Lowest</th>
                  <th scope="col" className="px-4 py-3 text-right">Median</th>
                  <th scope="col" className="px-4 py-3 text-right">Highest</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report.localities.map((row) => (
                  <tr key={row.locality}>
                    <th scope="row" className="px-4 py-2.5 text-left font-medium text-black">{row.locality}</th>
                    <td className="px-4 py-2.5 text-right">{row.libraries}</td>
                    <td className="px-4 py-2.5 text-right">{formatInr(row.min)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{formatInr(row.median)}</td>
                    <td className="px-4 py-2.5 text-right">{formatInr(row.max)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {faqs.length ? (
        <section className="mt-12">
          <h2 className="mb-4 text-xl font-bold text-black">Questions about library fees in {city.name}</h2>
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

      <p className="mt-10 text-xs text-muted-foreground">
        Based on each library&apos;s lowest active monthly plan. Updated daily.{" "}
        <IntentLink href="/editorial-policy" className="underline">How we calculate this</IntentLink>.
      </p>
    </div>
  );
}
