import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Eye, PauseCircle, Rocket, FileEdit, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  SMART_HUB_STATUS_LABELS,
  type SmartHub,
  type SmartHubStatus,
  type SmartHubValidationResult,
} from '@/types/smartHub';
import { cn } from '@/lib/utils';

const STEPS: { key: string; label: string }[] = [
  { key: 'draft', label: 'Rascunho' },
  { key: 'preview', label: 'Prévia' },
  { key: 'validate', label: 'Validação' },
  { key: 'publish', label: 'Publicação' },
  { key: 'pause', label: 'Pausa' },
];

function stepDone(stepKey: string, status: SmartHubStatus, validated: boolean): boolean {
  if (stepKey === 'draft') return true;
  if (stepKey === 'preview') return true;
  if (stepKey === 'validate') return validated || status === 'published' || status === 'offline';
  if (stepKey === 'publish') return status === 'published' || status === 'offline';
  if (stepKey === 'pause') return status === 'offline';
  return false;
}

function stepCurrent(stepKey: string, status: SmartHubStatus, validated: boolean): boolean {
  if (status === 'draft' && stepKey === 'draft') return !validated;
  if (status === 'draft' && stepKey === 'validate') return validated;
  if (status === 'published' && stepKey === 'publish') return true;
  if (status === 'offline' && stepKey === 'pause') return true;
  return false;
}

function issueMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: string }).message);
  }
  return String(err);
}

function issueKey(err: unknown, index: number): string {
  if (err && typeof err === 'object' && 'code' in err) {
    return String((err as { code: string }).code);
  }
  return `issue-${index}`;
}

function hasCode(errors: unknown[], code: string): boolean {
  return errors.some(
    (e) => typeof e === 'object' && e && 'code' in e && (e as { code: string }).code === code
  );
}

interface PublishWorkflowCardProps {
  hub: SmartHub;
  validating?: boolean;
  publishing?: boolean;
  pausing?: boolean;
  lastValidation?: SmartHubValidationResult | null;
  onValidate: () => void | Promise<unknown>;
  onPublish: () => void;
  onPause: () => void;
  onRevertDraft?: () => void;
}

export function PublishWorkflowCard({
  hub,
  validating,
  publishing,
  pausing,
  lastValidation,
  onValidate,
  onPublish,
  onPause,
  onRevertDraft,
}: PublishWorkflowCardProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const persistedErrors = Array.isArray(hub.validation_errors) ? hub.validation_errors : [];
  const liveErrors = lastValidation?.errors ?? [];
  const errors = liveErrors.length > 0 ? liveErrors : persistedErrors;
  const warnings = lastValidation?.warnings ?? [];

  const validated =
    lastValidation?.ok === true ||
    (Boolean(hub.last_validated_at) &&
      persistedErrors.length === 0 &&
      lastValidation?.ok !== false);

  useEffect(() => {
    if (lastValidation && !lastValidation.ok && lastValidation.errors.length > 0) {
      setModalOpen(true);
    }
  }, [lastValidation]);

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Fluxo de publicação</p>
          <p className="text-xs text-muted-foreground">
            Rascunho → Prévia → Validação → Publicação → Pausa
          </p>
        </div>
        <Badge variant={hub.status === 'published' ? 'default' : 'secondary'}>
          {SMART_HUB_STATUS_LABELS[hub.status] || hub.status}
        </Badge>
      </div>

      <ol className="grid gap-2 sm:grid-cols-5">
        {STEPS.map((step) => {
          const done = stepDone(step.key, hub.status, validated);
          const current = stepCurrent(step.key, hub.status, validated);
          return (
            <li
              key={step.key}
              className={cn(
                'rounded-md border px-2 py-2 text-center text-xs',
                done && 'border-primary/40 bg-primary/5',
                current && 'ring-2 ring-primary'
              )}
            >
              {step.label}
            </li>
          );
        })}
      </ol>

      {validated && errors.length === 0 && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          Smart Hub validado e pronto para publicação.
          {hub.last_validated_at && (
            <span className="mt-1 block text-xs opacity-80">
              Última validação: {new Date(hub.last_validated_at).toLocaleString('pt-BR')}
            </span>
          )}
        </div>
      )}

      {errors.length > 0 && (
        <ul className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {errors.map((err, i) => (
            <li key={issueKey(err, i)}>{issueMessage(err)}</li>
          ))}
        </ul>
      )}

      {warnings.length > 0 && errors.length === 0 && (
        <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {warnings.map((w, i) => (
            <li key={issueKey(w, i)}>{issueMessage(w)}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link to="/smart-hub/previa">
            <Eye className="mr-2 h-4 w-4" />
            Prévia
          </Link>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={validating}
          onClick={() => {
            void Promise.resolve(onValidate()).catch(() => {
              /* toast já tratado no hook */
            });
          }}
        >
          {validating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 h-4 w-4" />
          )}
          {validating ? 'Validando…' : 'Validar'}
        </Button>
        <Button
          size="sm"
          disabled={publishing || hub.status === 'published'}
          onClick={onPublish}
        >
          {publishing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Rocket className="mr-2 h-4 w-4" />
          )}
          Publicar
        </Button>
        {(hub.status === 'published' || hub.status === 'offline') && (
          <Button
            variant="outline"
            size="sm"
            disabled={pausing || hub.status === 'offline'}
            onClick={onPause}
          >
            <PauseCircle className="mr-2 h-4 w-4" />
            Pausar
          </Button>
        )}
        {hub.status !== 'draft' && onRevertDraft && (
          <Button variant="ghost" size="sm" onClick={onRevertDraft}>
            <FileEdit className="mr-2 h-4 w-4" />
            Voltar a rascunho
          </Button>
        )}
        {errors.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setModalOpen(true)}>
            Ver pendências
          </Button>
        )}
      </div>

      {hub.published_at && (
        <p className="text-xs text-muted-foreground">
          Publicado em {new Date(hub.published_at).toLocaleString('pt-BR')}
          {hub.paused_at ? ` · Pausado em ${new Date(hub.paused_at).toLocaleString('pt-BR')}` : ''}
        </p>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pendências para publicação</DialogTitle>
            <DialogDescription>
              Corrija os itens abaixo e clique em Validar novamente.
            </DialogDescription>
          </DialogHeader>
          {errors.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma pendência no momento.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {errors.map((err, i) => (
                <li
                  key={issueKey(err, i)}
                  className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-destructive"
                >
                  {issueMessage(err)}
                </li>
              ))}
            </ul>
          )}
          {warnings.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Avisos (não bloqueiam)</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {warnings.map((w, i) => (
                  <li key={issueKey(w, i)}>{issueMessage(w)}</li>
                ))}
              </ul>
            </div>
          )}
          <DialogFooter className="flex flex-wrap gap-2 sm:justify-end">
            {hasCode(errors, 'template_required') && (
              <Button variant="outline" asChild>
                <Link to="/smart-hub/templates">Escolher template</Link>
              </Button>
            )}
            {hasCode(errors, 'conversion_required') && (
              <Button variant="outline" asChild>
                <Link to="/smart-hub/botoes">Gerenciar botões</Link>
              </Button>
            )}
            <Button onClick={() => setModalOpen(false)}>Entendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
