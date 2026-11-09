import { describe, it, expect, vi, beforeAll } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/maps-coordinates", () => ({
  extractCoordinatesFromMapLink: vi.fn(() => null),
}));

describe("Google Maps Resolver - SSRF Protection", () => {
  describe("isResolvableGoogleMapsLink", () => {
    let isResolvableGoogleMapsLink: (value: string | null | undefined) => boolean;

    beforeAll(async () => {
      const mod = await import("@/lib/server/google-maps-resolver");
      isResolvableGoogleMapsLink = mod.isResolvableGoogleMapsLink;
    });

    it("accepts valid Google Maps URLs", () => {
      expect(isResolvableGoogleMapsLink("https://www.google.com/maps/place/test")).toBe(true);
      expect(isResolvableGoogleMapsLink("https://maps.app.goo.gl/abc123")).toBe(true);
      expect(isResolvableGoogleMapsLink("https://google.co.in/maps/place/test")).toBe(true);
    });

    it("rejects non-Google URLs", () => {
      expect(isResolvableGoogleMapsLink("https://evil.com")).toBe(false);
      expect(isResolvableGoogleMapsLink("https://fake-google.com/maps")).toBe(false);
    });

    it("rejects internal/private URLs (SSRF vectors)", () => {
      expect(isResolvableGoogleMapsLink("http://localhost/maps")).toBe(false);
      expect(isResolvableGoogleMapsLink("http://127.0.0.1/maps")).toBe(false);
      expect(isResolvableGoogleMapsLink("http://10.0.0.1/maps")).toBe(false);
      expect(isResolvableGoogleMapsLink("http://192.168.1.1/maps")).toBe(false);
      expect(isResolvableGoogleMapsLink("http://172.16.0.1/maps")).toBe(false);
    });

    it("rejects cloud metadata endpoints", () => {
      expect(isResolvableGoogleMapsLink("http://169.254.169.254/latest/meta-data/")).toBe(false);
      expect(isResolvableGoogleMapsLink("http://metadata.google.internal/")).toBe(false);
    });

    it("rejects null and undefined", () => {
      expect(isResolvableGoogleMapsLink(null)).toBe(false);
      expect(isResolvableGoogleMapsLink(undefined)).toBe(false);
    });

    it("rejects empty string", () => {
      expect(isResolvableGoogleMapsLink("")).toBe(false);
    });

    it("rejects invalid URLs", () => {
      expect(isResolvableGoogleMapsLink("not-a-url")).toBe(false);
      expect(isResolvableGoogleMapsLink("://missing-protocol")).toBe(false);
    });

    it("rejects javascript: protocol", () => {
      expect(isResolvableGoogleMapsLink("javascript:alert(1)")).toBe(false);
    });

    it("rejects file: protocol", () => {
      expect(isResolvableGoogleMapsLink("file:///etc/passwd")).toBe(false);
    });
  });
});
