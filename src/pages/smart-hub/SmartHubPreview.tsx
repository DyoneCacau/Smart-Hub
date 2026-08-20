import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  SmartHubLayout,
  HubPublicView,
  HubBookingWizard,
  HubCaptureForm,
  PublishWorkflowCard,
} from '@/components/smart-hub';
import { usePreviewSmartHub, useSmartHub } from '@/hooks/useSmartHub';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import { resolveClickAction } from '@/services/smartHub';
import type { SmartHubButton } from '@/types/smartHub';

export default function SmartHubPreview() {
  const {
    hub,
    isLoading,
    publicUrl,
    lastValidation,
    validateHub,
    publishHub,
    pauseHub,
    revertToDraft,
  } = useSmartHub();
  const { data, isLoading: loadingPreview, error, refetch } = usePreviewSmartHub(hub?.id);
  const [formOpen, setFormOpen] = useState(false);
  const [formButton, setFormButton] = useState<SmartHubButton | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingButton, setBookingButton] = useState<SmartHubButton | null>(null);

  // Prévia interna não deve ser indexada por buscadores (melhoria do WIP).
  useEffect(() => {
    let el = document.head.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('name', 'robots');
      document.head.appendChild(el);
    }
    const prev = el.content;
    el.content = 'noindex,nofollow';
    return () => {
      el!.content = prev || 'index,follow';
    };
  }, []);

  const handleButtonClick = (button: SmartHubButton) => {
    const action = resolveClickAction(button.click_action, button.type);
    if (action === 'form') {
      setFormButton(button);
      setFormOpen(true);
      return;
    }
    if (action === 'booking') {
      setBookingButton(button);
      setBookingOpen(true);
    }
  };

  return (
    <SmartHubLayout
      title="Prévia"
      description="Visualize a página como o paciente verá, antes de publicar."
      actions={
        hub?.status === 'published' && publicUrl ? (
          <Button variant="outline" size="sm" asChild>
            <a href={publicUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir pública
            </a>
          </Button>
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link to="/smart-hub/configuracoes">Ir para publicação</Link>
          </Button>
        )
      }
    >
      {isLoading || loadingPreview ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : !hub ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          Crie um Smart Hub no Dashboard para ver a prévia.
        </div>
      ) : (
        <div className="space-y-6">
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

          {error || !data ? (
            <div className="space-y-3 rounded-lg border border-dashed p-10 text-center text-muted-foreground">
              <p>Não foi possível carregar a prévia.</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border shadow-sm">
              <HubPublicView
                payload={data}
                preview
                onButtonClick={handleButtonClick}
                onOpenCaptureForm={(b) => {
                  setFormButton(b || null);
                  setFormOpen(true);
                }}
              />
              <HubCaptureForm
                hub={data.hub}
                button={formButton}
                open={formOpen}
                onOpenChange={setFormOpen}
                preview
              />
              <HubBookingWizard
                hub={data.hub}
                button={bookingButton}
                open={bookingOpen}
                onOpenChange={setBookingOpen}
                preview
              />
            </div>
          )}
        </div>
      )}
    </SmartHubLayout>
  );
}
