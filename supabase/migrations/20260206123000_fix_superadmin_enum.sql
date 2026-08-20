-- Ensure superadmin role exists in enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'superadmin';

-- Make superadmin check robust even if enum changes
CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text = 'superadmin'
  )
$$;
