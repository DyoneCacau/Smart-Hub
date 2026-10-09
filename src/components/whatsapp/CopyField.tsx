import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CopyFieldProps {
  label?: string;
  value: string;
  multiline?: boolean;
  className?: string;
}

export function CopyField({ label, value, multiline, className }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Não foi possível copiar. Selecione o texto e copie manualmente.');
    }
  };

  return (
    <div className={cn('space-y-1', className)}>
      {label && <p className="text-xs font-medium text-muted-foreground">{label}</p>}
      <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2">
        <code
          className={cn(
            'min-w-0 flex-1 font-mono text-xs',
            multiline ? 'whitespace-pre-wrap [overflow-wrap:anywhere]' : 'truncate',
          )}
          title={value}
        >
          {value}
        </code>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="-my-1 h-7 w-7 shrink-0"
          onClick={() => void handleCopy()}
          aria-label={label ? `Copiar ${label}` : 'Copiar'}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}
