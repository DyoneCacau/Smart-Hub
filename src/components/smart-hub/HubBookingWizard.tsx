import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Loader2,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatCPF, isValidCPF } from '@/lib/patientFormat';
import {
  AnalyticsService,
  BOOKING_INITIAL_WINDOW_DAYS,
  BOOKING_MAX_WINDOW_DAYS,
  BOOKING_PUBLIC_ERROR_MESSAGES,
  BookingService,
  addDaysYmd,
  createIdempotencyKey,
  digitsOnlyPhone,
  formatBookingDateLabel,
  formatBookingTimeRange,
  formatPhoneMaskBr,
  groupSlotsByDate,
  isPhoneVisuallyValid,
  mergeCaptureConfig,
  todayYmdLocal,
} from '@/services/smartHub';
import { isPublicBookingEnabled } from '@/components/smart-hub/buttonIntentOptions';
import type { SmartHub, SmartHubButton } from '@/types/smartHub';
import type {
  BookingCatalogProcedure,
  BookingCatalogProfessional,
  BookingSlot,
} from '@/services/smartHub/BookingService';
import { cn } from '@/lib/utils';

type WizardStep =
  | 'procedure'
  | 'professional'
  | 'slots'
  | 'patient'
  | 'review'
  | 'done'
  | 'disabled';

const FLOW_STEPS: WizardStep[] = ['procedure', 'professional', 'slots', 'patient', 'review'];
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function formatBirthDate(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return y && m && d ? `${d}/${m}/${y}` : ymd;
}

interface HubBookingWizardProps {
  hub: SmartHub;
  button?: SmartHubButton | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview?: boolean;
  className?: string;
}

function trackBooking(
  hubId: string | undefined,
  buttonId: string | null | undefined,
  event: string,
  extra?: Record<string, unknown>
) {
  if (!hubId) return;
  AnalyticsService.trackClick(hubId, buttonId?.startsWith('hub-') ? null : buttonId || null, {
    target_url: `booking:${event}`,
    button_type: 'appointment',
    click_action: 'booking',
    device_type:
      typeof window !== 'undefined'
        ? window.innerWidth < 768
          ? 'mobile'
          : window.innerWidth < 1024
            ? 'tablet'
            : 'desktop'
        : 'desktop',
    ...extra,
  }).catch(() => undefined);
}

export function HubBookingWizard({
  hub,
  button,
  open,
  onOpenChange,
  preview = false,
  className,
}: HubBookingWizardProps) {
  const bookingOn = isPublicBookingEnabled(hub);
  const capture = useMemo(() => mergeCaptureConfig(hub.capture_config), [hub.capture_config]);

  const [step, setStep] = useState<WizardStep>(bookingOn ? 'procedure' : 'disabled');
  const [procedures, setProcedures] = useState<BookingCatalogProcedure[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [procedure, setProcedure] = useState<BookingCatalogProcedure | null>(null);
  const [professional, setProfessional] = useState<BookingCatalogProfessional | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null);
  const [windowFrom, setWindowFrom] = useState(todayYmdLocal());
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [insurance, setInsurance] = useState('');
  const [notes, setNotes] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const idempotencyRef = useRef<string | null>(null);
  const startedRef = useRef(false);

  const windowTo = useMemo(
    () => addDaysYmd(windowFrom, BOOKING_INITIAL_WINDOW_DAYS - 1),
    [windowFrom]
  );

  const maxFrom = useMemo(() => {
    const today = todayYmdLocal();
    return addDaysYmd(today, BOOKING_MAX_WINDOW_DAYS - BOOKING_INITIAL_WINDOW_DAYS);
  }, []);

  const daysWithSlots = useMemo(() => groupSlotsByDate(slots), [slots]);
  const slotsForSelectedDate = useMemo(() => {
    if (!selectedDate) return [];
    return daysWithSlots.find((d) => d.date === selectedDate)?.slots || [];
  }, [daysWithSlots, selectedDate]);

  const resetFlow = useCallback(() => {
    setStep(bookingOn ? 'procedure' : 'disabled');
    setProcedures([]);
    setCatalogLoading(false);
    setCatalogError(null);
    setProcedure(null);
    setProfessional(null);
    setSelectedDate(null);
    setSelectedSlot(null);
    setWindowFrom(todayYmdLocal());
    setSlots([]);
    setSlotsLoading(false);
    setSlotsError(null);
    setName('');
    setPhone('');
    setEmail('');
    setCpf('');
    setBirthDate('');
    setInsurance('');
    setNotes('');
    setPrivacyAccepted(false);
    setFieldError(null);
    setConfirmError(null);
    setSubmitting(false);
    idempotencyRef.current = null;
    startedRef.current = false;
  }, [bookingOn]);

  useEffect(() => {
    if (!open) return;
    if (!bookingOn) {
      setStep('disabled');
      return;
    }
    if (!startedRef.current) {
      startedRef.current = true;
      trackBooking(hub.id, button?.id, 'booking_started');
    }

    let cancelled = false;
    setCatalogLoading(true);
    setCatalogError(null);
    void (async () => {
      const result = await BookingService.getCatalog(hub.slug);
      if (cancelled) return;
      setCatalogLoading(false);
      if (!result.ok) {
        if (result.code === 'booking_disabled') {
          setStep('disabled');
          return;
        }
        setProcedures([]);
        setCatalogError(result.error || BOOKING_PUBLIC_ERROR_MESSAGES.server_error);
        return;
      }
      setProcedures(result.procedures || []);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, bookingOn, hub.id, hub.slug, button?.id]);

  const clearAvailability = useCallback(() => {
    setSlots([]);
    setSlotsError(null);
    setSelectedDate(null);
    setSelectedSlot(null);
    idempotencyRef.current = null;
  }, []);

  const loadAvailability = useCallback(
    async (procId: string, profId: string, from: string, to: string) => {
      setSlotsLoading(true);
      setSlotsError(null);
      const result = await BookingService.getAvailability({
        slug: hub.slug,
        procedure_id: procId,
        professional_id: profId,
        from_date: from,
        to_date: to,
      });
      setSlotsLoading(false);
      if (!result.ok) {
        if (result.code === 'booking_disabled') {
          setStep('disabled');
          return;
        }
        setSlots([]);
        setSlotsError(result.error || BOOKING_PUBLIC_ERROR_MESSAGES.server_error);
        return;
      }
      setSlots(result.slots || []);
    },
    [hub.slug]
  );

  useEffect(() => {
    if (!open || step !== 'slots' || !procedure || !professional) return;
    void loadAvailability(procedure.id, professional.id, windowFrom, windowTo);
  }, [open, step, procedure, professional, windowFrom, windowTo, loadAvailability]);

  useEffect(() => {
    if (open) return;
    const timer = window.setTimeout(resetFlow, 250);
    return () => window.clearTimeout(timer);
  }, [open, resetFlow]);

  const handleClose = (next: boolean) => {
    if (!next && submitting) return;
    onOpenChange(next);
  };

  const goBack = () => {
    setFieldError(null);
    setConfirmError(null);
    if (step === 'professional') {
      setProfessional(null);
      clearAvailability();
      setStep('procedure');
      return;
    }
    if (step === 'slots') {
      clearAvailability();
      setStep('professional');
      return;
    }
    if (step === 'patient') {
      setStep('slots');
      return;
    }
    if (step === 'review') {
      setStep('patient');
    }
  };

  const selectProcedure = (item: BookingCatalogProcedure) => {
    setProcedure(item);
    setProfessional(null);
    clearAvailability();
    setWindowFrom(todayYmdLocal());
    trackBooking(hub.id, button?.id, 'procedure_selected', {
      procedure_name: item.name,
    });
    setStep('professional');
  };

  const selectProfessional = (item: BookingCatalogProfessional) => {
    setProfessional(item);
    clearAvailability();
    setWindowFrom(todayYmdLocal());
    trackBooking(hub.id, button?.id, 'professional_selected', {
      professional_name: item.name,
    });
    setStep('slots');
  };

  const selectDate = (date: string) => {
    setSelectedDate(date);
    setSelectedSlot(null);
    idempotencyRef.current = null;
  };

  const selectSlot = (slot: BookingSlot) => {
    setSelectedSlot(slot);
    setSelectedDate(slot.date);
    idempotencyRef.current = null;
    trackBooking(hub.id, button?.id, 'slot_selected', {
      slot_date: slot.date,
      slot_start: slot.start_time,
    });
  };

  const validatePatient = (): boolean => {
    if (name.trim().split(/\s+/).length < 2) {
      setFieldError('Informe seu nome completo.');
      return false;
    }
    if (!isPhoneVisuallyValid(phone)) {
      setFieldError('Informe um telefone válido com DDD.');
      return false;
    }
    if (!isValidCPF(cpf)) {
      setFieldError('Informe um CPF válido.');
      return false;
    }
    if (!birthDate || birthDate > todayYmdLocal() || birthDate < '1900-01-01') {
      setFieldError('Informe uma data de nascimento válida.');
      return false;
    }
    if (email.trim() && !EMAIL_PATTERN.test(email.trim())) {
      setFieldError('Informe um e-mail válido ou deixe em branco.');
      return false;
    }
    if (!privacyAccepted) {
      setFieldError('Aceite a política de privacidade para continuar.');
      return false;
    }
    setFieldError(null);
    return true;
  };

  const submitConfirm = async () => {
    if (preview) {
      setConfirmError('Prévia: o agendamento real não é enviado.');
      return;
    }
    if (!procedure || !professional || !selectedSlot) return;
    if (!privacyAccepted) {
      setConfirmError(BOOKING_PUBLIC_ERROR_MESSAGES.privacy_required);
      return;
    }
    if (!idempotencyRef.current) {
      idempotencyRef.current = createIdempotencyKey();
    }
    setSubmitting(true);
    setConfirmError(null);

    const result = await BookingService.confirm({
      slug: hub.slug,
      procedure_id: procedure.id,
      professional_id: professional.id,
      date: selectedSlot.date,
      start_time: selectedSlot.start_time,
      idempotency_key: idempotencyRef.current,
      privacy_accepted: true,
      notes: notes.trim() || undefined,
      patient: {
        name: name.trim(),
        phone: digitsOnlyPhone(phone),
        email: email.trim() || undefined,
        cpf,
        birth_date: birthDate,
        insurance: insurance.trim() || undefined,
      },
    });

    setSubmitting(false);

    if (!result.ok) {
      trackBooking(hub.id, button?.id, 'booking_failed', { code: result.code });
      if (result.code === 'booking_disabled') {
        setStep('disabled');
        return;
      }
      if (result.code === 'slot_taken') {
        setConfirmError(BOOKING_PUBLIC_ERROR_MESSAGES.slot_taken);
        setSelectedSlot(null);
        idempotencyRef.current = null;
        setStep('slots');
        void loadAvailability(procedure.id, professional.id, windowFrom, windowTo);
        return;
      }
      setConfirmError(result.error || BOOKING_PUBLIC_ERROR_MESSAGES.server_error);
      return;
    }

    trackBooking(hub.id, button?.id, 'booking_confirmed');
    setStep('done');
  };

  const stepTitle: Record<WizardStep, string> = {
    procedure: 'Escolha o procedimento',
    professional: 'Escolha o profissional',
    slots: 'Escolha data e horário',
    patient: 'Dados do paciente',
    review: 'Revise e confirme',
    done: 'Agendamento confirmado',
    disabled: 'Agendamento indisponível',
  };

  const canGoBack =
    step === 'professional' ||
    step === 'slots' ||
    step === 'patient' ||
    step === 'review';

  const stepIndex = FLOW_STEPS.indexOf(step);
  const showSummary = Boolean(procedure) && stepIndex > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={cn(
          'flex max-h-[min(90vh,100dvh)] w-[calc(100vw-1.5rem)] max-w-lg flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:rounded-2xl',
          className
        )}
        aria-describedby="booking-wizard-desc"
        onInteractOutside={(e) => {
          if (submitting || stepIndex > 0) e.preventDefault();
        }}
      >
        <DialogHeader className="space-y-0 border-b px-5 pb-4 pt-5 text-left">
          <div className="flex items-start gap-2 pr-6">
            {canGoBack ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="-ml-2 h-8 w-8 shrink-0"
                onClick={goBack}
                disabled={submitting}
                aria-label="Voltar"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            ) : null}
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg">{stepTitle[step]}</DialogTitle>
              <DialogDescription id="booking-wizard-desc" className="text-sm">
                {hub.title}
              </DialogDescription>
            </div>
          </div>
          {stepIndex >= 0 ? (
            <div className="mt-4 space-y-1.5" aria-hidden>
              <div className="flex gap-1">
                {FLOW_STEPS.map((s, i) => (
                  <span
                    key={s}
                    className={cn(
                      'h-1.5 flex-1 rounded-full transition-colors',
                      i <= stepIndex ? 'bg-primary' : 'bg-muted'
                    )}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Etapa {stepIndex + 1} de {FLOW_STEPS.length}
              </p>
            </div>
          ) : null}
        </DialogHeader>

        {showSummary && procedure ? (
          <div className="flex flex-wrap gap-1.5 border-b bg-muted/30 px-5 py-2.5 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1">
              <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              {procedure.name}
            </span>
            {professional && stepIndex > 1 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1">
                <UserRound className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                {professional.name}
              </span>
            ) : null}
            {selectedSlot && stepIndex > 2 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1">
                <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                {formatBookingDateLabel(selectedSlot.date)} · {selectedSlot.start_time}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          {step === 'disabled' ? (
            <div className="space-y-4" role="alert">
              <p className="text-sm text-muted-foreground">
                {BOOKING_PUBLIC_ERROR_MESSAGES.booking_disabled}
              </p>
              <Button type="button" className="h-12 w-full" onClick={() => handleClose(false)}>
                Voltar ao Smart Hub
              </Button>
            </div>
          ) : null}

          {step === 'procedure' ? (
            <div className="space-y-3" role="list">
              {catalogLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Carregando procedimentos…
                </div>
              ) : null}
              {!catalogLoading && catalogError ? (
                <p className="text-sm text-muted-foreground" role="alert">
                  {catalogError}
                </p>
              ) : null}
              {!catalogLoading && !catalogError && procedures.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {BOOKING_PUBLIC_ERROR_MESSAGES.catalog_empty}
                </p>
              ) : null}
              {!catalogLoading &&
                procedures.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="listitem"
                    className="flex w-full flex-col items-start gap-1 rounded-xl border bg-background p-4 text-left transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => selectProcedure(item)}
                  >
                    <span className="font-medium text-foreground">{item.name}</span>
                    <span className="text-sm text-muted-foreground">
                      Duração: {item.duration_minutes} min
                    </span>
                  </button>
                ))}
            </div>
          ) : null}

          {step === 'professional' ? (
            <div className="space-y-3" role="list">
              {(procedure?.professionals || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum profissional está disponível para este procedimento no momento.
                </p>
              ) : (
                (procedure?.professionals || []).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="listitem"
                    className="flex w-full items-center rounded-xl border bg-background p-4 text-left font-medium transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => selectProfessional(item)}
                  >
                    {item.name}
                  </button>
                ))
              )}
            </div>
          ) : null}

          {step === 'slots' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10"
                  disabled={windowFrom <= todayYmdLocal() || slotsLoading}
                  onClick={() => {
                    const prev = addDaysYmd(windowFrom, -BOOKING_INITIAL_WINDOW_DAYS);
                    setWindowFrom(prev < todayYmdLocal() ? todayYmdLocal() : prev);
                    setSelectedDate(null);
                    setSelectedSlot(null);
                    idempotencyRef.current = null;
                  }}
                  aria-label="Período anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  {formatBookingDateLabel(windowFrom)} — {formatBookingDateLabel(windowTo)}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10"
                  disabled={windowFrom >= maxFrom || slotsLoading}
                  onClick={() => {
                    const next = addDaysYmd(windowFrom, BOOKING_INITIAL_WINDOW_DAYS);
                    setWindowFrom(next > maxFrom ? maxFrom : next);
                    setSelectedDate(null);
                    setSelectedSlot(null);
                    idempotencyRef.current = null;
                  }}
                  aria-label="Próximo período"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {slotsLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Carregando horários…
                </div>
              ) : null}

              {!slotsLoading && slotsError ? (
                <p className="text-sm text-destructive" role="alert">
                  {slotsError}
                </p>
              ) : null}

              {!slotsLoading && !slotsError && daysWithSlots.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum horário disponível neste período. Tente avançar as datas.
                </p>
              ) : null}

              {!slotsLoading && daysWithSlots.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2" role="list" aria-label="Datas disponíveis">
                    {daysWithSlots.map((day) => (
                      <button
                        key={day.date}
                        type="button"
                        role="listitem"
                        className={cn(
                          'min-h-11 rounded-lg border px-3 py-2 text-sm capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          selectedDate === day.date
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'bg-background hover:border-primary'
                        )}
                        onClick={() => selectDate(day.date)}
                      >
                        {formatBookingDateLabel(day.date)}
                      </button>
                    ))}
                  </div>

                  {selectedDate ? (
                    <div
                      className="grid grid-cols-2 gap-2 sm:grid-cols-3"
                      role="list"
                      aria-label={`Horários em ${formatBookingDateLabel(selectedDate)}`}
                    >
                      {slotsForSelectedDate.map((slot) => {
                        const active =
                          selectedSlot?.date === slot.date &&
                          selectedSlot?.start_time === slot.start_time;
                        return (
                          <button
                            key={`${slot.date}-${slot.start_time}`}
                            type="button"
                            role="listitem"
                            className={cn(
                              'min-h-12 rounded-lg border px-2 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              active
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'bg-background hover:border-primary'
                            )}
                            onClick={() => selectSlot(slot)}
                          >
                            {slot.start_time}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Selecione uma data.</p>
                  )}
                </div>
              ) : null}

              {confirmError && step === 'slots' ? (
                <p className="text-sm text-destructive" role="alert">
                  {confirmError}
                </p>
              ) : null}

              <Button
                type="button"
                className="h-12 w-full"
                disabled={!selectedSlot}
                onClick={() => {
                  setConfirmError(null);
                  setStep('patient');
                }}
              >
                Continuar
              </Button>
            </div>
          ) : null}

          {step === 'patient' ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (validatePatient()) setStep('review');
              }}
            >
              <p className="text-sm text-muted-foreground">
                Preencha para concluir o agendamento e o seu cadastro na clínica.
              </p>
              <div className="space-y-2">
                <Label htmlFor="booking-name">Nome completo</Label>
                <Input
                  id="booking-name"
                  name="name"
                  autoComplete="name"
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-11"
                  required
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="booking-phone">Telefone / WhatsApp</Label>
                  <Input
                    id="booking-phone"
                    name="tel"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="(11) 99999-9999"
                    value={phone}
                    onChange={(e) => setPhone(formatPhoneMaskBr(e.target.value))}
                    className="h-11"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="booking-cpf">CPF</Label>
                  <Input
                    id="booking-cpf"
                    name="cpf"
                    inputMode="numeric"
                    placeholder="000.000.000-00"
                    value={cpf}
                    onChange={(e) => setCpf(formatCPF(e.target.value))}
                    className="h-11"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="booking-birth">Data de nascimento</Label>
                  <Input
                    id="booking-birth"
                    name="bday"
                    type="date"
                    autoComplete="bday"
                    min="1900-01-01"
                    max={todayYmdLocal()}
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="h-11"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="booking-insurance">Convênio (opcional)</Label>
                  <Input
                    id="booking-insurance"
                    name="insurance"
                    maxLength={120}
                    placeholder="Particular"
                    value={insurance}
                    onChange={(e) => setInsurance(e.target.value)}
                    className="h-11"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="booking-email">E-mail (opcional)</Label>
                <Input
                  id="booking-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="booking-notes">Observações (opcional)</Label>
                <Textarea
                  id="booking-notes"
                  name="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex items-start gap-3 rounded-lg border p-3">
                <Checkbox
                  id="booking-privacy"
                  checked={privacyAccepted}
                  onCheckedChange={(v) => setPrivacyAccepted(v === true)}
                  className="mt-1"
                />
                <Label htmlFor="booking-privacy" className="text-sm font-normal leading-snug">
                  {capture.privacy_text ||
                    'Autorizo o uso dos meus dados para contato e atendimento pela clínica.'}
                  {capture.privacy_url ? (
                    <>
                      {' '}
                      <a
                        href={capture.privacy_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        Saiba mais
                      </a>
                    </>
                  ) : null}
                </Label>
              </div>
              {fieldError ? (
                <p className="text-sm text-destructive" role="alert">
                  {fieldError}
                </p>
              ) : null}
              <Button type="submit" className="h-12 w-full">
                Revisar agendamento
              </Button>
            </form>
          ) : null}

          {step === 'review' ? (
            <div className="space-y-4">
              <section className="space-y-3 rounded-xl border p-4">
                <h3 className="text-sm font-semibold">Agendamento</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Procedimento</dt>
                    <dd className="font-medium">{procedure?.name}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Profissional</dt>
                    <dd className="font-medium">{professional?.name}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Data</dt>
                    <dd className="font-medium first-letter:uppercase">
                      {selectedSlot ? formatBookingDateLabel(selectedSlot.date) : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Horário</dt>
                    <dd className="font-medium">
                      {selectedSlot
                        ? formatBookingTimeRange(selectedSlot.start_time, selectedSlot.end_time)
                        : '—'}
                    </dd>
                  </div>
                </dl>
              </section>
              <section className="space-y-3 rounded-xl border p-4">
                <h3 className="text-sm font-semibold">Paciente</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div className="col-span-2">
                    <dt className="text-muted-foreground">Nome</dt>
                    <dd className="font-medium">{name}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Telefone</dt>
                    <dd className="font-medium">{phone}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">CPF</dt>
                    <dd className="font-medium">{cpf}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Nascimento</dt>
                    <dd className="font-medium">{formatBirthDate(birthDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Convênio</dt>
                    <dd className="font-medium">{insurance.trim() || 'Particular'}</dd>
                  </div>
                  {email.trim() ? (
                    <div className="col-span-2">
                      <dt className="text-muted-foreground">E-mail</dt>
                      <dd className="break-all font-medium">{email}</dd>
                    </div>
                  ) : null}
                </dl>
              </section>
              {confirmError ? (
                <p className="text-sm text-destructive" role="alert">
                  {confirmError}
                </p>
              ) : null}
              <Button
                type="button"
                className="h-12 w-full"
                disabled={submitting}
                onClick={() => void submitConfirm()}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    Confirmando…
                  </>
                ) : (
                  'Confirmar agendamento'
                )}
              </Button>
            </div>
          ) : null}

          {step === 'done' ? (
            <div className="space-y-5">
              <div className="flex flex-col items-center gap-2 text-center">
                <CheckCircle2 className="h-12 w-12 text-emerald-600" aria-hidden />
                <p className="text-base font-semibold text-foreground">
                  Agendamento confirmado com sucesso!
                </p>
                <p className="text-sm text-muted-foreground">
                  Te esperamos, {name.trim().split(/\s+/)[0]}.
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border p-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Procedimento</dt>
                  <dd className="font-medium">{procedure?.name}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Profissional</dt>
                  <dd className="font-medium">{professional?.name}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Data</dt>
                  <dd className="font-medium first-letter:uppercase">
                    {selectedSlot ? formatBookingDateLabel(selectedSlot.date) : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Horário</dt>
                  <dd className="font-medium">
                    {selectedSlot
                      ? formatBookingTimeRange(selectedSlot.start_time, selectedSlot.end_time)
                      : '—'}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Clínica</dt>
                  <dd className="font-medium">{hub.title}</dd>
                </div>
              </dl>
              <Button type="button" className="h-12 w-full" onClick={() => handleClose(false)}>
                Voltar ao Smart Hub
              </Button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
