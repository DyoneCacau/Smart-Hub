import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { WhatsAppNotification } from '@/hooks/useWhatsAppSettings';
import { cn } from '@/lib/utils';

const WHATSAPP_KIND_LABELS: Record<WhatsAppNotification['kind'], string> = {
  booking: 'Confirmação do agendamento',
  day_before: 'Lembrete da véspera',
  same_day: 'Lembrete do dia',
  test: 'Teste',
};

const STATUS_STYLES: Record<WhatsAppNotification['status'], { label: string; className: string }> = {
  queued: { label: 'Na fila', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  sent: { label: 'Entregue à Suri', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  error: { label: 'Erro', className: 'border-red-200 bg-red-50 text-red-700' },
};

function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

interface WhatsAppHistoryCardProps {
  history: WhatsAppNotification[];
  isLoading: boolean;
  onRefresh: () => Promise<void>;
}

export function WhatsAppHistoryCard({ history, isLoading, onRefresh }: WhatsAppHistoryCardProps) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-lg">Histórico de envios</CardTitle>
          <CardDescription>Últimos 30 envios para a Suri. Atualiza sozinho a cada 30 segundos.</CardDescription>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void handleRefresh()} disabled={refreshing}>
          <RefreshCw className={cn('mr-2 h-4 w-4', refreshing && 'animate-spin')} />
          Atualizar
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : history.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhum envio ainda. Use “Enviar teste” ou crie uma consulta para ver aqui.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((item) => {
                  const status = STATUS_STYLES[item.status];
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {new Date(item.created_at).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </TableCell>
                      <TableCell className="text-sm">{WHATSAPP_KIND_LABELS[item.kind]}</TableCell>
                      <TableCell className="text-sm">
                        <span className="block">{item.patient_name || '—'}</span>
                        <span className="block text-xs text-muted-foreground">{formatPhone(item.phone)}</span>
                      </TableCell>
                      <TableCell className="text-sm">
                        <Badge variant="outline" className={status.className}>
                          {status.label}
                        </Badge>
                        {item.error && (
                          <span className="mt-1 block max-w-xs text-xs text-red-700">
                            {item.http_status ? `HTTP ${item.http_status}: ` : ''}
                            {item.error}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
