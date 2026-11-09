"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { requireApprovedStaff } from "@/lib/staff-access";
import { isLeadStatus } from "@/lib/lead-status";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Leads are admin-only. Status must be one of the fixed values. */
export async function updateLeadStatus(leadId: string, status: string) {
  const staff = await requireApprovedStaff(["admin"]);
  if (!UUID.test(leadId)) return { ok: false as const, error: "Invalid lead." };
  if (!isLeadStatus(status)) return { ok: false as const, error: "Invalid status." };

  const { error } = await supabaseServer
    .from("leads")
    .update({ status, handled_by: staff.user.id, updated_at: new Date().toISOString() } as never)
    .eq("id", leadId);

  if (error) {
    console.error("Failed to update lead status", error);
    return { ok: false as const, error: "Could not save." };
  }

  revalidatePath("/admin");
  return { ok: true as const };
}

export async function updateLeadDetails(leadId: string, input: { notes?: string; followUpAt?: string | null }) {
  const staff = await requireApprovedStaff(["admin"]);
  if (!UUID.test(leadId)) return { ok: false as const, error: "Invalid lead." };

  const notes = typeof input.notes === "string" ? input.notes.trim().slice(0, 2000) : undefined;
  let followUpAt: string | null | undefined = undefined;
  if (input.followUpAt === null || input.followUpAt === "") followUpAt = null;
  else if (typeof input.followUpAt === "string") {
    const date = new Date(input.followUpAt);
    if (Number.isNaN(date.getTime())) return { ok: false as const, error: "Invalid follow-up date." };
    followUpAt = date.toISOString();
  }

  const patch: Record<string, unknown> = { handled_by: staff.user.id, updated_at: new Date().toISOString() };
  if (notes !== undefined) patch.notes = notes || null;
  if (followUpAt !== undefined) {
    patch.follow_up_at = followUpAt;
    if (followUpAt) patch.status = "follow_up";
  }

  const { error } = await supabaseServer.from("leads").update(patch as never).eq("id", leadId);
  if (error) return { ok: false as const, error: "Could not save." };
  revalidatePath("/admin");
  return { ok: true as const };
}
