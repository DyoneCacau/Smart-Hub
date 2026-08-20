/**
 * Núcleo compartilhado do módulo de Integrações.
 *
 * Tenant: toda operação resolve um `clinic_id` antes de tocar em dados.
 * Nenhum handler recebe `clinic_id` do corpo da requisição sem validação.
 *
 * Nenhum provedor é implementado aqui: este arquivo entrega apenas
 * autenticação, resolução de tenant, logging e o registro de handlers que as
 * futuras integrações vão preencher.
 */
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, handleOptions } from './cors.ts'
import { HttpError } from './httpError.ts'
import {
  META_SIGNATURE_HEADER,
  sha256Hex,
  SHARED_SECRET_HEADER,
  timingSafeEqualHex,
} from './webhookSignature.ts'

export { sha256Hex }
export { HttpError }
export { corsHeaders, handleOptions }

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), ...JSON_HEADERS },
  })
}

export function errorResponse(req: Request, error: unknown): Response {
  if (error instanceof HttpError) return json(req, { error: error.message }, error.status)
  console.error('[integrations] erro inesperado:', error)
  return json(req, { error: 'Erro interno' }, 500)
}

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('Supabase service configuration missing')
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function assertUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new HttpError(400, `${field} inválido`)
  }
  return value
}

export interface IntegrationRow {
  id: string
  clinic_id: string
  provider: string
  category: string
  name: string
  status: string
  direction: string
  config: Record<string, unknown>
  credentials_ref: string | null
  webhook_slug: string | null
  webhook_secret_hash: string | null
  is_active: boolean
}

/**
 * Resolve a integração (e portanto o tenant) pelo slug do endpoint.
 * O slug é a única informação pública; `clinic_id` vem sempre do banco.
 */
export async function resolveIntegrationBySlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<IntegrationRow> {
  if (!slug || slug.length < 8) throw new HttpError(404, 'Endpoint não encontrado')

  const { data, error } = await supabase
    .from('integrations')
    .select(
      'id, clinic_id, provider, category, name, status, direction, config, credentials_ref, webhook_slug, webhook_secret_hash, is_active',
    )
    .eq('webhook_slug', slug)
    .maybeSingle()

  if (error) throw new HttpError(500, 'Falha ao resolver integração')
  if (!data) throw new HttpError(404, 'Endpoint não encontrado')
  if (!data.is_active) throw new HttpError(409, 'Integração inativa')

  return data as IntegrationRow
}

// A verificação da entrada vive em webhookAuth.ts: ela depende do provedor
// (HMAC da Meta ou segredo próprio) e falha fechada.

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'apikey',
  'cookie',
  SHARED_SECRET_HEADER,
  META_SIGNATURE_HEADER,
])

/** Cabeçalhos sem credenciais, para gravar em webhook_logs. */
export function sanitizeHeaders(req: Request): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of req.headers.entries()) {
    out[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? '[REDACTED]' : value
  }
  return out
}

/** Reexportado para os handlers compararem hashes sem reimplementar. */
export { timingSafeEqualHex }

export interface WebhookLogInput {
  clinicId: string
  integrationId: string | null
  provider: string | null
  direction?: 'inbound' | 'outbound'
  eventType?: string | null
  httpMethod?: string | null
  endpoint?: string | null
  status: 'received' | 'processed' | 'failed' | 'ignored' | 'duplicate'
  statusCode?: number | null
  signatureValid?: boolean | null
  headers?: Record<string, unknown> | null
  payload?: unknown
  response?: Record<string, unknown> | null
  externalEventId?: string | null
  errorMessage?: string | null
}

/**
 * Grava o evento em webhook_logs. O índice único
 * (clinic_id, provider, external_event_id) garante idempotência: evento
 * repetido devolve `duplicate` em vez de processar de novo.
 */
export async function logWebhook(
  supabase: SupabaseClient,
  input: WebhookLogInput,
): Promise<{ id: string | null; duplicate: boolean }> {
  const { data, error } = await supabase
    .from('webhook_logs')
    .insert({
      clinic_id: input.clinicId,
      integration_id: input.integrationId,
      direction: input.direction || 'inbound',
      provider: input.provider,
      event_type: input.eventType ?? null,
      http_method: input.httpMethod ?? null,
      endpoint: input.endpoint ?? null,
      status: input.status,
      status_code: input.statusCode ?? null,
      signature_valid: input.signatureValid ?? null,
      headers: input.headers ?? null,
      payload: input.payload ?? null,
      response: input.response ?? null,
      external_event_id: input.externalEventId ?? null,
      error_message: input.errorMessage ?? null,
      processed_at: input.status === 'processed' ? new Date().toISOString() : null,
    })
    .select('id')
    .maybeSingle()

  if (error) {
    // 23505 = unique_violation → evento já registrado neste tenant
    if ((error as { code?: string }).code === '23505') return { id: null, duplicate: true }
    console.error('[integrations] falha ao gravar webhook_log:', error)
    return { id: null, duplicate: false }
  }

  return { id: data?.id ?? null, duplicate: false }
}

/** Abre a execução de um fluxo em automation_logs. */
export async function openAutomationLog(
  supabase: SupabaseClient,
  input: {
    clinicId: string
    flowId: string | null
    integrationId: string | null
    triggerType: string | null
    stepsTotal?: number
    payload?: unknown
    correlationId?: string | null
  },
): Promise<string | null> {
  const { data, error } = await supabase
    .from('automation_logs')
    .insert({
      clinic_id: input.clinicId,
      flow_id: input.flowId,
      integration_id: input.integrationId,
      trigger_type: input.triggerType,
      status: 'pending',
      steps_total: input.stepsTotal ?? 0,
      payload: input.payload ?? null,
      correlation_id: input.correlationId ?? null,
    })
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[integrations] falha ao abrir automation_log:', error)
    return null
  }
  return data?.id ?? null
}

/** Fecha a execução com o resultado final. */
export async function closeAutomationLog(
  supabase: SupabaseClient,
  logId: string,
  input: {
    status: 'success' | 'failed' | 'skipped'
    stepsCompleted?: number
    result?: Record<string, unknown> | null
    errorMessage?: string | null
    startedAtMs?: number
  },
): Promise<void> {
  const finishedAt = new Date()
  const { error } = await supabase
    .from('automation_logs')
    .update({
      status: input.status,
      steps_completed: input.stepsCompleted ?? 0,
      result: input.result ?? null,
      error_message: input.errorMessage ?? null,
      finished_at: finishedAt.toISOString(),
      duration_ms: input.startedAtMs ? finishedAt.getTime() - input.startedAtMs : null,
    })
    .eq('id', logId)

  if (error) console.error('[integrations] falha ao fechar automation_log:', error)
}

/**
 * Handler de provedor. Cada integração futura registra o seu em
 * PROVIDER_HANDLERS; o webhook genérico continua o mesmo.
 */
export interface ProviderWebhookContext {
  req: Request
  supabase: SupabaseClient
  integration: IntegrationRow
  payload: unknown
  rawBody: string
}

export interface ProviderWebhookResult {
  eventType: string | null
  externalEventId: string | null
  /** false quando o evento é válido mas não gera ação */
  handled: boolean
}

export type ProviderWebhookHandler = (
  ctx: ProviderWebhookContext,
) => Promise<ProviderWebhookResult>

// O registro de handlers vive em providerRegistry.ts: este arquivo é a base
// de todos os módulos e não pode importar handlers (evita ciclo).

/** Extrai o id do evento para idempotência, sem conhecer o provedor. */
export function extractExternalEventId(req: Request, payload: unknown): string | null {
  const fromHeader = req.headers.get('x-healthcare-event-id')
  if (fromHeader) return fromHeader

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>
    for (const key of ['event_id', 'eventId', 'id']) {
      const value = record[key]
      if (typeof value === 'string' && value) return value
      if (typeof value === 'number') return String(value)
    }
  }
  return null
}

export interface ApiTokenContext {
  tokenId: string
  clinicId: string
  scopes: string[]
}

/**
 * Autentica uma chamada REST externa pelo token do tenant
 * (`Authorization: Bearer hc_live_...`) e devolve o clinic_id do banco.
 *
 * Assinatura/plano ficam em `assertClinicApiAccess` (chamado pelo index da
 * API): este helper só valida o token em si.
 */
export async function authorizeApiToken(
  req: Request,
  supabase: SupabaseClient,
  requiredScope: string,
): Promise<ApiTokenContext> {
  const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) throw new HttpError(401, 'Token ausente')

  const { data, error } = await supabase
    .from('api_tokens')
    .select('id, clinic_id, scopes, status, expires_at')
    .eq('token_hash', await sha256Hex(token))
    .maybeSingle()

  if (error) throw new HttpError(500, 'Falha ao validar token')
  if (!data) throw new HttpError(401, 'Token inválido')
  if (data.status !== 'active') throw new HttpError(401, 'Token revogado')
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
    throw new HttpError(401, 'Token expirado')
  }

  const scopes = Array.isArray(data.scopes) ? (data.scopes as string[]) : []
  if (!scopes.includes(requiredScope)) {
    throw new HttpError(403, `Token sem o escopo ${requiredScope}`)
  }

  // Uso registrado de forma best-effort: não bloqueia a resposta
  void supabase
    .from('api_tokens')
    .update({
      last_used_at: new Date().toISOString(),
      last_used_ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    })
    .eq('id', data.id)

  return { tokenId: data.id, clinicId: data.clinic_id, scopes }
}

/** Autentica um usuário do app e confere o vínculo com a clínica. */
export async function authorizeClinicUser(
  req: Request,
  supabase: SupabaseClient,
  clinicId: string,
): Promise<{ userId: string; isSuperadmin: boolean }> {
  const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) throw new HttpError(401, 'Não autenticado')

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) throw new HttpError(401, 'Sessão inválida')

  const [{ data: role }, { data: membership }] = await Promise.all([
    supabase.from('user_roles').select('role')
      .eq('user_id', user.id).eq('role', 'superadmin').maybeSingle(),
    supabase.from('clinic_users').select('clinic_id')
      .eq('clinic_id', clinicId).eq('user_id', user.id).maybeSingle(),
  ])

  const isSuperadmin = Boolean(role)
  if (!isSuperadmin && !membership) throw new HttpError(403, 'Sem acesso à clínica')

  return { userId: user.id, isSuperadmin }
}
