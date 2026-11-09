import type { Metadata } from "next";
import { IntentLink } from "@/components/intent-link";
import { getPublishedHubs } from "@/lib/aspirant-pages";
import { getActiveCityBySlug } from "@/lib/cities-server";
import { getSiteUrl } from "@/lib/site-url";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Moving for exam preparation: area guides for students",
  description: "Guides to the neighbourhoods students move to for UPSC, SSC, JEE and other exams: study libraries, metro stations, coaching institutes and a first-week checklist.",
  alternates: { canonical: `${getSiteUrl()}/guides/moving-to` },
};

export default async function MovingGuidesIndexPage() {
  const hubs = await getPublishedHubs(async (slug) => (await getActiveCityBySlug(slug))?.name ?? null);
  return (
    <div className="container mx-auto min-h-screen px-4 py-8 sm:px-6 md:px-10">
      <h1 className="mb-3 text-3xl font-bold tracking-tight text-black">Moving for exam preparation</h1>
      <p className="mb-8 max-w-3xl text-muted-foreground">Practical guides to the areas students move to, built from the study libraries we list there.</p>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {hubs.map(({ hub, count, cityName }) => (
          <li key={hub.slug}>
            <IntentLink href={`/guides/moving-to/${hub.slug}`} className="block h-full rounded-2xl border border-border p-5 hover:border-primary">
              <h2 className="font-semibold text-black">{hub.name}, {cityName}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{hub.exams.join(", ")} · {count} libraries nearby</p>
            </IntentLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
