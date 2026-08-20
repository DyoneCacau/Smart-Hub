import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useClinic } from '@/hooks/useClinic';
import { ButtonService } from '@/services/smartHub';
import type { SmartHubButtonInsert, SmartHubButtonUpdate } from '@/types/smartHub';

export function useHubButtons(hubId?: string | null) {
  const { clinicId } = useClinic();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const invalidateRelated = () => {
    queryClient.invalidateQueries({ queryKey: ['smart-hub-buttons', clinicId, hubId] });
    queryClient.invalidateQueries({ queryKey: ['smart-hub-preview', hubId] });
    queryClient.invalidateQueries({ queryKey: ['smart-hub', clinicId] });
    queryClient.invalidateQueries({ queryKey: ['smart-hub-analytics-metrics', clinicId] });
    queryClient.invalidateQueries({ queryKey: ['public-smart-hub'] });
  };

  const query = useQuery({
    queryKey: ['smart-hub-buttons', clinicId, hubId],
    queryFn: async () => {
      if (!clinicId || !hubId) return { data: [], total: 0, page: 1, pageSize: 50 };
      return ButtonService.listByHub(hubId, clinicId);
    },
    enabled: !!clinicId && !!hubId,
  });

  const createButton = useMutation({
    mutationFn: async (payload: Omit<SmartHubButtonInsert, 'clinic_id' | 'hub_id'>) => {
      if (!clinicId || !hubId) throw new Error('Hub não encontrado.');
      return ButtonService.create(
        {
          ...payload,
          clinic_id: clinicId,
          hub_id: hubId,
          title: payload.title,
          visible: payload.visible ?? true,
          status: payload.status ?? 'active',
        },
        user?.id
      );
    },
    onSuccess: () => {
      invalidateRelated();
      toast.success('Botão criado.');
    },
    onError: (err: Error) => toast.error(err.message || 'Erro ao criar botão.'),
  });

  const updateButton = useMutation({
    mutationFn: async ({ id, ...payload }: SmartHubButtonUpdate & { id: string }) => {
      if (!clinicId) throw new Error('Clínica não selecionada.');
      return ButtonService.update(id, clinicId, payload, user?.id);
    },
    onSuccess: () => {
      invalidateRelated();
      toast.success('Botão atualizado.');
    },
    onError: (err: Error) => toast.error(err.message || 'Erro ao atualizar botão.'),
  });

  const deleteButton = useMutation({
    mutationFn: async (id: string) => {
      if (!clinicId) throw new Error('Clínica não selecionada.');
      return ButtonService.softDelete(id, clinicId, user?.id);
    },
    onSuccess: () => {
      invalidateRelated();
      toast.success('Botão removido.');
    },
    onError: (err: Error) => toast.error(err.message || 'Erro ao remover botão.'),
  });

  return {
    buttons: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    createButton,
    updateButton,
    deleteButton,
    refetch: query.refetch,
  };
}
