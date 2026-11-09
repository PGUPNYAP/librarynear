import { toTelHref, toWhatsAppHref } from "@/lib/phone";
import { CheckCircle2, Clock3, HelpCircle, XCircle } from "lucide-react";
import { supabaseServer } from "@/lib/supabase-server";
import { requireApprovedStaff } from "@/lib/staff-access";
import {
  approveOwnerSubmission,
  rejectOwnerSubmission,
  requestChangesOwnerSubmission,
} from "./actions";

type OwnerSubmission = {
  id: string;
  display_name: string;
  city: string;
  locality: string | null;
  phone_number: string | null;
  status: string;
  created_at: string | null;
  reviewer_notes: string | null;
  possible_duplicate_of?: string | null;
  ownership_status?: string | null;
  library_branches?: { display_name: string; slug: string; city: string } | null;
};

const STATUS_LABELS: Record<string, string> = {
  pending_review: "Pending review",
  needs_changes: "Needs changes",
  approved: "Approved",
  rejected: "Rejected",
};

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status;
  const color =
    status === "approved"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status === "rejected"
        ? "bg-rose-50 text-rose-700 border-rose-200"
        : status === "needs_changes"
          ? "bg-amber-50 text-amber-700 border-amber-200"
          : "bg-slate-50 text-slate-700 border-slate-200";

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${color}`}>
      {label}
    </span>
  );
}

export default async function OwnerSubmissionsAdminPage() {
  await requireApprovedStaff(["admin"]);

  const { data: submissions, error } = await supabaseServer
    .from("owner_library_submissions")
    .select("id, display_name, city, locality, phone_number, status, created_at, reviewer_notes, possible_duplicate_of, ownership_status, library_branches!owner_library_submissions_possible_duplicate_of_fkey(display_name, slug, city)")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return <div className="p-8 text-red-500">Error loading owner submissions: {error.message}</div>;
  }

  const allSubmissions = (submissions ?? []) as unknown as OwnerSubmission[];
  const pending = allSubmissions.filter((submission) => submission.status === "pending_review");

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-bold text-black">Owner Submissions</h1>
          <p className="text-sm text-muted-foreground">
            Review owner listings before they go live.
          </p>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
          {pending.length} Pending
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full whitespace-nowrap text-left text-sm">
          <thead className="border-b border-border bg-muted/50 font-medium text-muted-foreground">
            <tr>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Library</th>
              <th className="px-6 py-4">City</th>
              <th className="px-6 py-4">Contact</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {allSubmissions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                  No owner submissions yet.
                </td>
              </tr>
            ) : (
              allSubmissions.map((submission) => (
                <tr key={submission.id} className="transition-colors hover:bg-muted/50">
                  <td className="px-6 py-4 text-muted-foreground">
                    {new Date(submission.created_at || "").toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-semibold text-black">{submission.display_name}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {[submission.locality, submission.city].filter(Boolean).join(", ")}
                    </div>
                    {submission.library_branches ? (
                      <a
                        href={`/${submission.library_branches.city.toLowerCase()}/library/${submission.library_branches.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 hover:underline"
                      >
                        Possible duplicate of {submission.library_branches.display_name}: check ownership
                      </a>
                    ) : null}
                    {submission.ownership_status === "unverified" ? (
                      <div className="mt-1 text-[11px] text-muted-foreground">Ownership not verified</div>
                    ) : null}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{submission.city}</td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {submission.phone_number ? (
                      <a 
                        href={toWhatsAppHref(submission.phone_number) ?? toTelHref(submission.phone_number) ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline hover:text-primary"
                      >
                        {submission.phone_number}
                      </a>
                    ) : "-"}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={submission.status} />
                  </td>
                  <td className="px-6 py-4">
                    {submission.status === "pending_review" ? (
                      <div className="flex items-center gap-2">
                        <form action={approveOwnerSubmission}>
                          <input type="hidden" name="id" value={submission.id} />
                          <button
                            type="submit"
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approve
                          </button>
                        </form>
                        <form action={requestChangesOwnerSubmission} className="flex items-center gap-2">
                          <input type="hidden" name="id" value={submission.id} />
                          <input
                            name="notes"
                            placeholder="Notes"
                            defaultValue={submission.reviewer_notes ?? ""}
                            className="w-40 rounded-md border border-border px-2 py-1 text-xs"
                          />
                          <button
                            type="submit"
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                          >
                            <HelpCircle className="h-3.5 w-3.5" />
                            Request changes
                          </button>
                        </form>
                        <form action={rejectOwnerSubmission} className="flex items-center gap-2">
                          <input type="hidden" name="id" value={submission.id} />
                          <input
                            name="notes"
                            placeholder="Notes"
                            defaultValue={submission.reviewer_notes ?? ""}
                            className="w-36 rounded-md border border-border px-2 py-1 text-xs"
                          />
                          <button
                            type="submit"
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </button>
                        </form>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">No actions available for this state</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-white p-4 text-sm text-muted-foreground">
        <div className="mb-2 flex items-center gap-2 font-semibold text-black">
          <Clock3 className="h-4 w-4" />
          Approval workflow
        </div>
        Approving creates a live library record and immediately revalidates public pages. Requesting changes keeps the
        submission visible to the owner in their dashboard.
      </div>
    </div>
  );
}
