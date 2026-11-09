"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentActorUserId } from "@/lib/library-activity";
import { requireApprovedStaff } from "@/lib/staff-access";
import { redirectWithError, redirectWithNotice } from "@/lib/flash";
import { rpcAll } from "@/lib/rpc-all";

const VALID_STAFF_ROLES = ["admin", "sales"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidStaffRole(role: string): role is (typeof VALID_STAFF_ROLES)[number] {
  return (VALID_STAFF_ROLES as readonly string[]).includes(role);
}

function safeReturnPath(value: FormDataEntryValue | null, fallback: string) {
  const path = String(value ?? "");
  return path.startsWith("/admin/") && !path.startsWith("//") ? path : fallback;
}

export async function saveStaffAccess(formData: FormData): Promise<void> {
  const staff = await requireApprovedStaff(["admin"]);
  const userId = String(formData.get("user_id") ?? "");
  const role = String(formData.get("role") ?? "");
  const isApproved = formData.get("is_approved") === "true";
  const actorUserId = await getCurrentActorUserId();
  const back = UUID.test(userId) ? `/admin/team/${userId}` : "/admin/team";

  if (!UUID.test(userId) || !isValidStaffRole(role)) {
    redirectWithError("/admin/team", "Pick a valid role.");
  }
  if (userId === staff.user.id && (!isApproved || role !== "admin")) {
    redirectWithError(back, "You can't remove your own admin access.");
  }

  const { error } = await supabaseServer.from("staff_users").upsert({
    user_id: userId,
    role,
    is_approved: isApproved,
    approved_by: isApproved ? actorUserId : null,
    approved_at: isApproved ? new Date().toISOString() : null,
  });

  if (error) {
    redirectWithError(back, `Could not save access: ${error.message}`);
  }

  revalidatePath("/admin/team");
  revalidatePath(`/admin/team/${userId}`);
  redirectWithNotice(back, "Access saved.");
}

/**
 * Adds a staff member by email. If the person has never signed in, an invite
 * is stored and applied automatically on their first sign-in.
 */
export async function addStaffByEmail(formData: FormData): Promise<void> {
  await requireApprovedStaff(["admin"]);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "sales").trim();
  const isApproved = formData.get("is_approved") === "true";
  const actorUserId = await getCurrentActorUserId();

  if (!EMAIL.test(email) || email.length > 320 || !isValidStaffRole(role)) {
    redirectWithError("/admin/team", "Enter a valid email address and role.");
  }

  const { data: profile } = await supabaseServer
    .from("profiles")
    .select("id, email")
    .ilike("email", email)
    .maybeSingle();

  if (!profile?.id) {
    const { error } = await supabaseServer
      .from("staff_invites" as never)
      .upsert({ email, role, is_approved: isApproved, invited_by: actorUserId } as never);
    if (error) {
      redirectWithError("/admin/team", `Could not save the invite: ${error.message}`);
    }
    revalidatePath("/admin/team");
    redirectWithNotice(
      "/admin/team",
      `${email} hasn't signed in yet. They'll get ${role} access automatically the first time they sign in with Google.`,
    );
  }

  const { error } = await supabaseServer.from("staff_users").upsert({
    user_id: profile.id,
    role,
    is_approved: isApproved,
    approved_by: isApproved ? actorUserId : null,
    approved_at: isApproved ? new Date().toISOString() : null,
  });

  if (error) {
    redirectWithError("/admin/team", `Could not add staff: ${error.message}`);
  }

  revalidatePath("/admin/team");
  revalidatePath(`/admin/team/${profile.id}`);
  redirectWithNotice(`/admin/team/${profile.id}`, "Staff member added.");
}

export async function revokeStaffInvite(formData: FormData): Promise<void> {
  await requireApprovedStaff(["admin"]);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  await supabaseServer.from("staff_invites" as never).delete().eq("email" as never, email as never);
  revalidatePath("/admin/team");
  redirectWithNotice("/admin/team", "Invite removed.");
}

/**
 * Assign one or many localities (checkbox values named locality_id) to one or
 * many staff members (values named user_id). Already-assigned pairs are skipped.
 */
export async function assignLocalities(formData: FormData): Promise<void> {
  await requireApprovedStaff(["admin"]);
  const userIds = [...new Set(formData.getAll("user_id").map(String).filter((id) => UUID.test(id)))];
  const localityIds = [...new Set(formData.getAll("locality_id").map(String).filter((id) => UUID.test(id)))];
  const back = safeReturnPath(formData.get("return_to"), userIds[0] ? `/admin/team/${userIds[0]}` : "/admin/assignments");
  const actorUserId = await getCurrentActorUserId();

  if (userIds.length === 0) redirectWithError(back, "Pick at least one staff member.");
  if (localityIds.length === 0) redirectWithError(back, "Pick at least one locality.");
  if (localityIds.length > 500) redirectWithError(back, "Assign at most 500 localities at once.");

  const { data: localities, error: localityError } = await supabaseServer
    .from("localities")
    .select("id, city, name")
    .in("id", localityIds);
  if (localityError || !localities?.length) {
    redirectWithError(back, "Those localities were not found.");
  }

  const { data: existing } = await supabaseServer
    .from("sales_locality_assignments")
    .select("user_id, locality_id")
    .in("user_id", userIds)
    .in("locality_id", localityIds);
  const taken = new Set((existing ?? []).map((row) => `${row.user_id}:${row.locality_id}`));

  const rows = userIds.flatMap((userId) =>
    localities
      .filter((locality) => !taken.has(`${userId}:${locality.id}`))
      .map((locality) => ({
        user_id: userId,
        locality_id: locality.id,
        city: locality.city,
        locality: locality.name,
        assigned_by: actorUserId,
      })),
  );

  if (rows.length > 0) {
    const { error } = await supabaseServer.from("sales_locality_assignments").insert(rows);
    if (error) redirectWithError(back, `Could not assign: ${error.message}`);
  }

  for (const userId of userIds) revalidatePath(`/admin/team/${userId}`);
  revalidatePath("/admin/assignments");
  revalidatePath("/sales/libraries");
  const skipped = userIds.length * localities.length - rows.length;
  redirectWithNotice(back, `Assigned ${rows.length} locality ${rows.length === 1 ? "slot" : "slots"}${skipped ? ` (${skipped} already assigned)` : ""}.`);
}

/** Back-compat for the single-locality form. */
export async function assignLocality(formData: FormData): Promise<void> {
  return assignLocalities(formData);
}

export async function removeLocalityAssignment(formData: FormData): Promise<void> {
  await requireApprovedStaff(["admin"]);
  const assignmentIds = formData.getAll("assignment_id").map(String).filter((id) => UUID.test(id));
  const userId = String(formData.get("user_id") ?? "");
  const back = UUID.test(userId) ? `/admin/team/${userId}` : "/admin/team";

  if (assignmentIds.length === 0) {
    redirectWithError(back, "Nothing selected to remove.");
  }

  const { error } = await supabaseServer.from("sales_locality_assignments").delete().in("id", assignmentIds);
  if (error) {
    redirectWithError(back, `Could not remove: ${error.message}`);
  }

  revalidatePath(back);
  revalidatePath("/admin/assignments");
  revalidatePath("/sales/libraries");
  redirectWithNotice(back, `Removed ${assignmentIds.length} assignment${assignmentIds.length === 1 ? "" : "s"}.`);
}

/** Localities in a city with library counts, for the assignment picker. */
export async function listAssignableLocalities(city: string) {
  await requireApprovedStaff(["admin"]);
  const { data, error } = await rpcAll<{
    locality_id: string;
    city: string;
    name: string;
    library_count: number;
    unverified_count: number;
    assignee_count: number;
  }>("locality_assignment_overview", { p_city: city });
  if (error) return { ok: false as const, error: error.message, localities: [] };
  return { ok: true as const, localities: data };
}
