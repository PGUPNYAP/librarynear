import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { requireApprovedStaff } from "@/lib/staff-access";
import { LEAD_STATUSES, LEAD_STATUS_LABEL, isLeadStatus } from "@/lib/lead-status";
import { formatIndianPhone, toTelHref, toWhatsAppHref } from "@/lib/phone";
import { citySlug } from "@/lib/places";
import { LeadNotesEditor, LeadStatusSelect } from "./lead-status-select";

const PAGE_SIZE = 50;

type LeadRow = {
  id: string;
  name: string;
  phone_number: string;
  email: string | null;
  message: string | null;
  status: string | null;
  notes: string | null;
  follow_up_at: string | null;
  source_page: string | null;
  created_at: string | null;
  library_branches: { display_name: string; slug: string; city: string } | null;
};

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; due?: string }>;
}) {
  await requireApprovedStaff(["admin"]);
  const { status, page, due } = await searchParams;
  const statusFilter = isLeadStatus(status) ? status : null;
  const dueOnly = due === "1";
  const currentPage = Math.max(1, Number(page) || 1);
  const from = (currentPage - 1) * PAGE_SIZE;

  let query = supabaseServer
    .from("leads")
    .select("*, library_branches(display_name, slug, city)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (statusFilter) query = query.eq("status", statusFilter);
  if (dueOnly) query = query.lte("follow_up_at" as never, new Date().toISOString() as never).neq("status", "converted").neq("status", "dead");

  const countFor = (value: string) =>
    supabaseServer.from("leads").select("id", { count: "exact", head: true }).eq("status", value);

  const [{ data: leads, count, error }, ...statusCounts] = await Promise.all([query, ...LEAD_STATUSES.map(countFor)]);

  if (error) {
    return <div className="p-8 text-red-500">Error loading leads: {error.message}</div>;
  }

  const rows = (leads ?? []) as unknown as LeadRow[];
  const counts = Object.fromEntries(LEAD_STATUSES.map((value, index) => [value, statusCounts[index].count ?? 0]));
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const href = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { status: statusFilter ?? undefined, due: dueOnly ? "1" : undefined, ...overrides };
    for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
    const qs = params.toString();
    return qs ? `/admin?${qs}` : "/admin";
  };

  return (
    <div className="p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-bold text-black">Leads inbox</h1>
          <p className="text-sm text-muted-foreground">Student enquiries. Visible to admins only.</p>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
          {counts.new} new lead{counts.new === 1 ? "" : "s"}
        </div>
      </div>

      <nav aria-label="Filter leads" className="mb-5 flex flex-wrap gap-2 text-sm">
        <Link href={href({ status: undefined, page: undefined })} className={`rounded-full border px-3 py-1.5 ${!statusFilter && !dueOnly ? "border-black bg-black text-white" : "border-border"}`}>
          All
        </Link>
        {LEAD_STATUSES.map((value) => (
          <Link
            key={value}
            href={href({ status: value, page: undefined, due: undefined })}
            className={`rounded-full border px-3 py-1.5 ${statusFilter === value ? "border-black bg-black text-white" : "border-border"}`}
          >
            {LEAD_STATUS_LABEL[value]} ({counts[value]})
          </Link>
        ))}
        <Link
          href={href({ due: dueOnly ? undefined : "1", status: undefined, page: undefined })}
          className={`rounded-full border px-3 py-1.5 ${dueOnly ? "border-violet-600 bg-violet-600 text-white" : "border-violet-200 text-violet-700"}`}
        >
          Follow-ups due
        </Link>
      </nav>

      <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 font-medium text-muted-foreground">
            <tr>
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3">Student</th>
              <th className="px-5 py-3">Library</th>
              <th className="px-5 py-3">Message</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Notes &amp; follow-up</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                  No leads here.
                </td>
              </tr>
            ) : (
              rows.map((lead) => {
                const lib = lead.library_branches;
                const contactHref = toWhatsAppHref(lead.phone_number) ?? toTelHref(lead.phone_number);
                const overdue = lead.follow_up_at && new Date(lead.follow_up_at) <= new Date();
                return (
                  <tr key={lead.id} className="align-top hover:bg-muted/40">
                    <td className="whitespace-nowrap px-5 py-4 text-muted-foreground">
                      {lead.created_at ? new Date(lead.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "-"}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-black">{lead.name}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {contactHref ? (
                          <a href={contactHref} target="_blank" rel="noreferrer" className="hover:text-primary hover:underline">
                            {formatIndianPhone(lead.phone_number)}
                          </a>
                        ) : (
                          lead.phone_number
                        )}
                      </div>
                      {lead.email ? <div className="text-xs text-muted-foreground">{lead.email}</div> : null}
                    </td>
                    <td className="px-5 py-4">
                      {lib ? (
                        <a href={`/${citySlug(lib.city)}/library/${lib.slug}`} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                          {lib.display_name}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">Unknown library</span>
                      )}
                    </td>
                    <td className="max-w-[260px] px-5 py-4 text-xs text-muted-foreground">{lead.message || "—"}</td>
                    <td className="px-5 py-4">
                      <LeadStatusSelect leadId={lead.id} currentStatus={lead.status} />
                      {overdue ? <p className="mt-1 text-[11px] font-semibold text-violet-700">Follow-up due</p> : null}
                    </td>
                    <td className="px-5 py-4">
                      <LeadNotesEditor leadId={lead.id} notes={lead.notes} followUpAt={lead.follow_up_at} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="mt-6 flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            Page {currentPage} of {totalPages} · {count} leads
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
