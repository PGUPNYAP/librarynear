import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  formatIndianPhone,
  normalizeIndianMobile,
  normalizeIndianPhone,
  toWhatsAppHref,
  toTelHref,
} from "@/lib/phone";
import {
  buildAnswerSummary,
  buildLibraryFaqs,
  buildOpeningHoursSpecification,
  formatTimingLabel,
  getPriceRange,
  isOpen24Hours,
  isOvernight,
} from "@/lib/library-seo";
import { amenityOrFilter, amenitySlugsFor, getAmenityByLabel, getAmenityBySlug } from "@/lib/amenities";
import { citySlug, libraryTitleParts, slugToIlikePattern, slugToLabel, toPlaceSlug } from "@/lib/places";
import { detectImageType } from "@/lib/server/imagekit";
import { getExamName } from "@/lib/exams";
import { isLeadStatus } from "@/lib/lead-status";

describe("phone numbers", () => {
  it.each([
    ["9876543210", "9876543210"],
    ["+91 98765 43210", "9876543210"],
    ["+91-98765-43210", "9876543210"],
    ["098765 43210", "9876543210"],
    ["0091 9876543210", "9876543210"],
    ["919876543210", "9876543210"],
  ])("normalizes mobile %s", (input, expected) => {
    expect(normalizeIndianMobile(input)).toBe(expected);
  });

  it("rejects numbers that are not Indian mobiles", () => {
    expect(normalizeIndianMobile("5876543210")).toBeNull();
    expect(normalizeIndianMobile("12345")).toBeNull();
    expect(normalizeIndianMobile("")).toBeNull();
    expect(normalizeIndianMobile(null)).toBeNull();
  });

  it("accepts landlines with STD code as phone numbers but not for WhatsApp", () => {
    expect(normalizeIndianPhone("011-2345 6789")).toBe("1123456789");
    expect(normalizeIndianPhone("(011) 23456789")).toBe("1123456789");
    expect(toWhatsAppHref("011-2345 6789")).toBeNull();
    expect(toTelHref("011-2345 6789")).toBe("tel:+911123456789");
  });

  it("builds wa.me links without a plus sign or spaces", () => {
    expect(toWhatsAppHref("098765-43210")).toBe("https://wa.me/919876543210");
    expect(formatIndianPhone("9876543210")).toBe("+91 98765 43210");
  });
});

describe("opening hours", () => {
  it("detects 24-hour and overnight timings", () => {
    expect(isOpen24Hours({ opening_time: "00:00:00", closing_time: "00:00:00" })).toBe(true);
    expect(isOpen24Hours({ opening_time: "00:00", closing_time: "23:59" })).toBe(true);
    expect(isOvernight({ opening_time: "18:00", closing_time: "02:00" })).toBe(true);
    expect(isOvernight({ opening_time: "06:00", closing_time: "22:00" })).toBe(false);
  });

  it("splits overnight hours into two schema.org specs", () => {
    const spec = buildOpeningHoursSpecification({ opening_time: "18:00:00", closing_time: "02:00:00" });
    expect(spec).toHaveLength(2);
    expect(spec?.[0]).toMatchObject({ opens: "18:00", closes: "23:59" });
    expect(spec?.[1]).toMatchObject({ opens: "00:00", closes: "02:00" });
  });

  it("returns nothing when timings are missing or unparseable", () => {
    expect(buildOpeningHoursSpecification({ opening_time: null, closing_time: null })).toBeUndefined();
    expect(buildOpeningHoursSpecification({ opening_time: "6 am", closing_time: "10 pm" })).toBeUndefined();
  });

  it("labels timings for people", () => {
    expect(formatTimingLabel({ opening_time: "00:00", closing_time: "00:00" })).toBe("Open 24 hours");
    expect(formatTimingLabel({ opening_time: "18:00", closing_time: "02:00" })).toContain("(next day)");
  });
});

describe("answer-first content", () => {
  const base = {
    display_name: "Ambey Library",
    locality: "Uttam Nagar",
    city: "Delhi",
    nearest_metro: "Uttam Nagar East",
    nearest_metro_distance_km: 0.4,
    total_seats: 80,
    aggregate_rating: 4.5,
    review_count: 12,
    amenities: ["AC", "Wi-Fi", "Locker"],
    feePlans: [{ price: 1500 }, { price: 2500, discounted_price: 2000 }],
    opening_time: "06:00",
    closing_time: "22:00",
    verification_status: "verified",
    full_address: "B-12, Uttam Nagar",
    phone_number: "9876543210",
  };

  it("summarises price, hours, metro and rating in one sentence", () => {
    const summary = buildAnswerSummary(base);
    expect(summary).toContain("verified study library in Uttam Nagar, Delhi");
    expect(summary).toMatch(/₹1,500/);
    expect(summary).toContain("Uttam Nagar East metro");
    expect(summary).toContain("4.5/5");
  });

  it("only asks FAQs the data can answer", () => {
    const sparse = buildLibraryFaqs({ ...base, feePlans: [], opening_time: null, closing_time: null, amenities: [], total_seats: null, aggregate_rating: null, review_count: null, nearest_metro: null });
    const questions = sparse.map((faq) => faq.question);
    expect(questions.some((q) => q.includes("fees"))).toBe(false);
    expect(questions.some((q) => q.includes("timings"))).toBe(false);
    expect(questions[0]).toContain("Where is Ambey Library");
  });

  it("computes the price range from effective prices", () => {
    expect(getPriceRange(base.feePlans)).toEqual({ min: 1500, max: 2000 });
    expect(getPriceRange([{ price: 0 }])).toBeNull();
  });
});

describe("amenities", () => {
  it("maps free text to canonical amenities without false positives", () => {
    expect(amenitySlugsFor("AC, Wi-Fi, RO Water")).toEqual(expect.arrayContaining(["ac", "wi-fi", "ro-water"]));
    // "space" contains "ac" but is not AC.
    expect(amenitySlugsFor("Spacious hall, Backup")).not.toContain("ac");
    expect(amenitySlugsFor(null)).toEqual([]);
  });

  it("resolves labels and slugs", () => {
    expect(getAmenityByLabel("wifi")?.slug).toBe("wi-fi");
    expect(getAmenityBySlug("power-backup")?.label).toBe("Power Backup");
    expect(getAmenityBySlug("hot-tub")).toBeNull();
  });

  it("builds a safe PostgREST filter", () => {
    const filter = amenityOrFilter(getAmenityBySlug("ac")!);
    expect(filter).toContain('amenities_text.ilike."ac"');
    expect(filter).not.toMatch(/[()]/);
  });
});

describe("slugs and titles", () => {
  it("keeps URL slugs lowercase and stable", () => {
    expect(citySlug("Navi Mumbai")).toBe("navi-mumbai");
    expect(toPlaceSlug("  Mukherjee Nagar ")).toBe("mukherjee-nagar");
    expect(slugToLabel("mukherjee-nagar")).toBe("Mukherjee Nagar");
  });

  it("matches hyphen or space when looking a slug up", () => {
    expect(slugToIlikePattern("mayur-vihar-phase-1")).toBe("mayur_vihar_phase_1");
    expect(slugToIlikePattern("100%-off")).toBe("100_off");
  });

  it("does not repeat the locality in library titles", () => {
    expect(libraryTitleParts("Ambey Library, Uttam Nagar", "Uttam Nagar", "Delhi")).toEqual([
      "Ambey Library, Uttam Nagar",
      "Delhi",
    ]);
    expect(libraryTitleParts("Ambey Library", "Uttam Nagar", "Delhi")).toEqual(["Ambey Library", "Uttam Nagar", "Delhi"]);
  });
});

describe("uploads", () => {
  const bytes = (...values: number[]) => new Uint8Array([...values, ...new Array(16).fill(0)]);
  const ascii = (text: string) => Array.from(text).map((char) => char.charCodeAt(0));

  it("recognises real image formats by their bytes", () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpg");
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(detectImageType(bytes(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")))).toBe("webp");
  });

  it("rejects SVG and HTML even when named .jpg", () => {
    expect(detectImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))).toBeNull();
    expect(detectImageType(new TextEncoder().encode("<!doctype html><html></html>"))).toBeNull();
  });
});

describe("allow-lists", () => {
  it("only known exams get pages", () => {
    expect(getExamName("upsc")).toBe("UPSC");
    expect(getExamName("anything")).toBeNull();
  });

  it("only known lead statuses are accepted", () => {
    expect(isLeadStatus("converted")).toBe(true);
    expect(isLeadStatus("'; drop table leads; --")).toBe(false);
  });
});
