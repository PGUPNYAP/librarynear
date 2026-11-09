"use client";

import { useState, useTransition } from "react";
import { LEAD_STATUSES, LEAD_STATUS_LABEL, type LeadStatus } from "@/lib/lead-status";
import { updateLeadDetails, updateLeadStatus } from "./leads-actions";

const STYLE: Record<LeadStatus, string> = {
  new: "bg-blue-50 text-blue-700 border-blue-200",
  contacted: "bg-amber-50 text-amber-700 border-amber-200",
  follow_up: "bg-violet-50 text-violet-700 border-violet-200",
  converted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  dead: "bg-gray-50 text-gray-700 border-gray-200",
};

export function LeadStatusSelect({ leadId, currentStatus }: { leadId: string; currentStatus: string | null }) {
  const [isPending, startTransition] = useTransition();
  const initial = (LEAD_STATUSES as readonly string[]).includes(currentStatus ?? "") ? (currentStatus as LeadStatus) : "new";
  const [value, setValue] = useState<LeadStatus>(initial);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <select
        value={value}
        aria-label="Lead status"
        onChange={(event) => {
          const previous = value;
          const next = event.target.value as LeadStatus;
          setValue(next);
          setError(null);
          startTransition(async () => {
            const result = await updateLeadStatus(leadId, next);
            if (!result.ok) {
              setValue(previous);
              setError(result.error);
            }
          });
        }}
        disabled={isPending}
        className={`rounded-md border px-2 py-1 text-xs font-medium ${STYLE[value]}`}
      >
        {LEAD_STATUSES.map((status) => (
          <option key={status} value={status}>
            {LEAD_STATUS_LABEL[status]}
          </option>
        ))}
      </select>
      {error ? <span className="text-[11px] text-rose-600">{error}</span> : null}
    </div>
  );
}

export function LeadNotesEditor({
  leadId,
  notes,
  followUpAt,
}: {
  leadId: string;
  notes: string | null;
  followUpAt: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState(notes ?? "");
  const [date, setDate] = useState(followUpAt ? followUpAt.slice(0, 10) : "");
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");

  return (
    <form
      className="flex min-w-[260px] flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        setState("idle");
        startTransition(async () => {
          const result = await updateLeadDetails(leadId, { notes: draft, followUpAt: date || null });
          setState(result.ok ? "saved" : "error");
        });
      }}
    >
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        maxLength={2000}
        rows={2}
        placeholder="Notes"
        aria-label="Lead notes"
        className="w-full rounded-md border border-border px-2 py-1 text-xs"
      />
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          aria-label="Follow-up date"
          className="rounded-md border border-border px-2 py-1 text-xs"
        />
        <button disabled={isPending} className="rounded-md bg-black px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50">
          {isPending ? "Saving…" : "Save"}
        </button>
        {state === "saved" ? <span className="text-[11px] text-emerald-700">Saved</span> : null}
        {state === "error" ? <span className="text-[11px] text-rose-600">Not saved</span> : null}
      </div>
    </form>
  );
}
