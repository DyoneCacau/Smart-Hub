-- ============================================================
-- PRODUÇÃO 29 — CONEXÃO META (FACEBOOK + INSTAGRAM)
-- ============================================================
-- INSTRUÇÕES:
-- 1. Execute antes: PRODUCAO_25, 26, 27 e 28 (módulo Integrações).
-- 2. Revise este arquivo antes de executar.
-- 3. No Supabase, abra SQL Editor > New query.
-- 4. Cole TODO o conteúdo e clique em Run.
-- 5. Confirme as consultas de verificação no final.
--
-- Este script NÃO sobe com o deploy da Vercel.
--
-- O que faz:
-- - Libera o provedor `meta` em `integrations` (hub OAuth Facebook/Instagram).
-- - Cria `integration_credentials`: tokens só acessíveis ao service_role
--   (nunca via PostgREST / browser). `integrations.credentials_ref` aponta
--   para o id desta tabela.
-- - Cria `integration_oauth_states`: CSRF/state do OAuth, só service_role.
-- - Cria `integration_connection_logs`: auditoria de conectar/desconectar
--   (sem tokens), legível pela clínica com permissão `integracoes`.
--
-- NÃO implementa Lead Ads, Graph de leads, WhatsApp nem mensagens.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Provedor `meta` no CHECK de integrations.provider
-- ------------------------------------------------------------
ALTER TABLE public.integrations DROP CONSTRAINT IF EXISTS integrations_provider_check;
ALTER TABLE public.integrations
  ADD CONSTRAINT integrations_provider_check
  CHECK (provider IN (
    'meta',
    'facebook_lead_ads',
    'instagram_lead_ads',
    'whatsapp_business',
    'landing_page',
    'webhook',
    'external_api',
    'n8n',
    'make',
    'zapier'
  ));

COMMENT ON COLUMN public.integrations.credentials_ref IS
  'Id da linha em integration_credentials (UUID). Nunca contém o token em si.';

-- ------------------------------------------------------------
-- 2. Credenciais (service_role only)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.integration_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL UNIQUE REFERENCES public.integrations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  access_token text NOT NULL,
  token_type text NOT NULL DEFAULT 'bearer',
  expires_at timestamptz,
  scopes text[] NOT NULL DEFAULT '{}'::text[],
  meta_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_credentials_clinic
  ON public.integration_credentials (clinic_id);

DROP TRIGGER IF EXISTS integration_credentials_updated_at ON public.integration_credentials;
CREATE TRIGGER integration_credentials_updated_at
  BEFORE UPDATE ON public.integration_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON public.integration_credentials FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.integration_credentials IS
  'Tokens de integração por clínica. Somente Edge Functions (service_role).';

-- ------------------------------------------------------------
-- 3. Estados OAuth (service_role only)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.integration_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  nonce text NOT NULL UNIQUE,
  integration_id uuid REFERENCES public.integrations(id) ON DELETE CASCADE,
  redirect_path text NOT NULL DEFAULT '/integracoes',
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_oauth_states_nonce
  ON public.integration_oauth_states (nonce)
  WHERE consumed_at IS NULL;

ALTER TABLE public.integration_oauth_states ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON public.integration_oauth_states FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.integration_oauth_states IS
  'Nonce/state do OAuth. Uso único, TTL curto, só service_role.';

-- ------------------------------------------------------------
-- 4. Logs de conexão (metadados, sem segredos)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.integration_connection_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES public.integrations(id) ON DELETE SET NULL,
  provider text NOT NULL,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'info'
    CHECK (status IN ('info', 'success', 'warning', 'error')),
  message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_connection_logs_clinic
  ON public.integration_connection_logs (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_integration_connection_logs_integration
  ON public.integration_connection_logs (integration_id, created_at DESC);

ALTER TABLE public.integration_connection_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinic members can view connection logs"
  ON public.integration_connection_logs;
CREATE POLICY "Clinic members can view connection logs"
  ON public.integration_connection_logs
  FOR SELECT
  USING (public.user_can_clinic_action(clinic_id, 'integracoes', 'can_view'));

DROP POLICY IF EXISTS "Superadmins manage connection logs"
  ON public.integration_connection_logs;
CREATE POLICY "Superadmins manage connection logs"
  ON public.integration_connection_logs
  FOR ALL
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- Escrita pelo app não é necessária: Edge Functions usam service_role.
REVOKE INSERT, UPDATE, DELETE ON public.integration_connection_logs FROM authenticated;
GRANT SELECT ON public.integration_connection_logs TO authenticated;

COMMIT;

-- ============================================================
-- VERIFICAÇÃO (somente leitura)
-- ============================================================

SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.integrations'::regclass
  AND conname = 'integrations_provider_check';

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'integration_credentials',
    'integration_oauth_states',
    'integration_connection_logs'
  )
ORDER BY tablename;

-- Credenciais e OAuth NÃO devem ter privilégio para authenticated:
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee = 'authenticated'
  AND table_name IN ('integration_credentials', 'integration_oauth_states')
ORDER BY table_name, privilege_type;
