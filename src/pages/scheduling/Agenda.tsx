import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AppLayout } from '@/components/layout/AppLayout';
import { AgendaFilters } from '@/components/agenda/AgendaFilters';
import { AgendaStats } from '@/components/agenda/AgendaStats';
import { DayView } from '@/components/agenda/DayView';
import { WeekView } from '@/components/agenda/WeekView';
import { MonthView } from '@/components/agenda/MonthView';
import { AppointmentFormDialog } from '@/components/agenda/AppointmentFormDialog';
import type { AppointmentActions } from '@/components/agenda/AppointmentCard';
import { useClinicSettings } from '@/hooks/useClinicSettings';
import { useAppointments, usePatients, useProcedures, useProfessionals } from '@/hooks/useScheduling';
import { whatsappLink } from '@/lib/patientFormat';
import type { AgendaEntry, AgendaView, Appointment, AppointmentInput } from '@/types/scheduling';

function whatsappUrl(
  appointment: AgendaEntry,
  preparation: string | null | undefined,
  establishmentName: string | null,
): string | null {
  const date = format(new Date(`${appointment.date}T00:00:00`), "EEEE, dd/MM", { locale: ptBR });
  const lines = [
    `Olá, ${appointment.patientName}! Passando para lembrar do seu agendamento de ` +
      `${appointment.procedure} na ${date}, às ${appointment.startTime}, com ${appointment.professionalName}.`,
    preparation ? `Preparo: ${preparation}` : null,
    'Podemos confirmar?',
    establishmentName,
  ];
  return whatsappLink(appointment.patientPhone, lines.filter(Boolean).join('\n\n'));
}

export default function Agenda() {
  const { appointments, createAppointment, updateAppointment, removeAppointment } = useAppointments();
  const { professionals, activeProfessionals } = useProfessionals();
  const { procedures, activeProcedures } = useProcedures();
  const { patients } = usePatients();
  const { segment, establishmentName } = useClinicSettings();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedProfessional, setSelectedProfessional] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [view, setView] = useState<AgendaView>('day');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [slotDate, setSlotDate] = useState<Date | null>(null);
  const [slotStartTime, setSlotStartTime] = useState<string | null>(null);

  const entries: AgendaEntry[] = useMemo(() => {
    const names = new Map(professionals.map((p) => [p.id, p.name]));
    return appointments.map((apt) => ({
      ...apt,
      professionalName: names.get(apt.professionalId) ?? 'Profissional removido',
    }));
  }, [appointments, professionals]);

  const filtered = useMemo(
    () =>
      entries.filter((apt) => {
        if (apt.status === 'cancelled') return false;
        if (selectedProfessional !== 'all' && apt.professionalId !== selectedProfessional) return false;
        if (selectedStatus !== 'all' && apt.status !== selectedStatus) return false;
        return true;
      }),
    [entries, selectedProfessional, selectedStatus],
  );

  const dayEntries = useMemo(() => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    return filtered.filter((apt) => apt.date === dateStr);
  }, [filtered, selectedDate]);

  const statsEntries = useMemo(() => {
    if (view === 'day') return dayEntries;
    const start =
      view === 'week' ? startOfWeek(selectedDate, { weekStartsOn: 1 }) : startOfMonth(selectedDate);
    const end = view === 'week' ? endOfWeek(selectedDate, { weekStartsOn: 1 }) : endOfMonth(selectedDate);
    const from = format(start, 'yyyy-MM-dd');
    const to = format(end, 'yyyy-MM-dd');
    return filtered.filter((apt) => apt.date >= from && apt.date <= to);
  }, [view, dayEntries, filtered, selectedDate]);

  const openForm = (appointment: Appointment | null, date?: Date, startTime?: string) => {
    setEditing(appointment);
    setSlotDate(date ?? null);
    setSlotStartTime(startTime ?? null);
    setFormOpen(true);
  };

  const handleSave = (data: AppointmentInput, id?: string) => {
    if (id) {
      updateAppointment(id, data);
      toast.success('Agendamento atualizado');
    } else {
      createAppointment(data);
      toast.success('Agendamento criado');
    }
  };

  const setStatus = (appointment: AgendaEntry, status: Appointment['status'], message: string) => {
    updateAppointment(appointment.id, { status });
    toast.success(message);
  };

  const actions: AppointmentActions = {
    onEdit: (apt) => openForm(apt),
    onConfirm: (apt) => setStatus(apt, 'confirmed', 'Agendamento confirmado'),
    onComplete: (apt) => setStatus(apt, 'completed', 'Atendimento finalizado'),
    onMarkNoShow: (apt) => setStatus(apt, 'no_show', 'Marcado como faltou'),
    onCancel: (apt) => {
      updateAppointment(apt.id, { status: 'cancelled' });
      toast.success('Agendamento cancelado', {
        action: { label: 'Desfazer', onClick: () => updateAppointment(apt.id, { status: apt.status }) },
      });
    },
    onDelete: (apt) => {
      removeAppointment(apt.id);
      toast.success('Agendamento excluído');
    },
    onWhatsApp: (apt) => {
      const preparation = procedures.find((p) => p.id === apt.procedureId)?.preparation;
      const url = whatsappUrl(apt, preparation, establishmentName);
      if (!url) {
        toast.error('Paciente sem telefone válido cadastrado');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    },
  };

  return (
    <AppLayout
      title="Agenda"
      description={`Gerencie os agendamentos ${segment.establishmentOf}`}
      actions={
        <Button onClick={() => openForm(null, selectedDate)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo agendamento
        </Button>
      }
    >
      <div className="space-y-6">
        {activeProfessionals.length === 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Nenhum profissional ativo cadastrado.{' '}
            <Link to="/profissionais" className="font-medium underline">
              Cadastre um profissional
            </Link>{' '}
            para começar a agendar.
          </div>
        )}

        <AgendaStats appointments={statsEntries} />

        <AgendaFilters
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          selectedProfessional={selectedProfessional}
          onProfessionalChange={setSelectedProfessional}
          selectedStatus={selectedStatus}
          onStatusChange={setSelectedStatus}
          view={view}
          onViewChange={setView}
          professionals={professionals}
        />

        {view === 'day' && (
          <DayView
            date={selectedDate}
            appointments={dayEntries}
            onSlotClick={(startTime) => openForm(null, selectedDate, startTime)}
            {...actions}
          />
        )}
        {view === 'week' && (
          <WeekView
            date={selectedDate}
            appointments={filtered}
            onSlotClick={(day, startTime) => openForm(null, day, startTime)}
            {...actions}
          />
        )}
        {view === 'month' && (
          <MonthView
            date={selectedDate}
            appointments={filtered}
            onDayClick={(day) => {
              setSelectedDate(day);
              setView('day');
            }}
          />
        )}
      </div>

      <AppointmentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        appointment={editing}
        patients={patients}
        professionals={activeProfessionals}
        procedures={activeProcedures}
        existingAppointments={appointments}
        onSave={handleSave}
        initialDate={slotDate ?? selectedDate}
        initialStartTime={slotStartTime ?? undefined}
      />
    </AppLayout>
  );
}
