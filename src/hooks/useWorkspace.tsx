import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface Workspace {
  id: string;
  name: string;
  segment: string;
  objective: string;
  entity_label: string;
  conversion_label: string;
}

interface WorkspaceContextValue {
  workspaceId: string | null;
  workspace: Workspace | null;
  workspaces: Workspace[];
  setWorkspaceId: (id: string | null) => void;
  isLoading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [workspaceId, setWorkspaceIdState] = useState<string | null>(() =>
    localStorage.getItem('activeWorkspaceId'),
  );

  const query = useQuery({
    queryKey: ['workspaces', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workspace_users')
        .select('workspace:workspaces(id,name,segment,objective,entity_label,conversion_label)')
        .eq('user_id', user!.id);
      if (error) throw error;
      return (data || [])
        .map((row: any) => row.workspace)
        .filter(Boolean) as Workspace[];
    },
  });

  const workspaces = query.data ?? [];

  useEffect(() => {
    if (!workspaceId && workspaces.length > 0) {
      setWorkspaceIdState(workspaces[0].id);
      localStorage.setItem('activeWorkspaceId', workspaces[0].id);
    }
  }, [workspaceId, workspaces]);

  const setWorkspaceId = (id: string | null) => {
    setWorkspaceIdState(id);
    if (id) localStorage.setItem('activeWorkspaceId', id);
    else localStorage.removeItem('activeWorkspaceId');
  };

  const workspace = useMemo(
    () => workspaces.find((item) => item.id === workspaceId) ?? null,
    [workspaces, workspaceId],
  );

  return (
    <WorkspaceContext.Provider
      value={{ workspaceId, workspace, workspaces, setWorkspaceId, isLoading: query.isLoading }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return context;
}
