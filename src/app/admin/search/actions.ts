"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { requireApprovedStaff } from "@/lib/staff-access";
import { redirectWithError, redirectWithNotice } from "@/lib/flash";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = ["locality", "metro", "library"] as const;

export async function setAliasStatus(formData: FormData): Promise<void> {
  await requireApprovedStaff(["admin"]);
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!UUID.test(id) || !["approved", "rejected", "pending"].includes(status)) {
    redirectWithError("/admin/search", "Invalid alias update.");
  }
  const { error } = await supabaseServer
    .from("place_aliases")
    .update({ status, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) redirectWithError("/admin/search", error.message);
  revalidateTag("search-index", "max");
  revalidatePath("/admin/search");
  redirectWithNotice("/admin/search", status === "approved" ? "Alias approved. Search updates within minutes." : "Alias updated.");
}

export async function addAlias(formData: FormData): Promise<void> {
  await requireApprovedStaff(["admin"]);
  const city = String(formData.get("city") ?? "").trim().toLowerCase();
  const alias = String(formData.get("alias") ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const target = String(formData.get("target") ?? "").trim();
  const type = String(formData.get("type") ?? "locality") as (typeof TYPES)[number];

  if (!city || alias.length < 2 || alias.length > 40 || !target || target.length > 120 || !TYPES.includes(type)) {
    redirectWithError("/admin/search", "Enter a city, an alias (2–40 characters) and the exact place name.");
  }

  const { error } = await supabaseServer.from("place_aliases").insert({
    place_type: type,
    target_type: type,
    canonical_name: target,
    alias_text: alias,
    city,
    status: "approved",
    source: "manual",
    is_active: true,
  } as never);
  if (error) redirectWithError("/admin/search", error.message);
  revalidateTag("search-index", "max");
  revalidatePath("/admin/search");
  redirectWithNotice("/admin/search", `“${alias}” now finds ${target}.`);
}
