/**
 * In-browser search ("feels like Google Maps"): every keystroke is answered
 * locally from a per-city index (see /api/search-index/[city]).
 *
 * Ranking combines: text match (exact > prefix > phonetic > contains > typo),
 * learned/seeded aliases, distance from the visitor (precise or IP-approx),
 * click popularity, verification and rating.
 */
import { toPlaceSlug } from "@/lib/places";
import { AMENITIES, getAmenityByLabel, type AmenityDefinition } from "@/lib/amenities";
import { PRICE_RANGE_OPTIONS } from "@/lib/library-filters";
import { distanceKm, type UserLocation } from "@/lib/user-location";

export type SearchIndex = {
  v: 2;
  city: string;
  /** [slug, name, locality, rating*10, verified, score, lat*1e3, lng*1e3, clicks] */
  l: Array<[string, string, string, number, 0 | 1, number, number, number, number]>;
  /** [name, count, lat*1e3, lng*1e3, clicks] */
  loc: Array<[string, number, number, number, number]>;
  /** [name, count, lat*1e3, lng*1e3] */
  m: Array<[string, number, number, number]>;
  /** [alias, type, target name (or slug for libraries)] */
  a: Array<[string, "locality" | "metro" | "library", string]>;
  /** [name, category, lat*1e3, lng*1e3, altNames "|"-joined] landmarks (OpenStreetMap) */
  p?: Array<[string, string, number, number, string]>;
  /** [pin, libraryCount] */
  z?: Array<[string, number]>;
};

export type PlacesIndex = { v: 1; c: Array<[string, string]>; p: Array<[number, string, number]> };

export type SuggestionType = "library" | "locality" | "metro" | "place" | "pincode" | "nearme" | "lookup";

export type LocalSuggestion = {
  type: SuggestionType;
  label: string;
  slug: string;
  city: string;
  sublabel?: string;
  distance_km?: number | null;
  /** For "place" results: where "libraries near <place>" should search. */
  lat?: number;
  lng?: number;
  /** For "lookup": the place text to resolve on the server. */
  query?: string;
};

export const PLACE_CATEGORY_LABEL: Record<string, string> = {
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

/** Students search by colleges and coaching hubs far more than by malls. */
const PLACE_CATEGORY_WEIGHT: Record<string, number> = {
  university: 2,
  college: 1.8,
  coaching: 1.8,
  rail_station: 1,
  bus_station: 0.6,
  hospital: 0.6,
  mall: 0.6,
  public_library: 0.4,
  landmark: 0.4,
  place: 0,
};

export type IntentChip = { label: string; href: string };

type Entry = {
  key: string;
  words: string[];
  sounds: string[];
  lat: number | null;
  lng: number | null;
  clicks: number;
};

type LibraryEntry = Entry & { slug: string; name: string; locality: string; rating: number; verified: boolean; score: number };
type PlaceEntry = Entry & { name: string; count: number };
type LandmarkEntry = Entry & { name: string; category: string; alts: string[] };

export type PreparedIndex = {
  city: string;
  libraries: LibraryEntry[];
  localities: PlaceEntry[];
  metros: PlaceEntry[];
  /** normalized alias -> targets */
  aliases: Map<string, Array<{ type: "locality" | "metro" | "library"; target: string }>>;
  aliasKeys: string[];
  landmarks: LandmarkEntry[];
  pins: Array<{ pin: string; count: number }>;
};

// ---------------------------------------------------------------------------
// Text normalization
// ---------------------------------------------------------------------------

/** Abbreviations people type in Indian addresses -> the full word. */
const TOKEN_SYNONYMS: Record<string, string> = {
  sec: "sector",
  sect: "sector",
  sctr: "sector",
  ngr: "nagar",
  nagr: "nagar",
  extn: "extension",
  ext: "extension",
  ph: "phase",
  rd: "road",
  mkt: "market",
  mrkt: "market",
  stn: "station",
  opp: "opposite",
  lib: "library",
  libr: "library",
  apt: "apartment",
  colny: "colony",
  clny: "colony",
  vihar: "vihar",
  bagh: "bagh",
  marg: "marg",
  chk: "chowk",
};

/** Words that describe what we already search for; dropped when other words remain. */
const STOPWORDS = new Set([
  "library", "libraries", "librari", "study", "reading", "room", "rooms", "hall", "self", "center", "centre",
  "near", "nearby", "in", "at", "the", "a", "of", "for", "me", "best", "good", "top",
]);

// Devanagari -> Latin (so "मुखर्जी नगर" finds Mukherjee Nagar).
const DEV_VOWELS: Record<string, string> = {
  "अ": "a", "आ": "a", "इ": "i", "ई": "i", "उ": "u", "ऊ": "u", "ऋ": "ri", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऑ": "o",
};
const DEV_MATRAS: Record<string, string> = {
  "ा": "a", "ि": "i", "ी": "i", "ु": "u", "ू": "u", "ृ": "ri", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॅ": "e", "ॉ": "o",
};
const DEV_CONSONANTS: Record<string, string> = {
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n",
  "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh",
  "ष": "sh", "स": "s", "ह": "h", "क़": "q", "ख़": "kh", "ग़": "g", "ज़": "z", "ड़": "r", "ढ़": "rh", "फ़": "f", "ळ": "l",
};

export function transliterateDevanagari(value: string): string {
  if (!/[\u0900-\u097F]/.test(value)) return value;
  const text = value.normalize("NFC");
  let out = "";
  for (let i = 0; i < text.length; i++) {
    let char = text[i];
    if (text[i + 1] === "\u093C") {
      char += "\u093C"; // nukta
      i++;
    }
    const consonant = DEV_CONSONANTS[char];
    if (consonant) {
      const next = text[i + 1];
      out += consonant;
      if (next && DEV_MATRAS[next]) {
        out += DEV_MATRAS[next];
        i++;
      } else if (next === "\u094D") {
        i++; // virama: no vowel
      } else {
        out += "a"; // inherent vowel (trailing one dropped below)
      }
      continue;
    }
    if (DEV_VOWELS[char]) out += DEV_VOWELS[char];
    else if (DEV_MATRAS[char]) out += DEV_MATRAS[char];
    else if (char === "\u0902" || char === "\u0901") out += "n";
    else if (char === "\u0903") out += "h";
    else if (char >= "\u0966" && char <= "\u096F") out += String(char.charCodeAt(0) - 0x0966);
    else if (char === "\u094D") continue;
    else out += char;
  }
  // Schwa deletion at word ends: "nagara" -> "nagar".
  return out.replace(/([bcdfghjklmnpqrstvwxyz])a\b/g, "$1");
}

/**
 * Light normalization: lowercase, strip accents/punctuation, fold the most
 * common Indian-English vowel spellings (Mukherjee/Mukherji, Rohini/Rohinee).
 * Consonant variants are handled by the phonetic key instead, so we don't
 * over-merge different names.
 */
export function normalizeForSearch(value: string): string {
  return transliterateDevanagari(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/(ee|ii|ey)\b/g, "i")
    .replace(/(\w)y\b/g, "$1i")
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/aa/g, "a")
    .replace(/([a-z])\1+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Consonant-skeleton key for sound-alike matching (Laxmi/Lakshmi, Rajinder/Rajendra). */
export function phoneticKey(word: string): string {
  if (!word) return "";
  const folded = word
    .replace(/ksh|x/g, "ks")
    .replace(/q/g, "k")
    .replace(/ck/g, "k")
    .replace(/w/g, "v")
    .replace(/z/g, "j")
    .replace(/ph/g, "f")
    .replace(/([bcdgjkpstr])h/g, "$1")
    .replace(/(sh)/g, "s");
  const first = folded[0];
  const rest = folded.slice(1).replace(/[aeiouyh]/g, "");
  return (first + rest).replace(/(.)\1+/g, "$1");
}

function tokenize(value: string) {
  return normalizeForSearch(value).split(" ").filter(Boolean);
}

/** Damerau-Levenshtein distance, giving up once it exceeds `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => {
    const row = new Array<number>(cols).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    let rowMin = Infinity;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

function typoAllowance(length: number) {
  if (length >= 8) return 2;
  if (length >= 4) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Index preparation
// ---------------------------------------------------------------------------

function entry(text: string, lat: number, lng: number, clicks: number): Entry {
  const words = tokenize(text);
  return {
    key: words.join(" "),
    words,
    sounds: words.map(phoneticKey),
    lat: lat ? lat / 1000 : null,
    lng: lng ? lng / 1000 : null,
    clicks,
  };
}

const ACRONYM_SKIP = new Set(["of", "and", "the", "for", "&", "in", "at"]);

/** "Delhi Technological University" -> "dtu", "All India Institute of Medical Sciences" -> "aiims". */
export function acronymOf(name: string): string | null {
  const words = name
    .replace(/\(.*?\)/g, " ")
    .split(/[^A-Za-z]+/)
    .filter((word) => word && !ACRONYM_SKIP.has(word.toLowerCase()));
  if (words.length < 2) return null;
  const acronym = words.map((word) => word[0]).join("").toLowerCase();
  return acronym.length >= 2 && acronym.length <= 7 ? acronym : null;
}

function landmarkEntry(name: string, category: string, lat: number, lng: number, alt: string): LandmarkEntry {
  const names = [name, ...alt.split("|").filter(Boolean)];
  const acronyms = names.map(acronymOf).filter((value): value is string => Boolean(value));
  // Parenthesised short forms, e.g. "Delhi Technological University (DTU)".
  for (const match of name.matchAll(/\(([A-Za-z.]{2,8})\)/g)) acronyms.push(match[1].replace(/\./g, "").toLowerCase());
  const words = [...new Set([...names.flatMap((value) => tokenize(value)), ...acronyms])];
  const alts = [...new Set([...names.slice(1).map((value) => tokenize(value).join(" ")), ...acronyms])];
  return {
    alts,
    key: tokenize(name).join(" "),
    words,
    sounds: words.map(phoneticKey),
    lat: lat ? lat / 1000 : null,
    lng: lng ? lng / 1000 : null,
    clicks: 0,
    name,
    category,
  };
}

export function prepareIndex(index: SearchIndex): PreparedIndex {
  const aliases = new Map<string, Array<{ type: "locality" | "metro" | "library"; target: string }>>();
  for (const [alias, type, target] of index.a ?? []) {
    const key = normalizeForSearch(alias);
    if (!key) continue;
    const list = aliases.get(key) ?? [];
    list.push({ type, target });
    aliases.set(key, list);
  }
  return {
    city: index.city,
    libraries: index.l.map(([slug, name, locality, rating, verified, score, lat, lng, clicks]) => ({
      ...entry(`${name} ${locality}`, lat, lng, clicks),
      slug,
      name,
      locality,
      rating: rating / 10,
      verified: verified === 1,
      score,
    })),
    localities: index.loc.map(([name, count, lat, lng, clicks]) => ({ ...entry(name, lat, lng, clicks), name, count })),
    metros: index.m.map(([name, count, lat, lng]) => ({ ...entry(name, lat, lng, 0), name, count })),
    aliases,
    aliasKeys: [...aliases.keys()],
    landmarks: (index.p ?? []).map(([name, category, lat, lng, alt]) => landmarkEntry(name, category, lat, lng, alt)),
    pins: (index.z ?? []).map(([pin, count]) => ({ pin, count })),
  };
}

// ---------------------------------------------------------------------------
// Query understanding (intent chips)
// ---------------------------------------------------------------------------

export type ParsedQuery = {
  tokens: string[];
  /** "library near me" / "nearby" */
  nearMe: boolean;
  /** "library near dtu" -> ["dtu"]; the place the user wants to be near. */
  nearTokens: string[] | null;
  nearText: string | null;
  amenities: AmenityDefinition[];
  open24: boolean;
  maxPrice: number | null;
  verified: boolean;
  topRated: boolean;
};

export function parseQuery(query: string): ParsedQuery {
  let text = ` ${transliterateDevanagari(query).toLowerCase().replace(/[^a-z0-9/ ]+/g, " ")} `;
  let nearMe = false;
  let nearText: string | null = null;
  if (/\s(near\s*(by\s*)?me|nearby|around\s*me|close\s*to\s*me|near\s*my\s*location)\s/.test(text)) {
    nearMe = true;
    text = text.replace(/\s(near\s*(by\s*)?me|nearby|around\s*me|close\s*to\s*me|near\s*my\s*location)\s/, " ");
  } else {
    const near = /\s(?:near|around|close\s*to|next\s*to|beside|opposite|opp|behind|walking\s*distance\s*(?:from|of))\s+(.+)$/.exec(text);
    if (near) {
      nearText = near[1].trim();
      text = text.slice(0, near.index) + " ";
    }
  }
  const amenities: AmenityDefinition[] = [];
  let open24 = false;
  let maxPrice: number | null = null;
  let verified = false;
  let topRated = false;

  const take = (pattern: RegExp) => {
    const hit = pattern.test(text);
    if (hit) text = text.replace(pattern, " ");
    return hit;
  };

  // Bare "24" is ignored on purpose: "Sector 24" is a place, not opening hours.
  if (take(/\s(24\s*\/\s*7|24\s*x\s*7|24\s*hrs?|24\s*hours?|open\s*24|all\s*night|overnight|late\s*night)\s/)) open24 = true;

  const price = /\s(?:under|below|upto|up\s*to|less\s*than|within|max|<)\s*(?:rs\.?|inr|₹)?\s*(\d+(?:\.\d+)?)\s*(k)?\s/.exec(text);
  if (price) {
    maxPrice = Math.round(Number(price[1]) * (price[2] ? 1000 : 1));
    text = text.replace(price[0], " ");
  } else if (take(/\s(cheap|budget|affordable|low\s*cost)\s/)) {
    maxPrice = 3000;
  }

  if (take(/\s(verified|trusted)\s/)) verified = true;
  if (take(/\s(top\s*rated|best\s*rated|highest\s*rated|best)\s/)) topRated = true;

  for (const amenity of AMENITIES) {
    for (const needle of [amenity.label.toLowerCase(), ...amenity.match]) {
      const pattern = new RegExp(`\\s${needle.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&").replace(/\s+/g, "\\s*")}\\s`);
      if (pattern.test(text)) {
        if (!amenities.some((existing) => existing.slug === amenity.slug)) amenities.push(amenity);
        text = text.replace(pattern, " ");
        break;
      }
    }
  }
  // "with ac" style single tokens the loop above may miss
  for (const word of text.split(/\s+/)) {
    const amenity = word.length >= 2 ? getAmenityByLabel(word) : null;
    if (amenity && !amenities.some((existing) => existing.slug === amenity.slug)) {
      amenities.push(amenity);
      text = text.replace(new RegExp(`\\s${word}\\s`), " ");
    }
  }

  const nearTokens = nearText
    ? tokenize(nearText)
        .map((token) => TOKEN_SYNONYMS[token] ?? token)
        .filter((token) => !STOPWORDS.has(token))
    : null;
  const rawTokens = tokenize(text).map((token) => TOKEN_SYNONYMS[token] ?? token);
  const meaningful = rawTokens.filter((token) => !STOPWORDS.has(token) && token !== "with" && token !== "and");
  return {
    tokens: meaningful.length > 0 ? meaningful : nearTokens || nearMe ? [] : rawTokens.filter((token) => token !== "with" && token !== "and"),
    nearMe,
    nearTokens: nearTokens && nearTokens.length ? nearTokens : null,
    nearText,
    amenities,
    open24,
    maxPrice,
    verified,
    topRated,
  };
}

export function hasIntent(parsed: ParsedQuery) {
  return parsed.amenities.length > 0 || parsed.open24 || parsed.maxPrice !== null || parsed.verified || parsed.topRated;
}

function priceOptionFor(maxPrice: number) {
  return PRICE_RANGE_OPTIONS.find((option) => option.max !== null && maxPrice <= option.max) ?? PRICE_RANGE_OPTIONS[PRICE_RANGE_OPTIONS.length - 1];
}

/** "AC libraries under ₹3,000 in Mukherjee Nagar" -> a filtered listing link. */
export function buildIntentChip(parsed: ParsedQuery, city: string, cityLabel: string, place?: { name: string } | null): IntentChip | null {
  if (!hasIntent(parsed)) return null;
  const params = new URLSearchParams();
  const parts: string[] = [];
  if (parsed.amenities.length) {
    params.set("amenities", parsed.amenities.map((amenity) => amenity.label).join(","));
    parts.push(parsed.amenities.map((amenity) => amenity.label).join(" + "));
  }
  if (parsed.open24) {
    params.set("open24", "1");
    parts.push("24-hour");
  }
  if (parsed.verified) {
    params.set("verified", "1");
    parts.push("verified");
  }
  let label = `${parts.length ? `${parts.join(", ")} ` : ""}libraries`;
  if (parsed.maxPrice !== null) {
    const option = priceOptionFor(parsed.maxPrice);
    params.set("price", option.value);
    label += ` (${option.label.replace(/^Up to/, "up to")})`;
  }
  if (parsed.topRated) {
    params.set("sort", "rating");
    label = `Top rated ${label}`;
  }
  if (place) params.set("locality", place.name);
  label += ` in ${place ? place.name : cityLabel}`;
  label = label.charAt(0).toUpperCase() + label.slice(1);
  return { label, href: `/${city}/libraries?${params.toString()}` };
}

// ---------------------------------------------------------------------------
// Matching and ranking
// ---------------------------------------------------------------------------

type MatchMemo = Map<string, number>;

/** Score one query token against one indexed word (memoized per search). */
function wordScore(token: string, sound: string, word: string, wordSound: string, memo?: MatchMemo) {
  const memoKey = memo ? `${token}|${word}` : "";
  if (memo) {
    const cached = memo.get(memoKey);
    if (cached !== undefined) return cached;
  }
  let value = 0;
  if (word === token) value = 6;
  else if (word.startsWith(token)) value = 4 + Math.min(token.length, 6) / 10;
  // Sound-alike: exact key match, or a prefix only when the key is long enough
  // to be distinctive ("andheri" must not match "Andrews Ganj").
  // Short sound keys ("rn") are too ambiguous: Rohini must not match Rana.
  else if (token.length >= 4 && sound.length >= 3 && (wordSound === sound || (sound.length >= 5 && wordSound.startsWith(sound)))) value = 3;
  else if (token.length >= 3 && word.includes(token)) value = 2;
  else {
    const allowance = typoAllowance(token.length);
    // Typos almost never hit the first letter; skipping those keeps this cheap.
    if (allowance > 0 && (word[0] === token[0] || word[1] === token[0])) {
      const prefix = word.slice(0, token.length);
      const distance = Math.min(editDistance(token, prefix, allowance), editDistance(token, word, allowance));
      if (distance <= allowance) value = distance === 1 ? 2 : 1.2;
    }
  }
  if (memo) memo.set(memoKey, value);
  return value;
}

function matchScore(tokens: string[], item: Entry, memo?: MatchMemo, sounds?: string[]) {
  if (tokens.length === 0) return 0;
  let total = 0;
  for (let t = 0; t < tokens.length; t++) {
    const token = tokens[t];
    const sound = sounds ? sounds[t] : phoneticKey(token);
    let best = 0;
    for (let index = 0; index < item.words.length; index++) {
      let value = wordScore(token, sound, item.words[index], item.sounds[index], memo);
      if (value && index === 0) value += 1;
      if (value > best) best = value;
    }
    if (best === 0) return 0;
    total += best;
  }
  const joined = tokens.join(" ");
  if (item.key === joined) total += 6;
  else if (item.key.startsWith(joined)) total += 4;
  else if (item.key.includes(joined)) total += 1.5;
  return total;
}

function proximityBoost(item: { lat: number | null; lng: number | null }, location: UserLocation | null) {
  if (!location || item.lat === null || item.lng === null) return { boost: 0, km: null as number | null };
  const km = distanceKm(location, { lat: item.lat, lng: item.lng });
  const boost = location.accuracy === "precise" ? 4 * Math.exp(-km / 3) : 2 * Math.exp(-km / 8);
  return { boost, km };
}

function popularityBoost(clicks: number) {
  return clicks > 0 ? Math.log2(1 + clicks) * 0.8 : 0;
}

function formatKm(km: number | null, location: UserLocation | null) {
  if (km === null || !location) return null;
  // Approximate (IP) locations are only city-level; don't show fake precision.
  if (location.accuracy !== "precise" && km < 5) return null;
  return km < 1 ? `${Math.max(100, Math.round(km * 10) * 100)} m` : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

function aliasTargets(index: PreparedIndex, query: string) {
  const key = normalizeForSearch(query);
  if (key.length < 2) return [];
  const exact = index.aliases.get(key) ?? [];
  const prefix =
    key.length >= 3
      ? index.aliasKeys.filter((alias) => alias !== key && alias.startsWith(key)).flatMap((alias) => index.aliases.get(alias) ?? [])
      : [];
  return [...exact.map((target) => ({ ...target, strength: 12 })), ...prefix.map((target) => ({ ...target, strength: 6 }))];
}

export type LocalResults = {
  suggestions: LocalSuggestion[];
  chip: IntentChip | null;
  parsed: ParsedQuery;
};

export function searchLocally(
  index: PreparedIndex,
  query: string,
  options: { location?: UserLocation | null; cityLabel?: string; libraryLimit?: number } = {},
): LocalResults {
  const location = options.location ?? null;
  const parsed = parseQuery(query);
  const tokens = parsed.tokens;
  const aliasHits = tokens.length ? aliasTargets(index, tokens.join(" ")) : [];

  const aliasBoost = (type: "locality" | "metro" | "library", name: string, slug?: string) => {
    let boost = 0;
    for (const hit of aliasHits) {
      if (hit.type !== type) continue;
      if (type === "library" ? hit.target === slug : hit.target.toLowerCase() === name.toLowerCase()) boost = Math.max(boost, hit.strength);
    }
    return boost;
  };

  const memo: MatchMemo = new Map();
  const tokenSounds = tokens.map(phoneticKey);
  const rank = <T extends Entry>(items: T[], extra: (item: T) => number, aliasFor: (item: T) => number, limit: number) => {
    const scored: Array<{ item: T; score: number; km: number | null }> = [];
    for (const item of items) {
      const text = tokens.length ? matchScore(tokens, item, memo, tokenSounds) : 0;
      const alias = aliasFor(item);
      if (text === 0 && alias === 0) continue;
      const { boost, km } = proximityBoost(item, location);
      scored.push({ item, score: text + alias + boost + popularityBoost(item.clicks) + extra(item), km });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  };

  const localities = tokens.length
    ? rank(index.localities, (item) => Math.min(item.count, 60) / 30, (item) => aliasBoost("locality", item.name), 3)
    : [];
  const metros = tokens.length
    ? rank(index.metros, (item) => Math.min(item.count, 30) / 30, (item) => aliasBoost("metro", item.name), 2)
    : [];
  const libraries = tokens.length
    ? rank(
        index.libraries,
        (item) => (item.verified ? 1 : 0) + item.score / 100 + (item.rating ? item.rating / 5 : 0),
        (item) => aliasBoost("library", item.name, item.slug),
        options.libraryLimit ?? 6,
      )
    : [];

  const cityLabel = options.cityLabel ?? index.city;
  const topPlace = localities[0]?.item ?? null;
  // Use the place in the chip only when the words clearly point at it.
  const chipPlace = topPlace && tokens.length && matchScore(tokens, topPlace, memo, tokenSounds) >= tokens.length * 4 ? { name: topPlace.name } : null;
  const chip = buildIntentChip(parsed, index.city, cityLabel, chipPlace);

  // Landmarks (colleges, coaching hubs, stations...) as "libraries near" targets.
  const joinedTokens = tokens.join(" ");
  const landmarks = tokens.length
    ? rank(index.landmarks, (item) => (PLACE_CATEGORY_WEIGHT[item.category] ?? 0) + (item.alts.includes(joinedTokens) ? 8 : 0), () => 0, 3).filter(
        ({ item }) => matchScore(tokens, item, memo, tokenSounds) >= tokens.length * 3,
      )
    : [];

  // PIN codes: "1100", "110009"
  const digits = query.replace(/\s+/g, "");
  const pins = /^\d{3,6}$/.test(digits)
    ? index.pins.filter((entry) => entry.pin.startsWith(digits)).slice(0, 4)
    : [];

  const nearPlaceSuggestion = (name: string, lat: number | null, lng: number | null, sublabel: string): LocalSuggestion | null =>
    lat === null || lng === null
      ? null
      : { type: "place", label: `Libraries near ${name}`, slug: toPlaceSlug(name), city: index.city, lat, lng, sublabel };

  // "library near X": resolve X against our places first, best match on top.
  const nearSuggestions: LocalSuggestion[] = [];
  if (parsed.nearTokens) {
    const nearMemo: MatchMemo = new Map();
    const nearSounds = parsed.nearTokens.map(phoneticKey);
    const candidates: Array<{ suggestion: LocalSuggestion; score: number }> = [];
    const nearJoined = parsed.nearTokens.join(" ");
    const consider = (item: Entry & { name: string; alts?: string[] }, kind: string, weight: number) => {
      let score = matchScore(parsed.nearTokens!, item, nearMemo, nearSounds);
      // Typed exactly a known short name / acronym ("dtu", "dce"): that's the place.
      if (score > 0 && item.alts?.includes(nearJoined)) score += 8;
      if (score < parsed.nearTokens!.length * 3) return;
      const suggestion = nearPlaceSuggestion(item.name, item.lat, item.lng, kind);
      if (suggestion) candidates.push({ suggestion, score: score + weight });
    };
    // "Near X" means a place: real landmarks, localities and stations beat
    // libraries that merely contain X in their name ("DTU Library").
    for (const item of index.landmarks) consider(item, PLACE_CATEGORY_LABEL[item.category] ?? "Place", 6 + (PLACE_CATEGORY_WEIGHT[item.category] ?? 0));
    for (const item of index.localities) consider(item, "Locality", 4);
    for (const item of index.metros) consider(item, "Metro station", 4.5);
    for (const item of index.libraries) consider(item, "Library", -6);
    // Aliases ("near orn")
    for (const hit of aliasTargets(index, parsed.nearTokens.join(" "))) {
      const pool = hit.type === "metro" ? index.metros : index.localities;
      const target = pool.find((item) => item.name.toLowerCase() === hit.target.toLowerCase());
      const suggestion = target ? nearPlaceSuggestion(target.name, target.lat, target.lng, hit.type === "metro" ? "Metro station" : "Locality") : null;
      if (suggestion) candidates.push({ suggestion, score: hit.strength + 4 });
    }
    candidates.sort((a, b) => b.score - a.score);
    const seen = new Set<string>();
    for (const { suggestion } of candidates) {
      if (seen.has(suggestion.label)) continue;
      seen.add(suggestion.label);
      nearSuggestions.push(suggestion);
      if (nearSuggestions.length >= 3) break;
    }
    // Not in our data: offer a lookup (our cache, then Google) on the server.
    if (nearSuggestions.length === 0 && parsed.nearText) {
      nearSuggestions.push({
        type: "lookup",
        label: `Find libraries near “${parsed.nearText}”`,
        slug: toPlaceSlug(parsed.nearText),
        city: index.city,
        query: parsed.nearText,
        sublabel: "Search this place",
      });
    }
  }

  const suggestions: LocalSuggestion[] = [
    ...(parsed.nearMe
      ? [{ type: "nearme" as const, label: "Libraries near you", slug: "near-me", city: index.city, sublabel: "Use your location" }]
      : []),
    ...nearSuggestions,
    ...pins.map((entry) => ({
      type: "pincode" as const,
      label: `PIN ${entry.pin}`,
      slug: entry.pin,
      city: index.city,
      sublabel: `${entry.count} ${entry.count === 1 ? "library" : "libraries"}`,
    })),
    ...landmarks
      .map(({ item, km }) =>
        nearPlaceSuggestion(
          item.name,
          item.lat,
          item.lng,
          [PLACE_CATEGORY_LABEL[item.category] ?? "Place", formatKm(km, location)].filter(Boolean).join(" · "),
        ),
      )
      .filter((value): value is LocalSuggestion => Boolean(value)),
    ...localities.map(({ item, km }) => ({
      type: "locality" as const,
      label: item.name,
      slug: toPlaceSlug(item.name),
      city: index.city,
      distance_km: km,
      sublabel: [`${item.count} ${item.count === 1 ? "library" : "libraries"}`, formatKm(km, location)].filter(Boolean).join(" · "),
    })),
    ...metros.map(({ item, km }) => ({
      type: "metro" as const,
      label: item.name,
      slug: toPlaceSlug(item.name),
      city: index.city,
      distance_km: km,
      sublabel: [`Metro · ${item.count} nearby`, formatKm(km, location)].filter(Boolean).join(" · "),
    })),
    ...libraries.map(({ item, km }) => ({
      type: "library" as const,
      label: item.name,
      slug: item.slug,
      city: index.city,
      distance_km: km,
      sublabel: [item.locality, item.rating ? `★ ${item.rating.toFixed(1)}` : null, formatKm(km, location)].filter(Boolean).join(" · "),
    })),
  ];

  return { suggestions, chip, parsed };
}

/** Popular localities for the empty search panel, nearest first when location is known. */
export function popularPlaces(index: PreparedIndex, location: UserLocation | null, limit = 6) {
  const candidates = index.localities.filter((item) => item.count >= 2);
  const scored = candidates.map((item) => {
    const { boost, km } = proximityBoost(item, location);
    return { item, km, score: Math.log2(1 + item.count) + popularityBoost(item.clicks) + boost * 1.5 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ item, km }) => ({
    label: item.name,
    slug: toPlaceSlug(item.name),
    city: index.city,
    sublabel: [`${item.count} libraries`, formatKm(km, location)].filter(Boolean).join(" · "),
  }));
}

/** Localities in OTHER cities matching the query (from the all-India places index). */
export function searchOtherCities(places: PlacesIndex, query: string, currentCity: string, limit = 3): LocalSuggestion[] {
  const tokens = parseQuery(query).tokens;
  if (tokens.length === 0) return [];
  const scored: Array<{ suggestion: LocalSuggestion; score: number }> = [];
  for (const [cityIndex, name, count] of places.p) {
    const [citySlug, cityName] = places.c[cityIndex] ?? [];
    if (!citySlug || citySlug === currentCity) continue;
    const words = tokenize(name);
    const score = matchScore(tokens, { key: words.join(" "), words, sounds: words.map(phoneticKey), lat: null, lng: null, clicks: 0 });
    if (score >= tokens.length * 4) {
      scored.push({
        suggestion: { type: "locality", label: name, slug: toPlaceSlug(name), city: citySlug, sublabel: `${cityName} · ${count} libraries` },
        score: score + Math.log2(1 + count),
      });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((entry) => entry.suggestion);
}

// ---------------------------------------------------------------------------
// Loading (once per city, then cached in memory)
// ---------------------------------------------------------------------------

const prepared = new Map<string, PreparedIndex>();
const loading = new Map<string, Promise<PreparedIndex | null>>();
let placesIndex: PlacesIndex | null = null;
let placesPromise: Promise<PlacesIndex | null> | null = null;

export function getLoadedIndex(city: string) {
  return prepared.get(city) ?? null;
}

export function loadSearchIndex(city: string): Promise<PreparedIndex | null> {
  const existing = prepared.get(city);
  if (existing) return Promise.resolve(existing);
  const pending = loading.get(city);
  if (pending) return pending;
  const promise = fetch(`/api/search-index/${encodeURIComponent(city)}`)
    .then((response) => (response.ok ? (response.json() as Promise<SearchIndex>) : null))
    .then((index) => {
      if (!index || index.v !== 2) return null;
      const ready = prepareIndex(index);
      prepared.set(city, ready);
      return ready;
    })
    .catch(() => null)
    .finally(() => loading.delete(city));
  loading.set(city, promise);
  return promise;
}

export function getLoadedPlaces() {
  return placesIndex;
}

export function loadPlacesIndex(): Promise<PlacesIndex | null> {
  if (placesIndex) return Promise.resolve(placesIndex);
  if (placesPromise) return placesPromise;
  placesPromise = fetch("/api/search-places")
    .then((response) => (response.ok ? (response.json() as Promise<PlacesIndex>) : null))
    .then((index) => {
      placesIndex = index && index.v === 1 ? index : null;
      return placesIndex;
    })
    .catch(() => null)
    .finally(() => {
      placesPromise = null;
    });
  return placesPromise;
}

/** Split a label into [text, highlighted] parts for the typed words. */
export function highlightParts(label: string, query: string): Array<{ text: string; match: boolean }> {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 1);
  if (tokens.length === 0) return [{ text: label, match: false }];
  const parts: Array<{ text: string; match: boolean }> = [];
  const regex = /[A-Za-z0-9]+|[^A-Za-z0-9]+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(label))) {
    const word = match[0];
    const lower = word.toLowerCase();
    const token = tokens.find((candidate) => lower.startsWith(candidate));
    if (token && /[a-z0-9]/i.test(word)) {
      parts.push({ text: word.slice(0, token.length), match: true });
      if (word.length > token.length) parts.push({ text: word.slice(token.length), match: false });
    } else {
      parts.push({ text: word, match: false });
    }
  }
  return parts;
}
