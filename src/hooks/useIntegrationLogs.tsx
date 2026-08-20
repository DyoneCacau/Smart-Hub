import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { WEBHOOK_LOG_SELECT } from '@/lib/webhookLogColumns';
import { useClinic } from './useClinic';
import type {
  AutomationLog,
  IntegrationLogFilters,
  WebhookLog,
} from '@/types/integration';

const DEFAULT_LIMIT = 100;
const EMPTY_AUTOMATION_LOGS: AutomationLog[] = [];
const EMPTY_WEBHOOK_LOGS: WebhookLog[] = [];

/** Sem payload/result: PII e corpo bruto ficam só no service_role. */
const AUTOMATION_LOG_SELECT =
  'id, clinic_id, flow_id, integration_id, status, trigger_type, steps_total, steps_completed, error_message, correlation_id, started_at, finished_at, duration_ms, created_at, flow:automation_flows(name)';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeAutomationLog(row: Record<string, unknown>): AutomationLog {
  const flow = asRecord(row.flow);
  return {
    id: String(row.id),
    clinic_id: String(row.clinic_id),
    flow_id: (row.flow_id as string) ?? null,
    integration_id: (row.integration_id as string) ?? null,
    status: (row.status as AutomationLog['status']) || 'pending',
    trigger_type: (row.trigger_type as string) ?? null,
    steps_total: Number(row.steps_total || 0),
    steps_completed: Number(row.steps_completed || 0),
    payload: null,
    result: null,
    error_message: (row.error_message as string) ?? null,
    correlation_id: (row.correlation_id as string) ?? null,
    started_at: String(row.started_at),
    finished_at: (row.finished_at as string) ?? null,
    duration_ms: row.duration_ms == null ? null : Number(row.duration_ms),
    created_at: String(row.created_at),
    flow_name: flow ? (flow.name as string) : null,
  };
}

function normalizeWebhookLog(row: Record<string, unknown>): WebhookLog {
  return {
    id: String(row.id),
    clinic_id: String(row.clinic_id),
    integration_id: (row.integration_id as string) ?? null,
    direction: (row.direction as WebhookLog['direction']) || 'inbound',
    provider: (row.provider as string) ?? null,
    event_type: (row.event_type as string) ?? null,
    http_method: (row.http_method as string) ?? null,
    endpoint: (row.endpoint as string) ?? null,
    status: (row.status as WebhookLog['status']) || 'received',
    status_code: row.status_code == null ? null : Number(row.status_code),
    signature_valid: row.signature_valid == null ? null : Boolean(row.signature_valid),
    headers: null,
    payload: null,
    response: null,
    external_event_id: (row.external_event_id as string) ?? null,
    error_message: (row.error_message as string) ?? null,
    processed_at: (row.processed_at as string) ?? null,
    created_at: String(row.created_at),
  };
}

export function useAutomationLogs(filters: IntegrationLogFilters = {}) {
  const { clinicId } = useClinic();
  const { integrationId = null, status = null, limit = DEFAULT_LIMIT } = filters;

  const query = useQuery({
    queryKey: ['automation-logs', clinicId, integrationId, status, limit],
    queryFn: async (): Promise<AutomationLog[]> => {
      if (!clinicId) return EMPTY_AUTOMATION_LOGS;

      let request = (supabase as any)
        .from('automation_logs')
        .select(AUTOMATION_LOG_SELECT)
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (integrationId) request = request.eq('integration_id', integrationId);
      if (status) request = request.eq('status', status);

      const { data, error } = await request;

      if (error) {
        if (error.code === '42P01') return EMPTY_AUTOMATION_LOGS;
        throw error;
      }

      return ((data || []) as Record<string, unknown>[]).map(normalizeAutomationLog);
    },
    enabled: !!clinicId,
    retry: false,
  });

  return { ...query, logs: query.data ?? EMPTY_AUTOMATION_LOGS };
}

export function useWebhookLogs(filters: IntegrationLogFilters = {}) {
  const { clinicId } = useClinic();
  const { integrationId = null, status = null, limit = DEFAULT_LIMIT } = filters;

  const query = useQuery({
    queryKey: ['webhook-logs', clinicId, integrationId, status, limit],
    queryFn: async (): Promise<WebhookLog[]> => {
      if (!clinicId) return EMPTY_WEBHOOK_LOGS;

      let request = (supabase as any)
        .from('webhook_logs')
        .select(WEBHOOK_LOG_SELECT)
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (integrationId) request = request.eq('integration_id', integrationId);
      if (status) request = request.eq('status', status);

      const { data, error } = await request;

      if (error) {
        if (error.code === '42P01') return EMPTY_WEBHOOK_LOGS;
        throw error;
      }

      return ((data || []) as Record<string, unknown>[]).map(normalizeWebhookLog);
    },
    enabled: !!clinicId,
    retry: false,
  });

  return { ...query, logs: query.data ?? EMPTY_WEBHOOK_LOGS };
}
