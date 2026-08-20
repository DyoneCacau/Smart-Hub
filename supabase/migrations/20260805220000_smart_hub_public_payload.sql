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
