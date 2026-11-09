"use client";

import { useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { emptyLibraryFormValues, libraryToFormValues, newPlanRow, type LibraryLikeRow } from "@/lib/library-form";
import { FormSection, FieldError } from "@/components/library-form/form-controls";
import { DraftBanner, ErrorSummary, LibraryFormFields } from "@/components/library-form/library-form-fields";
import { useLibraryForm, focusField } from "@/components/library-form/use-library-form";
import { OwnerPhotosInput, type OwnerPhotosState } from "@/app/for-owners/owner-photos-input";
import { submitOwnerLibrary, type OwnerSubmitResult } from "@/app/for-owners/actions";

type EditableSubmission = LibraryLikeRow & { fee_plans?: unknown; image_urls?: string[] | null };

const DRAFT_KEY = "owner-library-form:v2";

/** The owner listing form: same fields and rules as the staff editor, plus photos. */
export function OwnerLibraryForm({ submission }: { submission: EditableSubmission | null }) {
  const initial = useMemo(() => (submission ? libraryToFormValues(submission, submission.fee_plans ?? []) : { ...emptyLibraryFormValues(), plans: [newPlanRow({ key: "first-plan" })] }), [submission]);
  const form = useLibraryForm({ initial, mode: "owner", draftKey: DRAFT_KEY, useBaseline: false });
  const [photos, setPhotos] = useState<OwnerPhotosState>({ uploadState: submission?.image_urls?.length ? "ready" : "missing", existing: submission?.image_urls ?? [], uploaded: [] });
  const [photoError, setPhotoError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const photoProblem =
    photos.uploadState === "uploading"
      ? "Wait for your photos to finish uploading."
      : photos.uploadState === "failed"
        ? "Remove the failed photo and add it again."
        : photos.uploadState === "missing"
          ? "Add at least 1 photo of your library."
          : undefined;

  const submit = async () => {
    if (savingRef.current) return;
    setFormError(null);
    const fieldsOk = form.checkBeforeSubmit();
    setPhotoError(photoProblem);
    if (!fieldsOk) return;
    if (photoProblem) {
      focusField("photos");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    let result: OwnerSubmitResult;
    try {
      result = await submitOwnerLibrary(form.values, { existing: photos.existing, uploaded: photos.uploaded });
    } catch {
      result = { ok: false, error: "We couldn't reach the server. Your details are safe here, so try again." };
    }
    savingRef.current = false;
    setSaving(false);
    if (result.ok) {
      form.markSaved();
      window.location.assign("/for-owners?submitted=1#owner-submissions");
      return;
    }
    setFormError(result.error);
    if (result.fieldErrors) form.applyServerErrors(result.fieldErrors);
    if (result.photoError) {
      setPhotoError(result.photoError);
      focusField("photos");
    }
  };

  const summaryErrors = photoError && form.submitted ? { ...form.allErrors, photos: photoError } : form.allErrors;

  return (
    <form
      noValidate
      id="owner-library-form"
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <DraftBanner form={form} />
      {formError ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">{formError}</div> : null}
      <ErrorSummary errors={summaryErrors} visible={form.submitted} />
      <LibraryFormFields
        form={form}
        mode="owner"
        photos={
          <FormSection id="sec-photos" title="Photos" description="Add 1 to 3 clear photos of the study area.">
            <div data-field="photos" className="space-y-2">
              <OwnerPhotosInput
                initialImageUrls={submission?.image_urls ?? []}
                onChange={(next) => {
                  setPhotos(next);
                  if (next.uploadState === "ready") setPhotoError(undefined);
                }}
              />
              <FieldError message={photoError} />
            </div>
          </FormSection>
        }
      />
      <div className="sticky bottom-0 -mx-4 border-t border-border bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:border-0 sm:p-0">
        <button type="submit" disabled={saving} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-8 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {saving ? "Submitting" : submission ? "Resubmit for review" : "Submit for review"}
        </button>
      </div>
    </form>
  );
}
