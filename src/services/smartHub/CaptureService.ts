import { isSupabaseConfigured } from '@/integrations/supabase/client';
import { remoteDb } from '@/integrations/supabase/remoteDb';
import { buildWhatsappUrl, localCapture } from './localBooking';
import { CAPTURE_PUBLIC_ERROR_MESSAGES, resolveCaptureConfig } from './resolveCaptureConfig';

export interface SmartHubCaptureSubmitInput {
  slug: string;
  button_id?: string | null;
  name: string;
  phone: string;
  email?: string;
  interest?: string;
  message?: string;
  preferred_time?: string;
  preferred_date?: string;
  privacy_accepted: boolean;
  referrer?: string;
  landing_url?: string;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  device_type?: string;
  /** Honeypot — deve permanecer vazio */
  website?: string;
  action?: 'submit' | 'validate' | 'test';
}

export interface SmartHubCaptureSubmitResult {
  ok: boolean;
  result?: 'created' | 'updated';
  created?: boolean;
  duplicate?: boolean;
  message?: string;
  redirect_url?: string | null;
  whatsapp_url?: string | null;
  error?: string;
  code?: string;
  request_id?: string;
  ready?: boolean;
  issues?: string[];
  stage?: string;
  summary?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function mapPublicMessage(code?: string, fallback?: string): string {
  if (code && CAPTURE_PUBLIC_ERROR_MESSAGES[code]) {
    return CAPTURE_PUBLIC_ERROR_MESSAGES[code];
  }
  return fallback || CAPTURE_PUBLIC_ERROR_MESSAGES.server_error;
}

async function submitRemote(input: SmartHubCaptureSubmitInput): Promise<SmartHubCaptureSubmitResult> {
  const action = input.action || 'submit';
  const isAdminTest = action === 'test';
  try {
    const { data, error } = await remoteDb.rpc('smart_hub_capture_submit', {
      p_payload: { ...input, action, website: input.website || '' },
    });
    if (error) {
      const code = /fetch|network/i.test(error.message) ? 'network_error' : 'server_error';
      return {
        ok: false,
        code,
        error: isAdminTest ? error.message : mapPublicMessage(code),
      };
    }

    const payload = isRecord(data) ? data : {};
    if (action === 'validate') {
      return {
        ok: payload.ok === true,
        ready: payload.ready === true,
        issues: Array.isArray(payload.issues) ? (payload.issues as string[]) : undefined,
        message: typeof payload.message === 'string' ? payload.message : undefined,
      };
    }

    if (payload.ok !== true) {
      const code = typeof payload.code === 'string' ? payload.code : 'server_error';
      return { ok: false, code, error: mapPublicMessage(code) };
    }

    const config = resolveCaptureConfig(payload.hub_capture_config, payload.button_capture_config);
    return {
      ok: true,
      result: payload.result === 'updated' ? 'updated' : 'created',
      created: payload.created !== false,
      duplicate: payload.duplicate === true,
      stage: typeof payload.stage === 'string' ? payload.stage : config.initial_stage,
      message: isAdminTest ? 'Lead de teste criado.' : config.success_message,
      redirect_url: config.redirect_url,
      whatsapp_url:
        config.redirect_whatsapp_after_submit && config.whatsapp_phone
          ? buildWhatsappUrl(config.whatsapp_phone, config.whatsapp_message)
          : null,
    };
  } catch (err) {
    const code = err instanceof TypeError ? 'network_error' : 'server_error';
    return { ok: false, code, error: CAPTURE_PUBLIC_ERROR_MESSAGES[code] };
  }
}

export const CaptureService = {
  async submitPublicForm(
    input: SmartHubCaptureSubmitInput
  ): Promise<SmartHubCaptureSubmitResult> {
    const result = isSupabaseConfigured
      ? await submitRemote(input)
      : await localCapture.submit(input);
    return result.ok || result.issues
      ? result
      : { ...result, error: result.error || mapPublicMessage(result.code) };
  },

  async validateCapture(slug: string, buttonId?: string | null) {
    return this.submitPublicForm({
      slug,
      button_id: buttonId,
      name: 'validate',
      phone: '5500000000000',
      privacy_accepted: true,
      action: 'validate',
    });
  },

  async submitTestLead(slug: string, buttonId?: string | null) {
    return this.submitPublicForm({
      slug,
      button_id: buttonId,
      name: `TESTE Smart Hub ${new Date().toLocaleString('pt-BR')}`,
      phone: '5500000000000',
      email: 'teste-smart-hub@example.invalid',
      interest: 'Teste de configuração',
      message: 'Lead de teste — pode excluir no CRM.',
      privacy_accepted: true,
      action: 'test',
    });
  },
};
