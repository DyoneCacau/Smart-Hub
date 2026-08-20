import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AUTOMATION_TRIGGER_LABELS, getProviderLabel } from '@/lib/integrationProviders';
import { useAutomationFlows, useAutomationFlowMutations } from '@/hooks/useAutomationFlows';
import type {
  AutomationFlow,
  AutomationFlowStatus,
  AutomationTriggerType,
  Integration,
} from '@/types/integration';

const TRIGGERS = Object.keys(AUTOMATION_TRIGGER_LABELS) as AutomationTriggerType[];
const STATUSES: AutomationFlowStatus[] = ['draft', 'active', 'paused', 'archived'];

const STATUS_LABELS: Record<AutomationFlowStatus, string> = {
  draft: 'Rascunho',
  active: 'Ativo',
  paused: 'Pausado',
  archived: 'Arquivado',
};

interface AutomationFlowsPanelProps {
  integrations: Integration[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export function AutomationFlowsPanel({
  integrations,
  canCreate,
  canEdit,
  canDelete,
}: AutomationFlowsPanelProps) {
  const { flows, isLoading } = useAutomationFlows();
  const { createFlow, updateFlow, deleteFlow } = useAutomationFlowMutations();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AutomationFlow | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<AutomationTriggerType>('lead_received');
  const [status, setStatus] = useState<AutomationFlowStatus>('draft');
  const [integrationId, setIntegrationId] = useState<string>('none');

  useEffect(() => {
    if (!dialogOpen) return;
    if (editing) {
      setName(editing.name);
      setDescription(editing.description || '');
      setTriggerType(editing.trigger_type);
      setStatus(editing.status);
      setIntegrationId(editing.integration_id || 'none');
      return;
    }
    setName('');
    setDescription('');
    setTriggerType('lead_received');
    setStatus('draft');
    setIntegrationId('none');
  }, [dialogOpen, editing]);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (flow: AutomationFlow) => {
    setEditing(flow);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Informe o nome do fluxo');
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      trigger_type: triggerType,
      status,
      integration_id: integrationId === 'none' ? null : integrationId,
    };

    if (editing) {
      await updateFlow.mutateAsync({ id: editing.id, ...payload });
    } else {
      await createFlow.mutateAsync(payload);
    }
    setDialogOpen(false);
  };

  if (isLoading) {
    return <Skeleton className="h-64" />;
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold">
              <Workflow className="h-4 w-4 text-primary" />
              Fluxos de automação
            </h3>
            <p className="text-sm text-muted-foreground">
              Gatilho e ações que serão executados quando a integração estiver ativa.
            </p>
          </div>
          <Button type="button" size="sm" onClick={openNew} disabled={!canCreate}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Novo fluxo
          </Button>
        </div>

        {flows.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhum fluxo criado. Os fluxos ficam em rascunho até a integração existir.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fluxo</TableHead>
                  <TableHead>Gatilho</TableHead>
                  <TableHead>Integração</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Execuções</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flows.map((flow) => {
                  const integration = integrations.find((i) => i.id === flow.integration_id);
                  return (
                    <TableRow key={flow.id}>
                      <TableCell>
                        <p className="font-medium">{flow.name}</p>
                        {flow.description && (
                          <p className="text-xs text-muted-foreground">{flow.description}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {AUTOMATION_TRIGGER_LABELS[flow.trigger_type] || flow.trigger_type}
                      </TableCell>
                      <TableCell className="text-sm">
                        {integration
                          ? `${getProviderLabel(integration.provider)} · ${integration.name}`
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={flow.status === 'active' ? 'default' : 'secondary'}>
                          {STATUS_LABELS[flow.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {flow.run_count}
                        {flow.error_count > 0 && (
                          <span className="text-destructive"> · {flow.error_count} erro(s)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {canEdit && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(flow)}
                            aria-label={`Editar ${flow.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteFlow.mutate(flow.id)}
                            aria-label={`Remover ${flow.name}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar fluxo' : 'Novo fluxo'}</DialogTitle>
            <DialogDescription>
              Defina o gatilho. As ações são configuradas quando a integração for implementada.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="flow-name">Nome</Label>
              <Input
                id="flow-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Lead do Facebook vira card no CRM"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="flow-description">Descrição</Label>
              <Textarea
                id="flow-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Gatilho</Label>
                <Select
                  value={triggerType}
                  onValueChange={(v) => setTriggerType(v as AutomationTriggerType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIGGERS.map((trigger) => (
                      <SelectItem key={trigger} value={trigger}>
                        {AUTOMATION_TRIGGER_LABELS[trigger]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Situação</Label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as AutomationFlowStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {STATUS_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Integração vinculada</Label>
              <Select value={integrationId} onValueChange={setIntegrationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {integrations.map((integration) => (
                    <SelectItem key={integration.id} value={integration.id}>
                      {getProviderLabel(integration.provider)} · {integration.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={createFlow.isPending || updateFlow.isPending}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
