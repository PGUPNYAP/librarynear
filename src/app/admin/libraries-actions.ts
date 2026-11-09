"use server";

import { supabaseServer } from "@/lib/supabase-server";
import {
  getLibraryCacheTarget,
  revalidateLibraryContent,
} from "@/lib/revalidate-library-content";
import { getCurrentActorUserId, logLibraryActivity } from "@/lib/library-activity";
import { getLibraryMutationAccess } from "@/lib/staff-access";

export async function setLibraryVerificationStatus(id: string, newStatus: "verified" | "unverified") {
  if (newStatus !== "verified" && newStatus !== "unverified") {
    return { ok: false as const, error: "Unknown status." };
  }
  // Admins: any library. Sales: only libraries in their assigned localities.
  const staff = await getLibraryMutationAccess(id);
  if (!staff) {
    return { ok: false as const, error: "You can only verify libraries in your assigned localities." };
  }
  const actorUserId = await getCurrentActorUserId();

  const { error } = await supabaseServer
    .from("library_branches")
    .update({
      verification_status: newStatus,
      last_verification_updated_at: new Date().toISOString(),
      last_verification_updated_by: actorUserId,
    })
    .eq("id", id);

  if (error) {
    console.error("Failed to toggle verification", error);
    return { ok: false as const, error: "Could not save. Please try again." };
  }

  revalidateLibraryContent(await getLibraryCacheTarget(id));
  await logLibraryActivity({
    libraryBranchId: id,
    actionType: "verification_updated",
    verificationStatus: newStatus,
    changedFields: ["verification_status"],
  });

  return { ok: true as const, newStatus };
}
