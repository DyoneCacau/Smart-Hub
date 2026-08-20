import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BarChart3, Cable, ContactRound, LayoutDashboard, Link2, LogOut, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: '/funil', label: 'Funil', icon: LayoutDashboard },
  { to: '/crm', label: 'CRM', icon: ContactRound },
  { to: '/smart-hub', label: 'Smart Hub', icon: Link2 },
  { to: '/marketing/campanhas', label: 'Marketing', icon: Megaphone },
  { to: '/integracoes', label: 'Integrações', icon: Cable },
  { to: '/smart-hub/analytics', label: 'Analytics', icon: BarChart3 },
];

export function AppShell() {
  const { profile, user, signOut } = useAuth();
  const { workspaceId, workspaces, setWorkspaceId } = useWorkspace();
  const navigate = useNavigate();

  const logout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background md:grid md:grid-cols-[240px_1fr]">
      <aside className="border-b bg-card md:min-h-screen md:border-b-0 md:border-r">
        <div className="space-y-4 p-4">
          <div>
            <div className="text-lg font-semibold">Funnel Platform</div>
            <div className="text-xs text-muted-foreground">Aquisição, CRM e conversão</div>
          </div>

          {workspaces.length > 0 && (
            <Select value={workspaceId || undefined} onValueChange={setWorkspaceId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o workspace" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((workspace) => (
                  <SelectItem key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <nav className="grid gap-1 sm:grid-cols-3 md:grid-cols-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                    isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div className="border-t p-4 md:sticky md:top-[calc(100vh-112px)]">
          <div className="mb-2 truncate text-sm">{profile?.name || user?.email || 'Usuário'}</div>
          <Button variant="outline" className="w-full justify-start" onClick={() => void logout()}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </aside>

      <main className="min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
