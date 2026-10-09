import { addDays, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from 'date-fns';
import { cn } from '@/lib/utils';
import type { AgendaEntry } from '@/types/scheduling';
import { STATUS_CONFIG } from './agendaStatus';

interface MonthViewProps {
  date: Date;
  appointments: AgendaEntry[];
  onDayClick: (date: Date) => void;
}

const WEEK_DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export function MonthView({ date, appointments, onDayClick }: MonthViewProps) {
  const calendarStart = startOfWeek(startOfMonth(date), { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(endOfMonth(date), { weekStartsOn: 1 });
  const today = new Date();

  const days: Date[] = [];
  for (let day = calendarStart; day <= calendarEnd; day = addDays(day, 1)) {
    days.push(day);
  }

  const appointmentsFor = (day: Date) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    return appointments
      .filter((apt) => apt.date === dayStr)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="grid grid-cols-7 border-b border-border bg-muted/50">
        {WEEK_DAYS.map((day) => (
          <div
            key={day}
            className="border-r border-border p-3 text-center text-sm font-medium text-muted-foreground last:border-r-0"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayAppointments = appointmentsFor(day);
          const isCurrentMonth = isSameMonth(day, date);
          const isToday = isSameDay(day, today);

          return (
            <div
              key={day.toISOString()}
              onClick={() => onDayClick(day)}
              className={cn(
                'min-h-[100px] cursor-pointer border-b border-r border-border p-2 transition-colors [&:nth-child(7n)]:border-r-0',
                isCurrentMonth ? 'bg-card hover:bg-muted/50' : 'bg-muted/30 text-muted-foreground',
                isToday && 'bg-primary/5',
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'inline-flex h-7 w-7 items-center justify-center rounded-full text-sm',
                    isToday ? 'bg-primary font-semibold text-primary-foreground' : 'font-medium',
                  )}
                >
                  {format(day, 'd')}
                </span>
                {dayAppointments.length > 0 && (
                  <span className="text-xs text-muted-foreground">{dayAppointments.length}</span>
                )}
              </div>

              <div className="mt-1 space-y-1">
                {dayAppointments.slice(0, 3).map((apt) => (
                  <div
                    key={apt.id}
                    className={cn(
                      'flex items-center gap-1 truncate rounded px-1 py-0.5 text-xs',
                      STATUS_CONFIG[apt.status].chip,
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 flex-shrink-0 rounded-full', STATUS_CONFIG[apt.status].dot)} />
                    <span className="truncate">
                      {apt.startTime} {apt.patientName}
                    </span>
                  </div>
                ))}
                {dayAppointments.length > 3 && (
                  <div className="pl-1 text-xs text-muted-foreground">+{dayAppointments.length - 3} mais</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
