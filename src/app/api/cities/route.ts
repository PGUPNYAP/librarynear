import { NextResponse } from "next/server";
import { getActiveCities } from "@/lib/cities-server";

// The city list changes rarely; serve it from the CDN.
export const revalidate = 3600;

export async function GET() {
  const cities = await getActiveCities();
  return NextResponse.json(
    { cities: cities.map(({ name, slug, state, libraryCount }) => ({ name, slug, state, libraryCount })) },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
