import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';

export function ProtectedRoute() {
  const { user, isLoading: authLoading } = useAuth();
  const { workspaceId, workspaces, isLoading: workspaceLoading } = useWorkspace();
  const location = useLocation();

  if (authLoading || workspaceLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!workspaceId && workspaces.length === 0 && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
