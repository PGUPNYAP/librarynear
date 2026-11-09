"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#fff" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 24 }}>LibraryNear is having trouble</h1>
          <p style={{ color: "#6b7280" }}>Please refresh the page in a moment.</p>
          <Link href="/" style={{ color: "#2a5ff9" }}>Go to homepage</Link>
        </div>
      </body>
    </html>
  );
}
