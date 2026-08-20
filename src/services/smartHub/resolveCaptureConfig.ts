/**
 * Resolução centralizada da configuração de captação Smart Hub.
 * Usada no frontend (admin + formulário público).
 * A Edge Function mantém lógica equivalente em `_shared/smartHubCaptureResolve.ts`.
 */

import type {
  SmartHubButtonCaptureConfig,
  SmartHubCaptureConfig,
} from '@/types/smartHub';
import { defaultCaptureConfig } from './captureDefaults';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
]);

const ALLOWED_STAGES = new Set(['new', 'contact', 'scheduled', 'won', 'lost']);

/** Normaliza responsável: só UUID válido ou null. Nunca envia sentinelas ao banco. */
export function normalizeOwnerUserId(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (OWNER_SENTINELS.has(trimmed.toLowerCase())) return null;
  if (!UUID_RE.test(trimmed)) return null;
  return trimmed;
}

/** Rejeita sentinelas inválidas na UI administrativa (antes de salvar). */
export function assertValidOwnerInput(value: unknown): {
  ok: true;
  owner: string | null;
} | { ok: false; message: string } {
  if (value == null || value === '' || value === '__none__') {
    return { ok: true, owner: null };
  }
  if (typeof value !== 'string') {
    return { ok: false, message: 'Responsável inválido.' };
  }
  const trimmed = value.trim();
  if (OWNER_SENTINELS.has(trimmed.toLowerCase())) {
    return { ok: true, owner: null };
  }
  if (!UUID_RE.test(trimmed)) {
    return {
      ok: false,
      message: 'Selecione um responsável válido ou “Sem responsável”.',
    };
  }
  return { ok: true, owner: trimmed };
}

export function normalizeStage(value: unknown): 'new' | 'contact' | 'scheduled' | 'won' | 'lost' {
  if (typeof value === 'string' && ALLOWED_STAGES.has(value)) {
    return value as 'new' | 'contact' | 'scheduled' | 'won' | 'lost';
  }
  return 'new';
}

export function normalizePhoneDigits(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10 ? digits : null;
}

export interface ResolvedCaptureConfig {
  form_title: string;
  form_description: string;
  submit_label: string;
  success_message: string;
  require_privacy_accept: boolean;
  privacy_text: string;
  privacy_url: string | null;
  privacy_version: string;
  initial_stage: 'new' | 'contact' | 'scheduled' | 'won' | 'lost';
  owner_user_id: string | null;
  interest: string | null;
  redirect_whatsapp_after_submit: boolean;
  whatsapp_phone: string | null;
  whatsapp_message: string | null;
  whatsapp_followup_message: string | null;
  redirect_url: string | null;
  fields: SmartHubCaptureConfig['fields'];
  /** true quando o botão usa só os padrões do Hub (CRM) */
  using_hub_defaults: boolean;
}

function buttonUsesHubDefaults(button?: SmartHubButtonCaptureConfig | null): boolean {
  if (!button) return true;
  if (button.use_hub_defaults === true) return true;
  if (button.use_hub_defaults === false) return false;
  // Legado sem flag: se não há override explícito de CRM, trata como padrão do Hub
  const hasOwner = normalizeOwnerUserId(button.owner_user_id) != null;
  const hasCustomStage =
    typeof button.initial_stage === 'string' &&
    button.initial_stage !== 'new' &&
    ALLOWED_STAGES.has(button.initial_stage);
  const hasWaRedirect = Boolean(button.redirect_whatsapp_after_submit);
  const hasWaPhone = Boolean(normalizePhoneDigits(button.whatsapp_phone || ''));
  // Legado com initial_stage:'new' + owner null + sem WA = equivalente ao padrão
  if (!hasOwner && !hasCustomStage && !hasWaRedirect && !hasWaPhone) return true;
  return false;
}

/**
 * Prioridade:
 * 1. override válido do botão (quando use_hub_defaults === false ou legado com override)
 * 2. configuração do Hub
 * 3. defaults seguros do sistema
 */
export function resolveCaptureConfig(
  hubConfig?: SmartHubCaptureConfig | null,
  buttonConfig?: SmartHubButtonCaptureConfig | null
): ResolvedCaptureConfig {
  const hub = defaultCaptureConfig(hubConfig || {});
  const usingHubDefaults = buttonUsesHubDefaults(buttonConfig);

  const stage = usingHubDefaults
    ? normalizeStage(hub.initial_stage)
    : normalizeStage(buttonConfig?.initial_stage ?? hub.initial_stage);

  const owner = usingHubDefaults
    ? normalizeOwnerUserId(hub.default_owner_user_id)
    : normalizeOwnerUserId(buttonConfig?.owner_user_id) ??
      normalizeOwnerUserId(hub.default_owner_user_id);

  const redirectWa = usingHubDefaults
    ? Boolean(hub.redirect_whatsapp_after_submit)
    : Boolean(
        buttonConfig?.redirect_whatsapp_after_submit ?? hub.redirect_whatsapp_after_submit
      );

  const waPhone = usingHubDefaults
    ? normalizePhoneDigits(hub.whatsapp_phone || '') || null
    : normalizePhoneDigits(buttonConfig?.whatsapp_phone || '') ||
      normalizePhoneDigits(hub.whatsapp_phone || '') ||
      null;

  const waMessage = usingHubDefaults
    ? hub.whatsapp_followup_message || hub.whatsapp_message || null
    : buttonConfig?.whatsapp_message ||
      hub.whatsapp_followup_message ||
      hub.whatsapp_message ||
      null;

  const redirectUrl = usingHubDefaults
    ? hub.redirect_url || null
    : buttonConfig?.redirect_url || hub.redirect_url || null;

  return {
    form_title: hub.form_title || 'Fale conosco',
    form_description: hub.form_description || '',
    submit_label: hub.submit_label || 'Enviar',
    success_message:
      hub.success_message || 'Recebemos seus dados. Nossa equipe entrará em contato.',
    require_privacy_accept: hub.require_privacy_accept !== false,
    privacy_text: hub.privacy_text || '',
    privacy_url: hub.privacy_url || null,
    privacy_version: hub.privacy_version || 'v1',
    initial_stage: stage,
    owner_user_id: owner,
    interest: buttonConfig?.interest || null,
    redirect_whatsapp_after_submit: redirectWa,
    whatsapp_phone: waPhone,
    whatsapp_message: waMessage,
    whatsapp_followup_message: hub.whatsapp_followup_message || null,
    redirect_url: redirectUrl,
    fields: hub.fields,
    using_hub_defaults: usingHubDefaults,
  };
}

/** Payload mínimo do botão quando usa padrão do Hub. */
export function buildButtonCaptureConfig(input: {
  interest?: string | null;
  useHubDefaults: boolean;
  initial_stage?: string | null;
  owner_user_id?: string | null;
  redirect_whatsapp_after_submit?: boolean;
  whatsapp_phone?: string | null;
  whatsapp_message?: string | null;
  redirect_url?: string | null;
  open_in_new_tab?: boolean;
  email_subject?: string | null;
  use_hub_form?: boolean;
}): SmartHubButtonCaptureConfig {
  const ownerCheck = assertValidOwnerInput(input.owner_user_id);
  const owner = ownerCheck.ok ? ownerCheck.owner : null;

  if (input.useHubDefaults) {
    return {
      use_hub_defaults: true,
      use_hub_form: input.use_hub_form ?? true,
      interest: input.interest || null,
      open_in_new_tab: input.open_in_new_tab,
      email_subject: input.email_subject || null,
    };
  }

  return {
    use_hub_defaults: false,
    use_hub_form: input.use_hub_form ?? true,
    interest: input.interest || null,
    initial_stage: normalizeStage(input.initial_stage),
    owner_user_id: owner,
    redirect_whatsapp_after_submit: Boolean(input.redirect_whatsapp_after_submit),
    whatsapp_phone: input.whatsapp_phone || null,
    whatsapp_message: input.whatsapp_message || null,
    redirect_url: input.redirect_url || null,
    open_in_new_tab: input.open_in_new_tab,
    email_subject: input.email_subject || null,
  };
}

export const CAPTURE_PUBLIC_ERROR_MESSAGES: Record<string, string> = {
  invalid_phone: 'Informe um WhatsApp válido.',
  consent_required: 'Autorize o uso dos dados para continuar.',
  rate_limited: 'Muitas tentativas foram realizadas. Aguarde um momento.',
  hub_unavailable: 'Este formulário não está disponível agora.',
  capture_not_configured: 'O atendimento por formulário está temporariamente indisponível.',
  network_error: 'Não foi possível conectar. Verifique sua internet e tente novamente.',
  server_error: 'Não foi possível enviar agora. Tente novamente.',
  invalid_name: 'Informe seu nome.',
  clinic_unavailable: 'Este formulário não está disponível agora.',
  module_unavailable: 'O atendimento por formulário está temporariamente indisponível.',
};
