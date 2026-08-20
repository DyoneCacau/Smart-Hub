import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SecretRevealField } from './SecretRevealField';
import {
  INTEGRATION_DIRECTION_LABELS,
  getProviderDefinition,
  isMetaWebhookProvider,
  type IntegrationProviderDefinition,
} from '@/lib/integrationProviders';
import { buildWebhookUrl } from '@/lib/integrationSecurity';
import { useIntegrationMutations } from '@/hooks/useIntegrations';
import type {
  Integration,
  IntegrationDirection,
  IntegrationStatus,
} from '@/types/integration';

interface IntegrationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Provedor escolhido no catálogo (criação) */
  definition: IntegrationProviderDefinition | null;
  /** Conexão existente (edição) */
  integration: Integration | null;
  canEdit: boolean;
  canDelete: boolean;
}

const DIRECTIONS: IntegrationDirection[] = ['inbound', 'outbound', 'bidirectional'];
const STATUSES: IntegrationStatus[] = ['disconnected', 'connected', 'paused', 'error'];

export function IntegrationFormDialog({
  open,
  onOpenChange,
  definition,
  integration,
  canEdit,
  canDelete,
}: IntegrationFormDialogProps) {
  const { createIntegration, updateIntegration, rotateWebhookSecret, deleteIntegration } =
    useIntegrationMutations();

  const activeDefinition =
    definition ?? (integration ? getProviderDefinition(integration.provider) ?? null : null);
  const isMetaProvider = activeDefinition ? isMetaWebhookProvider(activeDefinition.id) : false;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [direction, setDirection] = useState<IntegrationDirection>('inbound');
  const [status, setStatus] = useState<IntegrationStatus>('disconnected');
  const [isActive, setIsActive] = useState(true);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRevealedSecret(null);

    if (integration) {
      setName(integration.name);
      setDescription(integration.description || '');
      setDirection(integration.direction);
      setStatus(integration.status);
      setIsActive(integration.is_active);
      return;
    }

    setName(activeDefinition?.name || '');
    setDescription('');
    setDirection(activeDefinition?.direction || 'inbound');
    setStatus('disconnected');
    setIsActive(true);
  }, [open, integration, activeDefinition]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Informe um nome para a conexão');
      return;
    }

    if (integration) {
      await updateIntegration.mutateAsync({
        id: integration.id,
        name: name.trim(),
        description: description.trim() || null,
        direction,
        status,
        is_active: isActive,
      });
      onOpenChange(false);
      return;
    }

    if (!activeDefinition) return;
    const created = await createIntegration.mutateAsync({
      provider: activeDefinition.id,
      name: name.trim(),
      description: description.trim() || null,
      direction,
      is_active: isActive,
    });

    // Segredo aparece uma única vez: o diálogo fica aberto para a cópia
    if (created.webhookSecret) {
      setRevealedSecret(created.webhookSecret);
      return;
    }
    onOpenChange(false);
  };

  const handleRotate = async () => {
    if (!integration) return;
    const secret = await rotateWebhookSecret.mutateAsync(integration.id);
    setRevealedSecret(secret);
  };

  const handleDelete = async () => {
    if (!integration) return;
    await deleteIntegration.mutateAsync(integration.id);
    onOpenChange(false);
  };

  const webhookSlug = integration?.webhook_slug || null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {integration ? 'Configurar integração' : `Conectar ${activeDefinition?.name || ''}`}
          </DialogTitle>
          <DialogDescription>
            {activeDefinition?.description ||
              'Defina como esta conexão será identificada nesta clínica.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="integration-name">Nome da conexão</Label>
            <Input
              id="integration-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Campanha Harmonização - Unidade Centro"
              disabled={!canEdit}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="integration-description">Observação</Label>
            <Textarea
              id="integration-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Para que esta conexão é usada"
              disabled={!canEdit}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Direção</Label>
              <Select
                value={direction}
                onValueChange={(v) => setDirection(v as IntegrationDirection)}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIRECTIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {INTEGRATION_DIRECTION_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {integration && (
              <div className="space-y-1.5">
                <Label>Situação</Label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as IntegrationStatus)}
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value === 'connected'
                          ? 'Conectada'
                          : value === 'paused'
                            ? 'Pausada'
                            : value === 'error'
                              ? 'Com erro'
                              : 'Não conectada'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Conexão ativa</p>
              <p className="text-xs text-muted-foreground">
                Desativada, o endpoint de entrada recusa eventos.
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} disabled={!canEdit} />
          </div>

          {activeDefinition?.createsLeads && (
            <p className="rounded-md border border-emerald-300 bg-emerald-50 p-2.5 text-xs text-emerald-900">
              Todo evento recebido nesta conexão vira lead no CRM, sem duplicar o mesmo
              contato.
            </p>
          )}

          {isMetaProvider && (
            <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Este provedor exige o secret <span className="font-mono">META_APP_SECRET</span>{' '}
              configurado no Supabase. Sem ele, os eventos são recusados.
            </p>
          )}

          {activeDefinition?.requiresCredentials && !isMetaProvider && (
            <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Token e chave de API deste provedor ficam nos secrets do Supabase, nunca no
              banco nem no navegador.
            </p>
          )}

          {webhookSlug && (
            <div className="space-y-3 rounded-md border bg-muted/40 p-3">
              <SecretRevealField
                label="URL de entrada (webhook)"
                value={buildWebhookUrl(webhookSlug)}
                hiddenByDefault={false}
                helpText={
                  isMetaProvider
                    ? 'Cadastre esta URL como Callback URL na Meta, usando o segredo desta conexão como Verify token.'
                    : 'Cadastre esta URL no provedor e envie o segredo no header x-healthcare-secret.'
                }
              />
              {canEdit && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRotate}
                  disabled={rotateWebhookSecret.isPending}
                >
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                  Gerar novo segredo
                </Button>
              )}
            </div>
          )}

          {revealedSecret && (
            <div className="space-y-2 rounded-md border border-emerald-300 bg-emerald-50 p-3">
              <p className="text-xs font-medium text-emerald-900">
                Copie o segredo agora — ele não será exibido novamente.
              </p>
              <SecretRevealField
                label="Segredo do webhook"
                value={revealedSecret}
                helpText={
                  isMetaProvider
                    ? 'Use como “Verify token” ao cadastrar o webhook na Meta. Os eventos são validados pela assinatura do app (X-Hub-Signature-256).'
                    : 'Envie no header x-healthcare-secret em cada requisição.'
                }
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {integration && canDelete ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={handleDelete}
              disabled={deleteIntegration.isPending}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Remover
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
            {canEdit && !revealedSecret && (
              <Button
                type="button"
                onClick={handleSave}
                disabled={createIntegration.isPending || updateIntegration.isPending}
              >
                {integration ? 'Salvar' : 'Criar conexão'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
