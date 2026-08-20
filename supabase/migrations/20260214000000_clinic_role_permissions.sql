-- =============================================================================
-- Permissões por função (role) por clínica: matriz Ver | Criar | Editar | Excluir
-- + funções personalizadas que o admin pode criar
-- =============================================================================

-- Permissões das 4 funções do sistema (admin, receptionist, seller, professional) por clínica
CREATE TABLE IF NOT EXISTS public.clinic_role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'receptionist', 'seller', 'professional')),
  feature TEXT NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, role, feature)
);

CREATE INDEX IF NOT EXISTS idx_clinic_role_permissions_clinic ON public.clinic_role_permissions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_clinic_role_permissions_role ON public.clinic_role_permissions(clinic_id, role);

-- Funções personalizadas (criadas pelo admin da clínica)
CREATE TABLE IF NOT EXISTS public.clinic_custom_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, name)
);

CREATE INDEX IF NOT EXISTS idx_clinic_custom_roles_clinic ON public.clinic_custom_roles(clinic_id);

-- Permissões das funções personalizadas (por feature: ver, criar, editar, excluir)
CREATE TABLE IF NOT EXISTS public.clinic_custom_role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_custom_role_id UUID NOT NULL REFERENCES public.clinic_custom_roles(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clinic_custom_role_id, feature)
);

CREATE INDEX IF NOT EXISTS idx_clinic_custom_role_permissions_role ON public.clinic_custom_role_permissions(clinic_custom_role_id);

-- Qual função (custom) o usuário tem em qual clínica (quando for função personalizada)
-- Se não houver linha aqui, usa user_roles.role (sistema)
CREATE TABLE IF NOT EXISTS public.user_clinic_custom_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  clinic_custom_role_id UUID NOT NULL REFERENCES public.clinic_custom_roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, clinic_id)
);

CREATE INDEX IF NOT EXISTS idx_user_clinic_custom_roles_user ON public.user_clinic_custom_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_clinic_custom_roles_clinic ON public.user_clinic_custom_roles(clinic_id);

-- RLS
ALTER TABLE public.clinic_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_custom_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_clinic_custom_roles ENABLE ROW LEVEL SECURITY;

-- Admin da clínica pode gerenciar permissões da própria clínica
CREATE POLICY "Clinic admins manage role permissions"
  ON public.clinic_role_permissions FOR ALL
  USING (
    clinic_id IN (
      SELECT cu.clinic_id FROM public.clinic_users cu
      JOIN public.user_roles ur ON ur.user_id = cu.user_id
      WHERE cu.user_id = auth.uid() AND ur.role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    clinic_id IN (
      SELECT cu.clinic_id FROM public.clinic_users cu
      JOIN public.user_roles ur ON ur.user_id = cu.user_id
      WHERE cu.user_id = auth.uid() AND ur.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Clinic admins manage custom roles"
  ON public.clinic_custom_roles FOR ALL
  USING (
    clinic_id IN (
      SELECT cu.clinic_id FROM public.clinic_users cu
      JOIN public.user_roles ur ON ur.user_id = cu.user_id
      WHERE cu.user_id = auth.uid() AND ur.role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    clinic_id IN (
      SELECT cu.clinic_id FROM public.clinic_users cu
      JOIN public.user_roles ur ON ur.user_id = cu.user_id
      WHERE cu.user_id = auth.uid() AND ur.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Clinic admins manage custom role permissions"
  ON public.clinic_custom_role_permissions FOR ALL
  USING (
    clinic_custom_role_id IN (
      SELECT id FROM public.clinic_custom_roles
      WHERE clinic_id IN (
        SELECT cu.clinic_id FROM public.clinic_users cu
        JOIN public.user_roles ur ON ur.user_id = cu.user_id
        WHERE cu.user_id = auth.uid() AND ur.role IN ('admin', 'superadmin')
      )
    )
  )
  WITH CHECK (
    clinic_custom_role_id IN (
      SELECT id FROM public.clinic_custom_roles
      WHERE clinic_id IN (
        SELECT cu.clinic_id FROM public.clinic_users cu
        JOIN public.user_roles ur ON ur.user_id = cu.user_id
        WHERE cu.user_id = auth.uid() AND ur.role IN ('admin', 'superadmin')
      )
    )
  );

CREATE POLICY "Clinic admins manage user custom roles"
  ON public.user_clinic_custom_roles FOR ALL
  USING (
    clinic_id IN (
      SELECT cu.clinic_id FROM public.clinic_users cu
      JOIN public.user_roles ur ON ur.user_id = cu.user_id
      WHERE cu.user_id = auth.uid() AND ur.role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    clinic_id IN (
      SELECT cu.clinic_id FROM public.clinic_users cu
      JOIN public.user_roles ur ON ur.user_id = cu.user_id
      WHERE cu.user_id = auth.uid() AND ur.role IN ('admin', 'superadmin')
    )
  );

-- Superadmin vê tudo
CREATE POLICY "Superadmin clinic_role_permissions"
  ON public.clinic_role_permissions FOR ALL USING (public.is_superadmin(auth.uid()));
CREATE POLICY "Superadmin clinic_custom_roles"
  ON public.clinic_custom_roles FOR ALL USING (public.is_superadmin(auth.uid()));
CREATE POLICY "Superadmin clinic_custom_role_permissions"
  ON public.clinic_custom_role_permissions FOR ALL USING (public.is_superadmin(auth.uid()));
CREATE POLICY "Superadmin user_clinic_custom_roles"
  ON public.user_clinic_custom_roles FOR ALL USING (public.is_superadmin(auth.uid()));
