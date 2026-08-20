import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { INTEGRATION_STATUS_LABELS } from '@/lib/integrationProviders';
import type { IntegrationStatus } from '@/types/integration';

const STATUS_STYLES: Record<IntegrationStatus, string> = {
  connected: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  disconnected: 'bg-muted text-muted-foreground border-border',
  paused: 'bg-amber-100 text-amber-900 border-amber-200',
  error: 'bg-destructive/10 text-destructive border-destructive/20',
};

export function IntegrationStatusBadge({
  status,
  className,
}: {
  status: IntegrationStatus;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(STATUS_STYLES[status], className)}>
      {INTEGRATION_STATUS_LABELS[status]}
    </Badge>
  );
}
