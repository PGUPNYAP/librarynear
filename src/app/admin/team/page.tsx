import Link from "next/link";
import { FormSubmitButton } from "@/components/form-submit-button";
import { ActivityChart, Sparkline } from "@/components/admin/activity-chart";
import { supabaseServer } from "@/lib/supabase-server";
import { requireApprovedStaff } from "@/lib/staff-access";
import { getDailyActivity, getStaffSummary, parseRange, RANGE_OPTIONS } from "@/lib/team-stats";
import { addStaffByEmail, revokeStaffInvite, saveStaffAccess } from "./actions";

type StaffRow = { user_id: string; role: string; is_approved: boolean };

export default async function AdminTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireApprovedStaff(["admin"]);
  const { range } = await searchParams;
  const days = parseRange(range);

  const [{ data: staffUsers }, { data: invites }, summary, allTime, teamDaily] = await Promise.all([
    supabaseServer.from("staff_users").select("user_id, role, is_approved").order("created_at", { ascending: false }),
    supabaseServer.from("staff_invites" as never).select("email, role, is_approved, created_at").order("created_at" as never, { ascending: false }),
    getStaffSummary(days),
    getStaffSummary(null),
    getDailyActivity(null, days),
  ]);

  const staff = (staffUsers ?? []) as StaffRow[];
  const ids = staff.map((row) => row.user_id);
  // One query for every profile instead of one per member.
  const { data: profiles } = ids.length
    ? await supabaseServer.from("profiles").select("id, full_name, email").in("id", ids)
    : { data: [] as Array<{ id: string; full_name: string | null; email: string | null }> };
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  const memberDaily = new Map(
    await Promise.all(
      staff
        .filter((row) => row.is_approved)
        .slice(0, 30)
        .map(async (row) => [row.user_id, await getDailyActivity(row.user_id, days)] as const),
    ),
  );

  const pendingInvites = (invites ?? []) as Array<{ email: string; role: string; is_approved: boolean; created_at: string }>;

  return (
    <div className="space-y-8 p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-bold text-black">Team</h1>
          <p className="text-sm text-muted-foreground">Access, assignments and what each person has done.</p>
        </div>
        <nav aria-label="Date range" className="flex rounded-full border border-border bg-white p-1 text-sm">
          {RANGE_OPTIONS.map((option) => (
            <Link
              key={option.value}
              href={`/admin/team?range=${option.value}`}
              className={`rounded-full px-3 py-1.5 font-medium ${days === option.value ? "bg-black text-white" : "text-muted-foreground hover:text-black"}`}
            >
              {option.label}
            </Link>
          ))}
        </nav>
      </div>

      {summary.missingRpc ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Team stats need the latest database migration (staff_activity_summary). Run it to see numbers here.
        </p>
      ) : null}

      <ActivityChart data={teamDaily} title="Team activity" />

      <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full whitespace-nowrap text-left text-sm">
          <thead className="border-b border-border bg-muted/50 font-medium text-muted-foreground">
            <tr>
              <th className="px-6 py-4">Name</th>
              <th className="px-6 py-4">Role &amp; access</th>
              <th className="px-6 py-4 text-right">Actions ({days}d)</th>
              <th className="px-6 py-4 text-right">Edits</th>
              <th className="px-6 py-4 text-right">Verified</th>
              <th className="px-6 py-4">Trend</th>
              <th className="px-6 py-4 text-right">All time</th>
              <th className="px-6 py-4 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {staff.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
                  No staff members added yet.
                </td>
              </tr>
            ) : (
              staff.map((member) => {
                const profile = profileById.get(member.user_id);
                const stat = summary.rows.get(member.user_id);
                const lifetime = allTime.rows.get(member.user_id);
                const trend = memberDaily.get(member.user_id) ?? [];
                return (
                  <tr key={member.user_id} className="hover:bg-muted/40">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-black">{profile?.full_name || "Unnamed user"}</div>
                      <div className="text-xs text-muted-foreground">{profile?.email || "-"}</div>
                    </td>
                    <td className="px-6 py-4">
                      <form action={saveStaffAccess} className="flex items-center gap-2">
                        <input type="hidden" name="user_id" value={member.user_id} />
                        <select name="role" defaultValue={member.role} className="rounded-md border border-border bg-white px-2 py-1 text-xs" aria-label="Role">
                          <option value="sales">Sales</option>
                          <option value="admin">Admin</option>
                        </select>
                        <select
                          name="is_approved"
                          defaultValue={String(member.is_approved)}
                          className="rounded-md border border-border bg-white px-2 py-1 text-xs"
                          aria-label="Approval"
                        >
                          <option value="false">Pending</option>
                          <option value="true">Approved</option>
                        </select>
                        <FormSubmitButton className="rounded-md bg-black px-3 py-1 text-xs font-medium text-white" pendingLabel="Saving...">
                          Save
                        </FormSubmitButton>
                      </form>
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-black">{stat?.total ?? 0}</td>
                    <td className="px-6 py-4 text-right">{stat?.edits ?? 0}</td>
                    <td className="px-6 py-4 text-right">{stat?.verifications ?? 0}</td>
                    <td className="px-6 py-4">
                      <Sparkline values={trend.map((point) => point.total)} />
                    </td>
                    <td className="px-6 py-4 text-right text-muted-foreground">{lifetime?.total ?? 0}</td>
                    <td className="px-6 py-4 text-right">
                      <Link href={`/admin/team/${member.user_id}?range=${days}`} className="text-xs font-medium text-primary hover:underline">
                        Open profile
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-white p-6">
          <h2 className="mb-4 text-lg font-bold text-black">Add staff member</h2>
          <form action={addStaffByEmail} className="flex flex-wrap items-center gap-3">
            <input
              type="email"
              name="email"
              placeholder="Staff email address"
              aria-label="Staff email address"
              className="min-w-[260px] flex-1 rounded-md border border-border px-3 py-2 text-sm"
              required
            />
            <select name="role" defaultValue="sales" className="rounded-md border border-border bg-white px-3 py-2 text-sm" aria-label="Role">
              <option value="sales">Sales</option>
              <option value="admin">Admin</option>
            </select>
            <select name="is_approved" defaultValue="true" className="rounded-md border border-border bg-white px-3 py-2 text-sm" aria-label="Approval">
              <option value="true">Approved</option>
              <option value="false">Pending</option>
            </select>
            <FormSubmitButton className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white" pendingLabel="Adding...">
              Add staff
            </FormSubmitButton>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            They don&apos;t need to have signed in before. Access is applied the first time they sign in with this Google account.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-white p-6">
          <h2 className="mb-4 text-lg font-bold text-black">Pending invites</h2>
          {pendingInvites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending invites.</p>
          ) : (
            <ul className="space-y-2">
              {pendingInvites.map((invite) => (
                <li key={invite.email} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <span>
                    {invite.email} · <span className="capitalize">{invite.role}</span>
                    {invite.is_approved ? "" : " (pending approval)"}
                  </span>
                  <form action={revokeStaffInvite}>
                    <input type="hidden" name="email" value={invite.email} />
                    <button className="text-xs font-medium text-rose-600 hover:underline">Remove</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
