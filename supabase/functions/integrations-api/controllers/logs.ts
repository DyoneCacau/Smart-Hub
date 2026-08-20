/**
 * Controller REST de logs (execuções e webhooks) do tenant.
 *
 * Somente leitura: escrita de log é do service_role, dentro das functions.
 */
import { HttpError, serviceClient } from '../../_shared/integrations.ts'
import type { RouteHandlerResult } from '../router.ts'

const MAX_LIMIT = 200

function parseLimit(searchParams: URLSearchParams): number {
  const raw = Number(searchParams.get('limit') || 50)
  if (!Number.isFinite(raw) || raw <= 0) return 50
  return Math.min(Math.trunc(raw), MAX_LIMIT)
}

export async function listAutomationLogs(
  clinicId: string,
  searchParams: URLSearchParams,
): Promise<RouteHandlerResult> {
  const supabase = serviceClient()
  let request = supabase
    .from('automation_logs')
    .select(
      'id, flow_id, integration_id, status, trigger_type, steps_total, steps_completed, error_message, correlation_id, started_at, finished_at, duration_ms, created_at',
    )
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })
    .limit(parseLimit(searchParams))

  const status = searchParams.get('status')
  const flowId = searchParams.get('flow_id')
  if (status) request = request.eq('status', status)
  if (flowId) request = request.eq('flow_id', flowId)

  const { data, error } = await request
  if (error) throw new HttpError(500, 'Falha ao listar execuções')

  return { body: { data: data ?? [] } }
}

export async function listWebhookLogs(
  clinicId: string,
  searchParams: URLSearchParams,
): Promise<RouteHandlerResult> {
  const supabase = serviceClient()
  let request = supabase
    .from('webhook_logs')
    .select(
      'id, integration_id, direction, provider, event_type, status, status_code, signature_valid, external_event_id, error_message, processed_at, created_at',
    )
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })
    .limit(parseLimit(searchParams))

  const status = searchParams.get('status')
  const provider = searchParams.get('provider')
  if (status) request = request.eq('status', status)
  if (provider) request = request.eq('provider', provider)

  const { data, error } = await request
  if (error) throw new HttpError(500, 'Falha ao listar webhooks')

  return { body: { data: data ?? [] } }
}
