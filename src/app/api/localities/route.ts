import { NextResponse, type NextRequest } from "next/server";
import { resolveCityParam } from "@/lib/cities-server";
import { getCityLocalities } from "@/lib/library-search";

/** Locality names for form suggestions, so the same area isn't spelled two ways. */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("city") ?? "";
  const city = /^[a-z0-9-]{1,60}$/.test(slug) ? await resolveCityParam(slug) : null;
  if (!city) return NextResponse.json({ localities: [] });
  const rows = await getCityLocalities(city.name);
  return NextResponse.json(
    { localities: rows.map((row) => row.name) },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
