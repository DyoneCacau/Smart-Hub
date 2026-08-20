/**
 * Parsing puro de webhooks Lead Ads (Vitest + Deno).
 * Sem I/O, sem tokens, sem Supabase.
 */
import type { LeadSourceValue } from './leadPayload.ts'

export interface MetaLeadgenChange {
  leadgenId: string
  pageId: string
  formId: string | null
  adId: string | null
  createdTime: string | null
  /** facebook | instagram | null quando não identificável */
  platform: 'facebook' | 'instagram' | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Extrai mudanças leadgen do webhook Page (sem PII). */
export function extractLeadgenChanges(payload: unknown): MetaLeadgenChange[] {
  if (!isRecord(payload)) return []
  if (payload.object !== 'page' && payload.object !== 'instagram') return []

  const entry = Array.isArray(payload.entry) ? payload.entry : []
  const out: MetaLeadgenChange[] = []

  for (const item of entry) {
    if (!isRecord(item)) continue
    const entryPageId = typeof item.id === 'string' ? item.id : null
    const changes = Array.isArray(item.changes) ? item.changes : []

    for (const change of changes) {
      if (!isRecord(change)) continue
      if (change.field !== 'leadgen') continue
      const value = isRecord(change.value) ? change.value : null
      if (!value) continue

      const leadgenId = typeof value.leadgen_id === 'string' ? value.leadgen_id.trim() : ''
      const pageId = typeof value.page_id === 'string' && value.page_id.trim()
        ? value.page_id.trim()
        : entryPageId
      if (!leadgenId || !pageId) continue

      const platformRaw = typeof value.platform === 'string'
        ? value.platform.toLowerCase()
        : null
      let platform: MetaLeadgenChange['platform'] = null
      if (platformRaw === 'ig' || platformRaw === 'instagram') platform = 'instagram'
      else if (platformRaw === 'fb' || platformRaw === 'facebook') platform = 'facebook'
      else if (payload.object === 'instagram') platform = 'instagram'

      const createdRaw = value.created_time
      const createdTime = typeof createdRaw === 'number'
        ? new Date(createdRaw * 1000).toISOString()
        : typeof createdRaw === 'string'
          ? createdRaw
          : null

      out.push({
        leadgenId,
        pageId,
        formId: typeof value.form_id === 'string' ? value.form_id : null,
        adId: typeof value.ad_id === 'string' ? value.ad_id : null,
        createdTime,
        platform,
      })
    }
  }

  return out
}

/**
 * Origem no CRM (enum existente).
 * Detalhe facebook_ads / instagram_ads / meta_lead_ads vai em source_payload.
 */
export function resolveMetaLeadCrmSource(
  platform: MetaLeadgenChange['platform'],
): { crmSource: LeadSourceValue; originDetail: 'facebook_ads' | 'instagram_ads' | 'meta_lead_ads' } {
  if (platform === 'instagram') {
    return { crmSource: 'instagram', originDetail: 'instagram_ads' }
  }
  if (platform === 'facebook') {
    return { crmSource: 'facebook', originDetail: 'facebook_ads' }
  }
  return { crmSource: 'paid_traffic', originDetail: 'meta_lead_ads' }
}
