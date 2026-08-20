-- ============================================================
-- PRODUÇÃO 17 — DIAGNÓSTICO / GARANTIAS PARA ADD-CLINIC-UNIT
-- ============================================================
-- INSTRUÇÕES:
-- 1. No Supabase: SQL Editor > New query.
-- 2. Cole TODO este arquivo e clique em Run.
-- 3. Depois publique a Edge Function:
--    npx supabase functions deploy add-clinic-unit
--
-- Garante colunas/RPC usados ao adicionar unidade e amplia
-- o CHECK de status da assinatura (pending, blocked, etc.).
-- ============================================================

BEGIN;

-- Organização (RPC usada pela function)
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

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS unit_name text,
  ADD COLUMN IF NOT EXISTS address_number text,
  ADD COLUMN IF NOT EXISTS neighborhood text;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS features_override jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS feature_grants jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS monthly_fee numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS setup_fee numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS billing_day integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS billing_defer_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_first_due_date date,
  ADD COLUMN IF NOT EXISTS admin_notes text;

-- Status da assinatura precisa aceitar 'pending' (usado na criação)
DO $$
DECLARE
  v_constraint record;
BEGIN
  FOR v_constraint IN
    SELECT DISTINCT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'public.subscriptions'::regclass
      AND c.contype = 'c'
      AND a.attname = 'status'
  LOOP
    EXECUTE format('ALTER TABLE public.subscriptions DROP CONSTRAINT %I', v_constraint.conname);
  END LOOP;

  ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN (
      'trial', 'pending', 'active', 'suspended',
      'blocked', 'cancelled', 'expired'
    ));
END $$;

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

COMMIT;

-- Verificação rápida:
-- SELECT proname FROM pg_proc WHERE proname = 'ensure_organization_for_owner';
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'subscriptions'
--     AND column_name IN ('features_override','billing_day','admin_notes');
