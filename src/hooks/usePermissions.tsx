import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useWorkspace } from './useWorkspace';

export type PermissionAction = 'can_view' | 'can_create' | 'can_edit' | 'can_delete';

type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer';

const ROLE_PERMISSIONS: Record<WorkspaceRole, Record<PermissionAction, boolean>> = {
  owner: { can_view: true, can_create: true, can_edit: true, can_delete: true },
  admin: { can_view: true, can_create: true, can_edit: true, can_delete: true },
  editor: { can_view: true, can_create: true, can_edit: true, can_delete: false },
  viewer: { can_view: true, can_create: false, can_edit: false, can_delete: false },
};

export function usePermissions() {
  const { user } = useAuth();
  const { workspaceId } = useWorkspace();

  const { data: role = 'viewer', isLoading } = useQuery({
    queryKey: ['workspace-role', workspaceId, user?.id],
    enabled: !!workspaceId && !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workspace_users')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return ((data?.role as WorkspaceRole | undefined) || 'viewer');
    },
  });

  const can = (_feature: string, action: PermissionAction): boolean => ROLE_PERMISSIONS[role][action];

  return {
    permissions: ROLE_PERMISSIONS[role],
    role,
    isLoading,
    can,
    canSeeAllClinicsInAgenda: () => false,
  };
}
