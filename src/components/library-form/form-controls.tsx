"use client";

import { useState } from "react";
import { AlertCircle, Check } from "lucide-react";
import { describeHours, formatClock, timeFromDigits, type HoursMode } from "@/lib/library-form";

export const inputClass =
  "h-11 w-full min-w-0 rounded-xl border border-border bg-white px-3 text-[16px] text-black outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus:ring-3 focus:ring-primary/15 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:ring-rose-100 disabled:bg-muted/60 md:text-sm";

export const textareaClass =
  "w-full min-w-0 rounded-xl border border-border bg-white px-3 py-2.5 text-[16px] text-black outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus:ring-3 focus:ring-primary/15 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:ring-rose-100 md:text-sm";

export function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="flex items-start gap-1.5 text-[13px] leading-5 text-rose-700">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
  );
}

export function Field({
  name,
  label,
  required,
  optional,
  hint,
  error,
  children,
  className = "",
}: {
  name: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div data-field={name} className={`min-w-0 space-y-1.5 ${className}`}>
      <label htmlFor={`f-${name}`} className="flex items-baseline justify-between gap-2 text-sm font-medium text-black">
        <span>
          {label}
          {required ? <span className="text-rose-600"> *</span> : null}
        </span>
        {optional ? <span className="text-xs font-normal text-muted-foreground">Optional</span> : null}
      </label>
      {children}
      {error ? <FieldError id={`f-${name}-error`} message={error} /> : hint ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function FormSection({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16 border-b border-border/70 pb-7 last:border-0 last:pb-0">
      <h3 className="text-base font-semibold text-black">{title}</h3>
      {description ? <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{description}</p> : null}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function Segmented<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="inline-flex max-w-full rounded-xl bg-muted/70 p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`min-h-9 rounded-lg px-2.5 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors sm:px-3 ${active ? "bg-white text-black shadow-sm" : "text-muted-foreground hover:text-black"}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

const OPENING_CHOICES = ["05:00", "06:00", "07:00", "08:00", "09:00", "10:00"];
const CLOSING_CHOICES = ["20:00", "21:00", "22:00", "23:00", "00:00", "02:00"];

function shortClock(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return `${hours % 12 || 12}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""} ${hours < 12 ? "AM" : "PM"}`;
}

/** Tap a common time, or enter a number and choose AM or PM. */
function TimeChooser({ label, kind, value, invalid, onChange, onBlur }: { label: string; kind: "opening" | "closing"; value: string; invalid: boolean; onChange: (value: string) => void; onBlur?: () => void }) {
  const choices = kind === "opening" ? OPENING_CHOICES : CLOSING_CHOICES;
  const [digits, setDigits] = useState<string | null>(null);
  const [badEntry, setBadEntry] = useState(false);
  const [meridiem, setMeridiem] = useState<"AM" | "PM">(value ? (Number(value.slice(0, 2)) < 12 ? "AM" : "PM") : kind === "opening" ? "AM" : "PM");
  const isOther = Boolean(value) && !choices.includes(value);
  const savedClock = isOther ? formatClock(value).split(" ")[0] : "";
  const shown = digits ?? savedClock;

  const chooseMeridiem = (next: "AM" | "PM") => {
    setMeridiem(next);
    const current = digits ?? savedClock.replace(":", "");
    const time = current ? timeFromDigits(current, next) : null;
    if (time) onChange(time);
  };

  return (
    <fieldset className="min-w-0 space-y-1.5">
      <legend className="text-xs text-muted-foreground">{label}</legend>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {choices.map((choice) => {
          const active = value === choice;
          return (
            <button
              key={choice}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setDigits(null);
                setBadEntry(false);
                onChange(active ? "" : choice);
              }}
              className={`h-11 rounded-xl border text-[13px] font-medium whitespace-nowrap transition-colors sm:h-10 ${active ? "border-black bg-black text-white" : "border-border bg-white text-black hover:border-black/50"}`}
            >
              {shortClock(choice)}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[13px] text-muted-foreground">Other</span>
        <input
          value={shown}
          inputMode="numeric"
          maxLength={5}
          aria-label={`${label}, other time`}
          aria-invalid={invalid || badEntry}
          placeholder="9:30"
          autoComplete="off"
          enterKeyHint="done"
          onFocus={() => setDigits(savedClock.replace(":", ""))}
          onChange={(event) => {
            const next = event.target.value.replace(/\D/g, "").slice(0, 4);
            setDigits(next);
            setBadEntry(false);
            if (!next) {
              if (isOther) onChange("");
              return;
            }
            const time = timeFromDigits(next, meridiem);
            if (time) onChange(time);
          }}
          onBlur={() => {
            const typed = digits ?? "";
            setDigits(null);
            onBlur?.();
            if (typed && !timeFromDigits(typed, meridiem)) setBadEntry(true);
          }}
          className={`h-11 w-20 min-w-0 rounded-xl border bg-white px-2 text-center text-[16px] text-black outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-3 focus:ring-primary/15 sm:h-10 sm:text-[13px] ${isOther ? "border-black font-medium" : "border-border"} aria-[invalid=true]:border-rose-400`}
        />
        <div role="radiogroup" aria-label={`${label}, AM or PM`} className="inline-flex rounded-xl bg-muted/70 p-1">
          {(["AM", "PM"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={meridiem === option}
              onClick={() => chooseMeridiem(option)}
              className={`h-9 w-11 rounded-lg text-[13px] font-medium transition-colors sm:h-8 ${meridiem === option ? "bg-white text-black shadow-sm" : "text-muted-foreground"}`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
      {badEntry ? <FieldError message="Enter a time like 9 or 9:30." /> : null}
    </fieldset>
  );
}

export function HoursField({
  mode,
  opening,
  closing,
  allowUnknown,
  error,
  required,
  onChange,
  onBlur,
}: {
  mode: HoursMode;
  opening: string;
  closing: string;
  allowUnknown: boolean;
  error?: string;
  required?: boolean;
  onChange: (next: { mode?: HoursMode; opening?: string; closing?: string }) => void;
  onBlur?: () => void;
}) {
  const summary = describeHours({ mode, opening, closing });
  const options: Array<{ value: HoursMode; label: string }> = [
    { value: "set", label: "Set hours" },
    { value: "24h", label: "Open 24 hours" },
    ...(allowUnknown ? [{ value: "unknown" as const, label: "Not known" }] : []),
  ];
  return (
    <div data-field="hours" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-black">
          Opening hours{required ? <span className="text-rose-600"> *</span> : null}
        </span>
        <Segmented name="Opening hours" value={mode} options={options} onChange={(next) => onChange({ mode: next })} />
      </div>
      {mode === "set" ? (
        <div className="space-y-3">
          <TimeChooser label="Opens" kind="opening" value={opening} invalid={Boolean(error) && !opening} onChange={(next) => onChange({ opening: next })} onBlur={onBlur} />
          <TimeChooser label="Closes" kind="closing" value={closing} invalid={Boolean(error) && !closing} onChange={(next) => onChange({ closing: next })} onBlur={onBlur} />
        </div>
      ) : null}
      {error ? <FieldError message={error} /> : summary && mode === "set" ? <p className="text-xs text-muted-foreground">{summary}</p> : null}
    </div>
  );
}

export function AmenityChips({
  options,
  selected,
  onChange,
  error,
  required,
  custom = true,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  error?: string;
  required?: boolean;
  /** Show amenities saved earlier that aren't in the standard list. */
  custom?: boolean;
}) {
  const lowerOptions = new Set(options.map((item) => item.toLowerCase()));
  const extras = custom ? selected.filter((item) => !lowerOptions.has(item.toLowerCase())) : [];
  const selectedLower = new Set(selected.map((item) => item.toLowerCase()));
  const toggle = (label: string) =>
    onChange(selectedLower.has(label.toLowerCase()) ? selected.filter((item) => item.toLowerCase() !== label.toLowerCase()) : [...selected, label]);
  const [draft, setDraft] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  /** Commas separate amenities when saved, so "Library, Canteen" becomes two. */
  const addTyped = () => {
    const names = draft.split(/[,|\n]/).map((item) => item.trim().replace(/\s+/g, " ")).filter(Boolean);
    if (names.length === 0) return;
    if (names.some((name) => name.length > 40 || !/[\p{L}]/u.test(name))) {
      setAddError("Use a short name, like Book bank.");
      return;
    }
    const next = [...selected];
    for (const name of names) {
      const standard = options.find((item) => item.toLowerCase() === name.toLowerCase());
      if (!next.some((item) => item.toLowerCase() === name.toLowerCase())) next.push(standard ?? name);
    }
    if (next.length > 30) {
      setAddError("You can add up to 30 amenities.");
      return;
    }
    onChange(next);
    setDraft("");
    setAddError(null);
  };
  return (
    <div data-field="amenities" className="space-y-2">
      <span className="text-sm font-medium text-black">
        Amenities{required ? <span className="text-rose-600"> *</span> : null}
      </span>
      <div className="flex flex-wrap gap-2">
        {[...options, ...extras].map((label) => {
          const active = selectedLower.has(label.toLowerCase());
          return (
            <button
              key={label}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(label)}
              className={`inline-flex min-h-10 items-center gap-1 rounded-full border px-3.5 py-1.5 text-[13px] transition-colors sm:min-h-8 sm:px-3 ${active ? "border-black bg-black text-white" : "border-border text-black hover:border-black/50"}`}
            >
              {active ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
              {label}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          aria-label="Add another amenity"
          placeholder="Add another amenity"
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="done"
          maxLength={120}
          onChange={(event) => {
            setDraft(event.target.value);
            setAddError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addTyped();
            }
          }}
          onBlur={addTyped}
          className={inputClass}
        />
        <button type="button" onClick={addTyped} className="h-11 shrink-0 rounded-xl border border-border px-4 text-sm font-medium text-black hover:border-black">Add</button>
      </div>
      <FieldError message={addError ?? error} />
    </div>
  );
}
