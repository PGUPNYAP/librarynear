/**
 * The one set of rules for every library form (admin, sales, owner).
 * Pure code: the browser uses it for instant errors and the server runs the
 * same checks again before saving.
 */
import { AMENITIES } from "@/lib/amenities";
import {
  DURATION_OPTIONS,
  MAX_FEE_PLANS,
  PLAN_CATEGORY_OPTIONS,
  SEAT_TYPE_OPTIONS,
  countWords,
  getDurationLabel,
  normalizePlanDraft,
  normalizePlanDrafts,
  type LibraryPlanDraft,
} from "@/lib/library-plans";
import { isValidLatitude, isValidLongitude } from "@/lib/owner-form-validation";
import { normalizeIndianMobile, normalizeIndianPhone, toNationalNumber } from "@/lib/phone";

export type LibraryFormMode = "staff" | "owner";
export type HoursMode = "set" | "24h" | "unknown";

export type PlanRow = {
  key: string;
  plan_category: string;
  duration_key: string;
  seat_type: string;
  hours_per_day: string;
  base_price: string;
  discount_percentage: string;
  offer_name: string;
  description: string;
};

export type LibraryFormValues = {
  display_name: string;
  locality: string;
  city: string;
  district: string;
  state: string;
  pin_code: string;
  full_address: string;
  map_link: string;
  latitude: string;
  longitude: string;
  metro_override: boolean;
  nearest_metro: string;
  nearest_metro_distance_km: string;
  hours_mode: HoursMode;
  opening_time: string;
  closing_time: string;
  phone_number: string;
  whatsapp_number: string;
  whatsapp_same: boolean;
  amenities: string[];
  total_seats: string;
  description: string;
  plans: PlanRow[];
};

export type FieldErrors = Record<string, string>;

export const FIELD_LABELS: Record<string, string> = {
  display_name: "Library name",
  locality: "Locality",
  city: "City",
  district: "District",
  state: "State",
  pin_code: "PIN code",
  full_address: "Address",
  map_link: "Location",
  latitude: "Latitude",
  longitude: "Longitude",
  nearest_metro: "Nearest metro",
  nearest_metro_distance_km: "Metro distance",
  hours: "Opening hours",
  phone_number: "Phone",
  whatsapp_number: "WhatsApp",
  amenities: "Amenities",
  total_seats: "Seats",
  description: "Description",
  plans: "Plans",
  photos: "Photos",
};

/** Labels every form offers; older free-text amenities on a library are kept alongside these. */
export const AMENITY_LABELS = AMENITIES.map((amenity) => amenity.label);

const MAX_SEATS = 5000;
const MAX_PRICE = 1_000_000;

let rowCounter = 0;
export function newPlanRow(partial: Partial<PlanRow> = {}): PlanRow {
  rowCounter += 1;
  return {
    key: `plan-${Date.now()}-${rowCounter}`,
    plan_category: "regular",
    duration_key: "1_month",
    seat_type: "unreserved",
    hours_per_day: "",
    base_price: "",
    discount_percentage: "",
    offer_name: "",
    description: "",
    ...partial,
  };
}

export function planDraftsToRows(input: unknown): PlanRow[] {
  return normalizePlanDrafts(input).map((plan, index) => ({
    key: `saved-${index}`,
    plan_category: plan.plan_category,
    duration_key: plan.duration_key,
    seat_type: plan.seat_type,
    hours_per_day: String(plan.hours_per_day),
    base_price: String(plan.base_price),
    discount_percentage: plan.discount_percentage ? String(plan.discount_percentage) : "",
    offer_name: plan.offer_name,
    description: plan.description,
  }));
}

function isBlankPlanRow(row: PlanRow) {
  return !row.base_price.trim() && !row.description.trim() && !row.offer_name.trim() && !row.discount_percentage.trim();
}

export function planRowsToDrafts(rows: PlanRow[]): LibraryPlanDraft[] {
  return rows
    .filter((row) => !isBlankPlanRow(row))
    .map((row) =>
      normalizePlanDraft({
        plan_category: row.plan_category as LibraryPlanDraft["plan_category"],
        duration_key: row.duration_key as LibraryPlanDraft["duration_key"],
        seat_type: row.seat_type as LibraryPlanDraft["seat_type"],
        hours_per_day: row.hours_per_day.trim() ? Number(row.hours_per_day) : 24,
        base_price: Number(row.base_price),
        discount_percentage: Number(row.discount_percentage || 0),
        offer_name: row.offer_name,
        description: row.description,
      }),
    );
}

function parseAmenities(text: string | null | undefined) {
  return [...new Set(String(text ?? "").split(/[,|\n]/).map((item) => item.trim()).filter(Boolean))];
}

function hhmm(value: string | null | undefined) {
  return value ? value.slice(0, 5) : "";
}

export function emptyLibraryFormValues(): LibraryFormValues {
  return {
    display_name: "",
    locality: "",
    city: "",
    district: "",
    state: "",
    pin_code: "",
    full_address: "",
    map_link: "",
    latitude: "",
    longitude: "",
    metro_override: false,
    nearest_metro: "",
    nearest_metro_distance_km: "",
    hours_mode: "set",
    opening_time: "",
    closing_time: "",
    phone_number: "",
    whatsapp_number: "",
    whatsapp_same: true,
    amenities: [],
    total_seats: "",
    description: "",
    plans: [],
  };
}

export type LibraryLikeRow = {
  display_name?: string | null;
  locality?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  pin_code?: string | null;
  full_address?: string | null;
  formatted_address?: string | null;
  map_link?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  nearest_metro?: string | null;
  nearest_metro_distance_km?: number | null;
  opening_time?: string | null;
  closing_time?: string | null;
  phone_number?: string | null;
  whatsapp_number?: string | null;
  amenities_text?: string | null;
  total_seats?: number | null;
  description?: string | null;
};

/** The form starts from what is actually saved, so empty always means empty. */
export function libraryToFormValues(row: LibraryLikeRow, plans: unknown = []): LibraryFormValues {
  const opening = hhmm(row.opening_time);
  const closing = hhmm(row.closing_time);
  const phone = row.phone_number ? (toNationalNumber(row.phone_number) ?? row.phone_number) : "";
  const whatsapp = row.whatsapp_number ? (toNationalNumber(row.whatsapp_number) ?? row.whatsapp_number) : "";
  const hoursMode: HoursMode = !opening && !closing ? "unknown" : opening === "00:00" && (closing === "00:00" || closing === "23:59") ? "24h" : "set";
  return {
    display_name: row.display_name ?? "",
    locality: row.locality ?? "",
    city: row.city ?? "",
    district: row.district ?? "",
    state: row.state ?? "",
    pin_code: row.pin_code ?? "",
    full_address: row.full_address ?? row.formatted_address ?? "",
    map_link: row.map_link ?? "",
    latitude: row.latitude === null || row.latitude === undefined ? "" : String(row.latitude),
    longitude: row.longitude === null || row.longitude === undefined ? "" : String(row.longitude),
    metro_override: false,
    nearest_metro: row.nearest_metro ?? "",
    nearest_metro_distance_km: row.nearest_metro_distance_km === null || row.nearest_metro_distance_km === undefined ? "" : String(row.nearest_metro_distance_km),
    hours_mode: hoursMode,
    opening_time: hoursMode === "set" ? opening : "",
    closing_time: hoursMode === "set" ? closing : "",
    phone_number: phone,
    whatsapp_number: whatsapp,
    whatsapp_same: Boolean(phone) && phone === whatsapp,
    amenities: parseAmenities(row.amenities_text),
    total_seats: row.total_seats ? String(row.total_seats) : "",
    description: row.description ?? "",
    plans: planDraftsToRows(plans),
  };
}

function digitsOf(value: string) {
  return value.replace(/\D/g, "");
}

/** Friendly reason a phone number is wrong, or null when it is fine. */
export function phoneError(raw: string, kind: "phone" | "whatsapp" = "phone"): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/[a-z]/i.test(value)) return "Use digits only, for example 98765 43210.";
  if (kind === "whatsapp") {
    if (normalizeIndianMobile(value)) return null;
    if (normalizeIndianPhone(value)) return "That looks like a landline. WhatsApp needs a mobile number.";
  } else if (normalizeIndianPhone(value)) {
    return null;
  }
  const digits = digitsOf(value).replace(/^(91|0)(?=\d{10}$)/, "");
  if (digits.length < 10) return `That number has ${digits.length} digit${digits.length === 1 ? "" : "s"}. Enter all 10.`;
  if (digits.length > 10) return `That number has ${digits.length} digits. Enter 10, without extra numbers.`;
  return kind === "whatsapp" ? "Enter a valid 10-digit mobile number." : "Enter a valid Indian number (mobile, or landline with STD code).";
}

export type HoursInput = { mode: HoursMode; opening: string; closing: string };

/** Reason the hours are incomplete or impossible, or null when they are fine. */
export function hoursError({ mode, opening, closing }: HoursInput, required: boolean): string | null {
  if (mode === "24h") return null;
  if (mode === "unknown") return required ? "Add your opening hours, or choose Open 24 hours." : null;
  if (!opening && !closing) return required ? "Add opening and closing time." : "Add the hours, or choose Not known.";
  if (!opening) return "Add the opening time too.";
  if (!closing) return "Add the closing time too.";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(opening) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(closing)) return "Enter valid times.";
  if (opening === closing && opening !== "00:00") return "Opening and closing can't be the same time. Choose Open 24 hours if it never closes.";
  return null;
}

/** Digits typed for a time ("9", "12", "930", "1130") plus AM or PM -> "HH:MM". */
export function timeFromDigits(digits: string, meridiem: "AM" | "PM"): string | null {
  if (!/^\d{1,4}$/.test(digits)) return null;
  const hourDigits = digits.length <= 2 ? digits : digits.slice(0, digits.length - 2);
  const minutes = digits.length <= 2 ? 0 : Number(digits.slice(-2));
  const hour = Number(hourDigits);
  if (hour < 1 || hour > 12 || minutes > 59) return null;
  const hours = (hour % 12) + (meridiem === "PM" ? 12 : 0);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function formatClock(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

/** "6:00 PM to 2:00 AM the next day" */
export function describeHours({ mode, opening, closing }: HoursInput): string | null {
  if (mode === "24h") return "Open all day, every day";
  if (mode !== "set" || !opening || !closing || opening === closing) return null;
  const clock = (value: string) => {
    const [hours, minutes] = value.split(":").map(Number);
    return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
  };
  return `${clock(opening)} to ${clock(closing)}${closing < opening ? " the next day" : ""}`;
}

export function seatsError(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (!/^\d+$/.test(value)) return "Enter a whole number of seats.";
  const seats = Number(value);
  if (seats < 1 || seats > MAX_SEATS) return `Seats must be between 1 and ${MAX_SEATS.toLocaleString("en-IN")}.`;
  return null;
}

/** Monthly fee typed in quick forms: accepts "2,500" and "₹2500". */
export function feeError(raw: string): string | null {
  if (!raw.trim()) return null;
  const amount = Number(raw.replace(/[^\d]/g, ""));
  if (!Number.isInteger(amount) || amount < 100 || amount > 100000) return "Enter a fee between ₹100 and ₹1,00,000.";
  return null;
}

function validatePlans(rows: PlanRow[], errors: FieldErrors) {
  const seen = new Map<string, number>();
  let filled = 0;
  rows.forEach((row, index) => {
    if (isBlankPlanRow(row)) return;
    filled += 1;
    const prefix = `plans.${index}`;
    if (!PLAN_CATEGORY_OPTIONS.some((option) => option.value === row.plan_category)) errors[`${prefix}.plan_category`] = "Choose Regular or Offer.";
    if (!DURATION_OPTIONS.some((option) => option.value === row.duration_key)) errors[`${prefix}.duration_key`] = "Choose a duration.";
    if (!SEAT_TYPE_OPTIONS.some((option) => option.value === row.seat_type)) errors[`${prefix}.seat_type`] = "Choose a seat type.";

    const price = Number(row.base_price);
    if (!row.base_price.trim()) errors[`${prefix}.base_price`] = "Enter the price.";
    else if (!Number.isInteger(price) || price < 1 || price > MAX_PRICE) errors[`${prefix}.base_price`] = "Enter a whole rupee amount, like 2500.";

    const hours = Number(row.hours_per_day);
    if (row.hours_per_day.trim() && (!Number.isInteger(hours) || hours < 1 || hours > 24)) errors[`${prefix}.hours_per_day`] = "Hours must be 1 to 24.";

    if (row.discount_percentage.trim()) {
      const discount = Number(row.discount_percentage);
      if (!Number.isInteger(discount) || discount < 0 || discount > 99) errors[`${prefix}.discount_percentage`] = "Discount must be 0 to 99%.";
    }
    if (countWords(row.description) > 30) errors[`${prefix}.description`] = "Keep the note to 30 words.";
    if (row.offer_name.length > 80) errors[`${prefix}.offer_name`] = "Keep the offer name under 80 characters.";

    const identity = [row.plan_category, row.duration_key, row.seat_type, row.hours_per_day.trim() || "24", row.offer_name.trim().toLowerCase()].join("|");
    const earlier = seen.get(identity);
    if (earlier !== undefined) {
      errors[`${prefix}.duration_key`] = `Same as plan ${earlier + 1}. Change it or remove one.`;
    } else {
      seen.set(identity, index);
    }
  });
  if (filled > MAX_FEE_PLANS) errors.plans = `Add at most ${MAX_FEE_PLANS} plans.`;
}

const tidy = (value: string) => value.trim().replace(/\s+/g, " ");

/**
 * Field-level errors. With a baseline (the saved library), values nobody
 * touched are not format-checked, so old imperfect data never blocks an
 * unrelated edit.
 */
export function validateLibraryForm(values: LibraryFormValues, options: { mode: LibraryFormMode; baseline?: LibraryFormValues }): FieldErrors {
  const { mode, baseline } = options;
  const errors: FieldErrors = {};
  const owner = mode === "owner";
  const unchanged = <K extends keyof LibraryFormValues>(key: K) => Boolean(baseline) && JSON.stringify(baseline![key]) === JSON.stringify(values[key]);
  const required = (key: "display_name" | "locality" | "city" | "state" | "pin_code" | "full_address", message: string) => {
    if (!tidy(values[key])) errors[key] = message;
  };
  const maxLength = (key: "display_name" | "locality" | "city" | "district" | "state" | "full_address" | "description", limit: number) => {
    if (values[key].length > limit && !unchanged(key)) errors[key] = `Keep this under ${limit.toLocaleString("en-IN")} characters (now ${values[key].length.toLocaleString("en-IN")}).`;
  };

  required("display_name", "Enter the library's name.");
  required("locality", "Enter the locality, for example Laxmi Nagar.");
  required("city", "Enter the city.");
  if (owner) {
    required("state", "Enter the state.");
    required("full_address", "Enter the full address so students can find you.");
  }
  if (owner || baseline?.pin_code) required("pin_code", "Enter the 6-digit PIN code.");

  maxLength("display_name", 200);
  maxLength("locality", 120);
  maxLength("city", 80);
  maxLength("district", 120);
  maxLength("state", 120);
  maxLength("full_address", 500);
  maxLength("description", 3000);

  if (values.pin_code.trim() && !unchanged("pin_code") && !/^[1-9]\d{5}$/.test(values.pin_code.trim())) {
    errors.pin_code = "A PIN code has exactly 6 digits and doesn't start with 0.";
  }

  // Location: any link, coordinates or address is accepted; the server reads it on save.
  const mapLink = values.map_link.trim();
  if (mapLink.length > 4000 && !unchanged("map_link")) errors.map_link = "That's too long. In Google Maps, tap Share and copy the link.";
  if (owner && !mapLink && !(values.latitude.trim() && values.longitude.trim())) {
    errors.map_link = "Add your location: paste a Google Maps link, or tap I'm at the library now.";
  }
  const latText = values.latitude.trim();
  const lngText = values.longitude.trim();
  if (Boolean(latText) !== Boolean(lngText)) {
    errors[latText ? "longitude" : "latitude"] = "Enter both latitude and longitude, or neither.";
  } else if (latText && !(unchanged("latitude") && unchanged("longitude"))) {
    const lat = Number(latText);
    const lng = Number(lngText);
    if (!isValidLatitude(lat)) errors.latitude = "Latitude must be a number between -90 and 90.";
    else if (!isValidLongitude(lng)) errors.longitude = "Longitude must be a number between -180 and 180.";
    else if (lat >= 68 && lat <= 98 && lng >= 6 && lng <= 38) errors.latitude = "These look swapped. In India, latitude is about 8 to 37 and longitude about 68 to 97.";
    else if (lat < 6 || lat > 38 || lng < 68 || lng > 98) errors.latitude = "This location is outside India. Check the numbers.";
  }
  if (values.metro_override && values.nearest_metro_distance_km.trim()) {
    const distance = Number(values.nearest_metro_distance_km);
    if (!Number.isFinite(distance) || distance < 0 || distance > 100) errors.nearest_metro_distance_km = "Distance must be between 0 and 100 km.";
  }

  // Hours
  const hoursUnchanged = unchanged("hours_mode") && unchanged("opening_time") && unchanged("closing_time");
  if (!hoursUnchanged) {
    const message = hoursError({ mode: values.hours_mode, opening: values.opening_time, closing: values.closing_time }, owner);
    if (message) errors.hours = message;
  } else if (owner && values.hours_mode === "unknown") {
    errors.hours = "Add your opening hours, or choose Open 24 hours.";
  }

  // Contact
  if (!values.phone_number.trim()) {
    if (owner) errors.phone_number = "Enter a phone number students can call.";
  } else if (!unchanged("phone_number")) {
    const message = phoneError(values.phone_number);
    if (message) errors.phone_number = message;
  }
  const whatsapp = values.whatsapp_same ? values.phone_number : values.whatsapp_number;
  const whatsappUnchanged = baseline ? (baseline.whatsapp_same ? baseline.phone_number : baseline.whatsapp_number) === whatsapp : false;
  // "Same as phone" with a landline just means no WhatsApp.
  const landlineSame = values.whatsapp_same && !normalizeIndianMobile(whatsapp);
  if (whatsapp.trim() && !whatsappUnchanged && !landlineSame) {
    const message = phoneError(whatsapp, "whatsapp");
    if (message) errors.whatsapp_number = message;
  }

  // Amenities, seats
  if (owner && values.amenities.length === 0) errors.amenities = "Pick at least one amenity.";
  if (values.amenities.length > 30) errors.amenities = "Pick at most 30 amenities.";
  if (values.amenities.some((item) => item.length > 80) && !unchanged("amenities")) errors.amenities = "An amenity name is too long.";
  if (!values.total_seats.trim()) {
    if (owner) errors.total_seats = "Enter how many seats you have.";
  } else if (!unchanged("total_seats")) {
    const message = seatsError(values.total_seats);
    if (message) errors.total_seats = message;
  }

  validatePlans(values.plans, errors);
  return errors;
}

export type CleanLibraryValues = {
  display_name: string;
  locality: string;
  city: string;
  district: string | null;
  state: string | null;
  pin_code: string | null;
  full_address: string | null;
  map_link: string | null;
  latitude: number | null;
  longitude: number | null;
  opening_time: string | null;
  closing_time: string | null;
  phone_number: string | null;
  whatsapp_number: string | null;
  amenities_text: string | null;
  total_seats: number | null;
  description: string | null;
  plans: LibraryPlanDraft[];
};

/** Database-ready values. Call only after validateLibraryForm found nothing. */
export function cleanLibraryForm(values: LibraryFormValues): CleanLibraryValues {
  const orNull = (value: string) => tidy(value) || null;
  const phone = values.phone_number.trim();
  const whatsapp = (values.whatsapp_same ? values.phone_number : values.whatsapp_number).trim();
  const lat = values.latitude.trim();
  const lng = values.longitude.trim();
  return {
    display_name: tidy(values.display_name),
    locality: tidy(values.locality),
    city: tidy(values.city),
    district: orNull(values.district),
    state: orNull(values.state),
    pin_code: orNull(values.pin_code),
    full_address: orNull(values.full_address),
    map_link: values.map_link.trim() || null,
    latitude: lat && lng ? Number(lat) : null,
    longitude: lat && lng ? Number(lng) : null,
    opening_time: values.hours_mode === "24h" ? "00:00" : values.hours_mode === "set" ? values.opening_time || null : null,
    closing_time: values.hours_mode === "24h" ? "00:00" : values.hours_mode === "set" ? values.closing_time || null : null,
    // A saved number that can't be normalised stays as it was.
    phone_number: phone ? (normalizeIndianPhone(phone) ?? phone) : null,
    whatsapp_number: whatsapp ? (normalizeIndianMobile(whatsapp) ?? (values.whatsapp_same ? null : whatsapp)) : null,
    amenities_text: values.amenities.length ? values.amenities.map((item) => item.trim()).filter(Boolean).join(", ") : null,
    total_seats: values.total_seats.trim() ? Number(values.total_seats) : null,
    description: values.description.trim() || null,
    plans: planRowsToDrafts(values.plans),
  };
}

/** Which sections differ from the saved library, in form order. */
export function changedFieldKeys(values: LibraryFormValues, baseline: LibraryFormValues): string[] {
  const keys = new Set<string>();
  const planShape = (rows: PlanRow[]) =>
    JSON.stringify(rows.filter((row) => !isBlankPlanRow(row)).map(({ key: _key, ...rest }) => rest));
  for (const key of Object.keys(values) as Array<keyof LibraryFormValues>) {
    if (key === "plans" || key === "whatsapp_same") continue;
    if (JSON.stringify(values[key]) !== JSON.stringify(baseline[key])) {
      if (key === "hours_mode" || key === "opening_time" || key === "closing_time") keys.add("hours");
      else if (key === "metro_override" || key === "nearest_metro_distance_km") keys.add("nearest_metro");
      else keys.add(key);
    }
  }
  const effectiveWhatsapp = (form: LibraryFormValues) => (form.whatsapp_same ? form.phone_number : form.whatsapp_number);
  if (effectiveWhatsapp(values) !== effectiveWhatsapp(baseline)) keys.add("whatsapp_number");
  else keys.delete("whatsapp_number");
  if (planShape(values.plans) !== planShape(baseline.plans)) keys.add("plans");
  return [...keys];
}

export { getDurationLabel };
