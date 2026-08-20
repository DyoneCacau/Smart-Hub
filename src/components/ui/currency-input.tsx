import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatCurrencyBRL, parseCurrencyBRL } from '@/lib/currency';

export interface CurrencyInputProps
  extends Omit<React.ComponentProps<'input'>, 'type' | 'value' | 'onChange' | 'defaultValue'> {
  /** Valor numérico em reais (ex.: 1500 = R$ 1.500,00). */
  value: number;
  onValueChange: (value: number) => void;
  /** Exibe prefixo R$ à esquerda. */
  showPrefix?: boolean;
}

/**
 * Input de dinheiro sem setas, com máscara pt-BR (1.500,00).
 * Digitação por centavos: digitar 150000 resulta em 1.500,00.
 */
export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onValueChange, showPrefix = true, className, onFocus, onBlur, ...props }, ref) => {
    const [display, setDisplay] = React.useState(() => formatCurrencyBRL(value || 0));
    const [focused, setFocused] = React.useState(false);

    React.useEffect(() => {
      if (!focused) {
        setDisplay(formatCurrencyBRL(value || 0));
      }
    }, [value, focused]);

    return (
      <div className="relative">
        {showPrefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            R$
          </span>
        )}
        <Input
          {...props}
          ref={ref}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={display}
          className={cn(showPrefix && 'pl-10', 'tabular-nums', className)}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            const parsed = parseCurrencyBRL(event.target.value);
            setDisplay(formatCurrencyBRL(parsed));
            onValueChange(parsed);
            onBlur?.(event);
          }}
          onChange={(event) => {
            const nextDisplay = formatCurrencyBRL(parseCurrencyBRL(event.target.value));
            setDisplay(nextDisplay);
            onValueChange(parseCurrencyBRL(nextDisplay));
          }}
        />
      </div>
    );
  },
);
CurrencyInput.displayName = 'CurrencyInput';
