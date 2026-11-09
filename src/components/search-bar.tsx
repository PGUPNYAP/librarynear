"use client";

import { Search, MapPin, Building2, TrainFront, X, Loader2, Clock, Sparkles, TrendingUp, Landmark, Hash, SearchCheck } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useEffect, useCallback, useMemo, useSyncExternalStore } from "react";
import type { Suggestion } from "@/app/api/suggestions/route";
import { CityPicker, CITY_COOKIE } from "@/components/city-picker";
import { citySlug, DEFAULT_CITY_SLUG, slugToLabel } from "@/lib/places";
import { getAmenityByLabel, getAmenityBySlug } from "@/lib/amenities";
import {
  getLoadedIndex,
  getLoadedPlaces,
  highlightParts,
  loadPlacesIndex,
  loadSearchIndex,
  popularPlaces,
  searchLocally,
  searchOtherCities,
  parseQuery,
  type IntentChip,
} from "@/lib/client-search";
import { getApproxLocation, getCachedLocation, rememberPreciseLocation, type UserLocation } from "@/lib/user-location";
import { addRecentSearch, clearRecentSearches, readRecentSearches, type RecentSearch } from "@/lib/recent-searches";
import { logSearchEvent } from "@/lib/search-telemetry";

// First path segments that are not cities.
const NON_CITY_SEGMENTS = new Set([
  "", "blog", "about", "contact", "for-owners", "directory", "guides", "privacy", "profile", "saved",
  "admin", "sales", "studio", "staff-access", "auth", "compare", "cities", "editorial-policy", "api",
]);

const subscribeNever = () => () => {};

const LOCATION_PROMPT_KEY = "ln_location_prompt_done";

/** Offer the location prompt once, only if the browser hasn't asked yet and we have no precise fix. */
async function shouldOfferLocation(): Promise<boolean> {
  try {
    if (localStorage.getItem(LOCATION_PROMPT_KEY)) return false;
    if (!("geolocation" in navigator)) return false;
    if (getCachedLocation()?.accuracy === "precise") return false;
    const status = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    return !status || status.state === "prompt";
  } catch {
    return false;
  }
}

function readCityCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${CITY_COOKIE}=([^;]+)`));
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function useActiveCity(explicitCity?: string) {
  const pathname = usePathname();
  const segment = (pathname?.split("/")[1] ?? "").toLowerCase();
  const fromPath = segment && !NON_CITY_SEGMENTS.has(segment) ? segment : null;
  const fromCookie = useSyncExternalStore(subscribeNever, readCityCookie, () => null);
  // The homepage lists Delhi libraries, so its picker must say Delhi too.
  if (!explicitCity && (pathname === "/" || pathname === "")) return DEFAULT_CITY_SLUG;
  return explicitCity ?? fromPath ?? fromCookie ?? DEFAULT_CITY_SLUG;
}

interface SearchBarProps {
  city?: string;
  compact?: boolean;
}

type NearbyCoords = {
  lat: number;
  lng: number;
};

type NearbyPhase = "idle" | "locating" | "searching";

function NearbyGlyph({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M19.4 4.6 15.7 18a1.1 1.1 0 0 1-2.02.23l-2.4-4.5a1.1 1.1 0 0 0-.45-.45l-4.5-2.4A1.1 1.1 0 0 1 6.56 8.9L20 5.2a.56.56 0 0 0-.6-.6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatDistance(distanceKm: number) {
  if (distanceKm < 1) {
    return `${Math.max(50, Math.round(distanceKm * 1000))} m away`;
  }
  return `${distanceKm.toFixed(1)} km away`;
}

const TYPE_ICON = {
  library: Building2,
  locality: MapPin,
  metro: TrainFront,
  nearby: NearbyGlyph,
  nearme: NearbyGlyph,
  lookup: SearchCheck,
  place: Landmark,
  pincode: Hash,
};

const GROUP_LABEL = {
  library: "Libraries",
  locality: "Localities",
  metro: "Metro Stations",
  nearby: "Nearby",
  nearme: "",
  lookup: "",
  place: "Places",
  pincode: "PIN codes",
};
// "near X" queries lead with places; plain queries lead with localities.
const NEAR_ORDER = ["nearme", "nearby", "lookup", "place", "pincode", "locality", "metro", "library"] as const;
const DEFAULT_ORDER = ["nearme", "nearby", "lookup", "pincode", "locality", "metro", "place", "library"] as const;
type OrderedType = (typeof NEAR_ORDER)[number];

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 220;
const MAX_CACHED_QUERIES = 25;

function groupSuggestions(suggestions: Suggestion[]) {
  const groups: Record<string, Suggestion[]> = {};
  for (const s of suggestions) {
    if (!groups[s.type]) groups[s.type] = [];
    groups[s.type].push(s);
  }
  return groups;
}

export function SearchBar({ city: cityProp, compact = false }: SearchBarProps) {
  const city = useActiveCity(cityProp);
  const router = useRouter();
  const currentParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState(currentParams.get("q") ?? "");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyPhase, setNearbyPhase] = useState<NearbyPhase>("idle");
  const [open, setOpen] = useState(false);
  // While typing, the input expands over the city pill.
  const [focused, setFocused] = useState(false);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [nearbyMode, setNearbyMode] = useState(currentParams.get("nearby") === "1");
  const [nearbyCoords, setNearbyCoords] = useState<NearbyCoords | null>(() => {
    const lat = Number(currentParams.get("lat"));
    const lng = Number(currentParams.get("lng"));
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const cacheRef = useRef<Map<string, Suggestion[]>>(new Map());
  const prefetchedRoutesRef = useRef<Set<string>>(new Set());
  const [chip, setChip] = useState<IntentChip | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [recents, setRecents] = useState<RecentSearch[]>([]);
  const [indexReady, setIndexReady] = useState(false);
  // One-time, non-blocking "show nearest first?" offer inside the search panel.
  const [locationPrompt, setLocationPrompt] = useState(false);
  const [locating, setLocating] = useState(false);

  // Instant search: fetch this city's small index once the page is idle.
  useEffect(() => {
    if (!city) return;
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    const run = () =>
      void loadSearchIndex(city).then((ready) => {
        if (ready) setIndexReady(true);
      });
    if (idle) {
      const handle = idle(run);
      return () => (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(handle);
    }
    const timer = window.setTimeout(run, 1200);
    return () => window.clearTimeout(timer);
  }, [city]);

  /** Answer from the in-browser index. Returns false when it can't (not loaded / no hits). */
  const suggestLocally = useCallback(
    (q: string) => {
      const index = getLoadedIndex(city);
      const trimmed = q.trim();
      if (!index || trimmed.length === 0) return false;
      const location = userLocation ?? getCachedLocation();
      const { suggestions: local, chip: nextChip } = searchLocally(index, trimmed, {
        location,
        cityLabel: slugToLabel(city),
      });
      let results = local as Suggestion[];
      // Strong matches in other cities too (e.g. "Andheri" while browsing Delhi).
      if (trimmed.length >= 3) {
        const places = getLoadedPlaces();
        if (places) {
          const others = searchOtherCities(places, trimmed, city, results.length < 3 ? 3 : 2) as Suggestion[];
          results = [...results, ...others];
        } else {
          void loadPlacesIndex().then(() => {
            if (inputRef.current?.value === q) suggestLocallyRef.current?.(q);
          });
        }
      }
      if (results.length === 0 && !nextChip) return false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
      setLoading(false);
      setSuggestions(results);
      setChip(nextChip);
      setOpen(true);
      setHighlightedIndex(-1);
      setLocationError(null);
      return true;
    },
    [city, userLocation],
  );
  const suggestLocallyRef = useRef<((q: string) => boolean) | null>(null);
  useEffect(() => {
    suggestLocallyRef.current = suggestLocally;
  }, [suggestLocally]);

  const fetchSuggestions = useCallback(async (q: string) => {
    const normalizedQuery = q.trim();
    if (normalizedQuery.length < MIN_QUERY_LENGTH) {
      abortRef.current?.abort();
      setLoading(false);
      setSuggestions([]);
      setOpen(false);
      setLocationError(null);
      return;
    }

    const cacheKey = `${city}:${normalizedQuery.toLowerCase()}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setSuggestions(cached);
      setOpen(cached.length > 0);
      setHighlightedIndex(-1);
      setLoading(false);
      setLocationError(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;
    setLoading(true);

    try {
      const startedAt = performance.now();
      const res = await fetch(
        `/api/suggestions?q=${encodeURIComponent(normalizedQuery)}&city=${encodeURIComponent(city)}`,
        { signal: controller.signal },
      );
      if (!res.ok) {
        throw new Error(`Suggestion request failed with ${res.status}`);
      }
      const json = await res.json();
      if (requestId !== requestIdRef.current) {
        return;
      }

      const nextSuggestions = json.suggestions ?? [];
      cacheRef.current.set(cacheKey, nextSuggestions);
      if (cacheRef.current.size > MAX_CACHED_QUERIES) {
        const oldestKey = cacheRef.current.keys().next().value;
        if (oldestKey) {
          cacheRef.current.delete(oldestKey);
        }
      }

      if (process.env.NODE_ENV !== "production") {
        console.debug(
          `[perf] suggestions client total=${(performance.now() - startedAt).toFixed(1)}ms q="${normalizedQuery}" count=${nextSuggestions.length}`,
          res.headers.get("Server-Timing") ? `server=${res.headers.get("Server-Timing")}` : "",
        );
      }

      setSuggestions(nextSuggestions);
      setOpen(nextSuggestions.length > 0);
      setHighlightedIndex(-1);
      setLocationError(null);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      if (requestId !== requestIdRef.current) {
        return;
      }
      setSuggestions([]);
      setOpen(false);
      setHighlightedIndex(-1);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [city]);

  const fetchNearbySuggestions = useCallback(async (latitude: number, longitude: number) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;
    setNearbyLoading(true);
    setNearbyPhase("searching");
    setLoading(false);
    setLocationError(null);

    const roundedLat = latitude.toFixed(3);
    const roundedLng = longitude.toFixed(3);
    const cacheKey = `nearby:${city}:${roundedLat}:${roundedLng}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setSuggestions(cached);
      setOpen(cached.length > 0);
      setHighlightedIndex(-1);
      setNearbyLoading(false);
      setNearbyPhase("idle");
      return;
    }

    try {
      const startedAt = performance.now();
      const res = await fetch(
        `/api/suggestions?city=${encodeURIComponent(city)}&lat=${encodeURIComponent(roundedLat)}&lng=${encodeURIComponent(roundedLng)}`,
        { signal: controller.signal },
      );
      if (!res.ok) {
        throw new Error(`Nearby suggestion request failed with ${res.status}`);
      }

      const json = await res.json();
      if (requestId !== requestIdRef.current) {
        return;
      }

      const nextSuggestions = (json.suggestions ?? []) as Suggestion[];
      cacheRef.current.set(cacheKey, nextSuggestions);
      if (cacheRef.current.size > MAX_CACHED_QUERIES) {
        const oldestKey = cacheRef.current.keys().next().value;
        if (oldestKey) {
          cacheRef.current.delete(oldestKey);
        }
      }

      if (process.env.NODE_ENV !== "production") {
        console.debug(
          `[perf] nearby suggestions client total=${(performance.now() - startedAt).toFixed(1)}ms count=${nextSuggestions.length}`,
          res.headers.get("Server-Timing") ? `server=${res.headers.get("Server-Timing")}` : "",
        );
      }

      setSuggestions(nextSuggestions);
      setOpen(nextSuggestions.length > 0);
      setHighlightedIndex(-1);
      if (nextSuggestions.length === 0) {
        setLocationError("No nearby libraries found for your location.");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      if (requestId !== requestIdRef.current) {
        return;
      }
      setSuggestions([]);
      setOpen(false);
      setHighlightedIndex(-1);
      setLocationError("Unable to load nearby libraries right now.");
    } finally {
      if (requestId === requestIdRef.current) {
        setNearbyLoading(false);
        setNearbyPhase("idle");
      }
    }
  }, [city]);

  const navigateToNearbyResults = useCallback((coords: NearbyCoords) => {
    const params = new URLSearchParams();
    params.set("nearby", "1");
    params.set("lat", coords.lat.toFixed(4));
    params.set("lng", coords.lng.toFixed(4));
    params.set("q", "Nearby");
    const locality = currentParams.get("locality");
    if (locality) params.set("locality", locality);
    router.push(`/${city}/libraries?${params.toString()}`);
  }, [city, currentParams, router]);

  const getSuggestionHref = useCallback((suggestion: Suggestion) => {
    if (suggestion.type === "place" && typeof suggestion.lat === "number" && typeof suggestion.lng === "number") {
      const params = new URLSearchParams({
        nearby: "1",
        lat: suggestion.lat.toFixed(5),
        lng: suggestion.lng.toFixed(5),
        near: suggestion.label.replace(/^Libraries near /, ""),
      });
      return `/${citySlug(suggestion.city)}/libraries?${params.toString()}`;
    }
    if (suggestion.type === "pincode") return `/${citySlug(suggestion.city)}/pincode/${suggestion.slug}`;
    if (suggestion.type === "nearme" || suggestion.type === "lookup") return "";
    if (suggestion.type === "library" || suggestion.type === "nearby") {
      return `/${suggestion.city}/library/${suggestion.slug}`;
    }

    if (suggestion.type === "locality" || suggestion.type === "metro") {
      return `/${suggestion.city}/${suggestion.type}/${suggestion.slug}`;
    }

    const params = new URLSearchParams();
    params.set("q", suggestion.label);
    return `/${suggestion.city}/libraries?${params.toString()}`;
  }, []);

  const prefetchSuggestionRoute = useCallback((suggestion?: Suggestion) => {
    if (!suggestion) return;
    const href = getSuggestionHref(suggestion);
    if (!href || prefetchedRoutesRef.current.has(href)) {
      return;
    }

    prefetchedRoutesRef.current.add(href);
    router.prefetch(href);
  }, [getSuggestionHref, router]);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    if (nearbyMode) {
      setNearbyMode(false);
      setNearbyCoords(null);
    }
    setHighlightedIndex(-1);
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Instant path: no debounce, no network.
    if (suggestLocally(val)) return;
    if (!val.trim()) {
      setSuggestions([]);
      setChip(null);
      setOpen(false);
      return;
    }
    setChip(null);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), DEBOUNCE_MS);
    // If the index finishes loading while the user waits, answer from it.
    void loadSearchIndex(city).then(() => {
      if (inputRef.current?.value === val) suggestLocally(val);
    });
  }

  function navigate(q: string) {
    setOpen(false);
    setHighlightedIndex(-1);

    if (q && !nearbyMode) {
      const parsed = parseQuery(q);
      if (parsed.nearMe && parsed.tokens.length === 0) {
        handleNearMeClick();
        return;
      }
      if (parsed.nearText) {
        const best = flatSuggestions.find((s) => s.type === "place");
        if (best) {
          handleSuggestionClick(best, 0);
          return;
        }
        void resolvePlaceAndGo(parsed.nearText);
        return;
      }
    }

    if (q) {
      const normalizedQ = q.trim().toLowerCase();
      // Check if the exact query matches a known locality or metro suggestion
      const exactMatch = flatSuggestions.find(
        (s) =>
          (s.type === "locality" || s.type === "metro") &&
          s.label.toLowerCase() === normalizedQ
      );
      
      if (exactMatch) {
        router.push(`/${citySlug(exactMatch.city)}/${exactMatch.type}/${exactMatch.slug}`);
        return;
      }
    }

    // "ac", "wifi", "libraries with locker" -> amenity filter instead of text search.
    if (q && !nearbyMode) {
      const cleaned = q.trim().toLowerCase().replace(/^(libraries|library)\s+(with|having)\s+/, "");
      const amenity = getAmenityByLabel(cleaned) ?? getAmenityBySlug(cleaned.replace(/\s+/g, "-"));
      if (amenity) {
        router.push(`/${city}/libraries?amenities=${encodeURIComponent(amenity.label)}`);
        return;
      }
    }

    const params = new URLSearchParams();
    if (q) params.set("q", q);

    // We intentionally DO NOT preserve the `locality` parameter here.
    // When a user initiates a new text search from the top bar, it acts as a fresh 
    // global search. If they wanted a specific locality, they would select it 
    // from the suggestions dropdown (which sets locality via `getSuggestionHref`).

    if (nearbyMode && nearbyCoords) {
      params.set("nearby", "1");
      params.set("lat", nearbyCoords.lat.toFixed(4));
      params.set("lng", nearbyCoords.lng.toFixed(4));
      params.set("q", "Nearby");
    }
    // Instant results (rendered in the browser) when the city index is ready;
    // the server-rendered listing otherwise (and for "near me").
    if (q && !(nearbyMode && nearbyCoords) && getLoadedIndex(city)) {
      router.push(`/${city}/search?q=${encodeURIComponent(q.trim())}`);
      return;
    }
    router.push(`/${city}/libraries?${params.toString()}`);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim() && !nearbyMode) {
      logSearchEvent({ query, city, result_count: suggestions.length, source: "submit" });
    }
    navigate(query);
  }

  function finishLocationPrompt() {
    try {
      localStorage.setItem(LOCATION_PROMPT_KEY, "1");
    } catch {
      // storage blocked
    }
    setLocationPrompt(false);
  }

  function allowPreciseLocation() {
    if (!navigator.geolocation) return finishLocationPrompt();
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        rememberPreciseLocation(position.coords.latitude, position.coords.longitude);
        setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: "precise" });
        setLocating(false);
        finishLocationPrompt();
      },
      () => {
        setLocating(false);
        finishLocationPrompt();
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 },
    );
  }

  /** Ask the server (our data, cache, then Google) where a place is, then open libraries near it. */
  async function resolvePlaceAndGo(placeText: string) {
    setLoading(true);
    setLocationError(null);
    try {
      const response = await fetch(`/api/places/resolve?city=${encodeURIComponent(city)}&q=${encodeURIComponent(placeText)}`);
      const place = (await response.json()) as { label?: string; lat?: number; lng?: number; error?: string };
      if (!response.ok || typeof place.lat !== "number" || typeof place.lng !== "number") {
        setLocationError(place.error === "Place not found in this city" ? `Couldn't find “${placeText}” in ${slugToLabel(city)}.` : `Couldn't find “${placeText}”.`);
        return;
      }
      const href = getSuggestionHref({ type: "place", label: `Libraries near ${place.label}`, slug: "", city, lat: place.lat, lng: place.lng } as Suggestion);
      setRecents(addRecentSearch({ label: `Libraries near ${place.label}`, href, type: "place", city }));
      setOpen(false);
      router.push(href);
    } catch {
      setLocationError("Couldn't look that place up. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleSuggestionClick(s: Suggestion, position = -1) {
    if (s.type === "nearme") {
      handleNearMeClick();
      return;
    }
    if (s.type === "lookup") {
      logSearchEvent({ query, city, result_count: 0, source: "lookup" });
      void resolvePlaceAndGo(s.query ?? query);
      return;
    }
    const href = getSuggestionHref(s);
    if (s.type !== "nearby") {
      logSearchEvent({
        query,
        city,
        result_count: suggestions.length,
        clicked_slug: s.slug,
        clicked_type: s.type,
        clicked_label: s.label,
        position,
        source: getLoadedIndex(city) ? "local" : "server",
      });
      setRecents(addRecentSearch({ label: s.label, href, type: s.type, city: citySlug(s.city) }));
    }
    router.push(href);
    setOpen(false);
    setHighlightedIndex(-1);
  }

  function handleChipClick(target: IntentChip) {
    logSearchEvent({ query, city, result_count: suggestions.length, source: "chip" });
    setRecents(addRecentSearch({ label: target.label, href: target.href, type: "filter", city }));
    router.push(target.href);
    setOpen(false);
  }

  function clearInput() {
    abortRef.current?.abort();
    setLoading(false);
    setNearbyLoading(false);
    setNearbyPhase("idle");
    setLocationError(null);
    setNearbyMode(false);
    setNearbyCoords(null);
    setQuery("");
    setSuggestions([]);
    setOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  }

  function handleNearMeClick() {
    if (!navigator.geolocation) {
      setLocationError("Location is not supported in this browser.");
      setOpen(false);
      return;
    }

    setNearbyLoading(true);
    setNearbyPhase("locating");
    setLocationError(null);
    setOpen(false);
    setHighlightedIndex(-1);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: Number(position.coords.latitude.toFixed(4)),
          lng: Number(position.coords.longitude.toFixed(4)),
        };
        rememberPreciseLocation(coords.lat, coords.lng);
        setUserLocation({ lat: coords.lat, lng: coords.lng, accuracy: "precise" });
        setNearbyMode(true);
        setNearbyCoords(coords);
        setQuery("Nearby");
        void fetchNearbySuggestions(coords.lat, coords.lng);
        navigateToNearbyResults(coords);
      },
      (error) => {
        // Fall back to the approximate (IP-based) location so "near me" still works.
        void getApproxLocation().then((approx) => {
          if (approx) {
            setNearbyLoading(false);
            setNearbyPhase("idle");
            const params = new URLSearchParams({
              nearby: "1",
              lat: approx.lat.toFixed(4),
              lng: approx.lng.toFixed(4),
              near: "your area (approximate)",
            });
            router.push(`/${city}/libraries?${params.toString()}`);
          }
        });
        const message =
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. Showing libraries near your approximate area instead."
            : "Unable to get your exact location. Showing your approximate area instead.";
        setLocationError(message);
        setSuggestions([]);
        setOpen(false);
        setHighlightedIndex(-1);
        setNearbyLoading(false);
        setNearbyPhase("idle");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      },
    );
  }

  // Close on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setHighlightedIndex(-1);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    const nextNearbyMode = currentParams.get("nearby") === "1";
    const lat = Number(currentParams.get("lat"));
    const lng = Number(currentParams.get("lng"));
    const nextCoords = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    const nextQuery = nextNearbyMode ? "Nearby" : currentParams.get("q") ?? "";

    setNearbyMode((current) => (current === nextNearbyMode ? current : nextNearbyMode));
    setNearbyCoords((current) => {
      if (!nextCoords && !current) return current;
      if (!nextCoords) return null;
      if (current?.lat === nextCoords.lat && current?.lng === nextCoords.lng) return current;
      return nextCoords;
    });
    setQuery((currentQuery) => (currentQuery === nextQuery ? currentQuery : nextQuery));
    if (!nextNearbyMode) {
      setNearbyPhase("idle");
    }
  }, [currentParams]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const grouped = groupSuggestions(suggestions);
  const orderedTypes: readonly OrderedType[] = useMemo(
    () => (parseQuery(query).nearText ? NEAR_ORDER : DEFAULT_ORDER),
    [query],
  );
  const flatSuggestions = useMemo(
    () => orderedTypes.flatMap((type) => grouped[type] ?? []),
    [grouped, orderedTypes],
  );

  useEffect(() => {
    if (!open) return;
    flatSuggestions.slice(0, 3).forEach((suggestion) => {
      prefetchSuggestionRoute(suggestion);
    });
  }, [flatSuggestions, open, prefetchSuggestionRoute]);

  useEffect(() => {
    if (!open) {
      setHighlightedIndex(-1);
      return;
    }

    if (flatSuggestions.length === 0) {
      setHighlightedIndex(-1);
    }
  }, [flatSuggestions, highlightedIndex, open]);

  useEffect(() => {
    if (highlightedIndex < 0) return;
    prefetchSuggestionRoute(flatSuggestions[highlightedIndex]);
  }, [flatSuggestions, highlightedIndex, prefetchSuggestionRoute]);

  const showEmptyPanel = focused && !query.trim() && !nearbyMode;
  const popular = useMemo(() => {
    void indexReady;
    const index = getLoadedIndex(city);
    return index ? popularPlaces(index, userLocation, 6) : [];
  }, [city, userLocation, indexReady]);

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || flatSuggestions.length === 0) {
      if (e.key === "ArrowDown" && suggestions.length > 0) {
        e.preventDefault();
        setOpen(true);
        setHighlightedIndex(0);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((current) => (current + 1) % flatSuggestions.length);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((current) => (current <= 0 ? flatSuggestions.length - 1 : current - 1));
      return;
    }

    if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      handleSuggestionClick(flatSuggestions[highlightedIndex], highlightedIndex);
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setHighlightedIndex(-1);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <form
        onSubmit={handleSearch}
        className={`flex items-center w-full bg-white rounded-full border border-border transition-shadow ${
          compact
            ? "shadow-none pl-1.5 md:pl-2 pr-1.5 py-1.5"
            : "shadow-[0_3px_15px_-2px_rgba(0,0,0,0.12)] hover:shadow-[0_4px_22px_-2px_rgba(0,0,0,0.16)] pl-1.5 md:pl-2 pr-1.5 md:pr-2 py-1.5 md:py-2 gap-0.5 md:gap-0"
        }`}
      >
        <button
          type="submit"
          className={`${compact ? "h-8 w-8 md:h-10 md:w-10" : "h-9 w-9 md:h-12 md:w-12"} rounded-full bg-primary text-white flex items-center justify-center shrink-0 hover:bg-primary/90 transition-colors shadow-sm mr-1 md:mr-3`}
          aria-label="Search"
        >
          {loading ? (
            <Loader2 className="h-[15px] w-[15px] md:h-5 md:w-5 animate-spin" strokeWidth={3} />
          ) : (
            <Search className="h-[15px] w-[15px] md:h-5 md:w-5" strokeWidth={3} />
          )}
        </button>
        <div
          aria-hidden={focused}
          className={`flex shrink-0 items-center transition-[max-width,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            focused
              ? "pointer-events-none max-w-0 -translate-x-2 overflow-hidden opacity-0"
              : "max-w-[200px] translate-x-0 opacity-100"
          }`}
        >
          <CityPicker citySlug={city} cityLabel={slugToLabel(city)} compact={compact} />
          <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-border md:mx-2 md:h-6" />
        </div>
        <div className={`flex-1 flex flex-col justify-center min-w-0 ${compact ? "" : "md:py-1"}`}>
          {!compact ? <span className="hidden md:block text-[10px] font-bold tracking-wider text-black md:text-[11px]">Where in {slugToLabel(city)}</span> : null}
          <div className={`${compact ? "min-h-8" : "min-h-10 md:min-h-8"} flex items-center gap-2`}>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              onFocus={() => {
                if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
                setFocused(true);
                setRecents(readRecentSearches());
                void shouldOfferLocation().then(setLocationPrompt);
                void loadSearchIndex(city).then((ready) => {
                  if (ready) setIndexReady(true);
                });
                // Never prompts: precise fix from an earlier "Near me", else IP-based.
                void getApproxLocation().then((location) => {
                  if (location) setUserLocation(location);
                });
                if (suggestions.length > 0 || chip) setOpen(true);
              }}
              onBlur={() => {
                // Small delay so a tap on a suggestion still registers.
                blurTimerRef.current = setTimeout(() => setFocused(false), 150);
              }}
              placeholder={
                focused
                  ? `Search in ${slugToLabel(city)}…`
                  : compact
                    ? "Search libraries"
                    : "Search area, metro or library"
              }
              aria-label={`Search libraries in ${slugToLabel(city)}`}
              className={`flex-1 bg-transparent pl-1 outline-none placeholder:text-muted-foreground truncate min-w-0 md:pl-0 ${
                compact ? "text-[13px] font-medium" : "text-[13px] md:text-sm"
              }`}
              autoComplete="off"
            />
            {query && (
              <button
                type="button"
                onClick={clearInput}
                className="shrink-0 text-muted-foreground hover:text-black transition-colors"
                aria-label="Clear"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="ml-1 flex shrink-0 items-center md:ml-3">
          <button
            type="button"
            onClick={handleNearMeClick}
            disabled={nearbyLoading}
            aria-label="Find libraries near me"
            aria-pressed={nearbyMode}
            title="Find libraries near me"
            className={`group relative flex items-center justify-center gap-1.5 overflow-hidden rounded-full border font-semibold transition-all duration-200 active:scale-95 ${
              compact ? "h-8 w-8 md:h-9 md:w-auto md:px-3 md:text-[13px]" : "h-9 w-9 md:h-11 md:w-auto md:px-4 md:text-sm"
            } ${
              nearbyMode
                ? "border-primary bg-primary text-white shadow-md shadow-primary/30"
                : "border-primary/15 bg-gradient-to-br from-primary/[0.08] via-white to-primary/[0.12] text-primary hover:border-primary/35 hover:shadow-sm hover:shadow-primary/15"
            } ${nearbyLoading ? "cursor-wait" : ""}`}
          >
            {nearbyLoading ? (
              <span aria-hidden="true" className="absolute inset-0 animate-pulse bg-primary/10" />
            ) : null}
            <span className="relative flex h-5 w-5 items-center justify-center">
              {nearbyLoading ? (
                <>
                  <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-primary/30" />
                  <NearbyGlyph className="relative h-[17px] w-[17px]" />
                </>
              ) : (
                <NearbyGlyph
                  className={`h-[17px] w-[17px] transition-transform duration-300 ease-out group-hover:-translate-y-px group-hover:translate-x-px group-hover:-rotate-12 ${
                    nearbyMode ? "fill-white/25" : "fill-primary/15"
                  }`}
                />
              )}
            </span>
            <span className="relative hidden whitespace-nowrap md:inline">
              {nearbyPhase === "locating"
                ? "Locating…"
                : nearbyPhase === "searching"
                  ? "Finding…"
                  : nearbyMode
                    ? "Nearby"
                    : "Near me"}
            </span>
          </button>
        </div>
      </form>

      {/* SUGGESTIONS DROPDOWN */}
      {showEmptyPanel ? (
        <div
          onMouseDown={(event) => event.preventDefault()}
          className="absolute top-[calc(100%+8px)] left-0 right-0 z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-border bg-white py-2 shadow-[0_8px_30px_-4px_rgba(0,0,0,0.18)]"
        >
          {locationPrompt ? (
            <div className="mx-3 mb-2 rounded-xl border border-primary/15 bg-primary/[0.04] p-3">
              <p className="text-sm font-semibold text-black">Show the nearest libraries first?</p>
              <p className="mt-0.5 text-xs text-muted-foreground">We use your location only to sort results. It isn&apos;t saved on our servers.</p>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={allowPreciseLocation}
                  disabled={locating}
                  className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {locating ? "Locating…" : "Use my location"}
                </button>
                <button type="button" onClick={finishLocationPrompt} className="rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-black">
                  Not now
                </button>
              </div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={handleNearMeClick}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/60"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <NearbyGlyph className="h-4 w-4 fill-primary/15" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-black">Libraries near me</span>
              <span className="block text-[11px] text-muted-foreground">Use your current location</span>
            </span>
          </button>

          {recents.length > 0 ? (
            <div className="mt-1">
              <div className="flex items-center justify-between px-4 pb-1 pt-2">
                <p className="text-xs font-semibold text-muted-foreground">Recent</p>
                <button
                  type="button"
                  onClick={() => {
                    clearRecentSearches();
                    setRecents([]);
                  }}
                  className="text-xs font-medium text-muted-foreground hover:text-black"
                >
                  Clear
                </button>
              </div>
              {recents.slice(0, 5).map((recent) => (
                <button
                  key={recent.href}
                  type="button"
                  onClick={() => {
                    setRecents(addRecentSearch(recent));
                    router.push(recent.href);
                    setFocused(false);
                    inputRef.current?.blur();
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted/60"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                    <Clock className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-black">{recent.label}</span>
                  {recent.city && recent.city !== city ? (
                    <span className="shrink-0 text-xs capitalize text-muted-foreground">{slugToLabel(recent.city)}</span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}

          {popular.length > 0 ? (
            <div className="mt-1">
              <p className="px-4 pb-1 pt-2 text-xs font-semibold text-muted-foreground">
                {userLocation?.accuracy === "precise" ? "Popular near you" : `Popular in ${slugToLabel(city)}`}
              </p>
              {popular.map((place) => (
                <button
                  key={place.slug}
                  type="button"
                  onClick={() =>
                    handleSuggestionClick({ type: "locality", label: place.label, slug: place.slug, city: place.city } as Suggestion)
                  }
                  className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted/60"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                    <TrendingUp className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-black">{place.label}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{place.sublabel}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {!showEmptyPanel && open && (suggestions.length > 0 || chip) && (
        <div
          onMouseDown={(event) => event.preventDefault()}
          className="absolute top-[calc(100%+8px)] left-0 right-0 z-50 max-h-[70vh] overflow-y-auto bg-white rounded-2xl shadow-[0_8px_30px_-4px_rgba(0,0,0,0.18)] border border-border"
        >
          {chip ? (
            <div className="px-3 pt-3">
              <button
                type="button"
                onClick={() => handleChipClick(chip)}
                className="flex w-full items-center gap-3 rounded-xl border border-primary/20 bg-primary/[0.04] px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.07]"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Sparkles className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-black">{chip.label}</span>
                <span aria-hidden="true" className="text-primary">→</span>
              </button>
            </div>
          ) : null}
          {(() => {
            let runningIndex = -1;
            return orderedTypes.map((type) => {
              const items = grouped[type];
              if (!items?.length) return null;
              const Icon = TYPE_ICON[type];
              return (
                <div key={type}>
                  {GROUP_LABEL[type] ? (
                    <div className="px-4 pt-3 pb-1">
                      <p className="text-xs font-semibold text-muted-foreground">{GROUP_LABEL[type]}</p>
                    </div>
                  ) : (
                    <div className="pt-2" />
                  )}
                  {items.map((s, i) => (
                    (() => {
                      runningIndex += 1;
                      const itemIndex = runningIndex;
                      const isActive = itemIndex === highlightedIndex;
                      return (
                        <button
                          key={i}
                          type="button"
                          onMouseEnter={() => {
                            prefetchSuggestionRoute(s);
                            setHighlightedIndex(itemIndex);
                          }}
                          onClick={() => handleSuggestionClick(s, itemIndex)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left ${isActive ? "bg-muted/80" : "hover:bg-muted/60"
                            }`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isActive ? "bg-white shadow-sm" : "bg-muted"
                            }`}>
                            <Icon className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-black truncate">
                              {highlightParts(s.label, query).map((part, partIndex) =>
                                part.match ? (
                                  <strong key={partIndex} className="font-semibold">{part.text}</strong>
                                ) : (
                                  <span key={partIndex}>{part.text}</span>
                                ),
                              )}
                            </div>
                            {s.sublabel ? (
                              <div className="truncate text-[11px] text-muted-foreground">{s.sublabel}</div>
                            ) : null}
                            {s.type === "nearby" && typeof s.distance_km === "number" && (
                              <div className="text-[11px] text-muted-foreground">
                                {formatDistance(s.distance_km)}
                              </div>
                            )}
                          </div>
                          {citySlug(s.city) !== city ? (
                            <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                              {slugToLabel(citySlug(s.city))}
                            </span>
                          ) : null}
                        </button>
                      );
                    })()
                  ))}
                </div>
              );
            });
          })()}
          <div className="px-4 py-2.5 border-t border-border/50">
            <button
              type="button"
              onClick={() => (nearbyMode && nearbyCoords ? navigate("Nearby") : navigate(query))}
              className="text-sm text-primary font-semibold hover:underline flex items-center gap-1.5"
            >
              {nearbyMode ? <NearbyGlyph className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />}
              {nearbyMode ? "Show nearby libraries" : `Search all results for "${query}"`}
            </button>
          </div>
        </div>
      )}
      {locationError && (
        <p className="mt-2 px-2 text-xs text-muted-foreground">{locationError}</p>
      )}
    </div>
  );
}
