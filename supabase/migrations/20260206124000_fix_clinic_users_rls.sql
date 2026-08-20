-- Helper to avoid recursive RLS on clinic_users
CREATE OR REPLACE FUNCTION public.is_clinic_member(_user_id uuid, _clinic_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clinic_users
    WHERE user_id = _user_id
      AND clinic_id = _clinic_id
  )
$$;

-- Replace recursive policies on clinic_users
DROP POLICY IF EXISTS "Users can view their clinic members" ON public.clinic_users;
DROP POLICY IF EXISTS "Clinic admins can manage their clinic_users" ON public.clinic_users;

CREATE POLICY "Clinic members can view clinic_users" ON public.clinic_users
  FOR SELECT USING (public.is_clinic_member(auth.uid(), clinic_id));

CREATE POLICY "Clinic admins can manage clinic_users" ON public.clinic_users
  FOR ALL USING (
    public.is_admin(auth.uid()) AND public.is_clinic_member(auth.uid(), clinic_id)
  );
