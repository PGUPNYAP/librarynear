/**
 * Indian phone number helpers.
 *
 * Accepts what people actually type: "+91 98765 43210", "098765-43210",
 * "0091 9876543210", "(011) 2345 6789", "9876543210".
 */

function digitsOnly(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

/** Strip country code / trunk prefix. Returns the national number (10 digits for mobiles). */
export function toNationalNumber(value: string | null | undefined): string | null {
  let digits = digitsOnly(value);
  if (!digits) return null;
  if (digits.startsWith("0091")) digits = digits.slice(4);
  else if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits.length >= 6 && digits.length <= 11 ? digits : null;
}

/** 10-digit Indian mobile (starts 6-9), or null. */
export function normalizeIndianMobile(value: string | null | undefined): string | null {
  const national = toNationalNumber(value);
  return national && /^[6-9]\d{9}$/.test(national) ? national : null;
}

/**
 * Any Indian number we can store: a mobile, or a landline written with its
 * STD code (10 digits in total once the leading 0 is removed).
 */
export function normalizeIndianPhone(value: string | null | undefined): string | null {
  const national = toNationalNumber(value);
  return national && /^\d{10}$/.test(national) ? national : null;
}

export function isIndianMobile(value: string | null | undefined) {
  return normalizeIndianMobile(value) !== null;
}

/** wa.me link, only for mobiles (landlines can't receive WhatsApp). */
export function toWhatsAppHref(value: string | null | undefined): string | null {
  const mobile = normalizeIndianMobile(value);
  return mobile ? `https://wa.me/91${mobile}` : null;
}

export function toTelHref(value: string | null | undefined): string | null {
  const national = normalizeIndianPhone(value);
  return national ? `tel:+91${national}` : null;
}

export function formatIndianPhone(value: string | null | undefined): string {
  const mobile = normalizeIndianMobile(value);
  if (mobile) return `+91 ${mobile.slice(0, 5)} ${mobile.slice(5)}`;
  const national = normalizeIndianPhone(value);
  return national ? `+91 ${national}` : (value ?? "");
}
