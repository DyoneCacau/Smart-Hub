import { supabase } from '@/integrations/supabase/client';
import type {
  MetaAdAccountOption,
  MetaInstagramOption,
  MetaPageOption,
  MetaPublicConfig,
} from '@/types/integration';

interface FunctionError {
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function functionErrorMessage(error: unknown): Promise<{ message: string; status: number | null }> {
  if (isRecord(error) && error.context instanceof Response) {
    const status = error.context.status;
    const payload: unknown = await error.context.clone().json().catch(() => null);
    if (isRecord(payload) && typeof payload.error === 'string') {
      return { message: payload.error, status };
    }
    return {
      message: error instanceof Error && error.message
        ? error.message
        : 'Falha na Edge Function Meta',
      status,
    };
  }
  if (error instanceof Error && error.message) {
    return { message: error.message, status: null };
  }
  return { message: 'Não foi possível concluir a operação Meta', status: null };
}

async function invokeMeta<T>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const hasJwt = Boolean(sessionData.session?.access_token);

  const { data, error } = await supabase.functions.invoke<T | FunctionError>(functionName, {
    body,
  });

  if (error) {
    const parsed = await functionErrorMessage(error);
    console.warn('[meta] invoke falhou', {
      functionName,
      action: body.action,
      clinic_id: body.clinic_id,
      integration_id: body.integration_id,
      httpStatus: parsed.status,
      hasJwt,
      message: parsed.message,
    });
    throw new Error(parsed.message);
  }
  if (isRecord(data) && typeof data.error === 'string') {
    console.warn('[meta] invoke respondeu erro', {
      functionName,
      action: body.action,
      message: data.error,
      hasJwt,
    });
    throw new Error(data.error);
  }
  return data as T;
}

export interface MetaOAuthStartResult {
  authorizationUrl: string;
  integrationId: string;
  scopes: string[];
}

export interface MetaAssetsResult {
  pages: MetaPageOption[];
  instagramAccounts: MetaInstagramOption[];
  adAccounts: MetaAdAccountOption[];
  unavailable?: {
    instagram: boolean;
    adAccounts: boolean;
    leadAds: boolean;
  };
  lead_capture?: boolean;
  lead_capture_subscribed_at?: string | null;
  selection: {
    page_id: string | null;
    instagram_account_id: string | null;
    ad_account_id: string | null;
  };
}

export const metaConnectionService = {
  async startOAuth(clinicId: string, integrationId?: string | null): Promise<MetaOAuthStartResult> {
    return invokeMeta<MetaOAuthStartResult>('meta-oauth', {
      action: 'start',
      clinic_id: clinicId,
      integration_id: integrationId ?? null,
    });
  },

  async listAssets(clinicId: string, integrationId: string): Promise<MetaAssetsResult> {
    return invokeMeta<MetaAssetsResult>('meta-connection', {
      action: 'list_assets',
      clinic_id: clinicId,
      integration_id: integrationId,
    });
  },

  async saveAssets(
    clinicId: string,
    integrationId: string,
    selection: {
      pageId: string;
      instagramAccountId?: string | null;
      adAccountId?: string | null;
    },
  ): Promise<{ ok: boolean; meta: MetaPublicConfig }> {
    return invokeMeta('meta-connection', {
      action: 'save_assets',
      clinic_id: clinicId,
      integration_id: integrationId,
      page_id: selection.pageId,
      instagram_account_id: selection.instagramAccountId ?? null,
      ad_account_id: selection.adAccountId ?? null,
    });
  },

  async refreshStatus(
    clinicId: string,
    integrationId: string,
  ): Promise<{ ok: boolean; meta: MetaPublicConfig; reason?: string }> {
    return invokeMeta('meta-connection', {
      action: 'refresh_status',
      clinic_id: clinicId,
      integration_id: integrationId,
    });
  },

  async disconnect(clinicId: string, integrationId: string): Promise<{ ok: boolean }> {
    return invokeMeta('meta-connection', {
      action: 'disconnect',
      clinic_id: clinicId,
      integration_id: integrationId,
    });
  },

  async enableLeadCapture(
    clinicId: string,
    integrationId: string,
  ): Promise<{ ok: boolean; lead_capture: boolean; meta: MetaPublicConfig }> {
    return invokeMeta('meta-connection', {
      action: 'enable_lead_capture',
      clinic_id: clinicId,
      integration_id: integrationId,
    });
  },

  async disableLeadCapture(
    clinicId: string,
    integrationId: string,
  ): Promise<{ ok: boolean; lead_capture: boolean; meta: MetaPublicConfig }> {
    return invokeMeta('meta-connection', {
      action: 'disable_lead_capture',
      clinic_id: clinicId,
      integration_id: integrationId,
    });
  },
};
