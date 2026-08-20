import type {
  ApiTokenScope,
  AutomationTriggerType,
  IntegrationCategory,
  IntegrationDirection,
  IntegrationProvider,
  IntegrationStatus,
} from '@/types/integration';

export interface IntegrationProviderDefinition {
  id: IntegrationProvider;
  name: string;
  category: IntegrationCategory;
  description: string;
  /** Direção padrão sugerida ao criar a conexão */
  direction: IntegrationDirection;
  /** Recebe eventos por webhook de entrada */
  supportsInboundWebhook: boolean;
  /** Precisa de token/API key guardado como secret (nunca no banco) */
  requiresCredentials: boolean;
  /**
   * Eventos recebidos viram lead no CRM automaticamente.
   * Pode ser invertido por conexão com `config.lead_capture`.
   */
  createsLeads: boolean;
  /** Documentação oficial para quem for implementar */
  docsUrl: string;
}

/**
 * Catálogo de provedores. Adicionar uma nova integração no futuro é
 * acrescentar uma entrada aqui e o valor na união IntegrationProvider
 * (mais o CHECK do provider no SQL).
 */
export const INTEGRATION_PROVIDERS: IntegrationProviderDefinition[] = [
  {
    id: 'meta',
    name: 'Meta',
    category: 'ads',
    description:
      'Conecta a Página do Facebook da clínica e captura Lead Ads no CRM.',
    direction: 'inbound',
    supportsInboundWebhook: true,
    requiresCredentials: true,
    createsLeads: true,
    docsUrl: 'https://developers.facebook.com/docs/marketing-api/guides/lead-ads',
  },
  {
    id: 'facebook_lead_ads',
    name: 'Facebook Lead Ads',
    category: 'ads',
    description: 'Recebe leads dos formulários instantâneos do Facebook.',
    direction: 'inbound',
    supportsInboundWebhook: true,
    requiresCredentials: true,
    createsLeads: true,
    docsUrl: 'https://developers.facebook.com/docs/marketing-api/guides/lead-ads',
  },
  {
    id: 'instagram_lead_ads',
    name: 'Instagram Lead Ads',
    category: 'ads',
    description: 'Recebe leads das campanhas de formulário do Instagram.',
    direction: 'inbound',
    supportsInboundWebhook: true,
    requiresCredentials: true,
    createsLeads: true,
    docsUrl: 'https://developers.facebook.com/docs/instagram-platform',
  },
  {
    id: 'whatsapp_business',
    name: 'WhatsApp Business',
    category: 'messaging',
    description: 'Envio e recebimento de mensagens pela Cloud API da Meta.',
    direction: 'bidirectional',
    supportsInboundWebhook: true,
    requiresCredentials: true,
    createsLeads: false,
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
  },
  {
    id: 'landing_page',
    name: 'Landing Pages',
    category: 'forms',
    description: 'Recebe formulários de páginas de captura próprias ou de terceiros.',
    direction: 'inbound',
    supportsInboundWebhook: true,
    requiresCredentials: false,
    createsLeads: true,
    docsUrl: 'https://supabase.com/docs/guides/functions',
  },
  {
    id: 'webhook',
    name: 'Webhooks',
    category: 'api',
    description: 'Endpoint genérico de entrada para qualquer sistema que envie HTTP.',
    direction: 'inbound',
    supportsInboundWebhook: true,
    requiresCredentials: false,
    createsLeads: true,
    docsUrl: 'https://supabase.com/docs/guides/functions',
  },
  {
    id: 'external_api',
    name: 'APIs externas',
    category: 'api',
    description: 'Chamadas de saída para sistemas parceiros e ERPs.',
    direction: 'outbound',
    supportsInboundWebhook: false,
    requiresCredentials: true,
    createsLeads: false,
    docsUrl: 'https://supabase.com/docs/guides/functions',
  },
  {
    id: 'n8n',
    name: 'n8n',
    category: 'automation',
    description: 'Orquestração de fluxos self-hosted via webhook.',
    direction: 'bidirectional',
    supportsInboundWebhook: true,
    requiresCredentials: false,
    createsLeads: true,
    docsUrl: 'https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/',
  },
  {
    id: 'make',
    name: 'Make',
    category: 'automation',
    description: 'Cenários do Make (antigo Integromat) por webhook.',
    direction: 'bidirectional',
    supportsInboundWebhook: true,
    requiresCredentials: false,
    createsLeads: true,
    docsUrl: 'https://www.make.com/en/help/tools/webhooks',
  },
  {
    id: 'zapier',
    name: 'Zapier',
    category: 'automation',
    description: 'Zaps disparados por eventos da clínica.',
    direction: 'bidirectional',
    supportsInboundWebhook: true,
    requiresCredentials: false,
    createsLeads: true,
    docsUrl: 'https://platform.zapier.com/build/webhooks',
  },
];

/**
 * Provedores da Meta: não permitem header customizado, então os eventos são
 * autenticados pelo HMAC em `X-Hub-Signature-256` e o endpoint é validado por
 * um desafio GET (`hub.mode=subscribe`). Precisa espelhar
 * `META_WEBHOOK_PROVIDERS` em `supabase/functions/_shared/webhookSignature.ts`.
 */
export const META_WEBHOOK_PROVIDERS: IntegrationProvider[] = [
  'meta',
  'facebook_lead_ads',
  'instagram_lead_ads',
  'whatsapp_business',
];

export function isMetaWebhookProvider(provider: string): boolean {
  return (META_WEBHOOK_PROVIDERS as string[]).includes(provider);
}

const PROVIDER_BY_ID = new Map(INTEGRATION_PROVIDERS.map((p) => [p.id, p]));

export function getProviderDefinition(
  provider: string,
): IntegrationProviderDefinition | undefined {
  return PROVIDER_BY_ID.get(provider as IntegrationProvider);
}

export function getProviderLabel(provider: string): string {
  return PROVIDER_BY_ID.get(provider as IntegrationProvider)?.name ?? provider;
}

export const INTEGRATION_CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  ads: 'Anúncios e captação',
  messaging: 'Mensagens',
  forms: 'Formulários',
  automation: 'Automação',
  api: 'APIs e webhooks',
};

export const INTEGRATION_STATUS_LABELS: Record<IntegrationStatus, string> = {
  disconnected: 'Não conectada',
  connected: 'Conectada',
  paused: 'Pausada',
  error: 'Com erro',
};

export const INTEGRATION_DIRECTION_LABELS: Record<IntegrationDirection, string> = {
  inbound: 'Entrada',
  outbound: 'Saída',
  bidirectional: 'Entrada e saída',
};

export const AUTOMATION_TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  lead_received: 'Lead recebido',
  message_received: 'Mensagem recebida',
  form_submitted: 'Formulário enviado',
  appointment_created: 'Agendamento criado',
  appointment_completed: 'Atendimento finalizado',
  appointment_cancelled: 'Agendamento cancelado',
  payment_confirmed: 'Pagamento confirmado',
  schedule: 'Agendado (recorrente)',
  webhook: 'Webhook recebido',
  manual: 'Disparo manual',
};

export const API_TOKEN_SCOPES: { id: ApiTokenScope; label: string }[] = [
  { id: 'leads:read', label: 'Ler leads' },
  { id: 'leads:write', label: 'Criar / atualizar leads' },
  { id: 'appointments:read', label: 'Ler agendamentos' },
  { id: 'appointments:write', label: 'Criar / atualizar agendamentos' },
  { id: 'patients:read', label: 'Ler pacientes' },
  { id: 'patients:write', label: 'Criar / atualizar pacientes' },
  { id: 'automations:read', label: 'Ler automações' },
  { id: 'automations:trigger', label: 'Disparar automações' },
  { id: 'webhooks:read', label: 'Ler logs de webhook' },
];
