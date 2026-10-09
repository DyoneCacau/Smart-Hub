import { Link, useLocation } from 'react-router-dom';
import {
  FileEdit,
  LayoutTemplate,
  MousePointerClick,
  BarChart3,
  Settings,
  Globe,
  Eye,
  LayoutDashboard,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/smart-hub/dashboard', icon: LayoutDashboard },
  { label: 'Prévia', path: '/smart-hub/previa', icon: Eye },
  { label: 'Páginas', path: '/smart-hub/paginas', icon: FileEdit },
  { label: 'Templates', path: '/smart-hub/templates', icon: LayoutTemplate },
  { label: 'Botões', path: '/smart-hub/botoes', icon: MousePointerClick },
  { label: 'Analytics', path: '/smart-hub/analytics', icon: BarChart3 },
  { label: 'Configurações', path: '/smart-hub/configuracoes', icon: Settings },
  { label: 'Domínio', path: '/smart-hub/dominio', icon: Globe },
];

function SmartHubTabs() {
  const location = useLocation();

  return (
    <div className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
      <nav className="mx-auto w-full max-w-7xl overflow-x-auto px-4 sm:px-6">
        <ul className="flex min-w-max gap-1 py-2">
          {NAV_ITEMS.map(({ label, path, icon: Icon }) => {
            const isActive = location.pathname.startsWith(path);
            return (
              <li key={path}>
                <Link
                  to={path}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

interface SmartHubLayoutProps {
  children: React.ReactNode;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function SmartHubLayout(props: SmartHubLayoutProps) {
  return <AppLayout {...props} topNav={<SmartHubTabs />} />;
}
