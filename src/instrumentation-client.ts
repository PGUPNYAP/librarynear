import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
    // Ignore noise from browser extensions and flaky networks.
    ignoreErrors: ["ResizeObserver loop", "Non-Error promise rejection captured", "Load failed", "Failed to fetch"],
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
