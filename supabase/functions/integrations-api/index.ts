/**
 * API REST do tenant para sistemas externos (n8n, Make, Zapier, ERPs).
 *
 * Base: /functions/v1/integrations-api
 * Auth: `Authorization: Bearer hc_live_...` (tabela api_tokens)
 * Deploy: `supabase functions deploy integrations-api --no-verify-jwt`
 * (o cliente externo autentica pelo token do tenant, não por JWT Supabase).
 *
 * O clinic_id vem sempre do token resolvido no banco: o chamador não
 * consegue apontar para outra clínica.
 */
import { assertClinicApiAccess } from '../_shared/clinicAccess.ts'
import {
  authorizeApiToken,
  errorResponse,
  handleOptions,
  HttpError,
  json,
  serviceClient,
} from '../_shared/integrations.ts'
import { assertRateLimit } from '../_shared/rateLimit.ts'
import { describeRoutes, resolveRoute, type Route } from './router.ts'

/** 60 req/min por token — protege contra token vazado martelando a API. */
const API_RATE_LIMIT = 60
const API_RATE_WINDOW_MS = 60_000
import { getIntegration, listIntegrations } from './controllers/integrations.ts'
import { getFlow, listFlows, runFlow } from './controllers/automationFlows.ts'
import { listAutomationLogs, listWebhookLogs } from './controllers/logs.ts'
import { createLeads, getLead, listLeads, updateLead } from './controllers/leads.ts'

const routes: Route[] = [
  {
    method: 'POST',
    pattern: 'leads',
    scope: 'leads:write',
    description: 'Cria lead(s) no CRM a partir de qualquer formato de payload',
    handler: async (ctx) => createLeads(ctx.clinicId, ctx.payload),
  },
  {
    method: 'GET',
    pattern: 'leads',
    scope: 'leads:read',
    description: 'Lista leads (filtros: stage, lead_source, phone, since, limit)',
    handler: async (ctx) => listLeads(ctx.clinicId, ctx.searchParams),
  },
  {
    method: 'GET',
    pattern: 'leads/:id',
    scope: 'leads:read',
    description: 'Detalha um lead',
    handler: async (ctx) => getLead(ctx.clinicId, ctx.segments[1]),
  },
  {
    method: 'PATCH',
    pattern: 'leads/:id',
    scope: 'leads:write',
    description: 'Atualiza etapa, follow-up, interesse ou observação do lead',
    handler: async (ctx) => updateLead(ctx.clinicId, ctx.segments[1], ctx.payload),
  },
  {
    method: 'GET',
    pattern: 'integrations',
    scope: 'automations:read',
    description: 'Lista as integrações da clínica',
    handler: async (ctx) => listIntegrations(ctx.clinicId, ctx.searchParams),
  },
  {
    method: 'GET',
    pattern: 'integrations/:id',
    scope: 'automations:read',
    description: 'Detalha uma integração',
    handler: async (ctx) => getIntegration(ctx.clinicId, ctx.segments[1]),
  },
  {
    method: 'GET',
    pattern: 'automation-flows',
    scope: 'automations:read',
    description: 'Lista os fluxos de automação',
    handler: async (ctx) => listFlows(ctx.clinicId, ctx.searchParams),
  },
  {
    method: 'GET',
    pattern: 'automation-flows/:id',
    scope: 'automations:read',
    description: 'Detalha um fluxo de automação',
    handler: async (ctx) => getFlow(ctx.clinicId, ctx.segments[1]),
  },
  {
    method: 'POST',
    pattern: 'automation-flows/:id/run',
    scope: 'automations:trigger',
    description: 'Dispara um fluxo ativo (501 até existir runtime de ações)',
    handler: async (ctx) => runFlow(ctx.clinicId, ctx.segments[1], ctx.payload),
  },
  {
    method: 'GET',
    pattern: 'automation-logs',
    scope: 'automations:read',
    description: 'Lista execuções de fluxo',
    handler: async (ctx) => listAutomationLogs(ctx.clinicId, ctx.searchParams),
  },
  {
    method: 'GET',
    pattern: 'webhook-logs',
    scope: 'webhooks:read',
    description: 'Lista webhooks recebidos e enviados',
    handler: async (ctx) => listWebhookLogs(ctx.clinicId, ctx.searchParams),
  },
]

function segmentsFromUrl(url: URL): string[] {
  const all = url.pathname.split('/').filter(Boolean)
  const index = all.indexOf('integrations-api')
  return index >= 0 ? all.slice(index + 1) : all
}

Deno.serve(async (req) => {
  const options = handleOptions(req)
  if (options) return options

  try {
    const url = new URL(req.url)
    const segments = segmentsFromUrl(url)

    // Descoberta da API: não exige token
    if (segments.length === 0) {
      return json(req, {
        name: 'HealthCare Integrations API',
        version: '1',
        routes: describeRoutes(routes),
      })
    }

    const route = resolveRoute(routes, req.method, segments)
    const supabase = serviceClient()
    const auth = await authorizeApiToken(req, supabase, route.scope)
    await assertClinicApiAccess(supabase, auth.clinicId, route.scope)
    assertRateLimit(`api:${auth.tokenId}`, API_RATE_LIMIT, API_RATE_WINDOW_MS)

    let payload: unknown = null
    if (req.method === 'POST' || req.method === 'PATCH') {
      payload = await req.json().catch(() => {
        throw new HttpError(400, 'JSON inválido')
      })
    }

    const result = await route.handler({
      req,
      segments,
      searchParams: url.searchParams,
      clinicId: auth.clinicId,
      payload,
    })

    return json(req, result.body, result.status ?? 200)
  } catch (error) {
    return errorResponse(req, error)
  }
})
