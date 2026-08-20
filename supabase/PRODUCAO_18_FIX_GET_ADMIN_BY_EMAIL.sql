-- ============================================================
-- PRODUÇÃO 18 — get_admin_by_email aceita service_role
-- ============================================================
-- INSTRUÇÕES:
-- 1. No Supabase: SQL Editor > New query.
-- 2. Cole TODO este arquivo e clique em Run.
--
-- A Edge Function add-clinic-unit usa service_role; a RPC antiga
-- só liberava is_superadmin(auth.uid()), gerando "Acesso negado".
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_admin_by_email(p_email text)
RETURNS TABLE (user_id uuid, name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Superadmin autenticado OU chamadas internas (Edge Functions com service_role)
  IF NOT (
    public.is_superadmin(auth.uid())
    OR COALESCE(auth.role(), '') = 'service_role'
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  SELECT p.user_id, COALESCE(p.name, 'Admin')::text
  FROM public.profiles p
  WHERE LOWER(TRIM(p.email)) = LOWER(TRIM(p_email))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT u.id as user_id,
           COALESCE(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1))::text as name
    FROM auth.users u
    WHERE LOWER(TRIM(u.email)) = LOWER(TRIM(p_email))
    LIMIT 1;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_by_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_by_email(text) TO service_role;

COMMIT;
