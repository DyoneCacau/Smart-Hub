import { Link, useLocation } from 'react-router-dom';
import {
  CalendarDays,
  ClipboardList,
  LogOut,
  MessageCircle,
  Settings,
  Sparkles,
  Stethoscope,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useClinicSettings } from '@/hooks/useClinicSettings';
import { isSupabaseConfigured } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

function AccountFooter() {
  const { user, signOut } = useAuth();
  if (!isSupabaseConfigured || !user) return null;

  const handleSignOut = () => {
    signOut().catch(() => toast.error('Não foi possível sair. Tente novamente.'));
  };

  return (
    <div className="hidden border-t border-border px-3 py-4 sm:mt-auto sm:block">
      <span className="block truncate px-3 text-xs text-muted-foreground">{user.email}</span>
      <button
        type="button"
        onClick={handleSignOut}
        className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <LogOut className="h-4 w-4 shrink-0" />
        Sair
      </button>
    </div>
  );
}

function Sidebar() {
  const location = useLocation();
  const { segment, establishmentName } = useClinicSettings();

  const mainNav = [
    { label: 'Agenda', path: '/agenda', icon: CalendarDays },
    { label: 'Pacientes', path: '/pacientes', icon: Users },
    { label: 'Profissionais', path: '/profissionais', icon: Stethoscope },
    { label: segment.service.plural, path: '/procedimentos', icon: ClipboardList },
    { label: 'Smart Hub', path: '/smart-hub', icon: Sparkles },
    { label: 'WhatsApp', path: '/whatsapp', icon: MessageCircle },
    { label: 'Configurações', path: '/configuracoes', icon: Settings },
  ];

  return (
    <aside className="border-b border-border bg-card sm:sticky sm:top-0 sm:flex sm:h-screen sm:w-60 sm:shrink-0 sm:flex-col sm:border-b-0 sm:border-r">
      <div className="hidden items-center gap-3 px-5 py-5 sm:flex">
        <img src="/logo-192.png" alt="" className="h-10 w-10 shrink-0" width={40} height={40} />
        <div className="min-w-0">
          <span className="block text-lg font-bold leading-tight tracking-tight">SmartHub</span>
          <span className="block truncate text-xs text-muted-foreground">{establishmentName ?? segment.label}</span>
        </div>
      </div>
      <nav className="overflow-x-auto px-3 py-2 sm:overflow-visible sm:py-0">
        <ul className="flex min-w-max gap-1 sm:min-w-0 sm:flex-col">
          {mainNav.map(({ label, path, icon: Icon }) => {
            const isActive = location.pathname === path || location.pathname.startsWith(`${path}/`);
            return (
              <li key={path}>
                <Link
                  to={path}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <AccountFooter />
    </aside>
  );
}

interface AppLayoutProps {
  children: React.ReactNode;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Navegação horizontal exibida no topo da área de conteúdo. */
  topNav?: React.ReactNode;
}

export function AppLayout({ children, title, description, actions, topNav }: AppLayoutProps) {
  return (
    <div className="min-h-screen sm:flex">
      <Sidebar />
      <div className="min-w-0 flex-1">
        {topNav}
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
              {description && <p className="mt-1 text-muted-foreground">{description}</p>}
            </div>
            {actions}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
