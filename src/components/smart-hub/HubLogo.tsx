import { memo } from 'react';
import { cn } from '@/lib/utils';

interface HubLogoProps {
  src?: string | null;
  alt?: string;
  className?: string;
}

export const HubLogo = memo(function HubLogo({ src, alt = 'Logo', className }: HubLogoProps) {
  if (!src) return null;

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={cn('mx-auto h-20 w-20 rounded-full object-cover shadow-md', className)}
    />
  );
});
