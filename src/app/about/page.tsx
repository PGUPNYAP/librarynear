import Link from "next/link";
import { Building2, MapPinned, ShieldCheck } from "lucide-react";

import { getSiteUrl } from "@/lib/site-url";

export const metadata = {
  title: "About LibraryNear — Study Library Directory Delhi",
  description:
    "LibraryNear is the leading study library directory in Delhi. Discover reading rooms near you, compare amenities, fees, and metro access, and shortlist your perfect study space.",
  alternates: {
    canonical: `${getSiteUrl()}/about`,
  },
  openGraph: {
    type: "website",
    title: "About LibraryNear — Study Library Directory Delhi",
    description:
      "Discover reading rooms near you, compare amenities, and shortlist your perfect study space in Delhi.",
    siteName: "LibraryNear",
    url: `${getSiteUrl()}/about`,
  },
};

export default function AboutPage() {
  return (
    <div className="bg-slate-50/40">
      <section className="border-b border-border/60 bg-white">
        <div className="container mx-auto px-6 py-14 md:px-10 md:py-18">
          <div className="max-w-3xl">
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-black md:text-5xl">
              We help students discover the right place to study, and help library owners get discovered.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
              LibraryNear brings together location, amenities, photos, and shortlist tools so students can compare study spaces faster. At the same time, it gives library owners a clean onboarding path without sacrificing trust for users.
            </p>
          </div>
        </div>
      </section>

      <section className="container mx-auto grid gap-6 px-6 py-12 md:grid-cols-3 md:px-10">
        {[
          {
            icon: MapPinned,
            title: "Built for discovery",
            body: "Search by locality, metro, or nearby distance and quickly compare study options that are actually relevant.",
          },
          {
            icon: ShieldCheck,
            title: "Built for trust",
            body: "Owner-submitted libraries are reviewed before they go live, so public listings stay cleaner and more reliable.",
          },
          {
            icon: Building2,
            title: "Built for owners too",
            body: "Owners can list their libraries, manage submissions, and reach students already searching in their area.",
          },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-3xl border border-border bg-white p-6 shadow-sm">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-bold text-black">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
          </div>
        ))}
      </section>

      <section className="container mx-auto grid gap-6 px-6 pb-12 md:grid-cols-2 md:px-10">
        <div className="rounded-3xl border border-border bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-black">Who runs LibraryNear</h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            LibraryNear is run by a small team based at DTU IIF, AB-4, Shahbad, Rohini, Delhi 110042. Our team checks
            libraries locality by locality to keep listings accurate.
          </p>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            Contact: <a href="mailto:librarynear.com@gmail.com" className="text-primary underline">librarynear.com@gmail.com</a> ·{" "}
            <a href="tel:+918796190507" className="text-primary underline">+91 87961 90507</a>
          </p>
        </div>
        <div className="rounded-3xl border border-border bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-black">How we keep listings honest</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-muted-foreground">
            <li>“Verified” means our team confirmed the library and its contact details.</li>
            <li>Ratings come only from students who signed in and reviewed on LibraryNear.</li>
            <li>No library can pay for a better position or to remove reviews.</li>
          </ul>
          <Link href="/editorial-policy" className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">
            Read our editorial and data policy
          </Link>
        </div>
      </section>

      <section className="container mx-auto px-6 pb-14 md:px-10">
        <div className="rounded-3xl border border-border bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-black">Explore or list a library</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            If you’re a student, start by saving libraries you like. If you’re an owner, sign in and submit your library for review.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/cities"
              className="inline-flex items-center rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
            >
              Explore libraries
            </Link>
            <Link
              href="/for-owners"
              className="inline-flex items-center rounded-full border border-border px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-muted/60"
            >
              List your library
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
