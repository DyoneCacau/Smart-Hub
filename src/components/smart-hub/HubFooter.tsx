import { memo } from 'react';
import { cn } from '@/lib/utils';

interface HubFooterProps {
  text?: string | null;
  className?: string;
}

export const HubFooter = memo(function HubFooter({
  text = 'Powered by Healthcare Smart Hub',
  className,
}: HubFooterProps) {
  return (
    <footer className={cn('px-4 py-8 text-center text-xs text-muted-foreground', className)}>
      {text}
    </footer>
  );
});
