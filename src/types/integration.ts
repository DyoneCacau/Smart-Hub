/**
 * Módulo de Integrações — tipagens.
 *
 * Tenant: no HealthCare o tenant é a clínica/unidade (`clinic_id`).
 * Nenhum registro deste módulo existe sem `clinic_id`.
 *
 * Nada aqui implementa um provedor específico: são apenas os contratos
 * que as futuras integrações vão preencher.
 */

/** Provedores previstos. Novos provedores entram só nesta união. */
export type IntegrationProvider =
  | 'meta'
  | 'facebook_lead_ads'
  | 'instagram_lead_ads'
  | 'whatsapp_business'
  | 'landing_page'
  | 'webhook'
  | 'external_api'
  | 'n8n'
  | 'make'
  | 'zapier';

/** Fase pública da conexão Meta (sem tokens). */
export type MetaConnectionPhase =
  | 'oauth_pending'
  | 'assets_pending'
  | 'ready'
  | 'expired'
  | 'error'
  | 'disconnected';

/** Metadados públicos em `integrations.config.meta`. */
export interface MetaPublicConfig {
  meta_user_id: string | null;
  page_id: string | null;
  page_name: string | null;
  instagram_account_id: string | null;
  instagram_username: string | null;
  ad_account_id: string | null;
  ad_account_name: string | null;
  token_expires_at: string | null;
  connected_at: string | null;
  last_status_check_at: string | null;
  connection_phase: MetaConnectionPhase;
}

export interface MetaPageOption {
  id: string;
  name: string;
  tasks: string[];
}

export interface MetaInstagramOption {
  id: string;
  username: string | null;
  pageId: string;
}

export interface MetaAdAccountOption {
  id: string;
  accountId: string;
  name: string;
}

export interface IntegrationConnectionLog {
  id: string;
  clinic_id: string;
  integration_id: string | null;
  provider: string;
  event_type: string;
  status: 'info' | 'success' | 'warning' | 'error';
  message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type IntegrationCategory = 'ads' | 'messaging' | 'forms' | 'automation' | 'api';

export type IntegrationStatus = 'disconnected' | 'connected' | 'paused' | 'error';

export type IntegrationDirection = 'inbound' | 'outbound' | 'bidirectional';

export interface Integration {
  id: string;
  clinic_id: string;
  provider: IntegrationProvider;
  category: IntegrationCategory;
  name: string;
  description: string | null;
  status: IntegrationStatus;
  direction: IntegrationDirection;
  /** Configuração não sensível (ids de formulário, mapeamento de campos…) */
  config: Record<string, unknown>;
  external_account_id: string | null;
  webhook_slug: string | null;
  last_event_at: string | null;
  last_error: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface IntegrationInput {
  provider: IntegrationProvider;
  name: string;
  description?: string | null;
  direction?: IntegrationDirection;
  config?: Record<string, unknown>;
  is_active?: boolean;
}

export type IntegrationUpdateInput = Partial<
  Pick<
    Integration,
    'name' | 'description' | 'status' | 'direction' | 'config' | 'is_active' | 'external_account_id'
  >
>;

/** Gatilhos disponíveis para um fluxo de automação. */
export type AutomationTriggerType =
  | 'lead_received'
  | 'message_received'
  | 'form_submitted'
  | 'appointment_created'
  | 'appointment_completed'
  | 'appointment_cancelled'
  | 'payment_confirmed'
  | 'schedule'
  | 'webhook'
  | 'manual';

export type AutomationFlowStatus = 'draft' | 'active' | 'paused' | 'archived';

/** Passo de um fluxo. `type` é aberto de propósito: cada integração registra os seus. */
export interface AutomationAction {
  type: string;
  config?: Record<string, unknown>;
}

export interface AutomationFlow {
  id: string;
  clinic_id: string;
  integration_id: string | null;
  name: string;
  description: string | null;
  trigger_type: AutomationTriggerType;
  trigger_config: Record<string, unknown>;
  actions: AutomationAction[];
  status: AutomationFlowStatus;
  version: number;
  last_run_at: string | null;
  run_count: number;
  error_count: number;
  created_at: string;
  updated_at: string;
}

export interface AutomationFlowInput {
  name: string;
  description?: string | null;
  integration_id?: string | null;
  trigger_type: AutomationTriggerType;
  trigger_config?: Record<string, unknown>;
  actions?: AutomationAction[];
  status?: AutomationFlowStatus;
}

export type AutomationFlowUpdateInput = Partial<AutomationFlowInput>;

export type AutomationLogStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export interface AutomationLog {
  id: string;
  clinic_id: string;
  flow_id: string | null;
  integration_id: string | null;
  status: AutomationLogStatus;
  trigger_type: string | null;
  steps_total: number;
  steps_completed: number;
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error_message: string | null;
  correlation_id: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  created_at: string;
  /** Nome do fluxo quando vem do join */
  flow_name?: string | null;
}

export type WebhookDirection = 'inbound' | 'outbound';

export type WebhookLogStatus = 'received' | 'processed' | 'failed' | 'ignored' | 'duplicate';

export interface WebhookLog {
  id: string;
  clinic_id: string;
  integration_id: string | null;
  direction: WebhookDirection;
  provider: string | null;
  event_type: string | null;
  http_method: string | null;
  endpoint: string | null;
  status: WebhookLogStatus;
  status_code: number | null;
  signature_valid: boolean | null;
  headers: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  response: Record<string, unknown> | null;
  external_event_id: string | null;
  error_message: string | null;
  processed_at: string | null;
  created_at: string;
}

export type ApiTokenStatus = 'active' | 'revoked';

/** Escopos das APIs REST expostas ao tenant. */
export type ApiTokenScope =
  | 'leads:read'
  | 'leads:write'
  | 'appointments:read'
  | 'appointments:write'
  | 'patients:read'
  | 'patients:write'
  | 'automations:read'
  | 'automations:trigger'
  | 'webhooks:read';

/** Metadados do token. O valor completo nunca é persistido nem retornado. */
export interface ApiToken {
  id: string;
  clinic_id: string;
  name: string;
  token_prefix: string;
  scopes: ApiTokenScope[];
  status: ApiTokenStatus;
  expires_at: string | null;
  last_used_at: string | null;
  last_used_ip: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiTokenInput {
  name: string;
  scopes: ApiTokenScope[];
  expires_at?: string | null;
}

/** Retorno da criação: `token` aparece uma única vez, na resposta. */
export interface ApiTokenCreated {
  token: ApiToken;
  /** Valor em claro — exibir uma vez e não guardar. */
  plainToken: string;
}

export interface IntegrationLogFilters {
  integrationId?: string | null;
  status?: string | null;
  limit?: number;
}
