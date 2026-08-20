import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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

  const handleClose = (next: boolean) => {
    if (!next) {
      if (submitting) return;
      resetFlow();
    }
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
    if (!name.trim()) {
      setFieldError('Informe seu nome.');
      return false;
    }
    if (!isPhoneVisuallyValid(phone)) {
      setFieldError('Informe um telefone válido com DDD.');
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
    patient: 'Seus dados',
    review: 'Revise e confirme',
    done: 'Agendamento confirmado',
    disabled: 'Agendamento indisponível',
  };

  const canGoBack =
    step === 'professional' ||
    step === 'slots' ||
    step === 'patient' ||
    step === 'review';

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent
        side="bottom"
        className={cn(
          'mx-auto flex max-h-[92vh] w-full max-w-lg flex-col gap-0 overflow-hidden rounded-t-2xl p-0 sm:max-w-lg',
          className
        )}
        aria-describedby="booking-wizard-desc"
      >
        <SheetHeader className="border-b px-4 py-4 text-left">
          <div className="flex items-start gap-2">
            {canGoBack ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-0.5 shrink-0"
                onClick={goBack}
                disabled={submitting}
                aria-label="Voltar"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            ) : null}
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-lg">{stepTitle[step]}</SheetTitle>
              <SheetDescription id="booking-wizard-desc" className="text-sm">
                {hub.title}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4">
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
              <div className="space-y-2">
                <Label htmlFor="booking-name">Nome</Label>
                <Input
                  id="booking-name"
                  name="name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-12"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="booking-phone">Telefone / WhatsApp</Label>
                <Input
                  id="booking-phone"
                  name="tel"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(formatPhoneMaskBr(e.target.value))}
                  className="h-12"
                  required
                />
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
                  className="h-12"
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
              <dl className="space-y-3 text-sm">
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
                  <dd className="font-medium capitalize">
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
                <div>
                  <dt className="text-muted-foreground">Nome</dt>
                  <dd className="font-medium">{name}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Telefone</dt>
                  <dd className="font-medium">{phone}</dd>
                </div>
                {email.trim() ? (
                  <div>
                    <dt className="text-muted-foreground">E-mail</dt>
                    <dd className="font-medium">{email}</dd>
                  </div>
                ) : null}
              </dl>
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
            <div className="space-y-4">
              <p className="text-base font-medium text-foreground">
                Agendamento confirmado com sucesso.
              </p>
              <dl className="space-y-3 text-sm">
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
                  <dd className="font-medium capitalize">
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
                <div>
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
      </SheetContent>
    </Sheet>
  );
}
