-- =============================================================================
-- Função: retornar todas as clínicas do mesmo dono das clínicas do usuário
-- Usa clinic_users.is_owner (não depende de clinics.owner_user_id).
-- Executar no SQL Editor do painel Supabase.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_clinics_of_same_owner(p_user_id uuid DEFAULT auth.uid())
RETURNS SETOF public.clinics
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Donos das clínicas em que o usuário está
  WITH donos_das_minhas_clinicas AS (
    SELECT cu.user_id AS owner_id
    FROM public.clinic_users cu
    WHERE cu.clinic_id IN (
      SELECT clinic_id FROM public.clinic_users WHERE user_id = p_user_id
    )
    AND cu.is_owner = true
  ),
  -- Todas as clínicas em que esses donos são donos
  ids_clinicas_mesmo_dono AS (
    SELECT cu2.clinic_id
    FROM public.clinic_users cu2
    WHERE cu2.is_owner = true
      AND cu2.user_id IN (SELECT owner_id FROM donos_das_minhas_clinicas)
  )
  SELECT c.*
  FROM public.clinics c
  WHERE c.is_active = true
    AND c.id IN (SELECT clinic_id FROM ids_clinicas_mesmo_dono)
  ORDER BY c.name;
$$;

COMMENT ON FUNCTION public.get_clinics_of_same_owner(uuid) IS
  'Retorna clínicas em que os donos (clinic_users.is_owner) das clínicas do usuário também são donos. Usado na Agenda com permissão "Agenda - todas as clínicas".';
