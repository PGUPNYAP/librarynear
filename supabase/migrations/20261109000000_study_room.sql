-- Free online study room: anonymous weekly study minutes per locality.
-- No people are stored, only totals per area.

CREATE TABLE IF NOT EXISTS public.study_locality_weekly (
  week_start DATE NOT NULL,
  city TEXT NOT NULL,
  locality TEXT NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 0 CHECK (minutes >= 0),
  sessions INTEGER NOT NULL DEFAULT 0 CHECK (sessions >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (week_start, city, locality)
);

CREATE INDEX IF NOT EXISTS idx_study_locality_weekly_rank
  ON public.study_locality_weekly (week_start, minutes DESC);

-- Written and read by the server only.
ALTER TABLE public.study_locality_weekly ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.record_study_minutes(p_city TEXT, p_locality TEXT, p_minutes INTEGER)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.study_locality_weekly (week_start, city, locality, minutes, sessions)
  VALUES (date_trunc('week', (NOW() AT TIME ZONE 'Asia/Kolkata'))::date, p_city, p_locality, LEAST(GREATEST(p_minutes, 0), 180), 1)
  ON CONFLICT (week_start, city, locality) DO UPDATE
    SET minutes = public.study_locality_weekly.minutes + EXCLUDED.minutes,
        sessions = public.study_locality_weekly.sessions + 1,
        updated_at = NOW();
$$;

REVOKE EXECUTE ON FUNCTION public.record_study_minutes(TEXT, TEXT, INTEGER) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_study_minutes(TEXT, TEXT, INTEGER) TO service_role;
