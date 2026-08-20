/**
 * Ações do módulo de Integrações chamadas pelo app autenticado.
 *
 * Deploy: `supabase functions deploy integrations-dispatch`
 *
 * Ações: test_connection | run_flow | replay_webhook.
 * O tenant vem sempre do registro consultado no banco, e o usuário precisa
 * pertencer àquela clínica.
 *
 * Nenhum provedor está implementado: as ações que dependem de provedor
 * respondem 501 e ficam registradas em automation_logs como `skipped`.
 */
import {
  assertUuid,
  authorizeClinicUser,
  closeAutomationLog,
  errorResponse,
  handleOptions,
  HttpError,
  json,
  openAutomationLog,
  serviceClient,
  type IntegrationRow,
} from '../_shared/integrations.ts'
import { resolveWebhookHandler } from '../_shared/providerRegistry.ts'

type DispatchAction = 'test_connection' | 'run_flow' | 'replay_webhook'

interface DispatchBody {
  action?: DispatchAction
  integration_id?: string
  flow_id?: string
  webhook_log_id?: string
  payload?: Record<string, unknown>
}

Deno.serve(async (req) => {
  const options = handleOptions(req)
  if (options) return options
  if (req.method !== 'POST') return json(req, { error: 'Método não permitido' }, 405)

  try {
    const body = await req.json().catch(() => {
      throw new HttpError(400, 'JSON inválido')
    }) as DispatchBody

    const supabase = serviceClient()

    switch (body.action) {
      case 'test_connection':
        return await testConnection(req, supabase, body)
      case 'run_flow':
        return await runFlow(req, supabase, body)
      case 'replay_webhook':
        return await replayWebhook(req, supabase, body)
      default:
        throw new HttpError(400, 'Ação não suportada')
    }
  } catch (error) {
    return errorResponse(req, error)
  }
})

async function testConnection(
  req: Request,
  supabase: ReturnType<typeof serviceClient>,
  body: DispatchBody,
): Promise<Response> {
  const integrationId = assertUuid(body.integration_id, 'integration_id')

  const { data: integration, error } = await supabase
    .from('integrations')
    .select(
      'id, clinic_id, provider, category, name, status, direction, config, credentials_ref, webhook_slug, webhook_secret_hash, is_active',
    )
    .eq('id', integrationId)
    .maybeSingle()

  if (error) throw new HttpError(500, 'Falha ao carregar integração')
  if (!integration) throw new HttpError(404, 'Integração não encontrada')

  await authorizeClinicUser(req, supabase, integration.clinic_id)

  const row = integration as IntegrationRow
  if (!resolveWebhookHandler(row)) {
    return json(
      req,
      {
        ok: false,
        message: `Integração ${row.provider} ainda não processa eventos. Os webhooks recebidos ficam registrados nos logs.`,
        checkedAt: new Date().toISOString(),
      },
      501,
    )
  }

  if (!row.webhook_slug) {
    return json(
      req,
      {
        ok: false,
        message: 'Integração sem endpoint de entrada. Recrie a conexão.',
        checkedAt: new Date().toISOString(),
      },
      409,
    )
  }

  return json(req, {
    ok: true,
    message: 'Endpoint pronto para receber leads.',
    checkedAt: new Date().toISOString(),
  })
}

async function runFlow(
  req: Request,
  supabase: ReturnType<typeof serviceClient>,
  body: DispatchBody,
): Promise<Response> {
  const flowId = assertUuid(body.flow_id, 'flow_id')

  const { data: flow, error } = await supabase
    .from('automation_flows')
    .select('id, clinic_id, integration_id, trigger_type, actions, status')
    .eq('id', flowId)
    .maybeSingle()

  if (error) throw new HttpError(500, 'Falha ao carregar fluxo')
  if (!flow) throw new HttpError(404, 'Fluxo não encontrado')

  await authorizeClinicUser(req, supabase, flow.clinic_id)

  const actions = Array.isArray(flow.actions) ? flow.actions : []
  const startedAtMs = Date.now()
  const logId = await openAutomationLog(supabase, {
    clinicId: flow.clinic_id,
    flowId: flow.id,
    integrationId: flow.integration_id,
    triggerType: 'manual',
    stepsTotal: actions.length,
    payload: body.payload ?? null,
    correlationId: crypto.randomUUID(),
  })

  // Sem executor de ações implementado: a execução fica registrada como
  // `skipped`, deixando o histórico coerente para quando existir runtime.
  if (logId) {
    await closeAutomationLog(supabase, logId, {
      status: 'skipped',
      stepsCompleted: 0,
      result: { reason: 'action_runtime_not_implemented' },
      startedAtMs,
    })
  }

  return json(
    req,
    { logId, status: 'skipped', reason: 'action_runtime_not_implemented' },
    501,
  )
}

/**
 * Reprocessa um webhook já recebido. Útil quando o evento chegou antes da
 * integração estar configurada: o payload ficou salvo e agora vira lead.
 */
async function replayWebhook(
  req: Request,
  supabase: ReturnType<typeof serviceClient>,
  body: DispatchBody,
): Promise<Response> {
  const webhookLogId = assertUuid(body.webhook_log_id, 'webhook_log_id')

  const { data: log, error } = await supabase
    .from('webhook_logs')
    .select('id, clinic_id, integration_id, provider, payload')
    .eq('id', webhookLogId)
    .maybeSingle()

  if (error) throw new HttpError(500, 'Falha ao carregar webhook')
  if (!log) throw new HttpError(404, 'Webhook não encontrado')

  await authorizeClinicUser(req, supabase, log.clinic_id)

  const startedAtMs = Date.now()
  const automationLogId = await openAutomationLog(supabase, {
    clinicId: log.clinic_id,
    flowId: null,
    integrationId: log.integration_id,
    triggerType: 'webhook',
    payload: log.payload,
    correlationId: log.id,
    stepsTotal: 1,
  })

  const finish = async (
    status: 'success' | 'failed' | 'skipped',
    result: Record<string, unknown>,
    errorMessage?: string,
  ) => {
    if (automationLogId) {
      await closeAutomationLog(supabase, automationLogId, {
        status,
        stepsCompleted: status === 'success' ? 1 : 0,
        result,
        errorMessage: errorMessage ?? null,
        startedAtMs,
      })
    }
  };

  if (!log.integration_id) {
    await finish('skipped', { reason: 'integration_removed' })
    return json(
      req,
      { logId: automationLogId, status: 'skipped', reason: 'integration_removed' },
      409,
    )
  }

  const { data: integration, error: integrationError } = await supabase
    .from('integrations')
    .select(
      'id, clinic_id, provider, category, name, status, direction, config, credentials_ref, webhook_slug, webhook_secret_hash, is_active',
    )
    .eq('id', log.integration_id)
    .maybeSingle()

  if (integrationError) throw new HttpError(500, 'Falha ao carregar integração')
  if (!integration) {
    await finish('skipped', { reason: 'integration_removed' })
    return json(
      req,
      { logId: automationLogId, status: 'skipped', reason: 'integration_removed' },
      409,
    )
  }

  const row = integration as IntegrationRow
  const handler = resolveWebhookHandler(row)
  if (!handler) {
    await finish('skipped', { reason: 'provider_handler_not_implemented' })
    return json(
      req,
      { logId: automationLogId, status: 'skipped', reason: 'provider_handler_not_implemented' },
      501,
    )
  }

  try {
    const result = await handler({
      req,
      supabase,
      integration: row,
      payload: log.payload,
      rawBody: JSON.stringify(log.payload ?? null),
    })

    await finish('success', {
      eventType: result.eventType,
      externalEventId: result.externalEventId,
    })

    await supabase
      .from('webhook_logs')
      .update({
        status: 'processed',
        event_type: result.eventType,
        processed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', log.id)

    return json(req, {
      logId: automationLogId,
      status: 'success',
      eventType: result.eventType,
    })
  } catch (replayError) {
    const message = replayError instanceof Error ? replayError.message : 'Falha no reprocessamento'
    await finish('failed', { reason: 'handler_error' }, message)

    await supabase
      .from('webhook_logs')
      .update({ status: 'failed', error_message: message })
      .eq('id', log.id)

    throw replayError
  }
}
