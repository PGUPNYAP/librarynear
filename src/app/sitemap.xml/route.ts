import { getSiteUrl } from "@/lib/site-url";
import { getSitemapPartNames, renderSitemapIndex, xmlResponse } from "@/lib/sitemap-data";

// Rebuilt at most once a day; served from the CDN in between.
export const revalidate = 86400;

export async function GET() {
  const base = getSiteUrl();
  const parts = await getSitemapPartNames();
  return xmlResponse(renderSitemapIndex(parts.map((part) => `${base}/sitemaps/${part}.xml`)));
}
