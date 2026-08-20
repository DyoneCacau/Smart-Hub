import { Facebook, Loader2, Settings2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { IntegrationStatusBadge } from './IntegrationStatusBadge';
import { useMetaConnectionMutations } from '@/hooks/useMetaConnection';
import { META_PHASE_LABELS, readMetaLeadCapture, readMetaPublicConfig } from '@/lib/metaConnection';
import type { Integration } from '@/types/integration';

interface MetaCardProps {
  connection: Integration | null;
  canCreate: boolean;
  canEdit: boolean;
  onManage: (integration: Integration) => void;
}

export function MetaCard({ connection, canCreate, canEdit, onManage }: MetaCardProps) {
  const { startOAuth } = useMetaConnectionMutations();
  const meta = connection ? readMetaPublicConfig(connection.config) : null;
  const leadCapture = connection
    ? readMetaLeadCapture(connection.config as Record<string, unknown>)
    : { enabled: false, subscribedAt: null };

  return (
    <Card className="flex h-full flex-col border-primary/25 bg-gradient-to-br from-background to-[#1877F2]/5">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 font-semibold">
              <Facebook className="h-5 w-5 text-[#1877F2]" />
              Meta
            </h3>
            <div className="mt-1 flex flex-wrap gap-1">
              <Badge variant="secondary" className="text-[11px]">
                Página do Facebook
              </Badge>
              <Badge variant="outline" className="text-[11px]">
                OAuth
              </Badge>
            </div>
          </div>
          {connection && meta?.connection_phase === 'assets_pending' ? (
            <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-200">
              Aguardando Página
            </Badge>
          ) : (
            connection && <IntegrationStatusBadge status={connection.status} />
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          Conecte a conta Meta da clínica e selecione a Página. Instagram, anúncios e Lead Ads
          ficam indisponíveis até as permissões no app Meta.
        </p>

        {connection && meta ? (
          <div className="space-y-1 rounded-md border bg-background/80 px-3 py-2 text-sm">
            <p className="font-medium">{META_PHASE_LABELS[meta.connection_phase]}</p>
            <p className="text-muted-foreground">
              {meta.page_name
                ? `Página: ${meta.page_name}`
                : 'Nenhuma página selecionada ainda'}
            </p>
            <p className="text-muted-foreground">
              Lead Ads: {leadCapture.enabled ? 'captura ativa' : 'captura desligada'}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma conta Meta conectada nesta clínica.</p>
        )}

        <div className="mt-auto flex flex-col gap-2 pt-1">
          {connection && canEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => onManage(connection)}
            >
              <Settings2 className="mr-1 h-3.5 w-3.5" />
              {meta?.connection_phase === 'assets_pending'
                ? 'Selecionar Página'
                : 'Gerenciar conexão'}
            </Button>
          )}
          {(canCreate || canEdit) && (
            <Button
              type="button"
              size="sm"
              className="w-full"
              disabled={startOAuth.isPending}
              onClick={() => startOAuth.mutate(connection?.id ?? null)}
            >
              {startOAuth.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5" />
              ) : (
                <Facebook className="mr-1 h-3.5 w-3.5" />
              )}
              {connection ? 'Reconectar Meta' : 'Conectar Meta'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
