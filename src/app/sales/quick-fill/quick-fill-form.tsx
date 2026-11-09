"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Phone } from "lucide-react";
import { quickFillLibrary, type QuickFillErrors, type QuickFillResult } from "./actions";
import { AmenityChips, Field, HoursField, inputClass } from "@/components/library-form/form-controls";
import { feeError, hoursError, phoneError, seatsError, type HoursMode } from "@/lib/library-form";

type Props = {
  libraryId: string;
  nextHref: string;
  amenityOptions: string[];
  initial: {
    openingTime: string;
    closingTime: string;
    amenities: string[];
    seats: string;
    unreservedFee: string;
    reservedFee: string;
    verified: boolean;
  };
  phoneHref: string | null;
};

/** One screen: fill what you learn on the call, then Save & next. Blank means "didn't find out". */
export function QuickFillForm({ libraryId, nextHref, amenityOptions, initial, phoneHref }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const saving_ = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<QuickFillErrors>({});
  const startMode: HoursMode = initial.openingTime === "00:00" && initial.closingTime === "00:00" ? "24h" : initial.openingTime ? "set" : "unknown";
  const [hoursMode, setHoursMode] = useState<HoursMode>(startMode);
  const [openingTime, setOpeningTime] = useState(startMode === "set" ? initial.openingTime : "");
  const [closingTime, setClosingTime] = useState(startMode === "set" ? initial.closingTime : "");
  const [amenities, setAmenities] = useState<string[]>(initial.amenities);
  const [unreservedFee, setUnreservedFee] = useState(initial.unreservedFee);
  const [reservedFee, setReservedFee] = useState(initial.reservedFee);
  const [seats, setSeats] = useState(initial.seats);
  const [phone, setPhone] = useState("");
  const [verified, setVerified] = useState(initial.verified);

  const clear = (key: keyof QuickFillErrors) => setErrors((current) => ({ ...current, [key]: undefined }));

  const check = (): QuickFillErrors => ({
    hours: hoursError({ mode: hoursMode, opening: openingTime, closing: closingTime }, false) ?? undefined,
    phone: phoneError(phone) ?? undefined,
    seats: seatsError(seats) ?? undefined,
    unreservedFee: feeError(unreservedFee) ?? undefined,
    reservedFee: feeError(reservedFee) ?? undefined,
  });

  const save = async () => {
    if (saving_.current) return;
    setError(null);
    const found = check();
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    saving_.current = true;
    setSaving(true);
    const result = await quickFillLibrary(libraryId, { hoursMode, openingTime, closingTime, amenities, unreservedFee, reservedFee, seats, phone, verified }).catch((): QuickFillResult => ({
      ok: false,
      error: "We couldn't reach the server. What you typed is still here, so try again.",
    }));
    if (!result.ok) {
      saving_.current = false;
      setSaving(false);
      setError(result.error);
      if (result.fieldErrors) setErrors(result.fieldErrors);
      return;
    }
    router.push(`${nextHref}&saved=1`);
    router.refresh();
  };

  return (
    <div className="space-y-6">
      {phoneHref ? (
        <a href={phoneHref} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white">
          <Phone className="h-4 w-4" /> Call library
        </a>
      ) : (
        <Field name="phone" label="Phone" hint="None saved yet." error={errors.phone}>
          <input id="f-phone" value={phone} onChange={(event) => { setPhone(event.target.value); clear("phone"); }} inputMode="tel" placeholder="98765 43210" aria-invalid={Boolean(errors.phone)} className={inputClass} />
        </Field>
      )}

      <HoursField
        mode={hoursMode}
        opening={openingTime}
        closing={closingTime}
        allowUnknown
        error={errors.hours}
        onChange={(next) => {
          if (next.mode !== undefined) setHoursMode(next.mode);
          if (next.opening !== undefined) setOpeningTime(next.opening);
          if (next.closing !== undefined) setClosingTime(next.closing);
          clear("hours");
        }}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field name="unreservedFee" label="Monthly, unreserved (₹)" error={errors.unreservedFee}>
          <input id="f-unreservedFee" value={unreservedFee} onChange={(event) => { setUnreservedFee(event.target.value.replace(/[^\d]/g, "")); clear("unreservedFee"); }} inputMode="numeric" placeholder="2000" aria-invalid={Boolean(errors.unreservedFee)} className={inputClass} />
        </Field>
        <Field name="reservedFee" label="Monthly, reserved (₹)" error={errors.reservedFee}>
          <input id="f-reservedFee" value={reservedFee} onChange={(event) => { setReservedFee(event.target.value.replace(/[^\d]/g, "")); clear("reservedFee"); }} inputMode="numeric" placeholder="2500" aria-invalid={Boolean(errors.reservedFee)} className={inputClass} />
        </Field>
      </div>

      <AmenityChips options={amenityOptions} selected={amenities} onChange={setAmenities} />

      <div className="grid grid-cols-2 items-start gap-3">
        <Field name="seats" label="Seats" error={errors.seats}>
          <input id="f-seats" value={seats} onChange={(event) => { setSeats(event.target.value.replace(/[^\d]/g, "")); clear("seats"); }} inputMode="numeric" placeholder="80" aria-invalid={Boolean(errors.seats)} className={inputClass} />
        </Field>
        <label className="flex items-center gap-2 pt-8 text-sm font-medium text-black">
          <input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} />
          Confirmed on call or visit
        </label>
      </div>

      {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}

      <button type="button" onClick={() => void save()} disabled={saving} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white disabled:opacity-60">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {saving ? "Saving" : "Save & next"}
      </button>
    </div>
  );
}
