/**
 * Shared helpers for city / locality / metro / amenity URL slugs and labels.
 *
 * URL slugs are always lowercase. Existing public URLs use
 * `name.toLowerCase().replace(/\s+/g, "-")`, so we keep that scheme to avoid
 * breaking indexed URLs.
 */

export const DEFAULT_CITY_SLUG = "delhi";
export const DEFAULT_CITY_NAME = "Delhi";

export function toPlaceSlug(value: string | null | undefined): string {
  if (!value) return "";
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

export function citySlug(city: string | null | undefined): string {
  return toPlaceSlug(city) || DEFAULT_CITY_SLUG;
}

/** "mukherjee-nagar" -> "Mukherjee Nagar" (display fallback only). */
export function slugToLabel(slug: string): string {
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    // keep raw slug
  }
  return decoded
    .split("-")
    .filter(Boolean)
    .map((word) => (word.length <= 3 && /^[a-z]+$/.test(word) && KNOWN_ACRONYMS.has(word)
      ? word.toUpperCase()
      : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

const KNOWN_ACRONYMS = new Set(["ac", "ro", "cctv", "dtu", "iit", "ncr"]);

/**
 * Turns a URL slug into an ILIKE pattern that matches the stored name whether
 * the original used spaces or hyphens ("phase-1" matches "Phase 1" and
 * "Phase-1"). Wildcard characters in user input are escaped first.
 */
export function slugToIlikePattern(slug: string): string {
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    // keep raw slug
  }
  return decoded
    .trim()
    .toLowerCase()
    .replace(/[\\%]/g, "")
    .replace(/_/g, "\\_")
    .replace(/-/g, "_");
}

export function isLowercaseSlug(value: string) {
  return value === value.toLowerCase();
}

/** Join name parts without repeating the locality when it is already in the name. */
export function libraryTitleParts(displayName: string, locality?: string | null, city?: string | null) {
  const name = displayName.trim();
  const lowerName = name.toLowerCase();
  const parts = [name];
  if (locality && !lowerName.includes(locality.trim().toLowerCase())) {
    parts.push(locality.trim());
  }
  if (city && !parts.some((part) => part.toLowerCase().includes(city.trim().toLowerCase()))) {
    parts.push(city.trim());
  }
  return parts;
}
