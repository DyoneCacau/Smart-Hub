import { Clinic } from './clinic';

export interface Professional {
  id: string;
  name: string;
  specialty: string;
  cro: string; // Only CRO for dentistry
}

export type LeadSource = 'instagram' | 'whatsapp' | 'facebook' | 'referral' | 'paid_traffic' | 'other' | 'smart_hub';

export const leadSourceLabels: Record<LeadSource, string> = {
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  referral: 'Indicação',
  paid_traffic: 'Tráfego Pago',
  other: 'Outros',
  smart_hub: 'Smart Hub',
};

export interface AgendaAppointment {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  patientId: string;
  patientName: string;
  patientPhone?: string;
  professional: Professional;
  procedure: string;
  /** Catálogo atual; ausente em agendamentos antigos/personalizados. */
  procedureId?: string | null;
  /** Preço sugerido no momento do agendamento (snapshot editável no fechamento). */
  procedurePrice?: number | null;
  status: 'confirmed' | 'pending' | 'return' | 'completed' | 'cancelled' | 'no_show';
  paymentStatus: 'paid' | 'pending' | 'partial' | 'refunded';
  notes?: string;
  clinic: Clinic;
  // New fields for seller tracking
  sellerId?: string;
  sellerName?: string;
  leadSource?: LeadSource;
  /** Nome de quem indicou (quando leadSource = Indicação). Usado em bonificações. */
  referralName?: string | null;
  /** Sinal/taxa de agendamento (ex: R$50). Entra no caixa ao agendar; abate no procedimento se comparecer; retido se faltar/cancelar. */
  bookingFee?: number | null;
  /** Forma de pagamento da taxa (dinheiro, PIX, cartão). */
  bookingFeePaymentMethod?: 'cash' | 'pix' | 'credit' | 'debit' | null;
  /** Presente só em bookings públicos do Smart Hub (idempotência). */
  bookingIdempotencyKey?: string | null;
}

export type AgendaView = 'day' | 'week' | 'month';
