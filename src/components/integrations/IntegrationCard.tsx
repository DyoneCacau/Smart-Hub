import { ExternalLink, Plus, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { IntegrationStatusBadge } from './IntegrationStatusBadge';
import { INTEGRATION_CATEGORY_LABELS } from '@/lib/integrationProviders';
import type { IntegrationProviderDefinition } from '@/lib/integrationProviders';
import type { Integration } from '@/types/integration';

interface IntegrationCardProps {
  definition: IntegrationProviderDefinition;
  connections: Integration[];
  canCreate: boolean;
  canEdit: boolean;
  onConnect: (definition: IntegrationProviderDefinition) => void;
  onManage: (integration: Integration) => void;
}

export function IntegrationCard({
  definition,
  connections,
  canCreate,
  canEdit,
  onConnect,
  onManage,
}: IntegrationCardProps) {
  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-semibold">{definition.name}</h3>
            <div className="mt-1 flex flex-wrap gap-1">
              <Badge variant="secondary" className="text-[11px]">
                {INTEGRATION_CATEGORY_LABELS[definition.category]}
              </Badge>
              {definition.createsLeads && (
                <Badge
                  variant="outline"
                  className="border-emerald-200 bg-emerald-50 text-[11px] text-emerald-800"
                >
                  Cria lead
                </Badge>
              )}
            </div>
          </div>
          <a
            href={definition.docsUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-muted-foreground hover:text-foreground"
            aria-label={`Documentação de ${definition.name}`}
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>

        <p className="text-sm text-muted-foreground">{definition.description}</p>

        {connections.length > 0 && (
          <ul className="space-y-1.5">
            {connections.map((connection) => (
              <li
                key={connection.id}
                className="flex items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{connection.name}</span>
                <IntegrationStatusBadge status={connection.status} />
                {canEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onManage(connection)}
                    aria-label={`Configurar ${connection.name}`}
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            disabled={!canCreate}
            onClick={() => onConnect(definition)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {connections.length > 0 ? 'Nova conexão' : 'Conectar'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
