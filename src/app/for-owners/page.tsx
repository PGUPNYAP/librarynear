import { CheckCircle2, Clock3, LockKeyhole, MapPin, ShieldCheck } from "lucide-react";
import { GoogleLoginButton } from "@/components/auth/google-login-button";
import { IntentLink } from "@/components/intent-link";
import { Input } from "@/components/ui/input";
import { submitOwnerLibrary } from "@/app/for-owners/actions";
import { OwnerPhotosInput } from "@/app/for-owners/owner-photos-input";
import { getCurrentViewer, upsertProfileFromUser } from "@/lib/auth/profile";
import { supabaseServer } from "@/lib/supabase-server";
import { logPerf, measureAsync } from "@/lib/perf";
import { PlansEditor } from "@/components/library-form/plans-editor";
import { AmenitiesChecklist } from "@/components/library-form/amenities-checklist";
import { MapCoordinatesFields } from "@/components/library-form/map-coordinates-fields";
import { FormDraftPersistence } from "@/components/library-form/form-draft-persistence";
import { OwnerSubmissionPlansForm } from "./owner-submission-plans-form";
import type { Json } from "@/types/supabase";
import { PhoneWhatsappFields } from "@/components/library-form/phone-whatsapp-fields";
import type { LibraryPlanDraft } from "@/lib/library-plans";
import { OwnerSubmissionSubmitButton } from "./owner-submission-submit-button";

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

function parseAmenities(value: string | null) {
  return String(value ?? "")
    .split(/[,|\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

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

function errorMessage(error?: string) {
  switch (error) {
    case "duplicate_submission":
      return "You already have one library submission with this account. You can now edit only your plans below.";
    case "image_upload_failed":
      return "We could not upload one of the photos right now. Please try again.";
    case "too_many_images":
      return "Please upload up to 3 photos only.";
    case "too_few_images":
      return "Please upload at least 1 photo to continue.";
    case "invalid_image":
      return "Please upload JPG, PNG, WebP or HEIC photos only, up to 5 MB each.";
    case "invalid_phone":
      return "Please enter a valid Indian phone number. WhatsApp must be a mobile number.";
    case "invalid_map_link":
      return "Please add a valid Google Maps link.";
    case "unresolvable_map_link":
      return "We could not extract coordinates from that Google Maps link after resolving it. Please use the full share link or enter latitude and longitude manually.";
    case "invalid_coordinates":
      return "Please provide a valid latitude and longitude. We can auto-fill them from the Google Maps link when possible.";
    case "invalid_pin_code":
      return "Please enter a valid 6-digit PIN code.";
    case "invalid_timings":
      return "Please enter valid opening and closing times. Overnight hours (e.g. 6 PM to 2 AM) are fine; tick “Open 24 hours” for 24-hour libraries.";
    case "invalid_plan_description":
      return "Each plan description can have up to 30 words only.";
    case "missing_required_fields":
      return "Please fill all compulsory fields marked with * and try again.";
    default:
      return "We could not submit your listing just yet. Please review the required fields and try again.";
  }
}

export default async function ForOwnersPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string; error?: string; plans_updated?: string; plans_error?: string }>;
}) {
  const { submitted, error, plans_updated, plans_error } = await searchParams;
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
  const placeholderOnlyEditMode = Boolean(editableSubmission);

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

      <section className="container mx-auto px-6 py-12 md:px-10">
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
              {error ? (
                <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {errorMessage(error)}
                </div>
              ) : null}
              {plans_updated === "1" ? (
                <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  Your plans were updated successfully.
                </div>
              ) : null}
              {plans_error === "1" ? (
                <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  We could not update those plans right now. Please try again.
                </div>
              ) : null}
              {plans_error === "empty" ? (
                <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  No plans were saved, so we kept your current plans. To remove every plan, tick “I want to remove all plans” and save again.
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
              className="rounded-3xl border-0 bg-white p-6 shadow-md md:p-8"
            >
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-black">Guided owner onboarding</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {editableSubmission
                    ? "Review the notes, update your details, and resubmit. Fields marked with "
                    : "Fill your first library submission carefully. Fields marked with "}
                  <span className="font-semibold text-black">*</span>
                  {" are compulsory."}
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

              {error && (
                <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {errorMessage(error)}
                </div>
              )}

              <form action={submitOwnerLibrary} className="grid gap-5" id="owner-library-form">
                <FormDraftPersistence
                  formId="owner-library-form"
                  storageKey="owner-library-form-draft"
                  clearOnMount={submitted === "1"}
                />
                <div className="border-b border-border pb-2">
                  <h3 className="text-sm font-semibold text-black">Core Details</h3>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="display_name" className="text-sm font-medium text-black">Display name <span className="text-destructive">*</span></label>
                    <Input id="display_name" name="display_name" placeholder={editableSubmission?.display_name ?? "Example Library, Rajendra Nagar"} className="rounded-2xl border-border/80 bg-slate-50/50 shadow-sm focus-visible:ring-primary/30" required={!placeholderOnlyEditMode} />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="locality" className="text-sm font-medium text-black">Locality <span className="text-destructive">*</span></label>
                    <Input id="locality" name="locality" placeholder={editableSubmission?.locality ?? "Mukherjee Nagar"} className="rounded-2xl border-border/80 bg-slate-50/50 shadow-sm focus-visible:ring-primary/30" required={!placeholderOnlyEditMode} />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="city" className="text-sm font-medium text-black">City <span className="text-destructive">*</span></label>
                    <Input id="city" name="city" placeholder={editableSubmission?.city ?? "Delhi"} className="rounded-2xl border-border/80 bg-slate-50/50 shadow-sm focus-visible:ring-primary/30" required={!placeholderOnlyEditMode} />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="district" className="text-sm font-medium text-black">District</label>
                    <Input id="district" name="district" placeholder={editableSubmission?.district ?? "District"} className="rounded-2xl border-border/80 bg-slate-50/50 shadow-sm focus-visible:ring-primary/30" />
                    {placeholderOnlyEditMode && editableSubmission?.district ? (
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input type="checkbox" name="clear_district" /> Remove saved district
                      </label>
                    ) : null}
                  </div>
                </div>

                <div className="border-b border-border pb-2 pt-2">
                  <h3 className="text-sm font-semibold text-black">Location Details</h3>
                </div>
                <div className="space-y-2">
                  <label htmlFor="full_address" className="text-sm font-medium text-black">Full address <span className="text-destructive">*</span></label>
                  <textarea
                    id="full_address"
                    name="full_address"
                    rows={3}
                    placeholder={editableSubmission?.full_address ?? "House number, street, landmark, locality"}
                    className="w-full rounded-2xl border border-border/80 bg-slate-50/50 px-3 py-2 text-sm outline-none transition-colors shadow-sm focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/30"
                    required={!placeholderOnlyEditMode}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="state" className="text-sm font-medium text-black">State <span className="text-destructive">*</span></label>
                     <Input id="state" name="state" placeholder={editableSubmission?.state ?? "Delhi"} className="rounded-2xl border-border/80 bg-slate-50/50 shadow-sm focus-visible:ring-primary/30" required={!placeholderOnlyEditMode} />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="pin_code" className="text-sm font-medium text-black">PIN code <span className="text-destructive">*</span></label>
                     <Input id="pin_code" name="pin_code" placeholder={editableSubmission?.pin_code ?? "110001"} className="rounded-2xl border-border/80 bg-slate-50/50 shadow-sm focus-visible:ring-primary/30" required={!placeholderOnlyEditMode} />
                  </div>
                </div>

                <MapCoordinatesFields
                  storageKey="owner-library-map-fields"
                  initialMapLink={editableSubmission?.map_link ?? ""}
                  initialLatitude={editableSubmission?.latitude ?? null}
                  initialLongitude={editableSubmission?.longitude ?? null}
                  mapLinkRequired={!placeholderOnlyEditMode}
                  coordinatesRequired={!placeholderOnlyEditMode}
                  clearOnMount={submitted === "1"}
                  helperText="Nearest metro will be calculated automatically from your location."
                  usePlaceholdersOnly={placeholderOnlyEditMode}
                />

                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                  Nearest metro will be calculated automatically from your location.
                </div>

                <div className="border-b border-border pb-2 pt-2">
                  <h3 className="text-sm font-semibold text-black">Facilities & Logistics</h3>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="opening_time" className="text-sm font-medium text-black">Opening time <span className="text-destructive">*</span></label>
                     <Input id="opening_time" name="opening_time" type="time" placeholder={editableSubmission?.opening_time ?? "HH:MM"} className="rounded-2xl border-border/80 bg-slate-50/50 shadow-sm focus-visible:ring-primary/30" required={!placeholderOnlyEditMode} />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="closing_time" className="text-sm font-medium text-black">Closing time <span className="text-destructive">*</span></label>
                     <Input id="closing_time" name="closing_time" type="time" placeholder={editableSubmission?.closing_time ?? "HH:MM"} className="rounded-2xl border-border/80 bg-slate-50/50 shadow-sm focus-visible:ring-primary/30" required={!placeholderOnlyEditMode} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                  <label className="flex items-center gap-2 font-medium text-black">
                    <input type="checkbox" name="open_24h" />
                    Open 24 hours
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Open past midnight? Enter the closing time as it is (e.g. 6:00 PM to 2:00 AM).
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <PhoneWhatsappFields
                    initialPhone={editableSubmission?.phone_number ?? ""}
                    initialWhatsapp={editableSubmission?.whatsapp_number ?? ""}
                    storageKey="owner-library-phone-fields"
                    clearOnMount={submitted === "1"}
                    usePlaceholdersOnly={placeholderOnlyEditMode}
                    phoneRequired={!placeholderOnlyEditMode}
                  />
                </div>
                {placeholderOnlyEditMode ? (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" name="clear_whatsapp_number" /> Remove the saved WhatsApp number
                  </label>
                ) : null}

                <div className="space-y-2">
                  <label htmlFor="amenities" className="text-sm font-medium text-black">Amenities <span className="text-destructive">*</span></label>
                  <AmenitiesChecklist initialSelected={parseAmenities(editableSubmission?.amenities_text ?? null)} />
                </div>

                <div className="border-b border-border pb-2 pt-2">
                  <h3 className="text-sm font-semibold text-black">About & Seats</h3>
                </div>
                <div className="space-y-2">
                  <label htmlFor="description" className="text-sm font-medium text-black">Description of library</label>
                  <textarea
                    id="description"
                    name="description"
                    rows={4}
                    placeholder={editableSubmission?.description ?? "Tell students what makes your library a great place to study."}
                    maxLength={2000}
                    className="w-full rounded-2xl border border-border/80 bg-slate-50/50 px-3 py-2 text-sm outline-none transition-colors shadow-sm focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/30"
                  />
                  {placeholderOnlyEditMode ? (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input type="checkbox" name="clear_description" /> Remove the saved description
                    </label>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <label htmlFor="total_seats" className="text-sm font-medium text-black">Seats available <span className="text-destructive">*</span></label>
                  <Input id="total_seats" name="total_seats" type="number" min="1" placeholder={editableSubmission?.total_seats ? String(editableSubmission.total_seats) : "Seats available"} className="rounded-2xl border-border/80 bg-slate-50/50 shadow-sm focus-visible:ring-primary/30" required={!placeholderOnlyEditMode} />
                </div>

                <PlansEditor
                  initialPlans={(Array.isArray(editableSubmission?.fee_plans) ? editableSubmission?.fee_plans : []) as Partial<LibraryPlanDraft>[]}
                  storageKey="owner-library-plan-draft"
                  title="Plans"
                  note="Plans are optional. Use Regular or Offer, add discount percentages, and we will calculate the clean discounted price automatically."
                  clearOnMount={submitted === "1"}
                />

                <OwnerPhotosInput initialImageUrls={editableSubmission?.image_urls ?? []} />

                <OwnerSubmissionSubmitButton formId="owner-library-form" className="mt-4 h-12 w-full rounded-full bg-[#0F74C5] px-8 text-sm font-semibold shadow-md hover:bg-[#0F74C5]/90 md:w-auto">
                  {editableSubmission ? "Resubmit for review" : "Submit for review"}
                </OwnerSubmissionSubmitButton>
              </form>
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
