import { memo } from 'react';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HubMapProps {
  address?: string | null;
  embedUrl?: string | null;
  className?: string;
}

export const HubMap = memo(function HubMap({ address, embedUrl, className }: HubMapProps) {
  if (!address && !embedUrl) return null;

  return (
    <div className={cn('mx-auto w-full max-w-lg space-y-2 px-4', className)}>
      {address && (
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{address}</span>
        </div>
      )}
      {embedUrl && (
        <div className="aspect-video overflow-hidden rounded-xl border">
          <iframe
            src={embedUrl}
            title="Mapa"
            className="h-full w-full"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      )}
    </div>
  );
});
