"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { upsertProfileFromUser } from "@/lib/auth/profile";
import {
  buildLibraryFeePlanInsertRows,
  parsePlanDraftsJson,
} from "@/lib/library-plans";
import { refreshLibraryProfileCompletenessScore } from "@/lib/library-profile-score-server";
import { findNearestMetro } from "@/lib/nearest-metro";
import {
  getLibraryCacheTarget,
  revalidateLibraryContent,
} from "@/lib/revalidate-library-content";
import { supabaseServer } from "@/lib/supabase-server";
import {
  hasValidPlanDescriptions,
  hasValidTimeRange,
  isValidLatitude,
  isValidLongitude,
  isValidPinCode,
  normalizeIndianMobile,
  normalizeIndianPhone,
} from "@/lib/owner-form-validation";
import { logLibraryActivity } from "@/lib/library-activity";
import { resolveGoogleMapsCoordinates } from "@/lib/server/google-maps-resolver";
import { cleanupImageKitFiles, isOwnerSubmissionImageUrl } from "@/lib/server/imagekit";
import { getClientIp, rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

const MAX_OWNER_PHOTOS = 3;

function ownerErrorRedirect(code: string): never {
  redirect(`/for-owners?error=${code}`);
}

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

function getTrimmedString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

const OWNER_CLEARABLE = new Set(["district", "description", "whatsapp_number"]);

/**
 * New submission: the typed value (empty = nothing).
 * Editing a returned submission: the form shows old values as placeholders,
 * so empty keeps the old value unless clear_<field> is ticked.
 */
function readOwnerField(formData: FormData, key: string, existing: string | number | null | undefined, editing: boolean) {
  if (OWNER_CLEARABLE.has(key) && formData.get(`clear_${key}`) === "on") return "";
  const submitted = getTrimmedString(formData, key);
  if (submitted || !editing) return submitted;
  return existing === null || existing === undefined ? "" : String(existing);
}

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

function getExistingImageUrls(formData: FormData) {
  return formData
    .getAll("existing_image_urls")
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function getUploadedImageUrls(formData: FormData) {
  return formData
    .getAll("uploaded_image_urls")
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function getUploadedImageFileIds(formData: FormData) {
  return formData
    .getAll("uploaded_image_file_ids")
    .map((value) => String(value).trim())
    .filter(Boolean);
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

export async function submitOwnerLibrary(formData: FormData) {
  const hdrs = await headers();
  const ip = getClientIp(hdrs);
  const rateCheck = await rateLimit(ip, RATE_LIMITS.submitOwnerLibrary);
  if (!rateCheck.success) {
    redirect("/for-owners?error=rate_limited");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/for-owners");
  }

  await upsertProfileFromUser(user);

  const existingSubmission = await loadExistingOwnerSubmission(user.id);
  if (
    existingSubmission &&
    !isEditableOwnerSubmissionStatus(existingSubmission.status)
  ) {
    ownerErrorRedirect("duplicate_submission");
  }

  const editing = Boolean(existingSubmission);
  const field = (key: keyof ExistingOwnerSubmission) =>
    readOwnerField(formData, key, existingSubmission?.[key] as string | number | null | undefined, editing);

  const displayName = field("display_name");
  const locality = field("locality");
  const city = field("city");
  const district = field("district") || null;
  const state = field("state");
  const pinCode = field("pin_code");
  const fullAddress = field("full_address");
  const open24h = formData.get("open_24h") === "on";
  const openingTime = open24h ? "00:00" : field("opening_time");
  const closingTime = open24h ? "00:00" : field("closing_time");
  const rawMapLink = field("map_link");
  const description = field("description") || null;
  const totalSeatsRaw = field("total_seats");
  const totalSeats = totalSeatsRaw ? Number.parseInt(totalSeatsRaw, 10) : Number.NaN;
  const rawPhone = field("phone_number");
  const rawWhatsapp = field("whatsapp_number");
  const normalizedPhone = normalizeIndianPhone(rawPhone);
  // WhatsApp only works on mobiles.
  const normalizedWhatsapp = rawWhatsapp ? normalizeIndianMobile(rawWhatsapp) : null;
  const rawPlansJson = String(formData.get("fee_plans_json") ?? "");
  const feePlans = parsePlanDraftsJson(rawPlansJson);
  const amenityValuesRaw = formData
    .getAll("amenities")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const amenityValues = amenityValuesRaw.length > 0
    ? amenityValuesRaw
    : String(existingSubmission?.amenities_text ?? "")
        .split(/[,|\n]/)
        .map((value) => value.trim())
        .filter(Boolean);
  const amenitiesText = amenityValues.length > 0 ? amenityValues.join(", ") : null;
  const existingImageUrls = existingSubmission ? getExistingImageUrls(formData) : [];
  const uploadedImageUrls = getUploadedImageUrls(formData);
  const uploadedImageFileIds = getUploadedImageFileIds(formData);
  const photoUploadState = getTrimmedString(formData, "photo_upload_state");

  if (
    !displayName ||
    !locality ||
    !city ||
    !state ||
    !pinCode ||
    !fullAddress ||
    !openingTime ||
    !closingTime ||
    !rawMapLink ||
    !rawPhone ||
    !Number.isInteger(totalSeats) ||
    totalSeats < 1 ||
    totalSeats > 100000 ||
    amenityValues.length === 0
  ) {
    ownerErrorRedirect("missing_required_fields");
  }

  if (
    displayName.length > 200 ||
    locality.length > 120 ||
    city.length > 120 ||
    (district?.length ?? 0) > 120 ||
    state.length > 120 ||
    fullAddress.length > 500 ||
    rawMapLink.length > 2000 ||
    (description?.length ?? 0) > 2000 ||
    amenityValues.length > 30 ||
    amenityValues.some((value) => value.length > 80)
  ) {
    ownerErrorRedirect("missing_required_fields");
  }

  if (!normalizedPhone || (rawWhatsapp && !normalizedWhatsapp)) {
    ownerErrorRedirect("invalid_phone");
  }

  if (!isValidPinCode(pinCode)) {
    ownerErrorRedirect("invalid_pin_code");
  }

  if (!hasValidTimeRange(openingTime, closingTime)) {
    ownerErrorRedirect("invalid_timings");
  }

  if (!hasValidPlanDescriptions(rawPlansJson)) {
    ownerErrorRedirect("invalid_plan_description");
  }

  if (photoUploadState !== "ready") {
    ownerErrorRedirect("image_upload_failed");
  }

  if (uploadedImageUrls.length !== uploadedImageFileIds.length) {
    await cleanupImageKitFiles(uploadedImageFileIds);
    ownerErrorRedirect("image_upload_failed");
  }

  if (uploadedImageUrls.length + existingImageUrls.length === 0) {
    ownerErrorRedirect("too_few_images");
  }

  if (uploadedImageUrls.length + existingImageUrls.length > MAX_OWNER_PHOTOS) {
    ownerErrorRedirect("too_many_images");
  }

  const resolvedMap = await resolveGoogleMapsCoordinates(rawMapLink);
  if (resolvedMap.resolutionError === "invalid_map_link") {
    ownerErrorRedirect("invalid_map_link");
  }
  if (resolvedMap.resolutionError === "unresolvable_map_link") {
    ownerErrorRedirect("unresolvable_map_link");
  }

  const latitude = formData.get("latitude")
    ? Number(formData.get("latitude"))
    : resolvedMap.coordinates?.latitude ?? existingSubmission?.latitude ?? null;
  const longitude = formData.get("longitude")
    ? Number(formData.get("longitude"))
    : resolvedMap.coordinates?.longitude ?? existingSubmission?.longitude ?? null;

  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !isValidLatitude(latitude) ||
    !isValidLongitude(longitude)
  ) {
    ownerErrorRedirect("invalid_coordinates");
  }

  const nearestMetro = await findNearestMetro(latitude, longitude);
  const imageUrls = [...existingImageUrls, ...uploadedImageUrls];

  if (!imageUrls.every((url) => isOwnerSubmissionImageUrl(url, user.id))) {
    await cleanupImageKitFiles(uploadedImageFileIds);
    ownerErrorRedirect("invalid_image");
  }

  // Flag (don't block) submissions that look like one of our existing listings,
  // so an admin can check ownership before approving.
  const possibleDuplicateOf = await findPossibleDuplicate(normalizedPhone, displayName, locality, city);

  const payload = {
    user_id: user.id,
    ownership_status: "unverified",
    possible_duplicate_of: possibleDuplicateOf,
    display_name: displayName,
    city,
    locality,
    district,
    state,
    pin_code: pinCode,
    full_address: fullAddress,
    nearest_metro: nearestMetro?.nearest_metro ?? null,
    nearest_metro_distance_km: nearestMetro?.nearest_metro_distance_km ?? null,
    latitude,
    longitude,
    phone_number: normalizedPhone,
    whatsapp_number: normalizedWhatsapp,
    opening_time: openingTime,
    closing_time: closingTime,
    total_seats: totalSeats,
    map_link: resolvedMap.resolvedUrl,
    description,
    amenities_text: amenitiesText,
    image_urls: imageUrls,
    fee_plans: feePlans.length > 0 ? feePlans : null,
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
    await cleanupImageKitFiles(uploadedImageFileIds);
    ownerErrorRedirect("submission_failed");
  }

  // These photos are now part of a submission; stop tracking them for cleanup.
  if (uploadedImageFileIds.length > 0) {
    await supabaseServer.from("pending_uploads" as never).delete().in("file_id" as never, uploadedImageFileIds as never);
  }

  redirect("/for-owners?submitted=1");
}

export async function updateOwnerSubmissionPlans(formData: FormData) {
  const ip = getClientIp(await headers());
  const rateCheck = await rateLimit(ip, RATE_LIMITS.ownerPlansUpdate);
  if (!rateCheck.success) {
    redirect("/for-owners?plans_error=1");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/for-owners");
  }

  const submissionId = String(formData.get("submission_id") ?? "").trim();
  const rawPlansJson = String(formData.get("fee_plans_json") ?? "");
  const feePlans = parsePlanDraftsJson(rawPlansJson);

  if (!submissionId || !hasValidPlanDescriptions(rawPlansJson)) {
    redirect("/for-owners?plans_error=1");
  }

  // An empty or broken payload must not silently delete every plan.
  const confirmRemoveAll = formData.get("confirm_remove_all_plans") === "on";
  if (feePlans.length === 0 && !confirmRemoveAll) {
    redirect("/for-owners?plans_error=empty");
  }

  const { data: submission, error: submissionError } = await supabaseServer
    .from("owner_library_submissions")
    .select("id, user_id, status, submitted_library_branch_id, display_name")
    .eq("id", submissionId)
    .maybeSingle();

  if (submissionError || !submission || submission.user_id !== user.id) {
    redirect("/for-owners?plans_error=1");
  }

  const { error } = await supabaseServer
    .from("owner_library_submissions")
    .update({
      fee_plans: feePlans,
      updated_at: new Date().toISOString(),
    })
    .eq("id", submissionId);

  if (error) {
    redirect("/for-owners?plans_error=1");
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
      redirect("/for-owners?plans_error=1");
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

  redirect("/for-owners?plans_updated=1");
}
