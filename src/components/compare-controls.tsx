"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { GitCompareArrows, X } from "lucide-react";
import { MAX_COMPARE, useCompareStore } from "@/store/use-compare-store";

const noopSubscribe = () => () => {};

/** false during SSR and the first client render, true afterwards. */
function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** Small "Compare" checkbox shown on library cards. */
export function CompareToggle({ id, name }: { id: string; name: string }) {
  const hydrated = useHydrated();
  const selected = useCompareStore((state) => state.items.some((item) => item.id === id));
  const toggle = useCompareStore((state) => state.toggle);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const result = toggle({ id, name });
          if (result === "full") {
            setMessage(`You can compare up to ${MAX_COMPARE}`);
            window.setTimeout(() => setMessage(null), 2200);
          }
        }}
        aria-pressed={hydrated ? selected : false}
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
          hydrated && selected ? "border-black bg-black text-white" : "border-border bg-white text-black hover:border-black"
        }`}
      >
        <GitCompareArrows className="h-3.5 w-3.5" />
        {hydrated && selected ? "Added" : "Compare"}
      </button>
      {message ? (
        <span role="status" className="absolute left-0 top-full z-20 mt-1 whitespace-nowrap rounded-md bg-black px-2 py-1 text-[11px] text-white">
          {message}
        </span>
      ) : null}
    </span>
  );
}

/** Floating tray listing the libraries picked for comparison. */
export function CompareTray() {
  const hydrated = useHydrated();
  const items = useCompareStore((state) => state.items);
  const remove = useCompareStore((state) => state.remove);
  const clear = useCompareStore((state) => state.clear);

  if (!hydrated || items.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="flex w-full max-w-2xl items-center gap-3 rounded-2xl border border-border bg-white p-3 shadow-[0_8px_30px_-4px_rgba(0,0,0,0.25)]">
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto no-scrollbar">
          {items.map((item) => (
            <span key={item.id} className="inline-flex max-w-[180px] shrink-0 items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-medium text-black">
              <span className="truncate">{item.name}</span>
              <button type="button" onClick={() => remove(item.id)} aria-label={`Remove ${item.name}`} className="rounded-full p-0.5 hover:bg-white">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <button type="button" onClick={clear} className="hidden shrink-0 text-xs font-semibold text-muted-foreground hover:text-black sm:block">
          Clear
        </button>
        <Link
          href={`/compare?ids=${items.map((item) => item.id).join(",")}`}
          aria-disabled={items.length < 2}
          className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold ${
            items.length < 2 ? "pointer-events-none bg-muted text-muted-foreground" : "bg-black text-white hover:bg-black/85"
          }`}
        >
          {items.length < 2 ? "Pick 1 more" : `Compare ${items.length}`}
        </Link>
      </div>
    </div>
  );
}
