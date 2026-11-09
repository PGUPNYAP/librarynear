import { notFound } from "next/navigation";
import { resolveCityParam } from "@/lib/cities-server";

/**
 * Every /[city]/* route goes through here. Unknown cities get a real 404
 * before any page streams (so search engines see the status code).
 */
export default async function CityLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ city: string }>;
}) {
  const { city } = await params;
  const resolved = await resolveCityParam(city);
  if (!resolved) notFound();
  return children;
}
