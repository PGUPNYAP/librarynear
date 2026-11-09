import { supabaseServer } from "@/lib/supabase-server";
import { getSiteUrl } from "@/lib/site-url";
import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";

export const revalidate = 86400; // 24 hours caching

export const metadata: Metadata = {
  title: "Directory",
  description: "Browse all cities and localities available on LibraryNear. Find the perfect study library near you.",
  alternates: {
    canonical: `${getSiteUrl()}/directory`,
  },
};

export default async function DirectoryPage() {
  // Fetch ALL libraries to extract unique cities, localities, and pincodes
  let branchData: { city: string; locality: string | null; pin_code: string | null }[] = [];
  const pageSize = 1000;
  let page = 0;
  
  while (true) {
    const { data } = await supabaseServer
      .from("library_branches")
      .select("city, locality, pin_code")
      .eq("is_active", true)
      .range(page * pageSize, (page + 1) * pageSize - 1);
      
    if (!data || data.length === 0) break;
    branchData.push(...data);
    if (data.length < pageSize) break;
    page++;
  }

  // Group data
  const cityMap = new Map<string, { localities: Set<string>; pincodes: Set<string> }>();

  branchData.forEach((row) => {
    const city = row.city.toLowerCase();
    if (!cityMap.has(city)) {
      cityMap.set(city, { localities: new Set(), pincodes: new Set() });
    }
    
    if (row.locality) {
      cityMap.get(city)!.localities.add(row.locality.toLowerCase().replace(/\s+/g, "-"));
    }
    if (row.pin_code) {
      cityMap.get(city)!.pincodes.add(row.pin_code.toLowerCase().replace(/\s+/g, "-"));
    }
  });

  const cities = Array.from(cityMap.keys()).sort();

  return (
    <div className="min-h-screen bg-gray-50/50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 flex items-center gap-3 mb-4">
            <BookOpen className="h-10 w-10 text-primary" />
            Library Directory
          </h1>
          <p className="text-lg text-gray-600 max-w-3xl">
            Browse our complete directory of study libraries across India. Select your city to explore libraries by locality and pincode.
          </p>
        </div>

        <div className="space-y-16">
          {cities.map((city) => {
            const data = cityMap.get(city)!;
            const localities = Array.from(data.localities).sort();
            const pincodes = Array.from(data.pincodes).sort();
            const cityLabel = city.charAt(0).toUpperCase() + city.slice(1);

            return (
              <section key={city} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
                <div className="flex items-center gap-4 mb-8 pb-4 border-b border-gray-100">
                  <h2 className="text-3xl font-bold text-gray-900">
                    <Link href={`/${city}`} className="hover:text-primary transition-colors">
                      {cityLabel}
                    </Link>
                  </h2>
                  <Link 
                    href={`/${city}/libraries`}
                    className="text-sm font-medium text-primary bg-primary/10 px-3 py-1 rounded-full hover:bg-primary/20 transition-colors"
                  >
                    View All
                  </Link>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                  {/* Localities */}
                  {localities.length > 0 && (
                    <div>
                      <h3 className="text-xl font-semibold text-gray-800 mb-6 flex items-center gap-2">
                        Localities
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                          {localities.length}
                        </span>
                      </h3>
                      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6">
                        {localities.map((loc) => {
                          const label = loc.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
                          return (
                            <li key={loc}>
                              <Link 
                                href={`/${city}/locality/${loc}`}
                                className="text-gray-600 hover:text-primary transition-colors flex items-center gap-2 text-sm"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 group-hover:bg-primary transition-colors" />
                                {label}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {/* Pincodes */}
                  {pincodes.length > 0 && (
                    <div>
                      <h3 className="text-xl font-semibold text-gray-800 mb-6 flex items-center gap-2">
                        Pincodes
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                          {pincodes.length}
                        </span>
                      </h3>
                      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-y-3 gap-x-6">
                        {pincodes.map((pin) => (
                          <li key={pin}>
                            <Link 
                              href={`/${city}/pincode/${pin}`}
                              className="text-gray-600 hover:text-primary transition-colors flex items-center gap-2 text-sm font-mono"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-gray-300 group-hover:bg-primary transition-colors" />
                              {pin}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                
                {/* specialized pSEO routes */}
                <div className="mt-8 pt-8 border-t border-gray-100 flex flex-wrap gap-4">
                  <Link 
                    href={`/${city}/24-hour-libraries`}
                    className="text-sm text-gray-600 hover:text-primary underline underline-offset-4"
                  >
                    24-Hour Libraries in {cityLabel}
                  </Link>
                  <Link 
                    href={`/${city}/exam/upsc`}
                    className="text-sm text-gray-600 hover:text-primary underline underline-offset-4"
                  >
                    UPSC Libraries in {cityLabel}
                  </Link>
                  <Link 
                    href={`/${city}/exam/neet`}
                    className="text-sm text-gray-600 hover:text-primary underline underline-offset-4"
                  >
                    NEET Libraries in {cityLabel}
                  </Link>
                  <Link 
                    href={`/${city}/exam/jee`}
                    className="text-sm text-gray-600 hover:text-primary underline underline-offset-4"
                  >
                    JEE Libraries in {cityLabel}
                  </Link>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
