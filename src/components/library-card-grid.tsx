import Image from "next/image";
import { BookOpen } from "lucide-react";
import { DeferredSaveButton } from "@/components/deferred-save-button";
import { IntentLink } from "@/components/intent-link";
import { citySlug } from "@/lib/places";
import type { LibraryCardData } from "@/lib/library-card-data";

export type GridLibrary = LibraryCardData & { coverImageUrl?: string | null; distance_km?: number | null };

export function LibraryCardGrid({
  libraries,
  altSuffix,
  headingLevel = "h2",
  priorityCount = 4,
}: {
  libraries: GridLibrary[];
  altSuffix?: string;
  headingLevel?: "h2" | "h3";
  priorityCount?: number;
}) {
  const Heading = headingLevel;
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 gap-y-10">
      {libraries.map((lib, index) => (
        <li key={lib.id}>
          <IntentLink
            href={`/${citySlug(lib.city)}/library/${lib.slug}`}
            className="group flex flex-col gap-2 cursor-pointer"
          >
            <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-muted">
              {lib.coverImageUrl ? (
                <Image
                  src={lib.coverImageUrl}
                  alt={`${lib.display_name} — study library in ${lib.locality || lib.city}${altSuffix ? `, ${altSuffix}` : ""}`}
                  fill
                  priority={index < priorityCount}
                  sizes="(max-width: 768px) 100vw, (max-width: 1280px) 33vw, 20vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
                  <BookOpen className="mb-2 h-10 w-10 text-primary/20" />
                  <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50">Library</span>
                </div>
              )}
              <DeferredSaveButton libraryId={lib.id} />
              {lib.verification_status === "verified" && (
                <div className="absolute left-3 top-3 rounded-md border border-black/5 bg-white/95 px-2 py-0.5 text-xs font-bold shadow-sm">
                  Verified
                </div>
              )}
            </div>
            <div className="flex flex-col gap-0.5">
              <Heading className="truncate text-[14px] font-semibold leading-snug text-black">{lib.display_name}</Heading>
              {lib.locality ? <p className="truncate text-[13px] text-muted-foreground">{lib.locality}</p> : null}
              {lib.nearest_metro ? (
                <p className="truncate text-[13px] text-muted-foreground">
                  {lib.nearest_metro_distance_km
                    ? `${lib.nearest_metro_distance_km} km from ${lib.nearest_metro} metro`
                    : `Near ${lib.nearest_metro}`}
                </p>
              ) : null}
              {lib.aggregate_rating && lib.review_count ? (
                <p className="text-[13px] font-medium text-black">
                  ★ {lib.aggregate_rating.toFixed(1)} <span className="font-normal text-muted-foreground">({lib.review_count})</span>
                </p>
              ) : null}
            </div>
          </IntentLink>
        </li>
      ))}
    </ul>
  );
}
