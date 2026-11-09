-- Production readiness: scale, sales workflow, form robustness, security.
-- Idempotent: safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Aggregates so pages never scan whole tables (PostgREST caps at 1000 rows)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.city_library_counts()
RETURNS TABLE (city TEXT, state TEXT, library_count BIGINT)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT lb.city, MAX(lb.state) AS state, COUNT(*) AS library_count
  FROM public.library_branches lb
  WHERE lb.is_active
  GROUP BY lb.city
  ORDER BY COUNT(*) DESC;
$$;

CREATE OR REPLACE FUNCTION public.city_locality_counts(p_city TEXT)
RETURNS TABLE (locality TEXT, library_count BIGINT)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT TRIM(lb.locality) AS locality, COUNT(*) AS library_count
  FROM public.library_branches lb
  WHERE lb.is_active
    AND lb.city = p_city
    AND lb.locality IS NOT NULL
    AND length(TRIM(lb.locality)) > 0
  GROUP BY TRIM(lb.locality)
  ORDER BY COUNT(*) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.city_library_counts() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.city_locality_counts(TEXT) TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_library_branches_city_active
  ON public.library_branches (city) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_library_branches_city_locality_active
  ON public.library_branches (city, locality) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_library_branches_score
  ON public.library_branches (profile_completeness_score DESC NULLS LAST) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_library_branches_updated_at
  ON public.library_branches (updated_at DESC);

-- ---------------------------------------------------------------------------
-- 2. locality_id is always derived from (city, locality) by the database, so
--    owner approvals, staff edits and imports can never leave it stale.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_library_locality_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT := NULLIF(TRIM(NEW.locality), '');
  v_city TEXT := NULLIF(TRIM(NEW.city), '');
  v_id UUID;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.city IS NOT DISTINCT FROM OLD.city
     AND NEW.locality IS NOT DISTINCT FROM OLD.locality
     AND NEW.locality_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF v_name IS NULL OR v_city IS NULL THEN
    NEW.locality_id := NULL;
    RETURN NEW;
  END IF;

  INSERT INTO public.localities (city, name, slug)
  VALUES (v_city, v_name, regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'))
  ON CONFLICT (city, name) DO NOTHING;

  SELECT id INTO v_id FROM public.localities WHERE city = v_city AND name = v_name;
  NEW.locality_id := v_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_library_locality_id ON public.library_branches;
CREATE TRIGGER trg_sync_library_locality_id
BEFORE INSERT OR UPDATE OF city, locality, locality_id ON public.library_branches
FOR EACH ROW EXECUTE FUNCTION public.sync_library_locality_id();

-- Backfill every library that has a locality but no locality_id.
INSERT INTO public.localities (city, name, slug)
SELECT DISTINCT TRIM(city), TRIM(locality), regexp_replace(lower(TRIM(locality)), '[^a-z0-9]+', '-', 'g')
FROM public.library_branches
WHERE locality IS NOT NULL AND length(TRIM(locality)) > 0 AND city IS NOT NULL
ON CONFLICT (city, name) DO NOTHING;

UPDATE public.library_branches lb
SET locality_id = loc.id
FROM public.localities loc
WHERE loc.city = TRIM(lb.city)
  AND loc.name = TRIM(lb.locality)
  AND lb.locality_id IS DISTINCT FROM loc.id;

-- ---------------------------------------------------------------------------
-- 3. Security: fee plans can only be replaced by the server (service role).
--    Previously any signed-in user could call this SECURITY DEFINER function.
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.replace_library_fee_plans(UUID, JSONB) FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_library_fee_plans(UUID, JSONB) TO service_role;
