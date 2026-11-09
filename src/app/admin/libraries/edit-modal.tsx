"use client";

import { useState } from "react";
import { Edit3, ImagePlus, Loader2, Save, Trash2, X } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Tables } from "@/types/supabase";
import { deleteLibraryBranch, updateLibraryBranch } from "./actions";
import { deleteLibraryImage } from "./image-actions";
import { AmenitiesChecklist } from "@/components/library-form/amenities-checklist";
import { FormDraftPersistence } from "@/components/library-form/form-draft-persistence";
import { MapCoordinatesFields } from "@/components/library-form/map-coordinates-fields";
import { PlansEditor } from "@/components/library-form/plans-editor";
import { normalizePlanDrafts } from "@/lib/library-plans";
import { PhoneWhatsappFields } from "@/components/library-form/phone-whatsapp-fields";

type FeePlan = Tables<"library_fee_plans">;
type LibraryImage = Tables<"library_images">;

type AdminLibraryBranch = Tables<"library_branches"> & {
  library_fee_plans?: FeePlan[];
  library_images?: LibraryImage[];
};

interface EditLibraryModalProps {
  library: AdminLibraryBranch;
  allowDelete?: boolean;
}

function parseAmenities(amenitiesText: string | null | undefined) {
  if (!amenitiesText) return [];
  return amenitiesText
    .split(/[,|\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-3xl border border-border/70 bg-white p-5 shadow-[0_8px_28px_rgba(0,0,0,0.04)]">
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-black">{title}</h3>
        {description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  required = false,
  clearName,
  children,
}: {
  label: string;
  required?: boolean;
  /** Renders a "Clear" checkbox named clear_<clearName> that removes the saved value. */
  clearName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-sm font-medium text-black">
          {label}
          {required ? <span className="text-destructive"> *</span> : null}
        </label>
        {clearName ? (
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input type="checkbox" name={`clear_${clearName}`} />
            Clear saved value
          </label>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function EditLibraryModal({ library, allowDelete = false }: EditLibraryModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [overrideNearestMetro, setOverrideNearestMetro] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [images, setImages] = useState<LibraryImage[]>(
    library.library_images ? [...library.library_images] : [],
  );

  const formId = `edit-form-${library.id}`;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length || isUploading) return;

    setIsUploading(true);
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append("file", file);
    formData.append("libraryId", library.id);

    try {
      const response = await fetch("/api/admin/library-images", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json().catch(() => null)) as
        | { success?: boolean; image?: LibraryImage; error?: string }
        | null;

      if (response.ok && result?.success && result.image) {
        setImages((current) => [...current, result.image!]);
      } else {
        alert("Upload failed: " + (result?.error || "Unknown error"));
      }
    } catch (error) {
      alert(`Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleDeleteImage = async (imageId: string) => {
    if (!confirm("Are you sure you want to delete this photo?")) return;
    const previousImages = images;
    setImages(images.filter((img) => img.id !== imageId));
    const result = await deleteLibraryImage(imageId);
    if (!result.success) {
      setImages(previousImages);
      alert(`Delete failed: ${result.error}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    const formData = new FormData(e.currentTarget);
    const result = await updateLibraryBranch(library.id, formData).catch(() => ({
      success: false as const,
      error: "Network error. Your changes were not saved.",
    }));
    setIsSaving(false);
    if (result.success) {
      window.localStorage.removeItem(`library-edit-draft:${library.id}`);
      window.localStorage.removeItem(`library-edit-map:${library.id}`);
      window.localStorage.removeItem(`library-edit-plans:${library.id}`);
      window.localStorage.removeItem(`library-edit-phone:${library.id}`);
      setIsOpen(false);
    } else {
      setSaveError(result.error);
    }
  };

  const handleDeleteLibrary = async () => {
    if (!confirm(`Delete "${library.display_name}" from public listings and editor queues?`)) return;

    setIsDeleting(true);
    const result = await deleteLibraryBranch(library.id);
    setIsDeleting(false);

    if (result.success) {
      setIsOpen(false);
      window.location.reload();
    } else {
      alert("Failed to delete: " + result.error);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex w-full items-center justify-end text-xs font-medium text-amber-600 hover:text-amber-700 hover:underline"
      >
        <Edit3 className="mr-1 h-3.5 w-3.5" />
        Edit
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-[1120px] flex-col overflow-hidden rounded-[28px] bg-slate-50 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between border-b border-border/70 bg-white px-6 py-5">
              <div>
                <h2 className="text-2xl font-bold text-black">Edit library details</h2>
                <p className="mt-1 text-sm text-muted-foreground">{library.display_name}</p>
                <p className="mt-1 text-xs text-muted-foreground">ID: {library.id}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)} className="h-9 w-9 rounded-full p-0">
                <X className="h-5 w-5 text-muted-foreground" />
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-5 md:px-6" id={formId}>
              <FormDraftPersistence formId={formId} storageKey={`library-edit-draft:${library.id}`} />

              <div className="mx-auto w-full max-w-4xl min-w-0 space-y-6">
                <p className="text-xs text-muted-foreground">
                  Empty fields keep their current value (shown in grey). Tick “Clear saved value” to remove one.
                  Overnight hours (e.g. 18:00 to 02:00) and 24-hour (00:00 to 00:00) are allowed.
                </p>
                {saveError ? (
                  <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                    {saveError}
                  </div>
                ) : null}
                <Section title="Core details">
                  <div className="grid min-w-0 gap-4">
                      <Field label="Display name" required>
                        <Input name="display_name" placeholder={library.display_name} className="min-w-0 rounded-2xl bg-white" />
                      </Field>
                      <Field label="Locality" required>
                        <Input name="locality" placeholder={library.locality || "Enter locality"} className="min-w-0 rounded-2xl bg-white" />
                      </Field>
                      <Field label="City" required>
                        <Input name="city" placeholder={library.city || "Enter city"} className="min-w-0 rounded-2xl bg-white" />
                      </Field>
                      <Field label="District" clearName="district">
                        <Input name="district" placeholder={library.district || "Enter district"} className="min-w-0 rounded-2xl bg-white" />
                      </Field>
                      <Field label="State">
                        <Input name="state" placeholder={library.state || "Enter state"} className="min-w-0 rounded-2xl bg-white" />
                      </Field>
                      <Field label="PIN code">
                        <Input name="pin_code" placeholder={library.pin_code || "Enter PIN code"} className="min-w-0 rounded-2xl bg-white" />
                      </Field>
                  </div>
                </Section>

                <Section title="Location details" description="Coordinates and nearest metro are calculated from the Google Maps link unless you explicitly override them.">
                  <div className="min-w-0 space-y-4">
                    <Field label="Full address" clearName="full_address">
                      <textarea
                        name="full_address"
                        placeholder={library.full_address || "Enter full address"}
                        rows={3}
                        className="w-full min-w-0 rounded-2xl border border-border/80 bg-white px-3 py-2 text-sm outline-none transition-colors focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/30"
                      />
                    </Field>

                    <MapCoordinatesFields
                      initialMapLink={library.map_link || ""}
                      initialLatitude={library.latitude}
                      initialLongitude={library.longitude}
                      storageKey={`library-edit-map:${library.id}`}
                      helperText="Nearest metro will be calculated automatically from your location."
                      usePlaceholdersOnly
                    />

                    <div className="min-w-0 space-y-3 rounded-2xl border border-border/70 bg-slate-50/70 p-4">
                      <label className="flex items-center gap-2 text-sm font-medium text-black">
                        <input
                          type="checkbox"
                          name="override_nearest_metro"
                          checked={overrideNearestMetro}
                          onChange={(event) => setOverrideNearestMetro(event.target.checked)}
                        />
                        Override nearest metro manually
                      </label>
                      <div className="grid min-w-0 gap-4">
                        <Field label="Nearest metro">
                          <Input
                            name="nearest_metro"
                            placeholder={library.nearest_metro || "Nearest metro"}
                            disabled={!overrideNearestMetro}
                            className="min-w-0 rounded-2xl bg-white disabled:bg-muted"
                          />
                        </Field>
                        <Field label="Metro distance (KM)">
                          <Input
                            name="nearest_metro_distance_km"
                            type="number"
                            step="0.01"
                            placeholder={library.nearest_metro_distance_km ? String(library.nearest_metro_distance_km) : "Distance in KM"}
                            disabled={!overrideNearestMetro}
                            className="min-w-0 rounded-2xl bg-white disabled:bg-muted"
                          />
                        </Field>
                      </div>
                    </div>
                  </div>
                </Section>

                <Section title="Facilities and logistics">
                  <div className="min-w-0 space-y-4">
                    <div className="grid min-w-0 gap-4">
                        <Field label="Opening time" clearName="opening_time">
                          <Input name="opening_time" type="time" placeholder={library.opening_time || "HH:MM"} className="min-w-0 rounded-2xl bg-white" />
                        </Field>
                        <Field label="Closing time" clearName="closing_time">
                          <Input name="closing_time" type="time" placeholder={library.closing_time || "HH:MM"} className="min-w-0 rounded-2xl bg-white" />
                        </Field>
                    </div>

                    <div className="grid min-w-0 gap-4">
                      <PhoneWhatsappFields
                        initialPhone={library.phone_number || ""}
                        initialWhatsapp={library.whatsapp_number || ""}
                        storageKey={`library-edit-phone:${library.id}`}
                        usePlaceholdersOnly
                        phoneRequired={false}
                      />
                      <label className="flex items-center gap-1 text-xs text-muted-foreground">
                        <input type="checkbox" name="clear_whatsapp_number" />
                        Clear saved WhatsApp number
                      </label>
                    </div>

                    <div className="grid min-w-0 gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <label className="block text-sm font-medium text-black">Amenities</label>
                        <label className="flex items-center gap-1 text-xs text-muted-foreground">
                          <input type="checkbox" name="clear_amenities" />
                          Clear all
                        </label>
                      </div>
                      <AmenitiesChecklist initialSelected={parseAmenities(library.amenities_text)} />
                    </div>
                  </div>
                </Section>

                <Section title="About and seats">
                  <div className="grid min-w-0 gap-4">
                    <Field label="Description" clearName="description">
                      <textarea
                        name="description"
                        placeholder={library.description || "Tell students about this library"}
                        rows={4}
                        className="w-full min-w-0 rounded-2xl border border-border/80 bg-white px-3 py-2 text-sm outline-none transition-colors focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/30"
                      />
                    </Field>
                    <Field label="Seats" clearName="total_seats">
                      <Input name="total_seats" type="number" min="1" placeholder={library.total_seats ? String(library.total_seats) : "Enter seats"} className="min-w-0 rounded-2xl bg-white" />
                    </Field>
                  </div>
                </Section>

                <Section title="Plans" description="Use the same plan editor owners see. Hours, discounts, and seat types will show on the public page.">
                  <PlansEditor
                    initialPlans={normalizePlanDrafts(library.library_fee_plans || [])}
                    storageKey={`library-edit-plans:${library.id}`}
                    note="Add as many plans as you need. The Add Plan button is below the list for faster repeated entry."
                  />
                </Section>

                <Section title="Photos" description="Uploading through this panel keeps the editor open, and placing it below the form makes bulk edits easier before you manage images.">
                  <div className="min-w-0 space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-muted-foreground">{images.length} photo{images.length === 1 ? "" : "s"}</p>
                      <div>
                        <input
                          type="file"
                          id={`photo-upload-${library.id}`}
                          className="hidden"
                          accept="image/*"
                          onChange={handleImageUpload}
                          disabled={isUploading}
                        />
                        <label
                          htmlFor={`photo-upload-${library.id}`}
                          className={`inline-flex h-9 cursor-pointer items-center justify-center rounded-full border border-input bg-white px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground ${isUploading ? "pointer-events-none opacity-50" : ""}`}
                        >
                          {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
                          {isUploading ? "Uploading..." : "Add photo"}
                        </label>
                      </div>
                    </div>

                    <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                      {images.map((img) => (
                        <div key={img.id} className="group relative aspect-square overflow-hidden rounded-2xl border border-border bg-muted">
                          <Image
                            src={`${img.imagekit_url}?tr=w-300,h-300,fo-auto`}
                            alt="Library photo"
                            fill
                            className="object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => void handleDeleteImage(img.id)}
                            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-black shadow-sm transition-colors hover:bg-white"
                            aria-label="Delete photo"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      {images.length === 0 ? (
                        <div className="col-span-full rounded-2xl border-2 border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                          No photos added yet.
                        </div>
                      ) : null}
                    </div>
                  </div>
                </Section>

                {allowDelete ? (
                  <Section title="Danger zone" description="This keeps the delete action accessible without burying it inside the form.">
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => void handleDeleteLibrary()}
                      disabled={isDeleting || isSaving}
                      className="w-full sm:w-auto font-semibold"
                    >
                      {isDeleting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        <>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Library
                        </>
                      )}
                    </Button>
                  </Section>
                ) : null}
              </div>
            </form>

            <div className="flex items-center justify-between gap-3 border-t border-border/70 bg-white px-6 py-4">
              <p className="text-xs text-muted-foreground">
                Changes here update the live library data after save.
              </p>
              <div className="flex items-center justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" form={formId} disabled={isSaving || isDeleting || isUploading} className="min-w-36 font-semibold">
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
