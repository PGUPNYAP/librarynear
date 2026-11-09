import stationsData from "@/data/metro-stations-india.json";

/**
 * Nearest metro / light-rail station from coordinates, for any city.
 * Stations: Delhi's curated list + OpenStreetMap stations for other cities
 * (regenerate with `npx tsx scripts/fetch-places.ts` then `scripts/clean-data.ts`).
 * Returns null when no station is within MAX_METRO_KM, so a library is never
 * labelled with a station in another city.
 */
const MAX_METRO_KM = 2.5;

type Station = [string, number, number, string];
const stations = stationsData as Station[];

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export async function findNearestMetro(latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  let best: Station | null = null;
  let bestKm = Infinity;
  for (const station of stations) {
    if (Math.abs(station[1] - latitude) > 0.05 || Math.abs(station[2] - longitude) > 0.05) continue;
    const km = haversineKm(latitude, longitude, station[1], station[2]);
    if (km < bestKm) {
      best = station;
      bestKm = km;
    }
  }
  if (!best || bestKm > MAX_METRO_KM) return null;
  return {
    nearest_metro: best[0],
    nearest_metro_line: best[3] || null,
    nearest_metro_distance_km: Math.round(bestKm * 100) / 100,
  };
}
