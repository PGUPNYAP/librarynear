"use server";

import { headers } from "next/headers";
import { supabaseServer } from "@/lib/supabase-server";
import { getClientIp, rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { normalizeIndianMobile } from "@/lib/phone";

interface LeadInput {
  library_branch_id: string;
  name: string;
  phone_number: string;
  email?: string;
  message?: string;
  source_page?: string;
  /** Hidden honeypot field; real users leave it empty. */
  website?: string;
  /** Milliseconds since the form was rendered. */
  elapsed_ms?: number;
}

export type LeadResult =
  | { success: true }
  | { success: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

function cleanText(value: string | undefined, max: number) {
  return (value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export async function submitLead(input: LeadInput): Promise<LeadResult> {
  // Bots: honeypot filled or submitted faster than a human can type.
  // Pretend success so they don't retry with a different strategy.
  if (input.website?.trim() || (typeof input.elapsed_ms === "number" && input.elapsed_ms < 1500)) {
    return { success: true };
  }

  const ip = getClientIp(await headers());
  const [minute, day] = await Promise.all([
    rateLimit(ip, RATE_LIMITS.submitLead),
    rateLimit(ip, RATE_LIMITS.submitLeadDaily),
  ]);
  if (!minute.success || !day.success) {
    return { success: false, error: "Too many requests. Please wait a moment and try again." };
  }

  const name = cleanText(input.name, 120);
  if (name.length < 2) return { success: false, error: "Please enter your name." };
  if (!/\p{L}/u.test(name)) return { success: false, error: "Please enter a real name." };

  // Accepts "+91 98765 43210", "098765-43210", "0091…", "9876543210".
  const phone = normalizeIndianMobile(input.phone_number);
  if (!phone) {
    return { success: false, error: "Enter a valid Indian mobile number, e.g. 98765 43210." };
  }

  const email = cleanText(input.email, 320).toLowerCase();
  if (email && !EMAIL.test(email)) return { success: false, error: "Enter a valid email address." };
  const message = cleanText(input.message, 2000);

  if (!UUID.test(input.library_branch_id ?? "")) {
    return { success: false, error: "Invalid library reference." };
  }

  const { data: library } = await supabaseServer
    .from("library_branches")
    .select("id")
    .eq("id", input.library_branch_id)
    .eq("is_active", true)
    .maybeSingle();
  if (!library) return { success: false, error: "This library is no longer listed." };

  // Same person enquiring about the same library twice in 24h: keep one lead.
  const since = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
  const { count: duplicates } = await supabaseServer
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("library_branch_id", input.library_branch_id)
    .eq("phone_normalized" as never, phone as never)
    .gte("created_at", since);
  if ((duplicates ?? 0) > 0) {
    return { success: true };
  }

  const sourcePage = cleanText(input.source_page, 300);
  const { error } = await supabaseServer.from("leads").insert({
    library_branch_id: input.library_branch_id,
    name,
    phone_number: phone,
    phone_normalized: phone,
    email: email || null,
    message: message || null,
    status: "new",
    source_page: sourcePage.startsWith("/") ? sourcePage : null,
    preferred_contact_method: "phone",
  } as never);

  if (error) {
    console.error("Lead insert error:", error.message);
    return { success: false, error: "Something went wrong. Please try calling directly." };
  }

  // No cache revalidation: leads are not shown on any public page.
  return { success: true };
}
