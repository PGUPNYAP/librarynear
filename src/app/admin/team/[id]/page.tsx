import Link from "next/link";
import { notFound } from "next/navigation";
import { FormSubmitButton } from "@/components/form-submit-button";
import { ActivityChart } from "@/components/admin/activity-chart";
import { requireApprovedStaff } from "@/lib/staff-access";
import { supabaseServer } from "@/lib/supabase-server";
import { getActiveCities } from "@/lib/cities-server";
import { getDailyActivity, getStaffSummary, parseRange, RANGE_OPTIONS } from "@/lib/team-stats";
import { assignLocalities, removeLocalityAssignment, saveStaffAccess } from "../actions";
import { AssignmentForm } from "./assignment-form";

const ACTIVITY_PAGE_SIZE = 25;

function formatActionType(actionType: string) {
  switch (actionType) {
    case "library_updated":
      return "Library details updated";
    case "verification_updated":
      return "Verification status changed";
    case "library_deleted":
      return "Library removed";
    default:
      return actionType.replace(/_/g, " ");
  }
}

function formatFieldName(field: string) {
  return field
    .replace(/^last_/, "")
    .replace(/_id$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default async function AdminTeamMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string; page?: string }>;
}) {
  await requireApprovedStaff(["admin"]);
  const [{ id }, { range, page }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const days = parseRange(range);
  const currentPage = Math.max(1, Number(page) || 1);
  const from = (currentPage - 1) * ACTIVITY_PAGE_SIZE;

  const [
    { data: profile },
    { data: staff },
    { data: assignments },
    { data: activityLogs, count: activityCount },
    summary,
    allTime,
    daily,
    cities,
  ] = await Promise.all([
    supabaseServer.from("profiles").select("*").eq("id", id).maybeSingle(),
    supabaseServer.from("staff_users").select("*").eq("user_id", id).maybeSingle(),
    supabaseServer.from("sales_locality_assignments").select("*").eq("user_id", id).order("city").order("locality"),
    supabaseServer
      .from("library_activity_logs")
      .select("*, library_branches(display_name, slug, city)", { count: "exact" })
      .eq("actor_user_id", id)
      .order("created_at", { ascending: false })
      .range(from, from + ACTIVITY_PAGE_SIZE - 1),
    getStaffSummary(days),
    getStaffSummary(null),
    getDailyActivity(id, days),
    getActiveCities(),
  ]);

  if (!profile) notFound();

  const periodStats = summary.rows.get(id);
  const lifetime = allTime.rows.get(id);
  const totalPages = Math.max(1, Math.ceil((activityCount ?? 0) / ACTIVITY_PAGE_SIZE));
  const logs = (activityLogs ?? []) as unknown as Array<{
    id: string;
    action_type: string;
    verification_status: string | null;
    changed_fields: string[] | null;
    notes: string | null;
    created_at: string | null;
    library_branches: { display_name: string; slug: string; city: string } | null;
  }>;
  const existingAssignmentLocalityIds = (assignments ?? [])
    .map((assignment) => assignment.locality_id)
    .filter((value): value is string => Boolean(value));

  return (
    <div className="space-y-8 p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin/team" className="text-xs font-medium text-muted-foreground hover:underline">
            ← Team
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-black">{profile.full_name || "Unnamed user"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{profile.email || "No email found"}</p>
        </div>
        <nav aria-label="Date range" className="flex rounded-full border border-border bg-white p-1 text-sm">
          {RANGE_OPTIONS.map((option) => (
            <Link
              key={option.value}
              href={`/admin/team/${id}?range=${option.value}`}
              className={`rounded-full px-3 py-1.5 font-medium ${days === option.value ? "bg-black text-white" : "text-muted-foreground hover:text-black"}`}
            >
              {option.label}
            </Link>
          ))}
        </nav>
      </div>

      <ActivityChart data={daily} />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="rounded-xl border border-border bg-white p-6">
          <h2 className="mb-4 text-lg font-bold text-black">Access control</h2>
          <form action={saveStaffAccess} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="user_id" value={profile.id} />
            <select name="role" defaultValue={staff?.role ?? "sales"} className="rounded-md border border-border bg-white px-3 py-2 text-sm" aria-label="Role">
              <option value="sales">Sales</option>
              <option value="admin">Admin</option>
            </select>
            <select
              name="is_approved"
              defaultValue={String(staff?.is_approved ?? false)}
              className="rounded-md border border-border bg-white px-3 py-2 text-sm"
              aria-label="Approval"
            >
              <option value="false">Pending</option>
              <option value="true">Approved</option>
            </select>
            <FormSubmitButton className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white" pendingLabel="Saving...">
              Save access
            </FormSubmitButton>
          </form>
          <dl className="mt-6 grid grid-cols-3 gap-3 text-sm">
            {[
              { label: `Actions (${days}d)`, value: periodStats?.total ?? 0 },
              { label: "Edits", value: periodStats?.edits ?? 0 },
              { label: "Verified", value: periodStats?.verifications ?? 0 },
              { label: "All-time actions", value: lifetime?.total ?? 0 },
              { label: "All-time edits", value: lifetime?.edits ?? 0 },
              { label: "All-time verified", value: lifetime?.verifications ?? 0 },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg bg-muted/40 p-3">
                <dt className="text-xs text-muted-foreground">{stat.label}</dt>
                <dd className="text-xl font-bold text-black">{stat.value.toLocaleString("en-IN")}</dd>
              </div>
            ))}
          </dl>
          {lifetime?.last_action_at ? (
            <p className="mt-3 text-xs text-muted-foreground">Last action {new Date(lifetime.last_action_at).toLocaleString("en-IN")}</p>
          ) : null}
        </div>

        <div className="rounded-xl border border-border bg-white p-6">
          <h2 className="mb-4 text-lg font-bold text-black">Locality assignments</h2>
          <AssignmentForm
            userId={profile.id}
            cities={cities.map((city) => city.name)}
            existingAssignmentLocalityIds={existingAssignmentLocalityIds}
            action={assignLocalities}
          />

          {(assignments ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No assignments yet.</p>
          ) : (
            <form action={removeLocalityAssignment} className="space-y-2">
              <input type="hidden" name="user_id" value={profile.id} />
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {(assignments ?? []).map((assignment) => (
                  <label key={assignment.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                    <input type="checkbox" name="assignment_id" value={assignment.id} />
                    <span className="flex-1">
                      {assignment.locality}, {assignment.city}
                    </span>
                    {!assignment.locality_id ? <span className="text-xs text-amber-700">not linked</span> : null}
                  </label>
                ))}
              </div>
              <FormSubmitButton
                className="h-auto rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 shadow-none hover:bg-rose-50"
                pendingLabel="Removing..."
              >
                Remove selected
              </FormSubmitButton>
            </form>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-black">Activity</h2>
          <p className="text-xs text-muted-foreground">{(activityCount ?? 0).toLocaleString("en-IN")} actions in total</p>
        </div>
        <div className="space-y-3">
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="rounded-lg border border-border px-4 py-4 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-black">
                      {formatActionType(log.action_type)}
                      {log.library_branches ? (
                        <>
                          {" · "}
                          <Link
                            href={`/${log.library_branches.city.toLowerCase()}/library/${log.library_branches.slug}`}
                            target="_blank"
                            className="font-medium text-primary hover:underline"
                          >
                            {log.library_branches.display_name}
                          </Link>
                        </>
                      ) : null}
                    </p>
                    {log.verification_status ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Set status to{" "}
                        <span className="font-medium text-black">{log.verification_status === "verified" ? "Verified" : "Not Verified"}</span>
                      </p>
                    ) : null}
                    {log.changed_fields?.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {log.changed_fields
                          .filter((field) => !field.startsWith("last_"))
                          .map((field) => (
                            <span key={field} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                              {formatFieldName(field)}
                            </span>
                          ))}
                      </div>
                    ) : log.action_type === "library_updated" ? (
                      <p className="mt-2 text-sm text-muted-foreground">Reviewed, nothing changed</p>
                    ) : null}
                    {log.notes ? <p className="mt-2 text-xs text-muted-foreground">{log.notes}</p> : null}
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    {new Date(log.created_at || "").toLocaleString("en-IN")}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        {totalPages > 1 ? (
          <div className="mt-6 flex items-center justify-between text-sm">
            <p className="text-muted-foreground">
              Page {currentPage} of {totalPages}
            </p>
            <div className="flex gap-2">
              {currentPage > 1 ? (
                <Link href={`/admin/team/${id}?range=${days}&page=${currentPage - 1}`} className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted">
                  Previous
                </Link>
              ) : null}
              {currentPage < totalPages ? (
                <Link href={`/admin/team/${id}?range=${days}&page=${currentPage + 1}`} className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted">
                  Next
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
