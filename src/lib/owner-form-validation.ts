import { countWords, normalizePlanDrafts, MAX_FEE_PLANS_JSON_BYTES } from "@/lib/library-plans";
import { normalizeIndianMobile, normalizeIndianPhone as normalizePhone } from "@/lib/phone";

export { normalizeIndianMobile };

export type OwnerValidationErrorCode =
  | "duplicate_submission"
  | "missing_required_fields"
  | "invalid_phone"
  | "invalid_map_link"
  | "unresolvable_map_link"
  | "invalid_coordinates"
  | "invalid_pin_code"
  | "invalid_timings"
  | "invalid_plan_description"
  | "too_many_images"
  | "too_few_images"
  | "invalid_image"
  | "rate_limited";

/** Mobile or STD landline; accepts +91, 0091, a leading 0, spaces and dashes. */
export function normalizeIndianPhone(value: string) {
  return normalizePhone(value);
}

export function isValidPinCode(value: string) {
  return /^\d{6}$/.test(value);
}

export function isValidLatitude(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value >= -180 && value <= 180;
}

export function isValidMapLink(value: string | null) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return /google\.[a-z.]+$/.test(url.hostname) || /maps\.app\.goo\.gl$/i.test(url.hostname);
  } catch {
    return false;
  }
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/**
 * Valid when both times are real clock times. Overnight hours (closing before
 * opening, e.g. 18:00-02:00) and 24-hour libraries (00:00-00:00 or
 * 00:00-23:59) are allowed; only an identical non-midnight pair is rejected.
 */
export function hasValidTimeRange(openingTime: string | null, closingTime: string | null) {
  if (!openingTime || !closingTime) return false;
  if (!CLOCK.test(openingTime) || !CLOCK.test(closingTime)) return false;
  const open = openingTime.slice(0, 5);
  const close = closingTime.slice(0, 5);
  if (open === close) return open === "00:00";
  return true;
}

export function hasValidPlanDescriptions(rawPlansJson: string) {
  if (!rawPlansJson.trim()) {
    return true;
  }

  if (rawPlansJson.length > MAX_FEE_PLANS_JSON_BYTES) {
    return false;
  }

  try {
    const plans = normalizePlanDrafts(JSON.parse(rawPlansJson || "[]"));
    return plans.every((plan) => countWords(plan.description) <= 30);
  } catch {
    return false;
  }
}
