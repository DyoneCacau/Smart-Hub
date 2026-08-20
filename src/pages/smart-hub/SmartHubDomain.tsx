import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { SmartHubLayout } from '@/components/smart-hub';
import { useSmartHub } from '@/hooks/useSmartHub';
import { Button } from '@/components/ui/button';

export default function SmartHubDomain() {
  const { hub, isLoading, publicUrl } = useSmartHub();

  if (isLoading) {
    return (
      <SmartHubLayout title="Domínio" description="Link padrão da sua página">
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      </SmartHubLayout>
    );
  }

  if (!hub) {
    return (
      <SmartHubLayout title="Domínio">
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          Crie um Smart Hub no Dashboard para ver o link da página.
        </div>
      </SmartHubLayout>
    );
  }

  return (
    <SmartHubLayout title="Domínio" description="Compartilhe o link padrão com seus pacientes">
      <div className="mx-auto max-w-xl space-y-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Link da sua página</p>
          <p className="mt-1 break-all font-mono text-sm">{publicUrl}</p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={async () => {
              if (!publicUrl) return;
              await navigator.clipboard.writeText(publicUrl);
              toast.success('Link copiado.');
            }}
          >
            <Copy className="mr-2 h-4 w-4" />
            Copiar link
          </Button>
        </div>
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          Em breve você poderá conectar um domínio próprio (ex.: links.suaclinica.com.br). Por
          enquanto, use o link padrão do Healthcare.
        </div>
      </div>
    </SmartHubLayout>
  );
}
