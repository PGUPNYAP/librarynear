# LibraryNear

Directory of study libraries and reading rooms in India: search by city, locality, metro, amenities, fees and hours, compare libraries side by side, and send an enquiry. Live at <https://www.librarynear.com>.

## Stack

- **Next.js 16** (App Router, ISR, `proxy.ts`), React 19, Tailwind CSS 4
- **Supabase** (Postgres, auth with Google, row-level security)
- **Sanity** for the blog (`/studio`)
- **ImageKit** for photos
- **Upstash Redis** for shared rate limiting (optional locally)
- **Sentry** for error monitoring (optional locally)
- Hosted on **Vercel**

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

Open <http://localhost:3000>.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase project |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-side database access (never exposed to the browser) |
| `DATABASE_URL` | scripts only | Direct Postgres connection for maintenance scripts |
| `NEXT_PUBLIC_SITE_URL` | prod | Canonical origin, e.g. `https://www.librarynear.com` |
| `ADMIN_BOOTSTRAP_EMAILS` | first run | Comma-separated emails allowed to become the first admin |
| `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_URL_ENDPOINT` | yes | Photo uploads |
| `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`, `SANITY_API_TOKEN` | yes | Blog |
| `GOOGLE_MAPS_API_KEY` | yes | Resolving Google Maps share links |
| `GOOGLE_PLACES_API_KEY` | prod | "Libraries near <place>" fallback when a place isn't in our data (falls back to `GOOGLE_MAPS_API_KEY`) |
| `GOOGLE_PLACES_DAILY_CAP` | optional | Max Google place lookups per day across the site (default 800) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | prod | Rate limits shared across all server instances |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | prod | Error monitoring |
| `CRON_SECRET` | prod | Protects `/api/cron/*` (Vercel sends it automatically) |
| `INDEXNOW_KEY` | prod | Instant Bing/Yandex indexing pings |
| `BING_SITE_VERIFICATION` | prod | Bing Webmaster Tools verification |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | optional | Product analytics |

## Database

Migrations live in `supabase/migrations` and are applied in filename order. The production-readiness migrations (`20261107000000_*`, `20261107000100_*`, `20261107000200_*`, `20261107000300_*`, `20261109000000_*`) add:

- aggregate RPCs (`city_library_counts`, `city_locality_counts`, `staff_activity_summary`, `staff_activity_daily`, `locality_assignment_overview`) so no page scans whole tables;
- a trigger that keeps `library_branches.locality_id` in sync with city + locality;
- `update_library_with_plans`, which saves a library and its fee plans in one transaction;
- lead workflow columns, staff invites, review history and pending-upload tracking;
- security fixes (fee plans and reviews can only be written by the server);
- search learning (aliases, click popularity) and a geocode cache for place lookups;
- anonymous weekly study-room totals per locality (`/study-room`).

## Search

Suggestions are computed in the browser from a per-city index (`/api/search-index/[city]`):
libraries, localities, metro stations, landmarks (colleges, coaching institutes, hospitals,
stations from OpenStreetMap), PIN codes and learned aliases. "Library near X" resolves X from
our data first, then a 30-day cache, then Google Places (rate limited and capped).
Search events feed a nightly job (`/api/cron/learn-search`) that learns aliases and popularity;
review them at Admin → Search learning.

## Maintenance scripts

```bash
npx tsx scripts/fetch-places.ts            # refresh landmarks + metro stations from OpenStreetMap
npx tsx scripts/clean-data.ts              # dry run: names, localities, nearest metros
npx tsx scripts/clean-data.ts --apply
npx tsx scripts/fix-cities.ts              # dry run: report of city/state/PIN corrections
npx tsx scripts/fix-cities.ts --apply      # apply them
npx tsx scripts/recompute-scores.ts --apply
npm test                                   # vitest
npm run lint
```

## Project layout

- `src/app/[city]/…` public city, locality, metro, amenity and library pages
- `src/app/admin`, `src/app/sales` staff dashboards
- `src/app/for-owners` owner listing form
- `src/lib` data access, SEO helpers, validation, rate limiting
- `src/app/sitemap.xml`, `src/app/sitemaps/[part]` sitemap index and parts
- `public/llms.txt`, `src/app/llms-full.txt` content for AI answer engines
