import { useEffect, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useClinicSettings } from '@/hooks/useClinicSettings';
import type {
  Appointment,
  AppointmentInput,
  AppointmentStatus,
  Patient,
  PaymentStatus,
  Procedure,
  Professional,
} from '@/types/scheduling';
import { minutesToTime, timeToMinutes } from './agendaStatus';

const CUSTOM_PROCEDURE = '__custom__';
const UNREGISTERED_PATIENT = '__unregistered__';
const DEFAULT_DURATION = 30;

const TIME_OPTIONS = Array.from({ length: 31 }, (_, i) => minutesToTime(7 * 60 + i * 30));

function addMinutes(time: string, minutes: number): string {
  return minutesToTime(Math.min(timeToMinutes(time) + minutes, 23 * 60 + 59));
}

function withOption(options: string[], value: string): string[] {
  return options.includes(value) ? options : [...options, value].sort();
}

interface AppointmentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment?: Appointment | null;
  patients: Patient[];
  professionals: Professional[];
  procedures: Procedure[];
  existingAppointments: Appointment[];
  onSave: (data: AppointmentInput, id?: string) => void;
  initialDate?: Date;
  initialStartTime?: string;
}

export function AppointmentFormDialog({
  open,
  onOpenChange,
  appointment,
  patients,
  professionals,
  procedures,
  existingAppointments,
  onSave,
  initialDate,
  initialStartTime,
}: AppointmentFormDialogProps) {
  const [date, setDate] = useState<Date>(new Date());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('09:30');
  const [patientId, setPatientId] = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [professionalId, setProfessionalId] = useState('');
  const [procedureValue, setProcedureValue] = useState('');
  const [customProcedure, setCustomProcedure] = useState('');
  const [status, setStatus] = useState<AppointmentStatus>('pending');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pending');
  const [notes, setNotes] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);

  const isEditing = !!appointment;
  const prevOpenRef = useRef(false);

  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    prevOpenRef.current = open;
    if (!justOpened) return;

    if (appointment) {
      setDate(parseISO(appointment.date));
      setStartTime(appointment.startTime);
      setEndTime(appointment.endTime);
      setPatientId(appointment.patientId ?? '');
      setPatientName(appointment.patientName);
      setPatientPhone(appointment.patientPhone ?? '');
      setProfessionalId(appointment.professionalId);
      const inCatalog = appointment.procedureId && procedures.some((p) => p.id === appointment.procedureId);
      setProcedureValue(inCatalog ? appointment.procedureId! : CUSTOM_PROCEDURE);
      setCustomProcedure(inCatalog ? '' : appointment.procedure);
      setStatus(appointment.status);
      setPaymentStatus(appointment.paymentStatus);
      setNotes(appointment.notes ?? '');
    } else {
      const start = initialStartTime || '09:00';
      setDate(initialDate ? new Date(initialDate) : new Date());
      setStartTime(start);
      setEndTime(addMinutes(start, DEFAULT_DURATION));
      setPatientId('');
      setPatientName('');
      setPatientPhone('');
      setProfessionalId(professionals.length === 1 ? professionals[0].id : '');
      setProcedureValue('');
      setCustomProcedure('');
      setStatus('pending');
      setPaymentStatus('pending');
      setNotes('');
    }
  }, [open, appointment, procedures, professionals, initialDate, initialStartTime]);

  const { segment } = useClinicSettings();
  const { service } = segment;
  const selectedProcedure = procedures.find((p) => p.id === procedureValue);
  const patientOptions = patients.filter((p) => p.status === 'active' || p.id === patientId);

  const handlePatientChange = (value: string) => {
    const patient = patients.find((p) => p.id === value);
    if (!patient) {
      setPatientId('');
      return;
    }
    setPatientId(patient.id);
    setPatientName(patient.name);
    setPatientPhone(patient.phone);
  };

  const handlePatientNameChange = (value: string) => {
    setPatientName(value);
    if (patientId) setPatientId('');
  };

  const durationFor = () => selectedProcedure?.duration_minutes ?? DEFAULT_DURATION;

  const handleStartTimeChange = (value: string) => {
    setStartTime(value);
    setEndTime(addMinutes(value, durationFor()));
  };

  const handleProcedureChange = (value: string) => {
    setProcedureValue(value);
    const procedure = procedures.find((p) => p.id === value);
    if (procedure) {
      setCustomProcedure('');
      setEndTime(addMinutes(startTime, procedure.duration_minutes));
    }
  };

  const hasConflict = () => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return existingAppointments.some(
      (apt) =>
        apt.id !== appointment?.id &&
        apt.professionalId === professionalId &&
        apt.date === dateStr &&
        apt.status !== 'cancelled' &&
        apt.status !== 'no_show' &&
        startTime < apt.endTime &&
        endTime > apt.startTime,
    );
  };

  const handleSave = () => {
    const procedureName =
      procedureValue === CUSTOM_PROCEDURE ? customProcedure.trim() : selectedProcedure?.name ?? '';

    if (!patientName.trim() || !professionalId || !procedureName) {
      toast.error(`Preencha paciente, profissional e ${service.singular.toLowerCase()}`);
      return;
    }
    if (endTime <= startTime) {
      toast.error('O horário de fim precisa ser depois do início');
      return;
    }
    if (hasConflict()) {
      toast.error('Conflito de horário para este profissional');
      return;
    }

    onSave(
      {
        date: format(date, 'yyyy-MM-dd'),
        startTime,
        endTime,
        patientName: patientName.trim(),
        patientPhone: patientPhone.trim() || undefined,
        patientId: patientId || null,
        professionalId,
        procedure: procedureName,
        procedureId: selectedProcedure?.id ?? null,
        procedurePrice: selectedProcedure?.default_price ?? appointment?.procedurePrice ?? null,
        status,
        paymentStatus,
        notes: notes.trim() || undefined,
      },
      appointment?.id,
    );
    onOpenChange(false);
  };

  const startOptions = withOption(TIME_OPTIONS, startTime);
  const endOptions = withOption(TIME_OPTIONS, endTime);
  const currentProfessionalMissing =
    isEditing && professionalId && !professionals.some((p) => p.id === professionalId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar agendamento' : 'Novo agendamento'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Atualize as informações do agendamento' : 'Preencha os dados para criar um novo agendamento'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Paciente cadastrado</Label>
            <Select value={patientId || UNREGISTERED_PATIENT} onValueChange={handlePatientChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNREGISTERED_PATIENT}>Não cadastrado — digitar nome abaixo</SelectItem>
                {patientOptions.map((patient) => (
                  <SelectItem key={patient.id} value={patient.id}>
                    {patient.name} · {patient.phone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {patients.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Cadastre pacientes na aba Pacientes para selecioná-los aqui.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="patient-name">Nome do paciente *</Label>
              <Input
                id="patient-name"
                value={patientName}
                onChange={(e) => handlePatientNameChange(e.target.value)}
                placeholder="Nome do paciente"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="patient-phone">Telefone / WhatsApp</Label>
              <Input
                id="patient-phone"
                value={patientPhone}
                onChange={(e) => setPatientPhone(e.target.value)}
                placeholder="(11) 99999-9999"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Data *</Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(date, "dd/MM/yyyy '·' EEEE", { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => {
                    if (d) {
                      setDate(d);
                      setCalendarOpen(false);
                    }
                  }}
                  locale={ptBR}
                  initialFocus
                  className="pointer-events-auto p-3"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Horário início *</Label>
              <Select value={startTime} onValueChange={handleStartTimeChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {startOptions.map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Horário fim *</Label>
              <Select value={endTime} onValueChange={setEndTime}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {endOptions.map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Profissional *</Label>
            <Select value={professionalId} onValueChange={setProfessionalId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o profissional" />
              </SelectTrigger>
              <SelectContent>
                {professionals.length === 0 && !currentProfessionalMissing ? (
                  <SelectItem value="none" disabled>
                    Nenhum profissional ativo — cadastre na aba Profissionais
                  </SelectItem>
                ) : (
                  professionals.map((prof) => (
                    <SelectItem key={prof.id} value={prof.id}>
                      {prof.name}
                      {prof.specialty ? ` - ${prof.specialty}` : ''}
                    </SelectItem>
                  ))
                )}
                {currentProfessionalMissing && (
                  <SelectItem value={professionalId}>Profissional inativo ou removido</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>{service.singular} *</Label>
            <Select value={procedureValue} onValueChange={handleProcedureChange}>
              <SelectTrigger>
                <SelectValue placeholder={`Selecione o ${service.singular.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {procedures.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} — {item.default_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} ·{' '}
                    {item.duration_minutes} min
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_PROCEDURE}>Outro / personalizado</SelectItem>
              </SelectContent>
            </Select>
            {procedureValue === CUSTOM_PROCEDURE && (
              <Input
                placeholder={`Ex.: ${segment.templates[0]?.name ?? 'Consulta'}`}
                value={customProcedure}
                onChange={(e) => setCustomProcedure(e.target.value)}
              />
            )}
            <p className="text-xs text-muted-foreground">
              {selectedProcedure
                ? `Preço sugerido: ${selectedProcedure.default_price.toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  })}. A duração já foi aplicada ao horário de fim.`
                : `Cadastre ${service.plural.toLowerCase()} na aba ${service.plural} para preencher preço e duração automaticamente.`}
            </p>
            {selectedProcedure?.preparation && (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                <span className="font-medium">Preparo:</span> {selectedProcedure.preparation}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as AppointmentStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="confirmed">Confirmado</SelectItem>
                  <SelectItem value="return">Retorno</SelectItem>
                  {isEditing && <SelectItem value="completed">Concluído</SelectItem>}
                  {isEditing && <SelectItem value="no_show">Faltou</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Pagamento</Label>
              <Select value={paymentStatus} onValueChange={(v) => setPaymentStatus(v as PaymentStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">A pagar</SelectItem>
                  <SelectItem value="paid">Pago</SelectItem>
                  <SelectItem value="partial">Parcial</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anotações adicionais..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>{isEditing ? 'Salvar alterações' : 'Criar agendamento'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
