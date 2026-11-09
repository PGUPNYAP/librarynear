"use client";

import { useState } from "react";
import type { Json } from "@/types/supabase";
import { PlansEditor } from "@/components/library-form/plans-editor";
import { FormSubmitButton } from "@/components/form-submit-button";
import { updateOwnerSubmissionPlans } from "@/app/for-owners/actions";
import { normalizePlanDrafts } from "@/lib/library-plans";

export function OwnerSubmissionPlansForm({
  submissionId,
  displayName,
  feePlans,
}: {
  submissionId: string;
  displayName: string;
  feePlans: Json | null;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-2xl border border-border/70 bg-white p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-semibold text-black">{displayName}</p>
          <p className="text-xs text-muted-foreground">
            You can edit plans here. To change any other details, please contact us.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted/50"
        >
          {open ? "Close plan editor" : "Edit plans only"}
        </button>
      </div>

      {open ? (
        <form action={updateOwnerSubmissionPlans} className="mt-4 space-y-4">
          <input type="hidden" name="submission_id" value={submissionId} />
          <PlansEditor
            initialPlans={normalizePlanDrafts(feePlans)}
            storageKey={`owner-submission-plans:${submissionId}`}
            note="Need to update address, phone, timings, or anything else? Please contact us and our team will help."
          />
          <p className="text-xs text-muted-foreground">Plan changes go live on your public page right away.</p>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" name="confirm_remove_all_plans" />
            I want to remove all plans (only needed if you deleted every plan above)
          </label>
          <FormSubmitButton className="rounded-full bg-primary px-6 text-white hover:bg-primary/90">
            Save updated plans
          </FormSubmitButton>
        </form>
      ) : null}
    </div>
  );
}
