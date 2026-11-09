import Link from "next/link";
import { requireApprovedStaff, getAssignedLocalityIds } from "@/lib/staff-access";
import { supabaseServer } from "@/lib/supabase-server";
import { AMENITY_LABELS } from "@/lib/library-form";
import { parseAmenitiesText } from "@/lib/library-filters";
import { formatIndianPhone, toTelHref } from "@/lib/phone";
import { citySlug } from "@/lib/places";
import { QuickFillForm } from "./quick-fill-form";

/**
 * One library at a time: the next library in your localities that is missing
 * hours or amenities. Fill what you learn on a call and move on.
 */
export default async function QuickFillPage({ searchParams }: { searchParams: Promise<{ skip?: string; saved?: string }> }) {
  const staff = await requireApprovedStaff(["sales", "admin"]);
  const { skip, saved } = await searchParams;
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
    .select("id, slug, city, display_name, locality, phone_number, map_link, opening_time, closing_time, amenities_text, total_seats, verification_status, library_fee_plans(plan_category, duration_key, seat_type, base_price, price, is_active)", { count: "exact" })
    .eq("is_active", true)
    .or("opening_time.is.null,amenities_text.is.null")
    // Libraries with a phone number first: they can be filled from a call.
    .order("phone_number", { ascending: true, nullsFirst: false })
    .order("profile_completeness_score", { ascending: false, nullsFirst: false })
    .order("id")
    .range(offset, offset);
  if (localityIds) query = query.in("locality_id", localityIds);

  const { data, count } = await query;
  const library = data?.[0] as unknown as
    | {
        id: string;
        slug: string;
        city: string;
        display_name: string;
        locality: string | null;
        phone_number: string | null;
        map_link: string | null;
        opening_time: string | null;
        closing_time: string | null;
        amenities_text: string | null;
        total_seats: number | null;
        verification_status: string | null;
        library_fee_plans: Array<{ plan_category: string | null; duration_key: string | null; seat_type: string | null; base_price: number | null; price: number | null; is_active: boolean | null }> | null;
      }
    | undefined;
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
  const plans = library.library_fee_plans ?? [];
  const monthlyFee = (seat: string) => {
    const plan = plans.find((item) => item.is_active !== false && item.plan_category === "regular" && item.duration_key === "1_month" && item.seat_type === seat);
    const amount = plan?.base_price ?? plan?.price;
    return amount ? String(amount) : "";
  };

  return (
    <div className="mx-auto max-w-xl p-4 md:p-8">
      {saved ? <p role="status" className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">Saved. Here&apos;s the next one.</p> : null}
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
            amenityOptions={AMENITY_LABELS}
            initial={{
              openingTime: library.opening_time?.slice(0, 5) ?? "",
              closingTime: library.closing_time?.slice(0, 5) ?? "",
              amenities: parseAmenitiesText(library.amenities_text),
              seats: library.total_seats ? String(library.total_seats) : "",
              unreservedFee: monthlyFee("unreserved"),
              reservedFee: monthlyFee("reserved"),
              verified: library.verification_status === "verified",
            }}
          />
        </div>
      </div>
    </div>
  );
}
