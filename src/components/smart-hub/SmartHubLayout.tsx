import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FileEdit,
  LayoutTemplate,
  MousePointerClick,
  BarChart3,
  Settings,
  Globe,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/smart-hub', icon: LayoutDashboard, exact: true },
  { label: 'Prévia', path: '/smart-hub/previa', icon: Eye },
  { label: 'Páginas', path: '/smart-hub/paginas', icon: FileEdit },
  { label: 'Templates', path: '/smart-hub/templates', icon: LayoutTemplate },
  { label: 'Botões', path: '/smart-hub/botoes', icon: MousePointerClick },
  { label: 'Analytics', path: '/smart-hub/analytics', icon: BarChart3 },
  { label: 'Configurações', path: '/smart-hub/configuracoes', icon: Settings },
  { label: 'Domínio', path: '/smart-hub/dominio', icon: Globe },
];

interface SmartHubLayoutProps {
  children: React.ReactNode;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function SmartHubLayout({ children, title, description, actions }: SmartHubLayoutProps) {
  const location = useLocation();

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>

      <nav className="mb-6 -mx-1 overflow-x-auto">
        <ul className="flex min-w-max gap-1 px-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact
              ? location.pathname === item.path
              : location.pathname.startsWith(item.path);

            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {children}
    </>
  );
}
