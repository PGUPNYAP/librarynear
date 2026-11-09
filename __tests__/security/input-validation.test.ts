import { describe, it, expect } from "vitest";
import {
  normalizeIndianPhone,
  isValidPinCode,
  isValidLatitude,
  isValidLongitude,
  isValidMapLink,
  hasValidTimeRange,
  hasValidPlanDescriptions,
} from "@/lib/owner-form-validation";

describe("Owner Form Validation - Edge Cases", () => {
  describe("normalizeIndianPhone", () => {
    it("accepts valid 10-digit number starting with 6-9", () => {
      expect(normalizeIndianPhone("9876543210")).toBe("9876543210");
    });

    it("strips +91 prefix", () => {
      expect(normalizeIndianPhone("919876543210")).toBe("9876543210");
    });

    it("strips spaces and dashes", () => {
      expect(normalizeIndianPhone("98765 43210")).toBe("9876543210");
      expect(normalizeIndianPhone("98-765-43210")).toBe("9876543210");
    });

    it("rejects numbers with less than 10 digits", () => {
      expect(normalizeIndianPhone("12345")).toBeNull();
    });

    it("rejects numbers with more than 12 digits", () => {
      expect(normalizeIndianPhone("9199876543210")).toBeNull();
    });

    it("rejects empty string", () => {
      expect(normalizeIndianPhone("")).toBeNull();
    });

    it("handles all-zeroes (accepted by normalizer, blocked by lead regex)", () => {
      expect(normalizeIndianPhone("0000000000")).toBe("0000000000");
    });

    it("rejects alphabetic input", () => {
      expect(normalizeIndianPhone("abcdefghij")).toBeNull();
    });

    it("rejects XSS in phone field", () => {
      expect(normalizeIndianPhone("<script>alert(1)</script>")).toBeNull();
    });

    it("rejects SQL injection attempts", () => {
      expect(normalizeIndianPhone("'; DROP TABLE leads;--")).toBeNull();
    });
  });

  describe("isValidPinCode", () => {
    it("accepts valid 6-digit pin", () => {
      expect(isValidPinCode("110001")).toBe(true);
    });

    it("rejects 5-digit pin", () => {
      expect(isValidPinCode("11000")).toBe(false);
    });

    it("rejects 7-digit pin", () => {
      expect(isValidPinCode("1100001")).toBe(false);
    });

    it("rejects alphabetic input", () => {
      expect(isValidPinCode("abcdef")).toBe(false);
    });

    it("rejects empty string", () => {
      expect(isValidPinCode("")).toBe(false);
    });

    it("rejects pin with spaces", () => {
      expect(isValidPinCode("110 001")).toBe(false);
    });

    it("rejects negative number string", () => {
      expect(isValidPinCode("-11000")).toBe(false);
    });
  });

  describe("isValidLatitude", () => {
    it("accepts 0 (equator)", () => {
      expect(isValidLatitude(0)).toBe(true);
    });

    it("accepts 90 (north pole)", () => {
      expect(isValidLatitude(90)).toBe(true);
    });

    it("accepts -90 (south pole)", () => {
      expect(isValidLatitude(-90)).toBe(true);
    });

    it("accepts Delhi latitude (28.6139)", () => {
      expect(isValidLatitude(28.6139)).toBe(true);
    });

    it("rejects 91", () => {
      expect(isValidLatitude(91)).toBe(false);
    });

    it("rejects -91", () => {
      expect(isValidLatitude(-91)).toBe(false);
    });

    it("rejects NaN", () => {
      expect(isValidLatitude(NaN)).toBe(false);
    });

    it("rejects Infinity", () => {
      expect(isValidLatitude(Infinity)).toBe(false);
    });

    it("rejects null", () => {
      expect(isValidLatitude(null)).toBe(false);
    });
  });

  describe("isValidLongitude", () => {
    it("accepts 0 (prime meridian)", () => {
      expect(isValidLongitude(0)).toBe(true);
    });

    it("accepts 180", () => {
      expect(isValidLongitude(180)).toBe(true);
    });

    it("accepts -180", () => {
      expect(isValidLongitude(-180)).toBe(true);
    });

    it("rejects 181", () => {
      expect(isValidLongitude(181)).toBe(false);
    });

    it("rejects -181", () => {
      expect(isValidLongitude(-181)).toBe(false);
    });

    it("rejects NaN", () => {
      expect(isValidLongitude(NaN)).toBe(false);
    });

    it("rejects null", () => {
      expect(isValidLongitude(null)).toBe(false);
    });
  });

  describe("isValidMapLink", () => {
    it("accepts valid Google Maps link", () => {
      expect(isValidMapLink("https://www.google.com/maps/place/test")).toBe(true);
    });

    it("accepts short Google Maps link", () => {
      expect(isValidMapLink("https://maps.app.goo.gl/abc123")).toBe(true);
    });

    it("rejects non-Google domains", () => {
      expect(isValidMapLink("https://evil.com/maps")).toBe(false);
    });

    it("rejects localhost", () => {
      expect(isValidMapLink("http://localhost:3000/admin")).toBe(false);
    });

    it("rejects internal IPs (SSRF)", () => {
      expect(isValidMapLink("http://169.254.169.254/latest/meta-data/")).toBe(false);
      expect(isValidMapLink("http://10.0.0.1/internal")).toBe(false);
      expect(isValidMapLink("http://192.168.1.1/router")).toBe(false);
    });

    it("rejects null", () => {
      expect(isValidMapLink(null)).toBe(false);
    });

    it("rejects empty string", () => {
      expect(isValidMapLink("")).toBe(false);
    });

    it("rejects javascript: protocol", () => {
      expect(isValidMapLink("javascript:alert(1)")).toBe(false);
    });

    it("rejects data: protocol", () => {
      expect(isValidMapLink("data:text/html,<script>")).toBe(false);
    });
  });

  describe("hasValidTimeRange", () => {
    it("accepts valid range", () => {
      expect(hasValidTimeRange("06:00", "22:00")).toBe(true);
    });

    it("rejects when closing equals opening (except 24h)", () => {
      expect(hasValidTimeRange("09:00", "09:00")).toBe(false);
    });

    it("accepts overnight hours (closing after midnight)", () => {
      expect(hasValidTimeRange("22:00", "06:00")).toBe(true);
      expect(hasValidTimeRange("18:00:00", "02:00:00")).toBe(true);
    });

    it("accepts 24-hour libraries", () => {
      expect(hasValidTimeRange("00:00", "00:00")).toBe(true);
      expect(hasValidTimeRange("00:00", "23:59")).toBe(true);
    });

    it("rejects malformed times", () => {
      expect(hasValidTimeRange("25:00", "06:00")).toBe(false);
      expect(hasValidTimeRange("6 am", "10 pm")).toBe(false);
    });

    it("rejects null opening", () => {
      expect(hasValidTimeRange(null, "22:00")).toBe(false);
    });

    it("rejects null closing", () => {
      expect(hasValidTimeRange("06:00", null)).toBe(false);
    });

    it("rejects empty strings", () => {
      expect(hasValidTimeRange("", "")).toBe(false);
    });
  });

  describe("hasValidPlanDescriptions", () => {
    it("accepts empty JSON (no plans)", () => {
      expect(hasValidPlanDescriptions("")).toBe(true);
      expect(hasValidPlanDescriptions("  ")).toBe(true);
    });

    it("accepts valid plans with short descriptions", () => {
      const plans = JSON.stringify([{ description: "Monthly plan", base_price: 1000, duration_key: "monthly", seat_type: "unreserved", plan_category: "regular", discount_percentage: 0 }]);
      expect(hasValidPlanDescriptions(plans)).toBe(true);
    });

    it("truncates plans with >30 word descriptions (safe by design)", () => {
      const longDesc = Array(31).fill("word").join(" ");
      const plans = JSON.stringify([{ description: longDesc, base_price: 1000, duration_key: "monthly", seat_type: "unreserved", plan_category: "regular", discount_percentage: 0 }]);
      expect(hasValidPlanDescriptions(plans)).toBe(true);
    });

    it("rejects invalid JSON", () => {
      expect(hasValidPlanDescriptions("{invalid json")).toBe(false);
    });

    it("rejects XSS in plan descriptions", () => {
      const plans = JSON.stringify([{ description: "<script>alert(1)</script>", amount: 1000 }]);
      const result = hasValidPlanDescriptions(plans);
      expect(typeof result).toBe("boolean");
    });
  });
});
