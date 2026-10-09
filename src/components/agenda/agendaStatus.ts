import type { AppointmentStatus, PaymentStatus } from '@/types/scheduling';

export const STATUS_CONFIG: Record<
  AppointmentStatus,
  { label: string; bg: string; border: string; text: string; dot: string; chip: string }
> = {
  confirmed: {
    label: 'Confirmado',
    bg: 'bg-emerald-500/10',
    border: 'border-l-emerald-500',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-100 text-emerald-700',
  },
  pending: {
    label: 'Pendente',
    bg: 'bg-amber-500/10',
    border: 'border-l-amber-500',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
    chip: 'bg-amber-100 text-amber-700',
  },
  return: {
    label: 'Retorno',
    bg: 'bg-blue-500/10',
    border: 'border-l-blue-500',
    text: 'text-blue-700',
    dot: 'bg-blue-500',
    chip: 'bg-blue-100 text-blue-700',
  },
  completed: {
    label: 'Concluído',
    bg: 'bg-muted',
    border: 'border-l-muted-foreground',
    text: 'text-muted-foreground',
    dot: 'bg-muted-foreground',
    chip: 'bg-muted text-muted-foreground',
  },
  cancelled: {
    label: 'Cancelado',
    bg: 'bg-destructive/10',
    border: 'border-l-destructive',
    text: 'text-destructive',
    dot: 'bg-destructive',
    chip: 'bg-red-100 text-red-700',
  },
  no_show: {
    label: 'Faltou',
    bg: 'bg-orange-500/10',
    border: 'border-l-orange-500',
    text: 'text-orange-700',
    dot: 'bg-orange-500',
    chip: 'bg-orange-100 text-orange-700',
  },
};

export const PAYMENT_CONFIG: Record<PaymentStatus, { label: string; className: string }> = {
  paid: { label: 'Pago', className: 'bg-emerald-100 text-emerald-700' },
  pending: { label: 'A pagar', className: 'bg-amber-100 text-amber-700' },
  partial: { label: 'Parcial', className: 'bg-blue-100 text-blue-700' },
  refunded: { label: 'Estornado', className: 'bg-red-100 text-red-700' },
};

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
