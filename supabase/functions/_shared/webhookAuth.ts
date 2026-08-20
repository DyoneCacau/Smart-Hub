/**
 * Autenticação da entrada de webhook, por provedor.
 *
 * Regra do módulo: **falha fechada**. Integração sem credencial configurada
 * não recebe evento — antes o endpoint aceitava qualquer requisição quando o
 * hash do segredo estava nulo.
 *
 * Dois esquemas:
 * - `meta_hmac`: Facebook / Instagram / WhatsApp. A Meta não permite header
 *   customizado, então valida-se o HMAC-SHA256 do corpo em
 *   `X-Hub-Signature-256` com o secret `META_APP_SECRET` (mesmo secret já
 *   usado pela function `meta-webhook`).
 * - `shared_secret`: demais provedores. Segredo próprio da integração no
 *   header `x-healthcare-secret`, comparado com o hash guardado no banco.
 */
import { corsHeaders, type IntegrationRow } from './integrations.ts'
import {
  authFail,
  authOk,
  hmacSha256Hex,
  META_SIGNATURE_HEADER,
  parseMetaSignatureHeader,
  readWebhookChallenge,
  sha256Hex,
  SHARED_SECRET_HEADER,
  timingSafeEqualHex,
  webhookAuthScheme,
  type WebhookAuthOutcome,
} from './webhookSignature.ts'

export { webhookAuthScheme }
export type { WebhookAuthOutcome }

/**
 * Verifica a requisição de acordo com o provedor da integração.
 * `rawBody` tem que ser exatamente o corpo recebido: o HMAC da Meta é
 * calculado sobre os bytes originais.
 */
export async function verifyWebhookRequest(
  req: Request,
  integration: IntegrationRow,
  rawBody: string,
): Promise<WebhookAuthOutcome> {
  const scheme = webhookAuthScheme(integration.provider)

  if (scheme === 'meta_hmac') {
    const appSecret = Deno.env.get('META_APP_SECRET')
    // Sem o secret da plataforma não há como validar: recusa em vez de aceitar
    if (!appSecret) {
      return authFail('meta_hmac', 'meta_app_secret_missing', 503)
    }

    const provided = parseMetaSignatureHeader(req.headers.get(META_SIGNATURE_HEADER))
    if (!provided) {
      return authFail('meta_hmac', 'meta_signature_missing')
    }

    const expected = await hmacSha256Hex(appSecret, rawBody)
    return timingSafeEqualHex(provided, expected)
      ? authOk('meta_hmac')
      : authFail('meta_hmac', 'meta_signature_mismatch')
  }

  if (!integration.webhook_secret_hash) {
    return authFail('shared_secret', 'integration_secret_not_configured', 409)
  }

  const provided = req.headers.get(SHARED_SECRET_HEADER)
  if (!provided) {
    return authFail('shared_secret', 'secret_header_missing')
  }

  return timingSafeEqualHex(await sha256Hex(provided), integration.webhook_secret_hash)
    ? authOk('shared_secret')
    : authFail('shared_secret', 'secret_mismatch')
}

export interface ChallengeOutcome {
  /** Resposta pronta quando a requisição é um desafio de verificação */
  response: Response
  /** Resultado, para registrar no log de webhook */
  accepted: boolean
  reason: string | null
}

/**
 * Responde ao desafio `hub.mode=subscribe` que a Meta envia por GET ao
 * cadastrar o endpoint.
 *
 * O `hub.verify_token` conferido é o segredo **da própria integração**, não um
 * token global: cada clínica cadastra o seu endpoint com o seu segredo, então
 * uma clínica não consegue validar o endpoint de outra.
 *
 * Devolve null quando a requisição não é um desafio.
 */
export async function handleWebhookChallenge(
  req: Request,
  integration: IntegrationRow,
): Promise<ChallengeOutcome | null> {
  const challenge = readWebhookChallenge(new URL(req.url))
  if (!challenge) return null

  const deny = (reason: string, status: number) => ({
    response: new Response(JSON.stringify({ error: 'Verificação recusada' }), {
      status,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    }),
    accepted: false,
    reason,
  })

  if (challenge.mode !== 'subscribe') {
    return deny('challenge_mode_unsupported', 400)
  }
  if (!integration.webhook_secret_hash) {
    return deny('integration_secret_not_configured', 409)
  }
  if (!challenge.verifyToken) {
    return deny('verify_token_missing', 401)
  }

  const matches = timingSafeEqualHex(
    await sha256Hex(challenge.verifyToken),
    integration.webhook_secret_hash,
  )
  if (!matches) {
    return deny('verify_token_mismatch', 401)
  }

  return {
    // A Meta espera o valor de hub.challenge em texto puro
    response: new Response(challenge.challenge, {
      status: 200,
      headers: { ...corsHeaders(req), 'Content-Type': 'text/plain; charset=utf-8' },
    }),
    accepted: true,
    reason: null,
  }
}
