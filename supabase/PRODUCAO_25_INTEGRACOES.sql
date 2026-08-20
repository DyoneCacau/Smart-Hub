-- ============================================================
-- PRODUÇÃO 25 — MÓDULO DE INTEGRAÇÕES (INFRAESTRUTURA)
-- ============================================================
-- INSTRUÇÕES:
-- 1. Revise este arquivo antes de executar.
-- 2. No Supabase, abra SQL Editor > New query.
-- 3. Cole TODO o conteúdo deste arquivo e clique em Run.
-- 4. Confirme ao final que a consulta de verificação não retorna erro.
--
-- Este script NÃO é executado automaticamente pelo deploy da Vercel.
--
-- O que faz:
-- - Cria a base multi-tenant para futuras integrações (nenhuma integração
--   é implementada aqui: apenas a arquitetura)
-- - Tabelas: integrations, automation_flows, automation_logs,
--   webhook_logs, api_tokens
-- - Todas isoladas por clinic_id (o tenant do HealthCare) com RLS
-- - Nunca guarda segredo em texto puro: apenas hash e referência de secret
-- - Cria a permissão granular "integracoes"
--
-- IMPORTANTE — SOBRE tenant_id:
-- No HealthCare o tenant é a clínica/unidade (coluna clinic_id, FK para
-- public.clinics). organization_id agrupa unidades do mesmo dono e NÃO é
-- usado para isolamento. Para manter uma única convenção no banco, este
-- módulo usa clinic_id como tenant_id.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. integrations — uma conexão por clínica e por provedor
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN (
    'facebook_lead_ads',
    'instagram_lead_ads',
    'whatsapp_business',
    'landing_page',
    'webhook',
    'external_api',
    'n8n',
    'make',
    'zapier'
  )),
  category text NOT NULL CHECK (category IN ('ads', 'messaging', 'forms', 'automation', 'api')),
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('disconnected', 'connected', 'paused', 'error')),
  direction text NOT NULL DEFAULT 'inbound'
    CHECK (direction IN ('inbound', 'outbound', 'bidirectional')),
  -- Configuração NÃO sensível (ids de formulário, mapeamento de campos, etc.)
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Ponteiro para o secret guardado fora do banco (Supabase secrets / Vault).
  -- NUNCA gravar token, api key ou senha aqui.
  credentials_ref text,
  external_account_id text,
  -- Endpoint público de entrada: /functions/v1/integrations-webhook/<slug>
  webhook_slug text UNIQUE,
  webhook_secret_hash text,
  last_event_at timestamptz,
  last_error text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, provider, name)
);

CREATE INDEX IF NOT EXISTS idx_integrations_clinic ON public.integrations (clinic_id);
CREATE INDEX IF NOT EXISTS idx_integrations_clinic_provider ON public.integrations (clinic_id, provider);
CREATE INDEX IF NOT EXISTS idx_integrations_status ON public.integrations (clinic_id, status);

DROP TRIGGER IF EXISTS integrations_updated_at ON public.integrations;
CREATE TRIGGER integrations_updated_at
  BEFORE UPDATE ON public.integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------
-- 2. automation_flows — gatilho + ações (n8n / Make / Zapier / interno)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.automation_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES public.integrations(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  trigger_type text NOT NULL CHECK (trigger_type IN (
    'lead_received',
    'message_received',
    'form_submitted',
    'appointment_created',
    'appointment_completed',
    'appointment_cancelled',
    'payment_confirmed',
    'schedule',
    'webhook',
    'manual'
  )),
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Lista ordenada de passos: [{ "type": "...", "config": { ... } }]
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  version integer NOT NULL DEFAULT 1,
  last_run_at timestamptz,
  run_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, name)
);

CREATE INDEX IF NOT EXISTS idx_automation_flows_clinic ON public.automation_flows (clinic_id);
CREATE INDEX IF NOT EXISTS idx_automation_flows_integration ON public.automation_flows (integration_id);
CREATE INDEX IF NOT EXISTS idx_automation_flows_trigger
  ON public.automation_flows (clinic_id, trigger_type, status);

DROP TRIGGER IF EXISTS automation_flows_updated_at ON public.automation_flows;
CREATE TRIGGER automation_flows_updated_at
  BEFORE UPDATE ON public.automation_flows
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------
-- 3. automation_logs — execuções de fluxo (append-only)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.automation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  flow_id uuid REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES public.integrations(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'success', 'failed', 'skipped')),
  trigger_type text,
  steps_total integer NOT NULL DEFAULT 0,
  steps_completed integer NOT NULL DEFAULT 0,
  payload jsonb,
  result jsonb,
  error_message text,
  -- Rastreio ponta a ponta / idempotência entre webhook e execução
  correlation_id text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_logs_clinic_created
  ON public.automation_logs (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_logs_flow ON public.automation_logs (flow_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_correlation
  ON public.automation_logs (clinic_id, correlation_id);

-- ------------------------------------------------------------
-- 4. webhook_logs — entradas e saídas de webhook (auditoria e replay)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES public.integrations(id) ON DELETE SET NULL,
  direction text NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
  provider text,
  event_type text,
  http_method text,
  endpoint text,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processed', 'failed', 'ignored', 'duplicate')),
  status_code integer,
  signature_valid boolean,
  -- Cabeçalhos já sanitizados (sem Authorization / tokens)
  headers jsonb,
  payload jsonb,
  response jsonb,
  -- Id do evento no provedor: base da idempotência
  external_event_id text,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_clinic_created
  ON public.webhook_logs (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_integration ON public.webhook_logs (integration_id);

-- Idempotência: o mesmo evento do provedor não entra duas vezes no tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_logs_external_event
  ON public.webhook_logs (clinic_id, provider, external_event_id)
  WHERE external_event_id IS NOT NULL;

-- ------------------------------------------------------------
-- 5. api_tokens — credenciais para APIs externas consumirem o tenant
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  -- Prefixo visível na UI (ex.: "hc_live_ab12"). O token completo é
  -- mostrado uma única vez na criação e nunca persistido.
  token_prefix text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  expires_at timestamptz,
  last_used_at timestamptz,
  last_used_ip text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, name)
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_clinic ON public.api_tokens (clinic_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_status ON public.api_tokens (clinic_id, status);

DROP TRIGGER IF EXISTS api_tokens_updated_at ON public.api_tokens;
CREATE TRIGGER api_tokens_updated_at
  BEFORE UPDATE ON public.api_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RLS — isolamento por tenant (clinic_id). Nenhum dado cruza clínicas.
-- ============================================================

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;

-- ---------- integrations ----------
DROP POLICY IF EXISTS "Clinic members can view integrations" ON public.integrations;
CREATE POLICY "Clinic members can view integrations"
  ON public.integrations
  FOR SELECT
  TO authenticated
  USING (
    clinic_id IN (SELECT cu.clinic_id FROM public.clinic_users cu WHERE cu.user_id = auth.uid())
    OR public.is_superadmin(auth.uid())
  );

DROP POLICY IF EXISTS "Clinic members can insert integrations" ON public.integrations;
CREATE POLICY "Clinic members can insert integrations"
  ON public.integrations
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_can_clinic_action(clinic_id, 'integracoes', 'can_create'));

DROP POLICY IF EXISTS "Clinic members can update integrations" ON public.integrations;
CREATE POLICY "Clinic members can update integrations"
  ON public.integrations
  FOR UPDATE
  TO authenticated
  USING (public.user_can_clinic_action(clinic_id, 'integracoes', 'can_edit'))
  WITH CHECK (public.user_can_clinic_action(clinic_id, 'integracoes', 'can_edit'));

DROP POLICY IF EXISTS "Clinic members can delete integrations" ON public.integrations;
CREATE POLICY "Clinic members can delete integrations"
  ON public.integrations
  FOR DELETE
  TO authenticated
  USING (public.user_can_clinic_action(clinic_id, 'integracoes', 'can_delete'));

-- ---------- automation_flows ----------
DROP POLICY IF EXISTS "Clinic members can view automation flows" ON public.automation_flows;
CREATE POLICY "Clinic members can view automation flows"
  ON public.automation_flows
  FOR SELECT
  TO authenticated
  USING (
    clinic_id IN (SELECT cu.clinic_id FROM public.clinic_users cu WHERE cu.user_id = auth.uid())
    OR public.is_superadmin(auth.uid())
  );

DROP POLICY IF EXISTS "Clinic members can insert automation flows" ON public.automation_flows;
CREATE POLICY "Clinic members can insert automation flows"
  ON public.automation_flows
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_can_clinic_action(clinic_id, 'integracoes', 'can_create'));

DROP POLICY IF EXISTS "Clinic members can update automation flows" ON public.automation_flows;
CREATE POLICY "Clinic members can update automation flows"
  ON public.automation_flows
  FOR UPDATE
  TO authenticated
  USING (public.user_can_clinic_action(clinic_id, 'integracoes', 'can_edit'))
  WITH CHECK (public.user_can_clinic_action(clinic_id, 'integracoes', 'can_edit'));

DROP POLICY IF EXISTS "Clinic members can delete automation flows" ON public.automation_flows;
CREATE POLICY "Clinic members can delete automation flows"
  ON public.automation_flows
  FOR DELETE
  TO authenticated
  USING (public.user_can_clinic_action(clinic_id, 'integracoes', 'can_delete'));

-- ---------- automation_logs (leitura no app; escrita só service_role) ----------
DROP POLICY IF EXISTS "Clinic members can view automation logs" ON public.automation_logs;
CREATE POLICY "Clinic members can view automation logs"
  ON public.automation_logs
  FOR SELECT
  TO authenticated
  USING (
    clinic_id IN (SELECT cu.clinic_id FROM public.clinic_users cu WHERE cu.user_id = auth.uid())
    OR public.is_superadmin(auth.uid())
  );

DROP POLICY IF EXISTS "Superadmins manage automation logs" ON public.automation_logs;
CREATE POLICY "Superadmins manage automation logs"
  ON public.automation_logs
  FOR ALL
  TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- ---------- webhook_logs (leitura no app; escrita só service_role) ----------
DROP POLICY IF EXISTS "Clinic members can view webhook logs" ON public.webhook_logs;
CREATE POLICY "Clinic members can view webhook logs"
  ON public.webhook_logs
  FOR SELECT
  TO authenticated
  USING (
    clinic_id IN (SELECT cu.clinic_id FROM public.clinic_users cu WHERE cu.user_id = auth.uid())
    OR public.is_superadmin(auth.uid())
  );

DROP POLICY IF EXISTS "Superadmins manage webhook logs" ON public.webhook_logs;
CREATE POLICY "Superadmins manage webhook logs"
  ON public.webhook_logs
  FOR ALL
  TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- ---------- api_tokens ----------
-- Somente quem administra integrações lê os metadados do token.
-- O token em si nunca fica no banco (apenas hash + prefixo).
DROP POLICY IF EXISTS "Clinic admins can view api tokens" ON public.api_tokens;
CREATE POLICY "Clinic admins can view api tokens"
  ON public.api_tokens
  FOR SELECT
  TO authenticated
  USING (public.user_can_clinic_action(clinic_id, 'integracoes', 'can_view'));

DROP POLICY IF EXISTS "Clinic admins can insert api tokens" ON public.api_tokens;
CREATE POLICY "Clinic admins can insert api tokens"
  ON public.api_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_can_clinic_action(clinic_id, 'integracoes', 'can_create'));

DROP POLICY IF EXISTS "Clinic admins can update api tokens" ON public.api_tokens;
CREATE POLICY "Clinic admins can update api tokens"
  ON public.api_tokens
  FOR UPDATE
  TO authenticated
  USING (public.user_can_clinic_action(clinic_id, 'integracoes', 'can_edit'))
  WITH CHECK (public.user_can_clinic_action(clinic_id, 'integracoes', 'can_edit'));

DROP POLICY IF EXISTS "Clinic admins can delete api tokens" ON public.api_tokens;
CREATE POLICY "Clinic admins can delete api tokens"
  ON public.api_tokens
  FOR DELETE
  TO authenticated
  USING (public.user_can_clinic_action(clinic_id, 'integracoes', 'can_delete'));

-- ============================================================
-- Permissão granular do módulo
-- ============================================================
-- Só admin gerencia integrações por padrão; os demais nem enxergam.
INSERT INTO public.clinic_role_permissions (clinic_id, role, feature, can_view, can_create, can_edit, can_delete)
SELECT
  c.id,
  r.role,
  'integracoes',
  CASE WHEN r.role = 'admin' THEN true ELSE false END,
  CASE WHEN r.role = 'admin' THEN true ELSE false END,
  CASE WHEN r.role = 'admin' THEN true ELSE false END,
  CASE WHEN r.role = 'admin' THEN true ELSE false END
FROM public.clinics c
CROSS JOIN (VALUES ('admin'), ('receptionist'), ('seller'), ('professional')) AS r(role)
ON CONFLICT (clinic_id, role, feature) DO NOTHING;

COMMIT;

-- VERIFICAÇÃO (somente leitura):
SELECT 'integrations' AS tabela, count(*)::int AS colunas
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'integrations'
UNION ALL
SELECT 'automation_flows', count(*)::int
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'automation_flows'
UNION ALL
SELECT 'automation_logs', count(*)::int
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'automation_logs'
UNION ALL
SELECT 'webhook_logs', count(*)::int
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'webhook_logs'
UNION ALL
SELECT 'api_tokens', count(*)::int
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'api_tokens';

-- RLS ativa nas 5 tabelas (deve retornar rowsecurity = true em todas):
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('integrations', 'automation_flows', 'automation_logs', 'webhook_logs', 'api_tokens')
ORDER BY tablename;
