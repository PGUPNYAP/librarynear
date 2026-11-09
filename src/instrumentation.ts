import * as Sentry from "@sentry/nextjs";

/**
 * Server-side error monitoring. Does nothing until SENTRY_DSN (or
 * NEXT_PUBLIC_SENTRY_DSN) is set, so local dev and preview builds stay quiet.
 */
export async function register() {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    // Errors only: performance tracing is off to stay on the free tier.
    tracesSampleRate: 0,
  });
}

export const onRequestError = Sentry.captureRequestError;
