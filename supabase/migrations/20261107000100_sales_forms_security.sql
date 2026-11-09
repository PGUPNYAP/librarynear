-- Sales workflow, team stats, form robustness and review security.
-- Run after 20261107000000_production_readiness.sql. Idempotent.

-- ---------------------------------------------------------------------------
-- 1. Leads: fixed status values, notes, follow-up, admin handler, dedupe key
-- ---------------------------------------------------------------------------

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS handled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS phone_normalized TEXT;

UPDATE public.leads
SET status = 'new'
WHERE status IS NULL OR status NOT IN ('new', 'contacted', 'follow_up', 'converted', 'dead');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_status_check') THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_status_check
      CHECK (status IN ('new', 'contacted', 'follow_up', 'converted', 'dead'));
  END IF;
END $$;

ALTER TABLE public.leads ALTER COLUMN status SET DEFAULT 'new';

CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status_created ON public.leads (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_dedupe ON public.leads (library_branch_id, phone_normalized, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Staff invites (add staff before they have ever signed in)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.staff_invites (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('admin', 'sales')),
  is_approved BOOLEAN NOT NULL DEFAULT false,
  invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.staff_invites ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only the service role can read or write invites.

-- ---------------------------------------------------------------------------
-- 3. Activity stats for the team dashboard (aggregated in the database)
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_activity_logs_actor_created
  ON public.library_activity_logs (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created
  ON public.library_activity_logs (created_at DESC);

CREATE OR REPLACE FUNCTION public.staff_activity_summary(p_since TIMESTAMPTZ DEFAULT NULL)
RETURNS TABLE (actor_user_id UUID, total BIGINT, edits BIGINT, verifications BIGINT, last_action_at TIMESTAMPTZ)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT
    l.actor_user_id,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE l.action_type = 'library_updated') AS edits,
    COUNT(*) FILTER (WHERE l.action_type = 'verification_updated') AS verifications,
    MAX(l.created_at) AS last_action_at
  FROM public.library_activity_logs l
  WHERE l.actor_user_id IS NOT NULL
    AND (p_since IS NULL OR l.created_at >= p_since)
  GROUP BY l.actor_user_id;
$$;

CREATE OR REPLACE FUNCTION public.staff_activity_daily(p_user UUID DEFAULT NULL, p_days INTEGER DEFAULT 28)
RETURNS TABLE (day DATE, total BIGINT, edits BIGINT, verifications BIGINT)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH days AS (
    SELECT generate_series(
      (timezone('Asia/Kolkata', now()))::date - (GREATEST(LEAST(p_days, 366), 1) - 1),
      (timezone('Asia/Kolkata', now()))::date,
      interval '1 day'
    )::date AS day
  )
  SELECT
    d.day,
    COUNT(l.id) AS total,
    COUNT(l.id) FILTER (WHERE l.action_type = 'library_updated') AS edits,
    COUNT(l.id) FILTER (WHERE l.action_type = 'verification_updated') AS verifications
  FROM days d
  LEFT JOIN public.library_activity_logs l
    ON (timezone('Asia/Kolkata', l.created_at))::date = d.day
   AND l.actor_user_id IS NOT NULL
   AND (p_user IS NULL OR l.actor_user_id = p_user)
  GROUP BY d.day
  ORDER BY d.day;
$$;

REVOKE EXECUTE ON FUNCTION public.staff_activity_summary(TIMESTAMPTZ) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.staff_activity_daily(UUID, INTEGER) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_activity_summary(TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.staff_activity_daily(UUID, INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Assignment queue: localities, their library counts and assignees
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.locality_assignment_overview(p_city TEXT DEFAULT NULL)
RETURNS TABLE (
  locality_id UUID,
  city TEXT,
  name TEXT,
  library_count BIGINT,
  unverified_count BIGINT,
  assignee_count BIGINT
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT
    loc.id,
    loc.city,
    loc.name,
    COUNT(DISTINCT lb.id) AS library_count,
    COUNT(DISTINCT lb.id) FILTER (WHERE COALESCE(lb.verification_status, '') <> 'verified') AS unverified_count,
    (SELECT COUNT(*) FROM public.sales_locality_assignments sla WHERE sla.locality_id = loc.id) AS assignee_count
  FROM public.localities loc
  JOIN public.library_branches lb ON lb.locality_id = loc.id AND lb.is_active
  WHERE p_city IS NULL OR loc.city = p_city
  GROUP BY loc.id, loc.city, loc.name
  ORDER BY COUNT(DISTINCT lb.id) DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.locality_assignment_overview(TEXT) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.locality_assignment_overview(TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Save library fields and fee plans in ONE transaction.
--    Only keys present in p_fields change. p_plans NULL = plans untouched.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_library_with_plans(
  p_library_id UUID,
  p_fields JSONB,
  p_plans JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.library_branches;
BEGIN
  SELECT * INTO v_row FROM public.library_branches WHERE id = p_library_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'library % not found', p_library_id USING ERRCODE = 'P0002';
  END IF;

  v_row := jsonb_populate_record(v_row, p_fields);

  UPDATE public.library_branches SET
    display_name = v_row.display_name,
    locality = v_row.locality,
    city = v_row.city,
    district = v_row.district,
    state = v_row.state,
    pin_code = v_row.pin_code,
    full_address = v_row.full_address,
    nearest_metro = v_row.nearest_metro,
    nearest_metro_line = v_row.nearest_metro_line,
    nearest_metro_distance_km = v_row.nearest_metro_distance_km,
    latitude = v_row.latitude,
    longitude = v_row.longitude,
    opening_time = v_row.opening_time,
    closing_time = v_row.closing_time,
    phone_number = v_row.phone_number,
    whatsapp_number = v_row.whatsapp_number,
    description = v_row.description,
    amenities_text = v_row.amenities_text,
    map_link = v_row.map_link,
    total_seats = v_row.total_seats,
    last_sales_reviewed_at = v_row.last_sales_reviewed_at,
    last_sales_reviewer_id = v_row.last_sales_reviewer_id,
    last_owner_updated_at = v_row.last_owner_updated_at,
    updated_at = NOW()
  WHERE id = p_library_id;

  IF p_plans IS NOT NULL THEN
    PERFORM public.replace_library_fee_plans(p_library_id, p_plans);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_library_with_plans(UUID, JSONB, JSONB) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_library_with_plans(UUID, JSONB, JSONB) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Reviews: length limit, history instead of silent overwrite, and users
--    can no longer write reviews directly with the public key (which let
--    them un-hide a review that staff had hidden).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'library_reviews_text_length') THEN
    ALTER TABLE public.library_reviews
      ADD CONSTRAINT library_reviews_text_length
      CHECK (char_length(review_text) BETWEEN 1 AND 2000) NOT VALID;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.library_review_revisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  review_id UUID NOT NULL REFERENCES public.library_reviews(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL,
  review_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.library_review_revisions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.keep_review_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.review_text IS DISTINCT FROM NEW.review_text OR OLD.rating IS DISTINCT FROM NEW.rating THEN
    INSERT INTO public.library_review_revisions (review_id, rating, review_text, created_at)
    VALUES (OLD.id, OLD.rating, OLD.review_text, COALESCE(OLD.updated_at, OLD.created_at, NOW()));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_keep_review_revision ON public.library_reviews;
CREATE TRIGGER trg_keep_review_revision
BEFORE UPDATE ON public.library_reviews
FOR EACH ROW EXECUTE FUNCTION public.keep_review_revision();

DROP POLICY IF EXISTS "Users can insert their own reviews" ON public.library_reviews;
DROP POLICY IF EXISTS "Users can update their own reviews" ON public.library_reviews;

-- ---------------------------------------------------------------------------
-- 7. Owner submissions: ownership + duplicate tracking, upload cleanup
-- ---------------------------------------------------------------------------

ALTER TABLE public.owner_library_submissions
  ADD COLUMN IF NOT EXISTS ownership_status TEXT NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS possible_duplicate_of UUID REFERENCES public.library_branches(id) ON DELETE SET NULL;

ALTER TABLE public.library_branches
  ADD COLUMN IF NOT EXISTS ownership_status TEXT;

CREATE INDEX IF NOT EXISTS idx_library_branches_phone ON public.library_branches (phone_number);

CREATE TABLE IF NOT EXISTS public.pending_uploads (
  file_id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.pending_uploads ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_pending_uploads_created ON public.pending_uploads (created_at);
