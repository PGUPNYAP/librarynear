/**
 * Best-known location of the current visitor, without ever prompting:
 *  1. a precise fix the visitor shared earlier via "Near me" (kept 30 min), else
 *  2. an approximate city-level location from their IP (/api/geo), cached
 *     for the browser session.
 * Used only to rank search suggestions by distance.
 */

export type UserLocation = { lat: number; lng: number; accuracy: "precise" | "city" };

const PRECISE_KEY = "ln_loc_precise";
const APPROX_KEY = "ln_loc_approx";
const PRECISE_TTL_MS = 30 * 60 * 1000;

let memory: UserLocation | null = null;
let pending: Promise<UserLocation | null> | null = null;

function read(storage: Storage | undefined, key: string) {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as UserLocation & { at?: number }) : null;
  } catch {
    return null;
  }
}

export function rememberPreciseLocation(lat: number, lng: number) {
  memory = { lat, lng, accuracy: "precise" };
  try {
    localStorage.setItem(PRECISE_KEY, JSON.stringify({ ...memory, at: Date.now() }));
  } catch {
    // storage blocked
  }
}

export function getCachedLocation(): UserLocation | null {
  if (memory) return memory;
  if (typeof window === "undefined") return null;
  const precise = read(window.localStorage, PRECISE_KEY);
  if (precise && precise.at && Date.now() - precise.at < PRECISE_TTL_MS) {
    memory = { lat: precise.lat, lng: precise.lng, accuracy: "precise" };
    return memory;
  }
  const approx = read(window.sessionStorage, APPROX_KEY);
  if (approx) {
    memory = { lat: approx.lat, lng: approx.lng, accuracy: "city" };
    return memory;
  }
  return null;
}

/** Never prompts. Falls back to IP-based approximate location. */
export function getApproxLocation(): Promise<UserLocation | null> {
  const cached = getCachedLocation();
  if (cached) return Promise.resolve(cached);
  if (pending) return pending;
  pending = fetch("/api/geo", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .then((json: { lat: number | null; lng: number | null } | null) => {
      if (!json || typeof json.lat !== "number" || typeof json.lng !== "number") return null;
      const location: UserLocation = { lat: json.lat, lng: json.lng, accuracy: "city" };
      memory = location;
      try {
        sessionStorage.setItem(APPROX_KEY, JSON.stringify(location));
      } catch {
        // storage blocked
      }
      return location;
    })
    .catch(() => null)
    .finally(() => {
      pending = null;
    });
  return pending;
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
