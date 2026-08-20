import { useMemo, useState } from 'react';
import { Copy, ExternalLink, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SmartHubLayout, DashboardStatsCard, PublishWorkflowCard } from '@/components/smart-hub';
import { useSmartHub } from '@/hooks/useSmartHub';
import { useHubAnalytics } from '@/hooks/useHubAnalytics';
import { useClinic } from '@/hooks/useClinic';
import { generateSlugFromTitle } from '@/services/smartHub';
import { getClinicDisplayName } from '@/lib/utils';
import { SMART_HUB_STATUS_LABELS } from '@/types/smartHub';

export default function SmartHubDashboard() {
  const { clinic, clinicId, isLoading: clinicLoading } = useClinic();
  const {
    hub,
    publicUrl,
    isLoading,
    createHub,
    lastValidation,
    validateHub,
    publishHub,
    pauseHub,
    revertToDraft,
  } = useSmartHub();
  const { metrics, isLoading: metricsLoading } = useHubAnalytics(hub);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);

  const clinicPublicName = useMemo(() => {
    if (!clinic) return '';
    return getClinicDisplayName(clinic) || clinic.name || '';
  }, [clinic]);

  const openCreateDialog = () => {
    const initialTitle = clinicPublicName || '';
    setTitle(initialTitle);
    setSlug(initialTitle ? generateSlugFromTitle(initialTitle) : '');
    setSlugTouched(false);
    setOpen(true);
  };

  if (clinicLoading || isLoading) {
    return (
      <SmartHubLayout title="Smart Hub" description="Central inteligente de conversão">
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      </SmartHubLayout>
    );
  }

  if (!clinicId) {
    return (
      <SmartHubLayout title="Smart Hub">
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          Selecione uma clínica no menu lateral para gerenciar o Smart Hub.
        </div>
      </SmartHubLayout>
    );
  }

  if (!hub) {
    return (
      <SmartHubLayout
        title="Smart Hub"
        description="Crie a página pública da sua clínica"
        actions={
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Criar Smart Hub
          </Button>
        }
      >
        <div className="rounded-lg border border-dashed p-12 text-center">
          <h2 className="text-lg font-semibold">Nenhum Smart Hub configurado</h2>
          <p className="mt-2 text-muted-foreground">
            Crie sua página pública personalizada para converter visitas em leads e agendamentos.
          </p>
          <Button className="mt-6" onClick={openCreateDialog}>
            Começar agora
          </Button>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Smart Hub</DialogTitle>
              <DialogDescription>
                Defina o nome público e o endereço da página (ex.: /hub/minha-clinica).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="title">Nome público da clínica</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => {
                    const next = e.target.value;
                    setTitle(next);
                    if (!slugTouched) setSlug(generateSlugFromTitle(next));
                  }}
                  placeholder="Clínica Sorriso"
                />
                <p className="text-xs text-muted-foreground">
                  Este nome aparece no topo da página pública. Não é o endereço da URL.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug (endereço da página)</Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(e.target.value);
                  }}
                  placeholder="clinica-sorriso"
                />
                <p className="text-xs text-muted-foreground">
                  Apenas o caminho da URL. Pode editar sem alterar o nome público.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto px-0 text-xs"
                  onClick={() => {
                    setSlug(generateSlugFromTitle(title));
                    setSlugTouched(true);
                  }}
                >
                  Gerar slug a partir do nome público
                </Button>
              </div>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                disabled={!title.trim() || createHub.isPending}
                onClick={async () => {
                  await createHub.mutateAsync({ title: title.trim(), slug: slug.trim() || undefined });
                  setOpen(false);
                  setTitle('');
                  setSlug('');
                  setSlugTouched(false);
                }}
              >
                Criar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SmartHubLayout>
    );
  }

  const copyUrl = async () => {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    toast.success('URL copiada.');
  };

  return (
    <SmartHubLayout
      title="Smart Hub"
      description="Central inteligente de conversão da clínica"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/smart-hub/previa">Prévia</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={copyUrl}>
            <Copy className="mr-2 h-4 w-4" />
            Copiar URL
          </Button>
          <Button size="sm" asChild>
            <a href={publicUrl || '#'} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir página
            </a>
          </Button>
        </div>
      }
    >
      <div className="mb-6 flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">URL pública</p>
          <p className="truncate font-mono text-sm">{publicUrl}</p>
          <p className="mt-1 truncate text-sm font-medium">{hub.title}</p>
        </div>
        <Badge variant={hub.status === 'published' ? 'default' : 'secondary'}>
          {SMART_HUB_STATUS_LABELS[hub.status] || hub.status}
        </Badge>
      </div>

      <div className="mb-6">
        <PublishWorkflowCard
          hub={hub}
          validating={validateHub.isPending}
          publishing={publishHub.isPending}
          pausing={pauseHub.isPending}
          lastValidation={lastValidation}
          onValidate={() => validateHub.mutateAsync()}
          onPublish={() => publishHub.mutate()}
          onPause={() => pauseHub.mutate()}
          onRevertDraft={() => revertToDraft.mutate()}
        />
      </div>

      {metricsLoading ? (
        <div className="flex justify-center py-10">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DashboardStatsCard label="Visualizações" value={metrics?.views ?? 0} />
          <DashboardStatsCard label="Cliques" value={metrics?.clicks ?? 0} />
          <DashboardStatsCard label="CTR" value={`${metrics?.ctr ?? 0}%`} />
          <DashboardStatsCard label="Conversões" value={metrics?.conversions ?? 0} />
          <DashboardStatsCard label="Botão mais clicado" value={metrics?.topButton ?? '—'} />
          <DashboardStatsCard label="Origem principal" value={metrics?.mainOrigin ?? '—'} />
          <DashboardStatsCard label="Dispositivo principal" value={metrics?.mainDevice ?? '—'} />
          <DashboardStatsCard label="Campanha principal" value={metrics?.mainCampaign ?? '—'} />
          <DashboardStatsCard
            label="Última visita"
            value={
              metrics?.lastVisitAt
                ? new Date(metrics.lastVisitAt).toLocaleString('pt-BR')
                : '—'
            }
          />
          <DashboardStatsCard
            label="Status"
            value={metrics?.online ? 'Online' : SMART_HUB_STATUS_LABELS[hub.status]}
          />
        </div>
      )}
    </SmartHubLayout>
  );
}
