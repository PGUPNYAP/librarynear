import { getActiveCities } from "@/lib/cities-server";
import { getCoachingPlaces, getPublishedHubs } from "@/lib/aspirant-pages";
import "server-only";

import { supabaseServer } from "@/lib/supabase-server";
import { getSiteUrl } from "@/lib/site-url";
import { citySlug, toPlaceSlug } from "@/lib/places";
import { amenitySlugsFor, MIN_LIBRARIES_TO_INDEX } from "@/lib/amenities";
import { isOpen24Hours } from "@/lib/library-seo";
import { client } from "@/sanity/lib/client";

export const LIBRARIES_PER_SITEMAP = 10_000;

export type SitemapEntry = {
  url: string;
  lastModified?: string;
  changeFrequency?: "daily" | "weekly" | "monthly";
  priority?: number;
};

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function renderUrlset(entries: SitemapEntry[]) {
  const body = entries
    .map((entry) =>
      [
        "<url>",
        `<loc>${xmlEscape(entry.url)}</loc>`,
        entry.lastModified ? `<lastmod>${entry.lastModified}</lastmod>` : "",
        entry.changeFrequency ? `<changefreq>${entry.changeFrequency}</changefreq>` : "",
        typeof entry.priority === "number" ? `<priority>${entry.priority.toFixed(1)}</priority>` : "",
        "</url>",
      ].join(""),
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function renderSitemapIndex(locations: string[]) {
  const now = new Date().toISOString();
  const body = locations
    .map((loc) => `<sitemap><loc>${xmlEscape(loc)}</loc><lastmod>${now}</lastmod></sitemap>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

export function xmlResponse(xml: string) {
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}

export async function countActiveLibraries() {
  const { count } = await supabaseServer
    .from("library_branches")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);
  return count ?? 0;
}

export async function getSitemapPartNames() {
  const total = await countActiveLibraries();
  const libraryParts = Math.max(1, Math.ceil(total / LIBRARIES_PER_SITEMAP));
  return [
    "pages",
    "places",
    "blog",
    ...Array.from({ length: libraryParts }, (_, index) => `libraries-${index}`),
  ];
}

type PlaceRow = {
  city: string;
  locality: string | null;
  nearest_metro: string | null;
  pin_code: string | null;
  amenities_text: string | null;
  opening_time: string | null;
  closing_time: string | null;
  updated_at: string | null;
};

async function fetchAllPlaceRows(): Promise<PlaceRow[]> {
  const rows: PlaceRow[] = [];
  const pageSize = 1000;
  for (let page = 0; page < 200; page++) {
    const { data, error } = await supabaseServer
      .from("library_branches")
      .select("city, locality, nearest_metro, pin_code, amenities_text, opening_time, closing_time, updated_at")
      .eq("is_active", true)
      .order("id")
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error || !data || data.length === 0) break;
    rows.push(...(data as PlaceRow[]));
    if (data.length < pageSize) break;
  }
  return rows;
}

function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/**
 * Only URLs whose pages actually render (and are indexable) are listed, so
 * the sitemap never points Google at 404s or noindex pages.
 */
export async function buildPlacesEntries(): Promise<SitemapEntry[]> {
  const base = getSiteUrl();
  const rows = await fetchAllPlaceRows();
  const localities = new Map<string, number>();
  const metros = new Map<string, number>();
  const pincodes = new Map<string, number>();
  const amenityCity = new Map<string, number>();
  const amenityLocality = new Map<string, number>();

  for (const row of rows) {
    const city = citySlug(row.city);
    const localitySlug = toPlaceSlug(row.locality);
    if (localitySlug) bump(localities, `${city}/locality/${localitySlug}`);
    const metroSlug = toPlaceSlug(row.nearest_metro);
    if (metroSlug) bump(metros, `${city}/metro/${metroSlug}`);
    if (row.pin_code && /^\d{6}$/.test(row.pin_code)) bump(pincodes, `${city}/pincode/${row.pin_code}`);
    for (const amenity of amenitySlugsFor(row.amenities_text)) {
      bump(amenityCity, `${city}/amenity/${amenity}`);
      if (localitySlug) bump(amenityLocality, `${city}/amenity/${amenity}/locality/${localitySlug}`);
    }
  }

  const entries: SitemapEntry[] = [];
  const push = (map: Map<string, number>, min: number, priority: number) => {
    for (const [path, count] of map) {
      if (count >= min) entries.push({ url: `${base}/${encodeURI(path)}`, changeFrequency: "weekly", priority });
    }
  };
  // Single-library localities are thin; their library page carries the content.
  push(localities, 2, 0.7);
  // Top-10 locality pages are only useful when there is something to rank.
  for (const [path, count] of localities) {
    if (count >= 5) {
      entries.push({ url: `${base}/${encodeURI(path.replace("/locality/", "/top-10/locality/"))}`, changeFrequency: "weekly", priority: 0.6 });
    }
  }
  push(metros, 2, 0.6);
  push(pincodes, MIN_LIBRARIES_TO_INDEX, 0.5);
  push(amenityCity, MIN_LIBRARIES_TO_INDEX, 0.6);
  push(amenityLocality, MIN_LIBRARIES_TO_INDEX, 0.5);
  return entries;
}

export async function buildPagesEntries(): Promise<SitemapEntry[]> {
  const base = getSiteUrl();
  const entries: SitemapEntry[] = [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/blog`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/editorial-policy`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/contact`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/for-owners`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/directory`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/cities`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/guides/student-emergency`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/guides/librarian-emergency`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/study-room`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/guides/moving-to`, changeFrequency: "weekly", priority: 0.7 },
  ];

  const activeCities = await getActiveCities();
  const nameOf = (slug: string) => activeCities.find((city) => city.slug === slug)?.name ?? null;
  const hubs = await getPublishedHubs(async (slug) => nameOf(slug));
  for (const { hub } of hubs) entries.push({ url: `${base}/guides/moving-to/${hub.slug}`, changeFrequency: "weekly", priority: 0.7 });
  for (const city of activeCities) {
    const places = await getCoachingPlaces(city.slug, city.name).catch(() => []);
    if (places.length >= 3) entries.push({ url: `${base}/${city.slug}/near`, changeFrequency: "weekly", priority: 0.6 });
    for (const place of places) entries.push({ url: `${base}/${city.slug}/near/${encodeURI(place.slug)}`, changeFrequency: "weekly", priority: 0.6 });
  }

  const rows = await fetchAllPlaceRows();
  const cityCounts = new Map<string, number>();
  const city24h = new Map<string, number>();
  for (const row of rows) {
    const city = citySlug(row.city);
    bump(cityCounts, city);
    if (isOpen24Hours(row)) bump(city24h, city);
  }

  // Fee pages are only indexable once a city has 10+ libraries with fees.
  const feeCounts = new Map<string, number>();
  for (let page = 0; page < 50; page++) {
    const { data, error } = await supabaseServer
      .from("library_branches")
      .select("city, library_fee_plans!inner(id)")
      .eq("is_active", true)
      .order("id")
      .range(page * 1000, page * 1000 + 999);
    if (error || !data || data.length === 0) break;
    for (const row of data as Array<{ city: string }>) bump(feeCounts, citySlug(row.city));
    if (data.length < 1000) break;
  }

  for (const [city, count] of cityCounts) {
    // Mirrors the city page rule: tiny cities are noindex.
    if (count < 3) continue;
    entries.push({ url: `${base}/${city}`, changeFrequency: "daily", priority: 0.9 });
    entries.push({ url: `${base}/${city}/libraries`, changeFrequency: "daily", priority: 0.8 });
    if ((feeCounts.get(city) ?? 0) >= 10) {
      entries.push({ url: `${base}/${city}/library-fees`, changeFrequency: "weekly", priority: 0.7 });
    }
    if (count >= 10) entries.push({ url: `${base}/${city}/top-10-libraries`, changeFrequency: "weekly", priority: 0.8 });
    if ((city24h.get(city) ?? 0) >= 1) {
      entries.push({ url: `${base}/${city}/24-hour-libraries`, changeFrequency: "weekly", priority: 0.7 });
    }
  }
  return entries;
}

export async function buildLibraryEntries(part: number): Promise<SitemapEntry[]> {
  const base = getSiteUrl();
  const entries: SitemapEntry[] = [];
  const start = part * LIBRARIES_PER_SITEMAP;
  const pageSize = 1000;
  for (let offset = 0; offset < LIBRARIES_PER_SITEMAP; offset += pageSize) {
    const from = start + offset;
    const { data, error } = await supabaseServer
      .from("library_branches")
      .select("slug, city, updated_at")
      .eq("is_active", true)
      .order("id")
      .range(from, from + pageSize - 1);
    if (error || !data || data.length === 0) break;
    for (const row of data) {
      entries.push({
        url: `${base}/${citySlug(row.city)}/library/${encodeURIComponent(row.slug)}`,
        lastModified: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
    if (data.length < pageSize) break;
  }
  return entries;
}

export async function buildBlogEntries(): Promise<SitemapEntry[]> {
  const base = getSiteUrl();
  const posts: Array<{ slug: { current: string }; _updatedAt?: string; publishedAt?: string }> = await client.fetch(
    `*[_type == "post" && defined(slug.current)] { slug, _updatedAt, publishedAt }`,
  );
  return posts.map((post) => ({
    url: `${base}/blog/${encodeURIComponent(post.slug.current.trim())}`,
    lastModified: new Date(post._updatedAt || post.publishedAt || Date.now()).toISOString(),
    changeFrequency: "weekly",
    priority: 0.7,
  }));
}
