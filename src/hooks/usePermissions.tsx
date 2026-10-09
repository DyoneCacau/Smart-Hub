export type PermissionAction = 'can_view' | 'can_create' | 'can_edit' | 'can_delete';

/** Cada clínica tem um único usuário (o dono), com acesso total. */
export function usePermissions() {
  return {
    permissions: 'full' as const,
    isLoading: false,
    can: (_feature: string, _action: PermissionAction) => true,
    canSeeAllClinicsInAgenda: () => true,
  };
}
