-- Search that learns from users: click logging, popularity, and aliases
-- (abbreviations / alternate names) mined from what people type and pick.
-- Run after 20261107000100_sales_forms_security.sql. Idempotent.

-- ---------------------------------------------------------------------------
-- 1. Richer search events (what was typed, what was picked)
-- ---------------------------------------------------------------------------

ALTER TABLE public.search_events
  ADD COLUMN IF NOT EXISTS clicked_type TEXT,
  ADD COLUMN IF NOT EXISTS clicked_label TEXT,
  ADD COLUMN IF NOT EXISTS position INTEGER,
  ADD COLUMN IF NOT EXISTS source TEXT;

CREATE INDEX IF NOT EXISTS idx_search_events_created ON public.search_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_events_city_clicked
  ON public.search_events (city, clicked_type, clicked_slug)
  WHERE clicked_slug IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Aliases: city-scoped, typed targets, review status
-- ---------------------------------------------------------------------------

ALTER TABLE public.place_aliases
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS target_type TEXT,
  ADD COLUMN IF NOT EXISTS target_slug TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS sessions INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'place_aliases_status_check') THEN
    ALTER TABLE public.place_aliases
      ADD CONSTRAINT place_aliases_status_check CHECK (status IN ('approved', 'pending', 'rejected'));
  END IF;
END $$;

-- Earlier seed scripts inserted the same aliases several times; keep the oldest.
DELETE FROM public.place_aliases AS alias
USING (
  SELECT id, row_number() OVER (
    PARTITION BY COALESCE(city, ''), lower(alias_text), COALESCE(target_type, place_type), lower(canonical_name)
    ORDER BY created_at NULLS LAST, id
  ) AS position
  FROM public.place_aliases
) AS ranked
WHERE alias.id = ranked.id AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_place_aliases_city_alias_target
  ON public.place_aliases (COALESCE(city, ''), lower(alias_text), COALESCE(target_type, place_type), lower(canonical_name));

-- ---------------------------------------------------------------------------
-- 3. Click popularity per result (last 90 days), used to rank suggestions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.search_click_stats (
  city TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_slug TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (city, target_type, target_slug)
);
ALTER TABLE public.search_click_stats ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4. Nightly learning job
--    - refreshes click popularity
--    - turns "typed X, picked Y" pairs into aliases when X is not just a
--      prefix/spelling of Y (e.g. "orn" -> Old Rajinder Nagar)
--    - 5+ distinct sessions: approved automatically; 2-4: pending review
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.learn_search_aliases()
RETURNS TABLE (approved INTEGER, pending INTEGER, popularity_rows INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_approved INTEGER := 0;
  v_pending INTEGER := 0;
  v_pop INTEGER := 0;
BEGIN
  -- Popularity
  DELETE FROM public.search_click_stats;
  INSERT INTO public.search_click_stats (city, target_type, target_slug, clicks)
  SELECT lower(city), clicked_type, clicked_slug, COUNT(DISTINCT COALESCE(session_id, id::text))
  FROM public.search_events
  WHERE clicked_slug IS NOT NULL
    AND clicked_type IN ('library', 'locality', 'metro')
    AND city IS NOT NULL
    AND created_at > NOW() - INTERVAL '90 days'
  GROUP BY lower(city), clicked_type, clicked_slug;
  GET DIAGNOSTICS v_pop = ROW_COUNT;

  -- Alias candidates
  WITH picks AS (
    SELECT
      lower(e.city) AS city,
      regexp_replace(lower(trim(e.query)), '\s+', ' ', 'g') AS alias,
      e.clicked_type AS target_type,
      e.clicked_slug AS target_slug,
      e.clicked_label AS target_label,
      COALESCE(e.session_id, e.id::text) AS session
    FROM public.search_events e
    WHERE e.clicked_slug IS NOT NULL
      AND e.clicked_label IS NOT NULL
      AND e.clicked_type IN ('locality', 'metro', 'library')
      AND e.city IS NOT NULL
      AND e.created_at > NOW() - INTERVAL '120 days'
      AND char_length(trim(e.query)) BETWEEN 2 AND 40
  ),
  candidates AS (
    SELECT city, alias, target_type, target_slug, MAX(target_label) AS target_label, COUNT(DISTINCT session) AS sessions
    FROM picks
    -- Skip ordinary prefix typing ("mukh" -> Mukherjee Nagar): only keep
    -- queries that are not already contained in the result's name.
    WHERE position(alias IN lower(target_label)) = 0
      AND position(replace(alias, ' ', '') IN replace(lower(target_label), ' ', '')) = 0
    GROUP BY city, alias, target_type, target_slug
    HAVING COUNT(DISTINCT session) >= 2
  ),
  upserted AS (
    INSERT INTO public.place_aliases (place_type, canonical_name, alias_text, city, target_type, target_slug, status, sessions, source, is_active, updated_at)
    SELECT
      c.target_type,
      c.target_label,
      c.alias,
      c.city,
      c.target_type,
      c.target_slug,
      CASE WHEN c.sessions >= 5 THEN 'approved' ELSE 'pending' END,
      c.sessions,
      'learned',
      true,
      NOW()
    FROM candidates c
    ON CONFLICT (COALESCE(city, ''), lower(alias_text), COALESCE(target_type, place_type), lower(canonical_name))
    DO UPDATE SET
      sessions = EXCLUDED.sessions,
      updated_at = NOW(),
      -- never resurrect an alias an admin rejected; promote pending ones that crossed the bar
      status = CASE
        WHEN public.place_aliases.status = 'rejected' THEN 'rejected'
        WHEN public.place_aliases.source <> 'learned' THEN public.place_aliases.status
        WHEN EXCLUDED.sessions >= 5 THEN 'approved'
        ELSE public.place_aliases.status
      END
    RETURNING status
  )
  SELECT COUNT(*) FILTER (WHERE status = 'approved'), COUNT(*) FILTER (WHERE status = 'pending')
  INTO v_approved, v_pending
  FROM upserted;

  RETURN QUERY SELECT v_approved, v_pending, v_pop;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.learn_search_aliases() FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.learn_search_aliases() TO service_role;

-- Queries that found nothing (to spot missing aliases / listings).
CREATE OR REPLACE FUNCTION public.top_unmatched_searches(p_days INTEGER DEFAULT 30, p_limit INTEGER DEFAULT 50)
RETURNS TABLE (city TEXT, query TEXT, searches BIGINT)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT lower(city), regexp_replace(lower(trim(query)), '\s+', ' ', 'g') AS q, COUNT(*)
  FROM public.search_events
  WHERE result_count = 0
    AND clicked_slug IS NULL
    AND created_at > NOW() - make_interval(days => GREATEST(LEAST(p_days, 365), 1))
    AND char_length(trim(query)) BETWEEN 2 AND 60
  GROUP BY 1, 2
  ORDER BY 3 DESC
  LIMIT GREATEST(LEAST(p_limit, 200), 1);
$$;

REVOKE EXECUTE ON FUNCTION public.top_unmatched_searches(INTEGER, INTEGER) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.top_unmatched_searches(INTEGER, INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Seed: common Delhi abbreviations and alternate names students use.
--    Targets are matched by name against the city's localities/metros when
--    the search index is built; unknown targets are simply ignored.
-- ---------------------------------------------------------------------------

INSERT INTO public.place_aliases (place_type, canonical_name, alias_text, city, target_type, status, source, is_active)
VALUES
  ('locality', 'Old Rajinder Nagar', 'orn', 'delhi', 'locality', 'approved', 'seed', true),
  ('locality', 'Old Rajinder Nagar', 'rajinder nagar', 'delhi', 'locality', 'approved', 'seed', true),
  ('locality', 'Old Rajinder Nagar', 'rajendra nagar', 'delhi', 'locality', 'approved', 'seed', true),
  ('locality', 'New Rajinder Nagar', 'nrn', 'delhi', 'locality', 'approved', 'seed', true),
  ('locality', 'Mukherjee Nagar', 'mn', 'delhi', 'locality', 'approved', 'seed', true),
  ('locality', 'Mukherjee Nagar', 'du north campus', 'delhi', 'locality', 'approved', 'seed', true),
  ('locality', 'Mukherjee Nagar', 'north campus', 'delhi', 'locality', 'approved', 'seed', true),
  ('locality', 'Kamla Nagar', 'north campus', 'delhi', 'locality', 'approved', 'seed', true),
  ('locality', 'Laxmi Nagar', 'lakshmi nagar', 'delhi', 'locality', 'approved', 'seed', true),
  ('locality', 'Laxmi Nagar', 'luxmi nagar', 'delhi', 'locality', 'approved', 'seed', true),
  ('locality', 'Connaught Place', 'cp', 'delhi', 'locality', 'approved', 'seed', true),
  ('metro', 'Rajiv Chowk', 'cp', 'delhi', 'metro', 'approved', 'seed', true),
  ('metro', 'Rajiv Chowk', 'connaught place', 'delhi', 'metro', 'approved', 'seed', true),
  ('metro', 'GTB Nagar', 'guru tegh bahadur nagar', 'delhi', 'metro', 'approved', 'seed', true),
  ('locality', 'GTB Nagar', 'guru tegh bahadur nagar', 'delhi', 'locality', 'approved', 'seed', true),
  ('metro', 'Vishwavidyalaya', 'vishwa vidyalaya', 'delhi', 'metro', 'approved', 'seed', true),
  ('metro', 'Vishwavidyalaya', 'du metro', 'delhi', 'metro', 'approved', 'seed', true),
  ('locality', 'Karol Bagh', 'kb', 'delhi', 'locality', 'approved', 'seed', true),
  ('locality', 'Hauz Khas', 'iit delhi', 'delhi', 'locality', 'approved', 'seed', true),
  ('locality', 'Hauz Khas', 'hkv', 'delhi', 'locality', 'approved', 'seed', true),
  ('locality', 'Lajpat Nagar', 'lajpat', 'delhi', 'locality', 'approved', 'seed', true),
  ('locality', 'Janakpuri', 'janak puri', 'delhi', 'locality', 'approved', 'seed', true),
  ('locality', 'Dwarka', 'dwarka sec', 'delhi', 'locality', 'approved', 'seed', true),
  ('locality', 'Patel Nagar', 'west patel nagar', 'delhi', 'locality', 'approved', 'seed', true),
  ('locality', 'Shahdara', 'shahdra', 'delhi', 'locality', 'approved', 'seed', true),
  ('locality', 'Preet Vihar', 'pv', 'delhi', 'locality', 'approved', 'seed', true),
  ('locality', 'Mayur Vihar', 'mv', 'delhi', 'locality', 'approved', 'seed', true),
  ('locality', 'Uttam Nagar', 'un', 'delhi', 'locality', 'approved', 'seed', true)
ON CONFLICT DO NOTHING;
