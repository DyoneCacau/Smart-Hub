/**
 * Agendamento online público do Smart Hub (Fase B).
 *
 * Deploy: `npx supabase functions deploy smart-hub-booking --no-verify-jwt`
 *
 * Ações: `availability` | `confirm` | `catalog`
 * O clinic_id NUNCA vem do cliente — resolve pelo slug do Hub.
 */
import { serviceClient } from '../_shared/integrations.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { HttpError } from '../_shared/httpError.ts'
import { assertRateLimit } from '../_shared/rateLimit.ts'
import { assertClinicModules } from '../_shared/clinicAccess.ts'
import { ingestLead } from '../_shared/leads.ts'
import { newRequestId } from '../_shared/smartHubCaptureResolve.ts'
import {
  BOOKING_TIMEZONE,
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  addMinutesToTime,
  computeAvailableSlots,
  isSlotAvailable,
  normalizePhoneDigits,
  normalizeTime,
  validateAvailabilityWindow,
} from '../_shared/smartHubBookingSlots.ts'

const MAX_BODY_BYTES = 50_000
const RATE_LIMIT = 30
const RATE_WINDOW_MS = 60_000

type Json = Record<string, unknown>

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

function asString(value: unknown, max = 500): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function asUuid(value: unknown): string | null {
  const text = asString(value, 80)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) {
    return null
  }
  return text
}

function logBooking(level: 'info' | 'warn' | 'error', payload: Json): void {
  const line = JSON.stringify({
    scope: 'smart-hub-booking',
    level,
    ts: new Date().toISOString(),
    ...payload,
  })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

interface ResolvedHub {
  id: string
  clinic_id: string
  slug: string
  title: string
  status: string
  public_booking_enabled: boolean
  deleted_at: string | null
}

async function resolveHubBySlug(
  supabase: ReturnType<typeof serviceClient>,
  slug: string,
): Promise<ResolvedHub> {
  const { data, error } = await supabase
    .from('smart_hubs')
    .select('id, clinic_id, slug, title, status, public_booking_enabled, deleted_at')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) {
    logBooking('error', { step: 'resolve_hub', code: error.code, message: error.message })
    throw new HttpError(500, 'Erro ao carregar Hub', 'internal_error')
  }
  if (!data) throw new HttpError(404, 'Hub não encontrado', 'hub_not_found')
  return data as ResolvedHub
}

function assertHubBookable(hub: ResolvedHub): void {
  if (hub.status !== 'published') {
    throw new HttpError(400, 'Agendamento online indisponível', 'booking_disabled')
  }
  if (!hub.public_booking_enabled) {
    throw new HttpError(400, 'Agendamento online desabilitado', 'booking_disabled')
  }
}

async function loadProcedure(
  supabase: ReturnType<typeof serviceClient>,
  clinicId: string,
  procedureId: string,
) {
  const { data, error } = await supabase
    .from('clinic_procedures')
    .select('id, clinic_id, name, duration_minutes, is_active')
    .eq('id', procedureId)
    .eq('clinic_id', clinicId)
    .maybeSingle()

  if (error) {
    logBooking('error', { step: 'load_procedure', code: error.code })
    throw new HttpError(500, 'Erro ao carregar procedimento', 'internal_error')
  }
  if (!data || data.is_active === false) {
    throw new HttpError(404, 'Procedimento não encontrado', 'procedure_not_found')
  }
  const duration = Number(data.duration_minutes)
  if (
    !Number.isFinite(duration) ||
    duration < MIN_DURATION_MINUTES ||
    duration > MAX_DURATION_MINUTES
  ) {
    throw new HttpError(400, 'Duração do procedimento inválida', 'invalid_payload')
  }
  return {
    id: String(data.id),
    name: String(data.name),
    duration_minutes: duration,
  }
}

async function loadProfessional(
  supabase: ReturnType<typeof serviceClient>,
  clinicId: string,
  professionalId: string,
) {
  const { data, error } = await supabase
    .from('professionals')
    .select('id, clinic_id, name, is_active, performs_all_procedures')
    .eq('id', professionalId)
    .eq('clinic_id', clinicId)
    .maybeSingle()

  if (error) {
    logBooking('error', { step: 'load_professional', code: error.code })
    throw new HttpError(500, 'Erro ao carregar profissional', 'internal_error')
  }
  if (!data || data.is_active === false) {
    throw new HttpError(404, 'Profissional não encontrado', 'professional_not_found')
  }
  return {
    id: String(data.id),
    name: String(data.name),
    performs_all_procedures: data.performs_all_procedures !== false,
  }
}

/** Confirma no servidor se o profissional pode realizar o procedimento. */
async function assertProfessionalEligible(
  supabase: ReturnType<typeof serviceClient>,
  clinicId: string,
  professionalId: string,
  procedureId: string,
) {
  const professional = await loadProfessional(supabase, clinicId, professionalId)
  if (professional.performs_all_procedures) {
    return { id: professional.id, name: professional.name }
  }

  const { data: link, error } = await supabase
    .from('professional_procedures')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('professional_id', professionalId)
    .eq('procedure_id', procedureId)
    .maybeSingle()

  if (error) {
    logBooking('error', { step: 'assert_professional_eligible', code: error.code })
    throw new HttpError(500, 'Erro ao validar profissional', 'internal_error')
  }
  if (!link) {
    throw new HttpError(
      400,
      'Profissional não habilitado para este procedimento',
      'professional_not_eligible',
    )
  }
  return { id: professional.id, name: professional.name }
}

async function loadScheduleContext(
  supabase: ReturnType<typeof serviceClient>,
  clinicId: string,
  professionalId: string,
  fromDate: string,
  toDate: string,
) {
  const [periodsRes, blocksRes, apptsRes] = await Promise.all([
    supabase
      .from('professional_work_schedules')
      .select('weekday, start_time, end_time, is_active')
      .eq('clinic_id', clinicId)
      .eq('professional_id', professionalId)
      .eq('is_active', true),
    supabase
      .from('schedule_blocks')
      .select('block_date, start_time, end_time, all_day, is_active, professional_id')
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
      .gte('block_date', fromDate)
      .lte('block_date', toDate)
      .or(`professional_id.eq.${professionalId},professional_id.is.null`),
    supabase
      .from('appointments')
      .select('date, start_time, end_time, status, professional_id')
      .eq('clinic_id', clinicId)
      .eq('professional_id', professionalId)
      .gte('date', fromDate)
      .lte('date', toDate),
  ])

  if (periodsRes.error || blocksRes.error || apptsRes.error) {
    logBooking('error', {
      step: 'load_schedule_context',
      periods: periodsRes.error?.message ?? null,
      blocks: blocksRes.error?.message ?? null,
      appts: apptsRes.error?.message ?? null,
    })
    throw new HttpError(500, 'Erro ao carregar disponibilidade', 'internal_error')
  }

  return {
    work_periods: (periodsRes.data || []).map((p) => ({
      weekday: Number(p.weekday),
      start_time: String(p.start_time),
      end_time: String(p.end_time),
      is_active: p.is_active !== false,
    })),
    blocks: (blocksRes.data || []).map((b) => ({
      block_date: String(b.block_date),
      start_time: b.start_time ? String(b.start_time) : null,
      end_time: b.end_time ? String(b.end_time) : null,
      all_day: b.all_day === true,
      is_active: b.is_active !== false,
      professional_id: b.professional_id ? String(b.professional_id) : null,
    })),
    appointments: (apptsRes.data || []).map((a) => ({
      date: String(a.date),
      start_time: String(a.start_time),
      end_time: String(a.end_time),
      status: String(a.status),
      professional_id: String(a.professional_id),
    })),
  }
}

async function findOrCreatePatient(
  supabase: ReturnType<typeof serviceClient>,
  clinicId: string,
  patient: { name: string; phone: string; email?: string },
): Promise<{ patientId: string; duplicate: boolean }> {
  const digits = normalizePhoneDigits(patient.phone)
  if (digits.length < 10) {
    throw new HttpError(400, 'Telefone inválido', 'invalid_payload')
  }

  const { data: matches, error } = await supabase.rpc('find_clinic_patient_by_phone', {
    p_clinic_id: clinicId,
    p_phone: digits,
  })

  if (error) {
    logBooking('error', { step: 'find_patient', code: error.code })
    throw new HttpError(500, 'Erro ao localizar paciente', 'internal_error')
  }

  const match = Array.isArray(matches) && matches.length > 0
    ? (matches[0] as { id: string; name: string | null; phone: string | null; email: string | null })
    : null

  if (match?.id) {
    const patch: Json = {}
    if ((!match.email || !String(match.email).trim()) && patient.email) {
      patch.email = patient.email
    }
    if ((!match.name || !String(match.name).trim()) && patient.name) {
      patch.name = patient.name
    }
    if (Object.keys(patch).length > 0) {
      await supabase.from('patients').update(patch).eq('id', match.id).eq('clinic_id', clinicId)
    }
    return { patientId: String(match.id), duplicate: true }
  }

  const insertPayload = {
    id: crypto.randomUUID(),
    clinic_id: clinicId,
    name: patient.name,
    phone: digits,
    email: patient.email || null,
    status: 'active',
    lead_source: 'smart_hub',
  }

  const { data: created, error: insertError } = await supabase
    .from('patients')
    .insert(insertPayload)
    .select('id')
    .maybeSingle()

  if (insertError || !created) {
    logBooking('error', { step: 'create_patient', code: insertError?.code })
    throw new HttpError(500, 'Erro ao criar paciente', 'internal_error')
  }

  return { patientId: String(created.id), duplicate: false }
}

function bookingFingerprintMatches(
  existing: {
    date?: unknown
    start_time?: unknown
    end_time?: unknown
    professional_id?: unknown
    procedure_id?: unknown
  },
  expected: {
    date: string
    start_time: string
    end_time: string
    professional_id: string
    procedure_id: string
  },
): boolean {
  return (
    String(existing.date || '') === expected.date &&
    normalizeTime(String(existing.start_time || '')) === expected.start_time &&
    normalizeTime(String(existing.end_time || '')) === expected.end_time &&
    String(existing.professional_id || '') === expected.professional_id &&
    String(existing.procedure_id || '') === expected.procedure_id
  )
}

async function handleCatalog(
  req: Request,
  supabase: ReturnType<typeof serviceClient>,
  body: Json,
  requestId: string,
): Promise<Response> {
  const slug = asString(body.slug, 120).toLowerCase()
  if (!slug) {
    throw new HttpError(400, 'Payload inválido', 'invalid_payload')
  }

  if ('clinic_id' in body) {
    logBooking('warn', { step: 'catalog', note: 'clinic_id_ignored', request_id: requestId })
  }

  const hub = await resolveHubBySlug(supabase, slug)
  assertHubBookable(hub)
  await assertClinicModules(supabase, hub.clinic_id, ['smart_hub', 'agenda'])

  const [procRes, profRes, linksRes] = await Promise.all([
    supabase
      .from('clinic_procedures')
      .select('id, name, duration_minutes, is_active')
      .eq('clinic_id', hub.clinic_id)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('professionals')
      .select('id, name, is_active, performs_all_procedures')
      .eq('clinic_id', hub.clinic_id)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('professional_procedures')
      .select('professional_id, procedure_id')
      .eq('clinic_id', hub.clinic_id),
  ])

  if (procRes.error || profRes.error || linksRes.error) {
    logBooking('error', {
      step: 'catalog',
      request_id: requestId,
      procedures: procRes.error?.message ?? null,
      professionals: profRes.error?.message ?? null,
      links: linksRes.error?.message ?? null,
    })
    throw new HttpError(500, 'Erro ao carregar catálogo', 'internal_error')
  }

  const activeProfessionals = (profRes.data || [])
    .filter((p) => p.is_active !== false)
    .map((p) => ({
      id: String(p.id),
      name: String(p.name),
      performs_all_procedures: p.performs_all_procedures !== false,
    }))

  const linksByProfessional = new Map<string, Set<string>>()
  for (const row of linksRes.data || []) {
    const profId = String(row.professional_id)
    const procId = String(row.procedure_id)
    const set = linksByProfessional.get(profId) || new Set<string>()
    set.add(procId)
    linksByProfessional.set(profId, set)
  }

  const procedures = (procRes.data || [])
    .filter((p) => p.is_active !== false)
    .map((p) => {
      const duration = Number(p.duration_minutes)
      const duration_minutes =
        Number.isFinite(duration) && duration >= MIN_DURATION_MINUTES
          ? duration
          : 30
      const procedureId = String(p.id)
      const professionals = activeProfessionals
        .filter((prof) => {
          if (prof.performs_all_procedures) return true
          return linksByProfessional.get(prof.id)?.has(procedureId) === true
        })
        .map((prof) => ({ id: prof.id, name: prof.name }))

      return {
        id: procedureId,
        name: String(p.name),
        duration_minutes,
        professionals,
      }
    })
    .filter(
      (p) =>
        p.duration_minutes >= MIN_DURATION_MINUTES &&
        p.duration_minutes <= MAX_DURATION_MINUTES,
    )

  return json(req, {
    booking_enabled: true,
    procedures,
    request_id: requestId,
  })
}

async function handleAvailability(
  req: Request,
  supabase: ReturnType<typeof serviceClient>,
  body: Json,
  requestId: string,
): Promise<Response> {
  const slug = asString(body.slug, 120).toLowerCase()
  const procedureId = asUuid(body.procedure_id)
  const professionalId = asUuid(body.professional_id)
  const fromDate = asString(body.from_date, 20)
  const toDate = asString(body.to_date, 20)

  if (!slug || !procedureId || !professionalId || !fromDate || !toDate) {
    throw new HttpError(400, 'Payload inválido', 'invalid_payload')
  }

  // Ignora clinic_id forjado pelo cliente, se enviado
  if ('clinic_id' in body) {
    logBooking('warn', { step: 'availability', note: 'clinic_id_ignored', request_id: requestId })
  }

  const window = validateAvailabilityWindow({ from_date: fromDate, to_date: toDate })
  if (!window.ok) {
    throw new HttpError(400, window.message, window.code)
  }

  const hub = await resolveHubBySlug(supabase, slug)
  assertHubBookable(hub)
  await assertClinicModules(supabase, hub.clinic_id, ['smart_hub', 'agenda'])

  const procedure = await loadProcedure(supabase, hub.clinic_id, procedureId)
  const professional = await assertProfessionalEligible(
    supabase,
    hub.clinic_id,
    professionalId,
    procedureId,
  )
  const ctx = await loadScheduleContext(
    supabase,
    hub.clinic_id,
    professional.id,
    window.from_date,
    window.to_date,
  )

  const slots = computeAvailableSlots({
    from_date: window.from_date,
    to_date: window.to_date,
    duration_minutes: procedure.duration_minutes,
    professional_id: professional.id,
    work_periods: ctx.work_periods,
    blocks: ctx.blocks,
    appointments: ctx.appointments,
  })

  return json(req, {
    booking_enabled: true,
    procedure,
    professional,
    timezone: BOOKING_TIMEZONE,
    slots,
    request_id: requestId,
  })
}

async function handleConfirm(
  req: Request,
  supabase: ReturnType<typeof serviceClient>,
  body: Json,
  requestId: string,
): Promise<Response> {
  const slug = asString(body.slug, 120).toLowerCase()
  const procedureId = asUuid(body.procedure_id)
  const professionalId = asUuid(body.professional_id)
  const date = asString(body.date, 20)
  const startTimeRaw = asString(body.start_time, 16)
  const idempotencyKey = asString(body.idempotency_key, 120)
  const notes = asString(body.notes, 1500) || null
  const privacyAccepted = body.privacy_accepted === true

  const patientObj = (body.patient && typeof body.patient === 'object'
    ? body.patient
    : {}) as Json
  const patientName = asString(patientObj.name, 200)
  const patientPhone = asString(patientObj.phone, 40)
  const patientEmail = asString(patientObj.email, 200) || undefined

  if ('clinic_id' in body) {
    logBooking('warn', { step: 'confirm', note: 'clinic_id_ignored', request_id: requestId })
  }

  if (!privacyAccepted) {
    throw new HttpError(400, 'É necessário aceitar a privacidade', 'privacy_required')
  }
  if (!slug || !procedureId || !professionalId || !date || !startTimeRaw || !idempotencyKey) {
    throw new HttpError(400, 'Payload inválido', 'invalid_payload')
  }
  if (idempotencyKey.length < 8) {
    throw new HttpError(400, 'idempotency_key inválida', 'invalid_payload')
  }
  if (!patientName || !patientPhone) {
    throw new HttpError(400, 'Nome e telefone são obrigatórios', 'invalid_payload')
  }

  const startTime = normalizeTime(startTimeRaw)
  if (!/^\d{2}:\d{2}$/.test(startTime)) {
    throw new HttpError(400, 'Horário inválido', 'invalid_payload')
  }

  const dateCheck = validateAvailabilityWindow({ from_date: date, to_date: date })
  if (!dateCheck.ok) {
    throw new HttpError(400, dateCheck.message, dateCheck.code)
  }

  const hub = await resolveHubBySlug(supabase, slug)
  assertHubBookable(hub)
  await assertClinicModules(supabase, hub.clinic_id, ['smart_hub', 'agenda', 'crm'])

  // Idempotência antecipada (antes de criar paciente)
  const { data: existingByKey } = await supabase
    .from('appointments')
    .select(
      'id, patient_id, status, date, start_time, end_time, professional_id, procedure_id, booking_idempotency_key',
    )
    .eq('clinic_id', hub.clinic_id)
    .eq('booking_idempotency_key', idempotencyKey)
    .maybeSingle()

  // end_time preliminar: precisa do procedure; se já existe chave, valida fingerprint parcial
  // e só depois carrega procedure para confirmar duração.
  if (existingByKey) {
    const procedureEarly = await loadProcedure(supabase, hub.clinic_id, procedureId)
    const endTimeEarly = addMinutesToTime(startTime, procedureEarly.duration_minutes)
    const sameSlot = bookingFingerprintMatches(existingByKey, {
      date,
      start_time: startTime,
      end_time: endTimeEarly,
      professional_id: professionalId,
      procedure_id: procedureId,
    })

    if (!sameSlot) {
      throw new HttpError(
        409,
        'Chave de idempotência já usada com outro agendamento',
        'idempotency_conflict',
      )
    }

    return json(req, {
      success: true,
      appointment_id: existingByKey.id,
      status: existingByKey.status,
      patient_id: existingByKey.patient_id,
      duplicate_patient: true,
      duplicate_lead: true,
      slot: {
        date: String(existingByKey.date),
        start_time: normalizeTime(String(existingByKey.start_time)),
        end_time: normalizeTime(String(existingByKey.end_time)),
        professional_id: String(existingByKey.professional_id),
      },
      request_id: requestId,
    }, 200)
  }

  const procedure = await loadProcedure(supabase, hub.clinic_id, procedureId)
  const professional = await assertProfessionalEligible(
    supabase,
    hub.clinic_id,
    professionalId,
    procedureId,
  )
  const endTime = addMinutesToTime(startTime, procedure.duration_minutes)

  const ctx = await loadScheduleContext(
    supabase,
    hub.clinic_id,
    professional.id,
    date,
    date,
  )

  const okSlot = isSlotAvailable({
    date,
    start_time: startTime,
    end_time: endTime,
    duration_minutes: procedure.duration_minutes,
    professional_id: professional.id,
    work_periods: ctx.work_periods,
    blocks: ctx.blocks,
    appointments: ctx.appointments,
  })

  if (!okSlot) {
    // Distinguir fora da jornada vs ocupado
    const inSchedule = computeAvailableSlots({
      from_date: date,
      to_date: date,
      duration_minutes: procedure.duration_minutes,
      professional_id: professional.id,
      work_periods: ctx.work_periods,
      blocks: [],
      appointments: [],
    }).some((s) => s.start_time === startTime)

    if (!inSchedule) {
      throw new HttpError(400, 'Horário fora da jornada', 'outside_work_schedule')
    }
    throw new HttpError(409, 'Horário indisponível', 'slot_taken')
  }

  const { patientId, duplicate: duplicatePatient } = await findOrCreatePatient(
    supabase,
    hub.clinic_id,
    { name: patientName, phone: patientPhone, email: patientEmail },
  )

  const startTimeDb = `${startTime}:00`
  const endTimeDb = `${endTime}:00`
  const noteParts = [
    notes,
    `Agendamento online Smart Hub (${hub.slug})`,
    `Procedimento: ${procedure.name}`,
    `Profissional: ${professional.name}`,
  ].filter(Boolean)

  const { data: booked, error: bookError } = await supabase.rpc(
    'insert_smart_hub_booking_appointment',
    {
      p_clinic_id: hub.clinic_id,
      p_patient_id: patientId,
      p_professional_id: professional.id,
      p_procedure: procedure.name,
      p_procedure_id: procedure.id,
      p_date: date,
      p_start_time: startTimeDb,
      p_end_time: endTimeDb,
      p_notes: noteParts.join('\n'),
      p_idempotency_key: idempotencyKey,
      p_lead_source: 'smart_hub',
    },
  )

  if (bookError) {
    const msg = (bookError.message || '').toLowerCase()
    if (bookError.code === '23P01' || msg.includes('slot_taken') || msg.includes('conflito')) {
      throw new HttpError(409, 'Horário indisponível', 'slot_taken')
    }
    if (bookError.code === '23505' || msg.includes('idempotency_conflict')) {
      const { data: again } = await supabase
        .from('appointments')
        .select(
          'id, patient_id, status, date, start_time, end_time, professional_id, procedure_id',
        )
        .eq('clinic_id', hub.clinic_id)
        .eq('booking_idempotency_key', idempotencyKey)
        .maybeSingle()
      if (
        again &&
        bookingFingerprintMatches(again, {
          date,
          start_time: startTime,
          end_time: endTime,
          professional_id: professional.id,
          procedure_id: procedure.id,
        })
      ) {
        return json(req, {
          success: true,
          appointment_id: again.id,
          status: again.status,
          patient_id: again.patient_id,
          duplicate_patient: true,
          duplicate_lead: true,
          slot: {
            date: String(again.date),
            start_time: normalizeTime(String(again.start_time)),
            end_time: normalizeTime(String(again.end_time)),
            professional_id: String(again.professional_id),
          },
          request_id: requestId,
        }, 200)
      }
      throw new HttpError(409, 'Conflito de idempotência', 'idempotency_conflict')
    }
    logBooking('error', {
      step: 'insert_appointment',
      code: bookError.code,
      message: bookError.message,
      request_id: requestId,
    })
    throw new HttpError(500, 'Erro ao criar agendamento', 'internal_error')
  }

  const bookedRow = booked as Json
  const appointmentId = String(bookedRow.appointment_id)
  const created = bookedRow.created === true

  if (!created) {
    if (
      !bookingFingerprintMatches(bookedRow, {
        date,
        start_time: startTime,
        end_time: endTime,
        professional_id: professional.id,
        procedure_id: procedure.id,
      })
    ) {
      throw new HttpError(409, 'Conflito de idempotência', 'idempotency_conflict')
    }

    return json(req, {
      success: true,
      appointment_id: appointmentId,
      status: String(bookedRow.status || 'confirmed'),
      patient_id: String(bookedRow.patient_id || patientId),
      duplicate_patient: true,
      duplicate_lead: true,
      slot: {
        date: String(bookedRow.date || date),
        start_time: normalizeTime(String(bookedRow.start_time || startTime)),
        end_time: normalizeTime(String(bookedRow.end_time || endTime)),
        professional_id: String(bookedRow.professional_id || professional.id),
      },
      request_id: requestId,
    }, 200)
  }

  // CRM: após appointment. Se falhar, compensa removendo o appointment recém-criado.
  let leadId: string | undefined
  let duplicateLead = false

  try {
    const utm =
      body.utm && typeof body.utm === 'object' ? (body.utm as Record<string, unknown>) : {}

    const leadResult = await ingestLead(supabase, {
      clinicId: hub.clinic_id,
      integrationId: null,
      provider: 'smart_hub',
      defaultLeadSource: 'smart_hub',
      dedupe: 'auto',
      payload: {
        name: patientName,
        phone: patientPhone,
        email: patientEmail || null,
        source: 'smart_hub',
        interest: procedure.name,
        notes: noteParts.join('\n'),
        stage: 'scheduled',
        source_detail: 'smart_hub_booking',
        hub_id: hub.id,
        hub_slug: hub.slug,
        procedure_id: procedure.id,
        procedure_name: procedure.name,
        professional_id: professional.id,
        professional_name: professional.name,
        appointment_id: appointmentId,
        appointment_date: date,
        appointment_start_time: startTime,
        appointment_end_time: endTime,
        utm_source: asString(utm.utm_source, 120) || null,
        utm_medium: asString(utm.utm_medium, 120) || null,
        utm_campaign: asString(utm.utm_campaign, 120) || null,
      },
    })

    leadId = leadResult.leadId
    duplicateLead = leadResult.duplicate

    await supabase
      .from('crm_leads')
      .update({
        appointment_id: appointmentId,
        patient_id: patientId,
        stage: 'scheduled',
      })
      .eq('id', leadResult.leadId)
      .eq('clinic_id', hub.clinic_id)
  } catch (leadErr) {
    logBooking('error', {
      step: 'ingest_lead',
      request_id: requestId,
      message: leadErr instanceof Error ? leadErr.message : 'lead_failed',
    })
    await supabase
      .from('appointments')
      .delete()
      .eq('id', appointmentId)
      .eq('clinic_id', hub.clinic_id)
      .eq('booking_idempotency_key', idempotencyKey)
    throw new HttpError(500, 'Erro ao registrar lead do agendamento', 'internal_error')
  }

  // Notificação interna (fail-soft). Só no create real — retry idempotente não chega aqui.
  try {
    const dateLabel = (() => {
      const [y, m, d] = date.split('-')
      if (!y || !m || !d) return date
      return `${d}/${m}/${y}`
    })()
    const timeLabel = normalizeTime(startTime)
    const notifyMessage = `${patientName} agendou ${procedure.name} com ${professional.name} para ${dateLabel} às ${timeLabel}.`
    // Nome/procedimento/profissional: procedure e professional vêm do banco
    // (assertProcedure/assertProfessional). patientName já sanitizado no confirm.
    const { error: notifyError } = await supabase.rpc(
      'notify_clinic_users_on_smart_hub_booking',
      {
        p_clinic_id: hub.clinic_id,
        p_title: 'Novo agendamento online',
        p_message: notifyMessage,
        p_reference_id: appointmentId,
        p_metadata: {
          clinic_id: hub.clinic_id,
          appointment_id: appointmentId,
          patient_id: patientId,
          professional_id: professional.id,
          date,
          start_time: startTime,
          source: 'smart_hub',
        },
      },
    )
    if (notifyError) {
      logBooking('warn', {
        step: 'notify_clinic',
        request_id: requestId,
        // Sem PII: só códigos técnicos
        message: notifyError.message,
        code: notifyError.code,
      })
    }
  } catch (notifyErr) {
    logBooking('warn', {
      step: 'notify_clinic',
      request_id: requestId,
      message: notifyErr instanceof Error ? notifyErr.message : 'notify_failed',
    })
  }

  return json(
    req,
    {
      success: true,
      appointment_id: appointmentId,
      status: 'confirmed',
      patient_id: patientId,
      lead_id: leadId,
      duplicate_patient: duplicatePatient,
      duplicate_lead: duplicateLead,
      slot: {
        date,
        start_time: startTime,
        end_time: endTime,
        professional_id: professional.id,
      },
      request_id: requestId,
    },
    201,
  )
}

Deno.serve(async (req) => {
  const options = handleOptions(req)
  if (options) return options

  const requestId = newRequestId()

  if (req.method !== 'POST') {
    return json(
      req,
      {
        ok: false,
        code: 'method_not_allowed',
        message: 'Método não permitido',
        request_id: requestId,
      },
      405,
    )
  }

  let slugForLog = ''
  let actionForLog = ''

  try {
    const contentLength = Number(req.headers.get('content-length') || 0)
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      throw new HttpError(413, 'Payload muito grande', 'payload_too_large')
    }

    const raw = await req.text()
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      throw new HttpError(413, 'Payload muito grande', 'payload_too_large')
    }

    let body: Json
    try {
      body = JSON.parse(raw || '{}') as Json
    } catch {
      throw new HttpError(400, 'JSON inválido', 'invalid_payload')
    }

    // Honeypot
    if (asString(body.website) || asString(body.company_url)) {
      return json(req, {
        success: true,
        booking_enabled: true,
        slots: [],
        request_id: requestId,
      })
    }

    const action = asString(body.action, 40) || 'availability'
    actionForLog = action
    const slug = asString(body.slug, 120).toLowerCase()
    slugForLog = slug

    const ip =
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      'unknown'

    try {
      assertRateLimit(`sh-booking:${slug || 'na'}:${ip}`, RATE_LIMIT, RATE_WINDOW_MS)
    } catch (err) {
      if (err instanceof HttpError) {
        throw new HttpError(429, 'Muitas tentativas. Aguarde um momento.', 'rate_limited')
      }
      throw err
    }

    const supabase = serviceClient()

    if (action === 'availability') {
      return await handleAvailability(req, supabase, body, requestId)
    }
    if (action === 'confirm') {
      return await handleConfirm(req, supabase, body, requestId)
    }
    if (action === 'catalog') {
      return await handleCatalog(req, supabase, body, requestId)
    }

    throw new HttpError(400, 'Ação inválida', 'invalid_payload')
  } catch (err) {
    if (err instanceof HttpError) {
      logBooking('warn', {
        request_id: requestId,
        slug: slugForLog,
        action: actionForLog,
        code: err.code,
        status: err.status,
      })
      return json(
        req,
        {
          ok: false,
          success: false,
          code: err.code || 'error',
          message: err.message,
          error: err.message,
          request_id: requestId,
        },
        err.status,
      )
    }

    logBooking('error', {
      request_id: requestId,
      slug: slugForLog,
      action: actionForLog,
      message: err instanceof Error ? err.message : 'unknown',
    })
    return json(
      req,
      {
        ok: false,
        success: false,
        code: 'internal_error',
        message: 'Erro interno',
        error: 'Erro interno',
        request_id: requestId,
      },
      500,
    )
  }
})
