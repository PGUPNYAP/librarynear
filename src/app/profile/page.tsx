import Image from "next/image";
import { ArrowRight, Heart, PlusSquare, User2 } from "lucide-react";
import { GoogleLoginButton } from "@/components/auth/google-login-button";
import { IntentLink } from "@/components/intent-link";
import { getCurrentViewer, upsertProfileFromUser } from "@/lib/auth/profile";
import { logPerf, measureAsync } from "@/lib/perf";
import { supabaseServer } from "@/lib/supabase-server";

type OwnerSubmissionRow = {
  id: string;
  status: string;
  display_name: string;
  locality: string | null;
  city: string;
  created_at: string | null;
};

export const metadata = {
  title: "Profile",
  description: "Manage your LibraryNear account, saved libraries, and library listings.",
  robots: {
    index: false,
    follow: false,
  },
};

function formatStatus(status: string) {
  switch (status) {
    case "approved":
      return "Approved";
    case "needs_changes":
      return "Needs changes";
    case "rejected":
      return "Rejected";
    default:
      return "Under review";
  }
}

export default async function ProfilePage() {
  const { user, profile } = await getCurrentViewer();

  if (!user) {
    return (
      <div className="container mx-auto max-w-3xl px-6 py-16 text-center md:px-10">
        <div className="mx-auto flex h-18 w-18 items-center justify-center rounded-full bg-muted">
          <User2 className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="mt-6 text-3xl font-bold text-black">Sign in to open your account</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          Your account keeps your saved libraries synced across devices and lets you manage owner submissions
          from one place.
        </p>
        <GoogleLoginButton
          next="/profile"
          className="mx-auto mt-8 inline-flex items-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
        >
          Continue with Google
        </GoogleLoginButton>
      </div>
    );
  }

  await upsertProfileFromUser(user);

  const profileMeasurement = await measureAsync("profileQueries", async () =>
    Promise.all([
      supabaseServer
        .from("user_saved_libraries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
      supabaseServer
        .from("owner_library_submissions")
        .select("id, status, display_name, locality, city, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(6),
    ]),
  );

  const [{ count: savedCount }, submissionsResponse] = profileMeasurement.result;

  const displayName =
    profile?.full_name ??
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    "LibraryNear user";
  const avatarUrl =
    profile?.avatar_url ??
    (user.user_metadata?.avatar_url as string | undefined) ??
    (user.user_metadata?.picture as string | undefined) ??
    null;
  const submissions = (submissionsResponse.data ?? []) as OwnerSubmissionRow[];
  logPerf("profile", [profileMeasurement.metric], `saved=${savedCount ?? 0} submissions=${submissions.length}`);

  return (
    <div className="container mx-auto px-6 py-12 md:px-10">
      <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-3xl border border-border bg-white p-6 shadow-sm md:p-8">
          <div className="flex items-center gap-4">
            <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-[radial-gradient(circle_at_top,#e0e7ff_0%,#bfdbfe_60%,#eff6ff_100%)] ring-1 ring-black/5">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt={displayName}
                  fill
                  className="object-cover"
                  sizes="80px"
                />
              ) : (
                <span className="text-xl font-bold text-slate-700">
                  {displayName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-black">{displayName}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{profile?.email ?? user.email}</p>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <IntentLink
              href="/saved"
              className="rounded-2xl border border-border/70 bg-muted/20 p-4 transition-colors hover:bg-muted/40"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm">
                <Heart className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm font-semibold text-black">Saved libraries</p>
              <p className="mt-1 text-2xl font-bold text-black">{savedCount ?? 0}</p>
              <p className="mt-1 text-sm text-muted-foreground">Synced across your devices</p>
            </IntentLink>

            <IntentLink
              href="/for-owners"
              className="rounded-2xl border border-border/70 bg-muted/20 p-4 transition-colors hover:bg-muted/40"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm">
                <PlusSquare className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm font-semibold text-black">My listings</p>
              <p className="mt-1 text-2xl font-bold text-black">{submissions.length}</p>
              <p className="mt-1 text-sm text-muted-foreground">Owner submissions and review status</p>
            </IntentLink>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-border bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-black">Owner submissions</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Track libraries you have submitted for review.
                </p>
              </div>
              <IntentLink href="/for-owners" className="text-sm font-medium text-primary hover:underline">
                Manage listing
              </IntentLink>
            </div>

            {submissions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                No owner submissions yet. Use the For Owners page to submit your library.
              </div>
            ) : (
              <div className="space-y-3">
                {submissions.map((submission) => (
                  <div key={submission.id} className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-black">{submission.display_name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {[submission.locality, submission.city].filter(Boolean).join(", ")}
                        </p>
                      </div>
                      <span className="rounded-full bg-primary/8 px-3 py-1 text-xs font-semibold text-primary">
                        {formatStatus(submission.status)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-black">Quick access</h2>
            <div className="mt-4 space-y-3">
              <IntentLink
                href="/saved"
                className="flex items-center justify-between rounded-2xl border border-border/70 px-4 py-3 text-sm font-medium text-black transition-colors hover:bg-muted/50"
              >
                Open saved libraries
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </IntentLink>
              <IntentLink
                href="/for-owners"
                className="flex items-center justify-between rounded-2xl border border-border/70 px-4 py-3 text-sm font-medium text-black transition-colors hover:bg-muted/50"
              >
                Manage owner submissions
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </IntentLink>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
