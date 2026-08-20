import { useState } from 'react';
import { SmartHubLayout, TemplateThumbnail } from '@/components/smart-hub';
import { useSmartHub } from '@/hooks/useSmartHub';
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

export default function SmartHubTemplates() {
  const { templates, hub, isLoading, applyTemplate } = useSmartHub();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const previewTpl = templates.find((t) => t.id === previewId) || null;
  const confirmTpl = templates.find((t) => t.id === confirmId) || null;

  return (
    <SmartHubLayout
      title="Templates"
      description="Escolha um layout. Seus textos, contatos e botões são preservados."
    >
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((tpl) => {
            const selected = hub?.template_id === tpl.id;
            const preview = (tpl.json_layout?.preview || {}) as Record<string, unknown>;
            return (
              <div key={tpl.id} className="rounded-lg border bg-card p-4 shadow-card">
                <TemplateThumbnail
                  name={tpl.name}
                  style={String(preview.style || 'classic')}
                  banner
                  profile={preview.profile !== false}
                  whatsapp={Boolean(preview.whatsapp_featured)}
                  grid={Boolean(preview.grid)}
                  className="mb-3"
                />
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{tpl.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{tpl.description}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {tpl.is_default && <Badge variant="outline">Padrão do sistema</Badge>}
                    {selected && <Badge variant="secondary">Aplicado neste Hub</Badge>}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPreviewId(tpl.id)}>
                    Visualizar em tamanho maior
                  </Button>
                  {!hub ? (
                    <p className="text-xs text-muted-foreground">Crie o hub no Dashboard para aplicar.</p>
                  ) : (
                    <Button
                      size="sm"
                      variant={selected ? 'secondary' : 'default'}
                      disabled={applyTemplate.isPending}
                      onClick={() => setConfirmId(tpl.id)}
                    >
                      {selected ? 'Reaplicar template' : 'Aplicar template'}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!previewId} onOpenChange={(o) => !o && setPreviewId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{previewTpl?.name}</DialogTitle>
            <DialogDescription>{previewTpl?.description}</DialogDescription>
          </DialogHeader>
          {previewTpl && (
            <TemplateThumbnail
              name={previewTpl.name}
              style={String((previewTpl.json_layout?.preview as Record<string, unknown>)?.style || 'classic')}
              banner
              profile={(previewTpl.json_layout?.preview as Record<string, unknown>)?.profile !== false}
              whatsapp={Boolean(
                (previewTpl.json_layout?.preview as Record<string, unknown>)?.whatsapp_featured
              )}
              grid={Boolean((previewTpl.json_layout?.preview as Record<string, unknown>)?.grid)}
              className="h-64"
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmId} onOpenChange={(o) => !o && setConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aplicar template {confirmTpl?.name}?</DialogTitle>
            <DialogDescription>
              A organização visual será atualizada. Textos, contatos, imagens (incluindo o banner),
              links e botões existentes serão preservados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmId(null)}>
              Cancelar
            </Button>
            <Button
              disabled={applyTemplate.isPending || !confirmId}
              onClick={async () => {
                if (!confirmId) return;
                await applyTemplate.mutateAsync(confirmId);
                setConfirmId(null);
              }}
            >
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SmartHubLayout>
  );
}
