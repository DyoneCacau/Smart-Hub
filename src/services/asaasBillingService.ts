import { supabase } from "@/integrations/supabase/client";

export type BillingProvider = "manual" | "asaas";
export type BillingMethod = "PIX" | "BOLETO" | "CREDIT_CARD" | "UNDEFINED";

export interface AsaasInvoice {
  id: string;
  status: string;
  value: number;
  dueDate: string;
  description: string | null;
  billingType: BillingMethod;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  paymentDate: string | null;
  canPay: boolean;
}

export interface AsaasPaymentsPage {
  invoices: AsaasInvoice[];
  hasMore: boolean;
  totalCount: number;
}

export interface AsaasCheckout {
  subscriptionId: string;
  asaasSubscriptionId: string;
  billingType: "UNDEFINED";
  billingDay: number;
  nextDueDate: string | null;
  prorationDays: number;
  prorationAmount: number;
  recurringPaymentUrl: string | null;
  prorationPaymentUrl: string | null;
  setupPaymentUrl: string | null;
}

interface FunctionError {
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function functionErrorMessage(error: unknown): Promise<string> {
  if (isRecord(error) && error.context instanceof Response) {
    const payload: unknown = await error.context.clone().json().catch(() => null);
    if (isRecord(payload) && typeof payload.error === "string") return payload.error;
  }
  if (error instanceof Error && error.message) return error.message;
  return "Não foi possível concluir a operação de cobrança";
}

function trustedPaymentUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (host === "asaas.com" || host.endsWith(".asaas.com"))
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

async function invokeAsaas<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T | FunctionError>(functionName, { body });

  if (error) throw new Error(await functionErrorMessage(error));
  if (isRecord(data) && typeof data.error === "string") {
    throw new Error(data.error);
  }
  return data as T;
}

export const asaasBillingService = {
  async listPayments(subscriptionId: string, limit = 50, offset = 0): Promise<AsaasPaymentsPage> {
    const result = await invokeAsaas<{
      data: Array<{
        id: string;
        status: string;
        value: number;
        billing_type?: BillingMethod;
        due_date?: string;
        payment_date?: string;
        invoice_url?: string;
        bank_slip_url?: string;
        description?: string | null;
        external_reference?: string | null;
      }>;
      has_more: boolean;
      total_count: number;
    }>("asaas-list-payments", {
      subscription_id: subscriptionId,
      limit,
      offset,
    });

    return {
      invoices: result.data.map((payment) => ({
        id: payment.id,
        status: payment.status,
        value: payment.value,
        dueDate: payment.due_date ?? "",
        description: payment.description
          ?? (payment.external_reference?.includes(":proration")
            ? "Período proporcional"
            : payment.external_reference?.includes(":setup_fee")
            ? "Taxa de adesão"
            : null),
        billingType: payment.billing_type ?? "UNDEFINED",
        invoiceUrl: trustedPaymentUrl(payment.invoice_url),
        bankSlipUrl: trustedPaymentUrl(payment.bank_slip_url),
        paymentDate: payment.payment_date ?? null,
        canPay: !["RECEIVED", "CONFIRMED", "REFUNDED", "CANCELLED", "DELETED"].includes(
          String(payment.status || "").toUpperCase(),
        ),
      })),
      hasMore: result.has_more,
      totalCount: result.total_count,
    };
  },

  cancelSubscription(subscriptionId: string) {
    return invokeAsaas<{ cancelled: true; duplicate?: boolean }>("asaas-cancel-subscription", {
      subscription_id: subscriptionId,
    });
  },

  enableCardRecurring(subscriptionId: string) {
    return invokeAsaas<{
      billing_type: "CREDIT_CARD";
      payment_id: string | null;
      invoice_url: string | null;
      has_open_payment: boolean;
      message: string;
    }>("asaas-set-card-recurring", {
      subscription_id: subscriptionId,
    }).then((result) => ({
      ...result,
      invoice_url: trustedPaymentUrl(result.invoice_url ?? undefined),
    }));
  },

  choosePaymentMethod(
    subscriptionId: string,
    billingType: Exclude<BillingMethod, "UNDEFINED">,
    paymentId?: string,
  ) {
    return invokeAsaas<{
      billing_type: Exclude<BillingMethod, "UNDEFINED">;
      payment_id: string;
      status: string | null;
      value: number | null;
      due_date: string | null;
      invoice_url: string | null;
      bank_slip_url: string | null;
      pix: {
        encoded_image: string | null;
        payload: string | null;
        expiration_date: string | null;
      } | null;
      boleto: {
        identification_field: string | null;
        bar_code: string | null;
      } | null;
      message: string;
    }>("asaas-choose-payment-method", {
      subscription_id: subscriptionId,
      billing_type: billingType,
      ...(paymentId ? { payment_id: paymentId } : {}),
    }).then((result) => ({
      ...result,
      invoice_url: trustedPaymentUrl(result.invoice_url ?? undefined),
      bank_slip_url: trustedPaymentUrl(result.bank_slip_url ?? undefined),
    }));
  },

  async createCheckout(
    subscriptionId: string,
    includeSetupFee: boolean,
    options?: {
      billingDay?: number;
      billingDeferDays?: number;
      firstDueDate?: string | null;
      scheduleFirstCharge?: boolean;
    },
  ): Promise<AsaasCheckout> {
    const billingDay = options?.billingDay;
    const billingDeferDays = options?.billingDeferDays;
    const firstDueDate = options?.scheduleFirstCharge === false
      ? null
      : (options?.firstDueDate ?? null);
    const result = await invokeAsaas<{
      subscription_id: string;
      asaas_subscription_id: string;
      billing_type: "UNDEFINED";
      billing_day?: number;
      next_due_date?: string;
      proration_days?: number;
      proration_amount?: number;
      recurring_payment?: { invoice_url?: string; bank_slip_url?: string } | null;
      proration_payment?: { invoice_url?: string; bank_slip_url?: string } | null;
      setup_payment?: { invoice_url?: string; bank_slip_url?: string } | null;
    }>("asaas-create-checkout", {
      subscription_id: subscriptionId,
      include_setup_fee: includeSetupFee,
      ...(billingDay != null ? { billing_day: billingDay } : {}),
      ...(billingDeferDays != null ? { billing_defer_days: billingDeferDays } : {}),
      first_due_date: firstDueDate,
    });
    return {
      subscriptionId: result.subscription_id,
      asaasSubscriptionId: result.asaas_subscription_id,
      billingType: result.billing_type,
      billingDay: result.billing_day ?? billingDay ?? 10,
      nextDueDate: result.next_due_date ?? null,
      prorationDays: result.proration_days ?? 0,
      prorationAmount: result.proration_amount ?? 0,
      recurringPaymentUrl: trustedPaymentUrl(result.recurring_payment?.invoice_url)
        ?? trustedPaymentUrl(result.recurring_payment?.bank_slip_url),
      prorationPaymentUrl: trustedPaymentUrl(result.proration_payment?.invoice_url)
        ?? trustedPaymentUrl(result.proration_payment?.bank_slip_url),
      setupPaymentUrl: trustedPaymentUrl(result.setup_payment?.invoice_url)
        ?? trustedPaymentUrl(result.setup_payment?.bank_slip_url),
    };
  },
};
