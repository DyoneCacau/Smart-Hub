import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClinic } from './useClinic';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import type {
  AutomationAction,
  AutomationFlow,
  AutomationFlowInput,
  AutomationFlowUpdateInput,
} from '@/types/integration';

const QUERY_KEY = 'automation-flows';
const EMPTY_FLOWS: AutomationFlow[] = [];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asActions(value: unknown): AutomationAction[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .filter((item) => typeof item.type === 'string')
    .map((item) => ({ type: String(item.type), config: asRecord(item.config) }));
}

function normalizeFlow(row: Record<string, unknown>): AutomationFlow {
  return {
    id: String(row.id),
    clinic_id: String(row.clinic_id),
    integration_id: (row.integration_id as string) ?? null,
    name: String(row.name || ''),
    description: (row.description as string) ?? null,
    trigger_type: row.trigger_type as AutomationFlow['trigger_type'],
    trigger_config: asRecord(row.trigger_config),
    actions: asActions(row.actions),
    status: (row.status as AutomationFlow['status']) || 'draft',
    version: Number(row.version || 1),
    last_run_at: (row.last_run_at as string) ?? null,
    run_count: Number(row.run_count || 0),
    error_count: Number(row.error_count || 0),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function useAutomationFlows() {
  const { clinicId } = useClinic();

  const query = useQuery({
    queryKey: [QUERY_KEY, clinicId],
    queryFn: async (): Promise<AutomationFlow[]> => {
      if (!clinicId) return EMPTY_FLOWS;

      const { data, error } = await (supabase as any)
        .from('automation_flows')
        .select('*')
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false });

      if (error) {
        if (error.code === '42P01') return EMPTY_FLOWS;
        throw error;
      }

      return ((data || []) as Record<string, unknown>[]).map(normalizeFlow);
    },
    enabled: !!clinicId,
    retry: false,
  });

  return { ...query, flows: query.data ?? EMPTY_FLOWS };
}

export function useAutomationFlowMutations() {
  const { clinicId } = useClinic();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY, clinicId] });
  };

  const createFlow = useMutation({
    mutationFn: async (input: AutomationFlowInput) => {
      if (!clinicId) throw new Error('Selecione uma clínica');

      const { data, error } = await (supabase as any)
        .from('automation_flows')
        .insert({
          clinic_id: clinicId,
          integration_id: input.integration_id || null,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          trigger_type: input.trigger_type,
          trigger_config: input.trigger_config || {},
          actions: input.actions || [],
          status: input.status || 'draft',
          created_by: user?.id ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return normalizeFlow(data as Record<string, unknown>);
    },
    onSuccess: () => {
      invalidate();
      toast.success('Fluxo criado');
    },
    onError: (error: Error) => {
      toast.error(
        error.message.includes('automation_flows_clinic_id_name_key')
          ? 'Já existe um fluxo com esse nome'
          : 'Erro ao criar fluxo',
      );
    },
  });

  const updateFlow = useMutation({
    mutationFn: async ({ id, ...input }: AutomationFlowUpdateInput & { id: string }) => {
      const { data, error } = await (supabase as any)
        .from('automation_flows')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return normalizeFlow(data as Record<string, unknown>);
    },
    onSuccess: () => {
      invalidate();
      toast.success('Fluxo atualizado');
    },
    onError: () => toast.error('Erro ao atualizar fluxo'),
  });

  const deleteFlow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('automation_flows').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Fluxo removido');
    },
    onError: () => toast.error('Erro ao remover fluxo'),
  });

  return { createFlow, updateFlow, deleteFlow };
}
