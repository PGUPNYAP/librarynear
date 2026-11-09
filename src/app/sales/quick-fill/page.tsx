import Link from "next/link";
import { requireApprovedStaff, getAssignedLocalityIds } from "@/lib/staff-access";
import { supabaseServer } from "@/lib/supabase-server";
import { FILTERABLE_AMENITIES } from "@/lib/amenities";
import { parseAmenitiesText } from "@/lib/library-filters";
import { formatIndianPhone, toTelHref } from "@/lib/phone";
import { citySlug } from "@/lib/places";
import { QuickFillForm } from "./quick-fill-form";

/**
 * One library at a time: the next library in your localities that is missing
 * hours or amenities. Fill what you learn on a call and move on.
 */
export default async function QuickFillPage({ searchParams }: { searchParams: Promise<{ skip?: string }> }) {
  const staff = await requireApprovedStaff(["sales", "admin"]);
  const { skip } = await searchParams;
  const offset = Math.max(0, Math.min(Number(skip) || 0, 100000));

  const localityIds = staff.effectiveRole === "sales" ? await getAssignedLocalityIds(staff.user.id) : null;
  if (localityIds && localityIds.length === 0) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <h1 className="text-xl font-bold text-black">No localities assigned yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ask an admin to assign you localities from the Assignments page.</p>
      </div>
    );
  }

  let query = supabaseServer
    .from("library_branches")
    .select("id, slug, city, display_name, locality, phone_number, map_link, opening_time, closing_time, amenities_text, total_seats, verification_status", { count: "exact" })
    .eq("is_active", true)
    .or("opening_time.is.null,amenities_text.is.null")
    // Libraries with a phone number first: they can be filled from a call.
    .order("phone_number", { ascending: true, nullsFirst: false })
    .order("profile_completeness_score", { ascending: false, nullsFirst: false })
    .order("id")
    .range(offset, offset);
  if (localityIds) query = query.in("locality_id", localityIds);

  const { data, count } = await query;
  const library = data?.[0];
  const remaining = count ?? 0;

  if (!library) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <h1 className="text-xl font-bold text-black">All caught up</h1>
        <p className="mt-2 text-sm text-muted-foreground">Every library in your localities has hours and amenities.</p>
        {offset > 0 ? (
          <Link href="/sales/quick-fill" className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">
            Start again from the skipped ones
          </Link>
        ) : null}
      </div>
    );
  }

  const nextHref = `/sales/quick-fill?skip=${offset}`; // saved one drops out of the queue
  const skipHref = `/sales/quick-fill?skip=${offset + 1}`;

  return (
    <div className="mx-auto max-w-xl p-4 md:p-8">
      <div className="mb-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>{remaining.toLocaleString("en-IN")} libraries still missing details</span>
        <Link href={skipHref} className="font-semibold text-black hover:underline">
          Skip →
        </Link>
      </div>
      <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h1 className="text-xl font-bold text-black">{library.display_name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {[library.locality, library.city].filter(Boolean).join(", ")}
          {library.phone_number ? ` · ${formatIndianPhone(library.phone_number)}` : ""}
        </p>
        <div className="mt-2 flex gap-3 text-xs">
          <Link href={`/${citySlug(library.city)}/library/${library.slug}`} target="_blank" className="font-semibold text-primary hover:underline">
            Public page
          </Link>
          {library.map_link ? (
            <a href={library.map_link} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">
              Open in Google Maps
            </a>
          ) : null}
        </div>
        <div className="mt-6">
          <QuickFillForm
            key={library.id}
            libraryId={library.id}
            nextHref={nextHref}
            phoneHref={toTelHref(library.phone_number)}
            amenityOptions={FILTERABLE_AMENITIES.map((amenity) => amenity.label)}
            initial={{
              openingTime: library.opening_time?.slice(0, 5) ?? "",
              closingTime: library.closing_time?.slice(0, 5) ?? "",
              amenities: parseAmenitiesText(library.amenities_text),
              seats: library.total_seats ? String(library.total_seats) : "",
              phone: "",
              verified: library.verification_status === "verified",
            }}
          />
        </div>
      </div>
      {/* Kept for the Skip link */}
      <p className="mt-3 text-center text-xs text-muted-foreground">
        <Link href={skipHref} className="hover:underline">Skip this library</Link>
      </p>
    </div>
  );
}
