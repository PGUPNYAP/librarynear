import Link from "next/link";
import { FormSubmitButton } from "@/components/form-submit-button";
import { requireApprovedStaff } from "@/lib/staff-access";
import { supabaseServer } from "@/lib/supabase-server";
import { getActiveCities } from "@/lib/cities-server";
import { assignLocalities } from "../team/actions";
import { rpcAll } from "@/lib/rpc-all";

const PAGE_SIZE = 100;

type OverviewRow = {
  locality_id: string;
  city: string;
  name: string;
  library_count: number;
  unverified_count: number;
  assignee_count: number;
};

export default async function AssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; show?: string; q?: string; page?: string }>;
}) {
  await requireApprovedStaff(["admin"]);
  const { city: rawCity, show, q, page } = await searchParams;
  const cities = await getActiveCities();
  const city = cities.find((option) => option.name === rawCity)?.name ?? cities[0]?.name ?? "Delhi";
  const showAll = show === "all";
  const currentPage = Math.max(1, Number(page) || 1);

  const [{ data, error }, { data: staffRows }] = await Promise.all([
    rpcAll<OverviewRow>("locality_assignment_overview", { p_city: city }),
    supabaseServer.from("staff_users").select("user_id, role").eq("is_approved", true),
  ]);

  const staffIds = (staffRows ?? []).map((row) => row.user_id);
  const { data: profiles } = staffIds.length
    ? await supabaseServer.from("profiles").select("id, full_name, email").in("id", staffIds)
    : { data: [] as Array<{ id: string; full_name: string | null; email: string | null }> };

  const all = ((data ?? []) as OverviewRow[]).map((row) => ({
    ...row,
    library_count: Number(row.library_count),
    unverified_count: Number(row.unverified_count),
    assignee_count: Number(row.assignee_count),
  }));
  const query = (q ?? "").trim().toLowerCase();
  const filtered = all.filter((row) => (showAll || row.assignee_count === 0) && (!query || row.name.toLowerCase().includes(query)));
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const unassignedLibraries = all.filter((row) => row.assignee_count === 0).reduce((sum, row) => sum + row.library_count, 0);
  const assignedLibraries = all.reduce((sum, row) => sum + row.library_count, 0) - unassignedLibraries;

  const href = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { city, show: showAll ? "all" : undefined, q: q || undefined, ...overrides };
    for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
    return `/admin/assignments?${params.toString()}`;
  };

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="mb-1 text-2xl font-bold text-black">Assignments</h1>
        <p className="text-sm text-muted-foreground">
          Every library belongs to a locality. Assign localities to sales staff so no library is left without an owner.
        </p>
      </div>

      {error ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This page needs the latest database migration (locality_assignment_overview). {error.message}
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "Localities", value: all.length },
          { label: "Unassigned localities", value: all.filter((row) => row.assignee_count === 0).length },
          { label: "Libraries without an owner", value: unassignedLibraries },
          { label: "Libraries covered", value: assignedLibraries },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-white p-4">
            <dt className="text-xs text-muted-foreground">{stat.label}</dt>
            <dd className="text-2xl font-bold text-black">{stat.value.toLocaleString("en-IN")}</dd>
          </div>
        ))}
      </dl>

      <form className="flex flex-wrap items-center gap-3" action="/admin/assignments">
        <select name="city" defaultValue={city} className="rounded-md border border-border bg-white px-3 py-2 text-sm" aria-label="City">
          {cities.map((option) => (
            <option key={option.slug} value={option.name}>
              {option.name} ({option.libraryCount})
            </option>
          ))}
        </select>
        <input name="q" defaultValue={q} placeholder="Filter localities" aria-label="Filter localities" className="rounded-md border border-border px-3 py-2 text-sm" />
        <select name="show" defaultValue={showAll ? "all" : ""} className="rounded-md border border-border bg-white px-3 py-2 text-sm" aria-label="Show">
          <option value="">Unassigned only</option>
          <option value="all">All localities</option>
        </select>
        <button className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white">Apply</button>
      </form>

      <form action={assignLocalities} className="space-y-4">
        <input type="hidden" name="return_to" value={href({ page: String(currentPage) })} />
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-white p-4">
          <span className="text-sm font-medium text-black">Assign ticked localities to:</span>
          {(profiles ?? []).length === 0 ? (
            <span className="text-sm text-muted-foreground">No approved staff yet.</span>
          ) : (
            (profiles ?? []).map((profile) => (
              <label key={profile.id} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm">
                <input type="checkbox" name="user_id" value={profile.id} />
                {profile.full_name || profile.email}
              </label>
            ))
          )}
          <FormSubmitButton className="ml-auto bg-primary px-4 py-2 text-sm font-medium text-white" pendingLabel="Assigning...">
            Assign
          </FormSubmitButton>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="w-10 px-4 py-3" />
                <th className="px-4 py-3">Locality</th>
                <th className="px-4 py-3 text-right">Libraries</th>
                <th className="px-4 py-3 text-right">Unverified</th>
                <th className="px-4 py-3 text-right">Assignees</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    {showAll ? "No localities found." : "Every locality in this city has an owner."}
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <tr key={row.locality_id} className="hover:bg-muted/40">
                    <td className="px-4 py-2">
                      <input type="checkbox" name="locality_id" value={row.locality_id} aria-label={`Select ${row.name}`} />
                    </td>
                    <td className="px-4 py-2 font-medium text-black">{row.name}</td>
                    <td className="px-4 py-2 text-right">{row.library_count}</td>
                    <td className="px-4 py-2 text-right">{row.unverified_count}</td>
                    <td className={`px-4 py-2 text-right ${row.assignee_count === 0 ? "font-semibold text-amber-700" : ""}`}>
                      {row.assignee_count}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </form>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            Page {currentPage} of {totalPages} · {filtered.length} localities
          </p>
          <div className="flex gap-2">
            {currentPage > 1 ? (
              <Link href={href({ page: String(currentPage - 1) })} className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted">
                Previous
              </Link>
            ) : null}
            {currentPage < totalPages ? (
              <Link href={href({ page: String(currentPage + 1) })} className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted">
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
