-- ============================================================
-- PRODUÇÃO 22 — SOLICITAÇÕES DE ASSINATURA ELETRÔNICA DE DOCUMENTOS
-- ============================================================
-- INSTRUÇÕES:
-- 1. Revise este arquivo antes de executar.
-- 2. No Supabase, abra SQL Editor > New query.
-- 3. Cole TODO o conteúdo deste arquivo e clique em Run.
-- 4. Depois, publique a Edge Function `document-signature`
--    (npx supabase functions deploy document-signature).
--
-- Este script NÃO é executado automaticamente pelo deploy da Vercel.
--
-- O QUE É: registro de "assinatura eletrônica simples" (Lei 14.063/2020),
-- NÃO um certificado ICP-Brasil. O assinante recebe um link (por
-- WhatsApp), abre uma página pública (sem login), confirma os dados e
-- marca "Li e concordo" — isso fica registrado com nome, CPF, IP,
-- navegador e data/hora como trilha de auditoria.
--
-- Acesso ao link público NÃO passa por RLS: a Edge Function
-- `document-signature` usa a service role e valida só pelo token
-- (aleatório e único) da solicitação. Por isso esta tabela NÃO tem
-- nenhuma policy para o papel `anon` — só membros da clínica autenticados
-- podem ver/criar solicitações pelo app; a confirmação da assinatura em si
-- acontece exclusivamente via Edge Function.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.document_signature_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  document_type text NOT NULL,
  document_name text NOT NULL,
  file_path text NOT NULL,
  signer_name text NOT NULL,
  signer_cpf text,
  signer_cro text,
  signer_state text,
  signer_whatsapp text NOT NULL,
  signer_birth_date date,
  consent_text text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'viewed', 'signed', 'cancelled')),
  token text NOT NULL,
  signed_at timestamptz,
  signed_ip text,
  signed_user_agent text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_document_signature_requests_token
  ON public.document_signature_requests (token);
CREATE INDEX IF NOT EXISTS idx_document_signature_requests_clinic
  ON public.document_signature_requests (clinic_id);
CREATE INDEX IF NOT EXISTS idx_document_signature_requests_patient
  ON public.document_signature_requests (patient_id);

DROP TRIGGER IF EXISTS document_signature_requests_updated_at ON public.document_signature_requests;
CREATE TRIGGER document_signature_requests_updated_at
  BEFORE UPDATE ON public.document_signature_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.document_signature_requests ENABLE ROW LEVEL SECURITY;

-- Só membros da clínica (autenticados) veem/criam pelo app.
DROP POLICY IF EXISTS "Clinic members can view signature requests" ON public.document_signature_requests;
CREATE POLICY "Clinic members can view signature requests"
  ON public.document_signature_requests
  FOR SELECT
  TO authenticated
  USING (
    clinic_id IN (SELECT cu.clinic_id FROM public.clinic_users cu WHERE cu.user_id = auth.uid())
    OR public.is_superadmin(auth.uid())
  );

DROP POLICY IF EXISTS "Clinic members can create signature requests" ON public.document_signature_requests;
CREATE POLICY "Clinic members can create signature requests"
  ON public.document_signature_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    clinic_id IN (SELECT cu.clinic_id FROM public.clinic_users cu WHERE cu.user_id = auth.uid())
    OR public.is_superadmin(auth.uid())
  );

DROP POLICY IF EXISTS "Clinic members can cancel signature requests" ON public.document_signature_requests;
CREATE POLICY "Clinic members can cancel signature requests"
  ON public.document_signature_requests
  FOR UPDATE
  TO authenticated
  USING (
    clinic_id IN (SELECT cu.clinic_id FROM public.clinic_users cu WHERE cu.user_id = auth.uid())
    OR public.is_superadmin(auth.uid())
  )
  WITH CHECK (
    clinic_id IN (SELECT cu.clinic_id FROM public.clinic_users cu WHERE cu.user_id = auth.uid())
    OR public.is_superadmin(auth.uid())
  );

DROP POLICY IF EXISTS "Clinic members can delete signature requests" ON public.document_signature_requests;
CREATE POLICY "Clinic members can delete signature requests"
  ON public.document_signature_requests
  FOR DELETE
  TO authenticated
  USING (
    clinic_id IN (SELECT cu.clinic_id FROM public.clinic_users cu WHERE cu.user_id = auth.uid())
    OR public.is_superadmin(auth.uid())
  );

COMMIT;

-- VERIFICAÇÃO (somente leitura):
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'document_signature_requests'
ORDER BY ordinal_position;
