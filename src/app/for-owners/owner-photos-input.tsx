"use client";

import { ImagePlus, Loader2, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

const MAX_PHOTOS = 3;
const MAX_PHOTO_MB = 5;
const MAX_PHOTO_BYTES = MAX_PHOTO_MB * 1024 * 1024;

type PhotoStatus = "existing" | "uploading" | "uploaded" | "failed";

type PhotoItem = {
  id: string;
  name: string;
  size: number;
  url: string;
  status: PhotoStatus;
  existing: boolean;
  fileId?: string;
  error?: string | null;
  previewObjectUrl?: string | null;
};

function createClientPhotoId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getPhotoStatusLabel(photo: PhotoItem) {
  switch (photo.status) {
    case "uploading":
      return "Uploading...";
    case "uploaded":
      return "Uploaded";
    case "failed":
      return photo.error || "Upload Failed";
    default:
      return "Already uploaded";
  }
}

function getUploadState(photos: PhotoItem[]) {
  if (photos.length === 0) return "missing";
  if (photos.some((photo) => photo.status === "uploading")) return "uploading";
  if (photos.some((photo) => photo.status === "failed")) return "failed";
  if (photos.every((photo) => photo.status === "uploaded" || photo.status === "existing")) return "ready";
  return "missing";
}

export type OwnerPhotosState = {
  uploadState: "missing" | "uploading" | "failed" | "ready";
  existing: string[];
  uploaded: Array<{ url: string; fileId: string }>;
};

export function OwnerPhotosInput({
  initialImageUrls = [],
  onChange,
}: {
  initialImageUrls?: string[];
  onChange: (state: OwnerPhotosState) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const [photos, setPhotos] = useState<PhotoItem[]>(
    initialImageUrls.map((url, index) => ({
      id: `existing-${index}-${url}`,
      name: `Existing photo ${index + 1}`,
      size: 0,
      url,
      status: "existing",
      existing: true,
      previewObjectUrl: null,
      error: null,
    })),
  );
  const [error, setError] = useState<string | null>(null);

  const uploadState = useMemo(() => getUploadState(photos), [photos]);

  useEffect(() => {
    const objectUrls = objectUrlsRef.current;
    return () => {
      for (const objectUrl of objectUrls) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, []);

  useEffect(() => {
    onChange({
      uploadState,
      existing: photos.filter((photo) => photo.status === "existing").map((photo) => photo.url),
      uploaded: photos.filter((photo) => photo.status === "uploaded" && photo.fileId).map((photo) => ({ url: photo.url, fileId: photo.fileId! })),
    });
    // onChange is a fresh closure on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos, uploadState]);

  async function uploadPhoto(file: File, photoId: string, previewUrl: string) {
    const uploadFormData = new FormData();
    uploadFormData.append("file", file);

    try {
      const response = await fetch("/api/owner-submission-images", {
        method: "POST",
        body: uploadFormData,
      });
      const payload = (await response.json().catch(() => null)) as
        | { url?: string; fileId?: string; error?: string }
        | null;

      if (!response.ok || !payload?.url || !payload?.fileId) {
        throw new Error(payload?.error || "Upload Failed");
      }

      setPhotos((current) =>
        current.map((photo) =>
          photo.id === photoId
            ? (() => {
                if (photo.previewObjectUrl) {
                  URL.revokeObjectURL(photo.previewObjectUrl);
                  objectUrlsRef.current.delete(photo.previewObjectUrl);
                }
                return {
                  ...photo,
                  url: payload.url!,
                  fileId: payload.fileId!,
                  status: "uploaded" as const,
                  error: null,
                  previewObjectUrl: null,
                };
              })()
            : photo,
        ),
      );
    } catch (uploadError) {
      setPhotos((current) =>
        current.map((photo) =>
          photo.id === photoId
            ? {
                ...photo,
                status: "failed",
                error:
                  uploadError instanceof Error && uploadError.message
                    ? uploadError.message
                    : "Upload Failed",
                url: previewUrl,
              }
            : photo,
        ),
      );
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const incomingFiles = Array.from(event.target.files ?? []);
    if (inputRef.current) {
      inputRef.current.value = "";
    }

    setError(null);

    const currentCount = photos.length;
    if (currentCount >= MAX_PHOTOS) {
      setError(`You can upload up to ${MAX_PHOTOS} photos.`);
      return;
    }

    const availableSlots = MAX_PHOTOS - currentCount;
    const acceptedFiles: File[] = [];

    for (const file of incomingFiles) {
      if (!file.type.startsWith("image/")) {
        setError("Only image files are allowed.");
        continue;
      }

      if (file.size > MAX_PHOTO_BYTES) {
        setError(`Each photo must be under ${MAX_PHOTO_MB} MB.`);
        continue;
      }

      const duplicate = photos.some(
        (photo) =>
          !photo.existing &&
          photo.name === file.name &&
          photo.size === file.size,
      );
      if (duplicate) {
        continue;
      }

      acceptedFiles.push(file);
    }

    const filesToQueue = acceptedFiles.slice(0, availableSlots);
    if (acceptedFiles.length > availableSlots) {
      setError(`You can upload up to ${MAX_PHOTOS} photos.`);
    }

    const newPhotos = filesToQueue.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(previewUrl);
      return {
        id: createClientPhotoId(file),
        name: file.name,
        size: file.size,
        url: previewUrl,
        status: "uploading" as const,
        existing: false,
        previewObjectUrl: previewUrl,
        error: null,
      };
    });

    if (newPhotos.length === 0) {
      return;
    }

    setPhotos((current) => [...current, ...newPhotos]);
    for (let index = 0; index < filesToQueue.length; index += 1) {
      void uploadPhoto(filesToQueue[index], newPhotos[index].id, newPhotos[index].url);
    }
  }

  async function removePhoto(photo: PhotoItem) {
    if (!photo.existing && photo.fileId && photo.status === "uploaded") {
      try {
        await fetch("/api/owner-submission-images", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ fileId: photo.fileId }),
        });
      } catch (deleteError) {
        console.error("Failed to delete uploaded owner photo:", deleteError);
      }
    }

    if (photo.previewObjectUrl) {
      URL.revokeObjectURL(photo.previewObjectUrl);
      objectUrlsRef.current.delete(photo.previewObjectUrl);
    }

    setPhotos((current) => current.filter((item) => item.id !== photo.id));
    setError(null);
  }

  async function clearPhotos() {
    for (const photo of photos) {
      if (!photo.existing && photo.fileId && photo.status === "uploaded") {
        try {
          await fetch("/api/owner-submission-images", {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ fileId: photo.fileId }),
          });
        } catch (deleteError) {
          console.error("Failed to delete uploaded owner photo:", deleteError);
        }
      }

      if (photo.previewObjectUrl) {
        URL.revokeObjectURL(photo.previewObjectUrl);
        objectUrlsRef.current.delete(photo.previewObjectUrl);
      }
    }

    setPhotos([]);
    setError(null);
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        id="photos"
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={handleFileChange}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={photos.length >= MAX_PHOTOS}
        className="flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-primary/30 bg-primary/3 px-4 py-8 text-center transition-colors hover:border-primary/50 hover:bg-primary/6 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-primary shadow-sm">
          <UploadCloud className="h-5 w-5" />
        </span>
        <span className="text-sm font-semibold text-black">Choose library photos</span>
        <span className="mt-1 text-xs text-muted-foreground">
          Upload up to {MAX_PHOTOS} images, {MAX_PHOTO_MB} MB each
        </span>
      </button>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      ) : null}

      {uploadState === "uploading" ? (
        <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
          Please wait for all photos to finish uploading before submitting.
        </p>
      ) : null}

      {uploadState === "failed" ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          Remove failed uploads and upload them again before submitting.
        </p>
      ) : null}

      {photos.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              {photos.length} photo{photos.length === 1 ? "" : "s"} selected
            </p>
            <button
              type="button"
              onClick={() => void clearPhotos()}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Clear all
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {photos.map((photo) => (
              <div key={photo.id} className="group overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
                <div className="relative aspect-square bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt={photo.name} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => void removePhoto(photo)}
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-black shadow-sm backdrop-blur transition-colors hover:bg-white"
                    aria-label={`Remove ${photo.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-1 px-3 py-2">
                  <div className="flex items-center gap-2">
                    {photo.status === "uploading" ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-sky-600" />
                    ) : (
                      <ImagePlus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-black">{photo.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {photo.existing ? "Already uploaded" : formatFileSize(photo.size)}
                      </p>
                    </div>
                  </div>
                  <p
                    className={`text-[11px] font-medium ${
                      photo.status === "uploaded" || photo.status === "existing"
                        ? "text-emerald-700"
                        : photo.status === "failed"
                          ? "text-rose-700"
                          : "text-sky-700"
                    }`}
                  >
                    {getPhotoStatusLabel(photo)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
