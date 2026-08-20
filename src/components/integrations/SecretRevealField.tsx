import { useState } from 'react';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SecretRevealFieldProps {
  label: string;
  value: string;
  /** Segredos ficam escondidos por padrão; URLs podem começar visíveis. */
  hiddenByDefault?: boolean;
  helpText?: string;
}

/**
 * Campo somente leitura para valores sensíveis exibidos uma única vez
 * (segredo de webhook, token de API).
 */
export function SecretRevealField({
  label,
  value,
  hiddenByDefault = true,
  helpText,
}: SecretRevealFieldProps) {
  const [visible, setVisible] = useState(!hiddenByDefault);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success('Copiado');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Não foi possível copiar. Selecione e copie manualmente.');
    }
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <Input readOnly value={visible ? value : '•'.repeat(Math.min(value.length, 40))} />
        {hiddenByDefault && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Ocultar' : 'Mostrar'}
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        )}
        <Button type="button" variant="outline" size="icon" onClick={handleCopy} aria-label="Copiar">
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
      {helpText && <p className="text-[11px] text-muted-foreground">{helpText}</p>}
    </div>
  );
}
