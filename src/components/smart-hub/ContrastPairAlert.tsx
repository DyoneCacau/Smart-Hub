import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  isPoorContrast,
  normalizeHexColor,
  pickContrastingTextColor,
} from '@/services/smartHub/imageUtils';
import { cn } from '@/lib/utils';

interface ContrastPairAlertProps {
  backgroundColor: string;
  textColor: string;
  onFix: (nextTextColor: string) => void;
  className?: string;
}

/** Aviso de contraste baixo + ação explícita (não altera cores sozinho). */
export function ContrastPairAlert({
  backgroundColor,
  textColor,
  onFix,
  className,
}: ContrastPairAlertProps) {
  const bg = normalizeHexColor(backgroundColor, '#0F766E');
  const fg = normalizeHexColor(textColor, '#FFFFFF');
  if (!isPoorContrast(bg, fg)) return null;

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-md border border-amber-300/80 bg-amber-50 px-3 py-2.5 text-xs text-amber-950 sm:flex-row sm:items-center sm:justify-between dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-50',
        className
      )}
      role="status"
    >
      <div className="flex gap-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <p className="leading-relaxed">Essa combinação de cores pode dificultar a leitura.</p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="h-8 shrink-0 self-start sm:self-auto"
        onClick={() => onFix(pickContrastingTextColor(bg))}
      >
        Corrigir contraste
      </Button>
    </div>
  );
}
