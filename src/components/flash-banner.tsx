"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";

/** Shows ?error= or ?notice= set by a server action redirect, so failures are never silent. */
export function FlashBanner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const error = params.get("error");
  const notice = params.get("notice");
  const message = error ?? notice;
  if (!message) return null;

  const dismiss = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("error");
    next.delete("notice");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <div
      role={error ? "alert" : "status"}
      className={`mx-6 mt-6 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
        error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      {error ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
      <p className="flex-1">{message.slice(0, 300)}</p>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="rounded p-0.5 hover:bg-white/60">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
