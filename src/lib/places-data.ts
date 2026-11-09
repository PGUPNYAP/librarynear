import "server-only";

/**
 * Landmarks and stations per city from OpenStreetMap (src/data/places/*.json,
 * refreshed with `npx tsx scripts/fetch-places.ts`). Data © OpenStreetMap
 * contributors, ODbL.
 */
export type PlacesFile = {
  city: string;
  generatedAt: string;
  metros: Array<[string, number, number]>;
  landmarks: Array<[string, string, number, number, string]>;
};

const cache = new Map<string, PlacesFile | null>();

export async function getCityPlaces(citySlug: string): Promise<PlacesFile | null> {
  if (cache.has(citySlug)) return cache.get(citySlug) ?? null;
  if (!/^[a-z0-9-]+$/.test(citySlug)) return null;
  try {
    const data = (await import(`@/data/places/${citySlug}.json`)).default as PlacesFile;
    cache.set(citySlug, data);
    return data;
  } catch {
    cache.set(citySlug, null);
    return null;
  }
}

/** Landmarks students search by; generic attractions are kept but ranked lower client-side. */
export const LANDMARK_CATEGORY_LABEL: Record<string, string> = {
  university: "University",
  college: "College",
  coaching: "Coaching institute",
  hospital: "Hospital",
  mall: "Mall",
  bus_station: "Bus station",
  rail_station: "Railway station",
  public_library: "Public library",
  landmark: "Landmark",
  place: "Place",
};
