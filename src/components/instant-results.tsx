"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BookOpen, Landmark, MapPin, SlidersHorizontal, Sparkles } from "lucide-react";
import {
  getLoadedIndex,
  highlightParts,
  loadSearchIndex,
  searchLocally,
  type LocalResults,
  type PreparedIndex,
} from "@/lib/client-search";
import { getApproxLocation, getCachedLocation, type UserLocation } from "@/lib/user-location";
import { CompareToggle } from "@/components/compare-controls";
import { DeferredSaveButton } from "@/components/deferred-save-button";
import { formatInr } from "@/lib/library-seo";

type CardDetails = Record<string, { id: string; image: string | null; price: number | null }>;

function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightParts(text, query).map((part, index) =>
        part.match ? (
          <strong key={index} className="font-semibold">
            {part.text}
          </strong>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

/**
 * Results rendered in the browser from the city's search index: they appear
 * the instant the page opens. Photos and prices stream in a moment later.
 */
export function InstantResults({ city, cityLabel }: { city: string; cityLabel: string }) {
  const params = useSearchParams();
  const query = (params.get("q") ?? "").slice(0, 120);
  const [index, setIndex] = useState<PreparedIndex | null>(() => getLoadedIndex(city));
  const [location, setLocation] = useState<UserLocation | null>(() => getCachedLocation());
  const [details, setDetails] = useState<CardDetails>({});

  useEffect(() => {
    let active = true;
    if (!index) void loadSearchIndex(city).then((ready) => active && setIndex(ready));
    void getApproxLocation().then((value) => active && value && setLocation(value));
    return () => {
      active = false;
    };
  }, [city, index]);

  const results: LocalResults | null = useMemo(
    () => (index && query.trim() ? searchLocally(index, query, { location, cityLabel, libraryLimit: 48 }) : null),
    [index, query, location, cityLabel],
  );

  const libraries = useMemo(() => results?.suggestions.filter((item) => item.type === "library") ?? [], [results]);
  // Landmark chips only when the search was "near X"; areas/stations/PINs always.
  const places =
    results?.suggestions.filter(
      (item) =>
        item.type === "locality" || item.type === "metro" || item.type === "pincode" || (item.type === "place" && Boolean(results.parsed.nearText)),
    ) ?? [];

  useEffect(() => {
    const missing = libraries.map((item) => item.slug).filter((slug) => !(slug in details)).slice(0, 48);
    if (missing.length === 0) return;
    let active = true;
    fetch(`/api/library-cards?slugs=${missing.join(",")}`)
      .then((response) => (response.ok ? response.json() : { cards: {} }))
      .then((json: { cards: CardDetails }) => active && setDetails((current) => ({ ...current, ...json.cards })))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [libraries, details]);

  const placeHref = (item: (typeof places)[number]) => {
    if (item.type === "place" && typeof item.lat === "number" && typeof item.lng === "number") {
      const search = new URLSearchParams({ nearby: "1", lat: item.lat.toFixed(5), lng: item.lng.toFixed(5), near: item.label.replace(/^Libraries near /, "") });
      return `/${city}/libraries?${search.toString()}`;
    }
    if (item.type === "pincode") return `/${city}/pincode/${item.slug}`;
    return `/${city}/${item.type}/${item.slug}`;
  };

  if (!query.trim()) {
    return <p className="py-16 text-center text-muted-foreground">Type in the search bar to find libraries in {cityLabel}.</p>;
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-black">Results for “{query}”</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {index ? `${libraries.length}${libraries.length === 48 ? "+" : ""} libraries in ${cityLabel}` : "Searching…"}
          </p>
        </div>
        <Link
          href={`/${city}/libraries?q=${encodeURIComponent(query)}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-semibold text-black hover:border-black"
        >
          <SlidersHorizontal className="h-4 w-4" /> Filters
        </Link>
      </div>

      {results?.chip ? (
        <Link
          href={results.chip.href}
          className="mb-5 flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/[0.04] px-4 py-3 hover:border-primary/40"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          <span className="flex-1 text-sm font-semibold text-black">{results.chip.label}</span>
          <span className="text-primary">→</span>
        </Link>
      ) : null}

      {places.length > 0 ? (
        <div className="mb-8 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {places.map((item) => (
            <Link
              key={`${item.type}-${item.slug}-${item.label}`}
              href={placeHref(item)}
              className="flex shrink-0 items-center gap-2 rounded-full border border-border px-3.5 py-2 text-sm text-black hover:border-primary hover:text-primary"
            >
              {item.type === "place" ? <Landmark className="h-4 w-4 text-muted-foreground" /> : <MapPin className="h-4 w-4 text-muted-foreground" />}
              <span className="whitespace-nowrap">{item.label}</span>
            </Link>
          ))}
        </div>
      ) : null}

      {!index ? (
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <li key={i} className="space-y-2">
              <div className="aspect-square animate-pulse rounded-xl bg-muted" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            </li>
          ))}
        </ul>
      ) : libraries.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-lg font-semibold text-black">No libraries match “{query}”</p>
          <p className="mt-1 text-sm text-muted-foreground">Try a locality, metro station, college or PIN code.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-6 gap-y-10 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {libraries.map((item, position) => {
            const card = details[item.slug];
            return (
              <li key={item.slug} className="group flex flex-col gap-2">
                <Link href={`/${city}/library/${item.slug}`} className="flex flex-col gap-2">
                  <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-muted">
                    {card?.image ? (
                      <Image
                        src={card.image}
                        alt={item.label}
                        fill
                        priority={position < 4}
                        sizes="(max-width: 768px) 100vw, (max-width: 1280px) 33vw, 25vw"
                        className="object-cover transition-opacity duration-300 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
                        <BookOpen className="h-10 w-10 text-primary/20" />
                      </div>
                    )}
                    {card?.id ? <DeferredSaveButton libraryId={card.id} /> : null}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <h2 className="truncate text-[14px] text-black">
                      <Highlighted text={item.label} query={query} />
                    </h2>
                    {item.sublabel ? <p className="truncate text-[13px] text-muted-foreground">{item.sublabel}</p> : null}
                    {card?.price ? (
                      <p className="text-[13px] text-black">
                        <span className="font-semibold">{formatInr(card.price)}</span> <span className="text-muted-foreground">onwards</span>
                      </p>
                    ) : null}
                  </div>
                </Link>
                {card?.id ? (
                  <div>
                    <CompareToggle id={card.id} name={item.label} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
