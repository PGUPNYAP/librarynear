import { CheckCircle2, Clock3, LockKeyhole, MapPin, ShieldCheck } from "lucide-react";
import { GoogleLoginButton } from "@/components/auth/google-login-button";
import { IntentLink } from "@/components/intent-link";
import { getCurrentViewer, upsertProfileFromUser } from "@/lib/auth/profile";
import { supabaseServer } from "@/lib/supabase-server";
import { logPerf, measureAsync } from "@/lib/perf";
import { OwnerSubmissionPlansForm } from "./owner-submission-plans-form";
import { OwnerLibraryForm } from "./owner-library-form";
import type { Json } from "@/types/supabase";

type OwnerSubmissionRow = {
  id: string;
  status: string;
  display_name: string;
  city: string;
  locality: string | null;
  district: string | null;
  state: string | null;
  pin_code: string | null;
  full_address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone_number: string | null;
  whatsapp_number: string | null;
  opening_time: string | null;
  closing_time: string | null;
  total_seats: number | null;
  map_link: string | null;
  description: string | null;
  amenities_text: string | null;
  image_urls: string[] | null;
  reviewer_notes: string | null;
  created_at: string | null;
  fee_plans: Json | null;
};

import { getSiteUrl } from "@/lib/site-url";

export const metadata = {
  title: "List Your Library — For Owners",
  description: "List your study library on LibraryNear and reach nearby students searching for reading rooms in Delhi. Manage your plans and reach more students today.",
  alternates: {
    canonical: `${getSiteUrl()}/for-owners`,
  },
  openGraph: {
    type: "website",
    title: "List Your Library — For Owners",
    description: "List your study library on LibraryNear and reach nearby students searching for reading rooms in Delhi.",
    siteName: "LibraryNear",
    url: `${getSiteUrl()}/for-owners`,
  },
};

function statusLabel(status: string) {
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

export default async function ForOwnersPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { submitted } = await searchParams;
  const { user } = await getCurrentViewer();

  if (user) {
    await upsertProfileFromUser(user);
  }

  const submissionsMeasurement = user
    ? await measureAsync("ownerSubmissions", async () =>
        (
          await supabaseServer
            .from("owner_library_submissions")
            .select("id, status, display_name, city, locality, district, state, pin_code, full_address, latitude, longitude, phone_number, whatsapp_number, opening_time, closing_time, total_seats, map_link, description, amenities_text, image_urls, reviewer_notes, created_at, fee_plans")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
        ).data ?? [],
      )
    : null;
  const submissions = submissionsMeasurement?.result ?? [];
  const latestSubmission = (submissions[0] as OwnerSubmissionRow | undefined) ?? null;
  const editableSubmission =
    latestSubmission &&
    (latestSubmission.status === "needs_changes" || latestSubmission.status === "rejected")
      ? latestSubmission
      : null;
  const hasLockedSubmission = Boolean(latestSubmission) && !editableSubmission;

  if (submissionsMeasurement) {
    logPerf("forOwners", [submissionsMeasurement.metric], `user=1 submissions=${submissions.length}`);
  }

  return (
    <div className="bg-slate-50/50">
      <section className="bg-[#0F74C5]">
        <div className="container mx-auto grid gap-10 px-6 py-14 md:grid-cols-[1.15fr_0.85fr] md:px-10 md:py-18">
          <div>
            <h1 className="mt-5 max-w-2xl text-4xl font-bold tracking-tight text-white md:text-5xl">
              Bring your library in front of students who are already searching nearby.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-white/80 md:text-lg">
              Sign in once with Google, complete the guided onboarding, and we will review your library
              before it goes live. After submission, you can update only your plans from this page.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {user ? (
                <a
                  href={hasLockedSubmission ? "#owner-submissions" : "#owner-form"}
                  className="inline-flex items-center rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-[#0F74C5] transition-colors hover:bg-white/90 shadow-sm"
                >
                  {hasLockedSubmission ? "Open your submission" : editableSubmission ? "Resume submission" : "Start onboarding"}
                </a>
              ) : (
                <GoogleLoginButton
                  next="/for-owners"
                  className="inline-flex items-center rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-[#0F74C5] transition-colors hover:bg-white/90 shadow-sm"
                >
                  Continue with Google
                </GoogleLoginButton>
              )}
              <IntentLink
                href="/profile"
                className="inline-flex items-center rounded-full border border-white/30 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                View account
              </IntentLink>
            </div>
          </div>

          <div className="grid gap-4 self-start rounded-3xl border border-border bg-white p-6 shadow-sm">
            {[
              {
                icon: ShieldCheck,
                title: "Guided first submission",
                body: "Each owner account can create one library listing, which keeps onboarding focused and supportable.",
              },
              {
                icon: Clock3,
                title: "Fast review flow",
                body: "We review the listing once. After that, you can update plans from the same dashboard without resubmitting the entire form.",
              },
              {
                icon: MapPin,
                title: "Automatic location enrichment",
                body: "Share your Google Maps link and we will calculate the nearest metro and distance from your coordinates.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="text-base font-semibold text-black">{title}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container mx-auto px-3 py-6 sm:px-6 md:px-10 md:py-12">
        {!user ? (
          <div className="mx-auto max-w-2xl rounded-3xl border border-border/60 bg-white p-10 text-center shadow-xl shadow-black/5">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#E5EDF4] text-primary">
              <ShieldCheck className="h-8 w-8" strokeWidth={2} />
            </div>
            <h2 className="text-3xl font-bold text-[#0F74C5]">Sign in before listing your library</h2>
            <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
              We use one secure Google sign-in for everyone. This allows owners to safely track their submission and prevents fake listings on our platform.
            </p>
            <GoogleLoginButton
              next="/for-owners"
              className="mx-auto mt-8 inline-flex items-center rounded-full bg-[#0F74C5] px-8 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-black/10 transition-transform hover:-translate-y-0.5 hover:bg-[#0F74C5]/90"
            >
              Continue with Google to list your library
            </GoogleLoginButton>
          </div>
        ) : hasLockedSubmission ? (
          <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-6">
              <div className="rounded-3xl border-0 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <div className="flex items-start gap-3">
                  <span className="mt-1 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <LockKeyhole className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-2xl font-bold text-black">Your library is already submitted</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      You can edit plans from this page. To update address, timings, phone numbers,
                      amenities, photos, or any other listing details after approval, please contact our team and we will help you.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border-0 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <h3 className="text-lg font-bold text-black">What happens next</h3>
                <div className="mt-4 space-y-4">
                  {[
                    "Your original onboarding details stay locked so the listing remains consistent and trustworthy.",
                    "Plan changes are saved from here and can update your live pricing immediately after approval has already happened.",
                    "Need help with anything beyond plans? Reach out to our team and we will update it for you.",
                  ].map((item) => (
                    <div key={item} className="flex gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-500" />
                      <p className="text-sm leading-6 text-muted-foreground">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div id="owner-submissions" className="rounded-3xl border-0 bg-white p-6 shadow-md md:p-8">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold text-black">Your submission</h3>
                <IntentLink href="/profile" className="text-sm font-medium text-primary hover:underline">
                  Open profile
                </IntentLink>
              </div>
              {submitted === "1" ? (
                <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  Your library submission is in review. We have locked the rest of the form and left plan editing available here.
                </div>
              ) : null}

              <div className="space-y-3">
                {(submissions as OwnerSubmissionRow[]).map((submission) => (
                  <div key={submission.id} className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-black">{submission.display_name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {[submission.locality, submission.city].filter(Boolean).join(", ")}
                        </p>
                      </div>
                      <span className="rounded-full bg-primary/8 px-3 py-1 text-xs font-semibold text-primary">
                        {statusLabel(submission.status)}
                      </span>
                    </div>
                    {submission.reviewer_notes ? (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        {submission.reviewer_notes}
                      </div>
                    ) : null}
                    <div className="mt-4">
                      <OwnerSubmissionPlansForm
                        submissionId={submission.id}
                        displayName={submission.display_name}
                        feePlans={submission.fee_plans}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div
              id="owner-form"
              className="rounded-2xl border-0 bg-white p-4 shadow-md sm:p-6 md:p-8"
            >
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-black">List your library in 2 minutes</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {editableSubmission ? "Update what's needed and resubmit." : "Paste your Google Maps link and we fill in most of this for you."}
                </p>
              </div>

              {submitted === "1" && (
                <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  Your library submission is in review. We will surface it in your owner dashboard below.
                </div>
              )}

              {editableSubmission?.status === "needs_changes" && editableSubmission.reviewer_notes ? (
                <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <span className="font-semibold">Changes requested:</span> {editableSubmission.reviewer_notes}
                </div>
              ) : null}

              {editableSubmission?.status === "rejected" ? (
                <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {editableSubmission.reviewer_notes
                    ? `Your previous submission was rejected. You can correct it and resubmit. Reviewer notes: ${editableSubmission.reviewer_notes}`
                    : "Your previous submission was rejected. You can correct it and resubmit from here."}
                </div>
              ) : null}

              <OwnerLibraryForm submission={editableSubmission} />
            </div>

            <div className="space-y-6">
              <div className="rounded-3xl border-0 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <h3 className="text-lg font-bold text-black">How onboarding works</h3>
                <div className="mt-4 space-y-4">
                  {[
                    "Submit one complete library profile with photos, location, timings, amenities, and seat count.",
                    "We calculate nearby metro details from your location automatically, so students see cleaner listing data.",
                    "After submission, plans remain editable from your dashboard while all other changes go through our team.",
                  ].map((item) => (
                    <div key={item} className="flex gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-500" />
                      <p className="text-sm leading-6 text-muted-foreground">{item}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border-0 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <h3 className="text-lg font-bold text-black">What happens next</h3>
                <div className="mt-4 space-y-4">
                  {[
                    "We review your details before the library appears publicly.",
                    "If something is missing, you will see it in your owner dashboard instead of silently failing.",
                    "Once approved, the listing can go live quickly and your plan updates can continue from the same account.",
                  ].map((item) => (
                    <div key={item} className="flex gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-500" />
                      <p className="text-sm leading-6 text-muted-foreground">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
