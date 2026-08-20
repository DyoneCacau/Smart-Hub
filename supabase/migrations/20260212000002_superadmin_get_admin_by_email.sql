-- RPC para superadmin buscar admin por email (bypassa RLS em profiles)
CREATE OR REPLACE FUNCTION public.get_admin_by_email(p_email text)
RETURNS TABLE (user_id uuid, name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  RETURN QUERY
  SELECT p.user_id, COALESCE(p.name, 'Admin')::text
  FROM public.profiles p
  WHERE LOWER(TRIM(p.email)) = LOWER(TRIM(p_email))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT u.id as user_id, COALESCE(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1))::text as name
    FROM auth.users u
    WHERE LOWER(TRIM(u.email)) = LOWER(TRIM(p_email))
    LIMIT 1;
  END IF;
END;
$$;
