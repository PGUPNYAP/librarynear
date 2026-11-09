/**
 * Pure helpers that turn a library's own data into answer-first copy, FAQs and
 * schema.org fragments. Everything here is derived from the listing itself so
 * every page gets unique, factual content (no generic boilerplate).
 */

export type TimingInput = {
  opening_time: string | null | undefined;
  closing_time: string | null | undefined;
};

export type FeePlanLike = {
  price: number | null;
  discounted_price?: number | null;
  currency?: string | null;
  plan_name?: string | null;
  duration_label?: string | null;
  seat_type?: string | null;
  hours_per_day?: number | null;
};

export type LibrarySeoInput = TimingInput & {
  display_name: string;
  locality: string | null;
  city: string;
  district?: string | null;
  nearest_metro: string | null;
  nearest_metro_distance_km: number | null;
  total_seats: number | null;
  aggregate_rating: number | null;
  review_count: number | null;
  amenities: string[];
  feePlans: FeePlanLike[];
  verification_status?: string | null;
  full_address?: string | null;
  formatted_address?: string | null;
  phone_number?: string | null;
};

function parseClock(value: string | null | undefined): { h: number; m: number } | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 24 || m > 59) return null;
  return { h: h === 24 ? 0 : h, m };
}

export function toHHMM(value: string | null | undefined): string | null {
  const clock = parseClock(value);
  if (!clock) return null;
  return `${String(clock.h).padStart(2, "0")}:${String(clock.m).padStart(2, "0")}`;
}

export function formatClockLabel(value: string | null | undefined): string | null {
  const clock = parseClock(value);
  if (!clock) return value ?? null;
  const period = clock.h >= 12 ? "PM" : "AM";
  const hours = clock.h % 12 || 12;
  return `${hours}:${String(clock.m).padStart(2, "0")} ${period}`;
}

export function isOpen24Hours({ opening_time, closing_time }: TimingInput): boolean {
  const open = toHHMM(opening_time);
  const close = toHHMM(closing_time);
  if (!open || !close) return false;
  return open === close || (open === "00:00" && (close === "23:59" || close === "00:00"));
}

export function isOvernight(timing: TimingInput): boolean {
  const open = toHHMM(timing.opening_time);
  const close = toHHMM(timing.closing_time);
  if (!open || !close || isOpen24Hours(timing)) return false;
  return close < open;
}

export function formatTimingLabel(timing: TimingInput): string | null {
  if (isOpen24Hours(timing)) return "Open 24 hours";
  const open = formatClockLabel(timing.opening_time);
  const close = formatClockLabel(timing.closing_time);
  if (!open || !close) return null;
  return `${open} – ${close}${isOvernight(timing) ? " (next day)" : ""}`;
}

const ALL_DAYS = [
  "https://schema.org/Monday",
  "https://schema.org/Tuesday",
  "https://schema.org/Wednesday",
  "https://schema.org/Thursday",
  "https://schema.org/Friday",
  "https://schema.org/Saturday",
  "https://schema.org/Sunday",
];

/** schema.org openingHoursSpecification that handles 24h and overnight hours. */
export function buildOpeningHoursSpecification(timing: TimingInput) {
  const open = toHHMM(timing.opening_time);
  const close = toHHMM(timing.closing_time);
  if (!open || !close) return undefined;

  if (isOpen24Hours(timing)) {
    return [{ "@type": "OpeningHoursSpecification", dayOfWeek: ALL_DAYS, opens: "00:00", closes: "23:59" }];
  }

  if (isOvernight(timing)) {
    return [
      { "@type": "OpeningHoursSpecification", dayOfWeek: ALL_DAYS, opens: open, closes: "23:59" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: ALL_DAYS, opens: "00:00", closes: close },
    ];
  }

  return [{ "@type": "OpeningHoursSpecification", dayOfWeek: ALL_DAYS, opens: open, closes: close }];
}

export function effectivePrice(plan: FeePlanLike): number | null {
  const value = plan.discounted_price ?? plan.price;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function getPriceRange(plans: FeePlanLike[]): { min: number; max: number } | null {
  const prices = plans.map(effectivePrice).filter((value): value is number => value !== null);
  if (prices.length === 0) return null;
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export function formatInr(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPriceRange(plans: FeePlanLike[]): string | null {
  const range = getPriceRange(plans);
  if (!range) return null;
  return range.min === range.max
    ? formatInr(range.min)
    : `${formatInr(range.min)} – ${formatInr(range.max)}`;
}

function metroPhrase(lib: LibrarySeoInput): string | null {
  if (!lib.nearest_metro) return null;
  const station = /metro/i.test(lib.nearest_metro) ? lib.nearest_metro : `${lib.nearest_metro} metro station`;
  if (typeof lib.nearest_metro_distance_km === "number" && lib.nearest_metro_distance_km > 0) {
    const walk = Math.round(lib.nearest_metro_distance_km * 12);
    return `${lib.nearest_metro_distance_km} km from ${station}${walk <= 25 ? ` (about ${walk} min walk)` : ""}`;
  }
  return `near ${station}`;
}

function placeLabel(lib: LibrarySeoInput) {
  return [lib.locality, lib.city].filter(Boolean).join(", ");
}

/** One-paragraph, answer-first summary used at the top of the page and in llms-full.txt. */
export function buildAnswerSummary(lib: LibrarySeoInput): string {
  const price = formatPriceRange(lib.feePlans);
  const timing = formatTimingLabel(lib);
  const metro = metroPhrase(lib);
  const rating =
    lib.aggregate_rating && lib.review_count
      ? `rated ${lib.aggregate_rating.toFixed(1)}/5 from ${lib.review_count} review${lib.review_count === 1 ? "" : "s"}`
      : null;

  const facts = [
    price ? `fees ${price} per plan` : null,
    timing ? (timing === "Open 24 hours" ? "open 24 hours" : `open ${timing}`) : null,
    metro,
    lib.total_seats ? `${lib.total_seats} seats` : null,
    rating,
  ].filter(Boolean);

  const lead = `${lib.display_name} is a ${lib.verification_status === "verified" ? "verified " : ""}study library in ${placeLabel(lib)}`;
  if (facts.length === 0) return `${lead}.`;
  return `${lead}: ${facts.join(", ")}.`;
}

export type FaqItem = { question: string; answer: string };

/** FAQs built only from facts the listing actually has. */
export function buildLibraryFaqs(lib: LibrarySeoInput): FaqItem[] {
  const faqs: FaqItem[] = [];
  const name = lib.display_name;
  const address = lib.full_address ?? lib.formatted_address;

  faqs.push({
    question: `Where is ${name} located?`,
    answer: address
      ? `${name} is at ${address}${lib.locality ? `, in the ${lib.locality} area of ${lib.city}` : ""}.`
      : `${name} is in ${placeLabel(lib)}.`,
  });

  const price = formatPriceRange(lib.feePlans);
  if (price) {
    const cheapest = [...lib.feePlans]
      .filter((plan) => effectivePrice(plan) !== null)
      .sort((a, b) => (effectivePrice(a) ?? 0) - (effectivePrice(b) ?? 0))[0];
    faqs.push({
      question: `What are the fees at ${name}?`,
      answer: `Plans at ${name} cost ${price}. The lowest-priced option is ${cheapest?.plan_name ?? "the basic plan"}${cheapest?.duration_label ? ` (${cheapest.duration_label})` : ""} at ${formatInr(effectivePrice(cheapest!) ?? 0)}. Confirm current pricing with the library before paying.`,
    });
  }

  const timing = formatTimingLabel(lib);
  if (timing) {
    faqs.push({
      question: `What are the timings of ${name}?`,
      answer:
        timing === "Open 24 hours"
          ? `${name} is open 24 hours, so you can study late at night or early in the morning.`
          : `${name} is open ${timing}${isOvernight(lib) ? ", which makes it suitable for late-night study" : ""}.`,
    });
  }

  const metro = metroPhrase(lib);
  if (metro) {
    faqs.push({
      question: `Which metro station is closest to ${name}?`,
      answer: `${name} is ${metro}.`,
    });
  }

  if (lib.amenities.length > 0) {
    const has = (needle: RegExp) => lib.amenities.some((amenity) => needle.test(amenity));
    faqs.push({
      question: `What facilities does ${name} have?`,
      answer: `Listed facilities include ${lib.amenities.slice(0, 8).join(", ")}.${has(/\bac\b|air/i) ? " The study hall is air-conditioned." : ""}${has(/wi-?fi/i) ? " Wi-Fi is available." : ""}`,
    });
  }

  if (lib.total_seats) {
    faqs.push({
      question: `How many seats does ${name} have?`,
      answer: `${name} lists ${lib.total_seats} seats. Seat availability changes often, so send an enquiry to check before visiting.`,
    });
  }

  if (lib.aggregate_rating && lib.review_count) {
    faqs.push({
      question: `Is ${name} a good library?`,
      answer: `Students rate ${name} ${lib.aggregate_rating.toFixed(1)} out of 5 across ${lib.review_count} review${lib.review_count === 1 ? "" : "s"} on LibraryNear.`,
    });
  }

  faqs.push({
    question: `How do I book a seat at ${name}?`,
    answer: `Use the enquiry form on this page${lib.phone_number ? " or call the library directly" : ""}. LibraryNear is free for students; you pay the library directly for your plan.`,
  });

  return faqs;
}

export function faqPageSchema(faqs: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}
