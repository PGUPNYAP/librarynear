"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { CityIcon } from "@/components/city-icon";

export type PickerCity = { name: string; slug: string; state: string | null; libraryCount: number };

const POPULAR = ["delhi", "mumbai", "bengaluru", "hyderabad", "chennai", "kolkata", "noida", "gurugram", "pune", "lucknow"];
export const CITY_COOKIE = "ln_city";

let citiesPromise: Promise<PickerCity[]> | null = null;
function loadCities(): Promise<PickerCity[]> {
  if (!citiesPromise) {
    citiesPromise = fetch("/api/cities")
      .then((response) => (response.ok ? response.json() : { cities: [] }))
      .then((json) => (json.cities ?? []) as PickerCity[])
      .catch(() => {
        citiesPromise = null;
        return [];
      });
  }
  return citiesPromise;
}

export function rememberCity(slug: string) {
  try {
    document.cookie = `${CITY_COOKIE}=${encodeURIComponent(slug)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  } catch {
    // cookies blocked; picker still works for this page view
  }
}

const MOBILE_QUERY = "(max-width: 767px)";
function subscribeMedia(callback: () => void) {
  const media = window.matchMedia(MOBILE_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
function useIsMobile() {
  return useSyncExternalStore(subscribeMedia, () => window.matchMedia(MOBILE_QUERY).matches, () => false);
}

/**
 * City pill in the search bar: city name + subtle chevron. Opens a searchable
 * list of cities: a dropdown on desktop, a bottom sheet on phones (rendered on
 * <body> so sticky/blurred parents can't clip it).
 */
export function CityPicker({
  citySlug,
  cityLabel,
  compact = false,
  onSelect,
}: {
  citySlug: string;
  cityLabel: string;
  compact?: boolean;
  onSelect?: (city: PickerCity) => void;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [cities, setCities] = useState<PickerCity[]>([]);
  const [filter, setFilter] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    loadCities().then((list) => active && setCities(list));
    // On phones, don't pop the keyboard up over the list straight away.
    const timer = isMobile ? undefined : window.setTimeout(() => inputRef.current?.focus(), 30);
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    if (isMobile) document.body.style.overflow = "hidden";
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, isMobile]);

  const { popular, rest } = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const matching = query
      ? cities.filter((city) => city.name.toLowerCase().includes(query) || (city.state ?? "").toLowerCase().includes(query))
      : cities;
    if (query) return { popular: [] as PickerCity[], rest: matching };
    const popularList = POPULAR.map((slug) => matching.find((city) => city.slug === slug)).filter(Boolean) as PickerCity[];
    return { popular: popularList, rest: matching.filter((city) => !POPULAR.includes(city.slug)) };
  }, [cities, filter]);

  function choose(city: PickerCity) {
    rememberCity(city.slug);
    setOpen(false);
    setFilter("");
    if (onSelect) onSelect(city);
    else router.push(`/${city.slug}`);
  }

  const renderCity = (city: PickerCity) => {
    const selected = city.slug === citySlug;
    return (
      <li key={city.slug}>
        <button
          type="button"
          onClick={() => choose(city)}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors active:bg-muted md:py-2.5 md:hover:bg-muted/70 ${
            selected ? "bg-primary/5" : ""
          }`}
        >
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              selected ? "bg-primary/10 text-primary" : "bg-muted text-black/70"
            }`}
          >
            <CityIcon slug={city.slug} className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold text-black md:text-sm">{city.name}</span>
            {city.state && city.state !== city.name ? (
              <span className="block truncate text-xs text-muted-foreground">{city.state}</span>
            ) : null}
          </span>
          {selected ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
        </button>
      </li>
    );
  };

  // Popular cities as a tappable icon grid on phones; a list on desktop.
  const renderPopularGrid = () => (
    <ul className="grid grid-cols-4 gap-2 px-1">
      {popular.slice(0, 8).map((city) => {
        const selected = city.slug === citySlug;
        return (
          <li key={city.slug}>
            <button
              type="button"
              onClick={() => choose(city)}
              className={`flex w-full flex-col items-center gap-1.5 rounded-2xl border px-1 py-3 transition-colors active:bg-muted ${
                selected ? "border-primary bg-primary/5 text-primary" : "border-border text-black/75"
              }`}
            >
              <CityIcon slug={city.slug} className="h-6 w-6" />
              <span className={`w-full truncate text-center text-xs font-medium ${selected ? "text-primary" : "text-black"}`}>
                {city.name}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  const list = (
    <>
      {cities.length === 0 ? (
        <p className="px-3 py-8 text-center text-sm text-muted-foreground">Loading cities…</p>
      ) : (
        <>
          {popular.length > 0 ? (
            <>
              <p className="px-3 pb-2 pt-2 text-xs font-semibold text-muted-foreground">Popular</p>
              {isMobile ? renderPopularGrid() : <ul>{popular.map(renderCity)}</ul>}
            </>
          ) : null}
          {rest.length > 0 ? (
            <>
              <p className="px-3 pb-1 pt-4 text-xs font-semibold text-muted-foreground">
                {filter ? "Matching cities" : "All cities"}
              </p>
              <ul>{rest.map(renderCity)}</ul>
            </>
          ) : null}
          {popular.length === 0 && rest.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">No city matches “{filter}”.</p>
          ) : null}
        </>
      )}
    </>
  );

  const searchField = (
    <label className="flex items-center gap-2 rounded-full border border-border bg-white px-4 py-2.5 focus-within:border-black md:px-3 md:py-2">
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Search cities"
        className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
        aria-label="Search cities"
        enterKeyHint="search"
      />
      {filter ? (
        <button type="button" onClick={() => setFilter("")} aria-label="Clear" className="text-muted-foreground">
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </label>
  );

  return (
    <div className="relative min-w-0 shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`City: ${cityLabel}. Change city`}
        className={`flex items-center gap-1 rounded-full text-left transition-colors hover:bg-muted/70 ${
          compact ? "px-2 py-1.5" : "px-2 py-1.5 md:px-3 md:py-2"
        }`}
      >
        <span className="max-w-[84px] truncate text-[13px] font-semibold text-black sm:max-w-[120px] md:text-sm">{cityLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground/70 transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={2}
        />
      </button>

      {open && !isMobile ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Choose a city"
          className="absolute left-0 top-[calc(100%+12px)] z-[60] w-[360px] rounded-3xl border border-border bg-white p-4 shadow-[0_8px_30px_-4px_rgba(0,0,0,0.18)]"
        >
          {searchField}
          <div className="mt-3 max-h-[360px] overflow-y-auto overscroll-contain">{list}</div>
        </div>
      ) : null}

      {open && isMobile
        ? createPortal(
            <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label="Choose a city">
              <button
                type="button"
                aria-label="Close"
                className="absolute inset-0 bg-black/40 animate-in fade-in duration-200"
                onClick={() => setOpen(false)}
              />
              <div
                ref={panelRef}
                className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-[28px] bg-white shadow-[0_-12px_40px_-8px_rgba(0,0,0,0.25)] animate-in slide-in-from-bottom duration-300"
              >
                <div className="flex justify-center pt-2.5">
                  <span className="h-1.5 w-10 rounded-full bg-border" aria-hidden="true" />
                </div>
                <div className="flex items-center justify-between px-5 pb-3 pt-2">
                  <p className="text-lg font-bold text-black">Choose a city</p>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-black"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="px-4 pb-3">{searchField}</div>
                <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">{list}</div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
