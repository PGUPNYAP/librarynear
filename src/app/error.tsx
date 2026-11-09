"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-bold text-black">Something went wrong</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        This page hit an error. Try again, or go back to the homepage.
        {error.digest ? <span className="mt-1 block text-xs">Reference: {error.digest}</span> : null}
      </p>
      <div className="mt-6 flex gap-3">
        <button onClick={reset} className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white">
          Try again
        </button>
        <Link href="/" className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-black">
          Homepage
        </Link>
      </div>
    </div>
  );
}
