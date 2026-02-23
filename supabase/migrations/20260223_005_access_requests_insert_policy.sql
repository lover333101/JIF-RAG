-- Add anon INSERT policy on access_requests so public forms work
-- even without the admin key (defense in depth).

DO $$
BEGIN
    IF to_regclass('public.access_requests') IS NOT NULL THEN
        -- Drop if exists to make migration idempotent
        EXECUTE 'DROP POLICY IF EXISTS access_requests_anon_insert ON public.access_requests';
        EXECUTE '
            CREATE POLICY access_requests_anon_insert
            ON public.access_requests
            FOR INSERT
            TO anon
            WITH CHECK (true)
        ';
    END IF;
END
$$;
