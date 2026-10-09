import { AlertCircle, CalendarCheck, CheckCircle2, RotateCcw } from 'lucide-react';
import type { AgendaEntry } from '@/types/scheduling';

interface AgendaStatsProps {
  appointments: AgendaEntry[];
}

export function AgendaStats({ appointments }: AgendaStatsProps) {
  const stats = [
    {
      label: 'Total',
      value: appointments.length,
      icon: CalendarCheck,
      iconClass: 'bg-primary/10 text-primary',
      valueClass: 'text-foreground',
    },
    {
      label: 'Confirmados',
      value: appointments.filter((a) => a.status === 'confirmed').length,
      icon: CheckCircle2,
      iconClass: 'bg-emerald-500/10 text-emerald-600',
      valueClass: 'text-emerald-600',
    },
    {
      label: 'Pendentes',
      value: appointments.filter((a) => a.status === 'pending').length,
      icon: AlertCircle,
      iconClass: 'bg-amber-500/10 text-amber-600',
      valueClass: 'text-amber-600',
    },
    {
      label: 'Retornos',
      value: appointments.filter((a) => a.status === 'return').length,
      icon: RotateCcw,
      iconClass: 'bg-blue-500/10 text-blue-600',
      valueClass: 'text-blue-600',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map(({ label, value, icon: Icon, iconClass, valueClass }) => (
        <div key={label} className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card p-3">
          <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 overflow-hidden">
            <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
            <p className="truncate text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
