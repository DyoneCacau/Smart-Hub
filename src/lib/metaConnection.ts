/**
 * Helpers públicos da conexão Meta (sem tokens).
 * Espelha a forma gravada em `integrations.config.meta`.
 */
import type { MetaConnectionPhase, MetaPublicConfig } from '@/types/integration';

export function emptyMetaPublicConfig(
  phase: MetaConnectionPhase = 'disconnected',
): MetaPublicConfig {
  return {
    meta_user_id: null,
    page_id: null,
    page_name: null,
    instagram_account_id: null,
    instagram_username: null,
    ad_account_id: null,
    ad_account_name: null,
    token_expires_at: null,
    connected_at: null,
    last_status_check_at: null,
    connection_phase: phase,
  };
}

export function readMetaPublicConfig(
  config: Record<string, unknown> | null | undefined,
): MetaPublicConfig {
  const raw =
    config && typeof config.meta === 'object' && config.meta !== null
      ? (config.meta as Record<string, unknown>)
      : {};

  const phase =
    typeof raw.connection_phase === 'string'
      ? (raw.connection_phase as MetaConnectionPhase)
      : 'disconnected';

  return {
    meta_user_id: typeof raw.meta_user_id === 'string' ? raw.meta_user_id : null,
    page_id: typeof raw.page_id === 'string' ? raw.page_id : null,
    page_name: typeof raw.page_name === 'string' ? raw.page_name : null,
    instagram_account_id:
      typeof raw.instagram_account_id === 'string' ? raw.instagram_account_id : null,
    instagram_username:
      typeof raw.instagram_username === 'string' ? raw.instagram_username : null,
    ad_account_id: typeof raw.ad_account_id === 'string' ? raw.ad_account_id : null,
    ad_account_name: typeof raw.ad_account_name === 'string' ? raw.ad_account_name : null,
    token_expires_at:
      typeof raw.token_expires_at === 'string' ? raw.token_expires_at : null,
    connected_at: typeof raw.connected_at === 'string' ? raw.connected_at : null,
    last_status_check_at:
      typeof raw.last_status_check_at === 'string' ? raw.last_status_check_at : null,
    connection_phase: phase,
  };
}

/** Garante que nenhum campo de token vazou para o config público. */
export function assertMetaConfigHasNoSecrets(config: Record<string, unknown>): string[] {
  const forbidden = [
    'access_token',
    'accessToken',
    'token',
    'page_access_token',
    'pageAccessToken',
    'client_secret',
    'app_secret',
  ];
  const hits: string[] = [];
  const walk = (value: unknown, path: string) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const next = path ? `${path}.${key}` : key;
      if (forbidden.includes(key)) hits.push(next);
      walk(nested, next);
    }
  };
  walk(config, '');
  return hits;
}

export const META_PHASE_LABELS: Record<MetaConnectionPhase, string> = {
  oauth_pending: 'Aguardando autorização',
  assets_pending: 'Selecione a Página do Facebook',
  ready: 'Conectada',
  expired: 'Token expirado',
  error: 'Com erro',
  disconnected: 'Desconectada',
};

/** `lead_capture` fica no topo de `integrations.config`, não em `config.meta`. */
export function readMetaLeadCapture(config: Record<string, unknown> | null | undefined): {
  enabled: boolean;
  subscribedAt: string | null;
} {
  if (!config || typeof config !== 'object') {
    return { enabled: false, subscribedAt: null };
  }
  return {
    enabled: config.lead_capture === true,
    subscribedAt:
      typeof config.lead_capture_subscribed_at === 'string'
        ? config.lead_capture_subscribed_at
        : null,
  };
}
