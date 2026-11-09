import type { Metadata } from "next";
import Link from "next/link";
import { getSiteUrl } from "@/lib/site-url";
import { ORGANIZATION } from "@/lib/site-schema";

const UPDATED = "2026-11-07";

export const metadata: Metadata = {
  title: "Editorial and data policy",
  description:
    "How LibraryNear collects, verifies, corrects and ranks study library listings, reviews and fees.",
  alternates: { canonical: `${getSiteUrl()}/editorial-policy` },
};

const sections = [
  {
    heading: "Where listings come from",
    body: [
      "Listings start from public business information (name, address, map location and contact number) and from library owners who submit their library through the For Owners form.",
      "Owners can add photos, fee plans, timings, seats and amenities. Our team and sales staff review and clean up listings locality by locality.",
    ],
  },
  {
    heading: "What “Verified” means",
    body: [
      "A Verified badge means a LibraryNear team member confirmed the library exists at the listed location and that the contact details work, by phone or a visit.",
      "Fees, seats and amenities change often. They are reported by the library and shown as listed; always confirm them with the library before paying.",
    ],
  },
  {
    heading: "Reviews",
    body: [
      "Reviews are written by signed-in students and publish immediately. Each account can have one review per library; editing a review keeps its earlier version on record.",
      "We remove reviews that are spam, abusive, contain personal data, or are written by the library or its competitors. Libraries cannot pay to remove or improve reviews.",
      "Ratings shown in search results and structured data come only from reviews written on LibraryNear.",
    ],
  },
  {
    heading: "How libraries are ordered",
    body: [
      "Default ordering uses profile completeness (photos, fees, timings, amenities, contact details) and student reviews. You can re-sort by rating, newest or name, and filter by fees, amenities and hours.",
      "No library can pay for a higher position in search results.",
    ],
  },
  {
    heading: "Fees and statistics",
    body: [
      "Fee pages show the lowest active plan each library lists. Medians and ranges are calculated from libraries that publish fees and are refreshed daily.",
    ],
  },
  {
    heading: "Corrections",
    body: [
      `Spotted something wrong? Email ${ORGANIZATION.email} or call ${ORGANIZATION.telephone} with the library link. Owners can also update their own listing from the For Owners page. We review every report and fix confirmed errors as quickly as we can.`,
    ],
  },
];

export default function EditorialPolicyPage() {
  const siteUrl = getSiteUrl();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${siteUrl}/editorial-policy`,
    url: `${siteUrl}/editorial-policy`,
    name: "Editorial and data policy",
    dateModified: UPDATED,
    isPartOf: { "@id": `${siteUrl}/#website` },
    publisher: { "@id": `${siteUrl}/#organization` },
  };

  return (
    <div className="container mx-auto max-w-3xl px-6 py-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1 className="text-3xl font-bold tracking-tight text-black md:text-4xl">Editorial and data policy</h1>
      <p className="mt-3 text-sm text-muted-foreground">Last updated {new Date(UPDATED).toLocaleDateString("en-IN", { dateStyle: "long" })}</p>
      <p className="mt-6 leading-7 text-muted-foreground">
        LibraryNear helps students compare study libraries honestly. This page explains where our information comes from,
        what we check, and how to get something corrected.
      </p>
      {sections.map((section) => (
        <section key={section.heading} className="mt-10">
          <h2 className="text-xl font-bold text-black">{section.heading}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph} className="mt-3 leading-7 text-muted-foreground">
              {paragraph}
            </p>
          ))}
        </section>
      ))}
      <p className="mt-12 text-sm text-muted-foreground">
        More about us on the <Link href="/about" className="text-primary underline">About page</Link>.
      </p>
    </div>
  );
}
