import "server-only";

import { unstable_cache } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { runLibraryCardQuery, withCardImage, type LibraryCardData } from "@/lib/library-card-data";
import { getCityPlaces } from "@/lib/places-data";
import { getFeeStats } from "@/lib/place-pages";
import { toPlaceSlug } from "@/lib/places";
import { ASPIRANT_HUBS, MIN_HUB_LIBRARIES, type AspirantHub } from "@/data/aspirant-hubs";

const isDev = process.env.NODE_ENV === "development";

/** Straight-line radius; about a 15-minute walk once streets are allowed for. */
export const COACHING_RADIUS_KM = 1;
/** Fewer libraries than this nearby and an institute gets no page. */
export const MIN_LIBRARIES_NEAR_COACHING = 5;

type LibraryPoint = { id: string; slug: string; name: string; locality: string | null; lat: number; lng: number };

async function loadPoints(cityName: string): Promise<LibraryPoint[]> {
  const points: LibraryPoint[] = [];
  for (let page = 0; page < 30; page += 1) {
    const { data, error } = await supabaseServer
      .from("library_branches")
      .select("id, slug, display_name, locality, latitude, longitude")
      .eq("is_active", true)
      .eq("city", cityName)
      .not("latitude", "is", null)
      .order("id")
      .range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    for (const row of data ?? []) {
      if (typeof row.latitude === "number" && typeof row.longitude === "number") {
        points.push({ id: row.id, slug: row.slug, name: row.display_name, locality: row.locality, lat: row.latitude, lng: row.longitude });
      }
    }
    if (!data || data.length < 1000) break;
  }
  return points;
}

const cachedPoints = unstable_cache(loadPoints, ["aspirant-library-points-v1"], { revalidate: 86400, tags: ["library-cards"] });
const getPoints = (cityName: string) => (isDev ? loadPoints(cityName) : cachedPoints(cityName));

export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const h = Math.sin(toRad(lat2 - lat1) / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Minutes on foot at 5 km/h, allowing 30% extra for streets not being straight. */
export function walkMinutes(km: number) {
  return Math.max(1, Math.round(km * 1.3 * 12));
}

export function walkLabel(km: number) {
  const minutes = walkMinutes(km);
  return `about ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

const NOT_EXAM_COACHING = /hospital|eye|dental|clinic|aviation|air ?hostess|airhostess|pilot|retail|beauty|salon|fashion|makeup|driving|dance|music|cooking|nursing|yoga|sports|cricket|montessori|play ?school|tally|hotel management|english|immigration|overseas|visa|ielts|school$/i;
const EXAM_BRANDS = /\b(vajiram|drishti|vision ias|next ias|forum ias|insights ias|sriram'?s ias|chanakya ias|khan global|allen|aakash|fiitjee|resonance|motion|vibrant|bansal classes|physics ?wallah|pw vidyapeeth|narayana|career launcher|time institute|ims learning|mahendra|paramount coaching|kd campus|rau'?s ias)\b/i;

export type CoachingPlace = { slug: string; name: string; lat: number; lng: number; nearby: Array<LibraryPoint & { km: number }> };

async function buildCoachingPlaces(citySlug: string, cityName: string): Promise<CoachingPlace[]> {
  const [places, points] = await Promise.all([getCityPlaces(citySlug), getPoints(cityName)]);
  if (!places || points.length === 0) return [];

  const candidates = places.landmarks.filter(([name, kind]) => (kind === "coaching" || (kind === "place" && EXAM_BRANDS.test(name))) && !NOT_EXAM_COACHING.test(name));

  const found: CoachingPlace[] = [];
  for (const [name, , lat, lng] of candidates) {
    const nearby = points
      .map((point) => ({ ...point, km: distanceKm(lat, lng, point.lat, point.lng) }))
      .filter((point) => point.km <= COACHING_RADIUS_KM)
      .sort((a, b) => a.km - b.km);
    if (nearby.length >= MIN_LIBRARIES_NEAR_COACHING) found.push({ slug: toPlaceSlug(name), name, lat, lng, nearby });
  }

  // Branches share a name: tell them apart by area, keeping URLs stable.
  const bySlug = new Map<string, CoachingPlace[]>();
  for (const place of found) bySlug.set(place.slug, [...(bySlug.get(place.slug) ?? []), place]);
  const result: CoachingPlace[] = [];
  for (const [slug, group] of bySlug) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
    const used = new Set<string>();
    for (const place of [...group].sort((a, b) => a.lat - b.lat || a.lng - b.lng)) {
      const area = toPlaceSlug(place.nearby[0]?.locality ?? "") || "branch";
      let candidate = `${slug}-${area}`;
      for (let n = 2; used.has(candidate); n += 1) candidate = `${slug}-${area}-${n}`;
      used.add(candidate);
      result.push({ ...place, slug: candidate });
    }
  }
  return result.sort((a, b) => b.nearby.length - a.nearby.length || a.name.localeCompare(b.name));
}

const cachedCoaching = unstable_cache(buildCoachingPlaces, ["aspirant-coaching-places-v2"], { revalidate: 86400, tags: ["library-cards"] });

export function getCoachingPlaces(citySlug: string, cityName: string) {
  return isDev ? buildCoachingPlaces(citySlug, cityName) : cachedCoaching(citySlug, cityName);
}

export type NearbyCard = LibraryCardData & { coverImageUrl: string | null; distance_km: number };

/** Full cards for the closest libraries, nearest first. */
export async function cardsFor(points: Array<{ id: string; km: number }>, limit = 24): Promise<NearbyCard[]> {
  const top = points.slice(0, limit);
  if (top.length === 0) return [];
  const rows = await runLibraryCardQuery((selectClause) =>
    supabaseServer.from("library_branches").select(selectClause).eq("is_active", true).in("id", top.map((point) => point.id)),
  );
  const km = new Map(top.map((point) => [point.id, point.km]));
  return rows
    .map(withCardImage)
    .map((row) => ({ ...row, distance_km: km.get(row.id) ?? 0 }) as NearbyCard)
    .sort((a, b) => a.distance_km - b.distance_km);
}

export type HubData = {
  hub: AspirantHub;
  centre: { lat: number; lng: number };
  libraries: Array<LibraryPoint & { km: number }>;
  metros: Array<{ name: string; km: number }>;
  coaching: CoachingPlace[];
};

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export async function getHubData(hub: AspirantHub, cityName: string): Promise<HubData | null> {
  const points = await getPoints(cityName);
  const wanted = new Set(hub.localities.map((name) => name.toLowerCase()));
  const anchors = points.filter((point) => point.locality && wanted.has(point.locality.toLowerCase()));
  if (anchors.length === 0) return null;
  const centre = { lat: median(anchors.map((point) => point.lat)), lng: median(anchors.map((point) => point.lng)) };
  const libraries = points
    .map((point) => ({ ...point, km: distanceKm(centre.lat, centre.lng, point.lat, point.lng) }))
    .filter((point) => point.km <= hub.radiusKm)
    .sort((a, b) => a.km - b.km);
  if (libraries.length < MIN_HUB_LIBRARIES) return null;

  const [places, allCoaching] = await Promise.all([getCityPlaces(hub.citySlug), getCoachingPlaces(hub.citySlug, cityName)]);
  const metros = (places?.metros ?? [])
    .map(([name, lat, lng]) => ({ name, km: distanceKm(centre.lat, centre.lng, lat, lng) }))
    .filter((metro) => metro.km <= hub.radiusKm + 0.5)
    .sort((a, b) => a.km - b.km)
    .slice(0, 5);
  const coaching = allCoaching.filter((place) => distanceKm(centre.lat, centre.lng, place.lat, place.lng) <= hub.radiusKm).slice(0, 18);
  return { hub, centre, libraries, metros, coaching };
}

export function getHubFees(hub: AspirantHub, ids: string[]) {
  return getFeeStats(`hub:${hub.slug}`, ids);
}

/** Hubs that currently have enough listings to deserve a page. */
export async function getPublishedHubs(cityNameFor: (slug: string) => Promise<string | null>) {
  const published: Array<{ hub: AspirantHub; count: number; cityName: string }> = [];
  for (const hub of ASPIRANT_HUBS) {
    const cityName = await cityNameFor(hub.citySlug);
    if (!cityName) continue;
    const data = await getHubData(hub, cityName);
    if (data) published.push({ hub, count: data.libraries.length, cityName });
  }
  return published;
}
