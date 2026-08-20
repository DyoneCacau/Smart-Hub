import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import {
  isNearInvisible,
  isPoorContrast,
  normalizeHexColor,
} from '@/services/smartHub/imageUtils';
import { FieldHelpLabel } from './FieldHelpLabel';
import { cn } from '@/lib/utils';

interface ColorFieldProps {
  id: string;
  label: string;
  value: string;
  fallback?: string;
  /** Quando informado, exibe aviso de contraste (sem alterar cores automaticamente). */
  contrastAgainst?: string;
  help?: string;
  onChange: (value: string) => void;
  className?: string;
}

export function ColorField({
  id,
  label,
  value,
  fallback = '#0F766E',
  contrastAgainst,
  help,
  onChange,
  className,
}: ColorFieldProps) {
  const [hexDraft, setHexDraft] = useState(value);
  const normalized = normalizeHexColor(value, fallback);

  useEffect(() => {
    setHexDraft(value);
  }, [value]);

  const poor =
    contrastAgainst &&
    isPoorContrast(normalized, normalizeHexColor(contrastAgainst, '#FFFFFF'));
  const invisible =
    contrastAgainst &&
    isNearInvisible(normalized, normalizeHexColor(contrastAgainst, '#FFFFFF'));

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-2">
        {help ? (
          <FieldHelpLabel htmlFor={id} label={label} help={help} />
        ) : (
          <Label htmlFor={id}>{label}</Label>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => {
            onChange(fallback);
            setHexDraft(fallback);
          }}
        >
          <RotateCcw className="mr-1 h-3 w-3" />
          Restaurar
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="color"
          value={normalized}
          onChange={(e) => {
            onChange(e.target.value.toUpperCase());
            setHexDraft(e.target.value.toUpperCase());
          }}
          className="h-10 w-14 cursor-pointer p-1"
          aria-label={`Seletor de ${label}`}
        />
        <Input
          value={hexDraft}
          onChange={(e) => setHexDraft(e.target.value)}
          onBlur={() => {
            const next = normalizeHexColor(hexDraft, normalized);
            setHexDraft(next);
            onChange(next);
          }}
          className="font-mono uppercase"
          placeholder="#000000"
          aria-label={`Hexadecimal de ${label}`}
        />
        <div
          className="h-10 w-10 shrink-0 rounded-md border"
          style={{ backgroundColor: normalized }}
          aria-hidden
        />
      </div>
      {invisible ? (
        <p className="text-xs text-destructive">
          Esta combinação deixa o texto praticamente invisível.
        </p>
      ) : poor ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Essa combinação de cores pode dificultar a leitura.
        </p>
      ) : null}
    </div>
  );
}
