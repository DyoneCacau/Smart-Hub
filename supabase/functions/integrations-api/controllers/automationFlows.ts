/**
 * Controller REST de fluxos de automação do tenant.
 *
 * O disparo (`POST /automation-flows/:id/run`) responde 501 enquanto não
 * existir runtime de ações — a chamada já fica autenticada e auditada.
 */
import { HttpError, openAutomationLog, serviceClient } from '../../_shared/integrations.ts'
import type { RouteHandlerResult } from '../router.ts'

const PUBLIC_COLUMNS =
  'id, integration_id, name, description, trigger_type, trigger_config, actions, status, version, last_run_at, run_count, error_count, created_at, updated_at'

export async function listFlows(
  clinicId: string,
  searchParams: URLSearchParams,
): Promise<RouteHandlerResult> {
  const supabase = serviceClient()
  let request = supabase
    .from('automation_flows')
    .select(PUBLIC_COLUMNS)
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })

  const status = searchParams.get('status')
  const triggerType = searchParams.get('trigger_type')
  if (status) request = request.eq('status', status)
  if (triggerType) request = request.eq('trigger_type', triggerType)

  const { data, error } = await request
  if (error) throw new HttpError(500, 'Falha ao listar fluxos')

  return { body: { data: data ?? [] } }
}

export async function getFlow(clinicId: string, flowId: string): Promise<RouteHandlerResult> {
  const supabase = serviceClient()
  const { data, error } = await supabase
    .from('automation_flows')
    .select(PUBLIC_COLUMNS)
    .eq('clinic_id', clinicId)
    .eq('id', flowId)
    .maybeSingle()

  if (error) throw new HttpError(500, 'Falha ao carregar fluxo')
  if (!data) throw new HttpError(404, 'Fluxo não encontrado')

  return { body: { data } }
}

export async function runFlow(
  clinicId: string,
  flowId: string,
  payload: unknown,
): Promise<RouteHandlerResult> {
  const supabase = serviceClient()
  const { data: flow, error } = await supabase
    .from('automation_flows')
    .select('id, clinic_id, integration_id, actions, status')
    .eq('clinic_id', clinicId)
    .eq('id', flowId)
    .maybeSingle()

  if (error) throw new HttpError(500, 'Falha ao carregar fluxo')
  if (!flow) throw new HttpError(404, 'Fluxo não encontrado')
  if (flow.status !== 'active') throw new HttpError(409, 'Fluxo não está ativo')

  const actions = Array.isArray(flow.actions) ? flow.actions : []
  const logId = await openAutomationLog(supabase, {
    clinicId,
    flowId: flow.id,
    integrationId: flow.integration_id,
    triggerType: 'webhook',
    stepsTotal: actions.length,
    payload,
    correlationId: crypto.randomUUID(),
  })

  return {
    status: 501,
    body: { logId, status: 'pending', reason: 'action_runtime_not_implemented' },
  }
}
