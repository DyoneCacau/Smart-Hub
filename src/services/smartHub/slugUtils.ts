/** Utilitários de slug do Smart Hub */

const RESERVED_SLUGS = new Set([
  'login',
  'privacidade',
  'forgot-password',
  'reset-password',
  'pacientes',
  'agenda',
  'financeiro',
  'termos',
  'relatorios',
  'comissoes',
  'estoque',
  'profissionais',
  'ponto',
  'administracao',
  'billing',
  'selecionar-clinica',
  'configuracoes',
  'superadmin',
  'minhas-clinicas',
  'smart-hub',
  'marketing',
  'hub',
  'api',
  'admin',
  'app',
  'www',
]);

export function normalizeSlug(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function generateSlugFromTitle(title: string): string {
  const base = normalizeSlug(title);
  return base || `hub-${Date.now().toString(36)}`;
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(normalizeSlug(slug));
}

export function validateSlug(slug: string): { valid: boolean; error?: string } {
  const normalized = normalizeSlug(slug);
  if (!normalized) {
    return { valid: false, error: 'Slug inválido.' };
  }
  if (normalized.length < 2) {
    return { valid: false, error: 'Slug deve ter pelo menos 2 caracteres.' };
  }
  if (normalized.length > 60) {
    return { valid: false, error: 'Slug deve ter no máximo 60 caracteres.' };
  }
  if (isReservedSlug(normalized)) {
    return { valid: false, error: 'Este slug é reservado pelo sistema.' };
  }
  return { valid: true };
}

export function buildPublicHubUrl(slug: string, origin?: string): string {
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/hub/${normalizeSlug(slug)}`;
}
