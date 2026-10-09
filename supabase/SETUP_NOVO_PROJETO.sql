-- ============================================================================
-- SMART HUB — SETUP COMPLETO PARA UM PROJETO SUPABASE NOVO
-- ============================================================================
-- Como usar: Supabase Dashboard > SQL Editor > New query > cole o arquivo
-- inteiro > Run. Pode ser executado de novo sem perder dados.
--
-- Cada usuário cadastrado ganha automaticamente a própria clínica; todos os
-- dados (profissionais, procedimentos, pacientes, agenda e Smart Hub) ficam
-- isolados por clínica via RLS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Clínica, perfil e papéis
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  segment TEXT,
  business_hours JSONB,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL
    CHECK (role IN ('admin', 'receptionist', 'seller', 'professional', 'superadmin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'superadmin'
  );
$$;

CREATE OR REPLACE FUNCTION public.user_belongs_to_clinic(_clinic_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinics WHERE id = _clinic_id AND owner_id = auth.uid()
  );
$$;

-- Este app não tem planos: todo usuário autenticado tem todos os módulos.
CREATE OR REPLACE FUNCTION public.user_has_feature(_user_id UUID, _feature TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT _user_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.provision_user_account(_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email)
  SELECT
    u.id,
    COALESCE(NULLIF(trim(u.raw_user_meta_data->>'name'), ''), split_part(COALESCE(u.email, ''), '@', 1)),
    COALESCE(u.email, '')
  FROM auth.users u
  WHERE u.id = _user_id
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.clinics (owner_id)
  VALUES (_user_id)
  ON CONFLICT (owner_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.provision_user_account(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Garante perfil + clínica do usuário logado (contas criadas antes deste script).
CREATE OR REPLACE FUNCTION public.ensure_my_clinic()
RETURNS public.clinics
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_clinic public.clinics;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  PERFORM public.provision_user_account(v_uid);

  SELECT * INTO v_clinic FROM public.clinics WHERE owner_id = v_uid;
  RETURN v_clinic;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Cadastros e agenda
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.professionals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  specialty TEXT NOT NULL DEFAULT '',
  council TEXT,
  registration TEXT,
  email TEXT,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  hire_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_professionals_clinic ON public.professionals(clinic_id);

CREATE TABLE IF NOT EXISTS public.procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  description TEXT,
  default_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  duration_minutes INT NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  billing_unit TEXT NOT NULL DEFAULT 'appointment'
    CHECK (billing_unit IN ('appointment', 'session', 'unit', 'ml', 'arch')),
  default_commission NUMERIC(12, 2),
  preparation TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_procedures_clinic ON public.procedures(clinic_id);

CREATE TABLE IF NOT EXISTS public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cpf TEXT,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT,
  birth_date DATE,
  address TEXT,
  insurance TEXT,
  clinical_notes TEXT,
  allergies TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  -- Data de cadastro (o app exibe só o dia).
  created_at DATE NOT NULL DEFAULT CURRENT_DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_patients_clinic ON public.patients(clinic_id);

CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  patient_name TEXT NOT NULL,
  patient_phone TEXT,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  procedure_name TEXT NOT NULL DEFAULT '',
  procedure_id UUID REFERENCES public.procedures(id) ON DELETE SET NULL,
  procedure_price NUMERIC(12, 2),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'return', 'completed', 'cancelled', 'no_show')),
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'partial', 'refunded')),
  notes TEXT,
  booking_idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time),
  UNIQUE (clinic_id, booking_idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_date ON public.appointments(clinic_id, date);
CREATE INDEX IF NOT EXISTS idx_appointments_professional_date
  ON public.appointments(professional_id, date);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['clinics', 'profiles', 'professionals', 'procedures', 'patients', 'appointments']
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I;
       CREATE TRIGGER trg_%s_updated_at
       BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();',
      t, t, t, t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. RLS da base
-- ---------------------------------------------------------------------------

ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procedures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner views clinic" ON public.clinics;
CREATE POLICY "Owner views clinic"
ON public.clinics FOR SELECT
USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owner updates clinic" ON public.clinics;
CREATE POLICY "Owner updates clinic"
ON public.clinics FOR UPDATE
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "User views own profile" ON public.profiles;
CREATE POLICY "User views own profile"
ON public.profiles FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "User updates own profile" ON public.profiles;
CREATE POLICY "User updates own profile"
ON public.profiles FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "User views own roles" ON public.user_roles;
CREATE POLICY "User views own roles"
ON public.user_roles FOR SELECT
USING (user_id = auth.uid());

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['professionals', 'procedures', 'patients', 'appointments']
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "Clinic owner manages %s" ON public.%I;
       CREATE POLICY "Clinic owner manages %s"
       ON public.%I FOR ALL
       USING (public.user_belongs_to_clinic(clinic_id))
       WITH CHECK (public.user_belongs_to_clinic(clinic_id));',
      t, t, t, t
    );
  END LOOP;
END $$;

-- ============================================================================
-- Origem: supabase/migrations/20260728120000_smart_hub.sql
-- ============================================================================

-- ============================================================================
-- HEALTHCARE SMART HUB — Fase 1 (arquitetura)
-- ============================================================================
-- INSTRUÇÕES:
-- 1. Execute este script no SQL Editor do Supabase (Dashboard > SQL Editor > New query)
--    OU via: supabase db push
-- 2. Após aplicar, habilite a feature "smart_hub" no plano da clínica
--    (SuperAdmin > Planos > editar plano > marcar Smart Hub)
-- 3. O isolamento multi-tenant usa clinic_id (padrão do projeto = tenant)
-- 4. Soft delete via deleted_at; filtros da aplicação devem usar deleted_at IS NULL
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.smart_hubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  subtitle TEXT,
  description TEXT,
  logo_url TEXT,
  banner_url TEXT,
  background_url TEXT,
  theme TEXT NOT NULL DEFAULT 'default',
  primary_color TEXT NOT NULL DEFAULT '#0F766E',
  secondary_color TEXT NOT NULL DEFAULT '#134E4A',
  font_family TEXT NOT NULL DEFAULT 'Inter',
  seo_title TEXT,
  seo_description TEXT,
  favicon_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'offline', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  UNIQUE (slug),
  UNIQUE (clinic_id) -- 1 hub por clínica na Fase 1
);

CREATE INDEX IF NOT EXISTS idx_smart_hubs_clinic ON public.smart_hubs(clinic_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_smart_hubs_slug ON public.smart_hubs(slug) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_smart_hubs_status ON public.smart_hubs(status) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.smart_hub_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hub_id UUID NOT NULL REFERENCES public.smart_hubs(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Página principal',
  slug TEXT NOT NULL DEFAULT 'home',
  layout_json JSONB NOT NULL DEFAULT '{"version":1,"blocks":[]}'::jsonb,
  is_home BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  UNIQUE (hub_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_smart_hub_pages_hub ON public.smart_hub_pages(hub_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_smart_hub_pages_clinic ON public.smart_hub_pages(clinic_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.smart_hub_buttons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hub_id UUID NOT NULL REFERENCES public.smart_hubs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subtitle TEXT,
  icon TEXT,
  type TEXT NOT NULL DEFAULT 'link'
    CHECK (type IN ('link', 'whatsapp', 'phone', 'email', 'map', 'video', 'form', 'internal', 'social')),
  url TEXT,
  image TEXT,
  background_color TEXT,
  text_color TEXT,
  visible BOOLEAN NOT NULL DEFAULT true,
  order_index INT NOT NULL DEFAULT 0,
  track_click BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_smart_hub_buttons_hub_order
  ON public.smart_hub_buttons(hub_id, order_index)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_smart_hub_buttons_clinic
  ON public.smart_hub_buttons(clinic_id)
  WHERE deleted_at IS NULL;

-- Templates globais do sistema (sem clinic_id)
CREATE TABLE IF NOT EXISTS public.smart_hub_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  thumbnail TEXT,
  json_layout JSONB NOT NULL DEFAULT '{"version":1,"blocks":[]}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_smart_hub_templates_default
  ON public.smart_hub_templates(is_default)
  WHERE deleted_at IS NULL AND status = 'active';

CREATE TABLE IF NOT EXISTS public.smart_hub_theme (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hub_id UUID NOT NULL REFERENCES public.smart_hubs(id) ON DELETE CASCADE UNIQUE,
  theme_name TEXT NOT NULL DEFAULT 'default',
  primary_color TEXT NOT NULL DEFAULT '#0F766E',
  secondary_color TEXT NOT NULL DEFAULT '#134E4A',
  accent_color TEXT,
  background_color TEXT,
  text_color TEXT,
  button_radius TEXT NOT NULL DEFAULT 'lg',
  font_family TEXT NOT NULL DEFAULT 'Inter',
  custom_css TEXT,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_smart_hub_theme_clinic
  ON public.smart_hub_theme(clinic_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.smart_hub_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hub_id UUID NOT NULL REFERENCES public.smart_hubs(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT,
  storage_path TEXT NOT NULL,
  public_url TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_smart_hub_assets_hub
  ON public.smart_hub_assets(hub_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_smart_hub_assets_clinic
  ON public.smart_hub_assets(clinic_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.smart_hub_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hub_id UUID NOT NULL REFERENCES public.smart_hubs(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  verification_token TEXT,
  ssl_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (ssl_status IN ('pending', 'active', 'error')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'inactive', 'error')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  UNIQUE (domain)
);

CREATE INDEX IF NOT EXISTS idx_smart_hub_domains_hub
  ON public.smart_hub_domains(hub_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_smart_hub_domains_clinic
  ON public.smart_hub_domains(clinic_id)
  WHERE deleted_at IS NULL;

-- Analytics (estrutura preparada; UI/agregações na Fase seguinte)
CREATE TABLE IF NOT EXISTS public.smart_hub_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hub_id UUID NOT NULL REFERENCES public.smart_hubs(id) ON DELETE CASCADE,
  visitor_id TEXT,
  session_id TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  device_type TEXT,
  browser TEXT,
  os TEXT,
  country TEXT,
  city TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_smart_hub_visits_hub_created
  ON public.smart_hub_visits(hub_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_smart_hub_visits_clinic
  ON public.smart_hub_visits(clinic_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.smart_hub_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hub_id UUID NOT NULL REFERENCES public.smart_hubs(id) ON DELETE CASCADE,
  button_id UUID REFERENCES public.smart_hub_buttons(id) ON DELETE SET NULL,
  visit_id UUID REFERENCES public.smart_hub_visits(id) ON DELETE SET NULL,
  target_url TEXT,
  device_type TEXT,
  referrer TEXT,
  utm_campaign TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_smart_hub_clicks_hub_created
  ON public.smart_hub_clicks(hub_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_smart_hub_clicks_button
  ON public.smart_hub_clicks(button_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.smart_hub_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hub_id UUID NOT NULL REFERENCES public.smart_hubs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_name TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  visit_id UUID REFERENCES public.smart_hub_visits(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_smart_hub_events_hub_type
  ON public.smart_hub_events(hub_id, event_type, created_at DESC)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Trigger updated_at
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_smart_hub_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'smart_hubs',
    'smart_hub_pages',
    'smart_hub_buttons',
    'smart_hub_templates',
    'smart_hub_theme',
    'smart_hub_assets',
    'smart_hub_domains',
    'smart_hub_visits',
    'smart_hub_clicks',
    'smart_hub_events'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I;
       CREATE TRIGGER trg_%s_updated_at
       BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.set_smart_hub_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Slug helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_smart_hub_slug(p_slug TEXT)
RETURNS TEXT AS $$
DECLARE
  s TEXT;
BEGIN
  s := lower(trim(both from coalesce(p_slug, '')));
  s := regexp_replace(s, '[^a-z0-9-]+', '-', 'g');
  s := regexp_replace(s, '-+', '-', 'g');
  s := trim(both '-' from s);
  IF s = '' THEN
    RETURN NULL;
  END IF;
  RETURN s;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.is_smart_hub_slug_available(
  p_slug TEXT,
  p_exclude_hub_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  normalized TEXT;
BEGIN
  normalized := public.normalize_smart_hub_slug(p_slug);
  IF normalized IS NULL THEN
    RETURN false;
  END IF;
  RETURN NOT EXISTS (
    SELECT 1
    FROM public.smart_hubs h
    WHERE h.slug = normalized
      AND h.deleted_at IS NULL
      AND (p_exclude_hub_id IS NULL OR h.id <> p_exclude_hub_id)
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- Leitura pública (página publicada por slug)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_public_smart_hub(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized TEXT;
  hub_row public.smart_hubs%ROWTYPE;
  result JSONB;
BEGIN
  normalized := public.normalize_smart_hub_slug(p_slug);
  IF normalized IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO hub_row
  FROM public.smart_hubs h
  WHERE h.slug = normalized
    AND h.deleted_at IS NULL
    AND h.status = 'published';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'hub', to_jsonb(hub_row),
    'theme', (
      SELECT to_jsonb(t)
      FROM public.smart_hub_theme t
      WHERE t.hub_id = hub_row.id AND t.deleted_at IS NULL
      LIMIT 1
    ),
    'buttons', COALESCE((
      SELECT jsonb_agg(to_jsonb(b) ORDER BY b.order_index ASC, b.created_at ASC)
      FROM public.smart_hub_buttons b
      WHERE b.hub_id = hub_row.id
        AND b.deleted_at IS NULL
        AND b.visible = true
        AND b.status = 'active'
    ), '[]'::jsonb),
    'page', (
      SELECT to_jsonb(p)
      FROM public.smart_hub_pages p
      WHERE p.hub_id = hub_row.id
        AND p.deleted_at IS NULL
        AND p.is_home = true
      ORDER BY p.created_at ASC
      LIMIT 1
    ),
    'assets', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC)
      FROM public.smart_hub_assets a
      WHERE a.hub_id = hub_row.id
        AND a.deleted_at IS NULL
        AND a.status = 'active'
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_smart_hub(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_smart_hub_slug_available(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_smart_hub_slug(TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tracking público (anon pode inserir eventos em hubs publicados)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.track_smart_hub_visit(
  p_hub_id UUID,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id UUID;
  v_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id
  FROM public.smart_hubs
  WHERE id = p_hub_id AND deleted_at IS NULL AND status = 'published';

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Hub não encontrado ou offline';
  END IF;

  INSERT INTO public.smart_hub_visits (
    clinic_id, hub_id, visitor_id, session_id, referrer,
    utm_source, utm_medium, utm_campaign, device_type, browser, os,
    country, city, ip_hash, user_agent
  ) VALUES (
    v_clinic_id,
    p_hub_id,
    p_payload->>'visitor_id',
    p_payload->>'session_id',
    p_payload->>'referrer',
    p_payload->>'utm_source',
    p_payload->>'utm_medium',
    p_payload->>'utm_campaign',
    p_payload->>'device_type',
    p_payload->>'browser',
    p_payload->>'os',
    p_payload->>'country',
    p_payload->>'city',
    p_payload->>'ip_hash',
    p_payload->>'user_agent'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.track_smart_hub_click(
  p_hub_id UUID,
  p_button_id UUID DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id UUID;
  v_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id
  FROM public.smart_hubs
  WHERE id = p_hub_id AND deleted_at IS NULL AND status = 'published';

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Hub não encontrado ou offline';
  END IF;

  INSERT INTO public.smart_hub_clicks (
    clinic_id, hub_id, button_id, visit_id, target_url, device_type, referrer, utm_campaign
  ) VALUES (
    v_clinic_id,
    p_hub_id,
    p_button_id,
    NULLIF(p_payload->>'visit_id', '')::UUID,
    p_payload->>'target_url',
    p_payload->>'device_type',
    p_payload->>'referrer',
    p_payload->>'utm_campaign'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_smart_hub_visit(UUID, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.track_smart_hub_click(UUID, UUID, JSONB) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.smart_hubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_hub_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_hub_buttons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_hub_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_hub_theme ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_hub_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_hub_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_hub_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_hub_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_hub_events ENABLE ROW LEVEL SECURITY;

-- smart_hubs
DROP POLICY IF EXISTS "Clinic members view smart hubs" ON public.smart_hubs;
CREATE POLICY "Clinic members view smart hubs"
ON public.smart_hubs FOR SELECT
USING (
  deleted_at IS NULL
  AND public.user_belongs_to_clinic(clinic_id)
  AND public.user_has_feature(auth.uid(), 'smart_hub')
);

DROP POLICY IF EXISTS "Clinic members manage smart hubs" ON public.smart_hubs;
CREATE POLICY "Clinic members manage smart hubs"
ON public.smart_hubs FOR ALL
USING (
  public.user_belongs_to_clinic(clinic_id)
  AND public.user_has_feature(auth.uid(), 'smart_hub')
)
WITH CHECK (
  public.user_belongs_to_clinic(clinic_id)
  AND public.user_has_feature(auth.uid(), 'smart_hub')
);

DROP POLICY IF EXISTS "Superadmins manage all smart hubs" ON public.smart_hubs;
CREATE POLICY "Superadmins manage all smart hubs"
ON public.smart_hubs FOR ALL
USING (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Public can view published smart hubs" ON public.smart_hubs;
CREATE POLICY "Public can view published smart hubs"
ON public.smart_hubs FOR SELECT
USING (deleted_at IS NULL AND status = 'published');

-- smart_hub_pages
DROP POLICY IF EXISTS "Clinic members manage hub pages" ON public.smart_hub_pages;
CREATE POLICY "Clinic members manage hub pages"
ON public.smart_hub_pages FOR ALL
USING (
  public.user_belongs_to_clinic(clinic_id)
  AND public.user_has_feature(auth.uid(), 'smart_hub')
)
WITH CHECK (
  public.user_belongs_to_clinic(clinic_id)
  AND public.user_has_feature(auth.uid(), 'smart_hub')
);

DROP POLICY IF EXISTS "Superadmins manage all hub pages" ON public.smart_hub_pages;
CREATE POLICY "Superadmins manage all hub pages"
ON public.smart_hub_pages FOR ALL
USING (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Public view published hub pages" ON public.smart_hub_pages;
CREATE POLICY "Public view published hub pages"
ON public.smart_hub_pages FOR SELECT
USING (
  deleted_at IS NULL
  AND status = 'published'
  AND EXISTS (
    SELECT 1 FROM public.smart_hubs h
    WHERE h.id = hub_id AND h.deleted_at IS NULL AND h.status = 'published'
  )
);

-- smart_hub_buttons
DROP POLICY IF EXISTS "Clinic members manage hub buttons" ON public.smart_hub_buttons;
CREATE POLICY "Clinic members manage hub buttons"
ON public.smart_hub_buttons FOR ALL
USING (
  public.user_belongs_to_clinic(clinic_id)
  AND public.user_has_feature(auth.uid(), 'smart_hub')
)
WITH CHECK (
  public.user_belongs_to_clinic(clinic_id)
  AND public.user_has_feature(auth.uid(), 'smart_hub')
);

DROP POLICY IF EXISTS "Superadmins manage all hub buttons" ON public.smart_hub_buttons;
CREATE POLICY "Superadmins manage all hub buttons"
ON public.smart_hub_buttons FOR ALL
USING (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Public view visible hub buttons" ON public.smart_hub_buttons;
CREATE POLICY "Public view visible hub buttons"
ON public.smart_hub_buttons FOR SELECT
USING (
  deleted_at IS NULL
  AND visible = true
  AND status = 'active'
  AND EXISTS (
    SELECT 1 FROM public.smart_hubs h
    WHERE h.id = hub_id AND h.deleted_at IS NULL AND h.status = 'published'
  )
);

-- smart_hub_templates (globais: leitura autenticada; escrita superadmin)
DROP POLICY IF EXISTS "Authenticated view hub templates" ON public.smart_hub_templates;
CREATE POLICY "Authenticated view hub templates"
ON public.smart_hub_templates FOR SELECT
USING (deleted_at IS NULL AND status = 'active' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Superadmins manage hub templates" ON public.smart_hub_templates;
CREATE POLICY "Superadmins manage hub templates"
ON public.smart_hub_templates FOR ALL
USING (public.is_superadmin(auth.uid()));

-- smart_hub_theme
DROP POLICY IF EXISTS "Clinic members manage hub theme" ON public.smart_hub_theme;
CREATE POLICY "Clinic members manage hub theme"
ON public.smart_hub_theme FOR ALL
USING (
  public.user_belongs_to_clinic(clinic_id)
  AND public.user_has_feature(auth.uid(), 'smart_hub')
)
WITH CHECK (
  public.user_belongs_to_clinic(clinic_id)
  AND public.user_has_feature(auth.uid(), 'smart_hub')
);

DROP POLICY IF EXISTS "Superadmins manage all hub themes" ON public.smart_hub_theme;
CREATE POLICY "Superadmins manage all hub themes"
ON public.smart_hub_theme FOR ALL
USING (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Public view published hub theme" ON public.smart_hub_theme;
CREATE POLICY "Public view published hub theme"
ON public.smart_hub_theme FOR SELECT
USING (
  deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.smart_hubs h
    WHERE h.id = hub_id AND h.deleted_at IS NULL AND h.status = 'published'
  )
);

-- smart_hub_assets
DROP POLICY IF EXISTS "Clinic members manage hub assets" ON public.smart_hub_assets;
CREATE POLICY "Clinic members manage hub assets"
ON public.smart_hub_assets FOR ALL
USING (
  public.user_belongs_to_clinic(clinic_id)
  AND public.user_has_feature(auth.uid(), 'smart_hub')
)
WITH CHECK (
  public.user_belongs_to_clinic(clinic_id)
  AND public.user_has_feature(auth.uid(), 'smart_hub')
);

DROP POLICY IF EXISTS "Superadmins manage all hub assets" ON public.smart_hub_assets;
CREATE POLICY "Superadmins manage all hub assets"
ON public.smart_hub_assets FOR ALL
USING (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Public view published hub assets" ON public.smart_hub_assets;
CREATE POLICY "Public view published hub assets"
ON public.smart_hub_assets FOR SELECT
USING (
  deleted_at IS NULL
  AND status = 'active'
  AND EXISTS (
    SELECT 1 FROM public.smart_hubs h
    WHERE h.id = hub_id AND h.deleted_at IS NULL AND h.status = 'published'
  )
);

-- smart_hub_domains
DROP POLICY IF EXISTS "Clinic members manage hub domains" ON public.smart_hub_domains;
CREATE POLICY "Clinic members manage hub domains"
ON public.smart_hub_domains FOR ALL
USING (
  public.user_belongs_to_clinic(clinic_id)
  AND public.user_has_feature(auth.uid(), 'smart_hub')
)
WITH CHECK (
  public.user_belongs_to_clinic(clinic_id)
  AND public.user_has_feature(auth.uid(), 'smart_hub')
);

DROP POLICY IF EXISTS "Superadmins manage all hub domains" ON public.smart_hub_domains;
CREATE POLICY "Superadmins manage all hub domains"
ON public.smart_hub_domains FOR ALL
USING (public.is_superadmin(auth.uid()));

-- analytics tables — leitura membros; escrita via funções SECURITY DEFINER (público)
DROP POLICY IF EXISTS "Clinic members view hub visits" ON public.smart_hub_visits;
CREATE POLICY "Clinic members view hub visits"
ON public.smart_hub_visits FOR SELECT
USING (
  deleted_at IS NULL
  AND public.user_belongs_to_clinic(clinic_id)
  AND public.user_has_feature(auth.uid(), 'smart_hub')
);

DROP POLICY IF EXISTS "Superadmins manage hub visits" ON public.smart_hub_visits;
CREATE POLICY "Superadmins manage hub visits"
ON public.smart_hub_visits FOR ALL
USING (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Clinic members view hub clicks" ON public.smart_hub_clicks;
CREATE POLICY "Clinic members view hub clicks"
ON public.smart_hub_clicks FOR SELECT
USING (
  deleted_at IS NULL
  AND public.user_belongs_to_clinic(clinic_id)
  AND public.user_has_feature(auth.uid(), 'smart_hub')
);

DROP POLICY IF EXISTS "Superadmins manage hub clicks" ON public.smart_hub_clicks;
CREATE POLICY "Superadmins manage hub clicks"
ON public.smart_hub_clicks FOR ALL
USING (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Clinic members view hub events" ON public.smart_hub_events;
CREATE POLICY "Clinic members view hub events"
ON public.smart_hub_events FOR SELECT
USING (
  deleted_at IS NULL
  AND public.user_belongs_to_clinic(clinic_id)
  AND public.user_has_feature(auth.uid(), 'smart_hub')
);

DROP POLICY IF EXISTS "Clinic members manage hub events" ON public.smart_hub_events;
CREATE POLICY "Clinic members manage hub events"
ON public.smart_hub_events FOR ALL
USING (
  public.user_belongs_to_clinic(clinic_id)
  AND public.user_has_feature(auth.uid(), 'smart_hub')
)
WITH CHECK (
  public.user_belongs_to_clinic(clinic_id)
  AND public.user_has_feature(auth.uid(), 'smart_hub')
);

DROP POLICY IF EXISTS "Superadmins manage hub events" ON public.smart_hub_events;
CREATE POLICY "Superadmins manage hub events"
ON public.smart_hub_events FOR ALL
USING (public.is_superadmin(auth.uid()));

-- ---------------------------------------------------------------------------
-- Storage: reutiliza bucket clinic-documents (path smart-hub/{clinic_id}/...)
-- ---------------------------------------------------------------------------

-- Templates padrão (seed)
INSERT INTO public.smart_hub_templates (name, description, thumbnail, json_layout, is_default, status)
SELECT
  'Clássico',
  'Layout limpo com logo, descrição e botões empilhados.',
  NULL,
  '{"version":1,"blocks":["header","logo","description","buttons","footer"]}'::jsonb,
  true,
  'active'
WHERE NOT EXISTS (
  SELECT 1 FROM public.smart_hub_templates WHERE name = 'Clássico' AND deleted_at IS NULL
);

INSERT INTO public.smart_hub_templates (name, description, thumbnail, json_layout, is_default, status)
SELECT
  'Banner + Grid',
  'Banner no topo com grid de botões e links sociais.',
  NULL,
  '{"version":1,"blocks":["banner","logo","header","grid","social","footer"]}'::jsonb,
  false,
  'active'
WHERE NOT EXISTS (
  SELECT 1 FROM public.smart_hub_templates WHERE name = 'Banner + Grid' AND deleted_at IS NULL
);

INSERT INTO public.smart_hub_templates (name, description, thumbnail, json_layout, is_default, status)
SELECT
  'WhatsApp First',
  'Foco em conversão via WhatsApp com contato e mapa.',
  NULL,
  '{"version":1,"blocks":["logo","header","whatsapp","contact","map","buttons","footer"]}'::jsonb,
  false,
  'active'
WHERE NOT EXISTS (
  SELECT 1 FROM public.smart_hub_templates WHERE name = 'WhatsApp First' AND deleted_at IS NULL
);

-- ============================================================================
-- Origem: supabase/migrations/20260728220000_smart_hub_fase2.sql
-- ============================================================================

-- ============================================================================
-- HEALTHCARE SMART HUB — Fase 2 (publicação, prévia, validação e pausa)
-- ============================================================================
-- INSTRUÇÕES:
-- 1. Pré-requisito: migration 20260728120000_smart_hub.sql já aplicada
-- 2. Execute este script no SQL Editor do Supabase (Dashboard > SQL Editor > New query)
--    OU via: supabase db push
-- 3. Não altera RLS de isolamento por clinic_id; apenas adiciona campos e RPCs
--    de validação/publicação/pausa com verificação de membership + feature
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Campos incrementais em smart_hubs
-- ---------------------------------------------------------------------------

ALTER TABLE public.smart_hubs
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.smart_hub_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_address TEXT,
  ADD COLUMN IF NOT EXISTS map_embed_url TEXT,
  ADD COLUMN IF NOT EXISTS layout_blocks JSONB NOT NULL DEFAULT '["header","logo","description","buttons","footer"]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_smart_hubs_template
  ON public.smart_hubs(template_id)
  WHERE deleted_at IS NULL AND template_id IS NOT NULL;

COMMENT ON COLUMN public.smart_hubs.template_id IS 'Template aplicado ao hub (Fase 2)';
COMMENT ON COLUMN public.smart_hubs.published_at IS 'Última publicação bem-sucedida';
COMMENT ON COLUMN public.smart_hubs.paused_at IS 'Última pausa (status offline)';
COMMENT ON COLUMN public.smart_hubs.validation_errors IS 'Resultado da última validação pré-publicação';
COMMENT ON COLUMN public.smart_hubs.layout_blocks IS 'Ordem dos blocos da página pública';

-- ---------------------------------------------------------------------------
-- Validação pré-publicação
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_smart_hub_for_publish(p_hub_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hub_row public.smart_hubs%ROWTYPE;
  errors JSONB := '[]'::jsonb;
  warnings JSONB := '[]'::jsonb;
  visible_buttons INT := 0;
  slug_ok BOOLEAN;
BEGIN
  SELECT * INTO hub_row
  FROM public.smart_hubs
  WHERE id = p_hub_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'errors', jsonb_build_array(jsonb_build_object('code', 'hub_not_found', 'message', 'Hub não encontrado.')),
      'warnings', '[]'::jsonb
    );
  END IF;

  IF NOT (
    public.is_superadmin(auth.uid())
    OR (
      public.user_belongs_to_clinic(hub_row.clinic_id)
      AND public.user_has_feature(auth.uid(), 'smart_hub')
    )
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF coalesce(trim(hub_row.title), '') = '' THEN
    errors := errors || jsonb_build_array(
      jsonb_build_object('code', 'title_required', 'message', 'Informe o título do hub.')
    );
  END IF;

  IF coalesce(trim(hub_row.slug), '') = '' THEN
    errors := errors || jsonb_build_array(
      jsonb_build_object('code', 'slug_required', 'message', 'Informe o slug da URL pública.')
    );
  ELSE
    slug_ok := public.is_smart_hub_slug_available(hub_row.slug, hub_row.id);
    IF NOT slug_ok THEN
      errors := errors || jsonb_build_array(
        jsonb_build_object('code', 'slug_unavailable', 'message', 'Slug indisponível ou inválido.')
      );
    END IF;
  END IF;

  SELECT count(*)::INT INTO visible_buttons
  FROM public.smart_hub_buttons b
  WHERE b.hub_id = hub_row.id
    AND b.deleted_at IS NULL
    AND b.visible = true
    AND b.status = 'active';

  IF visible_buttons = 0 AND coalesce(trim(hub_row.whatsapp_number), '') = '' THEN
    errors := errors || jsonb_build_array(
      jsonb_build_object(
        'code', 'conversion_required',
        'message', 'Cadastre ao menos um botão visível ou um WhatsApp para publicar.'
      )
    );
  END IF;

  IF coalesce(trim(hub_row.seo_title), '') = '' THEN
    warnings := warnings || jsonb_build_array(
      jsonb_build_object('code', 'seo_title_missing', 'message', 'SEO title recomendado para melhor indexação.')
    );
  END IF;

  IF coalesce(trim(hub_row.logo_url), '') = '' THEN
    warnings := warnings || jsonb_build_array(
      jsonb_build_object('code', 'logo_missing', 'message', 'Logo recomendado para reforçar a identidade da clínica.')
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', jsonb_array_length(errors) = 0,
    'errors', errors,
    'warnings', warnings,
    'visible_buttons', visible_buttons
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_smart_hub_for_publish(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Publicar / Pausar
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.publish_smart_hub(p_hub_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hub_row public.smart_hubs%ROWTYPE;
  validation JSONB;
BEGIN
  SELECT * INTO hub_row
  FROM public.smart_hubs
  WHERE id = p_hub_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hub não encontrado';
  END IF;

  IF NOT (
    public.is_superadmin(auth.uid())
    OR (
      public.user_belongs_to_clinic(hub_row.clinic_id)
      AND public.user_has_feature(auth.uid(), 'smart_hub')
    )
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  validation := public.validate_smart_hub_for_publish(p_hub_id);

  UPDATE public.smart_hubs
  SET
    validation_errors = coalesce(validation->'errors', '[]'::jsonb),
    last_validated_at = now(),
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id = p_hub_id;

  IF NOT coalesce((validation->>'ok')::boolean, false) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'status', hub_row.status,
      'validation', validation
    );
  END IF;

  UPDATE public.smart_hubs
  SET
    status = 'published',
    published_at = now(),
    paused_at = NULL,
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id = p_hub_id;

  UPDATE public.smart_hub_pages
  SET
    status = 'published',
    updated_by = auth.uid(),
    updated_at = now()
  WHERE hub_id = p_hub_id
    AND deleted_at IS NULL
    AND is_home = true;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'published',
    'validation', validation
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.pause_smart_hub(p_hub_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hub_row public.smart_hubs%ROWTYPE;
BEGIN
  SELECT * INTO hub_row
  FROM public.smart_hubs
  WHERE id = p_hub_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hub não encontrado';
  END IF;

  IF NOT (
    public.is_superadmin(auth.uid())
    OR (
      public.user_belongs_to_clinic(hub_row.clinic_id)
      AND public.user_has_feature(auth.uid(), 'smart_hub')
    )
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF hub_row.status <> 'published' AND hub_row.status <> 'offline' THEN
    RAISE EXCEPTION 'Somente hubs publicados podem ser pausados';
  END IF;

  UPDATE public.smart_hubs
  SET
    status = 'offline',
    paused_at = now(),
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id = p_hub_id;

  RETURN jsonb_build_object('ok', true, 'status', 'offline');
END;
$$;

CREATE OR REPLACE FUNCTION public.unpublish_smart_hub_to_draft(p_hub_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hub_row public.smart_hubs%ROWTYPE;
BEGIN
  SELECT * INTO hub_row
  FROM public.smart_hubs
  WHERE id = p_hub_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hub não encontrado';
  END IF;

  IF NOT (
    public.is_superadmin(auth.uid())
    OR (
      public.user_belongs_to_clinic(hub_row.clinic_id)
      AND public.user_has_feature(auth.uid(), 'smart_hub')
    )
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE public.smart_hubs
  SET
    status = 'draft',
    paused_at = CASE WHEN hub_row.status = 'published' THEN now() ELSE hub_row.paused_at END,
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id = p_hub_id;

  UPDATE public.smart_hub_pages
  SET
    status = 'draft',
    updated_by = auth.uid(),
    updated_at = now()
  WHERE hub_id = p_hub_id
    AND deleted_at IS NULL
    AND is_home = true;

  RETURN jsonb_build_object('ok', true, 'status', 'draft');
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_smart_hub(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pause_smart_hub(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unpublish_smart_hub_to_draft(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Prévia autenticada (rascunho/offline inclusos) — isolamento por clinic_id
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_preview_smart_hub(p_hub_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hub_row public.smart_hubs%ROWTYPE;
  result JSONB;
BEGIN
  SELECT * INTO hub_row
  FROM public.smart_hubs h
  WHERE h.id = p_hub_id
    AND h.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT (
    public.is_superadmin(auth.uid())
    OR (
      public.user_belongs_to_clinic(hub_row.clinic_id)
      AND public.user_has_feature(auth.uid(), 'smart_hub')
    )
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT jsonb_build_object(
    'hub', to_jsonb(hub_row),
    'theme', (
      SELECT to_jsonb(t)
      FROM public.smart_hub_theme t
      WHERE t.hub_id = hub_row.id AND t.deleted_at IS NULL
      LIMIT 1
    ),
    'buttons', COALESCE((
      SELECT jsonb_agg(to_jsonb(b) ORDER BY b.order_index ASC, b.created_at ASC)
      FROM public.smart_hub_buttons b
      WHERE b.hub_id = hub_row.id
        AND b.deleted_at IS NULL
        AND b.visible = true
        AND b.status = 'active'
    ), '[]'::jsonb),
    'page', (
      SELECT to_jsonb(p)
      FROM public.smart_hub_pages p
      WHERE p.hub_id = hub_row.id
        AND p.deleted_at IS NULL
        AND p.is_home = true
      ORDER BY p.created_at ASC
      LIMIT 1
    ),
    'assets', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC)
      FROM public.smart_hub_assets a
      WHERE a.hub_id = hub_row.id
        AND a.deleted_at IS NULL
        AND a.status = 'active'
    ), '[]'::jsonb),
    'preview', true
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_preview_smart_hub(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Aplicar template (atualiza layout_blocks + template_id no hub da clínica)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_smart_hub_template(p_hub_id UUID, p_template_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hub_row public.smart_hubs%ROWTYPE;
  tpl public.smart_hub_templates%ROWTYPE;
  blocks JSONB;
BEGIN
  SELECT * INTO hub_row
  FROM public.smart_hubs
  WHERE id = p_hub_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hub não encontrado';
  END IF;

  IF NOT (
    public.is_superadmin(auth.uid())
    OR (
      public.user_belongs_to_clinic(hub_row.clinic_id)
      AND public.user_has_feature(auth.uid(), 'smart_hub')
    )
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT * INTO tpl
  FROM public.smart_hub_templates
  WHERE id = p_template_id AND deleted_at IS NULL AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template não encontrado';
  END IF;

  blocks := coalesce(tpl.json_layout->'blocks', '["header","logo","description","buttons","footer"]'::jsonb);

  UPDATE public.smart_hubs
  SET
    template_id = tpl.id,
    layout_blocks = blocks,
    theme = coalesce(nullif(trim(hub_row.theme), ''), 'default'),
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id = p_hub_id;

  UPDATE public.smart_hub_pages
  SET
    layout_json = jsonb_build_object('version', 1, 'blocks', blocks, 'template_id', tpl.id),
    updated_by = auth.uid(),
    updated_at = now()
  WHERE hub_id = p_hub_id
    AND deleted_at IS NULL
    AND is_home = true;

  RETURN jsonb_build_object(
    'ok', true,
    'template_id', tpl.id,
    'layout_blocks', blocks
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_smart_hub_template(UUID, UUID) TO authenticated;

-- ============================================================================
-- Origem: supabase/migrations/20260729120000_smart_hub_fix_preview_validate.sql
-- ============================================================================

-- ============================================================================
-- HEALTHCARE SMART HUB — hotfix Prévia + Validação
-- ============================================================================
-- INSTRUÇÕES:
-- 1. Pré-requisito: PRODUCAO_29 / 20260728220000_smart_hub_fase2.sql já aplicada
-- 2. Execute no SQL Editor do Supabase
-- 3. Corrige validate_smart_hub_for_publish (persiste resultado + exige template)
--    e reforça get_preview_smart_hub (botões draft/visíveis/ativos)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Validação: persiste last_validated_at + validation_errors; exige template
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_smart_hub_for_publish(p_hub_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hub_row public.smart_hubs%ROWTYPE;
  errors JSONB := '[]'::jsonb;
  warnings JSONB := '[]'::jsonb;
  visible_buttons INT := 0;
  slug_ok BOOLEAN;
BEGIN
  SELECT * INTO hub_row
  FROM public.smart_hubs
  WHERE id = p_hub_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'errors', jsonb_build_array(jsonb_build_object('code', 'hub_not_found', 'message', 'Hub não encontrado.')),
      'warnings', '[]'::jsonb,
      'visible_buttons', 0
    );
  END IF;

  IF NOT (
    public.is_superadmin(auth.uid())
    OR (
      public.user_belongs_to_clinic(hub_row.clinic_id)
      AND public.user_has_feature(auth.uid(), 'smart_hub')
    )
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF coalesce(trim(hub_row.title), '') = '' THEN
    errors := errors || jsonb_build_array(
      jsonb_build_object('code', 'title_required', 'message', 'Informe o nome público do hub.')
    );
  END IF;

  IF coalesce(trim(hub_row.slug), '') = '' THEN
    errors := errors || jsonb_build_array(
      jsonb_build_object('code', 'slug_required', 'message', 'Informe um slug válido.')
    );
  ELSE
    slug_ok := public.is_smart_hub_slug_available(hub_row.slug, hub_row.id);
    IF NOT slug_ok THEN
      errors := errors || jsonb_build_array(
        jsonb_build_object('code', 'slug_unavailable', 'message', 'Slug indisponível ou inválido.')
      );
    END IF;
  END IF;

  IF hub_row.template_id IS NULL THEN
    errors := errors || jsonb_build_array(
      jsonb_build_object('code', 'template_required', 'message', 'Escolha e aplique um template.')
    );
  END IF;

  SELECT count(*)::INT INTO visible_buttons
  FROM public.smart_hub_buttons b
  WHERE b.hub_id = hub_row.id
    AND b.clinic_id = hub_row.clinic_id
    AND b.deleted_at IS NULL
    AND b.visible = true
    AND b.status = 'active';

  IF visible_buttons = 0 AND coalesce(trim(hub_row.whatsapp_number), '') = '' THEN
    errors := errors || jsonb_build_array(
      jsonb_build_object(
        'code', 'conversion_required',
        'message', 'Adicione pelo menos um botão visível (ou informe um WhatsApp nas configurações).'
      )
    );
  END IF;

  IF coalesce(trim(hub_row.seo_title), '') = '' THEN
    warnings := warnings || jsonb_build_array(
      jsonb_build_object('code', 'seo_title_missing', 'message', 'SEO title recomendado para melhor indexação.')
    );
  END IF;

  IF coalesce(trim(hub_row.logo_url), '') = '' THEN
    warnings := warnings || jsonb_build_array(
      jsonb_build_object('code', 'logo_missing', 'message', 'Logo recomendado para reforçar a identidade da clínica.')
    );
  END IF;

  -- Persiste resultado da validação (necessário para o fluxo visual)
  UPDATE public.smart_hubs
  SET
    validation_errors = errors,
    last_validated_at = now(),
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id = p_hub_id;

  RETURN jsonb_build_object(
    'ok', jsonb_array_length(errors) = 0,
    'errors', errors,
    'warnings', warnings,
    'visible_buttons', visible_buttons
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_smart_hub_for_publish(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Prévia: garante botões do hub (draft incluso), clinic_id e ordenação
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_preview_smart_hub(p_hub_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hub_row public.smart_hubs%ROWTYPE;
  result JSONB;
BEGIN
  SELECT * INTO hub_row
  FROM public.smart_hubs h
  WHERE h.id = p_hub_id
    AND h.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT (
    public.is_superadmin(auth.uid())
    OR (
      public.user_belongs_to_clinic(hub_row.clinic_id)
      AND public.user_has_feature(auth.uid(), 'smart_hub')
    )
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT jsonb_build_object(
    'hub', to_jsonb(hub_row),
    'theme', (
      SELECT to_jsonb(t)
      FROM public.smart_hub_theme t
      WHERE t.hub_id = hub_row.id
        AND t.clinic_id = hub_row.clinic_id
        AND t.deleted_at IS NULL
      LIMIT 1
    ),
    'buttons', COALESCE((
      SELECT jsonb_agg(to_jsonb(b) ORDER BY b.order_index ASC, b.created_at ASC)
      FROM public.smart_hub_buttons b
      WHERE b.hub_id = hub_row.id
        AND b.clinic_id = hub_row.clinic_id
        AND b.deleted_at IS NULL
        AND b.visible = true
        AND b.status = 'active'
    ), '[]'::jsonb),
    'page', (
      SELECT to_jsonb(p)
      FROM public.smart_hub_pages p
      WHERE p.hub_id = hub_row.id
        AND p.clinic_id = hub_row.clinic_id
        AND p.deleted_at IS NULL
        AND p.is_home = true
      ORDER BY p.created_at ASC
      LIMIT 1
    ),
    'assets', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC)
      FROM public.smart_hub_assets a
      WHERE a.hub_id = hub_row.id
        AND a.clinic_id = hub_row.clinic_id
        AND a.deleted_at IS NULL
        AND a.status = 'active'
    ), '[]'::jsonb),
    'preview', true
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_preview_smart_hub(UUID) TO authenticated;

-- ============================================================================
-- Origem: supabase/migrations/20260729140000_smart_hub_visual_assets.sql
-- ============================================================================

-- ============================================================================
-- HEALTHCARE SMART HUB — Fase 2.1 (identidade visual + assets)
-- ============================================================================
-- INSTRUÇÕES:
-- 1. Pré-requisitos: Fase 1 + Fase 2 + PRODUCAO_30 já aplicadas
-- 2. Execute no SQL Editor do Supabase (Dashboard > SQL Editor > New query)
-- 3. Cria bucket smart-hub-assets, campos visuais e policies multi-tenant
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Campos visuais em smart_hubs
-- ---------------------------------------------------------------------------

ALTER TABLE public.smart_hubs
  ADD COLUMN IF NOT EXISTS profile_url TEXT,
  ADD COLUMN IF NOT EXISTS style_preset TEXT NOT NULL DEFAULT 'clean',
  ADD COLUMN IF NOT EXISTS visual_config JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.smart_hubs.profile_url IS 'Foto de perfil / avatar do hub';
COMMENT ON COLUMN public.smart_hubs.style_preset IS 'Preset visual: clean|elegant|colorful|minimal|premium|whatsapp';
COMMENT ON COLUMN public.smart_hubs.visual_config IS 'Config visual (cores extras, gradiente, overlay, tipografia, etc.)';

-- ---------------------------------------------------------------------------
-- Campos visuais em smart_hub_buttons
-- ---------------------------------------------------------------------------

ALTER TABLE public.smart_hub_buttons
  ADD COLUMN IF NOT EXISTS image_alt TEXT,
  ADD COLUMN IF NOT EXISTS visual_variant TEXT NOT NULL DEFAULT 'simple',
  ADD COLUMN IF NOT EXISTS image_position TEXT NOT NULL DEFAULT 'left',
  ADD COLUMN IF NOT EXISTS whatsapp_message TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'smart_hub_buttons_visual_variant_check'
  ) THEN
    ALTER TABLE public.smart_hub_buttons
      ADD CONSTRAINT smart_hub_buttons_visual_variant_check
      CHECK (visual_variant IN (
        'simple', 'icon_card', 'image_card', 'horizontal_card',
        'featured_card', 'list_item', 'grid'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'smart_hub_buttons_image_position_check'
  ) THEN
    ALTER TABLE public.smart_hub_buttons
      ADD CONSTRAINT smart_hub_buttons_image_position_check
      CHECK (image_position IN ('left', 'top', 'right', 'background'));
  END IF;
END $$;

-- Ampliar tipos de botão (mantém os existentes)
ALTER TABLE public.smart_hub_buttons DROP CONSTRAINT IF EXISTS smart_hub_buttons_type_check;
ALTER TABLE public.smart_hub_buttons
  ADD CONSTRAINT smart_hub_buttons_type_check
  CHECK (type IN (
    'link', 'whatsapp', 'phone', 'email', 'map', 'video', 'form', 'internal', 'social',
    'instagram', 'facebook', 'tiktok', 'youtube', 'site', 'appointment', 'procedure', 'info'
  ));

-- ---------------------------------------------------------------------------
-- Bucket smart-hub-assets (público para página /hub/:slug)
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'smart-hub-assets',
  'smart-hub-assets',
  true,
  6291456, -- 6 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- path: {clinic_id}/{hub_id}/{kind}/...

DROP POLICY IF EXISTS "Smart hub assets public read" ON storage.objects;
CREATE POLICY "Smart hub assets public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'smart-hub-assets');

DROP POLICY IF EXISTS "Smart hub assets clinic insert" ON storage.objects;
CREATE POLICY "Smart hub assets clinic insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'smart-hub-assets'
  AND (
    public.is_superadmin(auth.uid())
    OR (
      public.user_belongs_to_clinic(((storage.foldername(name))[1])::uuid)
      AND public.user_has_feature(auth.uid(), 'smart_hub')
    )
  )
);

DROP POLICY IF EXISTS "Smart hub assets clinic update" ON storage.objects;
CREATE POLICY "Smart hub assets clinic update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'smart-hub-assets'
  AND (
    public.is_superadmin(auth.uid())
    OR (
      public.user_belongs_to_clinic(((storage.foldername(name))[1])::uuid)
      AND public.user_has_feature(auth.uid(), 'smart_hub')
    )
  )
)
WITH CHECK (
  bucket_id = 'smart-hub-assets'
  AND (
    public.is_superadmin(auth.uid())
    OR (
      public.user_belongs_to_clinic(((storage.foldername(name))[1])::uuid)
      AND public.user_has_feature(auth.uid(), 'smart_hub')
    )
  )
);

DROP POLICY IF EXISTS "Smart hub assets clinic delete" ON storage.objects;
CREATE POLICY "Smart hub assets clinic delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'smart-hub-assets'
  AND (
    public.is_superadmin(auth.uid())
    OR (
      public.user_belongs_to_clinic(((storage.foldername(name))[1])::uuid)
      AND public.user_has_feature(auth.uid(), 'smart_hub')
    )
  )
);

-- ---------------------------------------------------------------------------
-- Asset kind em smart_hub_assets (opcional)
-- ---------------------------------------------------------------------------

ALTER TABLE public.smart_hub_assets
  ADD COLUMN IF NOT EXISTS asset_kind TEXT NOT NULL DEFAULT 'other';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'smart_hub_assets_kind_check'
  ) THEN
    ALTER TABLE public.smart_hub_assets
      ADD CONSTRAINT smart_hub_assets_kind_check
      CHECK (asset_kind IN ('logo', 'banner', 'profile', 'button', 'background', 'other'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Atualizar seeds de templates (prévias descritivas em json_layout)
-- ---------------------------------------------------------------------------

UPDATE public.smart_hub_templates
SET json_layout = jsonb_build_object(
  'version', 1,
  'blocks', ARRAY['logo','header','description','buttons','contact','social','footer'],
  'preview', jsonb_build_object(
    'banner', false,
    'profile', true,
    'whatsapp_featured', false,
    'grid', false,
    'style', 'classic'
  )
),
updated_at = now()
WHERE name = 'Clássico' AND deleted_at IS NULL;

UPDATE public.smart_hub_templates
SET json_layout = jsonb_build_object(
  'version', 1,
  'blocks', ARRAY['banner','logo','header','grid','social','contact','footer'],
  'preview', jsonb_build_object(
    'banner', true,
    'profile', true,
    'whatsapp_featured', false,
    'grid', true,
    'style', 'banner_grid'
  )
),
updated_at = now()
WHERE name = 'Banner + Grid' AND deleted_at IS NULL;

UPDATE public.smart_hub_templates
SET json_layout = jsonb_build_object(
  'version', 1,
  'blocks', ARRAY['banner','logo','header','whatsapp','contact','buttons','social','map','footer'],
  'preview', jsonb_build_object(
    'banner', true,
    'profile', true,
    'whatsapp_featured', true,
    'grid', false,
    'style', 'whatsapp_first',
    'floating_whatsapp', true
  )
),
updated_at = now()
WHERE name = 'WhatsApp First' AND deleted_at IS NULL;


-- ---------------------------------------------------------------------------
-- Metadata de cliques (título amigável, tipo, variante, posição)
-- ---------------------------------------------------------------------------

ALTER TABLE public.smart_hub_clicks
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.smart_hub_clicks.metadata IS 'Metadados não sensíveis do clique (título, tipo, variante, posição, template)';

CREATE OR REPLACE FUNCTION public.track_smart_hub_click(
  p_hub_id UUID,
  p_button_id UUID DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id UUID;
  v_id UUID;
  v_meta JSONB;
BEGIN
  SELECT clinic_id INTO v_clinic_id
  FROM public.smart_hubs
  WHERE id = p_hub_id AND deleted_at IS NULL AND status = 'published';

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Hub não encontrado ou offline';
  END IF;

  v_meta := jsonb_strip_nulls(jsonb_build_object(
    'button_title', p_payload->>'button_title',
    'button_type', p_payload->>'button_type',
    'visual_variant', p_payload->>'visual_variant',
    'order_index', p_payload->'order_index',
    'template_id', p_payload->>'template_id',
    'style_preset', p_payload->>'style_preset'
  ));

  INSERT INTO public.smart_hub_clicks (
    clinic_id, hub_id, button_id, visit_id, target_url, device_type, referrer, utm_campaign, metadata
  ) VALUES (
    v_clinic_id,
    p_hub_id,
    p_button_id,
    NULLIF(p_payload->>'visit_id', '')::UUID,
    p_payload->>'target_url',
    p_payload->>'device_type',
    p_payload->>'referrer',
    p_payload->>'utm_campaign',
    COALESCE(v_meta, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_smart_hub_click(UUID, UUID, JSONB) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Smart Hub: captação de contatos e agendamento online
-- ---------------------------------------------------------------------------

ALTER TABLE public.smart_hubs
  ADD COLUMN IF NOT EXISTS capture_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS public_booking_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.smart_hub_buttons
  ADD COLUMN IF NOT EXISTS click_action TEXT NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS capture_config JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.smart_hub_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hub_id UUID NOT NULL REFERENCES public.smart_hubs(id) ON DELETE CASCADE,
  button_id UUID REFERENCES public.smart_hub_buttons(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  phone_key TEXT NOT NULL,
  email TEXT,
  interest TEXT,
  message TEXT,
  preferred_date TEXT,
  preferred_time TEXT,
  stage TEXT NOT NULL DEFAULT 'new'
    CHECK (stage IN ('new', 'contact', 'scheduled', 'won', 'lost')),
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  referrer TEXT,
  landing_url TEXT,
  privacy_accepted_at TIMESTAMPTZ,
  is_test BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_smart_hub_leads_hub_phone ON public.smart_hub_leads(hub_id, phone_key);
CREATE INDEX IF NOT EXISTS idx_smart_hub_leads_clinic_created
  ON public.smart_hub_leads(clinic_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_smart_hub_leads_updated_at ON public.smart_hub_leads;
CREATE TRIGGER trg_smart_hub_leads_updated_at
  BEFORE UPDATE ON public.smart_hub_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.smart_hub_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinic owner manages smart hub leads" ON public.smart_hub_leads;
CREATE POLICY "Clinic owner manages smart hub leads"
ON public.smart_hub_leads FOR ALL
USING (public.user_belongs_to_clinic(clinic_id))
WITH CHECK (public.user_belongs_to_clinic(clinic_id));

-- ============================================================================
-- Origem: supabase/migrations/20260805180000_smart_hub_templates_banner.sql
-- ============================================================================

-- Smart Hub: banner em todos os templates (Clássico + WhatsApp First).
-- Idempotente; não altera schema. Ver PRODUCAO_37_SMART_HUB_TEMPLATES_BANNER.sql.

UPDATE public.smart_hub_templates
SET json_layout = jsonb_build_object(
  'version', 1,
  'blocks', ARRAY['banner','logo','header','description','buttons','contact','social','footer'],
  'preview', jsonb_build_object(
    'banner', true,
    'profile', true,
    'whatsapp_featured', false,
    'grid', false,
    'style', 'classic'
  )
),
updated_at = now()
WHERE name = 'Clássico' AND deleted_at IS NULL;

UPDATE public.smart_hub_templates
SET json_layout = jsonb_build_object(
  'version', 1,
  'blocks', ARRAY['banner','logo','header','grid','social','contact','footer'],
  'preview', jsonb_build_object(
    'banner', true,
    'profile', true,
    'whatsapp_featured', false,
    'grid', true,
    'style', 'banner_grid'
  )
),
updated_at = now()
WHERE name = 'Banner + Grid' AND deleted_at IS NULL;

UPDATE public.smart_hub_templates
SET json_layout = jsonb_build_object(
  'version', 1,
  'blocks', ARRAY['banner','logo','header','whatsapp','contact','buttons','social','map','footer'],
  'preview', jsonb_build_object(
    'banner', true,
    'profile', true,
    'whatsapp_featured', true,
    'grid', false,
    'style', 'whatsapp_first',
    'floating_whatsapp', true
  )
),
updated_at = now()
WHERE name = 'WhatsApp First' AND deleted_at IS NULL;

-- ============================================================================
-- Origem: supabase/migrations/20260805190000_smart_hub_click_action_booking.sql
-- ============================================================================

-- Smart Hub: permitir click_action = 'booking' na check constraint.
-- Idempotente (DROP IF EXISTS + ADD). Não altera dados, RLS nem colunas.
-- Ver PRODUCAO_38_SMART_HUB_CLICK_ACTION_BOOKING.sql (execução manual).

ALTER TABLE public.smart_hub_buttons
  DROP CONSTRAINT IF EXISTS smart_hub_buttons_click_action_check;

ALTER TABLE public.smart_hub_buttons
  ADD CONSTRAINT smart_hub_buttons_click_action_check
  CHECK (click_action IN (
    'auto',
    'form',
    'whatsapp',
    'link',
    'phone',
    'email',
    'map',
    'info',
    'booking'
  ));

COMMENT ON COLUMN public.smart_hub_buttons.click_action IS
  'Ação ao clicar: auto (deriva do type) | form | whatsapp | link | phone | email | map | info | booking';

-- ============================================================================
-- Origem: supabase/migrations/20260805220000_smart_hub_public_payload.sql
-- ============================================================================

-- Restringe get_public_smart_hub a whitelist pública.
-- Equivalente operacional: supabase/PRODUCAO_40_SMART_HUB_PUBLIC_PAYLOAD.sql
-- Preferir execução manual do PRODUCAO_40 no SQL Editor em produção.

CREATE OR REPLACE FUNCTION public.smart_hub_public_capture_config(p_cfg jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_cfg IS NULL OR jsonb_typeof(p_cfg) <> 'object' THEN '{}'::jsonb
    ELSE jsonb_strip_nulls(jsonb_build_object(
      'mode', p_cfg->'mode',
      'form_title', p_cfg->'form_title',
      'form_description', p_cfg->'form_description',
      'submit_label', p_cfg->'submit_label',
      'success_message', p_cfg->'success_message',
      'redirect_url', p_cfg->'redirect_url',
      'redirect_whatsapp_after_submit', p_cfg->'redirect_whatsapp_after_submit',
      'whatsapp_phone', p_cfg->'whatsapp_phone',
      'whatsapp_message', p_cfg->'whatsapp_message',
      'whatsapp_followup_message', p_cfg->'whatsapp_followup_message',
      'require_privacy_accept', p_cfg->'require_privacy_accept',
      'privacy_text', p_cfg->'privacy_text',
      'privacy_url', p_cfg->'privacy_url',
      'privacy_version', p_cfg->'privacy_version',
      'fields', p_cfg->'fields',
      'manual_copy_message', p_cfg->'manual_copy_message'
    ))
  END;
$$;

CREATE OR REPLACE FUNCTION public.smart_hub_public_button_capture_config(p_cfg jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_cfg IS NULL OR jsonb_typeof(p_cfg) <> 'object' THEN '{}'::jsonb
    ELSE jsonb_strip_nulls(jsonb_build_object(
      'use_hub_form', p_cfg->'use_hub_form',
      'use_hub_defaults', p_cfg->'use_hub_defaults',
      'interest', p_cfg->'interest',
      'redirect_whatsapp_after_submit', p_cfg->'redirect_whatsapp_after_submit',
      'redirect_url', p_cfg->'redirect_url',
      'whatsapp_phone', p_cfg->'whatsapp_phone',
      'whatsapp_message', p_cfg->'whatsapp_message',
      'include_hub_name', p_cfg->'include_hub_name',
      'include_service_name', p_cfg->'include_service_name',
      'open_in_new_tab', p_cfg->'open_in_new_tab',
      'email_subject', p_cfg->'email_subject'
    ))
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_smart_hub(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized TEXT;
  hub_row public.smart_hubs%ROWTYPE;
  result JSONB;
BEGIN
  normalized := public.normalize_smart_hub_slug(p_slug);
  IF normalized IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO hub_row
  FROM public.smart_hubs h
  WHERE h.slug = normalized
    AND h.deleted_at IS NULL
    AND h.status = 'published';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'hub', jsonb_build_object(
      'id', hub_row.id,
      'slug', hub_row.slug,
      'title', hub_row.title,
      'subtitle', hub_row.subtitle,
      'description', hub_row.description,
      'logo_url', hub_row.logo_url,
      'banner_url', hub_row.banner_url,
      'background_url', hub_row.background_url,
      'profile_url', hub_row.profile_url,
      'theme', hub_row.theme,
      'primary_color', hub_row.primary_color,
      'secondary_color', hub_row.secondary_color,
      'font_family', hub_row.font_family,
      'seo_title', hub_row.seo_title,
      'seo_description', hub_row.seo_description,
      'favicon_url', hub_row.favicon_url,
      'status', hub_row.status,
      'whatsapp_number', hub_row.whatsapp_number,
      'contact_phone', hub_row.contact_phone,
      'contact_email', hub_row.contact_email,
      'contact_address', hub_row.contact_address,
      'map_embed_url', hub_row.map_embed_url,
      'layout_blocks', COALESCE(to_jsonb(hub_row.layout_blocks), '[]'::jsonb),
      'style_preset', hub_row.style_preset,
      'visual_config', COALESCE(hub_row.visual_config, '{}'::jsonb),
      'capture_config', public.smart_hub_public_capture_config(hub_row.capture_config),
      'public_booking_enabled', COALESCE(hub_row.public_booking_enabled, false),
      'updated_at', hub_row.updated_at
    ),
    'theme', (
      SELECT jsonb_build_object(
        'id', t.id,
        'hub_id', t.hub_id,
        'theme_name', t.theme_name,
        'primary_color', t.primary_color,
        'secondary_color', t.secondary_color,
        'accent_color', t.accent_color,
        'background_color', t.background_color,
        'text_color', t.text_color,
        'button_radius', t.button_radius,
        'font_family', t.font_family,
        'config_json', COALESCE(t.config_json, '{}'::jsonb),
        'status', t.status
      )
      FROM public.smart_hub_theme t
      WHERE t.hub_id = hub_row.id AND t.deleted_at IS NULL
      LIMIT 1
    ),
    'buttons', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'hub_id', b.hub_id,
          'title', b.title,
          'subtitle', b.subtitle,
          'icon', b.icon,
          'type', b.type,
          'url', b.url,
          'image', b.image,
          'image_alt', b.image_alt,
          'visual_variant', b.visual_variant,
          'image_position', b.image_position,
          'whatsapp_message', b.whatsapp_message,
          'click_action', b.click_action,
          'capture_config', public.smart_hub_public_button_capture_config(b.capture_config),
          'background_color', b.background_color,
          'text_color', b.text_color,
          'visible', b.visible,
          'order_index', b.order_index,
          'track_click', b.track_click,
          'status', b.status
        )
        ORDER BY b.order_index ASC, b.created_at ASC
      )
      FROM public.smart_hub_buttons b
      WHERE b.hub_id = hub_row.id
        AND b.deleted_at IS NULL
        AND b.visible = true
        AND b.status = 'active'
    ), '[]'::jsonb),
    'page', (
      SELECT jsonb_build_object(
        'id', p.id,
        'hub_id', p.hub_id,
        'title', p.title,
        'slug', p.slug,
        'layout_json', COALESCE(p.layout_json, '{}'::jsonb),
        'is_home', p.is_home,
        'status', p.status
      )
      FROM public.smart_hub_pages p
      WHERE p.hub_id = hub_row.id
        AND p.deleted_at IS NULL
        AND p.is_home = true
      ORDER BY p.created_at ASC
      LIMIT 1
    ),
    'assets', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'hub_id', a.hub_id,
          'file_name', a.file_name,
          'file_type', a.file_type,
          'public_url', a.public_url,
          'asset_kind', a.asset_kind,
          'status', a.status
        )
        ORDER BY a.created_at DESC
      )
      FROM public.smart_hub_assets a
      WHERE a.hub_id = hub_row.id
        AND a.deleted_at IS NULL
        AND a.status = 'active'
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_smart_hub(TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Agendamento online e formulário público (chamados pela página /hub/:slug)
-- ---------------------------------------------------------------------------

-- Dígitos do telefone sem o DDI 55.
CREATE OR REPLACE FUNCTION public.smart_hub_phone_key(p_phone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN length(d) > 11 AND left(d, 2) = '55' THEN substr(d, 3) ELSE d END
  FROM (SELECT regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g') AS d) s;
$$;

CREATE OR REPLACE FUNCTION public.smart_hub_format_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN length(d) = 11 THEN '(' || substr(d, 1, 2) || ') ' || substr(d, 3, 5) || '-' || substr(d, 8, 4)
    WHEN length(d) = 10 THEN '(' || substr(d, 1, 2) || ') ' || substr(d, 3, 4) || '-' || substr(d, 7, 4)
    ELSE d
  END
  FROM (SELECT left(public.smart_hub_phone_key(p_phone), 11) AS d) s;
$$;

-- Mesmo padrão de DEFAULT_BUSINESS_HOURS (src/lib/clinicSettings.ts).
CREATE OR REPLACE FUNCTION public.clinic_business_hours(p_hours JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_hours IS NULL OR jsonb_typeof(p_hours) <> 'object'
      THEN '{"days":[1,2,3,4,5],"start":"08:00","end":"18:00","breakStart":"12:00","breakEnd":"13:00"}'::jsonb
    ELSE p_hours
  END;
$$;

-- Horários livres: passo = duração do procedimento, respeitando o intervalo,
-- agendamentos ativos do profissional e horários já passados no fuso da clínica.
-- Com p_professional_id NULL, retorna a grade sem checar conflitos.
CREATE OR REPLACE FUNCTION public.smart_hub_available_slots(
  p_clinic_id UUID,
  p_professional_id UUID,
  p_from DATE,
  p_to DATE,
  p_duration INT
)
RETURNS TABLE (slot_date DATE, slot_start TIME, slot_end TIME)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_tz TEXT;
  v_hours JSONB;
  v_days INT[];
  v_periods INT[];
  v_local_now TIMESTAMP;
  v_today DATE;
  v_now_min INT;
  v_day DATE;
  v_min INT;
  v_start TIME;
  v_end TIME;
  i INT;
BEGIN
  IF p_duration IS NULL OR p_duration < 5 OR p_duration > 720 OR p_from IS NULL OR p_to IS NULL THEN
    RETURN;
  END IF;

  SELECT c.timezone, public.clinic_business_hours(c.business_hours)
  INTO v_tz, v_hours
  FROM public.clinics c
  WHERE c.id = p_clinic_id;

  IF v_hours IS NULL OR jsonb_typeof(v_hours->'days') IS DISTINCT FROM 'array' THEN
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(t.v::INT), '{}')
  INTO v_days
  FROM jsonb_array_elements_text(v_hours->'days') AS t(v);

  IF NULLIF(v_hours->>'breakStart', '') IS NOT NULL AND NULLIF(v_hours->>'breakEnd', '') IS NOT NULL THEN
    v_periods := ARRAY[
      (EXTRACT(EPOCH FROM (v_hours->>'start')::TIME) / 60)::INT,
      (EXTRACT(EPOCH FROM (v_hours->>'breakStart')::TIME) / 60)::INT,
      (EXTRACT(EPOCH FROM (v_hours->>'breakEnd')::TIME) / 60)::INT,
      (EXTRACT(EPOCH FROM (v_hours->>'end')::TIME) / 60)::INT
    ];
  ELSE
    v_periods := ARRAY[
      (EXTRACT(EPOCH FROM (v_hours->>'start')::TIME) / 60)::INT,
      (EXTRACT(EPOCH FROM (v_hours->>'end')::TIME) / 60)::INT
    ];
  END IF;

  v_local_now := now() AT TIME ZONE COALESCE(v_tz, 'America/Sao_Paulo');
  v_today := v_local_now::DATE;
  v_now_min := EXTRACT(HOUR FROM v_local_now)::INT * 60 + EXTRACT(MINUTE FROM v_local_now)::INT;

  v_day := GREATEST(p_from, v_today);
  WHILE v_day <= p_to LOOP
    IF EXTRACT(DOW FROM v_day)::INT = ANY (v_days) THEN
      i := 1;
      WHILE i < array_length(v_periods, 1) LOOP
        v_min := v_periods[i];
        WHILE v_min + p_duration <= v_periods[i + 1] AND v_min + p_duration < 1440 LOOP
          IF NOT (v_day = v_today AND v_min < v_now_min) THEN
            v_start := make_time(v_min / 60, v_min % 60, 0);
            v_end := make_time((v_min + p_duration) / 60, (v_min + p_duration) % 60, 0);
            IF p_professional_id IS NULL OR NOT EXISTS (
              SELECT 1
              FROM public.appointments a
              WHERE a.clinic_id = p_clinic_id
                AND a.professional_id = p_professional_id
                AND a.date = v_day
                AND a.status NOT IN ('cancelled', 'no_show')
                AND a.start_time < v_end
                AND v_start < a.end_time
            ) THEN
              slot_date := v_day;
              slot_start := v_start;
              slot_end := v_end;
              RETURN NEXT;
            END IF;
          END IF;
          v_min := v_min + p_duration;
        END LOOP;
        i := i + 2;
      END LOOP;
    END IF;
    v_day := v_day + 1;
  END LOOP;
END;
$$;

-- Hub alvo do agendamento: publicado, ou rascunho visto pelo dono (prévia).
CREATE OR REPLACE FUNCTION public.smart_hub_booking_target(p_slug TEXT, p_require_published BOOLEAN)
RETURNS public.smart_hubs
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_hub public.smart_hubs;
BEGIN
  SELECT * INTO v_hub
  FROM public.smart_hubs h
  WHERE h.slug = public.normalize_smart_hub_slug(p_slug)
    AND h.deleted_at IS NULL
    AND (
      h.status = 'published'
      OR (NOT p_require_published AND public.user_belongs_to_clinic(h.clinic_id))
    );
  RETURN v_hub;
END;
$$;

CREATE OR REPLACE FUNCTION public.smart_hub_booking_catalog(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hub public.smart_hubs;
  v_has_days BOOLEAN;
  v_professionals JSONB;
BEGIN
  v_hub := public.smart_hub_booking_target(p_slug, false);
  IF v_hub.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'hub_not_found');
  END IF;
  IF NOT COALESCE(v_hub.public_booking_enabled, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'booking_disabled');
  END IF;

  SELECT jsonb_array_length(COALESCE(public.clinic_business_hours(c.business_hours)->'days', '[]'::jsonb)) > 0
  INTO v_has_days
  FROM public.clinics c
  WHERE c.id = v_hub.clinic_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) ORDER BY p.name), '[]'::jsonb)
  INTO v_professionals
  FROM public.professionals p
  WHERE p.clinic_id = v_hub.clinic_id
    AND p.is_active
    AND COALESCE(v_has_days, false);

  RETURN jsonb_build_object(
    'ok', true,
    'booking_enabled', true,
    'procedures', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', pr.id,
          'name', pr.name,
          'duration_minutes', pr.duration_minutes,
          'professionals', v_professionals
        )
        ORDER BY pr.name
      )
      FROM public.procedures pr
      WHERE pr.clinic_id = v_hub.clinic_id
        AND pr.is_active
        AND pr.duration_minutes BETWEEN 5 AND 720
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.smart_hub_booking_availability(
  p_slug TEXT,
  p_procedure_id UUID,
  p_professional_id UUID,
  p_from_date DATE,
  p_to_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hub public.smart_hubs;
  v_proc public.procedures;
  v_prof public.professionals;
  v_tz TEXT;
BEGIN
  v_hub := public.smart_hub_booking_target(p_slug, false);
  IF v_hub.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'hub_not_found');
  END IF;
  IF NOT COALESCE(v_hub.public_booking_enabled, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'booking_disabled');
  END IF;
  IF p_from_date IS NULL OR p_to_date IS NULL OR p_to_date < p_from_date OR p_to_date - p_from_date > 31 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_date_range');
  END IF;

  SELECT * INTO v_proc
  FROM public.procedures
  WHERE id = p_procedure_id
    AND clinic_id = v_hub.clinic_id
    AND is_active
    AND duration_minutes BETWEEN 5 AND 720;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'procedure_not_found');
  END IF;

  SELECT * INTO v_prof
  FROM public.professionals
  WHERE id = p_professional_id AND clinic_id = v_hub.clinic_id AND is_active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'professional_not_found');
  END IF;

  SELECT timezone INTO v_tz FROM public.clinics WHERE id = v_hub.clinic_id;

  RETURN jsonb_build_object(
    'ok', true,
    'booking_enabled', true,
    'procedure', jsonb_build_object(
      'id', v_proc.id,
      'name', v_proc.name,
      'duration_minutes', v_proc.duration_minutes
    ),
    'professional', jsonb_build_object('id', v_prof.id, 'name', v_prof.name),
    'timezone', v_tz,
    'slots', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'date', s.slot_date,
          'start_time', to_char(s.slot_start, 'HH24:MI'),
          'end_time', to_char(s.slot_end, 'HH24:MI')
        )
        ORDER BY s.slot_date, s.slot_start
      )
      FROM public.smart_hub_available_slots(
        v_hub.clinic_id, v_prof.id, p_from_date, p_to_date, v_proc.duration_minutes
      ) s
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.smart_hub_booking_confirm(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hub public.smart_hubs;
  v_key TEXT := NULLIF(trim(p_payload->>'idempotency_key'), '');
  v_name TEXT := NULLIF(trim(p_payload->'patient'->>'name'), '');
  v_phone_key TEXT := public.smart_hub_phone_key(p_payload->'patient'->>'phone');
  v_email TEXT := NULLIF(trim(p_payload->'patient'->>'email'), '');
  v_cpf TEXT := NULLIF(regexp_replace(COALESCE(p_payload->'patient'->>'cpf', ''), '\D', '', 'g'), '');
  v_cpf_fmt TEXT;
  v_birth DATE;
  v_insurance TEXT := left(NULLIF(trim(p_payload->'patient'->>'insurance'), ''), 120);
  v_notes TEXT := NULLIF(trim(p_payload->>'notes'), '');
  v_procedure_id UUID;
  v_professional_id UUID;
  v_date DATE;
  v_start TIME;
  v_proc public.procedures;
  v_prof public.professionals;
  v_existing public.appointments;
  v_slot_date DATE;
  v_slot_start TIME;
  v_slot_end TIME;
  v_patient_id UUID;
  v_patient_name TEXT;
  v_patient_phone TEXT;
  v_duplicate BOOLEAN := false;
  v_appointment_id UUID;
BEGIN
  v_hub := public.smart_hub_booking_target(p_payload->>'slug', true);
  IF v_hub.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'hub_not_found');
  END IF;
  IF NOT COALESCE(v_hub.public_booking_enabled, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'booking_disabled');
  END IF;
  IF p_payload->'privacy_accepted' IS DISTINCT FROM 'true'::jsonb THEN
    RETURN jsonb_build_object('ok', false, 'code', 'privacy_required');
  END IF;

  IF v_key IS NULL OR length(v_key) > 100
     OR v_name IS NULL OR length(v_name) > 120
     OR length(v_phone_key) NOT BETWEEN 10 AND 11
     OR (v_email IS NOT NULL AND (length(v_email) > 254 OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'))
     OR (v_cpf IS NOT NULL AND length(v_cpf) <> 11)
     OR length(COALESCE(v_notes, '')) > 1000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload');
  END IF;

  BEGIN
    v_procedure_id := (p_payload->>'procedure_id')::UUID;
    v_professional_id := (p_payload->>'professional_id')::UUID;
    v_date := (p_payload->>'date')::DATE;
    v_start := (p_payload->>'start_time')::TIME;
    v_birth := NULLIF(p_payload->'patient'->>'birth_date', '')::DATE;
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload');
  END;
  IF v_procedure_id IS NULL OR v_professional_id IS NULL OR v_date IS NULL OR v_start IS NULL
     OR (v_birth IS NOT NULL AND (v_birth > CURRENT_DATE OR v_birth < DATE '1900-01-01')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload');
  END IF;
  IF v_cpf IS NOT NULL THEN
    v_cpf_fmt := substr(v_cpf, 1, 3) || '.' || substr(v_cpf, 4, 3) || '.' || substr(v_cpf, 7, 3) || '-' || substr(v_cpf, 10, 2);
  END IF;

  -- Serializa reservas do mesmo profissional para não vender o mesmo horário duas vezes.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_hub.clinic_id::TEXT || ':' || v_professional_id::TEXT, 0));

  SELECT * INTO v_existing
  FROM public.appointments
  WHERE clinic_id = v_hub.clinic_id AND booking_idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'success', true,
      'appointment_id', v_existing.id,
      'status', v_existing.status,
      'patient_id', v_existing.patient_id,
      'duplicate_patient', true,
      'slot', jsonb_build_object(
        'date', v_existing.date,
        'start_time', to_char(v_existing.start_time, 'HH24:MI'),
        'end_time', to_char(v_existing.end_time, 'HH24:MI'),
        'professional_id', v_existing.professional_id
      )
    );
  END IF;

  IF (
    SELECT count(*) FROM public.appointments a
    WHERE a.clinic_id = v_hub.clinic_id
      AND a.booking_idempotency_key IS NOT NULL
      AND a.created_at > now() - interval '10 minutes'
  ) >= 30 OR (
    SELECT count(*) FROM public.appointments a
    WHERE a.clinic_id = v_hub.clinic_id
      AND a.booking_idempotency_key IS NOT NULL
      AND a.date = v_date
      AND a.status NOT IN ('cancelled', 'no_show')
      AND public.smart_hub_phone_key(a.patient_phone) = v_phone_key
  ) >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'rate_limited');
  END IF;

  SELECT * INTO v_proc
  FROM public.procedures
  WHERE id = v_procedure_id
    AND clinic_id = v_hub.clinic_id
    AND is_active
    AND duration_minutes BETWEEN 5 AND 720;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'procedure_not_found');
  END IF;

  SELECT * INTO v_prof
  FROM public.professionals
  WHERE id = v_professional_id AND clinic_id = v_hub.clinic_id AND is_active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'professional_not_found');
  END IF;

  SELECT s.slot_date, s.slot_start, s.slot_end
  INTO v_slot_date, v_slot_start, v_slot_end
  FROM public.smart_hub_available_slots(v_hub.clinic_id, v_prof.id, v_date, v_date, v_proc.duration_minutes) s
  WHERE s.slot_start = v_start;
  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1
      FROM public.smart_hub_available_slots(v_hub.clinic_id, NULL, v_date, v_date, v_proc.duration_minutes) s
      WHERE s.slot_start = v_start
    ) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'slot_taken');
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', 'outside_work_schedule');
  END IF;

  -- Paciente já cadastrado: procura pelo CPF e depois pelo telefone.
  IF v_cpf IS NOT NULL THEN
    SELECT p.id, p.name, p.phone
    INTO v_patient_id, v_patient_name, v_patient_phone
    FROM public.patients p
    WHERE p.clinic_id = v_hub.clinic_id
      AND regexp_replace(COALESCE(p.cpf, ''), '\D', '', 'g') = v_cpf
    ORDER BY (p.status = 'active') DESC, p.created_at
    LIMIT 1;
  END IF;
  IF v_patient_id IS NULL THEN
    SELECT p.id, p.name, p.phone
    INTO v_patient_id, v_patient_name, v_patient_phone
    FROM public.patients p
    WHERE p.clinic_id = v_hub.clinic_id
      AND public.smart_hub_phone_key(p.phone) = v_phone_key
    ORDER BY (p.status = 'active') DESC, p.created_at
    LIMIT 1;
  END IF;

  IF v_patient_id IS NOT NULL THEN
    v_duplicate := true;
    -- Visitante anônimo só completa campos vazios; nunca sobrescreve o cadastro da clínica.
    UPDATE public.patients SET
      cpf = COALESCE(NULLIF(cpf, ''), v_cpf_fmt),
      birth_date = COALESCE(birth_date, v_birth),
      email = COALESCE(NULLIF(email, ''), v_email),
      insurance = COALESCE(NULLIF(insurance, ''), v_insurance),
      phone = CASE WHEN COALESCE(phone, '') = '' THEN public.smart_hub_format_phone(v_phone_key) ELSE phone END
    WHERE id = v_patient_id
    RETURNING phone INTO v_patient_phone;
  ELSE
    INSERT INTO public.patients (clinic_id, name, phone, email, cpf, birth_date, insurance)
    VALUES (
      v_hub.clinic_id, v_name, public.smart_hub_format_phone(v_phone_key), v_email,
      v_cpf_fmt, v_birth, v_insurance
    )
    RETURNING id, name, phone INTO v_patient_id, v_patient_name, v_patient_phone;
  END IF;

  INSERT INTO public.appointments (
    clinic_id, date, start_time, end_time, patient_name, patient_phone, patient_id,
    professional_id, procedure_name, procedure_id, procedure_price, status, payment_status,
    notes, booking_idempotency_key
  ) VALUES (
    v_hub.clinic_id, v_slot_date, v_slot_start, v_slot_end, v_patient_name, v_patient_phone, v_patient_id,
    v_prof.id, v_proc.name, v_proc.id, v_proc.default_price, 'confirmed', 'pending',
    concat_ws(E'\n', v_notes, 'Agendamento online Smart Hub (' || v_hub.slug || ')'), v_key
  )
  RETURNING id INTO v_appointment_id;

  INSERT INTO public.smart_hub_events (clinic_id, hub_id, event_type, event_name, payload)
  VALUES (
    v_hub.clinic_id, v_hub.id, 'booking_confirmed', v_proc.name,
    jsonb_build_object(
      'appointment_id', v_appointment_id,
      'professional_name', v_prof.name,
      'date', v_slot_date,
      'start_time', to_char(v_slot_start, 'HH24:MI')
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'success', true,
    'appointment_id', v_appointment_id,
    'status', 'confirmed',
    'patient_id', v_patient_id,
    'duplicate_patient', v_duplicate,
    'slot', jsonb_build_object(
      'date', v_slot_date,
      'start_time', to_char(v_slot_start, 'HH24:MI'),
      'end_time', to_char(v_slot_end, 'HH24:MI'),
      'professional_id', v_prof.id
    )
  );
END;
$$;

-- Formulário de contato do Smart Hub. Devolve as configurações públicas de captação
-- para o app montar mensagem de sucesso e redirecionamento (resolveCaptureConfig).
CREATE OR REPLACE FUNCTION public.smart_hub_capture_submit(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action TEXT := COALESCE(NULLIF(p_payload->>'action', ''), 'submit');
  v_hub public.smart_hubs;
  v_button public.smart_hub_buttons;
  v_hub_cfg JSONB;
  v_btn_cfg JSONB;
  v_name TEXT := left(NULLIF(trim(p_payload->>'name'), ''), 120);
  v_phone_key TEXT := public.smart_hub_phone_key(p_payload->>'phone');
  v_is_test BOOLEAN;
  v_stage TEXT;
  v_interest TEXT;
  v_lead_id UUID;
  v_created BOOLEAN := true;
  v_configs JSONB;
BEGIN
  IF v_action NOT IN ('submit', 'validate', 'test') THEN
    v_action := 'submit';
  END IF;
  v_is_test := v_action = 'test';

  SELECT * INTO v_hub
  FROM public.smart_hubs h
  WHERE h.slug = public.normalize_smart_hub_slug(p_payload->>'slug')
    AND h.deleted_at IS NULL
    AND h.status = 'published';

  IF v_action = 'validate' THEN
    IF v_hub.id IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false,
        'ready', false,
        'issues', jsonb_build_array('Publique o Smart Hub para receber contatos.'),
        'message', 'Corrija os seguintes itens:'
      );
    END IF;
    RETURN jsonb_build_object('ok', true, 'ready', true, 'message', 'Formulário pronto para receber contatos.');
  END IF;

  IF v_hub.id IS NULL OR (v_is_test AND NOT public.user_belongs_to_clinic(v_hub.clinic_id)) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'hub_unavailable');
  END IF;

  IF (p_payload->>'button_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT * INTO v_button
    FROM public.smart_hub_buttons b
    WHERE b.id = (p_payload->>'button_id')::UUID
      AND b.hub_id = v_hub.id
      AND b.deleted_at IS NULL;
  END IF;

  v_hub_cfg := CASE WHEN jsonb_typeof(v_hub.capture_config) = 'object' THEN v_hub.capture_config ELSE '{}'::jsonb END;
  v_btn_cfg := CASE WHEN jsonb_typeof(v_button.capture_config) = 'object' THEN v_button.capture_config ELSE '{}'::jsonb END;
  v_configs := jsonb_build_object(
    'hub_capture_config', public.smart_hub_public_capture_config(v_hub_cfg),
    'button_capture_config', public.smart_hub_public_button_capture_config(v_btn_cfg)
  );

  -- Honeypot preenchido: responde sucesso sem gravar (bot).
  IF NULLIF(trim(p_payload->>'website'), '') IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true) || v_configs;
  END IF;

  IF v_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_name');
  END IF;
  IF length(v_phone_key) NOT BETWEEN 10 AND 11 AND NOT v_is_test THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_phone');
  END IF;
  IF COALESCE(v_hub_cfg->'require_privacy_accept', 'true'::jsonb) <> 'false'::jsonb
     AND p_payload->'privacy_accepted' IS DISTINCT FROM 'true'::jsonb THEN
    RETURN jsonb_build_object('ok', false, 'code', 'consent_required');
  END IF;

  IF (
    SELECT count(*) FROM public.smart_hub_leads l
    WHERE l.hub_id = v_hub.id AND l.created_at > now() - interval '10 minutes'
  ) >= 30 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'rate_limited');
  END IF;

  v_stage := CASE
    WHEN v_btn_cfg->'use_hub_defaults' = 'false'::jsonb
      AND v_btn_cfg->>'initial_stage' IN ('new', 'contact', 'scheduled', 'won', 'lost')
      THEN v_btn_cfg->>'initial_stage'
    WHEN v_hub_cfg->>'initial_stage' IN ('new', 'contact', 'scheduled', 'won', 'lost')
      THEN v_hub_cfg->>'initial_stage'
    ELSE 'new'
  END;
  v_interest := left(COALESCE(
    NULLIF(trim(p_payload->>'interest'), ''),
    NULLIF(trim(v_btn_cfg->>'interest'), ''),
    v_button.title
  ), 200);

  IF NOT v_is_test THEN
    SELECT l.id INTO v_lead_id
    FROM public.smart_hub_leads l
    WHERE l.hub_id = v_hub.id AND NOT l.is_test AND l.phone_key = v_phone_key
    ORDER BY l.created_at DESC
    LIMIT 1;
  END IF;

  IF v_lead_id IS NOT NULL THEN
    v_created := false;
    UPDATE public.smart_hub_leads SET
      name = v_name,
      email = COALESCE(left(NULLIF(trim(p_payload->>'email'), ''), 254), email),
      interest = COALESCE(v_interest, interest),
      message = COALESCE(left(NULLIF(trim(p_payload->>'message'), ''), 2000), message),
      preferred_date = COALESCE(left(NULLIF(trim(p_payload->>'preferred_date'), ''), 40), preferred_date),
      preferred_time = COALESCE(left(NULLIF(trim(p_payload->>'preferred_time'), ''), 40), preferred_time)
    WHERE id = v_lead_id;
  ELSE
    INSERT INTO public.smart_hub_leads (
      clinic_id, hub_id, button_id, name, phone, phone_key, email, interest, message,
      preferred_date, preferred_time, stage, utm_source, utm_medium, utm_campaign,
      referrer, landing_url, privacy_accepted_at, is_test
    ) VALUES (
      v_hub.clinic_id, v_hub.id, v_button.id, v_name,
      public.smart_hub_format_phone(v_phone_key), v_phone_key,
      left(NULLIF(trim(p_payload->>'email'), ''), 254),
      v_interest,
      left(NULLIF(trim(p_payload->>'message'), ''), 2000),
      left(NULLIF(trim(p_payload->>'preferred_date'), ''), 40),
      left(NULLIF(trim(p_payload->>'preferred_time'), ''), 40),
      v_stage,
      left(p_payload->>'utm_source', 200),
      left(p_payload->>'utm_medium', 200),
      left(p_payload->>'utm_campaign', 200),
      left(p_payload->>'referrer', 500),
      left(p_payload->>'landing_url', 500),
      CASE WHEN p_payload->'privacy_accepted' = 'true'::jsonb THEN now() END,
      v_is_test
    )
    RETURNING id INTO v_lead_id;
  END IF;

  INSERT INTO public.smart_hub_events (clinic_id, hub_id, event_type, event_name, payload)
  VALUES (
    v_hub.clinic_id, v_hub.id,
    CASE WHEN v_created THEN 'form_submitted' ELSE 'form_duplicate' END,
    COALESCE(v_button.title, 'Formulário'),
    jsonb_build_object('button_id', v_button.id, 'lead_id', v_lead_id, 'test', v_is_test)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'result', CASE WHEN v_created THEN 'created' ELSE 'updated' END,
    'created', v_created,
    'duplicate', NOT v_created,
    'stage', v_stage,
    'lead_id', v_lead_id
  ) || v_configs;
END;
$$;

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON public.smart_hubs, public.smart_hub_pages, public.smart_hub_buttons,
  public.smart_hub_theme, public.smart_hub_assets
  TO anon;

REVOKE ALL ON FUNCTION public.provision_user_account(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.smart_hub_available_slots(UUID, UUID, DATE, DATE, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.smart_hub_booking_target(TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.ensure_my_clinic() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_clinic() TO authenticated;

GRANT EXECUTE ON FUNCTION public.smart_hub_booking_catalog(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.smart_hub_booking_availability(TEXT, UUID, UUID, DATE, DATE) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.smart_hub_booking_confirm(JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.smart_hub_capture_submit(JSONB) TO anon, authenticated;

-- Atualiza o cache de schema da API (PostgREST) para enxergar as tabelas novas.
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Origem: supabase/ATUALIZACAO_02_WHATSAPP_SURI.sql
-- ============================================================================

-- ============================================================================
-- ATUALIZAÇÃO 02 — WhatsApp automático via Suri
--
-- Rode no SQL Editor do Supabase (pode rodar mais de uma vez).
--
-- O SmartHub chama o webhook de gatilho de um fluxo da Suri:
--   * ao criar uma consulta (confirmação do agendamento);
--   * na véspera, a partir do horário configurado;
--   * no dia, X horas antes da consulta.
-- O fluxo da Suri responde chamando smart_hub_appointment_reply (confirmar,
-- cancelar ou pedir para remarcar) com o token enviado no webhook.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ---------------------------------------------------------------------------
-- Consultas: token público (vai para a Suri) e resposta do paciente
-- ---------------------------------------------------------------------------
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS public_token UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS patient_reply TEXT
    CHECK (patient_reply IN ('confirmed', 'cancelled', 'reschedule')),
  ADD COLUMN IF NOT EXISTS patient_replied_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_public_token
  ON public.appointments(public_token);

-- ---------------------------------------------------------------------------
-- Configuração por clínica
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clinic_whatsapp_settings (
  clinic_id UUID PRIMARY KEY REFERENCES public.clinics(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'suri' CHECK (provider IN ('suri')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  booking_enabled BOOLEAN NOT NULL DEFAULT true,
  booking_webhook_url TEXT
    CHECK (booking_webhook_url IS NULL OR booking_webhook_url ~ '^https://[^\s]+$'),
  day_before_enabled BOOLEAN NOT NULL DEFAULT true,
  day_before_time TIME NOT NULL DEFAULT '18:00',
  day_before_webhook_url TEXT
    CHECK (day_before_webhook_url IS NULL OR day_before_webhook_url ~ '^https://[^\s]+$'),
  same_day_enabled BOOLEAN NOT NULL DEFAULT false,
  same_day_hours_before INT NOT NULL DEFAULT 2 CHECK (same_day_hours_before BETWEEN 1 AND 12),
  same_day_webhook_url TEXT
    CHECK (same_day_webhook_url IS NULL OR same_day_webhook_url ~ '^https://[^\s]+$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_clinic_whatsapp_settings_updated_at ON public.clinic_whatsapp_settings;
CREATE TRIGGER trg_clinic_whatsapp_settings_updated_at
  BEFORE UPDATE ON public.clinic_whatsapp_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.clinic_whatsapp_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinic owner manages whatsapp settings" ON public.clinic_whatsapp_settings;
CREATE POLICY "Clinic owner manages whatsapp settings"
ON public.clinic_whatsapp_settings FOR ALL
USING (public.user_belongs_to_clinic(clinic_id))
WITH CHECK (public.user_belongs_to_clinic(clinic_id));

-- ---------------------------------------------------------------------------
-- Histórico de envios (um por consulta e tipo: nunca envia duas vezes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('booking', 'day_before', 'same_day', 'test')),
  phone TEXT NOT NULL,
  patient_name TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'error')),
  request_id BIGINT,
  http_status INT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_notifications_once
  ON public.whatsapp_notifications(appointment_id, kind)
  WHERE appointment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_clinic
  ON public.whatsapp_notifications(clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_queued
  ON public.whatsapp_notifications(request_id)
  WHERE status = 'queued';

ALTER TABLE public.whatsapp_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinic owner views whatsapp notifications" ON public.whatsapp_notifications;
CREATE POLICY "Clinic owner views whatsapp notifications"
ON public.whatsapp_notifications FOR SELECT
USING (public.user_belongs_to_clinic(clinic_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_whatsapp_settings TO authenticated;
REVOKE ALL ON public.whatsapp_notifications FROM anon, authenticated;
GRANT SELECT ON public.whatsapp_notifications TO authenticated;

-- ---------------------------------------------------------------------------
-- Payload enviado à Suri (chaves planas: @Integrations.<id>.nome etc.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_appointment_payload(p_appointment_id UUID, p_kind TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'evento', p_kind,
    'teste', false,
    'telefone', '55' || public.smart_hub_phone_key(COALESCE(NULLIF(a.patient_phone, ''), pt.phone)),
    'nome', a.patient_name,
    'primeiro_nome', split_part(btrim(a.patient_name), ' ', 1),
    'data', to_char(a.date, 'DD/MM/YYYY'),
    'dia_semana', (ARRAY['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
                         'quinta-feira', 'sexta-feira', 'sábado'])[EXTRACT(DOW FROM a.date)::INT + 1],
    'horario', to_char(a.start_time, 'HH24:MI'),
    'horario_fim', to_char(a.end_time, 'HH24:MI'),
    'procedimento', a.procedure_name,
    'profissional', COALESCE(pr.name, ''),
    'clinica', c.name,
    'status', a.status,
    'token', a.public_token::TEXT
  )
  FROM public.appointments a
  JOIN public.clinics c ON c.id = a.clinic_id
  LEFT JOIN public.professionals pr ON pr.id = a.professional_id
  LEFT JOIN public.patients pt ON pt.id = a.patient_id
  WHERE a.id = p_appointment_id;
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_webhook_url(
  p_settings public.clinic_whatsapp_settings,
  p_kind TEXT,
  p_ignore_toggles BOOLEAN DEFAULT false
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(btrim(CASE p_kind
    WHEN 'booking' THEN CASE WHEN p_ignore_toggles OR p_settings.booking_enabled THEN p_settings.booking_webhook_url END
    WHEN 'day_before' THEN CASE WHEN p_ignore_toggles OR p_settings.day_before_enabled THEN p_settings.day_before_webhook_url END
    WHEN 'same_day' THEN CASE WHEN p_ignore_toggles OR p_settings.same_day_enabled THEN p_settings.same_day_webhook_url END
  END), '');
$$;

-- Registra o envio e coloca a chamada HTTP na fila do pg_net.
CREATE OR REPLACE FUNCTION public.whatsapp_post(
  p_clinic_id UUID,
  p_appointment_id UUID,
  p_kind TEXT,
  p_url TEXT,
  p_payload JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_request BIGINT;
BEGIN
  IF length(COALESCE(p_payload->>'telefone', '')) NOT BETWEEN 12 AND 13 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.whatsapp_notifications (clinic_id, appointment_id, kind, phone, patient_name)
  VALUES (p_clinic_id, p_appointment_id, p_kind, p_payload->>'telefone', p_payload->>'nome')
  ON CONFLICT (appointment_id, kind) WHERE appointment_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    SELECT net.http_post(
      url := p_url,
      body := p_payload,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 15000
    ) INTO v_request;
    UPDATE public.whatsapp_notifications SET request_id = v_request WHERE id = v_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.whatsapp_notifications
    SET status = 'error', error = left(SQLERRM, 300), updated_at = now()
    WHERE id = v_id;
  END;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_dispatch(p_appointment_id UUID, p_kind TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.clinic_whatsapp_settings%ROWTYPE;
  v_clinic_id UUID;
  v_url TEXT;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM public.appointments WHERE id = p_appointment_id;
  IF v_clinic_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_settings
  FROM public.clinic_whatsapp_settings
  WHERE clinic_id = v_clinic_id AND is_active;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_url := public.whatsapp_webhook_url(v_settings, p_kind);
  IF v_url IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN public.whatsapp_post(
    v_clinic_id,
    p_appointment_id,
    p_kind,
    v_url,
    public.whatsapp_appointment_payload(p_appointment_id, p_kind)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Gatilhos na tabela de consultas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_on_appointment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_local_now TIMESTAMP;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Consulta remarcada: os lembretes valem para a nova data.
    IF (NEW.date, NEW.start_time) IS DISTINCT FROM (OLD.date, OLD.start_time) THEN
      DELETE FROM public.whatsapp_notifications
      WHERE appointment_id = NEW.id AND kind IN ('day_before', 'same_day');
    END IF;
    RETURN NEW;
  END IF;

  SELECT now() AT TIME ZONE c.timezone INTO v_local_now
  FROM public.clinics c WHERE c.id = NEW.clinic_id;

  IF NEW.status IN ('pending', 'confirmed', 'return')
     AND (NEW.date + NEW.start_time) > v_local_now THEN
    PERFORM public.whatsapp_dispatch(NEW.id, 'booking');
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Falha no envio nunca pode impedir o agendamento.
  RAISE WARNING 'whatsapp_on_appointment_change: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_whatsapp ON public.appointments;
CREATE TRIGGER trg_appointments_whatsapp
  AFTER INSERT OR UPDATE OF date, start_time ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.whatsapp_on_appointment_change();

-- ---------------------------------------------------------------------------
-- Respostas do pg_net → status do envio
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_sync_responses()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
BEGIN
  BEGIN
    UPDATE public.whatsapp_notifications w
    SET status = CASE WHEN r.status_code BETWEEN 200 AND 299 THEN 'sent' ELSE 'error' END,
        http_status = r.status_code,
        error = CASE
          WHEN r.status_code BETWEEN 200 AND 299 THEN NULL
          WHEN r.timed_out THEN 'A Suri não respondeu a tempo.'
          ELSE left(COALESCE(NULLIF(r.error_msg, ''), r.content, 'Erro HTTP ' || r.status_code), 300)
        END,
        updated_at = now()
    FROM net._http_response r
    WHERE w.status = 'queued' AND w.request_id = r.id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'whatsapp_sync_responses: %', SQLERRM;
  END;

  UPDATE public.whatsapp_notifications
  SET status = 'error', error = 'Sem resposta da Suri.', updated_at = now()
  WHERE status = 'queued' AND created_at < now() - INTERVAL '30 minutes';

  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- Lembretes (roda a cada 5 minutos pelo pg_cron)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_dispatch_due()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_sent INT := 0;
BEGIN
  PERFORM public.whatsapp_sync_responses();

  FOR r IN
    SELECT a.id, 'day_before'::TEXT AS kind
    FROM public.appointments a
    JOIN public.clinics c ON c.id = a.clinic_id
    JOIN public.clinic_whatsapp_settings s ON s.clinic_id = a.clinic_id
    CROSS JOIN LATERAL (SELECT now() AT TIME ZONE c.timezone AS local_now) t
    WHERE s.is_active
      AND s.day_before_enabled
      AND COALESCE(btrim(s.day_before_webhook_url), '') <> ''
      AND a.status IN ('pending', 'confirmed', 'return')
      AND a.date = t.local_now::DATE + 1
      AND t.local_now::TIME >= s.day_before_time
      -- Agendou depois do horário do lembrete: a confirmação já basta.
      AND (a.created_at AT TIME ZONE c.timezone) < ((a.date - 1) + s.day_before_time)
      AND NOT EXISTS (
        SELECT 1 FROM public.whatsapp_notifications w
        WHERE w.appointment_id = a.id AND w.kind = 'day_before'
      )
    UNION ALL
    SELECT a.id, 'same_day'::TEXT
    FROM public.appointments a
    JOIN public.clinics c ON c.id = a.clinic_id
    JOIN public.clinic_whatsapp_settings s ON s.clinic_id = a.clinic_id
    CROSS JOIN LATERAL (SELECT now() AT TIME ZONE c.timezone AS local_now) t
    WHERE s.is_active
      AND s.same_day_enabled
      AND COALESCE(btrim(s.same_day_webhook_url), '') <> ''
      AND a.status IN ('pending', 'confirmed', 'return')
      AND a.date = t.local_now::DATE
      AND t.local_now >= (a.date + a.start_time) - make_interval(hours => s.same_day_hours_before)
      AND t.local_now < (a.date + a.start_time)
      AND (a.created_at AT TIME ZONE c.timezone)
          < (a.date + a.start_time) - make_interval(hours => s.same_day_hours_before)
      AND NOT EXISTS (
        SELECT 1 FROM public.whatsapp_notifications w
        WHERE w.appointment_id = a.id AND w.kind = 'same_day'
      )
  LOOP
    IF public.whatsapp_dispatch(r.id, r.kind) IS NOT NULL THEN
      v_sent := v_sent + 1;
    END IF;
  END LOOP;

  RETURN v_sent;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'smarthub-whatsapp-lembretes') THEN
    PERFORM cron.unschedule('smarthub-whatsapp-lembretes');
  END IF;
  PERFORM cron.schedule(
    'smarthub-whatsapp-lembretes',
    '*/5 * * * *',
    'SELECT public.whatsapp_dispatch_due()'
  );
END $$;

-- ---------------------------------------------------------------------------
-- Resposta do paciente (chamada pela "Requisição HTTP" do fluxo da Suri)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.smart_hub_appointment_reply(p_token TEXT, p_action TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token UUID;
  v_action TEXT := lower(btrim(COALESCE(p_action, '')));
  v_appt public.appointments%ROWTYPE;
  v_local_now TIMESTAMP;
  v_when TEXT;
BEGIN
  BEGIN
    v_token := btrim(p_token)::UUID;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'token_invalido',
      'mensagem', 'Não encontramos esta consulta.');
  END;

  v_action := CASE
    WHEN v_action IN ('confirm', 'confirmar', 'confirmado', 'sim') THEN 'confirm'
    WHEN v_action IN ('cancel', 'cancelar', 'cancelado', 'nao', 'não') THEN 'cancel'
    WHEN v_action IN ('reschedule', 'remarcar', 'reagendar') THEN 'reschedule'
    ELSE NULL
  END;
  IF v_action IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'acao_invalida',
      'mensagem', 'Use confirmar, cancelar ou remarcar.');
  END IF;

  SELECT * INTO v_appt FROM public.appointments WHERE public_token = v_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'token_invalido',
      'mensagem', 'Não encontramos esta consulta.');
  END IF;

  SELECT now() AT TIME ZONE c.timezone INTO v_local_now
  FROM public.clinics c WHERE c.id = v_appt.clinic_id;
  v_when := to_char(v_appt.date, 'DD/MM') || ' às ' || to_char(v_appt.start_time, 'HH24:MI');

  IF (v_appt.date + v_appt.start_time) <= v_local_now
     OR v_appt.status IN ('completed', 'no_show') THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'consulta_passada',
      'mensagem', 'Esta consulta já aconteceu. Fale com a clínica se precisar de ajuda.');
  END IF;

  IF v_appt.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'consulta_cancelada',
      'mensagem', 'Esta consulta já está cancelada. Fale com a clínica para agendar novamente.');
  END IF;

  IF v_action = 'confirm' THEN
    UPDATE public.appointments
    SET status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END,
        patient_reply = 'confirmed', patient_replied_at = now()
    WHERE id = v_appt.id;
    RETURN jsonb_build_object('ok', true, 'codigo', 'confirmada', 'status', 'confirmed',
      'mensagem', 'Consulta confirmada! Te esperamos em ' || v_when || '.');
  END IF;

  IF v_action = 'cancel' THEN
    UPDATE public.appointments
    SET status = 'cancelled', patient_reply = 'cancelled', patient_replied_at = now()
    WHERE id = v_appt.id;
    RETURN jsonb_build_object('ok', true, 'codigo', 'cancelada', 'status', 'cancelled',
      'mensagem', 'Consulta de ' || v_when || ' cancelada.');
  END IF;

  UPDATE public.appointments
  SET patient_reply = 'reschedule', patient_replied_at = now(),
      notes = concat_ws(E'\n', NULLIF(btrim(notes), ''),
        'Paciente pediu para remarcar pelo WhatsApp em '
        || to_char(v_local_now, 'DD/MM/YYYY HH24:MI') || '.')
  WHERE id = v_appt.id;
  RETURN jsonb_build_object('ok', true, 'codigo', 'remarcar', 'status', v_appt.status,
    'mensagem', 'Pedido de remarcação recebido. A clínica vai falar com você.');
END;
$$;

-- ---------------------------------------------------------------------------
-- Envio de teste (tela WhatsApp do app)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_send_test(p_clinic_id UUID, p_kind TEXT, p_phone TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.clinic_whatsapp_settings%ROWTYPE;
  v_url TEXT;
  v_phone TEXT := public.smart_hub_phone_key(p_phone);
  v_clinic_name TEXT;
  v_tomorrow DATE;
  v_id UUID;
BEGIN
  IF NOT public.user_belongs_to_clinic(p_clinic_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta clínica.' USING ERRCODE = '42501';
  END IF;
  IF p_kind NOT IN ('booking', 'day_before', 'same_day') THEN
    RETURN jsonb_build_object('ok', false, 'mensagem', 'Tipo de mensagem inválido.');
  END IF;
  IF length(v_phone) NOT BETWEEN 10 AND 11 THEN
    RETURN jsonb_build_object('ok', false, 'mensagem', 'Informe um telefone com DDD.');
  END IF;

  SELECT * INTO v_settings FROM public.clinic_whatsapp_settings WHERE clinic_id = p_clinic_id;
  v_url := CASE WHEN FOUND THEN public.whatsapp_webhook_url(v_settings, p_kind, true) END;
  IF v_url IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'mensagem', 'Salve a URL do webhook desta mensagem antes de testar.');
  END IF;

  IF (SELECT count(*) FROM public.whatsapp_notifications
      WHERE clinic_id = p_clinic_id AND kind = 'test'
        AND created_at > now() - INTERVAL '1 hour') >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'mensagem', 'Limite de 10 testes por hora atingido.');
  END IF;

  SELECT c.name, (now() AT TIME ZONE c.timezone)::DATE + 1
  INTO v_clinic_name, v_tomorrow
  FROM public.clinics c WHERE c.id = p_clinic_id;

  v_id := public.whatsapp_post(
    p_clinic_id,
    NULL,
    'test',
    v_url,
    jsonb_build_object(
      'evento', p_kind,
      'teste', true,
      'telefone', '55' || v_phone,
      'nome', 'Paciente Teste',
      'primeiro_nome', 'Paciente',
      'data', to_char(v_tomorrow, 'DD/MM/YYYY'),
      'dia_semana', (ARRAY['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
                           'quinta-feira', 'sexta-feira', 'sábado'])[EXTRACT(DOW FROM v_tomorrow)::INT + 1],
      'horario', '09:00',
      'horario_fim', '09:30',
      'procedimento', 'Consulta',
      'profissional', 'Profissional de teste',
      'clinica', COALESCE(v_clinic_name, ''),
      'status', 'pending',
      'token', '00000000-0000-0000-0000-000000000000'
    )
  );

  RETURN jsonb_build_object('ok', v_id IS NOT NULL, 'id', v_id,
    'mensagem', CASE WHEN v_id IS NULL THEN 'Não foi possível enviar o teste.' ELSE 'Teste enviado para a Suri.' END);
END;
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_refresh_status()
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.whatsapp_sync_responses();
$$;

REVOKE ALL ON FUNCTION public.whatsapp_appointment_payload(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.whatsapp_post(UUID, UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.whatsapp_dispatch(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.whatsapp_sync_responses() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.whatsapp_dispatch_due() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.whatsapp_on_appointment_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.whatsapp_send_test(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.whatsapp_refresh_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.smart_hub_appointment_reply(TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.whatsapp_send_test(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_refresh_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.smart_hub_appointment_reply(TEXT, TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
