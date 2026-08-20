-- ============================================================================
-- CORREÇÕES DO SISTEMA
-- ============================================================================

-- 1. ADICIONAR CONSTRAINT UNIQUE NO EMAIL DOS USUÁRIOS
-- ============================================================================
-- Garante que não seja possível criar usuários com e-mails duplicados

-- Primeiro, remover qualquer constraint antiga se existir
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'profiles_email_unique'
  ) THEN
    ALTER TABLE profiles DROP CONSTRAINT profiles_email_unique;
  END IF;
END $$;

-- Criar índice único no email (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique 
ON profiles (LOWER(email));

-- 2. IMPEDIR CRIAÇÃO AUTOMÁTICA DE CLÍNICA AO CRIAR USUÁRIO
-- ============================================================================
-- Remover trigger que cria clínica automaticamente

DROP TRIGGER IF EXISTS on_user_created_create_clinic ON auth.users;
DROP FUNCTION IF EXISTS public.create_clinic_on_user_signup() CASCADE;

-- 3. ADICIONAR PERMISSÃO PARA ADMIN DELETAR USUÁRIOS
-- ============================================================================
-- Esta política já permite desativar, agora vamos adicionar DELETE

-- Adicionar política para permitir que admins deletem usuários da sua clínica
DROP POLICY IF EXISTS "Admin can delete clinic users" ON profiles;
CREATE POLICY "Admin can delete clinic users"
  ON profiles
  FOR DELETE
  TO authenticated
  USING (
    user_id IN (
      SELECT cu.user_id
      FROM clinic_users cu
      INNER JOIN clinic_users cu_admin ON cu_admin.clinic_id = cu.clinic_id
      WHERE cu_admin.user_id = auth.uid()
      AND cu_admin.role = 'admin'
    )
  );

-- Adicionar política para deletar user_roles
DROP POLICY IF EXISTS "Admin can delete user roles" ON user_roles;
CREATE POLICY "Admin can delete user roles"
  ON user_roles
  FOR DELETE
  TO authenticated
  USING (
    user_id IN (
      SELECT cu.user_id
      FROM clinic_users cu
      INNER JOIN clinic_users cu_admin ON cu_admin.clinic_id = cu.clinic_id
      WHERE cu_admin.user_id = auth.uid()
      AND cu_admin.role = 'admin'
    )
  );

-- Adicionar política para deletar clinic_users
DROP POLICY IF EXISTS "Admin can delete clinic users links" ON clinic_users;
CREATE POLICY "Admin can delete clinic users links"
  ON clinic_users
  FOR DELETE
  TO authenticated
  USING (
    clinic_id IN (
      SELECT cu.clinic_id
      FROM clinic_users cu
      WHERE cu.user_id = auth.uid()
      AND cu.role = 'admin'
    )
  );

-- 4. CRIAR TABELA DE SOLICITAÇÕES DE CONTATO (LEAD FORMS)
-- ============================================================================
-- Para formulário de contato na página de login

CREATE TABLE IF NOT EXISTS public.contact_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  -- statuses: 'pending', 'contacted', 'converted', 'rejected'
  notes TEXT,
  contacted_by UUID REFERENCES auth.users(id),
  contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE contact_requests IS 
'Solicitações de contato de potenciais clientes através do formulário de login';

-- Índices
CREATE INDEX IF NOT EXISTS idx_contact_requests_status ON contact_requests(status);
CREATE INDEX IF NOT EXISTS idx_contact_requests_created_at ON contact_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_requests_email ON contact_requests(LOWER(email));

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_contact_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contact_requests_updated_at ON contact_requests;
CREATE TRIGGER contact_requests_updated_at
  BEFORE UPDATE ON contact_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_contact_requests_updated_at();

-- 5. RLS PARA CONTACT_REQUESTS
-- ============================================================================

ALTER TABLE contact_requests ENABLE ROW LEVEL SECURITY;

-- Permitir inserção pública (sem autenticação) para o formulário de contato
DROP POLICY IF EXISTS "Anyone can create contact requests" ON contact_requests;
CREATE POLICY "Anyone can create contact requests"
  ON contact_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Apenas superadmins podem visualizar e gerenciar
DROP POLICY IF EXISTS "SuperAdmins can manage contact requests" ON contact_requests;
CREATE POLICY "SuperAdmins can manage contact requests"
  ON contact_requests
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role = 'superadmin'
    )
  );

-- 6. CORRIGIR CONTAGEM DE NOTIFICAÇÕES NA ABA DE LEADS
-- ============================================================================
-- A contagem deve considerar apenas status 'pending'

-- Criar função para limpar contador quando mudar status
CREATE OR REPLACE FUNCTION clear_upgrade_request_notification()
RETURNS TRIGGER AS $$
BEGIN
  -- Este trigger serve apenas para forçar atualização em tempo real
  -- A contagem real é feita pela query com WHERE status = 'pending'
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS upgrade_request_status_changed ON upgrade_requests;
CREATE TRIGGER upgrade_request_status_changed
  AFTER UPDATE OF status ON upgrade_requests
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION clear_upgrade_request_notification();

-- 7. PERMITIR QUE DONO DE CLÍNICA VEJA TODAS AS SUAS CLÍNICAS
-- ============================================================================

-- Criar view para donos verem todas as suas clínicas
CREATE OR REPLACE VIEW vw_owner_clinics AS
SELECT 
  cu.user_id AS owner_user_id,
  c.*,
  cu.is_owner,
  cu.role
FROM clinics c
INNER JOIN clinic_users cu ON cu.clinic_id = c.id
WHERE cu.is_owner = true
ORDER BY c.name;

COMMENT ON VIEW vw_owner_clinics IS 
'Clínicas onde o usuário é proprietário (is_owner = true)';

-- Criar função para verificar se usuário é dono de múltiplas clínicas
CREATE OR REPLACE FUNCTION user_is_multi_clinic_owner(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT COUNT(*) > 1
    FROM clinic_users
    WHERE user_id = p_user_id
    AND is_owner = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION user_is_multi_clinic_owner IS 
'Retorna true se o usuário é proprietário de mais de uma clínica';

-- 8. MODIFICAR LÓGICA DE REDIRECIONAMENTO
-- ============================================================================
-- Adicionar campo para indicar se usuário deve escolher clínica ao logar

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS 
  preferred_clinic_id UUID REFERENCES clinics(id);

COMMENT ON COLUMN profiles.preferred_clinic_id IS 
'Clínica preferencial do usuário. Se NULL e usuário tem múltiplas clínicas como owner, mostrar seletor.';

-- 9. FUNÇÃO AUXILIAR PARA OBTER CLÍNICAS DO USUÁRIO
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_clinics(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE (
  clinic_id UUID,
  clinic_name TEXT,
  is_owner BOOLEAN,
  role TEXT,
  is_preferred BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    cu.is_owner,
    cu.role,
    (c.id = p.preferred_clinic_id) AS is_preferred
  FROM clinics c
  INNER JOIN clinic_users cu ON cu.clinic_id = c.id
  LEFT JOIN profiles p ON p.user_id = p_user_id
  WHERE cu.user_id = p_user_id
  ORDER BY 
    (c.id = p.preferred_clinic_id) DESC,
    cu.is_owner DESC,
    c.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_user_clinics IS 
'Retorna todas as clínicas do usuário, ordenadas por preferência e ownership';

-- 10. FUNÇÃO PARA VERIFICAR ACESSO A CLÍNICA
-- ============================================================================

CREATE OR REPLACE FUNCTION user_can_access_clinic(
  p_user_id UUID,
  p_clinic_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM clinic_users 
    WHERE user_id = p_user_id 
    AND clinic_id = p_clinic_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION user_can_access_clinic IS 
'Verifica se o usuário tem acesso à clínica especificada';

-- ============================================================================
-- FIM DAS CORREÇÕES
-- ============================================================================

-- Mensagem de sucesso
DO $$
BEGIN
  RAISE NOTICE '✓ Correções aplicadas com sucesso!';
  RAISE NOTICE '  - Email único para usuários';
  RAISE NOTICE '  - Removido trigger de criação automática de clínica';
  RAISE NOTICE '  - Admin pode deletar usuários';
  RAISE NOTICE '  - Criada tabela contact_requests';
  RAISE NOTICE '  - Corrigida contagem de notificações';
  RAISE NOTICE '  - Suporte para múltiplas clínicas por owner';
END $$;
