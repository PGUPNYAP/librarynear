"use client";

import { useState, useTransition } from "react";
import { setLibraryVerificationStatus } from "../libraries-actions";

type Status = "verified" | "unverified";

export function VerificationStatusSelect({ id, value }: { id: string; value: Status }) {
  const [isPending, startTransition] = useTransition();
  const [current, setCurrent] = useState<Status>(value);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <select
        value={current}
        disabled={isPending}
        aria-label="Verification status"
        onChange={(event) => {
          const previous = current;
          const nextValue = event.target.value as Status;
          setCurrent(nextValue);
          setError(null);
          startTransition(async () => {
            const result = await setLibraryVerificationStatus(id, nextValue);
            if (!result.ok) {
              setCurrent(previous);
              setError(result.error ?? "Could not save.");
            }
          });
        }}
        className={`rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-60 ${
          current === "verified" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-border bg-white text-black"
        }`}
      >
        <option value="unverified">Not Verified</option>
        <option value="verified">Verified</option>
      </select>
      {error ? <span role="alert" className="max-w-[160px] whitespace-normal text-[11px] text-rose-600">{error}</span> : null}
    </div>
  );
}
