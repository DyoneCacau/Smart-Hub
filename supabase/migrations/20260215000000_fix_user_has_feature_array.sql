-- plans.features é um array JSON (ex: ["agenda", "pacientes"]), não um objeto.
-- O operador ? verifica chaves de objeto; para array usar @> (containment).
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
                (p.features @> jsonb_build_array(_feature))
                OR (_feature = 'pacientes' AND (p.features @> jsonb_build_array('pacientes_basico')))
                OR (_feature = 'financeiro' AND (p.features @> jsonb_build_array('financeiro_basico')))
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
