import type { ComponentType } from 'react';
import {
  Calendar,
  ExternalLink,
  Facebook,
  FileText,
  Globe,
  Info,
  Instagram,
  Link2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Youtube,
  type LucideProps,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type IconComponent = ComponentType<LucideProps>;

export type ButtonIconOption = {
  /** Valor persistido (nome Lucide ou string vazia). */
  value: string;
  label: string;
  Icon: IconComponent | null;
};

/** Opções amigáveis — não expor nomes técnicos na UI. */
export const BUTTON_ICON_OPTIONS: ButtonIconOption[] = [
  { value: '', label: 'Sem ícone', Icon: null },
  { value: 'calendar', label: 'Calendário', Icon: Calendar },
  { value: 'message-circle', label: 'WhatsApp', Icon: MessageCircle },
  { value: 'phone', label: 'Telefone', Icon: Phone },
  { value: 'external-link', label: 'Link', Icon: ExternalLink },
  { value: 'file-text', label: 'Formulário', Icon: FileText },
  { value: 'map-pin', label: 'Localização', Icon: MapPin },
  { value: 'info', label: 'Informação', Icon: Info },
];

const KNOWN_VALUES = new Set(BUTTON_ICON_OPTIONS.map((o) => o.value));

export function isKnownButtonIcon(value: string | null | undefined): boolean {
  if (!value) return true;
  return KNOWN_VALUES.has(value);
}

/** Resolve ícone Lucide (ou tipo legado) para renderização pública. */
export function resolveButtonIconComponent(
  iconOrType: string | null | undefined
): IconComponent {
  switch (iconOrType) {
    case 'calendar':
    case 'appointment':
      return Calendar;
    case 'message-circle':
    case 'whatsapp':
      return MessageCircle;
    case 'phone':
      return Phone;
    case 'email':
    case 'mail':
      return Mail;
    case 'external-link':
    case 'link':
      return ExternalLink;
    case 'site':
      return Globe;
    case 'file-text':
    case 'form':
      return FileText;
    case 'map-pin':
    case 'map':
      return MapPin;
    case 'info':
      return Info;
    case 'instagram':
      return Instagram;
    case 'facebook':
      return Facebook;
    case 'youtube':
      return Youtube;
    default:
      return Link2;
  }
}

interface ButtonIconPickerProps {
  value: string;
  onChange: (next: string) => void;
  className?: string;
}

export function ButtonIconPicker({ value, onChange, className }: ButtonIconPickerProps) {
  const known = isKnownButtonIcon(value);
  const selected = known ? value : '';

  return (
    <div className={cn('space-y-2', className)}>
      {!known && value ? (
        <p className="rounded-md border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
          Ícone personalizado/legado em uso. Escolha uma opção abaixo para substituir (o valor
          atual é preservado até você trocar).
        </p>
      ) : null}
      <div className="grid grid-cols-4 gap-2">
        {BUTTON_ICON_OPTIONS.map((opt) => {
          const active = known ? selected === opt.value : false;
          const Icon = opt.Icon;
          return (
            <Button
              key={opt.value || 'none'}
              type="button"
              variant={active ? 'default' : 'outline'}
              className={cn(
                'h-auto flex-col gap-1 px-2 py-2.5 text-[11px] font-normal leading-tight',
                active && 'ring-2 ring-primary/30'
              )}
              onClick={() => onChange(opt.value)}
            >
              {Icon ? (
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <span className="flex h-4 w-4 items-center justify-center text-muted-foreground">
                  —
                </span>
              )}
              <span className="text-center">{opt.label}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
