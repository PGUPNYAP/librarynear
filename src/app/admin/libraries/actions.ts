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
import { buildLibraryFeePlanInsertRows, normalizePlanDrafts } from "@/lib/library-plans";
import { cleanLibraryForm, libraryToFormValues, validateLibraryForm, type FieldErrors, type LibraryFormValues } from "@/lib/library-form";
import { findNearestMetro } from "@/lib/nearest-metro";
import { resolveLocationInput } from "@/lib/server/resolve-location";
import { canonicalMapLink } from "@/lib/maps-coordinates";

function normalizeComparable(value: unknown) {
  if (value === undefined || value === "") return null;
  if (typeof value === "number") return Number(value.toFixed(6));
  if (typeof value === "string" && /^\d{2}:\d{2}:00$/.test(value)) return value.slice(0, 5);
  return value;
}

export type UpdateLibraryResult =
  | { success: true; changedFields: string[]; updatedAt: string | null }
  | { success: false; error: string; fieldErrors?: FieldErrors; conflict?: boolean };

const CHECK_FIELDS = "Please fix the highlighted fields.";

export async function updateLibraryBranch(
  id: string,
  values: LibraryFormValues,
  options: { expectedUpdatedAt?: string | null } = {},
): Promise<UpdateLibraryResult> {
  const staff = await getLibraryMutationAccess(id);
  if (!staff) {
    return { success: false, error: "You can only edit libraries in your assigned localities. Ask an admin if this one should be yours." };
  }

  const { data: existingRow, error: existingLibraryError } = await supabaseServer
    .from("library_branches")
    .select("*, library_fee_plans(*)")
    .eq("id", id)
    .maybeSingle();
  const existingLibrary = existingRow as unknown as
    | (Tables<"library_branches"> & { library_fee_plans: Tables<"library_fee_plans">[] | null })
    | null;

  if (existingLibraryError) {
    console.error("Failed to load library for edit:", existingLibraryError.message);
    return { success: false, error: "We couldn't load this library. Your changes are safe here, so try again." };
  }
  if (!existingLibrary || existingLibrary.is_active === false) {
    return { success: false, error: "This library has been removed, so it can't be edited." };
  }

  // Someone else saved after this form was opened.
  if (options.expectedUpdatedAt && existingLibrary.updated_at && options.expectedUpdatedAt !== existingLibrary.updated_at) {
    return {
      success: false,
      conflict: true,
      error: "Someone else updated this library while you were editing. Saving now will replace their changes.",
    };
  }

  const activePlans = (existingLibrary.library_fee_plans ?? [])
    .filter((plan) => plan.is_active !== false)
    .map((plan) => ({ ...plan, base_price: plan.base_price ?? plan.price }));
  const baseline = libraryToFormValues(existingLibrary, activePlans);

  const fieldErrors = validateLibraryForm(values, { mode: "staff", baseline });
  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, error: CHECK_FIELDS, fieldErrors };
  }

  const clean = cleanLibraryForm(values);
  const previousTarget = await getLibraryCacheTarget(id);
  const actorUserId = await getCurrentActorUserId();

  // Location: coordinates on the form win; otherwise read them from whatever was pasted.
  let latitude = clean.latitude;
  let longitude = clean.longitude;
  let resolvedMapLink = clean.map_link;
  const mapChanged = clean.map_link !== existingLibrary.map_link;
  if (mapChanged || latitude !== existingLibrary.latitude || longitude !== existingLibrary.longitude) {
    if (clean.map_link && latitude === null) {
      const resolved = await resolveLocationInput(clean.map_link);
      if (!resolved.ok) {
        return { success: false, error: CHECK_FIELDS, fieldErrors: { map_link: "We couldn't read a location from this. Paste a Google Maps link, or enter latitude and longitude." } };
      }
      latitude = resolved.latitude;
      longitude = resolved.longitude;
      resolvedMapLink = resolved.mapLink;
    } else {
      resolvedMapLink = canonicalMapLink(clean.map_link, latitude !== null && longitude !== null ? { latitude, longitude } : null);
    }
  }
  const locationMoved = latitude !== existingLibrary.latitude || longitude !== existingLibrary.longitude;

  let nearestMetro = existingLibrary.nearest_metro;
  let nearestMetroLine = existingLibrary.nearest_metro_line;
  let nearestMetroDistanceKm = existingLibrary.nearest_metro_distance_km;
  if (values.metro_override) {
    nearestMetro = values.nearest_metro.trim() || null;
    nearestMetroDistanceKm = values.nearest_metro_distance_km.trim() ? Number(values.nearest_metro_distance_km) : null;
    nearestMetroLine = null;
  } else if (locationMoved) {
    if (typeof latitude === "number" && typeof longitude === "number") {
      const computedMetro = await findNearestMetro(latitude, longitude);
      nearestMetro = computedMetro?.nearest_metro ?? null;
      nearestMetroLine = computedMetro?.nearest_metro_line ?? null;
      nearestMetroDistanceKm = computedMetro?.nearest_metro_distance_km ?? null;
    } else {
      nearestMetro = null;
      nearestMetroLine = null;
      nearestMetroDistanceKm = null;
    }
  }

  const payload: TablesUpdate<"library_branches"> = {
    display_name: clean.display_name,
    locality: clean.locality,
    city: clean.city,
    district: clean.district,
    state: clean.state,
    pin_code: clean.pin_code ?? existingLibrary.pin_code,
    full_address: clean.full_address,
    nearest_metro: nearestMetro,
    nearest_metro_line: nearestMetroLine,
    nearest_metro_distance_km: nearestMetroDistanceKm,
    latitude,
    longitude,
    opening_time: clean.opening_time,
    closing_time: clean.closing_time,
    phone_number: clean.phone_number,
    description: clean.description,
    amenities_text: clean.amenities_text,
    map_link: resolvedMapLink,
    whatsapp_number: clean.whatsapp_number,
    total_seats: clean.total_seats,
  };

  // An address shown only from Google's copy isn't a user change.
  if (!existingLibrary.full_address && payload.full_address === existingLibrary.formatted_address) {
    payload.full_address = existingLibrary.full_address;
  }

  const changedFields = Object.entries(payload)
    .filter(([key, value]) => normalizeComparable((existingLibrary as Record<string, unknown>)[key]) !== normalizeComparable(value))
    .map(([key]) => key);

  const nextPlanRows = buildLibraryFeePlanInsertRows(clean.plans, id);
  const currentPlanRows = buildLibraryFeePlanInsertRows(normalizePlanDrafts(activePlans), id);
  const plansChanged = JSON.stringify(nextPlanRows) !== JSON.stringify(currentPlanRows);
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
    return { success: false, error: "Couldn't save the library, and nothing was changed. Try again in a moment." };
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
        : values.metro_override
          ? "Nearest metro was manually overridden by staff."
          : null,
  });

  const { data: fresh } = await supabaseServer.from("library_branches").select("updated_at").eq("id", id).maybeSingle();
  return { success: true, changedFields, updatedAt: fresh?.updated_at ?? null };
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
