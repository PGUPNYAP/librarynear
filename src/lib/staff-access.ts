import "server-only";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import type { Tables } from "@/types/supabase";
import { getCurrentViewer, upsertProfileFromUser } from "@/lib/auth/profile";

export type StaffRole = "admin" | "sales";

type StaffUser = Tables<"staff_users">;
type Profile = Tables<"profiles">;

function getBootstrapAdminEmails() {
  return (process.env.ADMIN_BOOTSTRAP_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

/** Turn a pending staff invite for this email into a staff_users row. */
async function claimStaffInvite(userId: string, email: string): Promise<StaffUser | null> {
  const { data: invite } = await supabaseServer
    .from("staff_invites" as never)
    .select("email, role, is_approved, invited_by")
    .eq("email" as never, email.toLowerCase() as never)
    .maybeSingle();
  const pending = invite as { role: string; is_approved: boolean; invited_by: string | null } | null;
  if (!pending) return null;

  const { data: created, error } = await supabaseServer
    .from("staff_users")
    .upsert({
      user_id: userId,
      role: pending.role,
      is_approved: pending.is_approved,
      approved_by: pending.is_approved ? pending.invited_by : null,
      approved_at: pending.is_approved ? new Date().toISOString() : null,
    })
    .select("*")
    .maybeSingle();
  if (error) {
    console.error("Failed to claim staff invite:", error.message);
    return null;
  }
  await supabaseServer.from("staff_invites" as never).delete().eq("email" as never, email.toLowerCase() as never);
  return (created as StaffUser | null) ?? null;
}

export async function getCurrentStaffContext() {
  const { user, profile } = await getCurrentViewer();

  if (!user) {
    return {
      user: null,
      staffUser: null as StaffUser | null,
      profile: null as Profile | null,
      bootstrapAdmin: false,
      bootstrapAdminAllowed: false,
    };
  }

  await upsertProfileFromUser(user);

  const [{ data: staffUser }, { count: approvedAdminCount }] = await Promise.all([
    supabaseServer.from("staff_users").select("*").eq("user_id", user.id).maybeSingle(),
    supabaseServer
      .from("staff_users")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("is_approved", true),
  ]);

  let resolvedStaffUser = staffUser as StaffUser | null;
  if (!resolvedStaffUser && user.email) {
    resolvedStaffUser = await claimStaffInvite(user.id, user.email);
  }

  const bootstrapAdmin = (approvedAdminCount ?? 0) === 0;
  const userEmail = user.email?.toLowerCase() ?? "";
  const bootstrapAdminAllowed =
    bootstrapAdmin &&
    userEmail.length > 0 &&
    getBootstrapAdminEmails().includes(userEmail);

  return {
    user,
    staffUser: resolvedStaffUser ?? null,
    profile: (profile as Profile | null) ?? null,
    bootstrapAdmin,
    bootstrapAdminAllowed,
  };
}

export async function requireApprovedStaff(allowedRoles: StaffRole[]) {
  const context = await getCurrentStaffContext();

  if (!context.user) {
    redirect("/staff-access");
  }

  if (context.bootstrapAdminAllowed && allowedRoles.includes("admin")) {
    return {
      ...context,
      effectiveRole: "admin" as StaffRole,
      isApproved: true,
    };
  }

  if (!context.staffUser?.is_approved || !allowedRoles.includes(context.staffUser.role as StaffRole)) {
    redirect("/staff-access");
  }

  return {
    ...context,
    effectiveRole: context.staffUser.role as StaffRole,
    isApproved: true,
  };
}

/**
 * Returns the staff context when the current user may change this library,
 * otherwise null. Admins may touch any library; sales users only libraries
 * whose locality is in their sales_locality_assignments (prevents IDOR via a
 * server action called with an arbitrary library id).
 */
export async function getLibraryMutationAccess(libraryId: string) {
  const context = await getCurrentStaffContext();
  if (!context.user) return null;

  const isBootstrapAdmin = context.bootstrapAdminAllowed;
  const role = isBootstrapAdmin ? "admin" : (context.staffUser?.role as StaffRole | undefined);
  const approved = isBootstrapAdmin || Boolean(context.staffUser?.is_approved);
  if (!approved || (role !== "admin" && role !== "sales")) return null;

  const staff = { ...context, effectiveRole: role, isApproved: true as const };
  if (role === "admin") return staff;

  const { data: library } = await supabaseServer
    .from("library_branches")
    .select("locality_id")
    .eq("id", libraryId)
    .maybeSingle();
  const localityId = (library as { locality_id: string | null } | null)?.locality_id ?? null;
  if (!localityId) return null;

  const { data: assignment } = await supabaseServer
    .from("sales_locality_assignments")
    .select("id")
    .eq("user_id", context.user.id)
    .eq("locality_id", localityId)
    .maybeSingle();

  return assignment ? staff : null;
}

/** Redirecting variant for pages and form actions. */
export async function requireLibraryMutationAccess(libraryId: string) {
  const staff = await getLibraryMutationAccess(libraryId);
  if (!staff) {
    redirect("/sales/libraries?error=" + encodeURIComponent("You are not assigned to this library's locality."));
  }
  return staff;
}

/** Ids of localities assigned to a sales user. */
export async function getAssignedLocalityIds(userId: string) {
  const { data } = await supabaseServer
    .from("sales_locality_assignments")
    .select("locality_id")
    .eq("user_id", userId);
  return (data ?? []).map((row) => row.locality_id).filter((id): id is string => Boolean(id));
}
