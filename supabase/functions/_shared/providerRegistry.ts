/**
 * Registro de handlers de webhook por provedor.
 *
 * Cada integração futura registra o seu handler aqui — o webhook genérico e o
 * dispatch continuam iguais.
 */
import type { IntegrationRow, ProviderWebhookHandler } from './integrations.ts'
import { leadWebhookHandler } from './leadWebhook.ts'
import { LEAD_CAPTURE_PROVIDERS, providerCreatesLeads } from './leadPayload.ts'
import { META_PROVIDER } from './metaConnection.ts'
import { processMetaLeadgenWebhook } from './metaLeadAds.ts'

/**
 * Meta Lead Ads pelo slug da integração: mesma lógica do webhook app-level
 * (fetch Graph + ingestLead). Não usa o normalizador “cego” do payload.
 */
const metaLeadgenSlugHandler: ProviderWebhookHandler = async (ctx) => {
  const summary = await processMetaLeadgenWebhook(ctx.supabase, ctx.payload)
  const first = summary.results[0]
  return {
    eventType: first?.created
      ? 'lead.created'
      : first?.duplicate
        ? 'lead.duplicate'
        : summary.skipped
          ? 'lead.skipped'
          : 'lead.failed',
    externalEventId: first?.leadgenId ?? null,
    handled: summary.processed > 0 || summary.duplicates > 0,
  }
}

const PROVIDER_WEBHOOK_HANDLERS: Partial<Record<string, ProviderWebhookHandler>> =
  Object.fromEntries(
    LEAD_CAPTURE_PROVIDERS.map((provider) => [
      provider,
      provider === META_PROVIDER ? metaLeadgenSlugHandler : leadWebhookHandler,
    ]),
  )

/**
 * Resolve o handler da integração.
 *
 * `config.lead_capture` tem a palavra final: permite ligar a captação num
 * provedor de mensagens ou desligar num provedor de anúncios.
 */
export function resolveWebhookHandler(
  integration: IntegrationRow,
): ProviderWebhookHandler | null {
  const leadCapture = integration.config?.lead_capture
  if (leadCapture === false) return null
  if (leadCapture === true) {
    if (integration.provider === META_PROVIDER) return metaLeadgenSlugHandler
    return leadWebhookHandler
  }
  return PROVIDER_WEBHOOK_HANDLERS[integration.provider] ?? null
}

export { LEAD_CAPTURE_PROVIDERS, providerCreatesLeads }
