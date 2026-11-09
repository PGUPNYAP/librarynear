"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { getLibraryMutationAccess } from "@/lib/staff-access";
import { getCurrentActorUserId, logLibraryActivity } from "@/lib/library-activity";
import { getLibraryCacheTarget, revalidateLibraryContent } from "@/lib/revalidate-library-content";
import { refreshLibraryProfileCompletenessScore } from "@/lib/library-profile-score-server";
import { buildLibraryFeePlanInsertRows, normalizePlanDrafts, type LibraryPlanDraft } from "@/lib/library-plans";
import { feeError, hoursError, phoneError, seatsError, type HoursMode } from "@/lib/library-form";
import { normalizeIndianPhone } from "@/lib/phone";

export type QuickFillInput = {
  hoursMode: HoursMode;
  openingTime: string;
  closingTime: string;
  amenities: string[];
  unreservedFee: string;
  reservedFee: string;
  seats: string;
  phone: string;
  verified: boolean;
};

export type QuickFillErrors = Partial<Record<"hours" | "phone" | "seats" | "unreservedFee" | "reservedFee", string>>;
export type QuickFillResult = { ok: true; changed: string[] } | { ok: false; error: string; fieldErrors?: QuickFillErrors };

function parseFee(value: string) {
  return value.trim() ? Number(value.replace(/[^\d]/g, "")) : null;
}

/** Fill the basics of a library in one quick step (sales and admins). Blank fields are left alone. */
export async function quickFillLibrary(libraryId: string, input: QuickFillInput): Promise<QuickFillResult> {
  const staff = await getLibraryMutationAccess(libraryId);
  if (!staff) return { ok: false, error: "You can only update libraries in your assigned localities." };

  const fieldErrors: QuickFillErrors = {
    hours: hoursError({ mode: input.hoursMode, opening: input.openingTime, closing: input.closingTime }, false) ?? undefined,
    phone: phoneError(input.phone) ?? undefined,
    seats: seatsError(input.seats) ?? undefined,
    unreservedFee: feeError(input.unreservedFee) ?? undefined,
    reservedFee: feeError(input.reservedFee) ?? undefined,
  };
  if (Object.values(fieldErrors).some(Boolean)) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };

  const { data: row } = await supabaseServer
    .from("library_branches")
    .select("*, library_fee_plans(*)")
    .eq("id", libraryId)
    .maybeSingle();
  const library = row as unknown as
    | (Record<string, unknown> & {
        is_active: boolean | null;
        opening_time: string | null;
        closing_time: string | null;
        amenities_text: string | null;
        total_seats: number | null;
        phone_number: string | null;
        verification_status: string | null;
        library_fee_plans: Array<Record<string, unknown> & { is_active: boolean | null }> | null;
      })
    | null;
  if (!library || library.is_active === false) return { ok: false, error: "This library has been removed. Skip to the next one." };

  const fields: Record<string, unknown> = {};
  const changed: string[] = [];

  // Hours ("Not known" leaves whatever is saved)
  if (input.hoursMode !== "unknown") {
    const opening = input.hoursMode === "24h" ? "00:00" : input.openingTime;
    const closing = input.hoursMode === "24h" ? "00:00" : input.closingTime;
    if (opening !== library.opening_time?.slice(0, 5) || closing !== library.closing_time?.slice(0, 5)) {
      fields.opening_time = opening;
      fields.closing_time = closing;
      changed.push("opening_time", "closing_time");
    }
  }

  // Amenities (older free-text ones already on the library stay)
  const amenities = [...new Set(input.amenities.map((label) => label.trim()).filter(Boolean))].slice(0, 30);
  if (amenities.length > 0) {
    const text = amenities.join(", ");
    if (text !== library.amenities_text) {
      fields.amenities_text = text;
      changed.push("amenities_text");
    }
  }

  // Seats
  if (input.seats.trim()) {
    const seats = Number(input.seats);
    if (seats !== library.total_seats) {
      fields.total_seats = seats;
      changed.push("total_seats");
    }
  }

  // Phone
  if (input.phone.trim()) {
    const phone = normalizeIndianPhone(input.phone);
    if (phone && phone !== library.phone_number) {
      fields.phone_number = phone;
      changed.push("phone_number");
    }
  }

  // Fees -> regular 1-month plans for each seat type; other plans are kept.
  const existing = normalizePlanDrafts((library.library_fee_plans ?? []).filter((plan) => plan.is_active !== false));
  const currentFee = (seat: "unreserved" | "reserved") =>
    existing.find((plan) => plan.plan_category === "regular" && plan.duration_key === "1_month" && plan.seat_type === seat)?.base_price ?? null;
  const unreserved = parseFee(input.unreservedFee);
  const reserved = parseFee(input.reservedFee);
  const unreservedNew = unreserved !== null && unreserved !== currentFee("unreserved");
  const reservedNew = reserved !== null && reserved !== currentFee("reserved");
  let plans: ReturnType<typeof buildLibraryFeePlanInsertRows> | null = null;
  if (unreservedNew || reservedNew) {
    const replaced = new Set([unreservedNew ? "unreserved" : null, reservedNew ? "reserved" : null].filter(Boolean));
    const kept = existing.filter(
      (plan) => !(plan.plan_category === "regular" && plan.duration_key === "1_month" && replaced.has(plan.seat_type)),
    );
    const make = (seat: "unreserved" | "reserved", price: number): LibraryPlanDraft => ({
      plan_category: "regular",
      duration_key: "1_month",
      duration_label: "1 Month",
      seat_type: seat,
      hours_per_day: 24,
      description: "",
      base_price: price,
      discount_percentage: 0,
      discounted_price: price,
      offer_name: "",
    });
    const next = [
      ...(unreservedNew ? [make("unreserved", unreserved)] : []),
      ...(reservedNew ? [make("reserved", reserved)] : []),
      ...kept,
    ];
    plans = buildLibraryFeePlanInsertRows(next, libraryId);
    changed.push("fee_plans");
  }

  const actorUserId = await getCurrentActorUserId();
  if (input.verified && library.verification_status !== "verified") changed.push("verification_status");
  if (changed.length === 0) return { ok: true, changed };

  fields.last_sales_reviewed_at = new Date().toISOString();
  fields.last_sales_reviewer_id = actorUserId;
  const previousTarget = await getLibraryCacheTarget(libraryId);

  // One transaction: details and fees succeed or fail together.
  const rpc = await supabaseServer.rpc("update_library_with_plans" as never, { p_library_id: libraryId, p_fields: fields, p_plans: plans } as never);
  if (rpc.error) {
    console.error("quick fill failed:", rpc.error.message);
    return { ok: false, error: "Couldn't save, and nothing was changed. Try again in a moment." };
  }

  if (input.verified && library.verification_status !== "verified") {
    await supabaseServer
      .from("library_branches")
      .update({ verification_status: "verified", last_verification_updated_at: new Date().toISOString(), last_verification_updated_by: actorUserId })
      .eq("id", libraryId);
  }

  await refreshLibraryProfileCompletenessScore(libraryId);
  revalidateLibraryContent(previousTarget);
  await logLibraryActivity({ libraryBranchId: libraryId, actionType: "library_updated", changedFields: changed, notes: "Quick fill" });
  if (changed.includes("verification_status")) {
    await logLibraryActivity({ libraryBranchId: libraryId, actionType: "verification_updated", verificationStatus: "verified", changedFields: ["verification_status"] });
  }
  return { ok: true, changed };
}
