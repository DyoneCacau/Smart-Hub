import { format } from 'date-fns';
import { Activity, Webhook } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getProviderLabel } from '@/lib/integrationProviders';
import { useAutomationLogs, useWebhookLogs } from '@/hooks/useIntegrationLogs';
import type { AutomationLogStatus, WebhookLogStatus } from '@/types/integration';

const AUTOMATION_STATUS_LABELS: Record<AutomationLogStatus, string> = {
  pending: 'Na fila',
  running: 'Executando',
  success: 'Sucesso',
  failed: 'Falhou',
  skipped: 'Ignorado',
};

const WEBHOOK_STATUS_LABELS: Record<WebhookLogStatus, string> = {
  received: 'Recebido',
  processed: 'Processado',
  failed: 'Falhou',
  ignored: 'Ignorado',
  duplicate: 'Duplicado',
};

function timestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : format(date, 'dd/MM/yyyy HH:mm:ss');
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' {
  if (status === 'success' || status === 'processed') return 'default';
  if (status === 'failed') return 'destructive';
  return 'secondary';
}

export function IntegrationLogsPanel() {
  const { logs: automationLogs, isLoading: loadingAutomation } = useAutomationLogs({ limit: 50 });
  const { logs: webhookLogs, isLoading: loadingWebhooks } = useWebhookLogs({ limit: 50 });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div>
            <h3 className="flex items-center gap-2 font-semibold">
              <Webhook className="h-4 w-4 text-primary" />
              Webhooks recebidos
            </h3>
            <p className="text-sm text-muted-foreground">
              Todo evento que chega fica registrado, mesmo antes de existir processamento.
            </p>
          </div>

          {loadingWebhooks ? (
            <Skeleton className="h-40" />
          ) : webhookLogs.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhum webhook recebido nesta clínica.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Provedor</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Assinatura</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {webhookLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {timestamp(log.created_at)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.provider ? getProviderLabel(log.provider) : '—'}
                      </TableCell>
                      <TableCell className="text-sm">{log.event_type || '—'}</TableCell>
                      <TableCell className="text-sm">
                        {log.signature_valid === null
                          ? '—'
                          : log.signature_valid
                            ? 'Válida'
                            : 'Inválida'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(log.status)}>
                          {WEBHOOK_STATUS_LABELS[log.status]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div>
            <h3 className="flex items-center gap-2 font-semibold">
              <Activity className="h-4 w-4 text-primary" />
              Execuções de automação
            </h3>
            <p className="text-sm text-muted-foreground">
              Histórico de cada disparo de fluxo, com duração e erro.
            </p>
          </div>

          {loadingAutomation ? (
            <Skeleton className="h-40" />
          ) : automationLogs.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhuma execução registrada.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Fluxo</TableHead>
                    <TableHead>Gatilho</TableHead>
                    <TableHead>Passos</TableHead>
                    <TableHead>Duração</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {automationLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {timestamp(log.created_at)}
                      </TableCell>
                      <TableCell className="text-sm">{log.flow_name || '—'}</TableCell>
                      <TableCell className="text-sm">{log.trigger_type || '—'}</TableCell>
                      <TableCell className="text-sm">
                        {log.steps_completed}/{log.steps_total}
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.duration_ms == null ? '—' : `${log.duration_ms} ms`}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(log.status)}>
                          {AUTOMATION_STATUS_LABELS[log.status]}
                        </Badge>
                        {log.error_message && (
                          <p className="mt-1 text-[11px] text-destructive">{log.error_message}</p>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
