"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import type { Json } from "@/types/supabase";
import { PlanRowsEditor } from "@/components/library-form/plan-rows-editor";
import { updateOwnerSubmissionPlans } from "@/app/for-owners/actions";
import { planDraftsToRows, validateLibraryForm, emptyLibraryFormValues, type FieldErrors, type PlanRow } from "@/lib/library-form";

function validate(rows: PlanRow[]) {
  const all = validateLibraryForm({ ...emptyLibraryFormValues(), plans: rows }, { mode: "staff" });
  const planErrors: FieldErrors = {};
  for (const [key, message] of Object.entries(all)) if (key.startsWith("plans")) planErrors[key] = message;
  return planErrors;
}

export function OwnerSubmissionPlansForm({ submissionId, displayName, feePlans }: { submissionId: string; displayName: string; feePlans: Json | null }) {
  const router = useRouter();
  const initial = useMemo(() => planDraftsToRows(feePlans), [feePlans]);
  const [rows, setRows] = useState<PlanRow[]>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<{ kind: "saved" | "error"; message: string } | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const hasAnyPlan = rows.some((row) => row.base_price.trim());

  const save = async (removeAll = false) => {
    if (savingRef.current) return;
    setStatus(null);
    const found = validate(rows);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (!hasAnyPlan && initial.length > 0 && !removeAll) {
      setConfirmEmpty(true);
      return;
    }
    setConfirmEmpty(false);
    savingRef.current = true;
    setSaving(true);
    const result = await updateOwnerSubmissionPlans(submissionId, rows, removeAll).catch(() => ({ ok: false as const, error: "We couldn't reach the server. Your plans are safe here, so try again." }));
    savingRef.current = false;
    setSaving(false);
    if (result.ok) {
      setStatus({ kind: "saved", message: "Plans saved." });
      router.refresh();
    } else {
      setStatus({ kind: "error", message: result.error });
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="font-semibold text-black">{displayName}</p>
        <p className="text-xs text-muted-foreground">Plan changes go live on your public page right away. For anything else, contact us.</p>
      </div>
      <PlanRowsEditor rows={rows} errors={errors} onChange={(next) => { setRows(next); setStatus(null); setConfirmEmpty(false); }} />
      {confirmEmpty ? (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <p>This removes every plan from your page. Students won&apos;t see any fees.</p>
          <div className="mt-2 flex gap-4 font-semibold">
            <button type="button" onClick={() => void save(true)} className="hover:underline">Remove all plans</button>
            <button type="button" onClick={() => { setConfirmEmpty(false); setRows(initial); }} className="hover:underline">Keep my plans</button>
          </div>
        </div>
      ) : null}
      {status ? (
        <p role="status" className={`flex items-center gap-1.5 text-sm ${status.kind === "saved" ? "text-emerald-700" : "text-rose-700"}`}>
          {status.kind === "saved" ? <Check className="h-4 w-4" aria-hidden /> : null}
          {status.message}
        </p>
      ) : null}
      <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-white disabled:opacity-60">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {saving ? "Saving" : "Save plans"}
      </button>
    </div>
  );
}
