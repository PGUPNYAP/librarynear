"use server";

import { supabaseServer } from "@/lib/supabase-server";
import type { Tables, TablesUpdate } from "@/types/supabase";
import { refreshLibraryProfileCompletenessScore } from "@/lib/library-profile-score-server";
import {
  getLibraryCacheTarget,
  revalidateLibraryContent,
} from "@/lib/revalidate-library-content";
import { getCurrentActorUserId, logLibraryActivity } from "@/lib/library-activity";
import { getLibraryMutationAccess, requireApprovedStaff } from "@/lib/staff-access";
import {
  buildLibraryFeePlanInsertRows,
  normalizePlanDrafts,
  parsePlanDraftsJson,
} from "@/lib/library-plans";
import { findNearestMetro } from "@/lib/nearest-metro";
import {
  hasValidPlanDescriptions,
  hasValidTimeRange,
  isValidLatitude,
  isValidLongitude,
  isValidPinCode,
  normalizeIndianMobile,
  normalizeIndianPhone,
} from "@/lib/owner-form-validation";
import { resolveGoogleMapsCoordinates } from "@/lib/server/google-maps-resolver";

function getTrimmedString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

/** Fields that staff may explicitly clear with a "clear_<field>" checkbox. */
const CLEARABLE_FIELDS = [
  "district",
  "description",
  "whatsapp_number",
  "opening_time",
  "closing_time",
  "total_seats",
  "full_address",
] as const;

/**
 * The edit form shows current values as placeholders: an empty input means
 * "keep the current value"; a ticked clear_<field> means "remove it".
 */
function readField(
  formData: FormData,
  key: string,
  existing: string | number | null | undefined,
): string | null {
  if ((CLEARABLE_FIELDS as readonly string[]).includes(key) && formData.get(`clear_${key}`) === "on") {
    return null;
  }
  const submitted = getTrimmedString(formData, key);
  if (submitted) return submitted;
  return existing === null || existing === undefined || existing === "" ? null : String(existing);
}

function normalizeComparable(value: unknown) {
  if (value === undefined || value === "") return null;
  if (typeof value === "number") return Number(value.toFixed(6));
  if (typeof value === "string" && /^\d{2}:\d{2}:00$/.test(value)) return value.slice(0, 5);
  return value;
}

type UpdateResult = { success: true; changedFields: string[] } | { success: false; error: string };

export async function updateLibraryBranch(id: string, formData: FormData): Promise<UpdateResult> {
  const staff = await getLibraryMutationAccess(id);
  if (!staff) {
    return { success: false, error: "You can only edit libraries in your assigned localities." };
  }

  const { data: existingRow, error: existingLibraryError } = await supabaseServer
    .from("library_branches")
    .select("*, library_fee_plans(*)")
    .eq("id", id)
    .maybeSingle();
  const existingLibrary = existingRow as unknown as
    | (Tables<"library_branches"> & { library_fee_plans: Tables<"library_fee_plans">[] | null })
    | null;

  if (existingLibraryError || !existingLibrary) {
    return { success: false, error: existingLibraryError?.message || "Library not found." };
  }

  const previousTarget = await getLibraryCacheTarget(id);
  const actorUserId = await getCurrentActorUserId();

  const displayName = readField(formData, "display_name", existingLibrary.display_name);
  const locality = readField(formData, "locality", existingLibrary.locality);
  const city = readField(formData, "city", existingLibrary.city);
  const district = readField(formData, "district", existingLibrary.district);
  const state = readField(formData, "state", existingLibrary.state);
  const pinCode = readField(formData, "pin_code", existingLibrary.pin_code);
  const fullAddress = readField(formData, "full_address", existingLibrary.full_address);
  const openingTime = readField(formData, "opening_time", existingLibrary.opening_time);
  const closingTime = readField(formData, "closing_time", existingLibrary.closing_time);
  const mapLink = readField(formData, "map_link", existingLibrary.map_link);
  const description = readField(formData, "description", existingLibrary.description);
  const rawPhone = readField(formData, "phone_number", existingLibrary.phone_number);
  const rawWhatsapp = readField(formData, "whatsapp_number", existingLibrary.whatsapp_number);
  const totalSeatsRaw = readField(formData, "total_seats", existingLibrary.total_seats);

  if (!displayName || !locality || !city) {
    return { success: false, error: "Name, locality and city are required." };
  }
  if (displayName.length > 160 || locality.length > 120 || city.length > 80) {
    return { success: false, error: "Name, locality or city is too long." };
  }
  if (description && description.length > 3000) {
    return { success: false, error: "Description can be at most 3000 characters." };
  }

  const phoneNumber = rawPhone ? normalizeIndianPhone(rawPhone) : null;
  if (rawPhone && !phoneNumber) {
    return { success: false, error: "Phone must be a 10-digit Indian number (mobile, or landline with STD code)." };
  }
  const whatsappNumber = rawWhatsapp ? normalizeIndianMobile(rawWhatsapp) : null;
  if (rawWhatsapp && !whatsappNumber) {
    return { success: false, error: "WhatsApp must be a 10-digit Indian mobile number." };
  }

  const totalSeats = totalSeatsRaw ? Number.parseInt(totalSeatsRaw, 10) : null;
  if (totalSeatsRaw && (!Number.isInteger(totalSeats) || (totalSeats ?? 0) < 1 || (totalSeats ?? 0) > 100000)) {
    return { success: false, error: "Seats must be a whole number between 1 and 100000." };
  }

  if (pinCode && !isValidPinCode(pinCode)) {
    return { success: false, error: "Please enter a valid 6-digit PIN code." };
  }

  if ((openingTime && !closingTime) || (!openingTime && closingTime)) {
    return { success: false, error: "Enter both opening and closing time, or clear both." };
  }
  if (openingTime && closingTime && !hasValidTimeRange(openingTime, closingTime)) {
    return {
      success: false,
      error: "Enter valid times. For 24-hour libraries use 00:00 to 00:00; overnight hours like 18:00 to 02:00 are fine.",
    };
  }

  const amenityValuesRaw = formData
    .getAll("amenities")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const amenityValues =
    formData.get("clear_amenities") === "on"
      ? []
      : amenityValuesRaw.length > 0
        ? amenityValuesRaw
        : String(existingLibrary.amenities_text ?? "")
            .split(/[,|\n]/)
            .map((value) => value.trim())
            .filter(Boolean);
  if (amenityValues.length > 30) {
    return { success: false, error: "Pick at most 30 amenities." };
  }

  const rawPlansJson = getTrimmedString(formData, "fee_plans_json");
  if (!hasValidPlanDescriptions(rawPlansJson || "[]")) {
    return { success: false, error: "Each plan description can have up to 30 words." };
  }
  const feePlans = parsePlanDraftsJson(rawPlansJson);
  const overrideNearestMetro = String(formData.get("override_nearest_metro") ?? "") === "on";

  // Location: only re-resolve the map link when it actually changed.
  let latitude = existingLibrary.latitude;
  let longitude = existingLibrary.longitude;
  let resolvedMapLink = mapLink;
  const mapChanged = Boolean(mapLink && mapLink !== existingLibrary.map_link);
  if (mapChanged && mapLink) {
    const resolvedMap = await resolveGoogleMapsCoordinates(mapLink);
    if (resolvedMap.resolutionError === "invalid_map_link") {
      return { success: false, error: "Please add a valid Google Maps link." };
    }
    if (resolvedMap.resolutionError === "unresolvable_map_link") {
      return {
        success: false,
        error: "We could not extract coordinates from that Google Maps link. Use the full share link or enter latitude and longitude.",
      };
    }
    resolvedMapLink = resolvedMap.resolvedUrl;
    latitude = resolvedMap.coordinates?.latitude ?? latitude;
    longitude = resolvedMap.coordinates?.longitude ?? longitude;
  }
  if (formData.get("latitude")) latitude = Number(formData.get("latitude"));
  if (formData.get("longitude")) longitude = Number(formData.get("longitude"));
  if ((latitude !== null && !isValidLatitude(latitude)) || (longitude !== null && !isValidLongitude(longitude))) {
    return { success: false, error: "Please provide valid latitude and longitude." };
  }

  let nearestMetro = existingLibrary.nearest_metro;
  let nearestMetroLine = existingLibrary.nearest_metro_line;
  let nearestMetroDistanceKm = existingLibrary.nearest_metro_distance_km;
  if (overrideNearestMetro) {
    nearestMetro = getTrimmedString(formData, "nearest_metro") || null;
    const raw = formData.get("nearest_metro_distance_km");
    const parsed = raw ? Number.parseFloat(String(raw)) : null;
    nearestMetroDistanceKm = parsed !== null && Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 500) : null;
    nearestMetroLine = null;
  } else if (typeof latitude === "number" && typeof longitude === "number" && (mapChanged || formData.get("latitude"))) {
    const computedMetro = await findNearestMetro(latitude, longitude);
    nearestMetro = computedMetro?.nearest_metro ?? null;
    nearestMetroLine = computedMetro?.nearest_metro_line ?? null;
    nearestMetroDistanceKm = computedMetro?.nearest_metro_distance_km ?? null;
  }

  const payload: TablesUpdate<"library_branches"> = {
    display_name: displayName,
    locality,
    city,
    district,
    state,
    pin_code: pinCode ?? existingLibrary.pin_code,
    full_address: fullAddress,
    nearest_metro: nearestMetro,
    nearest_metro_line: nearestMetroLine,
    nearest_metro_distance_km: nearestMetroDistanceKm,
    latitude,
    longitude,
    opening_time: openingTime,
    closing_time: closingTime,
    phone_number: phoneNumber,
    description,
    amenities_text: amenityValues.length ? amenityValues.join(", ") : null,
    map_link: resolvedMapLink,
    whatsapp_number: whatsappNumber,
    total_seats: totalSeats,
  };

  const changedFields = Object.entries(payload)
    .filter(([key, value]) => {
      const previous = (existingLibrary as Record<string, unknown>)[key];
      return normalizeComparable(previous) !== normalizeComparable(value);
    })
    .map(([key]) => key);

  const nextPlanRows = buildLibraryFeePlanInsertRows(feePlans, id);
  const currentPlans = ((existingLibrary.library_fee_plans ?? []) as Array<{ is_active: boolean | null }>).filter(
    (plan) => plan.is_active !== false,
  );
  const currentPlanRows = buildLibraryFeePlanInsertRows(normalizePlanDrafts(currentPlans), id);
  void currentPlans;
  const plansChanged =
    formData.has("fee_plans_json") && JSON.stringify(nextPlanRows) !== JSON.stringify(currentPlanRows);
  if (plansChanged) changedFields.push("fee_plans");

  const fields = {
    ...payload,
    last_sales_reviewed_at: new Date().toISOString(),
    last_sales_reviewer_id: actorUserId,
  };

  // One transaction: library fields and fee plans succeed or fail together.
  const { error } = await supabaseServer.rpc(
    "update_library_with_plans" as never,
    {
      p_library_id: id,
      p_fields: fields,
      p_plans: plansChanged ? nextPlanRows : null,
    } as never,
  );

  if (error) {
    console.error("update_library_with_plans failed:", error.message);
    return { success: false, error: "Could not save the library. Nothing was changed." };
  }

  await refreshLibraryProfileCompletenessScore(id);

  const nextTarget = await getLibraryCacheTarget(id);
  revalidateLibraryContent(previousTarget);
  revalidateLibraryContent(nextTarget);
  await logLibraryActivity({
    libraryBranchId: id,
    actionType: "library_updated",
    changedFields,
    notes:
      changedFields.length === 0
        ? "Reviewed with no changes."
        : overrideNearestMetro
          ? "Nearest metro was manually overridden by staff."
          : null,
  });

  return { success: true, changedFields };
}

export async function deleteLibraryBranch(id: string) {
  await requireApprovedStaff(["admin"]);

  const previousTarget = await getLibraryCacheTarget(id);

  const { error } = await supabaseServer
    .from("library_branches")
    .update({
      is_active: false,
      last_admin_reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidateLibraryContent(previousTarget);
  await logLibraryActivity({
    libraryBranchId: id,
    actionType: "library_deleted",
    changedFields: ["is_active"],
  });

  return { success: true };
}
