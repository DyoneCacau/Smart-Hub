import { useWorkspace } from '@/hooks/useWorkspace';

/**
 * Camada temporária de compatibilidade.
 * Smart Hub e Integrações ainda possuem arquivos legados que usam os nomes
 * clinic/clinicId. Durante a migração esses valores representam o workspace ativo.
 * Novos módulos devem usar useWorkspace() diretamente.
 */
export function useClinic() {
  const { workspace, workspaceId, isLoading } = useWorkspace();

  return {
    clinic: workspace
      ? {
          id: workspace.id,
          name: workspace.name,
          segment: workspace.segment,
          entity_label: workspace.entity_label,
          conversion_label: workspace.conversion_label,
          isOwner: true,
          is_active: true,
        }
      : null,
    clinicId: workspaceId ?? undefined,
    isOwner: true,
    isLoading,
    error: null,
  };
}

export function useClinics() {
  const { workspaces, isLoading } = useWorkspace();
  return {
    clinics: workspaces.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      segment: workspace.segment,
      entity_label: workspace.entity_label,
      conversion_label: workspace.conversion_label,
      is_active: true,
      user_count: 0,
    })),
    isLoading,
    error: null,
  };
}

export function useClinicsOfSameOwner() {
  const { workspaces, isLoading } = useWorkspace();
  return {
    clinics: workspaces,
    isLoading,
    error: null,
  };
}
