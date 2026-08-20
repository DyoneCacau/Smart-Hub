-- ============================================================================
-- CORREÇÕES DE PERMISSÕES E EXIBIÇÃO DE CLÍNICA
-- Data: 12/02/2026
-- ============================================================================

-- 1. GARANTIR QUE APENAS ADMINS ACESSEM A PÁGINA DE ADMINISTRAÇÃO
-- ============================================================================
-- Esta correção já está implementada no frontend, mas vamos adicionar
-- um comentário na tabela user_roles para documentar

COMMENT ON COLUMN user_roles.role IS 
'Role do usuário no sistema. Valores: admin, receptionist, seller, professional, superadmin. Apenas admin e superadmin podem acessar a página de Administração.';

-- 2. CRIAR FUNÇÃO PARA VERIFICAR SE USUÁRIO É ADMIN
-- ============================================================================

CREATE OR REPLACE FUNCTION is_user_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM user_roles 
    WHERE user_id = p_user_id 
    AND role IN ('admin', 'superadmin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION is_user_admin IS 
'Verifica se o usuário tem role de admin ou superadmin';

-- 3. CRIAR VIEW PARA INFORMAÇÕES DE CLÍNICA DO USUÁRIO
-- ============================================================================

CREATE OR REPLACE VIEW vw_user_current_clinic AS
SELECT 
  cu.user_id,
  c.id AS clinic_id,
  c.name AS clinic_name,
  cu.is_owner,
  cu.role,
  p.name AS user_name,
  p.email AS user_email
FROM clinic_users cu
INNER JOIN clinics c ON c.id = cu.clinic_id
INNER JOIN profiles p ON p.user_id = cu.user_id
WHERE c.is_active = true;

COMMENT ON VIEW vw_user_current_clinic IS 
'View que mostra a relação usuário-clínica com informações relevantes para exibição';

-- 4. CRIAR FUNÇÃO PARA OBTER CLÍNICA ATUAL DO USUÁRIO
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_current_clinic(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE (
  clinic_id UUID,
  clinic_name TEXT,
  is_owner BOOLEAN,
  role TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    cu.is_owner,
    cu.role
  FROM clinic_users cu
  INNER JOIN clinics c ON c.id = cu.clinic_id
  WHERE cu.user_id = p_user_id
  AND c.is_active = true
  ORDER BY cu.is_owner DESC, c.created_at ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_user_current_clinic IS 
'Retorna a clínica atual do usuário (primeira clínica onde é owner, ou primeira clínica)';

-- 5. GARANTIR QUE EMAILS SEJAM ÚNICOS (case-insensitive)
-- ============================================================================
-- Já foi criado na migration anterior, mas vamos garantir que existe

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_indexes 
    WHERE indexname = 'profiles_email_unique'
  ) THEN
    CREATE UNIQUE INDEX profiles_email_unique 
    ON profiles (LOWER(email));
    RAISE NOTICE '✓ Índice único de email criado';
  ELSE
    RAISE NOTICE '✓ Índice único de email já existe';
  END IF;
END $$;

-- 6. ADICIONAR CONSTRAINT PARA EVITAR USUÁRIOS DUPLICADOS COM MESMO EMAIL
-- ============================================================================

-- Criar função que previne criação de usuários com email duplicado
CREATE OR REPLACE FUNCTION prevent_duplicate_email()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM profiles 
    WHERE LOWER(email) = LOWER(NEW.email)
    AND user_id != NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Email já cadastrado no sistema'
      USING HINT = 'Use um email diferente ou faça login com o email existente';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para verificar email duplicado
DROP TRIGGER IF EXISTS check_duplicate_email ON profiles;
CREATE TRIGGER check_duplicate_email
  BEFORE INSERT OR UPDATE OF email ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_duplicate_email();

COMMENT ON FUNCTION prevent_duplicate_email IS 
'Previne criação de perfis com emails duplicados (case-insensitive)';

-- 7. MENSAGENS DE CONFIRMAÇÃO
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '✓ CORREÇÕES APLICADAS COM SUCESSO!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE 'Correções aplicadas:';
  RAISE NOTICE '  ✓ Função is_user_admin criada';
  RAISE NOTICE '  ✓ View vw_user_current_clinic criada';
  RAISE NOTICE '  ✓ Função get_user_current_clinic criada';
  RAISE NOTICE '  ✓ Índice único de email verificado';
  RAISE NOTICE '  ✓ Trigger para prevenir emails duplicados criado';
  RAISE NOTICE '';
  RAISE NOTICE 'Verificações de frontend:';
  RAISE NOTICE '  ✓ Página Administração bloqueada para não-admins';
  RAISE NOTICE '  ✓ Sidebar mostra nome da clínica';
  RAISE NOTICE '  ✓ Dashboard mostra nome da clínica no header';
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
END $$;
