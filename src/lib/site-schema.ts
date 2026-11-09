import { getSiteUrl } from "@/lib/site-url";

export const ORGANIZATION = {
  name: "LibraryNear",
  legalName: "LibraryNear",
  email: "librarynear.com@gmail.com",
  telephone: "+91-8796190507",
  address: {
    streetAddress: "DTU IIF AB-4, Shahbad",
    addressLocality: "Rohini",
    addressRegion: "Delhi",
    postalCode: "110042",
    addressCountry: "IN",
  },
  sameAs: [
    "https://youtube.com/@librarynear",
    "https://x.com/Librarynear_com",
    "https://www.instagram.com/librarynear.com1/",
  ],
};

/** Site-wide Organization + WebSite graph. Pages reference these by @id. */
export function siteGraph() {
  const siteUrl = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: ORGANIZATION.name,
        legalName: ORGANIZATION.legalName,
        url: siteUrl,
        logo: { "@type": "ImageObject", url: `${siteUrl}/logo-icon.webp`, width: 512, height: 512 },
        image: `${siteUrl}/og-default.png`,
        email: ORGANIZATION.email,
        telephone: ORGANIZATION.telephone,
        description:
          "LibraryNear is a free directory of study libraries and reading rooms in India, with fees, timings, amenities and student reviews.",
        address: { "@type": "PostalAddress", ...ORGANIZATION.address },
        contactPoint: {
          "@type": "ContactPoint",
          telephone: ORGANIZATION.telephone,
          email: ORGANIZATION.email,
          contactType: "customer service",
          areaServed: "IN",
          availableLanguage: ["en"],
        },
        sameAs: ORGANIZATION.sameAs,
        publishingPrinciples: `${siteUrl}/editorial-policy`,
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        name: "LibraryNear",
        url: siteUrl,
        inLanguage: "en-IN",
        publisher: { "@id": `${siteUrl}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${siteUrl}/delhi/libraries?q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}
