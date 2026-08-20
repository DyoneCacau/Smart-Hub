import { memo, type MouseEvent } from 'react';
import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HubWhatsAppButtonProps {
  phone?: string | null;
  message?: string;
  label?: string;
  className?: string;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
}

function buildWhatsAppUrl(phone: string, message?: string): string {
  const value = phone.trim();
  if (/^https?:\/\//i.test(value) || value.startsWith('wa.me/')) {
    const base = value.startsWith('wa.me/') ? `https://${value}` : value;
    if (!message) return base;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}text=${encodeURIComponent(message)}`;
  }
  const digits = value.replace(/\D/g, '');
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${digits}${text}`;
}

export const HubWhatsAppButton = memo(function HubWhatsAppButton({
  phone,
  message,
  label = 'Falar no WhatsApp',
  className,
  onClick,
}: HubWhatsAppButtonProps) {
  if (!phone) return null;

  return (
    <a
      href={buildWhatsAppUrl(phone, message)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      onClick={onClick}
      className={cn(
        'mx-auto flex w-full max-w-lg items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3.5 font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 min-h-[44px]',
        className
      )}
    >
      <MessageCircle className="h-5 w-5" aria-hidden />
      {label}
    </a>
  );
});
