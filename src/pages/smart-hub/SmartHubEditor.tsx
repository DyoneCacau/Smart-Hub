import { Link } from 'react-router-dom';
import { SmartHubLayout } from '@/components/smart-hub';
import { useSmartHub } from '@/hooks/useSmartHub';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/** Editor visual avançado fica para fase futura; aqui listamos páginas e linkamos prévia. */
export default function SmartHubEditor() {
  const { hub, pages, isLoading } = useSmartHub();

  return (
    <SmartHubLayout
      title="Páginas"
      description="Páginas do hub. Use Prévia e Templates para ajustar o layout público."
      actions={
        hub ? (
          <Button variant="outline" size="sm" asChild>
            <Link to="/smart-hub/previa">Abrir prévia</Link>
          </Button>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : !hub ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          Crie um Smart Hub no Dashboard para gerenciar páginas.
        </div>
      ) : (
        <div className="space-y-3">
          {pages.map((page) => (
            <div
              key={page.id}
              className="flex items-center justify-between rounded-lg border bg-card p-4"
            >
              <div>
                <p className="font-medium">{page.title}</p>
                <p className="text-sm text-muted-foreground">/{page.slug}</p>
              </div>
              <div className="flex items-center gap-2">
                {page.is_home && <Badge variant="outline">Home</Badge>}
                <Badge variant="secondary">{page.status}</Badge>
              </div>
            </div>
          ))}
          {!pages.length && (
            <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
              Nenhuma página cadastrada.
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            Blocos do layout: {(hub.layout_blocks || []).join(' · ') || 'padrão'}. Altere em
            Templates.
          </p>
        </div>
      )}
    </SmartHubLayout>
  );
}
