import { toTelHref, toWhatsAppHref } from "@/lib/phone";
import Link from "next/link";
import { Search } from "lucide-react";
import { EditLibraryModal } from "./edit-modal";
import { VerificationStatusSelect } from "./verification-status-select";
import { getLibraryOpsPage } from "@/lib/library-ops";
import { requireApprovedStaff } from "@/lib/staff-access";
import { getActiveCities } from "@/lib/cities-server";

function buildPageHref(page: number, q?: string, city?: string, sort?: string, verified?: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (city) params.set("city", city);
  if (sort) params.set("sort", sort);
  if (verified) params.set("verified", verified);
  params.set("page", String(page));
  return `/admin/libraries?${params.toString()}`;
}

export default async function AdminLibrariesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; city?: string; sort?: string; verified?: string; page?: string }>;
}) {
  await requireApprovedStaff(["admin"]);

  const { q, city, sort, verified, page } = await searchParams;
  const currentPage = Math.max(1, Number(page ?? "1") || 1);

  const { libraries, totalCount, pageSize, error } = await getLibraryOpsPage({
    q,
    city,
    verified,
    sort,
    page: currentPage,
  });

  if (error) {
    return <div className="p-8 text-red-500">Error loading libraries: {error.message}</div>;
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const cities = await getActiveCities();

  return (
    <div className="p-8">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-black mb-1">Libraries Editor</h1>
          <p className="text-muted-foreground text-sm">
            Clean, verify, and review libraries. Showing 100 libraries per page.
          </p>
        </div>

        <form className="w-full md:w-auto flex flex-col sm:flex-row items-center gap-3">
          <div className="relative w-full sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-muted-foreground" />
            </div>
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search libraries..."
              className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <select
            name="city"
            defaultValue={city || ""}
            className="w-full sm:w-36 py-2 px-3 border border-border rounded-lg text-sm bg-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          >
            <option value="">All Cities</option>
            {cities.map((option) => (
              <option key={option.slug} value={option.name}>
                {option.name}
              </option>
            ))}
          </select>

          <select
            name="sort"
            defaultValue={sort || ""}
            className="w-full sm:w-44 py-2 px-3 border border-border rounded-lg text-sm bg-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          >
            <option value="">Sort: Score (Hi-Lo)</option>
            <option value="score_asc">Sort: Score (Lo-Hi)</option>
            <option value="name_asc">Sort: Name (A-Z)</option>
            <option value="recent">Sort: Recently Updated</option>
          </select>

          <select
            name="verified"
            defaultValue={verified || ""}
            className="w-full sm:w-44 py-2 px-3 border border-border rounded-lg text-sm bg-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          >
            <option value="">All verification</option>
            <option value="verified">Verified only</option>
            <option value="unverified">Not verified</option>
          </select>

          <button type="submit" className="hidden" aria-hidden="true" />
        </form>
      </div>

      <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-muted/50 border-b border-border text-muted-foreground font-medium">
              <tr>
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Locality</th>
                <th className="px-6 py-4">City</th>
                <th className="px-6 py-4">Phone</th>
                <th className="px-6 py-4">Timings</th>
                <th className="px-6 py-4 text-center">Score</th>
                <th className="px-6 py-4">Verified</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {libraries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
                    No libraries found.
                  </td>
                </tr>
              ) : (
                libraries.map((lib) => (
                  <tr key={lib.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-semibold text-black max-w-55 truncate" title={lib.display_name}>
                      {lib.display_name}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground max-w-45 truncate">{lib.locality || "-"}</td>
                    <td className="px-6 py-4 text-muted-foreground capitalize">{lib.city}</td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {lib.phone_number ? (
                        <a 
                          href={toWhatsAppHref(lib.phone_number) ?? toTelHref(lib.phone_number) ?? undefined}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline hover:text-primary"
                        >
                          {lib.phone_number}
                        </a>
                      ) : "-"}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {lib.opening_time && lib.closing_time ? `${lib.opening_time} - ${lib.closing_time}` : "-"}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                          (lib.profile_completeness_score ?? 0) >= 80
                            ? "bg-emerald-50 text-emerald-700"
                            : (lib.profile_completeness_score ?? 0) >= 50
                              ? "bg-amber-50 text-amber-700"
                              : "bg-red-50 text-red-700"
                        }`}
                      >
                        {lib.profile_completeness_score ?? 0}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <VerificationStatusSelect
                        id={lib.id}
                        value={lib.verification_status === "verified" ? "verified" : "unverified"}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-4">
                        <EditLibraryModal library={lib} allowDelete />
                        <Link
                          href={`/${lib.city.toLowerCase()}/library/${lib.slug}`}
                          target="_blank"
                          className="text-primary hover:underline font-medium text-xs whitespace-nowrap"
                        >
                          View public page
                        </Link>
                        {lib.map_link ? (
                          <Link
                            href={lib.map_link}
                            target="_blank"
                            className="text-primary hover:underline font-medium text-xs whitespace-nowrap"
                          >
                            Open map link
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">No map link</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between text-sm">
        <p className="text-muted-foreground">
          Page {currentPage} of {totalPages} · {totalCount} libraries
        </p>
        <div className="flex items-center gap-2">
          {currentPage > 1 && (
            <Link href={buildPageHref(currentPage - 1, q, city, sort, verified)} className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted">
              Previous
            </Link>
          )}
          {currentPage < totalPages && (
            <Link href={buildPageHref(currentPage + 1, q, city, sort, verified)} className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted">
              Next
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
