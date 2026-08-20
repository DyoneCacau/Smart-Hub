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
