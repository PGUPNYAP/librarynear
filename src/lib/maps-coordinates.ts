/**
 * Reads a location out of whatever people paste: any map link, an embed code,
 * a WhatsApp message containing a link, or plain coordinates. Pure code, used
 * by the browser for instant results and by the server.
 */
export type Coordinates = { latitude: number; longitude: number };

/** Reasonable upper bound for a pasted map link. */
const MAX_MAP_LINK_LENGTH = 4000;

const NUMBER = String.raw`-?\d{1,3}(?:\.\d+)?`;
const DECIMAL = String.raw`-?\d{1,3}\.\d+`;

function pair(latitude: number, longitude: number): Coordinates | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

/** Longitude typed first is a common slip, and in India the two ranges don't overlap. */
function fixSwapped(found: Coordinates | null): Coordinates | null {
  if (!found) return null;
  const { latitude, longitude } = found;
  return latitude >= 68 && latitude <= 98 && longitude >= 6 && longitude <= 38 ? { latitude: longitude, longitude: latitude } : found;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // Malformed percent-encoding: keep the raw string.
    return value;
  }
}

/** A query value such as "28.6,77.2", "loc:28.6+77.2" or "28.6,77.2(My Library)". */
function pairFromValue(value: string | null): Coordinates | null {
  if (!value) return null;
  const match = value.match(new RegExp(String.raw`^\s*(?:loc:)?\s*(${DECIMAL})\s*[,+\s]\s*(${DECIMAL})`));
  return match ? pair(Number(match[1]), Number(match[2])) : null;
}

const COORDINATE_PARAMS = ["q", "query", "destination", "daddr", "saddr", "ll", "sll", "center", "cbll", "viewpoint", "loc", "address"];

export function extractCoordinatesFromMapLink(mapLink: string | null | undefined): Coordinates | null {
  if (!mapLink || mapLink.length > MAX_MAP_LINK_LENGTH) return null;
  const decoded = safeDecodeURIComponent(mapLink);

  // The place's own pin is exact; the @ value in the same link is only where the map was centred.
  const pins = [...decoded.matchAll(new RegExp(String.raw`!3d(${NUMBER})!4d(${NUMBER})`, "g"))];
  if (pins.length) {
    const last = pins[pins.length - 1];
    return pair(Number(last[1]), Number(last[2]));
  }
  const embed = decoded.match(new RegExp(String.raw`!2d(${NUMBER})!3d(${NUMBER})`));
  if (embed) return pair(Number(embed[2]), Number(embed[1]));

  try {
    const url = new URL(decoded);
    for (const name of COORDINATE_PARAMS) {
      const found = pairFromValue(url.searchParams.get(name));
      if (found) return found;
    }
    const mlat = url.searchParams.get("mlat");
    const mlon = url.searchParams.get("mlon");
    if (mlat && mlon) return pair(Number(mlat), Number(mlon));
    const bing = url.searchParams.get("cp")?.match(new RegExp(String.raw`^(${NUMBER})[~,](${NUMBER})`));
    if (bing) return pair(Number(bing[1]), Number(bing[2]));
    const osm = url.hash.match(new RegExp(String.raw`map=\d+/(${NUMBER})/(${NUMBER})`));
    if (osm) return pair(Number(osm[1]), Number(osm[2]));
  } catch {
    // Some pasted links aren't valid URLs but still contain coordinates.
  }

  const at = decoded.match(new RegExp(String.raw`@(${NUMBER}),(${NUMBER})`));
  if (at) return pair(Number(at[1]), Number(at[2]));

  const inPath = decoded.match(/(-?\d{1,2}\.\d{3,}),\s*\+?(-?\d{1,3}\.\d{3,})/);
  return inPath ? pair(Number(inPath[1]), Number(inPath[2])) : null;
}

/** "28.6306, 77.2774", "lat 28.63 long 77.27", 28°37'50"N 77°16'38"E, "28.63 N 77.27 E". */
export function parseCoordinatesText(input: string): Coordinates | null {
  const text = input.trim();
  if (!text || text.length > 120) return null;

  const dms = text.match(/(\d{1,2})\s*[°º\s]\s*(\d{1,2})\s*['′’\s]\s*(\d{1,2}(?:\.\d+)?)\s*["″”]?\s*([NS])[\s,;]+(\d{1,3})\s*[°º\s]\s*(\d{1,2})\s*['′’\s]\s*(\d{1,2}(?:\.\d+)?)\s*["″”]?\s*([EW])/i);
  if (dms) {
    const lat = (Number(dms[1]) + Number(dms[2]) / 60 + Number(dms[3]) / 3600) * (dms[4].toUpperCase() === "S" ? -1 : 1);
    const lng = (Number(dms[5]) + Number(dms[6]) / 60 + Number(dms[7]) / 3600) * (dms[8].toUpperCase() === "W" ? -1 : 1);
    return pair(Number(lat.toFixed(6)), Number(lng.toFixed(6)));
  }

  const hemisphere = text.match(new RegExp(String.raw`^(${DECIMAL})\s*°?\s*([NS])[\s,;]+(${DECIMAL})\s*°?\s*([EW])$`, "i"));
  if (hemisphere) {
    return pair(Number(hemisphere[1]) * (hemisphere[2].toUpperCase() === "S" ? -1 : 1), Number(hemisphere[3]) * (hemisphere[4].toUpperCase() === "W" ? -1 : 1));
  }

  const plain = text.replace(/\b(latitude|longitude|lat|lng|lon|long)\b\s*[:=]?/gi, " ").trim();
  const decimal = plain.match(new RegExp(String.raw`^(${DECIMAL})\s*[,;/|\s]\s*(${DECIMAL})$`));
  return decimal ? fixSwapped(pair(Number(decimal[1]), Number(decimal[2]))) : null;
}

const PLUS_ALPHABET = "23456789CFGHJMPQRVWX";

/** A full plus code such as 7JWVJ7J3+6W. Short ones ("J7J3+6W Delhi") go to Google with their town. */
export function decodePlusCode(input: string): Coordinates | null {
  const text = input.trim().toUpperCase();
  if (!/^[23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{2,7}$/.test(text)) return null;
  const code = text.replace("+", "");
  const steps = [20, 1, 0.05, 0.0025, 0.000125];
  let latitude = -90;
  let longitude = -180;
  for (let i = 0; i < 10; i += 2) {
    latitude += PLUS_ALPHABET.indexOf(code[i]) * steps[i / 2];
    longitude += PLUS_ALPHABET.indexOf(code[i + 1]) * steps[i / 2];
  }
  let latSize = 0.000125;
  let lngSize = 0.000125;
  for (let i = 10; i < code.length; i += 1) {
    const value = PLUS_ALPHABET.indexOf(code[i]);
    latSize /= 5;
    lngSize /= 4;
    latitude += Math.floor(value / 4) * latSize;
    longitude += (value % 4) * lngSize;
  }
  return pair(Number((latitude + latSize / 2).toFixed(6)), Number((longitude + lngSize / 2).toFixed(6)));
}

const BARE_MAP_URL = /\b(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|share\.google|maps\.google\.[a-z.]+|(?:www\.)?google\.[a-z.]+\/maps|maps\.apple\.com|(?:www\.)?openstreetmap\.org|(?:www\.)?bing\.com\/maps)\S*/i;

/** Pulls the link out of an embed code, a forwarded message, or a link typed without https. */
export function findUrlInText(input: string): string | null {
  const text = input.trim();
  const iframe = text.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  if (iframe) return iframe[1].replace(/&amp;/g, "&");
  const full = text.match(/https?:\/\/[^\s<>"']+/i);
  const found = full?.[0] ?? (BARE_MAP_URL.exec(text)?.[0] ? `https://${BARE_MAP_URL.exec(text)![0]}` : null);
  return found ? found.replace(/[).,;!]+$/, "") : null;
}

export type LocationInput =
  | { type: "coordinates"; coordinates: Coordinates }
  | { type: "url"; url: string; coordinates: Coordinates | null }
  | { type: "text"; query: string };

export function classifyLocationInput(input: string): LocationInput | null {
  const text = input.trim();
  if (!text || text.length > MAX_MAP_LINK_LENGTH) return null;
  const url = findUrlInText(text);
  if (url) return { type: "url", url, coordinates: extractCoordinatesFromMapLink(url) };
  const coordinates = parseCoordinatesText(text) ?? decodePlusCode(text);
  if (coordinates) return { type: "coordinates", coordinates };
  return text.length >= 3 ? { type: "text", query: text.slice(0, 200) } : null;
}

export function googleMapsLinkFor({ latitude, longitude }: Coordinates) {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

function isGoogleMapsUrl(value: string) {
  try {
    const { hostname } = new URL(value);
    return /(^|\.)google\.[a-z.]+$/i.test(hostname) || /(^|\.)goo\.gl$/i.test(hostname) || hostname === "g.co" || hostname === "share.google";
  } catch {
    return false;
  }
}

/** What we store: the Google link when there is one, otherwise a Google link built from the coordinates. */
export function canonicalMapLink(input: string | null, coordinates: Coordinates | null): string | null {
  const url = input ? findUrlInText(input) : null;
  if (url && isGoogleMapsUrl(url) && url.length <= 2000) return url;
  return coordinates ? googleMapsLinkFor(coordinates) : null;
}
