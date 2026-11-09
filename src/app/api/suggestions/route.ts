import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logPerf, measureAsync, toServerTiming } from "@/lib/perf";
// High-volume endpoints use the per-instance limiter to avoid a Redis call
// on every keystroke; forms and uploads use the shared limiter.
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { escapePostgrestFilter } from "@/lib/postgrest";
import { isValidLatitude, isValidLongitude } from "@/lib/owner-form-validation";

export const runtime = "edge";
export const revalidate = 0;

export interface Suggestion {
  type: "library" | "locality" | "metro" | "nearby" | "place" | "pincode" | "nearme" | "lookup";
  lat?: number;
  lng?: number;
  query?: string;
  label: string;
  slug: string;
  city: string;
  distance_km?: number | null;
  /** Secondary line, e.g. locality and rating (instant in-browser results). */
  sublabel?: string;
}

type FallbackSuggestionRow = {
  slug: string;
  city: string;
  display_name: string;
  locality: string | null;
  verification_status: string | null;
  profile_completeness_score: number | null;
};

function getFallbackSuggestionScore(row: FallbackSuggestionRow, normalizedQuery: string) {
  const display = row.display_name.toLowerCase();
  const locality = row.locality?.toLowerCase() ?? "";

  return (
    (display === normalizedQuery ? 4 : 0) +
    (display.startsWith(normalizedQuery) ? 2.6 : 0) +
    (display.includes(normalizedQuery) ? 1.2 : 0) +
    (locality === normalizedQuery ? 1.6 : 0) +
    (locality.startsWith(normalizedQuery) ? 0.9 : 0) +
    (row.verification_status === "verified" ? 0.2 : 0) +
    ((row.profile_completeness_score ?? 0) / 100) * 0.08
  );
}

function isMissingSuggestionFastPath(errorMessage: string) {
  return /Could not find the function public\.search_suggestions/i.test(errorMessage);
}

export async function GET(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const rateCheck = checkRateLimit(ip, RATE_LIMITS.suggestions);
  if (!rateCheck.success) {
    return NextResponse.json(
      { suggestions: [], error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.resetAt - Date.now()) / 1000)) } },
    );
  }

  const q = req.nextUrl.searchParams.get("q")?.trim().slice(0, 200) ?? "";
  const city = req.nextUrl.searchParams.get("city")?.trim().toLowerCase().slice(0, 50) ?? "";
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  const hasCoordinates = isValidLatitude(lat) && isValidLongitude(lng);

  if (!hasCoordinates && q.length < 2) {
    return NextResponse.json({ suggestions: [], mode: "text" });
  }

  const totalStart = performance.now();
  if (hasCoordinates && q.length < 2) {
    const { result: nearbyResponse, metric: nearbyMetric } = await measureAsync(
      "nearby",
      () =>
        supabaseServer.rpc("nearby_library_suggestions" as never, {
          user_lat: lat,
          user_lng: lng,
          city_filter: city || null,
          max_results: 10,
        } as never),
    );

    const nearbySuggestions = ((nearbyResponse.data ?? []) as Suggestion[]).filter((suggestion) => {
      if (!city) return true;
      return suggestion.city?.toLowerCase() === city;
    });

    const totalMetric = {
      name: "total",
      duration: performance.now() - totalStart,
    };
    const metrics = [nearbyMetric, totalMetric];
    logPerf(
      "suggestions",
      metrics,
      `mode=nearby city="${city || "all"}" count=${nearbySuggestions.length}`,
    );

    return NextResponse.json(
      { suggestions: nearbySuggestions, mode: "nearby" },
      {
        headers: {
          "Server-Timing": toServerTiming(metrics),
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  }

  const { result: geoResponse, metric: geoMetric } = await measureAsync(
    "geoRpc",
    () =>
      supabaseServer.rpc("search_libraries_geospatial" as never, {
        search_term: q,
      } as never),
  );

  let data = null;
  let error: any = null;
  let usedGeoRpc = false;
  let rpcMetric: any = null;

  const geoData = geoResponse.data as any[] | null;

  if (geoData && geoData.length > 0) {
    usedGeoRpc = true;
    data = geoData.map((r) => ({
      type: "library",
      label: r.display_name,
      slug: r.slug,
      city: r.city,
      distance_km: Math.round(r.distance_meters / 100) / 10,
    }));
  } else {
    const { result: rpcResponse, metric: m } = await measureAsync(
      "rpc",
      () =>
        supabaseServer.rpc("search_suggestions" as never, {
          query_term: q,
          city_filter: city || null,
          max_results: 10,
        } as never),
    );
    data = rpcResponse.data;
    error = rpcResponse.error;
    rpcMetric = m;
  }

  let usedLegacyRpc = false;

  if (error && isMissingSuggestionFastPath(error.message)) {
    const { result: legacyResponse, metric: legacyMetric } = await measureAsync(
      "legacyRpc",
      () =>
        supabaseServer.rpc("search_suggestions" as never, {
          query_term: q,
        } as never),
    );

    data = legacyResponse.data;
    error = legacyResponse.error;
    usedLegacyRpc = !legacyResponse.error;

    if (!legacyResponse.error) {
      const suggestions = ((legacyResponse.data ?? []) as Suggestion[]).filter((suggestion) => {
        if (!city) return true;
        return suggestion.city?.toLowerCase() === city;
      });

      const totalMetric = {
        name: "total",
        duration: performance.now() - totalStart,
      };
      const metrics = [rpcMetric, legacyMetric, totalMetric].filter(Boolean);
      logPerf(
        "suggestions",
        metrics,
        `q="${q}" city="${city || "all"}" legacyRpc=1 geoRpc=0 count=${suggestions.length}`,
      );

      return NextResponse.json(
        { suggestions, mode: "text" },
        {
          headers: {
            "Server-Timing": toServerTiming(metrics),
            "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
          },
        },
      );
    }
  }

  if (error) {
    console.error("Suggestions error:", error.message);
    const { result: fallbackResponse, metric: fallbackMetric } = await measureAsync(
      "fallback",
      () => {
        let fallbackQuery = supabaseServer
          .from("library_branches")
          .select("slug, city, display_name, locality, verification_status, profile_completeness_score")
          .eq("is_active", true)
          .or(`display_name.ilike.%${escapePostgrestFilter(q)}%,locality.ilike.%${escapePostgrestFilter(q)}%`)
          .limit(20);

        if (city) {
          fallbackQuery = fallbackQuery.ilike("city", city);
        }

        return fallbackQuery;
      },
    );
    const fallback = (fallbackResponse.data ?? []) as FallbackSuggestionRow[];
    const normalizedQuery = q.toLowerCase();

    const suggestions: Suggestion[] = fallback
      .sort((a, b) => {
        const scoreDelta =
          getFallbackSuggestionScore(b, normalizedQuery) - getFallbackSuggestionScore(a, normalizedQuery);
        if (scoreDelta !== 0) return scoreDelta;
        return a.display_name.localeCompare(b.display_name);
      })
      .slice(0, 10)
      .map((r) => ({
        type: "library",
        label: r.display_name,
        slug: r.slug,
        city: r.city,
      }));

    const totalMetric = {
      name: "total",
      duration: performance.now() - totalStart,
    };
    const metrics = [geoMetric, fallbackMetric, totalMetric].filter(Boolean);
    logPerf(
      "suggestions",
      metrics,
      `q="${q}" city="${city || "all"}" fallback=1${usedLegacyRpc ? " legacyRpc=1" : ""} geoRpc=${usedGeoRpc ? 1 : 0}`,
    );

    return NextResponse.json(
      { suggestions, mode: "text" },
      {
        headers: {
          "Server-Timing": toServerTiming(metrics),
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  }

  const suggestions = (data ?? []) as Suggestion[];
  const totalMetric = {
    name: "total",
    duration: performance.now() - totalStart,
  };
  const metrics = [geoMetric, rpcMetric, totalMetric].filter(Boolean);
  logPerf("suggestions", metrics, `q="${q}" city="${city || "all"}" fallback=0 geoRpc=${usedGeoRpc ? 1 : 0} count=${suggestions.length}`);

  return NextResponse.json(
    { suggestions, mode: "text" },
    {
      headers: {
        "Server-Timing": toServerTiming(metrics),
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}
