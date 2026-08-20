import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClinic } from './useClinic';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import { getProviderDefinition } from '@/lib/integrationProviders';
import { INTEGRATION_SELECT } from '@/lib/integrationColumns';
import {
  generateWebhookSecret,
  generateWebhookSlug,
  hashSecret,
} from '@/lib/integrationSecurity';
import type {
  Integration,
  IntegrationInput,
  IntegrationUpdateInput,
} from '@/types/integration';

const QUERY_KEY = 'integrations';
const EMPTY_INTEGRATIONS: Integration[] = [];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeIntegration(row: Record<string, unknown>): Integration {
  return {
    id: String(row.id),
    clinic_id: String(row.clinic_id),
    provider: row.provider as Integration['provider'],
    category: row.category as Integration['category'],
    name: String(row.name || ''),
    description: (row.description as string) ?? null,
    status: (row.status as Integration['status']) || 'disconnected',
    direction: (row.direction as Integration['direction']) || 'inbound',
    config: asRecord(row.config),
    external_account_id: (row.external_account_id as string) ?? null,
    webhook_slug: (row.webhook_slug as string) ?? null,
    last_event_at: (row.last_event_at as string) ?? null,
    last_error: (row.last_error as string) ?? null,
    is_active: row.is_active !== false,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function useIntegrations() {
  const { clinicId } = useClinic();

  const query = useQuery({
    queryKey: [QUERY_KEY, clinicId],
    queryFn: async (): Promise<Integration[]> => {
      if (!clinicId) return EMPTY_INTEGRATIONS;

      // Os tipos gerados são atualizados após executar PRODUCAO_25 e
      // regenerar o schema; o cast mantém o módulo utilizável antes disso.
      const { data, error } = await (supabase as any)
        .from('integrations')
        .select(INTEGRATION_SELECT)
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false });

      if (error) {
        // Tabela ainda não criada no ambiente: módulo aparece vazio
        if (error.code === '42P01') return EMPTY_INTEGRATIONS;
        throw error;
      }

      return ((data || []) as Record<string, unknown>[]).map(normalizeIntegration);
    },
    enabled: !!clinicId,
    retry: false,
  });

  return {
    ...query,
    integrations: query.data ?? EMPTY_INTEGRATIONS,
    clinicId,
  };
}

export function useIntegrationMutations() {
  const { clinicId } = useClinic();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY, clinicId] });
  };

  /**
   * Cria a conexão do tenant. Nenhuma credencial é gravada: o segredo do
   * webhook é devolvido uma única vez para a clínica configurar no provedor.
   */
  const createIntegration = useMutation({
    mutationFn: async (
      input: IntegrationInput,
    ): Promise<{ integration: Integration; webhookSecret: string | null }> => {
      if (!clinicId) throw new Error('Selecione uma clínica');

      const definition = getProviderDefinition(input.provider);
      if (!definition) throw new Error('Provedor não suportado');

      const wantsWebhook = definition.supportsInboundWebhook;
      const webhookSecret = wantsWebhook ? generateWebhookSecret() : null;

      const payload = {
        clinic_id: clinicId,
        provider: input.provider,
        category: definition.category,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        direction: input.direction || definition.direction,
        config: input.config || {},
        is_active: input.is_active ?? true,
        status: 'disconnected',
        webhook_slug: wantsWebhook ? generateWebhookSlug() : null,
        webhook_secret_hash: webhookSecret ? await hashSecret(webhookSecret) : null,
        created_by: user?.id ?? null,
      };

      const { data, error } = await (supabase as any)
        .from('integrations')
        .insert(payload)
        .select(INTEGRATION_SELECT)
        .single();

      if (error) throw error;
      return {
        integration: normalizeIntegration(data as Record<string, unknown>),
        webhookSecret,
      };
    },
    onSuccess: () => {
      invalidate();
      toast.success('Integração criada. Conclua a configuração no provedor.');
    },
    onError: (error: Error) => {
      toast.error(
        error.message.includes('integrations_clinic_id_provider_name_key')
          ? 'Já existe uma integração com esse nome para este provedor'
          : 'Erro ao criar integração',
      );
    },
  });

  const updateIntegration = useMutation({
    mutationFn: async ({ id, ...input }: IntegrationUpdateInput & { id: string }) => {
      const { data, error } = await (supabase as any)
        .from('integrations')
        .update(input)
        .eq('id', id)
        .select(INTEGRATION_SELECT)
        .single();

      if (error) throw error;
      return normalizeIntegration(data as Record<string, unknown>);
    },
    onSuccess: () => {
      invalidate();
      toast.success('Integração atualizada');
    },
    onError: () => toast.error('Erro ao atualizar integração'),
  });

  /** Gera novo segredo do webhook e invalida o anterior. */
  const rotateWebhookSecret = useMutation({
    mutationFn: async (id: string): Promise<string> => {
      const secret = generateWebhookSecret();
      const { error } = await (supabase as any)
        .from('integrations')
        .update({ webhook_secret_hash: await hashSecret(secret) })
        .eq('id', id);

      if (error) throw error;
      return secret;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Novo segredo gerado. Atualize no provedor.');
    },
    onError: () => toast.error('Erro ao gerar novo segredo'),
  });

  const deleteIntegration = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('integrations').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Integração removida');
    },
    onError: () => toast.error('Erro ao remover integração'),
  });

  return { createIntegration, updateIntegration, rotateWebhookSecret, deleteIntegration };
}
