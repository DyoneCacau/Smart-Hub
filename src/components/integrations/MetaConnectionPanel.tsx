import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  AlertTriangle,
  Facebook,
  Instagram,
  Link2,
  Loader2,
  Megaphone,
  RefreshCw,
  Unplug,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { IntegrationStatusBadge } from './IntegrationStatusBadge';
import { useMetaConnectionLogs, useMetaConnectionMutations } from '@/hooks/useMetaConnection';
import { META_PHASE_LABELS, readMetaLeadCapture, readMetaPublicConfig } from '@/lib/metaConnection';
import type { Integration, MetaPageOption } from '@/types/integration';

interface MetaConnectionPanelProps {
  integration: Integration;
  canEdit: boolean;
  /** Abre seleção de ativos automaticamente (retorno do OAuth). */
  autoOpenAssets?: boolean;
}

const LOG_STATUS_LABEL: Record<string, string> = {
  info: 'Info',
  success: 'Sucesso',
  warning: 'Atenção',
  error: 'Erro',
};

function formatWhen(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : format(date, 'dd/MM/yyyy HH:mm');
}

export function MetaConnectionPanel({
  integration,
  canEdit,
  autoOpenAssets = false,
}: MetaConnectionPanelProps) {
  const meta = useMemo(() => readMetaPublicConfig(integration.config), [integration.config]);
  const leadCapture = useMemo(
    () => readMetaLeadCapture(integration.config as Record<string, unknown>),
    [integration.config],
  );
  const { startOAuth, listAssets, saveAssets, refreshStatus, disconnect, enableLeadCapture, disableLeadCapture } =
    useMetaConnectionMutations();
  const { data: logs = [], isLoading: loadingLogs } = useMetaConnectionLogs(integration.id);

  const [pages, setPages] = useState<MetaPageOption[]>([]);
  const [pageId, setPageId] = useState<string>(meta.page_id || '');
  const [assetsLoaded, setAssetsLoaded] = useState(false);

  const hasOAuthSession =
    meta.connection_phase === 'assets_pending'
    || meta.connection_phase === 'ready'
    || meta.connection_phase === 'expired'
    || meta.connection_phase === 'error'
    || meta.connection_phase === 'oauth_pending';

  const showAssetForm =
    hasOAuthSession
    || autoOpenAssets;

  useEffect(() => {
    setPageId(meta.page_id || '');
  }, [meta.page_id]);

  useEffect(() => {
    // Após OAuth (assets_pending) prioriza list_assets — refresh automático
    // competia e podia marcar expired/error antes da listagem.
    if (meta.connection_phase === 'disconnected') return;
    if (autoOpenAssets || meta.connection_phase === 'assets_pending') return;
    refreshStatus.mutate(integration.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uma vez por integração aberta
  }, [integration.id, autoOpenAssets, meta.connection_phase]);

  useEffect(() => {
    if (!showAssetForm || !canEdit) return;
    if (meta.connection_phase === 'disconnected' && !autoOpenAssets) return;
    // Token inválido: listagem falha — usuário precisa Reconectar
    if (meta.connection_phase === 'expired' || meta.connection_phase === 'error') {
      setAssetsLoaded(true);
      return;
    }

    let cancelled = false;
    setAssetsLoaded(false);
    listAssets.mutateAsync(integration.id).then((result) => {
      if (cancelled) return;
      setPages(result.pages);
      setPageId(result.selection.page_id || '');
      setAssetsLoaded(true);
    }).catch((error: unknown) => {
      if (cancelled) return;
      setAssetsLoaded(true);
      // Toast já vem do hook; log local sem secrets
      console.warn('[meta] list_assets falhou', {
        integrationId: integration.id,
        message: error instanceof Error ? error.message : 'erro desconhecido',
      });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integration.id, showAssetForm, canEdit, autoOpenAssets, meta.connection_phase]);

  const handleSave = () => {
    if (!pageId) return;
    saveAssets.mutate({
      integrationId: integration.id,
      pageId,
      instagramAccountId: null,
      adAccountId: null,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">Conexão Meta</h3>
            <IntegrationStatusBadge status={integration.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {META_PHASE_LABELS[meta.connection_phase]}
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={refreshStatus.isPending}
              onClick={() => refreshStatus.mutate(integration.id)}
            >
              {refreshStatus.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
              )}
              Atualizar status
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={startOAuth.isPending}
              onClick={() => startOAuth.mutate(integration.id)}
            >
              <Link2 className="mr-1 h-3.5 w-3.5" />
              Reconectar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={disconnect.isPending || meta.connection_phase === 'disconnected'}
              onClick={() => {
                if (window.confirm('Desconectar a Meta desta clínica? Os tokens serão apagados.')) {
                  disconnect.mutate(integration.id);
                }
              }}
            >
              <Unplug className="mr-1 h-3.5 w-3.5" />
              Desconectar
            </Button>
          </div>
        )}
      </div>

      {(meta.connection_phase === 'expired' || meta.connection_phase === 'error') && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {integration.last_error || 'A conexão precisa ser reconectada.'}
            {canEdit ? ' Use Reconectar para autorizar novamente na Meta.' : ''}
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border p-3 text-sm">
          <div className="mb-1 flex items-center gap-1.5 font-medium">
            <Facebook className="h-4 w-4 text-[#1877F2]" />
            Página
          </div>
          <p className="text-muted-foreground">{meta.page_name || 'Não selecionada'}</p>
        </div>
        <div className="rounded-md border border-dashed p-3 text-sm opacity-70">
          <div className="mb-1 flex items-center gap-1.5 font-medium">
            <Instagram className="h-4 w-4" />
            Instagram
            <Badge variant="outline" className="text-[10px]">Indisponível</Badge>
          </div>
          <p className="text-muted-foreground">
            Aguardando permissão no app Meta (`instagram_basic`).
          </p>
        </div>
        <div className="rounded-md border border-dashed p-3 text-sm opacity-70">
          <div className="mb-1 flex items-center gap-1.5 font-medium">
            <Megaphone className="h-4 w-4" />
            Conta de anúncios
            <Badge variant="outline" className="text-[10px]">Indisponível</Badge>
          </div>
          <p className="text-muted-foreground">
            Aguardando permissão no app Meta (`ads_read`).
          </p>
        </div>
        <div className="rounded-md border p-3 text-sm">
          <div className="mb-1 font-medium">Token</div>
          <p className="text-muted-foreground">
            Expira em {formatWhen(meta.token_expires_at)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Última verificação: {formatWhen(meta.last_status_check_at)}
          </p>
        </div>
        <div className="rounded-md border p-3 text-sm sm:col-span-2">
          <div className="mb-1 flex flex-wrap items-center gap-2 font-medium">
            Captura Lead Ads
            <Badge
              variant="outline"
              className={leadCapture.enabled
                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                : 'bg-muted text-muted-foreground'}
            >
              {leadCapture.enabled ? 'Ativa' : 'Desligada'}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {leadCapture.enabled
              ? `Formulários instantâneos da Página entram no CRM. Ativada em ${formatWhen(leadCapture.subscribedAt)}.`
              : 'Quando ativada, a Página assina o campo leadgen e os leads vão para o Kanban desta clínica.'}
          </p>
          {canEdit && meta.connection_phase === 'ready' && meta.page_id && (
            <div className="mt-3 flex flex-wrap gap-2">
              {leadCapture.enabled ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disableLeadCapture.isPending}
                  onClick={() => {
                    if (window.confirm('Desativar a captura de leads desta Página?')) {
                      disableLeadCapture.mutate(integration.id);
                    }
                  }}
                >
                  {disableLeadCapture.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                  Desativar captura
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={enableLeadCapture.isPending}
                  onClick={() => enableLeadCapture.mutate(integration.id)}
                >
                  {enableLeadCapture.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                  Ativar captura de leads
                </Button>
              )}
            </div>
          )}
          {meta.connection_phase === 'ready' && !meta.page_id && (
            <p className="mt-2 text-xs text-amber-800">Salve uma Página antes de ativar a captura.</p>
          )}
        </div>
      </div>

      {canEdit
        && showAssetForm
        && meta.connection_phase !== 'disconnected'
        && meta.connection_phase !== 'expired'
        && meta.connection_phase !== 'error' && (
        <div className="space-y-3 rounded-md border p-4">
          <div>
            <h4 className="font-medium">Selecionar Página</h4>
            <p className="text-sm text-muted-foreground">
              Escolha a Página do Facebook desta clínica. Instagram, anúncios e Lead Ads
              ficam para quando as permissões forem habilitadas no app Meta.
            </p>
          </div>

          {!assetsLoaded || listAssets.isPending ? (
            <Skeleton className="h-20" />
          ) : (
            <div className="max-w-md space-y-1.5">
              <Label>Página do Facebook</Label>
              <Select value={pageId} onValueChange={setPageId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a página" />
                </SelectTrigger>
                <SelectContent>
                  {pages.map((page) => (
                    <SelectItem key={page.id} value={page.id}>
                      {page.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {pages.length === 0 && (
                <p className="text-xs text-amber-800">
                  Nenhuma Página encontrada nesta conta. Confira se o usuário Meta administra
                  pelo menos uma Página.
                </p>
              )}
            </div>
          )}

          <Button
            type="button"
            disabled={!pageId || saveAssets.isPending}
            onClick={handleSave}
          >
            {saveAssets.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Salvar conexão
          </Button>
        </div>
      )}

      {canEdit && meta.connection_phase === 'disconnected' && (
        <Button
          type="button"
          disabled={startOAuth.isPending}
          onClick={() => startOAuth.mutate(integration.id)}
        >
          <Facebook className="mr-1 h-4 w-4" />
          Conectar com a Meta
        </Button>
      )}

      <div className="space-y-2">
        <h4 className="font-medium">Logs de conexão</h4>
        {loadingLogs ? (
          <Skeleton className="h-32" />
        ) : logs.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            Nenhum evento de conexão registrado ainda.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Detalhe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatWhen(log.created_at)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{log.event_type}</TableCell>
                    <TableCell>
                      <Badge variant={log.status === 'error' ? 'destructive' : 'secondary'}>
                        {LOG_STATUS_LABEL[log.status] || log.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                      {log.message || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
