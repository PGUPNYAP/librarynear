import { NextResponse } from "next/server";

/**
 * Approximate visitor location from the IP address, provided by Vercel's edge
 * as request headers (city-level accuracy). Nothing is stored or logged; it is
 * only used to rank nearby search results higher.
 */
export const dynamic = "force-dynamic";

function header(request: Request, name: string) {
  const value = request.headers.get(name);
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function GET(request: Request) {
  const lat = Number(header(request, "x-vercel-ip-latitude"));
  const lng = Number(header(request, "x-vercel-ip-longitude"));
  const valid = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);

  return NextResponse.json(
    valid
      ? {
          lat,
          lng,
          city: header(request, "x-vercel-ip-city"),
          region: header(request, "x-vercel-ip-country-region"),
          country: header(request, "x-vercel-ip-country"),
          accuracy: "city",
        }
      : { lat: null, lng: null, accuracy: null },
    // Per-visitor answer: never cache at the CDN.
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
