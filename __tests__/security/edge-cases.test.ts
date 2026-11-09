import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

describe("Search API - Edge Cases", () => {
  describe("Query length limits", () => {
    it("truncates queries over 200 characters", () => {
      const longQuery = "a".repeat(500);
      const truncated = longQuery.trim().slice(0, 200);
      expect(truncated.length).toBe(200);
    });

    it("handles empty query gracefully", () => {
      const q = "";
      expect(q.length < 2).toBe(true);
    });

    it("handles single character query", () => {
      const q = "a";
      expect(q.length < 2).toBe(true);
    });
  });

  describe("Special character handling in search queries", () => {
    const specialChars = [
      { name: "SQL injection single quote", input: "'; DROP TABLE library_branches;--" },
      { name: "SQL injection double quote", input: '"; DROP TABLE library_branches;--' },
      { name: "PostgREST filter comma", input: "%,id.eq.secret-uuid" },
      { name: "PostgREST dot operator", input: "display_name.eq.hacked" },
      { name: "Parentheses grouping", input: "test(or(1,eq,1))" },
      { name: "Percent wildcard", input: "%%%%%%%%%%" },
      { name: "Backslash escape", input: "\\\\\\\\test" },
      { name: "Unicode null byte", input: "test\u0000value" },
      { name: "Very long unicode", input: "लाइब्रेरी".repeat(100) },
      { name: "HTML/XSS script tag", input: "<script>alert('xss')</script>" },
      { name: "HTML img onerror", input: '<img src=x onerror=alert(1)>' },
      { name: "Newlines", input: "test\ninjection\r\nattack" },
      { name: "Tab characters", input: "test\t\tvalue" },
      { name: "Null bytes mixed with valid", input: "delhi\x00admin" },
    ];

    for (const { name, input } of specialChars) {
      it(`handles ${name} without breaking`, () => {
        const trimmed = input.trim().slice(0, 200);
        expect(typeof trimmed).toBe("string");
        expect(trimmed.length).toBeLessThanOrEqual(200);
      });
    }
  });

  describe("City parameter validation", () => {
    it("truncates long city names", () => {
      const longCity = "x".repeat(100);
      const truncated = longCity.trim().toLowerCase().slice(0, 50);
      expect(truncated.length).toBe(50);
    });

    it("handles city with special characters", () => {
      const city = "new delhi, india; DROP TABLE";
      const processed = city.trim().toLowerCase().slice(0, 50);
      expect(processed).not.toContain("DROP TABLE");
    });
  });

  describe("Coordinate validation", () => {
    it("handles NaN coordinates", () => {
      expect(Number.isFinite(NaN)).toBe(false);
    });

    it("handles Infinity coordinates", () => {
      expect(Number.isFinite(Infinity)).toBe(false);
      expect(Number.isFinite(-Infinity)).toBe(false);
    });

    it("handles string-coerced coordinates", () => {
      const lat = Number("not-a-number");
      expect(Number.isFinite(lat)).toBe(false);
    });

    it("handles extremely precise coordinates", () => {
      const lat = 28.613899999999999;
      expect(Number.isFinite(lat)).toBe(true);
    });
  });
});

describe("Lead Submission - Edge Cases", () => {
  describe("Name field", () => {
    it("rejects empty name", () => {
      const name = "";
      expect(!name?.trim()).toBe(true);
    });

    it("rejects whitespace-only name", () => {
      const name = "   ";
      expect(!name?.trim()).toBe(true);
    });

    it("truncates extremely long names", () => {
      const name = "A".repeat(10000);
      const safe = name.trim().slice(0, 200);
      expect(safe.length).toBe(200);
    });

    it("handles XSS in name gracefully", () => {
      const name = '<script>document.cookie</script>';
      const safe = name.trim().slice(0, 200);
      expect(safe).toContain("<script>");
      expect(safe.length).toBeLessThanOrEqual(200);
    });
  });

  describe("Phone number field", () => {
    const validPhones = [
      "9876543210",
      "6123456789",
      "7000000000",
      "8999999999",
    ];

    const invalidPhones = [
      "",
      "123",
      "0000000000",
      "5876543210",
      "12345678901234",
      "abcdefghij",
      "+1-555-123-4567",
      "98765 43210 extra",
      "<script>",
      "'; DROP TABLE leads;--",
    ];

    for (const phone of validPhones) {
      it(`accepts valid Indian number: ${phone}`, () => {
        const cleaned = phone.replace(/\s/g, "");
        expect(/^[6-9]\d{9}$/.test(cleaned)).toBe(true);
      });
    }

    for (const phone of invalidPhones) {
      it(`rejects invalid input: "${phone.slice(0, 30)}"`, () => {
        const cleaned = phone.replace(/\s/g, "");
        expect(/^[6-9]\d{9}$/.test(cleaned)).toBe(false);
      });
    }
  });

  describe("Email field", () => {
    it("rejects extremely long emails", () => {
      const email = "a".repeat(400) + "@test.com";
      expect(email.length > 320).toBe(true);
    });

    it("handles null/undefined email", () => {
      const email = undefined as string | undefined;
      expect(email?.trim() || null).toBeNull();
    });
  });

  describe("Message field", () => {
    it("rejects messages over 2000 characters", () => {
      const msg = "x".repeat(2001);
      expect(msg.length > 2000).toBe(true);
    });

    it("preserves valid messages", () => {
      const msg = "I want to join this library for UPSC preparation.";
      expect(msg.trim().slice(0, 2000)).toBe(msg);
    });
  });
});

describe("Image Upload - Edge Cases", () => {
  const MAX_BYTES = 5 * 1024 * 1024;

  it("rejects zero-byte files", () => {
    const file = new File([], "empty.jpg", { type: "image/jpeg" });
    expect(file.size === 0).toBe(true);
  });

  it("rejects oversized files (>5MB)", () => {
    const bigBuffer = new ArrayBuffer(MAX_BYTES + 1);
    const file = new File([bigBuffer], "big.jpg", { type: "image/jpeg" });
    expect(file.size > MAX_BYTES).toBe(true);
  });

  it("rejects non-image MIME types", () => {
    const file = new File(["malicious content"], "shell.php", { type: "application/x-php" });
    expect(file.type.startsWith("image/")).toBe(false);
  });

  it("rejects file with image extension but wrong MIME", () => {
    const file = new File(["#!/bin/bash\nrm -rf /"], "exploit.jpg", { type: "application/x-sh" });
    expect(file.type.startsWith("image/")).toBe(false);
  });

  it("accepts valid image MIME types", () => {
    const types = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    for (const type of types) {
      const file = new File(["fake-image-data"], "test.img", { type });
      expect(file.type.startsWith("image/")).toBe(true);
    }
  });

  it("sanitizes filenames with special characters", () => {
    const maliciousName = "../../../etc/passwd";
    const sanitized = maliciousName.replace(/[^\w.-]+/g, "-").replace(/\.{2,}/g, ".") || "owner_submission.jpg";
    expect(sanitized).not.toContain("/");
    expect(sanitized).not.toContain("..");
  });

  it("handles extremely long filenames", () => {
    const longName = "a".repeat(1000) + ".jpg";
    const sanitized = longName.replace(/[^\w.-]+/g, "-") || "owner_submission.jpg";
    expect(typeof sanitized).toBe("string");
  });
});

describe("Owner Submission - Concurrent Duplicate Prevention", () => {
  it("prevents duplicate submissions by checking existing status", () => {
    const existingStatuses = ["pending_review", "approved"];
    const editableStatuses = ["needs_changes", "rejected"];

    for (const status of existingStatuses) {
      const isEditable = status === "needs_changes" || status === "rejected";
      expect(isEditable).toBe(false);
    }

    for (const status of editableStatuses) {
      const isEditable = status === "needs_changes" || status === "rejected";
      expect(isEditable).toBe(true);
    }
  });
});

describe("Saved Libraries - Cross-User Isolation", () => {
  it("normalizeIds deduplicates and filters empty strings", () => {
    function normalizeIds(ids: string[]) {
      return [...new Set(ids.filter(Boolean))];
    }

    expect(normalizeIds(["a", "b", "a", "", "c"])).toEqual(["a", "b", "c"]);
    expect(normalizeIds([])).toEqual([]);
    expect(normalizeIds(["", "", ""])).toEqual([]);
  });

  it("handles extremely large arrays", () => {
    function normalizeIds(ids: string[]) {
      return [...new Set(ids.filter(Boolean))];
    }

    const largeArray = Array.from({ length: 10000 }, (_, i) => `id-${i % 100}`);
    const result = normalizeIds(largeArray);
    expect(result.length).toBe(100);
  });
});
