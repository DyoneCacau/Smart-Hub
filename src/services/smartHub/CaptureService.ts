import { supabase } from '@/integrations/supabase/client';
import { CAPTURE_PUBLIC_ERROR_MESSAGES } from './resolveCaptureConfig';

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

async function parseFunctionError(error: unknown): Promise<{
  message: string;
  code?: string;
  request_id?: string;
  status?: number;
}> {
  if (isRecord(error) && error.context instanceof Response) {
    const status = error.context.status;
    const payload: unknown = await error.context.clone().json().catch(() => null);
    if (isRecord(payload)) {
      const code = typeof payload.code === 'string' ? payload.code : undefined;
      const message =
        (typeof payload.message === 'string' && payload.message) ||
        (typeof payload.error === 'string' && payload.error) ||
        undefined;
      const request_id =
        typeof payload.request_id === 'string' ? payload.request_id : undefined;
      if (message || code) {
        return {
          message:
            message ||
            CAPTURE_PUBLIC_ERROR_MESSAGES[code || ''] ||
            CAPTURE_PUBLIC_ERROR_MESSAGES.server_error,
          code,
          request_id,
          status,
        };
      }
    }
    if (status === 429) {
      return { message: CAPTURE_PUBLIC_ERROR_MESSAGES.rate_limited, code: 'rate_limited', status };
    }
  }
  if (error instanceof TypeError) {
    return { message: CAPTURE_PUBLIC_ERROR_MESSAGES.network_error, code: 'network_error' };
  }
  return { message: CAPTURE_PUBLIC_ERROR_MESSAGES.server_error, code: 'server_error' };
}

function mapPublicMessage(code?: string, fallback?: string): string {
  if (code && CAPTURE_PUBLIC_ERROR_MESSAGES[code]) {
    return CAPTURE_PUBLIC_ERROR_MESSAGES[code];
  }
  return fallback || CAPTURE_PUBLIC_ERROR_MESSAGES.server_error;
}

export const CaptureService = {
  async submitPublicForm(
    input: SmartHubCaptureSubmitInput
  ): Promise<SmartHubCaptureSubmitResult> {
    try {
      const { data, error } = await supabase.functions.invoke('smart-hub-capture', {
        body: {
          ...input,
          action: input.action || 'submit',
          website: input.website || '',
        },
      });

      const isAdminTest = input.action === 'test';

      if (error) {
        const parsed = await parseFunctionError(error);
        // Corpo às vezes também vem em data
        const fromData = isRecord(data) ? data : null;
        const code =
          parsed.code ||
          (fromData && typeof fromData.code === 'string' ? fromData.code : undefined);
        const request_id =
          parsed.request_id ||
          (fromData && typeof fromData.request_id === 'string'
            ? fromData.request_id
            : undefined);
        const serverMessage =
          parsed.message ||
          (fromData && typeof fromData.message === 'string' ? fromData.message : undefined);
        // Visitante: mensagem genérica. Teste admin: preserva diagnóstico do servidor.
        const message = isAdminTest
          ? serverMessage || mapPublicMessage(code)
          : mapPublicMessage(code, serverMessage);
        return { ok: false, error: message, code, request_id };
      }

      const result = (data || {}) as SmartHubCaptureSubmitResult;
      if (!result.ok) {
        const code = result.code;
        const serverMessage = result.message || result.error;
        return {
          ok: false,
          error: isAdminTest
            ? serverMessage || mapPublicMessage(code)
            : mapPublicMessage(code, serverMessage),
          code,
          request_id: result.request_id,
          issues: result.issues,
        };
      }
      return result;
    } catch (err) {
      if (err instanceof TypeError) {
        return {
          ok: false,
          error: CAPTURE_PUBLIC_ERROR_MESSAGES.network_error,
          code: 'network_error',
        };
      }
      return {
        ok: false,
        error: CAPTURE_PUBLIC_ERROR_MESSAGES.server_error,
        code: 'server_error',
      };
    }
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
