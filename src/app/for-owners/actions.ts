"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { upsertProfileFromUser } from "@/lib/auth/profile";
import { buildLibraryFeePlanInsertRows } from "@/lib/library-plans";
import {
  cleanLibraryForm,
  emptyLibraryFormValues,
  planRowsToDrafts,
  validateLibraryForm,
  type FieldErrors,
  type LibraryFormValues,
  type PlanRow,
} from "@/lib/library-form";
import { refreshLibraryProfileCompletenessScore } from "@/lib/library-profile-score-server";
import { findNearestMetro } from "@/lib/nearest-metro";
import {
  getLibraryCacheTarget,
  revalidateLibraryContent,
} from "@/lib/revalidate-library-content";
import { supabaseServer } from "@/lib/supabase-server";
import { isValidLatitude, isValidLongitude } from "@/lib/owner-form-validation";
import { logLibraryActivity } from "@/lib/library-activity";
import { resolveLocationInput } from "@/lib/server/resolve-location";
import { canonicalMapLink } from "@/lib/maps-coordinates";
import { cleanupImageKitFiles, isOwnerSubmissionImageUrl } from "@/lib/server/imagekit";
import { getClientIp, rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

const MAX_OWNER_PHOTOS = 3;

type EditableOwnerSubmissionStatus = "needs_changes" | "rejected";

type ExistingOwnerSubmission = {
  id: string;
  status: string;
  image_urls: string[] | null;
  submitted_library_branch_id: string | null;
  display_name: string | null;
  city: string | null;
  locality: string | null;
  district: string | null;
  state: string | null;
  pin_code: string | null;
  full_address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone_number: string | null;
  whatsapp_number: string | null;
  opening_time: string | null;
  closing_time: string | null;
  total_seats: number | null;
  map_link: string | null;
  description: string | null;
  amenities_text: string | null;
};

/** An existing listing that looks like the same library (same phone, or same name in the same locality). */
async function findPossibleDuplicate(phone: string | null, displayName: string, locality: string, city: string) {
  if (phone) {
    const { data } = await supabaseServer
      .from("library_branches")
      .select("id")
      .eq("is_active", true)
      .eq("phone_number", phone)
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }
  const namePattern = displayName.replace(/[%_\\]/g, "").trim();
  if (namePattern.length < 3) return null;
  const { data } = await supabaseServer
    .from("library_branches")
    .select("id")
    .eq("is_active", true)
    .eq("city", city)
    .ilike("display_name", namePattern)
    .ilike("locality", locality.replace(/[%_\\]/g, ""))
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

function isEditableOwnerSubmissionStatus(status: string): status is EditableOwnerSubmissionStatus {
  return status === "needs_changes" || status === "rejected";
}

async function loadExistingOwnerSubmission(userId: string) {
  const { data, error } = await supabaseServer
    .from("owner_library_submissions")
    .select("id, status, image_urls, submitted_library_branch_id, display_name, city, locality, district, state, pin_code, full_address, latitude, longitude, phone_number, whatsapp_number, opening_time, closing_time, total_seats, map_link, description, amenities_text")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to load owner submission:", error.message);
    return null;
  }

  return (data as ExistingOwnerSubmission | null) ?? null;
}

export type OwnerSubmitResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: FieldErrors; photoError?: string };

const CHECK_FIELDS = "Please fix the highlighted fields.";

export async function submitOwnerLibrary(
  values: LibraryFormValues,
  photos: { existing: string[]; uploaded: Array<{ url: string; fileId: string }> },
): Promise<OwnerSubmitResult> {
  const hdrs = await headers();
  const ip = getClientIp(hdrs);
  const rateCheck = await rateLimit(ip, RATE_LIMITS.submitOwnerLibrary);
  if (!rateCheck.success) {
    return { ok: false, error: "Too many attempts. Wait a minute and try again. Your details are safe here." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Your sign-in has expired. Refresh and sign in again. Your details are saved on this device." };
  }

  await upsertProfileFromUser(user);

  const existingSubmission = await loadExistingOwnerSubmission(user.id);
  if (existingSubmission && !isEditableOwnerSubmissionStatus(existingSubmission.status)) {
    return { ok: false, error: "You already have a library under review. You can edit its plans on this page." };
  }

  const uploadedFileIds = photos.uploaded.map((photo) => photo.fileId);

  const fieldErrors = validateLibraryForm(values, { mode: "owner" });
  if (Object.keys(fieldErrors).length > 0) {
    return ({ ok: false, error: CHECK_FIELDS, fieldErrors });
  }

  const totalPhotos = photos.existing.length + photos.uploaded.length;
  if (totalPhotos === 0) return ({ ok: false, error: CHECK_FIELDS, photoError: "Add at least 1 photo of your library." });
  if (totalPhotos > MAX_OWNER_PHOTOS) return ({ ok: false, error: CHECK_FIELDS, photoError: `Add at most ${MAX_OWNER_PHOTOS} photos.` });

  const clean = cleanLibraryForm(values);

  let latitude = clean.latitude;
  let longitude = clean.longitude;
  let mapLink = clean.map_link;
  if (latitude === null || longitude === null) {
    const resolved = await resolveLocationInput(clean.map_link);
    if (!resolved.ok) {
      return { ok: false, error: CHECK_FIELDS, fieldErrors: { map_link: "We couldn't read a location from this. Paste a Google Maps link, or tap I'm at the library now." } };
    }
    latitude = resolved.latitude;
    longitude = resolved.longitude;
    mapLink = resolved.mapLink;
  } else {
    mapLink = canonicalMapLink(clean.map_link, { latitude, longitude });
  }
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    return { ok: false, error: CHECK_FIELDS, fieldErrors: { latitude: "This location doesn't look right. Check the numbers." } };
  }

  const imageUrls = [...photos.existing, ...photos.uploaded.map((photo) => photo.url)];
  if (!imageUrls.every((url) => isOwnerSubmissionImageUrl(url, user.id))) {
    await cleanupImageKitFiles(uploadedFileIds);
    return { ok: false, error: CHECK_FIELDS, photoError: "One of the photos couldn't be verified. Remove it and upload it again." };
  }

  const nearestMetro = await findNearestMetro(latitude, longitude);

  // Flag (don't block) submissions that look like one of our existing listings,
  // so an admin can check ownership before approving.
  const possibleDuplicateOf = await findPossibleDuplicate(clean.phone_number, clean.display_name, clean.locality, clean.city);

  const payload = {
    user_id: user.id,
    ownership_status: "unverified",
    possible_duplicate_of: possibleDuplicateOf,
    display_name: clean.display_name,
    city: clean.city,
    locality: clean.locality,
    district: clean.district,
    state: clean.state,
    pin_code: clean.pin_code,
    full_address: clean.full_address,
    nearest_metro: nearestMetro?.nearest_metro ?? null,
    nearest_metro_distance_km: nearestMetro?.nearest_metro_distance_km ?? null,
    latitude,
    longitude,
    phone_number: clean.phone_number,
    whatsapp_number: clean.whatsapp_number,
    opening_time: clean.opening_time,
    closing_time: clean.closing_time,
    total_seats: clean.total_seats,
    map_link: mapLink,
    description: clean.description,
    amenities_text: clean.amenities_text,
    image_urls: imageUrls,
    fee_plans: clean.plans.length > 0 ? clean.plans : null,
    status: "pending_review",
    reviewer_notes: null,
    reviewed_at: null,
    updated_at: new Date().toISOString(),
  };

  const error = existingSubmission
    ? (
        await supabaseServer
          .from("owner_library_submissions")
          .update({
            ...payload,
            submitted_library_branch_id: existingSubmission.submitted_library_branch_id,
          } as never)
          .eq("id", existingSubmission.id)
          .eq("user_id", user.id)
      ).error
    : (
        await supabase
          .from("owner_library_submissions")
          .insert(payload as never)
      ).error;

  if (error) {
    console.error("Failed to create owner submission:", error.message);
    // Photos stay uploaded so a retry doesn't need them again; the nightly cleanup removes abandoned ones.
    return { ok: false, error: "We couldn't submit your listing, and nothing was saved. Try again in a moment." };
  }

  // These photos are now part of a submission; stop tracking them for cleanup.
  if (uploadedFileIds.length > 0) {
    await supabaseServer.from("pending_uploads" as never).delete().in("file_id" as never, uploadedFileIds as never);
  }

  return { ok: true };
}

export async function updateOwnerSubmissionPlans(
  submissionId: string,
  rows: PlanRow[],
  confirmRemoveAll: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ip = getClientIp(await headers());
  const rateCheck = await rateLimit(ip, RATE_LIMITS.ownerPlansUpdate);
  if (!rateCheck.success) {
    return { ok: false, error: "Too many saves. Wait a minute and try again." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Your sign-in has expired. Refresh and sign in again." };
  }

  const check = validateLibraryForm({ ...emptyLibraryFormValues(), plans: rows }, { mode: "staff" });
  const planProblem = Object.entries(check).find(([key]) => key.startsWith("plans"));
  if (!submissionId || planProblem) {
    return { ok: false, error: planProblem ? planProblem[1] : "We couldn't find this listing." };
  }

  const feePlans = planRowsToDrafts(rows);

  // An empty payload must not silently delete every plan.
  if (feePlans.length === 0 && !confirmRemoveAll) {
    return { ok: false, error: "No plans to save, so we kept your current ones." };
  }

  const { data: submission, error: submissionError } = await supabaseServer
    .from("owner_library_submissions")
    .select("id, user_id, status, submitted_library_branch_id, display_name")
    .eq("id", submissionId)
    .maybeSingle();

  if (submissionError || !submission || submission.user_id !== user.id) {
    return { ok: false, error: "We couldn't find this listing on your account." };
  }

  const { error } = await supabaseServer
    .from("owner_library_submissions")
    .update({
      fee_plans: feePlans,
      updated_at: new Date().toISOString(),
    })
    .eq("id", submissionId);

  if (error) {
    return { ok: false, error: "We couldn't save your plans. Try again in a moment." };
  }

  if (submission.submitted_library_branch_id) {
    const libraryBranchId = submission.submitted_library_branch_id;
    const previousTarget = await getLibraryCacheTarget(libraryBranchId);

    const { error: replacePlansError } = await supabaseServer.rpc(
      "replace_library_fee_plans" as never,
      {
        p_library_branch_id: libraryBranchId,
        p_plans: buildLibraryFeePlanInsertRows(feePlans, libraryBranchId),
      } as never,
    );
    if (replacePlansError) {
      console.error("Failed to replace library fee plans:", replacePlansError.message);
      return { ok: false, error: "We couldn't update your public page. Try again in a moment." };
    }

    await refreshLibraryProfileCompletenessScore(libraryBranchId);
    const nextTarget = await getLibraryCacheTarget(libraryBranchId);
    revalidateLibraryContent(previousTarget);
    revalidateLibraryContent(nextTarget);
    await logLibraryActivity({
      libraryBranchId,
      actionType: "owner_plans_updated",
      changedFields: ["fee_plans"],
      notes: `Owner updated plans for ${submission.display_name}.`,
    });
  }

  return { ok: true };
}
