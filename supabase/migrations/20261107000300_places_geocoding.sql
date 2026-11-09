-- Cache for "libraries near <place>" lookups that our own data couldn't answer.
-- Google's terms allow caching coordinates (lat/lng) for up to 30 days, so
-- rows older than that are ignored and refreshed. Idempotent.

CREATE TABLE IF NOT EXISTS public.geocode_cache (
  query_key TEXT NOT NULL,
  city TEXT NOT NULL,
  label TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  place_id TEXT,
  source TEXT NOT NULL DEFAULT 'google',
  hits INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (city, query_key)
);
ALTER TABLE public.geocode_cache ENABLE ROW LEVEL SECURITY;
-- No policies: server (service role) only.

CREATE INDEX IF NOT EXISTS idx_geocode_cache_created ON public.geocode_cache (created_at);
