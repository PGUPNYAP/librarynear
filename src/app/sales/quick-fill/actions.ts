"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { getLibraryMutationAccess } from "@/lib/staff-access";
import { getCurrentActorUserId, logLibraryActivity } from "@/lib/library-activity";
import { getLibraryCacheTarget, revalidateLibraryContent } from "@/lib/revalidate-library-content";
import { refreshLibraryProfileCompletenessScore } from "@/lib/library-profile-score-server";
import { buildLibraryFeePlanInsertRows, normalizePlanDrafts, type LibraryPlanDraft } from "@/lib/library-plans";
import { hasValidTimeRange } from "@/lib/owner-form-validation";
import { normalizeIndianPhone } from "@/lib/phone";
import { AMENITIES } from "@/lib/amenities";

export type QuickFillInput = {
  open24: boolean;
  openingTime: string;
  closingTime: string;
  amenities: string[];
  unreservedFee: string;
  reservedFee: string;
  seats: string;
  phone: string;
  verified: boolean;
};

export type QuickFillResult = { ok: true; changed: string[] } | { ok: false; error: string };

const ALLOWED_AMENITIES = new Set(AMENITIES.map((amenity) => amenity.label));

function parseFee(value: string) {
  if (!value.trim()) return null;
  const amount = Number(value.replace(/[^\d]/g, ""));
  return Number.isInteger(amount) && amount >= 100 && amount <= 100000 ? amount : NaN;
}

/** Fill the basics of a library in one quick step (sales and admins). */
export async function quickFillLibrary(libraryId: string, input: QuickFillInput): Promise<QuickFillResult> {
  const staff = await getLibraryMutationAccess(libraryId);
  if (!staff) return { ok: false, error: "You can only update libraries in your assigned localities." };

  const { data: row } = await supabaseServer
    .from("library_branches")
    .select("*, library_fee_plans(*)")
    .eq("id", libraryId)
    .maybeSingle();
  const library = row as unknown as
    | (Record<string, unknown> & {
        opening_time: string | null;
        closing_time: string | null;
        amenities_text: string | null;
        total_seats: number | null;
        phone_number: string | null;
        verification_status: string | null;
        library_fee_plans: Array<Record<string, unknown> & { is_active: boolean | null }> | null;
      })
    | null;
  if (!library) return { ok: false, error: "Library not found." };

  const fields: Record<string, unknown> = {};
  const changed: string[] = [];

  // Hours
  const opening = input.open24 ? "00:00" : input.openingTime.trim();
  const closing = input.open24 ? "00:00" : input.closingTime.trim();
  if (opening || closing) {
    if (!opening || !closing) return { ok: false, error: "Enter both opening and closing time (or tick 24 hours)." };
    if (!hasValidTimeRange(opening, closing)) return { ok: false, error: "Enter valid times. Overnight (18:00 to 02:00) is fine." };
    if (opening !== library.opening_time?.slice(0, 5) || closing !== library.closing_time?.slice(0, 5)) {
      fields.opening_time = opening;
      fields.closing_time = closing;
      changed.push("opening_time", "closing_time");
    }
  }

  // Amenities (only known labels)
  const amenities = [...new Set(input.amenities.filter((label) => ALLOWED_AMENITIES.has(label)))];
  if (amenities.length > 0) {
    const text = amenities.join(", ");
    if (text !== library.amenities_text) {
      fields.amenities_text = text;
      changed.push("amenities_text");
    }
  }

  // Seats
  if (input.seats.trim()) {
    const seats = Number.parseInt(input.seats, 10);
    if (!Number.isInteger(seats) || seats < 1 || seats > 5000) return { ok: false, error: "Seats must be between 1 and 5000." };
    if (seats !== library.total_seats) {
      fields.total_seats = seats;
      changed.push("total_seats");
    }
  }

  // Phone
  if (input.phone.trim()) {
    const phone = normalizeIndianPhone(input.phone);
    if (!phone) return { ok: false, error: "Phone must be a 10-digit Indian number." };
    if (phone !== library.phone_number) {
      fields.phone_number = phone;
      changed.push("phone_number");
    }
  }

  // Fees -> regular 1-month plans for each seat type; other plans are kept.
  const unreserved = parseFee(input.unreservedFee);
  const reserved = parseFee(input.reservedFee);
  if (Number.isNaN(unreserved) || Number.isNaN(reserved)) return { ok: false, error: "Fees must be between ₹100 and ₹1,00,000." };
  let plans: ReturnType<typeof buildLibraryFeePlanInsertRows> | null = null;
  if (unreserved !== null || reserved !== null) {
    const existing = normalizePlanDrafts((library.library_fee_plans ?? []).filter((plan) => plan.is_active !== false));
    const replaced = new Set([unreserved !== null ? "unreserved" : null, reserved !== null ? "reserved" : null].filter(Boolean));
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
      ...(unreserved !== null ? [make("unreserved", unreserved)] : []),
      ...(reserved !== null ? [make("reserved", reserved)] : []),
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

  // Atomic when the migration is applied; plain updates otherwise.
  const rpc = await supabaseServer.rpc("update_library_with_plans" as never, { p_library_id: libraryId, p_fields: fields, p_plans: plans } as never);
  if (rpc.error) {
    if (!/function|does not exist|schema cache/i.test(rpc.error.message)) {
      return { ok: false, error: "Could not save. Please try again." };
    }
    const { error } = await supabaseServer.from("library_branches").update(fields as never).eq("id", libraryId);
    if (error) return { ok: false, error: "Could not save. Please try again." };
    if (plans) {
      const { error: planError } = await supabaseServer.rpc("replace_library_fee_plans" as never, {
        p_library_branch_id: libraryId,
        p_plans: plans,
      } as never);
      if (planError) return { ok: false, error: "Saved details, but fees failed. Please try again." };
    }
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
