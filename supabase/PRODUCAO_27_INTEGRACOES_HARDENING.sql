-- ============================================================
-- PRODUÇÃO 27 — HARDENING DO MÓDULO DE INTEGRAÇÕES
-- ============================================================
-- INSTRUÇÕES:
-- 1. Execute PRIMEIRO o PRODUCAO_25_INTEGRACOES.sql e o
--    PRODUCAO_26_LEADS_API.sql.
-- 2. Revise este arquivo antes de executar.
-- 3. No Supabase, abra SQL Editor > New query.
-- 4. Cole TODO o conteúdo deste arquivo e clique em Run.
-- 5. Confirme ao final que as consultas de verificação não retornam erro.
--
-- Este script NÃO é executado automaticamente pelo deploy da Vercel.
--
-- O que faz:
-- - Impede que credenciais de integração cheguem ao navegador:
--   `webhook_secret_hash` e `credentials_ref` deixam de ser legíveis via
--   PostgREST, mesmo para membros da clínica.
-- - `credentials_ref` passa a ser gravável só pelo service_role (Edge
--   Functions), fechando a possibilidade de um membro apontar a integração
--   para o secret de outra clínica.
-- - RLS continua valendo: este script adiciona uma segunda camada por coluna,
--   no mesmo padrão já usado em `chat_channels` (PRODUCAO_01).
--
-- ATENÇÃO PARA MANUTENÇÃO:
-- A partir daqui `integrations` não tem mais privilégio de tabela para
-- `authenticated`, e sim por coluna. Toda coluna nova precisa entrar nas
-- listas abaixo e o script ser reexecutado, senão o app não a enxerga.
-- A consulta de verificação no final lista as colunas sem SELECT.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Zera privilégios diretos e reconcede por coluna
-- ------------------------------------------------------------
REVOKE ALL PRIVILEGES ON public.integrations FROM anon, authenticated;

-- Leitura: tudo menos as credenciais
GRANT SELECT (
  id,
  clinic_id,
  provider,
  category,
  name,
  description,
  status,
  direction,
  config,
  external_account_id,
  webhook_slug,
  last_event_at,
  last_error,
  is_active,
  created_by,
  created_at,
  updated_at
) ON public.integrations TO authenticated;

-- Criação: o app gera o segredo do webhook e grava só o hash. Escrever o
-- hash é permitido (quem cria já conhece o segredo); ler, não.
GRANT INSERT (
  clinic_id,
  provider,
  category,
  name,
  description,
  status,
  direction,
  config,
  is_active,
  webhook_slug,
  webhook_secret_hash,
  created_by
) ON public.integrations TO authenticated;

-- Edição: inclui a rotação do segredo. `credentials_ref`, `webhook_slug`,
-- `last_event_at` e `last_error` ficam fora — são do service_role.
GRANT UPDATE (
  name,
  description,
  status,
  direction,
  config,
  external_account_id,
  is_active,
  webhook_secret_hash
) ON public.integrations TO authenticated;

GRANT DELETE ON public.integrations TO authenticated;

COMMIT;

-- ============================================================
-- VERIFICAÇÃO (somente leitura)
-- ============================================================

-- 1. As credenciais NÃO podem aparecer nesta lista:
SELECT column_name
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name = 'integrations'
  AND grantee = 'authenticated'
  AND privilege_type = 'SELECT'
ORDER BY column_name;

-- 2. Colunas de `integrations` sem SELECT para authenticated.
--    Esperado: webhook_secret_hash e credentials_ref (e nada mais).
SELECT c.column_name
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name = 'integrations'
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.column_privileges p
    WHERE p.table_schema = c.table_schema
      AND p.table_name = c.table_name
      AND p.column_name = c.column_name
      AND p.grantee = 'authenticated'
      AND p.privilege_type = 'SELECT'
  )
ORDER BY c.column_name;

-- 3. RLS segue ativa (esperado: true):
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'integrations';
