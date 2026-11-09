import { AMENITY_FILTER_OPTIONS } from "@/lib/library-filters";

export type AmenityDefinition = {
  slug: string;
  label: string;
  /** Substrings matched case-insensitively against amenities_text. */
  match: string[];
};

/** Canonical amenity pages. Slugs are stable public URLs. */
export const AMENITIES: AmenityDefinition[] = [
  { slug: "ac", label: "AC", match: ["ac", "air condition"] },
  { slug: "wi-fi", label: "Wi-Fi", match: ["wi-fi", "wifi", "wi fi"] },
  { slug: "ro-water", label: "RO Water", match: ["ro water", "drinking water", "water cooler"] },
  { slug: "washroom", label: "Washroom", match: ["washroom", "toilet"] },
  { slug: "power-backup", label: "Power Backup", match: ["power backup", "inverter", "generator"] },
  { slug: "cctv", label: "CCTV", match: ["cctv"] },
  { slug: "locker", label: "Locker", match: ["locker"] },
  { slug: "parking", label: "Parking", match: ["parking"] },
  { slug: "tea-coffee", label: "Tea/Coffee", match: ["tea", "coffee"] },
  { slug: "security-guard", label: "Security Guard", match: ["security guard", "guard"] },
  { slug: "charging-points", label: "Charging Points", match: ["charging"] },
  { slug: "silent-zone", label: "Silent Zone", match: ["silent zone", "silent"] },
  { slug: "discussion-room", label: "Discussion Room", match: ["discussion room"] },
  { slug: "daily-newspaper", label: "Daily Newspaper", match: ["newspaper"] },
];

/** Old or alternative slugs that should 308 to the canonical amenity slug. */
export const AMENITY_SLUG_ALIASES: Record<string, string> = {
  wifi: "wi-fi",
  "water-cooler": "ro-water",
  "tea": "tea-coffee",
  "tea%2fcoffee": "tea-coffee",
  "tea/coffee": "tea-coffee",
};

/** Pages with fewer libraries than this are noindex (thin content). */
export const MIN_LIBRARIES_TO_INDEX = 3;

export function getAmenityBySlug(slug: string): AmenityDefinition | null {
  const lower = slug.toLowerCase();
  return AMENITIES.find((amenity) => amenity.slug === lower) ?? null;
}

export function getAmenityByLabel(label: string): AmenityDefinition | null {
  const lower = label.trim().toLowerCase();
  return (
    AMENITIES.find((amenity) => amenity.label.toLowerCase() === lower) ??
    AMENITIES.find((amenity) => amenity.match.some((needle) => needle === lower)) ??
    null
  );
}

function tokenize(amenitiesText: string | null | undefined) {
  if (!amenitiesText) return [];
  return amenitiesText
    .split(/[,|\n•]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

/** Which canonical amenities a library's free-text amenity list contains. */
export function amenitySlugsFor(amenitiesText: string | null | undefined): string[] {
  const tokens = tokenize(amenitiesText);
  if (tokens.length === 0) return [];
  return AMENITIES.filter((amenity) =>
    tokens.some((token) =>
      amenity.match.some((needle) =>
        needle.length <= 3 ? token === needle || token.startsWith(`${needle} `) : token.includes(needle),
      ),
    ),
  ).map((amenity) => amenity.slug);
}

/** PostgREST `or` filter matching any of the amenity's patterns. */
export function amenityOrFilter(amenity: AmenityDefinition) {
  const clauses: string[] = [];
  for (const raw of amenity.match) {
    const needle = raw.replace(/[,()*%"\\]/g, "");
    if (!needle) continue;
    if (needle.length <= 3) {
      // Short tokens like "ac" must match a whole list item, not "space".
      for (const pattern of [needle, `${needle},*`, `${needle} *`, `*,${needle}`, `*, ${needle}`, `*,${needle},*`, `*, ${needle},*`, `*, ${needle} *`]) {
        clauses.push(`amenities_text.ilike."${pattern}"`);
      }
    } else {
      clauses.push(`amenities_text.ilike."*${needle}*"`);
    }
  }
  return clauses.join(",");
}

export const FILTERABLE_AMENITIES = AMENITY_FILTER_OPTIONS.map(
  (label) => getAmenityByLabel(label) ?? { slug: label.toLowerCase(), label, match: [label.toLowerCase()] },
);
