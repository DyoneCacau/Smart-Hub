import * as React from "react";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Props = Omit<React.ComponentProps<typeof Input>, "type" | "value" | "onChange"> & {
  /** Valor ISO: yyyy-MM-dd (igual Supabase / inputs type=date). */
  value: string;
  /** Recebe valor ISO: yyyy-MM-dd. */
  onChange: (value: string) => void;
  /** Se true, ao clicar no campo abre um calendário para escolher a data. */
  showCalendar?: boolean;
};

function isoToBr(iso: string): string {
  // Esperado: yyyy-MM-dd
  if (!iso || iso.length < 10) return "";
  const y = iso.slice(0, 4);
  const m = iso.slice(5, 7);
  const d = iso.slice(8, 10);
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

function brToIso(br: string): string | null {
  // Esperado: dd/MM/yyyy
  const cleaned = br.trim();
  const m = cleaned.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = Number(dd);
  const mo = Number(mm);
  const y = Number(yyyy);
  if (y < 1900 || y > 2100) return null;
  if (mo < 1 || mo > 12) return null;
  if (d < 1 || d > 31) return null;

  // Valida data real (ex.: 31/02)
  const date = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== mo - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return `${yyyy}-${mm}-${dd}`;
}

function isoToDate(iso: string): Date | undefined {
  if (!iso || iso.length < 10) return undefined;
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1;
  const d = Number(iso.slice(8, 10));
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return undefined;
  const date = new Date(y, m, d);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

function dateToIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Input de data que SEMPRE mostra `dd/MM/aaaa`, sem depender do locale do navegador.
 * Internamente continua usando ISO `yyyy-MM-dd` (compatível com Supabase).
 * Se showCalendar=true, ao clicar no campo abre um popover com calendário.
 */
export const DateInput = React.forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, onBlur, showCalendar = false, className, ...props }, ref) => {
    const [text, setText] = React.useState<string>(() => isoToBr(value));
    const [open, setOpen] = React.useState(false);

    React.useEffect(() => {
      setText(isoToBr(value));
    }, [value]);

    const selectedDate = isoToDate(value);

    const applyMask = (raw: string) => {
      const digits = raw.replace(/\D/g, "").slice(0, 8);
      if (digits.length <= 2) return digits;
      if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
      return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    };

    const inputEl = (
      <Input
        ref={ref}
        type="text"
        inputMode="numeric"
        placeholder={props.placeholder || "dd/MM/aaaa"}
        value={text}
        maxLength={10}
        onChange={(e) => {
          const next = applyMask(e.target.value);
          setText(next);
          const iso = brToIso(next);
          if (iso) onChange(iso);
          if (next.length === 0) onChange("");
        }}
        onBlur={(e) => {
          const iso = brToIso(text);
          if (!iso) setText(isoToBr(value));
          onBlur?.(e);
        }}
        className={cn(showCalendar && "cursor-pointer", className)}
        {...props}
      />
    );

    if (showCalendar) {
      return (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            {inputEl}
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => {
                if (date) {
                  onChange(dateToIso(date));
                  setText(isoToBr(dateToIso(date)));
                  setOpen(false);
                }
              }}
            />
          </PopoverContent>
        </Popover>
      );
    }

    return inputEl;
  }
);
DateInput.displayName = "DateInput";

