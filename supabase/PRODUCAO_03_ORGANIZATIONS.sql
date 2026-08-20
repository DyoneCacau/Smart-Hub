-- ============================================================================
-- PRODUÇÃO 03 — ORGANIZAÇÕES / GRUPOS DE UNIDADES (EXECUÇÃO MANUAL)
-- ============================================================================
-- INSTRUÇÕES:
-- 1. Faça backup antes de executar.
-- 2. No painel do Supabase, abra SQL Editor > New query.
-- 3. Cole TODO o conteúdo e execute uma única vez.
-- 4. O script é idempotente.
-- 5. Depois publique as Edge Functions create-complete-client e add-clinic-unit.
--
-- MODELO:
-- - 1 banco único (já existente)
-- - 1 organization por dono (owner_user_id)
-- - N clínicas/unidades por organization
-- - 1 assinatura/cobrança Asaas por clínica
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS organizations_owner_user_id_uidx
  ON public.organizations (owner_user_id);

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id);

CREATE INDEX IF NOT EXISTS clinics_organization_id_idx
  ON public.clinics (organization_id);

-- Backfill: cria uma organização por dono existente e vincula as clínicas.
INSERT INTO public.organizations (name, owner_user_id)
SELECT DISTINCT
  COALESCE(NULLIF(TRIM(c.name), ''), 'Grupo') || ' — Grupo',
  c.owner_user_id
FROM public.clinics c
WHERE c.owner_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.owner_user_id = c.owner_user_id
  );

UPDATE public.clinics c
SET organization_id = o.id,
    updated_at = now()
FROM public.organizations o
WHERE c.owner_user_id = o.owner_user_id
  AND c.organization_id IS NULL;

-- Também vincula clínicas só ligadas via clinic_users.is_owner.
INSERT INTO public.organizations (name, owner_user_id)
SELECT DISTINCT
  COALESCE(NULLIF(TRIM(c.name), ''), 'Grupo') || ' — Grupo',
  cu.user_id
FROM public.clinic_users cu
JOIN public.clinics c ON c.id = cu.clinic_id
WHERE cu.is_owner = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.owner_user_id = cu.user_id
  );

UPDATE public.clinics c
SET organization_id = o.id,
    owner_user_id = COALESCE(c.owner_user_id, o.owner_user_id),
    updated_at = now()
FROM public.clinic_users cu
JOIN public.organizations o ON o.owner_user_id = cu.user_id
WHERE cu.clinic_id = c.id
  AND cu.is_owner = true
  AND c.organization_id IS NULL;

CREATE OR REPLACE FUNCTION public.ensure_organization_for_owner(
  p_owner_user_id uuid,
  p_name text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_name text;
BEGIN
  IF p_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'owner_required';
  END IF;

  SELECT id INTO v_org_id
  FROM public.organizations
  WHERE owner_user_id = p_owner_user_id;

  IF v_org_id IS NOT NULL THEN
    RETURN v_org_id;
  END IF;

  v_name := COALESCE(NULLIF(TRIM(p_name), ''), 'Grupo do cliente');

  INSERT INTO public.organizations (name, owner_user_id)
  VALUES (v_name, p_owner_user_id)
  RETURNING id INTO v_org_id;

  RETURN v_org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_organization_for_owner(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_organization_for_owner(uuid, text)
  TO service_role;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmins manage organizations" ON public.organizations;
CREATE POLICY "Superadmins manage organizations"
  ON public.organizations
  FOR ALL
  TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Owners view own organization" ON public.organizations;
CREATE POLICY "Owners view own organization"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Service role manages organizations" ON public.organizations;
CREATE POLICY "Service role manages organizations"
  ON public.organizations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;

COMMIT;
