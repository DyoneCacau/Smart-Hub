import { memo } from 'react';
import { cn } from '@/lib/utils';

interface HubGalleryProps {
  images: { url: string; alt?: string }[];
  className?: string;
}

export const HubGallery = memo(function HubGallery({ images, className }: HubGalleryProps) {
  if (!images.length) return null;

  return (
    <div
      className={cn(
        'mx-auto grid w-full max-w-lg grid-cols-2 gap-2 px-4 sm:grid-cols-3',
        className
      )}
    >
      {images.map((img) => (
        <img
          key={img.url}
          src={img.url}
          alt={img.alt || ''}
          loading="lazy"
          className="aspect-square w-full rounded-lg object-cover"
        />
      ))}
    </div>
  );
});
