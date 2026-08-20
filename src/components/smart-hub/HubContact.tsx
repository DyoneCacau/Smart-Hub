import { memo } from 'react';
import { Mail, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HubContactProps {
  phone?: string | null;
  email?: string | null;
  className?: string;
}

export const HubContact = memo(function HubContact({ phone, email, className }: HubContactProps) {
  if (!phone && !email) return null;

  return (
    <div className={cn('mx-auto flex w-full max-w-lg flex-col gap-2 px-4', className)}>
      {phone && (
        <a
          href={`tel:${phone}`}
          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted"
        >
          <Phone className="h-4 w-4" />
          {phone}
        </a>
      )}
      {email && (
        <a
          href={`mailto:${email}`}
          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted"
        >
          <Mail className="h-4 w-4" />
          {email}
        </a>
      )}
    </div>
  );
});
