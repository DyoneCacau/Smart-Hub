/**
 * Webhook genérico de entrada do módulo de Integrações.
 *
 * URL: /functions/v1/integrations-webhook/<webhook_slug>
 * Deploy: `supabase functions deploy integrations-webhook --no-verify-jwt`
 * (o provedor externo não tem JWT do Supabase).
 *
 * Métodos:
 * - `GET` com `hub.mode=subscribe`: desafio de verificação da Meta.
 * - `POST`: recebimento de evento.
 *
 * Autenticação por provedor, sempre falhando fechada (ver webhookAuth.ts):
 * - Meta (Facebook / Instagram / WhatsApp): HMAC do corpo em
 *   `X-Hub-Signature-256` com `META_APP_SECRET`.
 * - Demais: segredo próprio da integração em `x-healthcare-secret`.
 *
 * O tenant NUNCA vem da requisição: o slug resolve a integração e o
 * clinic_id é lido do banco.
 */
import {
  errorResponse,
  extractExternalEventId,
  handleOptions,
  HttpError,
  json,
  logWebhook,
  resolveIntegrationBySlug,
  sanitizeHeaders,
  serviceClient,
} from '../_shared/integrations.ts'
import { assertRateLimit } from '../_shared/rateLimit.ts'
import { handleWebhookChallenge, verifyWebhookRequest } from '../_shared/webhookAuth.ts'
import { resolveWebhookHandler } from '../_shared/providerRegistry.ts'

const MAX_BODY_BYTES = 1_000_000
/** 120 req/min por integração — cobre rajadas legítimas e freia abuso do slug. */
const WEBHOOK_RATE_LIMIT = 120
const WEBHOOK_RATE_WINDOW_MS = 60_000
/** Falhas de auth têm teto menor: evita encher logs com tentativas inválidas. */
const WEBHOOK_AUTH_FAIL_LIMIT = 30
const WEBHOOK_AUTH_FAIL_WINDOW_MS = 60_000

function slugFromUrl(url: string): string {
  const segments = new URL(url).pathname.split('/').filter(Boolean)
  // .../functions/v1/integrations-webhook/<slug>
  const index = segments.indexOf('integrations-webhook')
  return index >= 0 ? (segments[index + 1] || '') : (segments[segments.length - 1] || '')
}

Deno.serve(async (req) => {
  const options = handleOptions(req)
  if (options) return options

  if (req.method !== 'POST' && req.method !== 'GET') {
    return json(req, { error: 'Método não permitido' }, 405)
  }

  try {
    const slug = slugFromUrl(req.url)
    const supabase = serviceClient()
    const integration = await resolveIntegrationBySlug(supabase, slug)
    assertRateLimit(
      `wh:${integration.id}`,
      WEBHOOK_RATE_LIMIT,
      WEBHOOK_RATE_WINDOW_MS,
    )
    const headers = sanitizeHeaders(req)

    // ─── Verificação do endpoint (GET hub.mode=subscribe) ───────────────────
    if (req.method === 'GET') {
      const challenge = await handleWebhookChallenge(req, integration)
      if (!challenge) return json(req, { error: 'Método não permitido' }, 405)

      // Sem payload: é só a validação do endpoint no provedor
      await logWebhook(supabase, {
        clinicId: integration.clinic_id,
        integrationId: integration.id,
        provider: integration.provider,
        eventType: 'webhook.verification',
        httpMethod: req.method,
        endpoint: slug,
        status: challenge.accepted ? 'processed' : 'failed',
        statusCode: challenge.response.status,
        signatureValid: challenge.accepted,
        headers,
        errorMessage: challenge.reason,
      })

      return challenge.response
    }

    // ─── Recebimento de evento (POST) ───────────────────────────────────────
    const contentLength = Number(req.headers.get('content-length') || 0)
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      throw new HttpError(413, 'Payload muito grande')
    }

    const rawBody = await req.text()
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      throw new HttpError(413, 'Payload muito grande')
    }

    const auth = await verifyWebhookRequest(req, integration, rawBody)

    if (!auth.valid) {
      // Teto extra para tentativas inválidas (ainda sem gravar o corpo).
      assertRateLimit(
        `wh-authfail:${integration.id}`,
        WEBHOOK_AUTH_FAIL_LIMIT,
        WEBHOOK_AUTH_FAIL_WINDOW_MS,
      )

      // Requisição não autenticada não persiste payload: evita que alguém com
      // o slug encha webhook_logs. Só o motivo é registrado.
      await logWebhook(supabase, {
        clinicId: integration.clinic_id,
        integrationId: integration.id,
        provider: integration.provider,
        httpMethod: req.method,
        endpoint: slug,
        status: 'failed',
        statusCode: auth.status,
        signatureValid: false,
        headers,
        errorMessage: `${auth.scheme}: ${auth.reason}`,
      })

      const message = auth.status === 503
        ? 'Verificação de webhook não configurada no servidor'
        : auth.status === 409
          ? 'Integração sem segredo configurado'
          : 'Assinatura inválida'
      throw new HttpError(auth.status, message)
    }

    let payload: unknown = null
    try {
      payload = rawBody ? JSON.parse(rawBody) : null
    } catch {
      // Provedores de formulário podem enviar texto puro; guardamos como está
      payload = { raw: rawBody }
    }

    const externalEventId = extractExternalEventId(req, payload)
    const handler = resolveWebhookHandler(integration)

    // Sem handler: registra e devolve 202 (aceito, ainda não processado)
    if (!handler) {
      const { duplicate } = await logWebhook(supabase, {
        clinicId: integration.clinic_id,
        integrationId: integration.id,
        provider: integration.provider,
        httpMethod: req.method,
        endpoint: slug,
        status: 'received',
        statusCode: 202,
        signatureValid: true,
        headers,
        payload,
        externalEventId,
      })

      await supabase
        .from('integrations')
        .update({ last_event_at: new Date().toISOString(), last_error: null })
        .eq('id', integration.id)

      return json(
        req,
        {
          received: true,
          duplicate,
          processed: false,
          reason: 'provider_handler_not_implemented',
        },
        202,
      )
    }

    const result = await handler({ req, supabase, integration, payload, rawBody })
    const { duplicate } = await logWebhook(supabase, {
      clinicId: integration.clinic_id,
      integrationId: integration.id,
      provider: integration.provider,
      eventType: result.eventType,
      httpMethod: req.method,
      endpoint: slug,
      status: result.handled ? 'processed' : 'ignored',
      statusCode: 200,
      signatureValid: true,
      headers,
      payload,
      externalEventId: result.externalEventId ?? externalEventId,
    })

    await supabase
      .from('integrations')
      .update({ last_event_at: new Date().toISOString(), last_error: null })
      .eq('id', integration.id)

    return json(req, { received: true, duplicate, processed: result.handled })
  } catch (error) {
    return errorResponse(req, error)
  }
})
