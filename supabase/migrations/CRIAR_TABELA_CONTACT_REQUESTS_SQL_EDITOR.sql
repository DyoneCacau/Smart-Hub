-- =============================================================================
-- CRIAR TABELA contact_requests (Solicitações de acesso - formulário do Login)
-- Rode este script no Supabase > SQL Editor para que o botão "Solicitar acesso"
-- funcione e as solicitações apareçam em SuperAdmin > Solicitações.
-- =============================================================================

-- Tabela
CREATE TABLE IF NOT EXISTS public.contact_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  contacted_by UUID REFERENCES auth.users(id),
  contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.contact_requests IS
'Solicitações de contato de potenciais clientes (formulário de login)';

-- Índices
CREATE INDEX IF NOT EXISTS idx_contact_requests_status ON public.contact_requests(status);
CREATE INDEX IF NOT EXISTS idx_contact_requests_created_at ON public.contact_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_requests_email ON public.contact_requests(LOWER(email));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_contact_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contact_requests_updated_at ON public.contact_requests;
CREATE TRIGGER contact_requests_updated_at
  BEFORE UPDATE ON public.contact_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_contact_requests_updated_at();

-- RLS
ALTER TABLE public.contact_requests ENABLE ROW LEVEL SECURITY;

-- Qualquer pessoa (sem login) pode enviar solicitação
DROP POLICY IF EXISTS "Anyone can create contact requests" ON public.contact_requests;
CREATE POLICY "Anyone can create contact requests"
  ON public.contact_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- SuperAdmin vê e gerencia tudo
DROP POLICY IF EXISTS "SuperAdmins can manage contact requests" ON public.contact_requests;
CREATE POLICY "SuperAdmins can manage contact requests"
  ON public.contact_requests
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'superadmin'
    )
  );
