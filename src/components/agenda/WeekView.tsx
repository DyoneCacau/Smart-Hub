import { addDays, format, isSameDay, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useCurrentTime } from '@/hooks/useCurrentTime';
import type { AgendaEntry } from '@/types/scheduling';
import { AppointmentCard, type AppointmentActions } from './AppointmentCard';
import { CurrentTimeIndicator } from './CurrentTimeIndicator';

interface WeekViewProps extends AppointmentActions {
  date: Date;
  appointments: AgendaEntry[];
  onSlotClick?: (day: Date, startTime: string) => void;
}

const FIRST_HOUR = 7;
const LAST_HOUR = 20;
const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i);

function hourOf(time: string): number {
  return Number(time.slice(0, 2));
}

export function WeekView({ date, appointments, onSlotClick, ...actions }: WeekViewProps) {
  const now = useCurrentTime();
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const currentTimeInfo = (() => {
    if (!weekDays.some((d) => isSameDay(d, now))) return null;
    const hour = now.getHours();
    if (hour < FIRST_HOUR || hour > LAST_HOUR) return null;
    return { hour, fraction: now.getMinutes() / 60 };
  })();

  const appointmentsFor = (day: Date, hour?: number) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    return appointments
      .filter((apt) => {
        if (apt.date !== dayStr) return false;
        if (hour === undefined) return true;
        const aptHour = hourOf(apt.startTime);
        if (hour === FIRST_HOUR) return aptHour <= FIRST_HOUR;
        if (hour === LAST_HOUR) return aptHour >= LAST_HOUR;
        return aptHour === hour;
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-[5rem_repeat(7,minmax(0,1fr))] border-b border-border bg-muted/50">
          <div className="border-r border-border p-2" />
          {weekDays.map((day) => {
            const isToday = isSameDay(day, now);
            const count = appointmentsFor(day).length;
            return (
              <div
                key={day.toISOString()}
                className={cn('border-r border-border p-2 text-center last:border-r-0', isToday && 'bg-primary/5')}
              >
                <div className="text-xs uppercase text-muted-foreground">{format(day, 'EEE', { locale: ptBR })}</div>
                <div
                  className={cn(
                    'mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold',
                    isToday ? 'bg-primary text-primary-foreground' : 'text-foreground',
                  )}
                >
                  {format(day, 'd')}
                </div>
                {count > 0 && <div className="mt-1 text-xs text-muted-foreground">{count} agend.</div>}
              </div>
            );
          })}
        </div>

        <div className="max-h-[600px] overflow-y-auto">
          {HOURS.map((hour) => {
            const slot = `${String(hour).padStart(2, '0')}:00`;
            return (
              <div
                key={hour}
                className="relative grid grid-cols-[5rem_repeat(7,minmax(0,1fr))] border-b border-border last:border-b-0"
              >
                {currentTimeInfo?.hour === hour && (
                  <CurrentTimeIndicator fraction={currentTimeInfo.fraction} offsetClassName="ml-20" />
                )}
                <div className="border-r border-border px-2 py-3">
                  <span className="text-xs font-medium text-muted-foreground">{slot}</span>
                </div>
                {weekDays.map((day) => {
                  const slotAppointments = appointmentsFor(day, hour);
                  return (
                    <div
                      key={`${day.toISOString()}-${hour}`}
                      onClick={() => onSlotClick?.(day, slot)}
                      className={cn(
                        'min-h-[80px] border-r border-border p-1 last:border-r-0',
                        isSameDay(day, now) ? 'bg-primary/5' : 'bg-card',
                        onSlotClick && 'cursor-pointer transition-colors hover:bg-muted/50',
                      )}
                    >
                      <div onClick={(e) => slotAppointments.length > 0 && e.stopPropagation()}>
                        {slotAppointments.map((apt) => (
                          <AppointmentCard key={apt.id} appointment={apt} {...actions} compact />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
