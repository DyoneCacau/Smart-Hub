/**
 * Resolução de captação Smart Hub (Edge / Deno).
 * Espelha a lógica de `src/services/smartHub/resolveCaptureConfig.ts`.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const OWNER_SENTINELS = new Set([
  '',
  'null',
  'undefined',
  'none',
  'no_owner',
  'hub_default',
  'default',
  '__none__',
  'sem responsavel',
  'sem responsável',
])

const ALLOWED_STAGES = new Set(['new', 'contact', 'scheduled', 'won', 'lost'])

export function normalizeOwnerUserId(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (OWNER_SENTINELS.has(trimmed.toLowerCase())) return null
  if (!UUID_RE.test(trimmed)) return null
  return trimmed
}

export function normalizeStage(value: unknown): string {
  if (typeof value === 'string' && ALLOWED_STAGES.has(value)) return value
  return 'new'
}

export function normalizePhoneDigits(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const digits = value.replace(/\D/g, '')
  return digits.length >= 10 ? digits : null
}

export interface ResolvedCaptureEdge {
  form_title: string
  success_message: string
  require_privacy_accept: boolean
  privacy_version: string
  initial_stage: string
  owner_user_id: string | null
  interest: string | null
  redirect_whatsapp_after_submit: boolean
  whatsapp_phone: string | null
  whatsapp_message: string | null
  redirect_url: string | null
  using_hub_defaults: boolean
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function buttonUsesHubDefaults(button: Record<string, unknown>): boolean {
  if (button.use_hub_defaults === true) return true
  if (button.use_hub_defaults === false) return false
  const hasOwner = normalizeOwnerUserId(button.owner_user_id) != null
  const stage = typeof button.initial_stage === 'string' ? button.initial_stage : 'new'
  const hasCustomStage = stage !== 'new' && ALLOWED_STAGES.has(stage)
  const hasWaRedirect = Boolean(button.redirect_whatsapp_after_submit)
  const hasWaPhone = Boolean(normalizePhoneDigits(String(button.whatsapp_phone || '')))
  if (!hasOwner && !hasCustomStage && !hasWaRedirect && !hasWaPhone) return true
  return false
}

export function resolveCaptureConfigEdge(
  hubConfig: unknown,
  buttonConfig: unknown,
): ResolvedCaptureEdge {
  const hub = asRecord(hubConfig)
  const button = asRecord(buttonConfig)
  const usingHubDefaults = buttonUsesHubDefaults(button)

  const stage = usingHubDefaults
    ? normalizeStage(hub.initial_stage)
    : normalizeStage(button.initial_stage ?? hub.initial_stage)

  const owner = usingHubDefaults
    ? normalizeOwnerUserId(hub.default_owner_user_id)
    : normalizeOwnerUserId(button.owner_user_id) ??
      normalizeOwnerUserId(hub.default_owner_user_id)

  const redirectWa = usingHubDefaults
    ? Boolean(hub.redirect_whatsapp_after_submit)
    : Boolean(button.redirect_whatsapp_after_submit ?? hub.redirect_whatsapp_after_submit)

  const waPhone = usingHubDefaults
    ? normalizePhoneDigits(String(hub.whatsapp_phone || ''))
    : normalizePhoneDigits(String(button.whatsapp_phone || '')) ||
      normalizePhoneDigits(String(hub.whatsapp_phone || ''))

  const waMessage = usingHubDefaults
    ? (typeof hub.whatsapp_followup_message === 'string'
      ? hub.whatsapp_followup_message
      : typeof hub.whatsapp_message === 'string'
      ? hub.whatsapp_message
      : null)
    : (typeof button.whatsapp_message === 'string' && button.whatsapp_message
      ? button.whatsapp_message
      : typeof hub.whatsapp_followup_message === 'string'
      ? hub.whatsapp_followup_message
      : typeof hub.whatsapp_message === 'string'
      ? hub.whatsapp_message
      : null)

  const redirectUrl = usingHubDefaults
    ? (typeof hub.redirect_url === 'string' ? hub.redirect_url : null)
    : (typeof button.redirect_url === 'string' && button.redirect_url
      ? button.redirect_url
      : typeof hub.redirect_url === 'string'
      ? hub.redirect_url
      : null)

  return {
    form_title: typeof hub.form_title === 'string' && hub.form_title
      ? hub.form_title
      : 'Fale conosco',
    success_message: typeof hub.success_message === 'string' && hub.success_message
      ? hub.success_message
      : 'Recebemos seus dados. Nossa equipe entrará em contato.',
    require_privacy_accept: hub.require_privacy_accept !== false,
    privacy_version: typeof hub.privacy_version === 'string' && hub.privacy_version
      ? hub.privacy_version
      : 'v1',
    initial_stage: stage,
    owner_user_id: owner,
    interest: typeof button.interest === 'string' ? button.interest : null,
    redirect_whatsapp_after_submit: redirectWa,
    whatsapp_phone: waPhone,
    whatsapp_message: waMessage,
    redirect_url: redirectUrl,
    using_hub_defaults: usingHubDefaults,
  }
}

export function newRequestId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `req_${Date.now().toString(36)}`
  }
}
