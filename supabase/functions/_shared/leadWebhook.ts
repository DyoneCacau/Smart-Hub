/**
 * Handler de webhook que transforma o evento recebido em lead no CRM.
 *
 * Serve qualquer provedor que envie contatos: Lead Ads, landing pages,
 * webhooks genéricos, n8n, Make e Zapier. O formato do payload não importa —
 * quem resolve isso é o normalizador em leadPayload.ts.
 */
import { HttpError } from './httpError.ts'
import type { ProviderWebhookHandler } from './integrations.ts'
import { ingestLead } from './leads.ts'
import {
  isLeadDedupeMode,
  isLeadSourceValue,
  LEAD_DEDUPE_MODES,
  LEAD_SOURCE_VALUES,
  type LeadDedupeMode,
  type LeadSourceValue,
} from './leadPayload.ts'

function configString(config: Record<string, unknown>, key: string): string | null {
  const value = config[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function parseConfigLeadSource(config: Record<string, unknown>): LeadSourceValue | null {
  const raw = configString(config, 'default_lead_source')
  if (!raw) return null
  if (!isLeadSourceValue(raw)) {
    throw new HttpError(
      400,
      `default_lead_source inválido na configuração. Use: ${LEAD_SOURCE_VALUES.join(', ')}`,
    )
  }
  return raw
}

function parseConfigDedupe(config: Record<string, unknown>): LeadDedupeMode {
  const raw = configString(config, 'lead_dedupe')
  if (!raw) return 'auto'
  if (!isLeadDedupeMode(raw)) {
    throw new HttpError(
      400,
      `lead_dedupe inválido na configuração. Use: ${LEAD_DEDUPE_MODES.join(', ')}`,
    )
  }
  return raw
}

/**
 * A clínica pode ajustar por integração, em `integrations.config`:
 * - `default_lead_source`: origem quando o payload não informa
 * - `lead_dedupe`: 'auto' | 'external_id' | 'none'
 */
export const leadWebhookHandler: ProviderWebhookHandler = async (ctx) => {
  const config = ctx.integration.config || {}
  const dedupe = parseConfigDedupe(config)
  const defaultLeadSource = parseConfigLeadSource(config)

  const result = await ingestLead(ctx.supabase, {
    clinicId: ctx.integration.clinic_id,
    integrationId: ctx.integration.id,
    provider: ctx.integration.provider,
    payload: ctx.payload,
    defaultLeadSource,
    dedupe,
  })

  return {
    eventType: result.created ? 'lead.created' : 'lead.duplicate',
    externalEventId: result.lead.externalLeadId,
    // Duplicado é evento válido e já tratado: não conta como ignorado
    handled: true,
  }
}
