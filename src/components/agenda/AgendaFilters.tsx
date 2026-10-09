import { useState } from 'react';
import { addDays, addMonths, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AgendaView, Professional } from '@/types/scheduling';

interface AgendaFiltersProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  selectedProfessional: string;
  onProfessionalChange: (professionalId: string) => void;
  selectedStatus: string;
  onStatusChange: (status: string) => void;
  view: AgendaView;
  onViewChange: (view: AgendaView) => void;
  professionals: Professional[];
}

export function AgendaFilters({
  selectedDate,
  onDateChange,
  selectedProfessional,
  onProfessionalChange,
  selectedStatus,
  onStatusChange,
  view,
  onViewChange,
  professionals,
}: AgendaFiltersProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);

  const navigateDate = (direction: 1 | -1) => {
    if (view === 'day') onDateChange(addDays(selectedDate, direction));
    else if (view === 'week') onDateChange(addDays(selectedDate, 7 * direction));
    else onDateChange(addMonths(selectedDate, direction));
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => navigateDate(-1)} aria-label="Anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="min-w-[200px] justify-start text-left font-normal">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(selectedDate, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => {
                if (date) {
                  onDateChange(date);
                  setCalendarOpen(false);
                }
              }}
              locale={ptBR}
              initialFocus
              className="pointer-events-auto p-3"
            />
          </PopoverContent>
        </Popover>

        <Button variant="outline" size="icon" onClick={() => navigateDate(1)} aria-label="Próximo">
          <ChevronRight className="h-4 w-4" />
        </Button>

        <Button variant="ghost" size="sm" onClick={() => onDateChange(new Date())}>
          Hoje
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={view} onValueChange={(v) => onViewChange(v as AgendaView)}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Visualização" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Dia</SelectItem>
            <SelectItem value="week">Semana</SelectItem>
            <SelectItem value="month">Mês</SelectItem>
          </SelectContent>
        </Select>

        <Select value={selectedProfessional} onValueChange={onProfessionalChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Todos os profissionais" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os profissionais</SelectItem>
            {professionals.map((prof) => (
              <SelectItem key={prof.id} value={prof.id}>
                {prof.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedStatus} onValueChange={onStatusChange}>
          <SelectTrigger className="w-[150px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="confirmed">Confirmado</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="return">Retorno</SelectItem>
            <SelectItem value="completed">Concluído</SelectItem>
            <SelectItem value="no_show">Faltou</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
