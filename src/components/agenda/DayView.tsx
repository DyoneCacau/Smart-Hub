import { format, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useCurrentTime } from '@/hooks/useCurrentTime';
import type { AgendaEntry } from '@/types/scheduling';
import { AppointmentCard, type AppointmentActions } from './AppointmentCard';
import { CurrentTimeIndicator } from './CurrentTimeIndicator';
import { minutesToTime, timeToMinutes } from './agendaStatus';

interface DayViewProps extends AppointmentActions {
  date: Date;
  appointments: AgendaEntry[];
  onSlotClick?: (startTime: string) => void;
}

const BASE_SLOTS = Array.from({ length: 27 }, (_, i) => minutesToTime(7 * 60 + i * 30));

export function DayView({ date, appointments, onSlotClick, ...actions }: DayViewProps) {
  const now = useCurrentTime();

  const slots = Array.from(new Set([...BASE_SLOTS, ...appointments.map((apt) => apt.startTime)])).sort();

  const currentTimeInfo = (() => {
    if (!isSameDay(date, now)) return null;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    for (let i = 0; i < slots.length; i++) {
      const start = timeToMinutes(slots[i]);
      const end = slots[i + 1] ? timeToMinutes(slots[i + 1]) : start + 30;
      if (nowMinutes >= start && nowMinutes < end) {
        return { slot: slots[i], fraction: (nowMinutes - start) / (end - start) };
      }
    }
    return null;
  })();

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border bg-muted/50 px-4 py-3">
        <h3 className="font-semibold text-foreground first-letter:uppercase">
          {format(date, "EEEE, d 'de' MMMM", { locale: ptBR })}
        </h3>
        <p className="text-sm text-muted-foreground">
          {appointments.length} agendamento{appointments.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="divide-y divide-border">
        {slots.map((slot) => {
          const slotAppointments = appointments.filter((apt) => apt.startTime === slot);
          const hasAppointments = slotAppointments.length > 0;

          return (
            <div
              key={slot}
              onClick={() => onSlotClick?.(slot)}
              className={cn(
                'relative flex min-h-[60px]',
                hasAppointments ? 'bg-card' : 'bg-muted/20',
                onSlotClick && 'cursor-pointer transition-colors hover:bg-muted/40',
              )}
            >
              {currentTimeInfo?.slot === slot && (
                <CurrentTimeIndicator fraction={currentTimeInfo.fraction} offsetClassName="ml-20" />
              )}
              <div className="w-20 flex-shrink-0 border-r border-border px-3 py-2">
                <span className="text-sm font-medium text-muted-foreground">{slot}</span>
              </div>
              <div className="flex-1 p-2" onClick={(e) => hasAppointments && e.stopPropagation()}>
                {hasAppointments && (
                  <div className="space-y-2">
                    {slotAppointments.map((apt) => (
                      <AppointmentCard key={apt.id} appointment={apt} {...actions} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
