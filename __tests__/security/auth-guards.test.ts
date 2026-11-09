import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

const mockSupabaseServer = {
  from: vi.fn((_table: string): any => ({
    update: vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) })),
    upsert: vi.fn(() => ({ error: null })),
    insert: vi.fn(() => ({ error: null })),
    delete: vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) })),
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(() => ({ data: null, error: null })),
      })),
    })),
  })),
};

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: mockSupabaseServer,
}));

const mockUser = { id: "user-123", email: "test@test.com" };
const mockStaffUser = { user_id: "user-123", role: "admin", is_approved: true };

let mockCurrentViewer = { user: null as typeof mockUser | null, profile: null };
let mockApprovedAdminCount = 1;

vi.mock("@/lib/auth/profile", () => ({
  getCurrentViewer: vi.fn(() => Promise.resolve(mockCurrentViewer)),
  upsertProfileFromUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        getUser: vi.fn(() => Promise.resolve({ data: { user: mockCurrentViewer.user } })),
      },
    }),
  ),
}));

vi.mock("@/lib/staff-access", async () => {
  const actual = await vi.importActual("@/lib/staff-access");
  return actual;
});

vi.mock("@/lib/library-activity", () => ({
  getCurrentActorUserId: vi.fn(() => Promise.resolve("actor-id")),
  logLibraryActivity: vi.fn(),
}));

describe("Admin Server Actions - Authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentViewer = { user: null, profile: null };
    mockApprovedAdminCount = 1;

    mockSupabaseServer.from.mockImplementation((table: string) => {
      if (table === "staff_users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_field: string, value: string | boolean) => {
              if (value === true) {
                return {
                  eq: vi.fn(() => ({
                    select: vi.fn(),
                  })),
                  select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      head: true,
                    })),
                  })),
                };
              }
              return {
                maybeSingle: vi.fn(() =>
                  Promise.resolve({
                    data: mockCurrentViewer.user ? mockStaffUser : null,
                    error: null,
                  }),
                ),
              };
            }),
            count: "exact",
            head: true,
          })),
          upsert: vi.fn(() => ({ error: null })),
        };
      }
      return {
        update: vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) })),
        insert: vi.fn(() => ({ error: null })),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => ({ data: null, error: null })),
          })),
        })),
      };
    });
  });

  describe("updateLeadStatus", () => {
    it("rejects unauthenticated users with redirect", async () => {
      mockCurrentViewer = { user: null, profile: null };

      const { updateLeadStatus } = await import("@/app/admin/leads-actions");
      await expect(updateLeadStatus("lead-1", "contacted")).rejects.toThrow("REDIRECT:");
    });
  });

  describe("setLibraryVerificationStatus", () => {
    it("refuses unauthenticated users without changing anything", async () => {
      mockCurrentViewer = { user: null, profile: null };

      const { setLibraryVerificationStatus } = await import("@/app/admin/libraries-actions");
      // Called from a client component, so it returns an error instead of redirecting.
      await expect(setLibraryVerificationStatus("lib-1", "verified")).resolves.toMatchObject({ ok: false });
    });

    it("rejects unknown status values", async () => {
      const { setLibraryVerificationStatus } = await import("@/app/admin/libraries-actions");
      await expect(
        setLibraryVerificationStatus("lib-1", "hacked" as unknown as "verified"),
      ).resolves.toMatchObject({ ok: false });
    });
  });

  describe("team actions", () => {
    it("saveStaffAccess rejects unauthenticated users", async () => {
      mockCurrentViewer = { user: null, profile: null };

      const { saveStaffAccess } = await import("@/app/admin/team/actions");
      const formData = new FormData();
      formData.set("user_id", "some-user");
      formData.set("role", "admin");
      formData.set("is_approved", "true");

      await expect(saveStaffAccess(formData)).rejects.toThrow("REDIRECT:");
    });

    it("addStaffByEmail rejects unauthenticated users", async () => {
      mockCurrentViewer = { user: null, profile: null };

      const { addStaffByEmail } = await import("@/app/admin/team/actions");
      const formData = new FormData();
      formData.set("email", "hacker@evil.com");
      formData.set("role", "admin");
      formData.set("is_approved", "true");

      await expect(addStaffByEmail(formData)).rejects.toThrow("REDIRECT:");
    });

    it("assignLocality rejects unauthenticated users", async () => {
      mockCurrentViewer = { user: null, profile: null };

      const { assignLocality } = await import("@/app/admin/team/actions");
      const formData = new FormData();
      formData.set("user_id", "victim-user");
      formData.set("locality_id", "loc-1");

      await expect(assignLocality(formData)).rejects.toThrow("REDIRECT:");
    });

    it("removeLocalityAssignment rejects unauthenticated users", async () => {
      mockCurrentViewer = { user: null, profile: null };

      const { removeLocalityAssignment } = await import("@/app/admin/team/actions");
      const formData = new FormData();
      formData.set("assignment_id", "assign-1");
      formData.set("user_id", "some-user");

      await expect(removeLocalityAssignment(formData)).rejects.toThrow("REDIRECT:");
    });
  });

  describe("owner submissions actions", () => {
    it("approveOwnerSubmission rejects unauthenticated users", async () => {
      mockCurrentViewer = { user: null, profile: null };

      const { approveOwnerSubmission } = await import("@/app/admin/owner-submissions/actions");
      const formData = new FormData();
      formData.set("id", "submission-1");

      await expect(approveOwnerSubmission(formData)).rejects.toThrow("REDIRECT:");
    });

    it("requestChangesOwnerSubmission rejects unauthenticated users", async () => {
      mockCurrentViewer = { user: null, profile: null };

      const { requestChangesOwnerSubmission } = await import("@/app/admin/owner-submissions/actions");
      const formData = new FormData();
      formData.set("id", "submission-1");
      formData.set("notes", "needs work");

      await expect(requestChangesOwnerSubmission(formData)).rejects.toThrow("REDIRECT:");
    });

    it("rejectOwnerSubmission rejects unauthenticated users", async () => {
      mockCurrentViewer = { user: null, profile: null };

      const { rejectOwnerSubmission } = await import("@/app/admin/owner-submissions/actions");
      const formData = new FormData();
      formData.set("id", "submission-1");
      formData.set("notes", "spam");

      await expect(rejectOwnerSubmission(formData)).rejects.toThrow("REDIRECT:");
    });
  });

  describe("image actions", () => {
    it("uploadLibraryImage rejects unauthenticated users", async () => {
      mockCurrentViewer = { user: null, profile: null };

      const { uploadLibraryImage } = await import("@/app/admin/libraries/image-actions");
      const formData = new FormData();
      formData.set("file", new File(["x"], "test.jpg", { type: "image/jpeg" }));

      await expect(uploadLibraryImage("lib-1", formData)).rejects.toThrow("REDIRECT:");
    });

    it("deleteLibraryImage rejects unauthenticated users", async () => {
      mockCurrentViewer = { user: null, profile: null };

      const { deleteLibraryImage } = await import("@/app/admin/libraries/image-actions");
      await expect(deleteLibraryImage("img-1")).rejects.toThrow("REDIRECT:");
    });
  });
});
