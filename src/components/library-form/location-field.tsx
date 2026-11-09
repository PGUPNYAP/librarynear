"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Loader2, LocateFixed, MapPin, Search, TriangleAlert, X } from "lucide-react";
import { classifyLocationInput, googleMapsLinkFor } from "@/lib/maps-coordinates";
import { FieldError, inputClass } from "@/components/library-form/form-controls";
import { Field } from "@/components/library-form/form-controls";
import type { LibraryFormController } from "@/components/library-form/use-library-form";

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "found"; note?: string }
  | { kind: "approximate"; label: string | null }
  | { kind: "failed"; message: string };

const FAILURE: Record<string, string> = {
  unsupported: "We can't read links from that website. Paste a Google Maps link, or use your current location below.",
  not_found: "We couldn't find that place. Paste a Google Maps link or the exact coordinates.",
  unreachable: "We couldn't open that link just now. It will be tried again when you save.",
  rate_limited: "Too many lookups. Wait a minute, then try again.",
  unauthenticated: "Your sign-in has expired. Refresh the page and sign in again.",
};

type Details = {
  name: string | null;
  address: string | null;
  locality: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pinCode: string | null;
  phone?: string | null;
  hours?: { mode: "24h" } | { mode: "set"; opening: string; closing: string } | null;
};
type Suggestion = { placeId: string; name: string; area: string };

function newSessionToken() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const CITY_ALIASES: Record<string, string> = { "new delhi": "Delhi", bangalore: "Bengaluru", gurgaon: "Gurugram", allahabad: "Prayagraj", bombay: "Mumbai", calcutta: "Kolkata", madras: "Chennai" };

export function LocationField({ form, required }: { form: LibraryFormController; required: boolean }) {
  const { values, set, touch, errors } = form;
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [locating, setLocating] = useState(false);
  const [manual, setManual] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<{ name: string; area: string } | null>(null);
  const [showMap, setShowMap] = useState(false);
  const sessionToken = useRef<string | null>(null);
  const [filled, setFilled] = useState<string[]>([]);
  const latestValues = useRef(values);
  useEffect(() => {
    latestValues.current = values;
  }, [values]);

  /** Only empty fields are filled; anything already typed is left alone. */
  const fillFrom = (details: Details | undefined) => {
    if (!details) return;
    const current = latestValues.current;
    const done: string[] = [];
    const fill = (key: "display_name" | "full_address" | "locality" | "city" | "district" | "state" | "pin_code", value: string | null, label: string) => {
      if (value && !current[key].trim()) {
        set(key, value);
        done.push(label);
      }
    };
    const city = details.city ? (CITY_ALIASES[details.city.toLowerCase()] ?? details.city) : null;
    fill("display_name", details.name, "name");
    fill("full_address", details.address, "address");
    fill("city", city, "city");
    fill("locality", details.locality, "locality");
    fill("pin_code", details.pinCode && /^[1-9]\d{5}$/.test(details.pinCode) ? details.pinCode : null, "PIN");
    fill("state", details.state, "state");
    fill("district", details.district, "district");
    if (details.phone && !current.phone_number.trim()) {
      set("phone_number", details.phone);
      done.push("phone");
    }
    if (details.hours && !current.opening_time && !current.closing_time && current.hours_mode !== "24h") {
      set("hours_mode", details.hours.mode);
      if (details.hours.mode === "set") {
        set("opening_time", details.hours.opening);
        set("closing_time", details.hours.closing);
      }
      done.push("hours");
    }
    if (done.length) setFilled(done);
  };
  const request = useRef(0);
  const timer = useRef<number | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
      controller.current?.abort();
    },
    [],
  );

  const applyCoordinates = (latitude: number, longitude: number) => {
    set("latitude", String(latitude));
    set("longitude", String(longitude));
  };

  const lookUp = (input: string, id: number, quiet = false) => {
    controller.current?.abort();
    controller.current = new AbortController();
    if (!quiet) setStatus({ kind: "checking" });
    fetch("/api/resolve-location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
      signal: controller.current.signal,
    })
      .then((response) => response.json())
      .then((result: { ok: boolean; reason?: string; latitude: number; longitude: number; mapLink: string; label: string | null; approximate: boolean; details?: Details }) => {
        if (id !== request.current) return;
        if (!result.ok) {
          if (quiet) return;
          setStatus({ kind: "failed", message: FAILURE[result.reason ?? ""] ?? FAILURE.not_found });
          return;
        }
        fillFrom(result.details);
        if (quiet) return;
        applyCoordinates(result.latitude, result.longitude);
        set("map_link", result.mapLink);
        setShowMap(true);
        setStatus(result.approximate ? { kind: "approximate", label: result.label } : { kind: "found" });
      })
      .catch((error: unknown) => {
        if (quiet || id !== request.current || (error instanceof DOMException && error.name === "AbortError")) return;
        setStatus({ kind: "failed", message: FAILURE.unreachable });
      });
  };

  const search = (text: string, id: number) => {
    controller.current = new AbortController();
    sessionToken.current ??= newSessionToken();
    fetch("/api/place-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: text, sessionToken: sessionToken.current }),
      signal: controller.current.signal,
    })
      .then((response) => response.json())
      .then((result: { ok: boolean; suggestions?: Suggestion[] }) => {
        if (id !== request.current) return;
        setSearching(false);
        setSuggestions(result.suggestions ?? []);
        // Plus codes and full addresses often have no suggestion, but can still be found.
        if (result.ok && !result.suggestions?.length) lookUp(text, id);
        if (!result.ok) lookUp(text, id);
      })
      .catch((error: unknown) => {
        if (id !== request.current || (error instanceof DOMException && error.name === "AbortError")) return;
        setSearching(false);
      });
  };

  const pick = (suggestion: Suggestion) => {
    const id = ++request.current;
    controller.current?.abort();
    controller.current = new AbortController();
    setSuggestions([]);
    setPicked({ name: suggestion.name, area: suggestion.area });
    setStatus({ kind: "checking" });
    const token = sessionToken.current ?? newSessionToken();
    sessionToken.current = null;
    fetch("/api/resolve-location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placeId: suggestion.placeId, sessionToken: token }),
      signal: controller.current.signal,
    })
      .then((response) => response.json())
      .then((result: { ok: boolean; reason?: string; latitude: number; longitude: number; mapLink: string; details?: Details }) => {
        if (id !== request.current) return;
        if (!result.ok) {
          setPicked(null);
          setStatus({ kind: "failed", message: FAILURE[result.reason ?? ""] ?? FAILURE.not_found });
          return;
        }
        applyCoordinates(result.latitude, result.longitude);
        set("map_link", result.mapLink);
        fillFrom(result.details);
        setShowMap(true);
        setStatus({ kind: "found" });
      })
      .catch((error: unknown) => {
        if (id !== request.current || (error instanceof DOMException && error.name === "AbortError")) return;
        setPicked(null);
        setStatus({ kind: "failed", message: FAILURE.unreachable });
      });
  };

  const onInput = (text: string) => {
    const id = ++request.current;
    if (timer.current) window.clearTimeout(timer.current);
    controller.current?.abort();
    set("map_link", text);
    setSuggestions([]);
    setSearching(false);
    setPicked(null);

    const parsed = classifyLocationInput(text);
    if (!parsed) {
      // Cleared, or too short to mean anything yet.
      setStatus({ kind: "idle" });
      return;
    }
    const instant = parsed.type === "coordinates" || (parsed.type === "url" && parsed.coordinates) ? parsed.coordinates : null;
    if (instant) {
      applyCoordinates(instant.latitude, instant.longitude);
      setShowMap(true);
      setStatus({ kind: "found" });
      // The point is known already; ask only for the address around it.
      timer.current = window.setTimeout(() => lookUp(text, id, true), 300);
      return;
    }
    // A new link must never be saved with the previous link's coordinates.
    set("latitude", "");
    set("longitude", "");
    if (parsed.type === "text") {
      setStatus({ kind: "idle" });
      setSearching(true);
      timer.current = window.setTimeout(() => search(text, id), 250);
      return;
    }
    setStatus({ kind: "checking" });
    timer.current = window.setTimeout(() => lookUp(text, id), 300);
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      setStatus({ kind: "failed", message: "This browser can't share location. Paste a Google Maps link instead." });
      return;
    }
    const id = ++request.current;
    controller.current?.abort();
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        if (id !== request.current) return;
        const latitude = Number(coords.latitude.toFixed(6));
        const longitude = Number(coords.longitude.toFixed(6));
        applyCoordinates(latitude, longitude);
        setShowMap(true);
        set("map_link", googleMapsLinkFor({ latitude, longitude }));
        touch("map_link");
        lookUp(`${latitude}, ${longitude}`, id, true);
        setStatus(coords.accuracy > 150 ? { kind: "found", note: `Accurate to about ${Math.round(coords.accuracy)} m. Step outside or check it on Google Maps.` } : { kind: "found", note: "Using your current location." });
      },
      (error) => {
        setLocating(false);
        setStatus({
          kind: "failed",
          message:
            error.code === error.PERMISSION_DENIED
              ? "Location is blocked for this site. Allow it in your browser settings, or paste a Google Maps link."
              : "We couldn't get your location. Paste a Google Maps link instead.",
        });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  };

  const clear = () => {
    request.current += 1;
    controller.current?.abort();
    if (timer.current) window.clearTimeout(timer.current);
    set("map_link", "");
    set("latitude", "");
    set("longitude", "");
    setSuggestions([]);
    setSearching(false);
    setPicked(null);
    setShowMap(false);
    setStatus({ kind: "idle" });
  };

  const latitude = Number(values.latitude);
  const longitude = Number(values.longitude);
  const hasPoint = Boolean(values.latitude && values.longitude) && Number.isFinite(latitude) && Number.isFinite(longitude);
  const coordinateError = errors.latitude || errors.longitude;

  return (
    <div className="space-y-3">
      <Field
        name="map_link"
        label="Find your library"
        required={required}
        error={errors.map_link}
        hint={status.kind === "idle" && !hasPoint && !suggestions.length ? "Search its name on Google, or paste a map link or coordinates." : undefined}
      >
        {picked ? (
          <div className="flex items-center gap-3 rounded-xl border border-black px-3 py-2.5">
            <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-black">{picked.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{picked.area}</span>
            </span>
            <button type="button" onClick={clear} className="shrink-0 px-1 py-2 text-[13px] font-semibold text-primary">Change</button>
          </div>
        ) : (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <input
              id="f-map_link"
              value={values.map_link}
              inputMode="search"
              autoComplete="off"
              autoCapitalize="words"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              aria-invalid={Boolean(errors.map_link)}
              onBlur={() => touch("map_link")}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
              }}
              onChange={(event) => onInput(event.target.value)}
              placeholder="Library name, map link or coordinates"
              className={`${inputClass} pl-9 pr-10`}
            />
            {searching ? (
              <Loader2 className="absolute right-3 top-3.5 h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
            ) : values.map_link ? (
              <button type="button" onClick={clear} aria-label="Clear location" className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-black">
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        )}
      </Field>

      {suggestions.length ? (
        <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border">
          {suggestions.map((suggestion) => (
            <li key={suggestion.placeId}>
              <button type="button" onClick={() => pick(suggestion)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 active:bg-muted">
                <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-black">{suggestion.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{suggestion.area}</span>
                </span>
              </button>
            </li>
          ))}
          <li className="px-3 py-1.5 text-right text-[11px] text-muted-foreground">Powered by Google</li>
        </ul>
      ) : null}

      <div aria-live="polite" className="space-y-2">
        {status.kind === "checking" ? (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Finding the location
          </p>
        ) : null}
        {status.kind === "failed" ? <FieldError message={status.message} /> : null}
        {status.kind === "approximate" ? (
          <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>Matched by name{status.label ? ` to "${status.label}"` : ""}. Please check it&apos;s the right place.</span>
          </p>
        ) : null}
        {hasPoint && status.kind !== "checking" ? (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-emerald-50 px-3 py-2 text-[13px] text-emerald-900">
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0" aria-hidden />
              {latitude.toFixed(5)}, {longitude.toFixed(5)}
            </span>
            <a href={googleMapsLinkFor({ latitude, longitude })} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold hover:underline">
              Check on Google Maps <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
            {status.kind === "found" && status.note ? <span className="w-full text-xs">{status.note}</span> : null}
            {filled.length ? <span className="w-full text-xs">Filled in {filled.join(", ")} from the map. Check they look right.</span> : null}
          </div>
        ) : null}
      </div>

      {hasPoint && showMap && status.kind !== "checking" ? (
        <iframe
          key={`${latitude},${longitude}`}
          src={`https://www.google.com/maps?q=${latitude},${longitude}&z=17&output=embed`}
          title="Map preview of this location"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="h-48 w-full rounded-xl border border-border sm:h-56"
        />
      ) : hasPoint && status.kind !== "checking" ? (
        <button type="button" onClick={() => setShowMap(true)} className="text-[13px] font-medium text-muted-foreground hover:text-black">Show on map</button>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" onClick={useMyLocation} disabled={locating} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-black hover:border-black disabled:opacity-60">
          {locating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <LocateFixed className="h-4 w-4" aria-hidden />}
          I&apos;m at the library now
        </button>
        {!manual && !coordinateError ? (
          <button type="button" onClick={() => setManual(true)} className="text-[13px] font-medium text-muted-foreground hover:text-black">
            Enter latitude and longitude
          </button>
        ) : null}
      </div>

      {manual || coordinateError ? (
        <div className="grid grid-cols-2 gap-3">
          <Field name="latitude" label="Latitude" error={errors.latitude}>
            <input id="f-latitude" value={values.latitude} inputMode="decimal" placeholder="28.6306" aria-invalid={Boolean(errors.latitude)} onBlur={() => touch("latitude")} onChange={(event) => set("latitude", event.target.value.trim())} className={inputClass} />
          </Field>
          <Field name="longitude" label="Longitude" error={errors.longitude}>
            <input id="f-longitude" value={values.longitude} inputMode="decimal" placeholder="77.2774" aria-invalid={Boolean(errors.longitude)} onBlur={() => touch("longitude")} onChange={(event) => set("longitude", event.target.value.trim())} className={inputClass} />
          </Field>
        </div>
      ) : null}
    </div>
  );
}
