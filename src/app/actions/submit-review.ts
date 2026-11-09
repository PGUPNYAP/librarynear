"use server";

import { headers } from "next/headers";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseServer } from "@/lib/supabase-server";
import { upsertProfileFromUser } from "@/lib/auth/profile";
import { getClientIp, rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

const REVIEW_MIN_LENGTH = 10;
const REVIEW_MAX_LENGTH = 2000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ReviewResult = { success: true; updated: boolean } | { error: string };

/**
 * Reviews publish immediately. All writes go through here with the service
 * role (the public key can no longer write reviews), so users can't change a
 * review's status, e.g. un-hide one that staff hid. A second review from the
 * same person updates their review; the previous text is kept in
 * library_review_revisions by a database trigger.
 */
export async function submitReview(
  libraryBranchId: string,
  rating: number,
  reviewText: string,
  pathname: string,
): Promise<ReviewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in to leave a review." };
  }

  const ip = getClientIp(await headers());
  const [minute, day] = await Promise.all([
    rateLimit(`${user.id}`, RATE_LIMITS.submitReview),
    rateLimit(`${user.id}:${ip}`, RATE_LIMITS.submitReviewDaily),
  ]);
  if (!minute.success || !day.success) {
    return { error: "You're posting reviews too quickly. Please try again later." };
  }

  if (!UUID.test(libraryBranchId)) {
    return { error: "Invalid library." };
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: "Rating must be between 1 and 5." };
  }

  const text = String(reviewText ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length < REVIEW_MIN_LENGTH) {
    return { error: `Please write at least ${REVIEW_MIN_LENGTH} characters.` };
  }
  if (text.length > REVIEW_MAX_LENGTH) {
    return { error: `Reviews can be at most ${REVIEW_MAX_LENGTH} characters.` };
  }
  if ((text.match(/https?:\/\//gi) ?? []).length > 2) {
    return { error: "Please remove the links from your review." };
  }

  const { data: library } = await supabaseServer
    .from("library_branches")
    .select("id")
    .eq("id", libraryBranchId)
    .eq("is_active", true)
    .maybeSingle();
  if (!library) {
    return { error: "This library is no longer listed." };
  }

  // Reviews reference profiles; make sure the row exists.
  await upsertProfileFromUser(user);

  const { data: existing } = await supabaseServer
    .from("library_reviews")
    .select("id, status")
    .eq("library_branch_id", libraryBranchId)
    .eq("user_id", user.id)
    .or("source.is.null,source.eq.user")
    .maybeSingle();

  let updated = false;
  if (existing) {
    // Editing keeps the staff decision: a hidden review stays hidden.
    const { error } = await supabaseServer
      .from("library_reviews")
      .update({ rating, review_text: text, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) {
      console.error("Failed to update review:", error.message);
      return { error: "Failed to save your review. Please try again later." };
    }
    updated = true;
  } else {
    const { error } = await supabaseServer.from("library_reviews").insert({
      library_branch_id: libraryBranchId,
      user_id: user.id,
      rating,
      review_text: text,
      status: "published",
      source: "user",
    } as never);
    if (error) {
      console.error("Failed to insert review:", error.message);
      return { error: "Failed to submit your review. Please try again later." };
    }
  }

  revalidateTag("library-reviews", "max");
  revalidateTag("library-detail", "max");
  if (typeof pathname === "string" && pathname.startsWith("/") && !pathname.startsWith("//")) {
    revalidatePath(pathname);
  }

  return { success: true, updated };
}
