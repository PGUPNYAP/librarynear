"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Phone } from "lucide-react";
import { quickFillLibrary } from "./actions";

type Props = {
  libraryId: string;
  nextHref: string;
  amenityOptions: string[];
  initial: {
    openingTime: string;
    closingTime: string;
    amenities: string[];
    seats: string;
    phone: string;
    verified: boolean;
  };
  phoneHref: string | null;
};

/** Fast one-screen form: fill what you learn on the call, then Save & next. */
export function QuickFillForm({ libraryId, nextHref, amenityOptions, initial, phoneHref }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open24, setOpen24] = useState(initial.openingTime === "00:00" && initial.closingTime === "00:00");
  const [openingTime, setOpeningTime] = useState(initial.openingTime);
  const [closingTime, setClosingTime] = useState(initial.closingTime);
  const [amenities, setAmenities] = useState<string[]>(initial.amenities);
  const [unreservedFee, setUnreservedFee] = useState("");
  const [reservedFee, setReservedFee] = useState("");
  const [seats, setSeats] = useState(initial.seats);
  const [phone, setPhone] = useState("");
  const [verified, setVerified] = useState(initial.verified);

  const toggle = (label: string) =>
    setAmenities((current) => (current.includes(label) ? current.filter((item) => item !== label) : [...current, label]));

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await quickFillLibrary(libraryId, {
        open24,
        openingTime,
        closingTime,
        amenities,
        unreservedFee,
        reservedFee,
        seats,
        phone,
        verified,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(nextHref);
      router.refresh();
    });
  };

  const input = "w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:border-black";

  return (
    <div className="space-y-6">
      {phoneHref ? (
        <a href={phoneHref} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white">
          <Phone className="h-4 w-4" /> Call library
        </a>
      ) : (
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-black">Phone (none saved)</span>
          <input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" placeholder="98765 43210" className={input} />
        </label>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-black">Hours</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={open24} onChange={(event) => setOpen24(event.target.checked)} /> Open 24 hours
          </label>
        </div>
        {!open24 ? (
          <div className="grid grid-cols-2 gap-3">
            <input type="time" aria-label="Opening time" value={openingTime} onChange={(event) => setOpeningTime(event.target.value)} className={input} />
            <input type="time" aria-label="Closing time" value={closingTime} onChange={(event) => setClosingTime(event.target.value)} className={input} />
          </div>
        ) : null}
        <p className="mt-1 text-xs text-muted-foreground">Overnight is fine, e.g. 18:00 to 02:00.</p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-black">Monthly fee (₹)</h2>
        <div className="grid grid-cols-2 gap-3">
          <input value={unreservedFee} onChange={(event) => setUnreservedFee(event.target.value)} inputMode="numeric" placeholder="Unreserved seat" aria-label="Unreserved monthly fee" className={input} />
          <input value={reservedFee} onChange={(event) => setReservedFee(event.target.value)} inputMode="numeric" placeholder="Reserved seat" aria-label="Reserved monthly fee" className={input} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-black">Amenities</h2>
        <div className="flex flex-wrap gap-2">
          {amenityOptions.map((label) => {
            const active = amenities.includes(label);
            return (
              <button
                key={label}
                type="button"
                onClick={() => toggle(label)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm ${active ? "border-black bg-black text-white" : "border-border text-black"}`}
              >
                {active ? <Check className="h-3.5 w-3.5" /> : null}
                {label}
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-black">Seats</span>
          <input value={seats} onChange={(event) => setSeats(event.target.value)} inputMode="numeric" placeholder="e.g. 80" className={input} />
        </label>
        <label className="flex items-end gap-2 pb-2.5 text-sm font-semibold text-black">
          <input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} />
          Verified on call / visit
        </label>
      </div>

      {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save &amp; next
        </button>
        <button type="button" onClick={() => router.push(nextHref)} className="rounded-xl border border-border px-5 py-3 text-sm font-semibold text-black">
          Skip
        </button>
      </div>
    </div>
  );
}
