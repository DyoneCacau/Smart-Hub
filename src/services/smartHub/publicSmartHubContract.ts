/**
 * Contrato do payload público de get_public_smart_hub (PRODUCAO_40).
 * Usado em testes para garantir que campos internos não vazam no JSON público.
 */

export const PUBLIC_HUB_ALLOWED_KEYS = [
  'id',
  'slug',
  'title',
  'subtitle',
  'description',
  'logo_url',
  'banner_url',
  'background_url',
  'profile_url',
  'theme',
  'primary_color',
  'secondary_color',
  'font_family',
  'seo_title',
  'seo_description',
  'favicon_url',
  'status',
  'whatsapp_number',
  'contact_phone',
  'contact_email',
  'contact_address',
  'map_embed_url',
  'layout_blocks',
  'style_preset',
  'visual_config',
  'capture_config',
  'public_booking_enabled',
  'updated_at',
] as const;

export const PUBLIC_HUB_FORBIDDEN_KEYS = [
  'clinic_id',
  'template_id',
  'published_at',
  'paused_at',
  'last_validated_at',
  'validation_errors',
  'created_at',
  'created_by',
  'updated_by',
  'deleted_at',
  'owner_id',
] as const;

export const PUBLIC_CAPTURE_ALLOWED_KEYS = [
  'mode',
  'form_title',
  'form_description',
  'submit_label',
  'success_message',
  'redirect_url',
  'redirect_whatsapp_after_submit',
  'whatsapp_phone',
  'whatsapp_message',
  'whatsapp_followup_message',
  'require_privacy_accept',
  'privacy_text',
  'privacy_url',
  'privacy_version',
  'fields',
  'manual_copy_message',
] as const;

export const PUBLIC_CAPTURE_FORBIDDEN_KEYS = [
  'default_owner_user_id',
  'initial_stage',
  'dedupe_mode',
  'owner_user_id',
] as const;

export const PUBLIC_ASSET_FORBIDDEN_KEYS = [
  'clinic_id',
  'storage_path',
  'created_by',
  'updated_by',
  'deleted_at',
] as const;

export function sanitizePublicCaptureConfig(
  cfg: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!cfg || typeof cfg !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const key of PUBLIC_CAPTURE_ALLOWED_KEYS) {
    if (key in cfg && cfg[key] !== undefined) out[key] = cfg[key];
  }
  return out;
}

export function findForbiddenPublicKeys(
  obj: Record<string, unknown> | null | undefined,
  forbidden: readonly string[]
): string[] {
  if (!obj || typeof obj !== 'object') return [];
  return forbidden.filter((k) => Object.prototype.hasOwnProperty.call(obj, k));
}

/** Espelha o subset do hub retornado pela RPC (para testes de contrato). */
export function buildPublicHubJson(
  hub: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of PUBLIC_HUB_ALLOWED_KEYS) {
    if (key === 'capture_config') {
      out.capture_config = sanitizePublicCaptureConfig(
        hub.capture_config as Record<string, unknown> | undefined
      );
      continue;
    }
    if (key in hub) out[key] = hub[key];
  }
  if (!('public_booking_enabled' in out)) {
    out.public_booking_enabled = false;
  }
  return out;
}
