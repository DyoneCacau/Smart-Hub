-- Allow basic features to satisfy full feature checks (e.g., pacientes_basico => pacientes)
CREATE OR REPLACE FUNCTION public.user_has_feature(_user_id uuid, _feature text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE 
      WHEN public.is_superadmin(_user_id) THEN true
      WHEN _feature IN ('dashboard', 'configuracoes') THEN true
      ELSE (
        SELECT 
          CASE 
            WHEN s.status IN ('active', 'trial') AND 
                 (s.trial_ends_at IS NULL OR s.trial_ends_at > now()) THEN
              (
                COALESCE(p.features::jsonb ? _feature, false)
                OR (_feature = 'pacientes' AND COALESCE(p.features::jsonb ? 'pacientes_basico', false))
                OR (_feature = 'financeiro' AND COALESCE(p.features::jsonb ? 'financeiro_basico', false))
              )
            ELSE false
          END
        FROM public.clinic_users cu
        JOIN public.subscriptions s ON s.clinic_id = cu.clinic_id
        LEFT JOIN public.plans p ON p.id = s.plan_id
        WHERE cu.user_id = _user_id
        LIMIT 1
      )
    END
$$;
