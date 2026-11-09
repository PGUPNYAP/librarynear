"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Edit3, ImagePlus, Loader2, Trash2, X } from "lucide-react";
import Image from "next/image";
import type { Tables } from "@/types/supabase";
import { deleteLibraryBranch, updateLibraryBranch, type UpdateLibraryResult } from "./actions";
import { deleteLibraryImage } from "./image-actions";
import { FIELD_LABELS, libraryToFormValues } from "@/lib/library-form";
import { FieldError, FormSection } from "@/components/library-form/form-controls";
import { DraftBanner, ErrorSummary, LibraryFormFields } from "@/components/library-form/library-form-fields";
import { useLibraryForm } from "@/components/library-form/use-library-form";

type FeePlan = Tables<"library_fee_plans">;
type LibraryImage = Tables<"library_images">;

type AdminLibraryBranch = Tables<"library_branches"> & {
  library_fee_plans?: FeePlan[];
  library_images?: LibraryImage[];
};

const MAX_PHOTO_MB = 10;

function Photos({ libraryId, initial, disabled }: { libraryId: string; initial: LibraryImage[]; disabled: boolean }) {
  const [images, setImages] = useState(initial);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const upload = async (files: File[]) => {
    setError(null);
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        setError(`${file.name} isn't an image.`);
        continue;
      }
      if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
        setError(`${file.name} is over ${MAX_PHOTO_MB} MB.`);
        continue;
      }
      setUploading((count) => count + 1);
      const body = new FormData();
      body.append("file", file);
      body.append("libraryId", libraryId);
      try {
        const response = await fetch("/api/admin/library-images", { method: "POST", body });
        const result = (await response.json().catch(() => null)) as { success?: boolean; image?: LibraryImage; error?: string } | null;
        if (response.ok && result?.success && result.image) setImages((current) => [...current, result.image!]);
        else setError(result?.error || `${file.name} couldn't be uploaded. Try again.`);
      } catch {
        setError(`${file.name} couldn't be uploaded. Check your connection and try again.`);
      } finally {
        setUploading((count) => count - 1);
      }
    }
  };

  const remove = async (id: string) => {
    setConfirmDelete(null);
    setError(null);
    const previous = images;
    setImages((current) => current.filter((image) => image.id !== id));
    const result = await deleteLibraryImage(id).catch(() => ({ success: false as const, error: "Check your connection and try again." }));
    if (!result.success) {
      setImages(previous);
      setError(`Photo wasn't removed. ${result.error ?? ""}`.trim());
    }
  };

  return (
    <FormSection id="sec-photos" title="Photos" description="Photos save as soon as you add or remove them.">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {images.map((image) => (
          <div key={image.id} className="relative aspect-square overflow-hidden rounded-xl bg-muted">
            <Image src={`${image.imagekit_url}?tr=w-300,h-300,fo-auto`} alt="Library photo" fill sizes="160px" className="object-cover" />
            {confirmDelete === image.id ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/70">
                <button type="button" onClick={() => void remove(image.id)} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-rose-700">Remove</button>
                <button type="button" onClick={() => setConfirmDelete(null)} className="text-xs text-white">Keep</button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(image.id)} aria-label="Remove photo" className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-black shadow-sm">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        <label className={`flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-xs text-muted-foreground hover:border-black hover:text-black ${disabled ? "pointer-events-none opacity-50" : ""}`}>
          {uploading > 0 ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          {uploading > 0 ? `Uploading ${uploading}` : "Add photos"}
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              void upload(files);
            }}
          />
        </label>
      </div>
      <FieldError message={error ?? undefined} />
    </FormSection>
  );
}

function EditorSheet({ library, allowDelete, onClose }: { library: AdminLibraryBranch; allowDelete: boolean; onClose: () => void }) {
  const router = useRouter();
  const activePlans = useMemo(() => (library.library_fee_plans ?? []).filter((plan) => plan.is_active !== false), [library.library_fee_plans]);
  const initial = useMemo(() => libraryToFormValues(library, activePlans.map((plan) => ({ ...plan, base_price: plan.base_price ?? plan.price }))), [activePlans, library]);
  const form = useLibraryForm({ initial, mode: "staff", draftKey: `library-editor:${library.id}`, useBaseline: true });
  const [version, setVersion] = useState(library.updated_at);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const savingRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const requestClose = useCallback(() => {
    if (savingRef.current) return;
    if (form.dirty) setConfirmingClose(true);
    else onClose();
  }, [form.dirty, onClose]);

  const save = useCallback(
    async (force = false) => {
      if (savingRef.current) return;
      setFormError(null);
      if (!form.checkBeforeSubmit()) return;
      if (!form.dirty) {
        setFormError(null);
      }
      savingRef.current = true;
      setSaving(true);
      let result: UpdateLibraryResult;
      try {
        result = await updateLibraryBranch(library.id, form.values, { expectedUpdatedAt: force ? null : version });
      } catch {
        result = { success: false, error: "We couldn't reach the server. Your changes are safe here, so try again." };
      }
      savingRef.current = false;
      setSaving(false);
      if (result.success) {
        form.markSaved();
        setVersion(result.updatedAt);
        router.refresh();
        onClose();
        return;
      }
      if (result.conflict) {
        setConflict(result.error);
        return;
      }
      setFormError(result.error);
      if (result.fieldErrors) form.applyServerErrors(result.fieldErrors);
    },
    [form, library.id, onClose, router, version],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [requestClose, save]);

  const remove = async () => {
    setDeleting(true);
    setFormError(null);
    const result = await deleteLibraryBranch(library.id).catch(() => ({ success: false as const, error: "Check your connection and try again." }));
    setDeleting(false);
    if (result.success) {
      form.discardDraft();
      router.refresh();
      onClose();
    } else {
      setConfirmingDelete(false);
      setFormError(`Couldn't remove this library. ${result.error ?? ""}`.trim());
    }
  };

  const changeSummary = form.changed.slice(0, 3).map((key) => FIELD_LABELS[key] ?? key).join(", ") + (form.changed.length > 3 ? ` and ${form.changed.length - 3} more` : "");

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 sm:items-center sm:p-4" onMouseDown={(event) => event.target === event.currentTarget && requestClose()}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Edit ${library.display_name}`} className="flex w-full flex-col bg-white outline-none sm:max-h-[94vh] sm:max-w-2xl sm:rounded-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-black">{library.display_name}</h2>
            <p className="truncate text-xs text-muted-foreground">{[library.locality, library.city].filter(Boolean).join(", ")}</p>
          </div>
          <button type="button" onClick={requestClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-muted">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </header>

        <form
          noValidate
          className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="space-y-4">
            <DraftBanner form={form} />
            {conflict ? (
              <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                <p>{conflict}</p>
                <div className="mt-2 flex gap-4 font-semibold">
                  <button type="button" onClick={() => { setConflict(null); void save(true); }} className="hover:underline">Save mine anyway</button>
                  <button type="button" onClick={() => { form.discardDraft(); router.refresh(); onClose(); }} className="hover:underline">Discard mine and reload</button>
                </div>
              </div>
            ) : null}
            {formError ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">{formError}</div> : null}
            <ErrorSummary errors={form.allErrors} visible={form.submitted} />
            <LibraryFormFields
              form={form}
              mode="staff"
              showMetroOverride
              originalLocality={library.locality ?? undefined}
              photos={<Photos libraryId={library.id} initial={library.library_images ?? []} disabled={saving} />}
            />
            {allowDelete ? (
              <div className="border-t border-border pt-5">
                {confirmingDelete ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                    <p className="text-sm text-rose-900">Remove this library from public listings and work queues?</p>
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => void remove()} disabled={deleting} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60">
                        {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Yes, remove it
                      </button>
                      <button type="button" onClick={() => setConfirmingDelete(false)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-black hover:bg-white">Keep it</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmingDelete(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-rose-700 hover:underline">
                    <Trash2 className="h-4 w-4" /> Remove this library
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </form>

        <footer className="border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          {confirmingClose ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-black">Close without saving? We&apos;ll keep a draft on this device.</p>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-black">Close</button>
                <button type="button" onClick={() => setConfirmingClose(false)} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white">Keep editing</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-xs text-muted-foreground" aria-live="polite">
                {form.dirty ? `Changed: ${changeSummary}` : "Saving with no changes marks this library as reviewed."}
              </p>
              <button type="button" onClick={() => void save()} disabled={saving || deleting} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-white disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {saving ? "Saving" : "Save"}
              </button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}

export function EditLibraryModal({ library, allowDelete = false }: { library: AdminLibraryBranch; allowDelete?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center justify-end text-xs font-medium text-primary hover:underline">
        <Edit3 className="mr-1 h-3.5 w-3.5" />
        Edit
      </button>
      {open ? <EditorSheet key={library.updated_at ?? library.id} library={library} allowDelete={allowDelete} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
