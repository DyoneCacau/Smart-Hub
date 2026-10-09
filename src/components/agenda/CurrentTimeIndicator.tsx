import { cn } from '@/lib/utils';

interface CurrentTimeIndicatorProps {
  /** Posição vertical dentro da linha que contém o horário atual (0 a 1). */
  fraction: number;
  /** Margem esquerda para não cobrir a coluna de horários (ex.: "ml-20"). */
  offsetClassName?: string;
}

/** Linha "agora"; o pai precisa ter `position: relative`. */
export function CurrentTimeIndicator({ fraction, offsetClassName }: CurrentTimeIndicatorProps) {
  const clamped = Math.min(1, Math.max(0, fraction));
  return (
    <div
      className={cn('pointer-events-none absolute inset-x-0 z-10 flex items-center', offsetClassName)}
      style={{ top: `${clamped * 100}%` }}
      aria-hidden
    >
      <div className="-ml-1 h-2.5 w-2.5 shrink-0 rounded-full bg-destructive shadow-sm" />
      <div className="h-[2px] flex-1 bg-destructive" />
    </div>
  );
}
