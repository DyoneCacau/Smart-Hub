/** Módulos oferecidos em planos / assinatura (chaves alinhadas ao app). */
export const PLAN_MODULES = [
  { id: 'dashboard', name: 'Dashboard', description: 'Visão geral da clínica', always: true },
  { id: 'agenda', name: 'Agenda', description: 'Agendamento de consultas' },
  { id: 'pacientes', name: 'Pacientes', description: 'Cadastro e prontuários' },
  { id: 'profissionais', name: 'Profissionais', description: 'Gestão de profissionais' },
  { id: 'procedimentos', name: 'Procedimentos', description: 'Catálogo de procedimentos e valores' },
  { id: 'crm', name: 'CRM de Vendas', description: 'Pipeline de leads, follow-up e conversão' },
  { id: 'financeiro', name: 'Caixa', description: 'Recebimentos do dia e fechamento de caixa' },
  { id: 'contas_receber', name: 'Contas a receber', description: 'Parcelas e cobranças futuras' },
  { id: 'comissoes', name: 'Comissões', description: 'Cálculo de comissões' },
  { id: 'estoque', name: 'Estoque', description: 'Controle de materiais' },
  { id: 'relatorios', name: 'Relatórios', description: 'Relatórios gerenciais' },
  { id: 'ponto', name: 'Ponto Eletrônico', description: 'Controle de ponto eletrônico' },
  {
    id: 'administracao',
    name: 'Administração',
    description: 'Usuários, permissões e solicitação de upgrade',
    always: true,
  },
  { id: 'termos', name: 'Termos e Contratos', description: 'Criação de termos e contratos' },
  {
    id: 'smart_hub',
    name: 'Smart Hub',
    description: 'Página pública inteligente de conversão',
  },
  {
    id: 'integracoes',
    name: 'Integrações',
    description: 'Lead Ads, WhatsApp, webhooks, n8n, Make, Zapier e APIs',
  },
  { id: 'multi_clinica', name: 'Multi-Clínica', description: 'Gestão de múltiplas unidades' },
] as const;

export type PlanModuleId = (typeof PLAN_MODULES)[number]['id'];

export const ALWAYS_INCLUDED_MODULES: PlanModuleId[] = PLAN_MODULES.filter(
  (m) => 'always' in m && m.always,
).map((m) => m.id);

/** Labels curtos para UI de planos / clínica */
export const PLAN_MODULE_LABELS: Record<string, string> = Object.fromEntries(
  PLAN_MODULES.map((m) => [m.id, m.name]),
);

/** Compatibilidade: módulos antigos “básico” passam a liberar o módulo completo */
export const LEGACY_FEATURE_ALIASES: Record<string, string[]> = {
  pacientes_basico: ['pacientes'],
  financeiro_basico: ['financeiro', 'contas_receber'],
  financeiro: ['contas_receber'],
};

export function expandFeatureAliases(features: string[]): string[] {
  const expanded = new Set<string>(features);
  features.forEach((feature) => {
    LEGACY_FEATURE_ALIASES[feature]?.forEach((alias) => expanded.add(alias));
  });
  // Normaliza legado → canônico
  if (expanded.has('pacientes_basico')) {
    expanded.add('pacientes');
    expanded.delete('pacientes_basico');
  }
  if (expanded.has('financeiro_basico')) {
    expanded.add('financeiro');
    expanded.add('contas_receber');
    expanded.delete('financeiro_basico');
  }
  return Array.from(expanded);
}

export function ensureAlwaysIncluded(modules: string[]): string[] {
  const next = new Set(modules);
  ALWAYS_INCLUDED_MODULES.forEach((id) => next.add(id));
  return Array.from(next);
}

export interface FeatureGrant {
  feature: string;
  expires_at: string | null;
  note?: string | null;
}

export function parseFeatureGrants(raw: unknown): FeatureGrant[] {
  if (!Array.isArray(raw)) return [];
  const out: FeatureGrant[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (typeof row.feature !== 'string' || !row.feature.trim()) continue;
    const expires =
      typeof row.expires_at === 'string' && row.expires_at.trim()
        ? row.expires_at
        : null;
    out.push({
      feature: row.feature.trim(),
      expires_at: expires,
      note: typeof row.note === 'string' ? row.note : null,
    });
  }
  return out;
}

export function activeGrantFeatures(grants: FeatureGrant[], now = new Date()): string[] {
  return grants
    .filter((g) => {
      if (!g.expires_at) return true;
      const end = new Date(g.expires_at);
      return !Number.isNaN(end.getTime()) && end.getTime() >= now.getTime();
    })
    .map((g) => g.feature);
}

/** Módulos efetivos da clínica: override (se houver) ∪ plano ∪ brindes ativos */
export function resolveClinicFeatures(opts: {
  planFeatures: string[];
  featuresOverride?: unknown;
  featureGrants?: unknown;
}): string[] {
  const override = Array.isArray(opts.featuresOverride)
    ? opts.featuresOverride.filter((f): f is string => typeof f === 'string')
    : [];
  const base = override.length > 0 ? override : opts.planFeatures;
  const grants = activeGrantFeatures(parseFeatureGrants(opts.featureGrants));
  return expandFeatureAliases(ensureAlwaysIncluded([...base, ...grants]));
}
