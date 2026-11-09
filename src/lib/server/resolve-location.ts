import "server-only";

import { canonicalMapLink, classifyLocationInput, extractCoordinatesFromMapLink, type Coordinates } from "@/lib/maps-coordinates";

export type PlaceDetails = {
  name: string | null;
  address: string | null;
  locality: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pinCode: string | null;
};

export type ResolvedLocation =
  | { ok: true; latitude: number; longitude: number; mapLink: string; label: string | null; approximate: boolean; details?: PlaceDetails }
  | { ok: false; reason: "empty" | "unsupported" | "not_found" | "unreachable" };

const FOLLOWABLE_HOST = /(^|\.)(google\.[a-z.]+|goo\.gl|g\.co|share\.google|maps\.apple\.com|openstreetmap\.org|osm\.org|bing\.com)$/i;
const GOOGLE_HOST = /(^|\.)(google\.[a-z.]+|goo\.gl|g\.co|share\.google)$/i;
const BLOCKED_HOST = /^(localhost|metadata\.google\.internal|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i;
const MAX_REDIRECTS = 6;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

function followable(url: URL) {
  return (url.protocol === "https:" || url.protocol === "http:") && !BLOCKED_HOST.test(url.hostname) && FOLLOWABLE_HOST.test(url.hostname);
}

/** Follows short links, checking the host at every hop so a redirect can't reach an internal address. */
async function followLink(start: URL): Promise<{ finalUrl: string; coordinates: Coordinates | null } | null> {
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const inUrl = extractCoordinatesFromMapLink(current.toString());
    if (inUrl) return { finalUrl: current.toString(), coordinates: inUrl };

    // Google's consent interstitial carries the real link in a parameter.
    const continued = /^consent\./i.test(current.hostname) ? current.searchParams.get("continue") : null;
    if (continued) {
      const next = new URL(continued);
      if (!followable(next)) return null;
      current = next;
      continue;
    }

    const response = await fetch(current, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en-IN,en;q=0.9" },
    });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel().catch(() => undefined);
      const next = new URL(location, current);
      if (!followable(next)) return null;
      current = next;
      continue;
    }
    // The page itself can't be trusted for a location: Google centres it on the visitor's region.
    await response.body?.cancel().catch(() => undefined);
    return { finalUrl: current.toString(), coordinates: null };
  }
  return null;
}

/** The place a link names when it holds no coordinates: /maps/place/<name> or ?q=<name>. */
function placeHintFromUrl(raw: string): { placeId?: string; cid?: string; query?: string } {
  try {
    const url = new URL(raw);
    const placeId = url.searchParams.get("query_place_id") ?? url.searchParams.get("place_id") ?? url.searchParams.get("q")?.match(/^place_id:(.+)$/)?.[1];
    if (placeId) return { placeId };
    const cid = url.searchParams.get("cid");
    if (cid && /^\d+$/.test(cid)) return { cid };
    const inPath = url.pathname.match(/\/maps\/(?:place|search)\/([^/]+)/)?.[1];
    const query = url.searchParams.get("q") ?? url.searchParams.get("query") ?? (inPath ? decodeURIComponent(inPath).replace(/\+/g, " ") : null);
    return query && query.trim().length >= 3 ? { query: query.trim().slice(0, 200) } : {};
  } catch {
    return {};
  }
}

type Place = { latitude: number; longitude: number; label: string | null };

async function askGoogle(hint: { placeId?: string; cid?: string; query?: string }): Promise<Place | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  const base = "https://maps.googleapis.com/maps/api/place";
  const details = hint.placeId ? `place_id=${encodeURIComponent(hint.placeId)}` : hint.cid ? `cid=${hint.cid}` : null;
  const url = details
    ? `${base}/details/json?${details}&fields=name,geometry&key=${key}`
    : `${base}/findplacefromtext/json?input=${encodeURIComponent(`${hint.query}, India`)}&inputtype=textquery&fields=name,geometry&locationbias=rectangle:6,68|38,98&key=${key}`;
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!response.ok) return null;
    const json = (await response.json()) as {
      result?: { name?: string; geometry?: { location?: { lat: number; lng: number } } };
      candidates?: Array<{ name?: string; geometry?: { location?: { lat: number; lng: number } } }>;
    };
    const place = json.result ?? json.candidates?.[0];
    const location = place?.geometry?.location;
    return location ? { latitude: location.lat, longitude: location.lng, label: place?.name ?? null } : null;
  } catch {
    return null;
  }
}

/** Any link, embed, coordinates, plus code, address or name -> exact coordinates and a Google link. */
export async function resolveLocationInput(input: string | null | undefined): Promise<ResolvedLocation> {
  const parsed = classifyLocationInput(String(input ?? ""));
  if (!parsed) return { ok: false, reason: "empty" };

  const done = (coordinates: Coordinates, link: string | null, label: string | null, approximate: boolean): ResolvedLocation => ({
    ok: true,
    ...coordinates,
    mapLink: canonicalMapLink(link, coordinates) as string,
    label,
    approximate,
  });

  if (parsed.type === "coordinates") return done(parsed.coordinates, null, null, false);

  if (parsed.type === "text") {
    const place = await askGoogle({ query: parsed.query });
    return place ? done(place, null, place.label, true) : { ok: false, reason: "not_found" };
  }

  if (parsed.coordinates) return done(parsed.coordinates, parsed.url, null, false);

  let start: URL;
  try {
    start = new URL(parsed.url);
  } catch {
    return { ok: false, reason: "unsupported" };
  }
  if (!followable(start)) return { ok: false, reason: "unsupported" };

  let followed: Awaited<ReturnType<typeof followLink>>;
  try {
    followed = await followLink(start);
  } catch {
    return { ok: false, reason: "unreachable" };
  }
  if (!followed) return { ok: false, reason: "unsupported" };
  if (followed.coordinates) return done(followed.coordinates, followed.finalUrl, null, false);

  const hint = placeHintFromUrl(followed.finalUrl);
  if (hint.placeId || hint.cid || hint.query) {
    const place = await askGoogle(hint);
    if (place) return done(place, GOOGLE_HOST.test(new URL(followed.finalUrl).hostname) ? followed.finalUrl : null, place.label, !hint.placeId && !hint.cid);
  }
  return { ok: false, reason: "not_found" };
}

function nameFromLink(link: string | null): string | null {
  const inPath = link?.match(/\/maps\/place\/([^/@?]+)/)?.[1];
  if (!inPath) return null;
  try {
    const name = decodeURIComponent(inPath).replace(/\+/g, " ").trim();
    return name && !/^-?\d/.test(name) ? name : null;
  } catch {
    return null;
  }
}

/** Address parts for a point, so a pasted link fills the rest of the form. */
export async function describeLocation(coordinates: Coordinates, link: string | null, label: string | null): Promise<PlaceDetails | undefined> {
  const key = process.env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return undefined;
  try {
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${coordinates.latitude},${coordinates.longitude}&language=en&key=${key}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return undefined;
    const json = (await response.json()) as {
      results?: Array<{ formatted_address?: string; address_components?: Array<{ long_name: string; types: string[] }> }>;
    };
    const best = json.results?.[0];
    if (!best) return undefined;
    const all = (json.results ?? []).flatMap((result) => result.address_components ?? []);
    const part = (...types: string[]) => {
      for (const type of types) {
        const found = all.find((component) => component.types.includes(type));
        if (found) return found.long_name;
      }
      return null;
    };
    return {
      name: nameFromLink(link) ?? label,
      address: best.formatted_address?.replace(/,\s*India$/, "") ?? null,
      locality: part("sublocality_level_1", "sublocality", "neighborhood"),
      city: part("locality"),
      district: part("administrative_area_level_3"),
      state: part("administrative_area_level_1"),
      pinCode: part("postal_code"),
    };
  } catch {
    return undefined;
  }
}
