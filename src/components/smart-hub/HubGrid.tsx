import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { SmartHubButton } from '@/types/smartHub';
import { HubButton } from './HubButton';

interface HubGridProps {
  buttons: SmartHubButton[];
  onButtonClick?: (button: SmartHubButton) => void;
  className?: string;
  emptyLabel?: string;
  /** Quando false, não renderiza o estado vazio (ex.: WhatsApp já aparece em outra seção). */
  showEmpty?: boolean;
  columns?: 1 | 2 | 3;
  defaultBg?: string;
  defaultFg?: string;
  radiusClass?: string;
}

export const HubGrid = memo(function HubGrid({
  buttons,
  onButtonClick,
  className,
  emptyLabel = 'Nenhum link disponível no momento.',
  showEmpty = true,
  columns = 1,
  defaultBg,
  defaultFg,
  radiusClass,
}: HubGridProps) {
  if (!buttons.length) {
    if (!showEmpty) return null;
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'mx-auto grid w-full max-w-lg gap-3 px-4',
        columns === 2 && 'sm:grid-cols-2 sm:max-w-2xl',
        columns === 3 && 'sm:grid-cols-2 lg:grid-cols-3 sm:max-w-3xl',
        className
      )}
    >
      {buttons.map((button) => (
        <HubButton
          key={button.id}
          button={button}
          onClick={onButtonClick}
          defaultBg={defaultBg}
          defaultFg={defaultFg}
          radiusClass={radiusClass}
        />
      ))}
    </div>
  );
});
