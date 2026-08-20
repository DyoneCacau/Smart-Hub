import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MetaConnectionPanel } from './MetaConnectionPanel';
import type { Integration } from '@/types/integration';

interface MetaConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integration: Integration | null;
  canEdit: boolean;
  autoOpenAssets?: boolean;
}

export function MetaConnectionDialog({
  open,
  onOpenChange,
  integration,
  canEdit,
  autoOpenAssets = false,
}: MetaConnectionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Central Meta</DialogTitle>
          <DialogDescription>
            Status da conexão, seleção de ativos e logs — sem exposição de tokens.
          </DialogDescription>
        </DialogHeader>
        {integration ? (
          <MetaConnectionPanel
            integration={integration}
            canEdit={canEdit}
            autoOpenAssets={autoOpenAssets}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Conexão Meta não encontrada.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
