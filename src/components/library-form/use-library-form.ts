"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  changedFieldKeys,
  validateLibraryForm,
  type FieldErrors,
  type LibraryFormMode,
  type LibraryFormValues,
} from "@/lib/library-form";

type Draft = { values: LibraryFormValues; savedAt: number };

function readDraft(key: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    return draft?.values && typeof draft.savedAt === "number" ? draft : null;
  } catch {
    return null;
  }
}

function removeDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Private browsing: nothing was stored.
  }
}

/** Shared behaviour of every library form: values, errors, drafts and the leave guard. */
export function useLibraryForm({
  initial,
  mode,
  draftKey,
  useBaseline,
}: {
  initial: LibraryFormValues;
  mode: LibraryFormMode;
  draftKey: string;
  /** Editing a saved library (old values aren't format-checked). */
  useBaseline: boolean;
}) {
  const [baseline, setBaseline] = useState(initial);
  const [values, setValues] = useState(initial);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [restorable, setRestorable] = useState<Draft | null>(null);
  const skipNextDraftSave = useRef(true);

  const allErrors = useMemo(
    () => ({ ...validateLibraryForm(values, { mode, baseline: useBaseline ? baseline : undefined }), ...serverErrors }),
    [baseline, mode, serverErrors, useBaseline, values],
  );
  const errors = useMemo(() => {
    if (submitted) return allErrors;
    const shown: FieldErrors = {};
    for (const [key, message] of Object.entries(allErrors)) {
      const root = key.startsWith("plans.") ? key : key;
      if (touched.has(root) || key in serverErrors) shown[key] = message;
    }
    return shown;
  }, [allErrors, serverErrors, submitted, touched]);

  const changed = useMemo(() => changedFieldKeys(values, baseline), [baseline, values]);
  const dirty = changed.length > 0;

  // Offer a saved draft once, after mount (localStorage isn't available on the server).
  useEffect(() => {
    const draft = readDraft(draftKey);
    if (draft && changedFieldKeys(draft.values, initial).length > 0) {
      setRestorable(draft);
    }
    // Only when the form opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  // Keep typing safe across refreshes and dropped connections.
  useEffect(() => {
    if (skipNextDraftSave.current) {
      skipNextDraftSave.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      try {
        if (changedFieldKeys(values, baseline).length > 0) {
          window.localStorage.setItem(draftKey, JSON.stringify({ values, savedAt: Date.now() }));
        } else {
          window.localStorage.removeItem(draftKey);
        }
      } catch {
        // Storage full or blocked: the form still works.
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [baseline, draftKey, values]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const clearServerError = useCallback((key: string) => {
    setServerErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  const set = useCallback(
    <K extends keyof LibraryFormValues>(key: K, value: LibraryFormValues[K]) => {
      setValues((current) => ({ ...current, [key]: value }));
      clearServerError(key === "opening_time" || key === "closing_time" || key === "hours_mode" ? "hours" : (key as string));
    },
    [clearServerError],
  );

  const touch = useCallback((key: string) => {
    setTouched((current) => (current.has(key) ? current : new Set(current).add(key)));
  }, []);

  const restoreDraft = useCallback(() => {
    if (restorable) setValues(restorable.values);
    setRestorable(null);
  }, [restorable]);

  const discardDraft = useCallback(() => {
    removeDraft(draftKey);
    setRestorable(null);
  }, [draftKey]);

  const reset = useCallback(() => {
    setValues(baseline);
    setTouched(new Set());
    setSubmitted(false);
    setServerErrors({});
    removeDraft(draftKey);
  }, [baseline, draftKey]);

  /** Show every error and bring the first one into view. Returns true when the form is clean. */
  const checkBeforeSubmit = useCallback(() => {
    setSubmitted(true);
    const keys = Object.keys(allErrors);
    if (keys.length === 0) return true;
    focusField(keys[0]);
    return false;
  }, [allErrors]);

  const applyServerErrors = useCallback((next: FieldErrors) => {
    setSubmitted(true);
    setServerErrors(next);
    const first = Object.keys(next)[0];
    if (first) window.setTimeout(() => focusField(first), 30);
  }, []);

  /** After a successful save the saved values become the new starting point. */
  const markSaved = useCallback(
    (next?: LibraryFormValues) => {
      removeDraft(draftKey);
      setBaseline(next ?? values);
      if (next) setValues(next);
      setServerErrors({});
      setSubmitted(false);
      setTouched(new Set());
      setRestorable(null);
    },
    [draftKey, values],
  );

  return {
    values,
    set,
    setValues,
    touch,
    errors,
    allErrors,
    changed,
    dirty,
    restorable,
    restoreDraft,
    discardDraft,
    reset,
    checkBeforeSubmit,
    applyServerErrors,
    markSaved,
    errorCount: Object.keys(allErrors).length,
    submitted,
  };
}

export type LibraryFormController = ReturnType<typeof useLibraryForm>;

export function focusField(key: string) {
  const holder = document.querySelector<HTMLElement>(`[data-field="${CSS.escape(key)}"]`);
  if (!holder) return;
  holder.scrollIntoView({ behavior: "smooth", block: "center" });
  const control = holder.matches("input,select,textarea,button") ? holder : holder.querySelector<HTMLElement>("input:not([type=hidden]),select,textarea,button");
  control?.focus({ preventScroll: true });
}
