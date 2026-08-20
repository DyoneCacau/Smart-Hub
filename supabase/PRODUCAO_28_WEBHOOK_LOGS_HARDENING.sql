-- ============================================================
-- PRODUÇÃO 28 — WEBHOOK_LOGS SEM PAYLOAD NO BROWSER
-- ============================================================
-- INSTRUÇÕES:
-- 1. Execute antes os scripts PRODUCAO_25, 26 e 27.
-- 2. Revise este arquivo antes de executar.
-- 3. No Supabase, abra SQL Editor > New query.
-- 4. Cole TODO o conteúdo deste arquivo e clique em Run.
-- 5. Confirme ao final que as consultas de verificação não retornam erro.
--
-- Este script NÃO é executado automaticamente pelo deploy da Vercel.
--
-- O que faz:
-- - Impede que `payload`, `headers` e `response` de `webhook_logs` cheguem
--   ao navegador via PostgREST (PII do lead / corpo bruto do provedor).
-- - A UI de Integrações continua vendo metadados (provedor, status, erro).
-- - Replay e processamento nas Edge Functions usam service_role e não
--   são afetados.
-- - Em `automation_logs`, `payload` e `result` também saem do SELECT do
--   cliente — a tela de logs só precisa de status/duração/erro.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. webhook_logs — metadados sim, corpo bruto não
-- ------------------------------------------------------------
REVOKE ALL PRIVILEGES ON public.webhook_logs FROM anon, authenticated;

GRANT SELECT (
  id,
  clinic_id,
  integration_id,
  direction,
  provider,
  event_type,
  http_method,
  endpoint,
  status,
  status_code,
  signature_valid,
  external_event_id,
  error_message,
  processed_at,
  created_at
) ON public.webhook_logs TO authenticated;

-- ------------------------------------------------------------
-- 2. automation_logs — sem payload/result no browser
-- ------------------------------------------------------------
REVOKE ALL PRIVILEGES ON public.automation_logs FROM anon, authenticated;

GRANT SELECT (
  id,
  clinic_id,
  flow_id,
  integration_id,
  status,
  trigger_type,
  steps_total,
  steps_completed,
  error_message,
  correlation_id,
  started_at,
  finished_at,
  duration_ms,
  created_at
) ON public.automation_logs TO authenticated;

COMMIT;

-- ============================================================
-- VERIFICAÇÃO (somente leitura)
-- ============================================================

-- 1. Colunas sensíveis NÃO podem aparecer no SELECT de authenticated:
SELECT table_name, column_name
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name IN ('webhook_logs', 'automation_logs')
  AND grantee = 'authenticated'
  AND privilege_type = 'SELECT'
  AND column_name IN ('payload', 'headers', 'response', 'result')
ORDER BY table_name, column_name;

-- 2. Metadados de webhook_logs legíveis (esperado: as colunas do GRANT):
SELECT column_name
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name = 'webhook_logs'
  AND grantee = 'authenticated'
  AND privilege_type = 'SELECT'
ORDER BY column_name;
