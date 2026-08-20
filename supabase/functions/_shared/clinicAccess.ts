/**
 * Gate de assinatura + módulos do plano para chamadas autenticadas por
 * `api_tokens` (service_role). O frontend já bloqueia rotas; a API externa
 * precisa repetir a checagem, senão clínica suspensa ou sem CRM/Integrações
 * continua escrevendo leads.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { HttpError } from './httpError.ts'

const ALWAYS_INCLUDED = new Set(['dashboard', 'configuracoes', 'administracao'])
const GRACE_MS = 7 * 24 * 60 * 60 * 1000

function parseFeatures(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((f): f is string => typeof f === 'string')
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw || '[]')
      return Array.isArray(parsed) ? parsed.filter((f): f is string => typeof f === 'string') : []
    } catch {
      return []
    }
  }
  return []
}

function expandAliases(features: string[]): Set<string> {
  const out = new Set(features)
  if (out.has('pacientes_basico')) {
    out.add('pacientes')
    out.delete('pacientes_basico')
  }
  if (out.has('financeiro_basico')) {
    out.add('financeiro')
    out.add('contas_receber')
    out.delete('financeiro_basico')
  }
  if (out.has('financeiro')) out.add('contas_receber')
  for (const always of ALWAYS_INCLUDED) out.add(always)
  return out
}

function activeGrantFeatures(raw: unknown, now: Date): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    if (typeof row.feature !== 'string' || !row.feature.trim()) continue
    if (typeof row.expires_at === 'string' && row.expires_at.trim()) {
      const end = new Date(row.expires_at)
      if (Number.isNaN(end.getTime()) || end.getTime() < now.getTime()) continue
    }
    out.push(row.feature.trim())
  }
  return out
}

function resolveFeatures(opts: {
  planFeatures: unknown
  featuresOverride: unknown
  featureGrants: unknown
  now?: Date
}): Set<string> {
  const now = opts.now ?? new Date()
  const override = parseFeatures(opts.featuresOverride)
  const base = override.length > 0 ? override : parseFeatures(opts.planFeatures)
  const grants = activeGrantFeatures(opts.featureGrants, now)
  return expandAliases([...base, ...grants])
}

function isWithinGrace(
  status: string,
  dueDate: string | null,
  now: Date,
): boolean {
  if (status !== 'suspended') return false
  if (!dueDate) return false
  const due = new Date(dueDate)
  if (Number.isNaN(due.getTime())) return false
  return now.getTime() <= due.getTime() + GRACE_MS
}

/**
 * Garante que a clínica do token pode usar a API de integrações.
 *
 * - Assinatura inexistente / blocked / cancelled → 403
 * - Suspended fora da tolerância de 7 dias → 403
 * - Sem módulo `integracoes` → 403
 * - Escopos `leads:*` também exigem módulo `crm`
 */
export async function assertClinicApiAccess(
  supabase: SupabaseClient,
  clinicId: string,
  requiredScope: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select(
      'status, trial_ends_at, current_period_end, asaas_next_due_date, features_override, feature_grants, plans(features)',
    )
    .eq('clinic_id', clinicId)
    .maybeSingle()

  if (error) throw new HttpError(500, 'Falha ao validar assinatura')
  if (!data) throw new HttpError(403, 'Clínica sem assinatura ativa')

  const now = new Date()
  const status = String(data.status || '')

  if (status === 'blocked' || status === 'cancelled') {
    throw new HttpError(403, 'Assinatura bloqueada ou cancelada')
  }

  if (status === 'suspended') {
    const due =
      (typeof data.asaas_next_due_date === 'string' ? data.asaas_next_due_date : null)
      ?? (typeof data.current_period_end === 'string' ? data.current_period_end : null)
    if (!isWithinGrace(status, due, now)) {
      throw new HttpError(403, 'Assinatura suspensa')
    }
  } else if (!['active', 'trial', 'pending'].includes(status)) {
    throw new HttpError(403, 'Assinatura inativa')
  }

  if (
    status === 'trial'
    && typeof data.trial_ends_at === 'string'
    && new Date(data.trial_ends_at).getTime() <= now.getTime()
  ) {
    throw new HttpError(403, 'Período de trial encerrado')
  }

  const plan = data.plans as { features?: unknown } | null
  const features = resolveFeatures({
    planFeatures: plan?.features,
    featuresOverride: data.features_override,
    featureGrants: data.feature_grants,
    now,
  })

  if (!features.has('integracoes')) {
    throw new HttpError(403, 'Módulo de Integrações não disponível no plano')
  }

  if (requiredScope.startsWith('leads:') && !features.has('crm')) {
    throw new HttpError(403, 'Módulo CRM não disponível no plano')
  }
}

/**
 * Valida assinatura + módulos do plano para fluxos internos (ex.: Smart Hub).
 * Não exige o módulo `integracoes`.
 */
export async function assertClinicModules(
  supabase: SupabaseClient,
  clinicId: string,
  requiredModules: string[],
): Promise<void> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select(
      'status, trial_ends_at, current_period_end, asaas_next_due_date, features_override, feature_grants, plans(features)',
    )
    .eq('clinic_id', clinicId)
    .maybeSingle()

  if (error) throw new HttpError(500, 'Falha ao validar assinatura')
  if (!data) throw new HttpError(403, 'Clínica sem assinatura ativa')

  const now = new Date()
  const status = String(data.status || '')

  if (status === 'blocked' || status === 'cancelled') {
    throw new HttpError(403, 'Assinatura bloqueada ou cancelada')
  }

  if (status === 'suspended') {
    const due =
      (typeof data.asaas_next_due_date === 'string' ? data.asaas_next_due_date : null)
      ?? (typeof data.current_period_end === 'string' ? data.current_period_end : null)
    if (!isWithinGrace(status, due, now)) {
      throw new HttpError(403, 'Assinatura suspensa')
    }
  } else if (!['active', 'trial', 'pending'].includes(status)) {
    throw new HttpError(403, 'Assinatura inativa')
  }

  if (
    status === 'trial'
    && typeof data.trial_ends_at === 'string'
    && new Date(data.trial_ends_at).getTime() <= now.getTime()
  ) {
    throw new HttpError(403, 'Período de trial encerrado')
  }

  const plan = data.plans as { features?: unknown } | null
  const features = resolveFeatures({
    planFeatures: plan?.features,
    featuresOverride: data.features_override,
    featureGrants: data.feature_grants,
    now,
  })

  for (const mod of requiredModules) {
    if (!features.has(mod)) {
      throw new HttpError(403, `Módulo ${mod} não disponível no plano`)
    }
  }
}
