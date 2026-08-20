import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useClinic } from './useClinic';
import { metaConnectionService } from '@/services/metaConnectionService';
import type { IntegrationConnectionLog } from '@/types/integration';

const LOGS_KEY = 'meta-connection-logs';

function normalizeLog(row: Record<string, unknown>): IntegrationConnectionLog {
  return {
    id: String(row.id),
    clinic_id: String(row.clinic_id),
    integration_id: (row.integration_id as string) ?? null,
    provider: String(row.provider || 'meta'),
    event_type: String(row.event_type || ''),
    status: (row.status as IntegrationConnectionLog['status']) || 'info',
    message: (row.message as string) ?? null,
    metadata:
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
    created_at: String(row.created_at),
  };
}

export function useMetaConnectionLogs(integrationId: string | null) {
  const { clinicId } = useClinic();

  return useQuery({
    queryKey: [LOGS_KEY, clinicId, integrationId],
    queryFn: async (): Promise<IntegrationConnectionLog[]> => {
      if (!clinicId || !integrationId) return [];
      const { data, error } = await (supabase as any)
        .from('integration_connection_logs')
        .select(
          'id, clinic_id, integration_id, provider, event_type, status, message, metadata, created_at',
        )
        .eq('clinic_id', clinicId)
        .eq('integration_id', integrationId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        if (error.code === '42P01') return [];
        throw error;
      }
      return ((data || []) as Record<string, unknown>[]).map(normalizeLog);
    },
    enabled: !!clinicId && !!integrationId,
    retry: false,
  });
}

export function useMetaConnectionMutations() {
  const { clinicId } = useClinic();
  const queryClient = useQueryClient();

  const invalidate = (integrationId?: string | null) => {
    queryClient.invalidateQueries({ queryKey: ['integrations', clinicId] });
    if (integrationId) {
      queryClient.invalidateQueries({ queryKey: [LOGS_KEY, clinicId, integrationId] });
    }
  };

  const startOAuth = useMutation({
    mutationFn: async (integrationId?: string | null) => {
      if (!clinicId) throw new Error('Selecione uma clínica');
      return metaConnectionService.startOAuth(clinicId, integrationId);
    },
    onSuccess: (result) => {
      invalidate(result.integrationId);
      window.location.assign(result.authorizationUrl);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Não foi possível iniciar o OAuth da Meta');
    },
  });

  const listAssets = useMutation({
    mutationFn: async (integrationId: string) => {
      if (!clinicId) throw new Error('Selecione uma clínica');
      return metaConnectionService.listAssets(clinicId, integrationId);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Não foi possível listar os ativos Meta');
    },
  });

  const saveAssets = useMutation({
    mutationFn: async (input: {
      integrationId: string;
      pageId: string;
      instagramAccountId?: string | null;
      adAccountId?: string | null;
    }) => {
      if (!clinicId) throw new Error('Selecione uma clínica');
      return metaConnectionService.saveAssets(clinicId, input.integrationId, input);
    },
    onSuccess: (_data, variables) => {
      toast.success('Conexão Meta atualizada');
      invalidate(variables.integrationId);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Não foi possível salvar a seleção');
    },
  });

  const refreshStatus = useMutation({
    mutationFn: async (integrationId: string) => {
      if (!clinicId) throw new Error('Selecione uma clínica');
      return metaConnectionService.refreshStatus(clinicId, integrationId);
    },
    onSuccess: (result, integrationId) => {
      if (result.ok) toast.success('Status da conexão atualizado');
      else if (result.reason === 'expired') {
        toast.warning('Token Meta expirado — reconecte a conta');
      }
      invalidate(integrationId);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao atualizar status');
    },
  });

  const disconnect = useMutation({
    mutationFn: async (integrationId: string) => {
      if (!clinicId) throw new Error('Selecione uma clínica');
      return metaConnectionService.disconnect(clinicId, integrationId);
    },
    onSuccess: (_data, integrationId) => {
      toast.success('Meta desconectada desta clínica');
      invalidate(integrationId);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Não foi possível desconectar');
    },
  });

  const enableLeadCapture = useMutation({
    mutationFn: async (integrationId: string) => {
      if (!clinicId) throw new Error('Selecione uma clínica');
      return metaConnectionService.enableLeadCapture(clinicId, integrationId);
    },
    onSuccess: (_data, integrationId) => {
      toast.success('Captura de Lead Ads ativada');
      invalidate(integrationId);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Não foi possível ativar a captura de leads');
    },
  });

  const disableLeadCapture = useMutation({
    mutationFn: async (integrationId: string) => {
      if (!clinicId) throw new Error('Selecione uma clínica');
      return metaConnectionService.disableLeadCapture(clinicId, integrationId);
    },
    onSuccess: (_data, integrationId) => {
      toast.success('Captura de Lead Ads desativada');
      invalidate(integrationId);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Não foi possível desativar a captura');
    },
  });

  return {
    startOAuth,
    listAssets,
    saveAssets,
    refreshStatus,
    disconnect,
    enableLeadCapture,
    disableLeadCapture,
  };
}
