"use client";

import { Copy, Plus, Trash2 } from "lucide-react";
import { DURATION_OPTIONS, SEAT_TYPE_OPTIONS, calculateDiscountedPrice, countWords } from "@/lib/library-plans";
import { newPlanRow, type FieldErrors, type PlanRow } from "@/lib/library-form";
import { FieldError, inputClass, textareaClass } from "@/components/library-form/form-controls";

function Cell({ name, label, error, className = "", children }: { name: string; label: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <div data-field={name} className={`min-w-0 space-y-1 ${className}`}>
      <label className="block text-xs text-muted-foreground">{label}</label>
      {children}
      <FieldError message={error} />
    </div>
  );
}

export function PlanRowsEditor({
  rows,
  errors,
  onChange,
  onBlur,
}: {
  rows: PlanRow[];
  errors: FieldErrors;
  onChange: (rows: PlanRow[]) => void;
  onBlur?: (fieldKey: string) => void;
}) {
  const update = (index: number, patch: Partial<PlanRow>) => onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const remove = (index: number) => onChange(rows.filter((_, i) => i !== index));
  const duplicate = (index: number) => {
    const copy = newPlanRow({ ...rows[index], key: undefined as unknown as string });
    onChange([...rows.slice(0, index + 1), { ...copy, key: newPlanRow().key }, ...rows.slice(index + 1)]);
  };

  return (
    <div data-field="plans" className="space-y-3">
      <FieldError message={errors.plans} />
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">No fees yet. Students compare fees first, so add the monthly price if you know it.</p>
      ) : null}
      {rows.map((row, index) => {
        const key = (field: string) => `plans.${index}.${field}`;
        const price = Number(row.base_price);
        const discount = Number(row.discount_percentage || 0);
        const finalPrice = price > 0 && discount > 0 && discount < 100 ? calculateDiscountedPrice(price, discount) : null;
        const words = countWords(row.description);
        return (
          <div key={row.key} className="rounded-xl border border-border bg-white p-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Cell name={key("duration_key")} label="Duration" error={errors[key("duration_key")]} className="col-span-2 sm:col-span-1">
                <select value={row.duration_key} onChange={(event) => update(index, { duration_key: event.target.value })} className={inputClass} aria-invalid={Boolean(errors[key("duration_key")])}>
                  {DURATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </Cell>
              <Cell name={key("seat_type")} label="Seat" error={errors[key("seat_type")]} className="col-span-2 sm:col-span-1">
                <select value={row.seat_type} onChange={(event) => update(index, { seat_type: event.target.value })} className={inputClass}>
                  {SEAT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </Cell>
              <Cell name={key("hours_per_day")} label="Hours a day" error={errors[key("hours_per_day")]}>
                <input value={row.hours_per_day} inputMode="numeric" placeholder="Full day" onChange={(event) => update(index, { hours_per_day: event.target.value.replace(/[^\d]/g, "").slice(0, 2) })} onBlur={() => onBlur?.(key("hours_per_day"))} className={inputClass} aria-invalid={Boolean(errors[key("hours_per_day")])} />
              </Cell>
              <Cell name={key("base_price")} label="Price (₹)" error={errors[key("base_price")]}>
                <input value={row.base_price} inputMode="numeric" placeholder="2500" onChange={(event) => update(index, { base_price: event.target.value.replace(/[^\d]/g, "").slice(0, 7) })} onBlur={() => onBlur?.(key("base_price"))} className={inputClass} aria-invalid={Boolean(errors[key("base_price")])} />
              </Cell>
            </div>

            <details className="mt-2 group" open={Boolean(row.discount_percentage || row.description || row.offer_name || row.plan_category === "offer" || errors[key("discount_percentage")] || errors[key("description")])}>
              <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground hover:text-black">Discount, offer or note</summary>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Cell name={key("discount_percentage")} label="Discount %" error={errors[key("discount_percentage")]}>
                  <input value={row.discount_percentage} inputMode="numeric" placeholder="0" onChange={(event) => update(index, { discount_percentage: event.target.value.replace(/[^\d]/g, "").slice(0, 2) })} className={inputClass} aria-invalid={Boolean(errors[key("discount_percentage")])} />
                </Cell>
                <Cell name={key("plan_category")} label="Type" error={errors[key("plan_category")]}>
                  <select value={row.plan_category} onChange={(event) => update(index, { plan_category: event.target.value })} className={inputClass}>
                    <option value="regular">Regular</option>
                    <option value="offer">Offer</option>
                  </select>
                </Cell>
                {row.plan_category === "offer" ? (
                  <Cell name={key("offer_name")} label="Offer name" error={errors[key("offer_name")]} className="col-span-2">
                    <input value={row.offer_name} placeholder="Diwali offer" onChange={(event) => update(index, { offer_name: event.target.value })} className={inputClass} />
                  </Cell>
                ) : null}
                <Cell name={key("description")} label={`Note (${words}/30 words)`} error={errors[key("description")]} className="col-span-2 sm:col-span-4">
                  <textarea rows={2} value={row.description} placeholder="Anything students should know" onChange={(event) => update(index, { description: event.target.value })} className={textareaClass} aria-invalid={Boolean(errors[key("description")])} />
                </Cell>
              </div>
            </details>

            <div className="mt-2 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{finalPrice ? `Students pay ₹${finalPrice.toLocaleString("en-IN")}` : ""}</p>
              <div className="flex gap-1">
                <button type="button" onClick={() => duplicate(index)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-black">
                  <Copy className="h-3.5 w-3.5" aria-hidden /> Duplicate
                </button>
                <button type="button" onClick={() => remove(index)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-rose-700 hover:bg-rose-50" aria-label={`Remove plan ${index + 1}`}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
                </button>
              </div>
            </div>
          </div>
        );
      })}
      <button type="button" onClick={() => onChange([...rows, newPlanRow()])} className="inline-flex items-center gap-1.5 inline-flex min-h-11 rounded-full border border-border px-4 py-2 text-sm font-medium text-black hover:border-black">
        <Plus className="h-4 w-4" aria-hidden /> {rows.length ? "Add another plan" : "Add a fee"}
      </button>
    </div>
  );
}
