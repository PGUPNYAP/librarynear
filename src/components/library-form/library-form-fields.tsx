"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, History } from "lucide-react";
import { AMENITY_LABELS, FIELD_LABELS, type FieldErrors, type LibraryFormMode } from "@/lib/library-form";
import { AmenityChips, Field, FormSection, HoursField, inputClass, textareaClass } from "@/components/library-form/form-controls";
import { PlanRowsEditor } from "@/components/library-form/plan-rows-editor";
import { LocationField } from "@/components/library-form/location-field";
import { focusField, type LibraryFormController } from "@/components/library-form/use-library-form";

type CityOption = { name: string; slug: string; state: string | null };

let cityCache: Promise<CityOption[]> | null = null;
function loadCities() {
  cityCache ??= fetch("/api/cities")
    .then((response) => (response.ok ? response.json() : { cities: [] }))
    .then((json: { cities: CityOption[] }) => json.cities)
    .catch(() => {
      cityCache = null;
      return [];
    });
  return cityCache;
}

function timeAgo(timestamp: number) {
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} hr ago` : `${Math.round(hours / 24)} days ago`;
}

export function DraftBanner({ form }: { form: LibraryFormController }) {
  if (!form.restorable) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-900">
      <span className="flex items-center gap-2">
        <History className="h-4 w-4 shrink-0" aria-hidden /> You have unsaved changes from {timeAgo(form.restorable.savedAt)}.
      </span>
      <span className="flex gap-3 font-semibold">
        <button type="button" onClick={form.restoreDraft} className="hover:underline">Restore</button>
        <button type="button" onClick={form.discardDraft} className="text-sky-700 hover:underline">Discard</button>
      </span>
    </div>
  );
}

/** Lists every problem after a failed save; each one jumps to its field. */
export function ErrorSummary({ errors, visible }: { errors: FieldErrors; visible: boolean }) {
  const keys = Object.keys(errors);
  if (!visible || keys.length === 0) return null;
  const label = (key: string) => {
    const plan = key.match(/^plans\.(\d+)\./);
    return plan ? `Plan ${Number(plan[1]) + 1}` : (FIELD_LABELS[key] ?? key);
  };
  return (
    <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">
      <p className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        {keys.length === 1 ? "Fix 1 thing to continue" : `Fix ${keys.length} things to continue`}
      </p>
      <ul className="mt-1 space-y-0.5">
        {keys.slice(0, 8).map((key) => (
          <li key={key}>
            <button type="button" onClick={() => focusField(key)} className="text-left underline-offset-2 hover:underline">
              <span className="font-medium">{label(key)}:</span> {errors[key]}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LibraryFormFields({
  form,
  mode,
  showMetroOverride = false,
  originalLocality,
  photos,
}: {
  form: LibraryFormController;
  mode: LibraryFormMode;
  showMetroOverride?: boolean;
  originalLocality?: string;
  photos?: React.ReactNode;
}) {
  const { values, set, touch, errors } = form;
  const owner = mode === "owner";
  const [cities, setCities] = useState<CityOption[]>([]);
  const [localities, setLocalities] = useState<string[]>([]);
  const citySlug = useMemo(() => cities.find((city) => city.name.toLowerCase() === values.city.trim().toLowerCase())?.slug ?? null, [cities, values.city]);

  useEffect(() => {
    let active = true;
    void loadCities().then((list) => active && setCities(list));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!citySlug) return;
    let active = true;
    fetch(`/api/localities?city=${citySlug}`)
      .then((response) => (response.ok ? response.json() : { localities: [] }))
      .then((json: { localities: string[] }) => active && setLocalities(json.localities))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [citySlug]);

  const bind = (key: "display_name" | "locality" | "district" | "state" | "pin_code" | "full_address" | "description" | "total_seats" | "nearest_metro" | "nearest_metro_distance_km") => ({
    id: `f-${key}`,
    value: values[key],
    onBlur: () => touch(key),
    "aria-invalid": Boolean(errors[key]),
    "aria-describedby": errors[key] ? `f-${key}-error` : undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, event.target.value),
  });

  const trimmedLocality = values.locality.trim().toLowerCase();
  const newLocality = localities.length > 0 && trimmedLocality.length > 1 && trimmedLocality !== originalLocality?.toLowerCase() && !localities.some((item) => item.toLowerCase() === trimmedLocality);
  const newCity = cities.length > 0 && values.city.trim().length > 1 && !citySlug;

  return (
    <div className="space-y-7">
      <FormSection id="sec-location" title={owner ? "Where is your library?" : "Location"}>
        <LocationField form={form} required={owner} />
      </FormSection>

      <FormSection id="sec-basics" title="Name and address">
        <Field name="display_name" label="Library name" required error={errors.display_name}>
          <input {...bind("display_name")} autoComplete="off" autoCapitalize="words" enterKeyHint="next" placeholder="Example Library" className={inputClass} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field name="city" label="City" required error={errors.city} hint={newCity ? "New city. Check the spelling." : undefined}>
            <input
              id="f-city"
              list="library-form-cities"
              value={values.city}
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint="next"
              aria-invalid={Boolean(errors.city)}
              onBlur={() => touch("city")}
              onChange={(event) => {
                const next = event.target.value;
                set("city", next);
                const match = cities.find((city) => city.name.toLowerCase() === next.trim().toLowerCase());
                if (match?.state && !values.state.trim()) set("state", match.state);
              }}
              placeholder="Delhi"
              className={inputClass}
            />
            <datalist id="library-form-cities">
              {cities.map((city) => (
                <option key={city.slug} value={city.name} />
              ))}
            </datalist>
          </Field>
          <Field name="locality" label="Locality" required error={errors.locality} hint={newLocality ? "New locality. Check the spelling." : undefined}>
            <input {...bind("locality")} list="library-form-localities" autoComplete="off" autoCapitalize="words" enterKeyHint="next" placeholder="Laxmi Nagar" className={inputClass} />
            <datalist id="library-form-localities">
              {localities.slice(0, 400).map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </Field>
        </div>
        <Field name="full_address" label="Full address" required={owner} error={errors.full_address}>
          <textarea {...bind("full_address")} rows={2} autoCapitalize="words" placeholder="Building, street, landmark" className={textareaClass} />
        </Field>
        <div className={`grid grid-cols-2 gap-4 ${owner ? "" : "sm:grid-cols-3"}`}>
          <Field name="pin_code" label="PIN code" required={owner} error={errors.pin_code}>
            <input {...bind("pin_code")} inputMode="numeric" autoComplete="off" enterKeyHint="next" maxLength={6} placeholder="110092" className={inputClass} onChange={(event) => set("pin_code", event.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field name="state" label="State" required={owner} error={errors.state}>
            <input {...bind("state")} autoComplete="off" autoCapitalize="words" placeholder="Delhi" className={inputClass} />
          </Field>
          {!owner ? (
            <Field name="district" label="District" optional error={errors.district} className="col-span-2 sm:col-span-1">
              <input {...bind("district")} autoComplete="off" autoCapitalize="words" className={inputClass} />
            </Field>
          ) : null}
        </div>
        {showMetroOverride ? (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-black">
              <input type="checkbox" checked={values.metro_override} onChange={(event) => set("metro_override", event.target.checked)} />
              Set nearest metro by hand
              {!values.metro_override && values.nearest_metro ? <span className="text-xs text-muted-foreground">Now: {values.nearest_metro}</span> : null}
            </label>
            {values.metro_override ? (
              <div className="grid grid-cols-2 gap-4">
                <Field name="nearest_metro" label="Station" error={errors.nearest_metro}>
                  <input {...bind("nearest_metro")} className={inputClass} />
                </Field>
                <Field name="nearest_metro_distance_km" label="Distance (km)" error={errors.nearest_metro_distance_km}>
                  <input {...bind("nearest_metro_distance_km")} inputMode="decimal" className={inputClass} />
                </Field>
              </div>
            ) : null}
          </div>
        ) : null}
      </FormSection>

      <FormSection id="sec-details" title="Hours and contact">
        <HoursField
          mode={values.hours_mode}
          opening={values.opening_time}
          closing={values.closing_time}
          allowUnknown={!owner}
          required={owner}
          error={errors.hours}
          onBlur={() => touch("hours")}
          onChange={(next) => {
            if (next.mode !== undefined) set("hours_mode", next.mode);
            if (next.opening !== undefined) set("opening_time", next.opening);
            if (next.closing !== undefined) set("closing_time", next.closing);
          }}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="phone_number" label="Phone" required={owner} error={errors.phone_number}>
            <input id="f-phone_number" value={values.phone_number} inputMode="tel" autoComplete="off" placeholder="98765 43210" aria-invalid={Boolean(errors.phone_number)} onBlur={() => touch("phone_number")} onChange={(event) => set("phone_number", event.target.value)} className={inputClass} />
          </Field>
          <Field name="whatsapp_number" label="WhatsApp" optional error={errors.whatsapp_number}>
            <input
              id="f-whatsapp_number"
              value={values.whatsapp_same ? values.phone_number : values.whatsapp_number}
              disabled={values.whatsapp_same}
              inputMode="tel"
              autoComplete="off"
              placeholder="98765 43210"
              aria-invalid={Boolean(errors.whatsapp_number)}
              onBlur={() => touch("whatsapp_number")}
              onChange={(event) => set("whatsapp_number", event.target.value)}
              className={inputClass}
            />
            <label className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={values.whatsapp_same}
                onChange={(event) => {
                  set("whatsapp_same", event.target.checked);
                  touch("whatsapp_number");
                }}
              />
              Same as phone
            </label>
          </Field>
        </div>
      </FormSection>

      <FormSection id="sec-facilities" title="Facilities">
        <AmenityChips options={AMENITY_LABELS} selected={values.amenities} required={owner} error={errors.amenities} onChange={(next) => { set("amenities", next); touch("amenities"); }} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field name="total_seats" label="Seats" required={owner} optional={!owner} error={errors.total_seats}>
            <input {...bind("total_seats")} inputMode="numeric" placeholder="80" className={inputClass} onChange={(event) => set("total_seats", event.target.value.replace(/[^\d]/g, ""))} />
          </Field>
        </div>
        <Field name="description" label="About the library" optional error={errors.description} hint={values.description.length > 2400 ? `${values.description.length.toLocaleString("en-IN")} / 3,000` : "What makes this a good place to study?"}>
          <textarea {...bind("description")} rows={3} className={textareaClass} />
        </Field>
      </FormSection>

      <FormSection id="sec-plans" title="Fees" description="Just the price is enough. Blank hours means the full day.">
        <PlanRowsEditor rows={values.plans} errors={errors} onChange={(rows) => set("plans", rows)} onBlur={touch} />
      </FormSection>

      {photos}
    </div>
  );
}
