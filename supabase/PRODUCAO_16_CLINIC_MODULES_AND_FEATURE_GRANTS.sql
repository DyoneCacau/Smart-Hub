-- ============================================================
-- PRODUÇÃO 16 — MÓDULOS POR CLÍNICA + NORMALIZAÇÃO "BÁSICO"
-- ============================================================
-- INSTRUÇÕES:
-- 1. No Supabase: SQL Editor > New query.
-- 2. Cole TODO este arquivo e clique em Run.
-- 3. Confirme no final que feature_grants existe e user_has_feature
--    considera override / brindes.
--
-- O que este script faz:
-- - Garante coluna features_override (já usada na criação de cliente)
-- - Cria feature_grants (presente temporário por clínica)
-- - Normaliza planos/overrides: pacientes_basico → pacientes,
--   financeiro_basico → financeiro (+ contas_receber)
-- - Atualiza user_has_feature para olhar plano ∪ override ∪ brindes
-- - Permite origem "facebook" em crm_leads
-- Este script NÃO sobe com o deploy da Vercel.
-- ============================================================

BEGIN;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS features_override jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS feature_grants jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.subscriptions.features_override IS
  'Lista completa de módulos desta clínica quando customizada (não altera o plano global). Array vazio = usar features do plano.';

COMMENT ON COLUMN public.subscriptions.feature_grants IS
  'Brindes temporários: [{"feature":"crm","expires_at":"2026-08-24T23:59:59Z","note":"..."}]';

-- Normaliza features dos planos (remove *_basico)
UPDATE public.plans p
SET features = COALESCE((
  SELECT jsonb_agg(DISTINCT x.feat)
  FROM (
    SELECT CASE
      WHEN elem::text IN ('"pacientes_basico"', 'pacientes_basico') THEN '"pacientes"'::jsonb
      WHEN elem::text IN ('"financeiro_basico"', 'financeiro_basico') THEN '"financeiro"'::jsonb
      ELSE elem
    END AS feat
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(p.features) = 'array' THEN p.features
        ELSE '[]'::jsonb
      END
    ) AS elem
  ) x
), '[]'::jsonb)
WHERE p.features IS NOT NULL
  AND (
    p.features @> '["pacientes_basico"]'::jsonb
    OR p.features @> '["financeiro_basico"]'::jsonb
  );

-- Normaliza overrides existentes
UPDATE public.subscriptions s
SET features_override = COALESCE((
  SELECT jsonb_agg(DISTINCT x.feat)
  FROM (
    SELECT CASE
      WHEN elem::text IN ('"pacientes_basico"', 'pacientes_basico') THEN '"pacientes"'::jsonb
      WHEN elem::text IN ('"financeiro_basico"', 'financeiro_basico') THEN '"financeiro"'::jsonb
      ELSE elem
    END AS feat
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(s.features_override) = 'array' THEN s.features_override
        ELSE '[]'::jsonb
      END
    ) AS elem
  ) x
), '[]'::jsonb)
WHERE s.features_override IS NOT NULL
  AND jsonb_typeof(s.features_override) = 'array'
  AND (
    s.features_override @> '["pacientes_basico"]'::jsonb
    OR s.features_override @> '["financeiro_basico"]'::jsonb
  );

-- CRM: permitir facebook como origem
ALTER TABLE public.crm_leads DROP CONSTRAINT IF EXISTS crm_leads_lead_source_check;
ALTER TABLE public.crm_leads
  ADD CONSTRAINT crm_leads_lead_source_check
  CHECK (
    lead_source IS NULL
    OR lead_source IN ('instagram', 'whatsapp', 'facebook', 'referral', 'paid_traffic', 'other')
  );

-- Função: plano ∪ override ∪ brindes ativos (+ aliases legados)
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
      WHEN _feature IN ('dashboard', 'configuracoes', 'administracao') THEN true
      ELSE (
        SELECT
          CASE
            WHEN s.status IN ('active', 'trial', 'pending')
                 AND (s.trial_ends_at IS NULL OR s.trial_ends_at > now()) THEN
              (
                -- Override customizado da clínica (lista completa)
                (
                  jsonb_typeof(COALESCE(s.features_override, '[]'::jsonb)) = 'array'
                  AND jsonb_array_length(COALESCE(s.features_override, '[]'::jsonb)) > 0
                  AND (
                    s.features_override @> jsonb_build_array(_feature)
                    OR (_feature = 'pacientes' AND s.features_override @> '["pacientes_basico"]'::jsonb)
                    OR (_feature = 'financeiro' AND (
                      s.features_override @> '["financeiro_basico"]'::jsonb
                      OR s.features_override @> '["financeiro"]'::jsonb
                    ))
                    OR (_feature = 'contas_receber' AND (
                      s.features_override @> '["contas_receber"]'::jsonb
                      OR s.features_override @> '["financeiro"]'::jsonb
                      OR s.features_override @> '["financeiro_basico"]'::jsonb
                    ))
                  )
                )
                -- Ou features do plano (quando não há override)
                OR (
                  (
                    jsonb_typeof(COALESCE(s.features_override, '[]'::jsonb)) <> 'array'
                    OR jsonb_array_length(COALESCE(s.features_override, '[]'::jsonb)) = 0
                  )
                  AND (
                    COALESCE(p.features, '[]'::jsonb) @> jsonb_build_array(_feature)
                    OR (_feature = 'pacientes' AND COALESCE(p.features, '[]'::jsonb) @> '["pacientes_basico"]'::jsonb)
                    OR (_feature = 'financeiro' AND (
                      COALESCE(p.features, '[]'::jsonb) @> '["financeiro_basico"]'::jsonb
                      OR COALESCE(p.features, '[]'::jsonb) @> '["financeiro"]'::jsonb
                    ))
                    OR (_feature = 'contas_receber' AND (
                      COALESCE(p.features, '[]'::jsonb) @> '["contas_receber"]'::jsonb
                      OR COALESCE(p.features, '[]'::jsonb) @> '["financeiro"]'::jsonb
                      OR COALESCE(p.features, '[]'::jsonb) @> '["financeiro_basico"]'::jsonb
                    ))
                  )
                )
                -- Brindes / presentes temporários (sempre em cima)
                OR EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements(COALESCE(s.feature_grants, '[]'::jsonb)) AS g(elem)
                  WHERE (g.elem->>'feature') = _feature
                    AND (
                      NULLIF(g.elem->>'expires_at', '') IS NULL
                      OR (g.elem->>'expires_at')::timestamptz >= now()
                    )
                )
                OR (
                  _feature IN ('pacientes', 'financeiro', 'contas_receber')
                  AND EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(COALESCE(s.feature_grants, '[]'::jsonb)) AS g(elem)
                    WHERE (
                      (_feature = 'pacientes' AND (g.elem->>'feature') IN ('pacientes', 'pacientes_basico'))
                      OR (_feature = 'financeiro' AND (g.elem->>'feature') IN ('financeiro', 'financeiro_basico'))
                      OR (_feature = 'contas_receber' AND (g.elem->>'feature') IN ('contas_receber', 'financeiro', 'financeiro_basico'))
                    )
                    AND (
                      NULLIF(g.elem->>'expires_at', '') IS NULL
                      OR (g.elem->>'expires_at')::timestamptz >= now()
                    )
                  )
                )
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

COMMIT;

-- Verificação rápida (rode à parte se quiser):
-- SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='subscriptions'
--     AND column_name IN ('features_override','feature_grants');
-- SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint WHERE conrelid = 'public.crm_leads'::regclass AND conname LIKE '%lead_source%';
