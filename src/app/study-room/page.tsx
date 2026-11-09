import type { Metadata } from "next";
import { IntentLink } from "@/components/intent-link";
import { getActiveCities } from "@/lib/cities-server";
import { faqPageSchema, type FaqItem } from "@/lib/library-seo";
import { getSiteUrl } from "@/lib/site-url";
import { getStudyLeaderboard } from "@/lib/study-room";
import { StudyRoomClient } from "./study-room-client";

export const revalidate = 300;

const url = `${getSiteUrl()}/study-room`;

export const metadata: Metadata = {
  title: "Free online study room with focus timer",
  description: "Study with a free focus timer for UPSC, NEET, JEE, SSC and more. No sign-up. Add your minutes to your area's weekly total and track your streak.",
  alternates: { canonical: url },
  openGraph: { type: "website", title: "Free online study room with focus timer", url, siteName: "LibraryNear" },
};

const FAQS: FaqItem[] = [
  { question: "Is the study room free?", answer: "Yes. The timer and leaderboard are free and need no account." },
  { question: "How does the area leaderboard work?", answer: "Finished sessions of 5 minutes or more add to your chosen area's total for the week. Only area totals are stored, never your name." },
  { question: "How long should a study session be?", answer: "Use whatever length you can focus for. Many students work in blocks of 25 to 50 minutes with a short break between them." },
  { question: "Does the timer keep running if my phone locks?", answer: "Yes. It follows the clock, so the time stays right when you come back." },
];

export default async function StudyRoomPage() {
  const [cities, board] = await Promise.all([getActiveCities(), getStudyLeaderboard(null)]);
  const jsonLd = [
    { "@context": "https://schema.org", "@type": "WebApplication", name: "LibraryNear Study Room", url, applicationCategory: "EducationalApplication", operatingSystem: "Any", offers: { "@type": "Offer", price: "0", priceCurrency: "INR" } },
    faqPageSchema(FAQS),
  ];
  return (
    <div className="container mx-auto min-h-screen px-4 py-8 sm:px-6 md:px-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <header className="mb-8 max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight text-black">Online study room</h1>
        <p className="mt-2 text-muted-foreground">Set a timer, put your phone down, and add your minutes to your area&apos;s total. No sign-up.</p>
      </header>
      <StudyRoomClient cities={cities.filter((city) => city.libraryCount >= 10).map(({ name, slug }) => ({ name, slug }))} initialBoard={board} />
      <section className="mt-14 max-w-3xl">
        <h2 className="mb-4 text-xl font-bold text-black">Common questions</h2>
        <div className="space-y-4">
          {FAQS.map((faq) => (
            <div key={faq.question}>
              <h3 className="font-semibold text-black">{faq.question}</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{faq.answer}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-sm text-muted-foreground">
          Moving for exam preparation? Read our <IntentLink href="/guides/moving-to" className="font-semibold text-primary hover:underline">area guides</IntentLink>.
        </p>
      </section>
    </div>
  );
}
