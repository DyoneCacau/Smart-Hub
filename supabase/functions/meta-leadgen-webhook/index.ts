/**
 * Webhook app-level da Meta para eventos Page `leadgen`.
 *
 * URL (cadastrar no Meta Developers → Webhooks → Page → leadgen):
 *   https://<PROJECT>.supabase.co/functions/v1/meta-leadgen-webhook
 *
 * Deploy: supabase functions deploy meta-leadgen-webhook --no-verify-jwt
 *
 * - GET hub.mode=subscribe: verify token = secret META_WEBHOOK_VERIFY_TOKEN
 * - POST: HMAC X-Hub-Signature-256 com META_APP_SECRET
 * - Clínica resolvida pelo page_id da integração Meta (lead_capture=true)
 * - NÃO processa WhatsApp (isso continua em meta-webhook)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { HttpError } from '../_shared/httpError.ts'
import { processMetaLeadgenWebhook } from '../_shared/metaLeadAds.ts'
import {
  hmacSha256Hex,
  META_SIGNATURE_HEADER,
  parseMetaSignatureHeader,
  readWebhookChallenge,
  timingSafeEqualHex,
} from '../_shared/webhookSignature.ts'

const JSON_HEADERS = { 'Content-Type': 'application/json' }
const MAX_BODY_BYTES = 1_000_000

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), ...JSON_HEADERS },
  })
}

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new HttpError(503, 'Serviço não configurado')
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function verifyMetaHmac(rawBody: string, req: Request): Promise<boolean> {
  const appSecret = Deno.env.get('META_APP_SECRET')?.trim()
  if (!appSecret) throw new HttpError(503, 'META_APP_SECRET não configurado')

  const provided = parseMetaSignatureHeader(req.headers.get(META_SIGNATURE_HEADER))
  if (!provided) return false
  const expected = await hmacSha256Hex(appSecret, rawBody)
  return timingSafeEqualHex(provided, expected)
}

function handleAppChallenge(req: Request): Response | null {
  const challenge = readWebhookChallenge(new URL(req.url))
  if (!challenge) return null

  const verifyToken = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN')?.trim()
  if (!verifyToken) {
    console.error('[meta-leadgen-webhook] META_WEBHOOK_VERIFY_TOKEN ausente')
    return new Response('Verify token not configured', { status: 503 })
  }

  if (challenge.mode !== 'subscribe' || challenge.verifyToken !== verifyToken) {
    console.warn('[meta-leadgen-webhook] challenge rejeitado')
    return new Response('Forbidden', { status: 403 })
  }

  console.log('[meta-leadgen-webhook] challenge aceito')
  return new Response(challenge.challenge, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  })
}

Deno.serve(async (req) => {
  const options = handleOptions(req)
  if (options) return options

  try {
    if (req.method === 'GET') {
      const challenge = handleAppChallenge(req)
      if (!challenge) return json(req, { error: 'Método não permitido' }, 405)
      return challenge
    }

    if (req.method !== 'POST') {
      return json(req, { error: 'Método não permitido' }, 405)
    }

    const contentLength = Number(req.headers.get('content-length') || 0)
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      throw new HttpError(413, 'Payload muito grande')
    }

    const rawBody = await req.text()
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      throw new HttpError(413, 'Payload muito grande')
    }

    const signatureOk = await verifyMetaHmac(rawBody, req)
    if (!signatureOk) {
      console.warn('[meta-leadgen-webhook] assinatura inválida')
      throw new HttpError(401, 'Assinatura inválida')
    }

    let payload: unknown = null
    try {
      payload = rawBody ? JSON.parse(rawBody) : null
    } catch {
      throw new HttpError(400, 'JSON inválido')
    }

    // Só eventos de Página / leadgen — ignora WhatsApp e outros objetos
    if (
      !payload
      || typeof payload !== 'object'
      || Array.isArray(payload)
      || !('object' in payload)
      || (payload as { object?: unknown }).object === 'whatsapp_business_account'
    ) {
      return json(req, { received: true, processed: false, reason: 'ignored_object' })
    }

    const supabase = serviceClient()
    const summary = await processMetaLeadgenWebhook(supabase, payload)

    console.log('[meta-leadgen-webhook] processado', JSON.stringify({
      processed: summary.processed,
      duplicates: summary.duplicates,
      skipped: summary.skipped,
      failed: summary.failed,
      // Sem PII / tokens
      reasons: summary.results.map((r) => r.reason).filter(Boolean),
    }))

    // Se todos falharam por token/permissão, 200 evita loop infinito da Meta;
    // falha temporária Graph já lança HttpError 502 acima.
    return json(req, {
      received: true,
      processed: summary.processed,
      duplicates: summary.duplicates,
      skipped: summary.skipped,
      failed: summary.failed,
    })
  } catch (error) {
    if (error instanceof HttpError) {
      return json(req, { error: error.message }, error.status)
    }
    console.error('[meta-leadgen-webhook] erro inesperado', error)
    return json(req, { error: 'Erro interno' }, 500)
  }
})
