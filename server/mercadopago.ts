import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { ENV } from './_core/env';

let mpClient: MercadoPagoConfig | null = null;

function getClient() {
  if (!mpClient) {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
      console.warn('[MercadoPago] No access token configured');
      return null;
    }
    mpClient = new MercadoPagoConfig({ accessToken });
  }
  return mpClient;
}

export interface CreatePreferenceInput {
  orderNumber: string;
  items: {
    title: string;
    quantity: number;
    unitPrice: number;
  }[];
  buyerEmail: string;
  buyerName: string;
  total: number;
  attendeeData?: string;
}

export async function createPaymentPreference(input: CreatePreferenceInput) {
  const client = getClient();
  if (!client) {
    // Fallback: return mock URL for development
    console.warn('[MercadoPago] Using mock checkout URL (no access token)');
    return {
      id: 'mock-preference-' + input.orderNumber,
      initPoint: `/pago/exito?order=${input.orderNumber}&mock=true`,
    };
  }

  const preference = new Preference(client);

  const baseUrl = process.env.APP_URL || 'https://mansionplayroom.cl';

  const result = await preference.create({
    body: {
      items: input.items.map((item) => ({
        id: input.orderNumber,
        title: item.title,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        currency_id: 'CLP',
      })),
      payer: {
        email: input.buyerEmail,
        name: input.buyerName,
      },
      back_urls: {
        success: `${baseUrl}/pago/exito?order=${input.orderNumber}`,
        failure: `${baseUrl}/pago/error?order=${input.orderNumber}`,
        pending: `${baseUrl}/pago/exito?order=${input.orderNumber}&pending=true`,
      },
      auto_return: 'approved',
      external_reference: input.orderNumber,
      notification_url: `${baseUrl}/api/webhooks/mercadopago`,
      statement_descriptor: 'MANSION PLAYROOM',
      metadata: input.attendeeData ? { attendee_data: input.attendeeData } : undefined,
    },
  });

  return {
    id: result.id,
    initPoint: result.init_point,
  };
}

/** Preferencia para cobrar la diferencia de Misión 300 cuando no se junta la meta
 * — reusa el mismo orderNumber como external_reference así el webhook actualiza
 * la orden original en vez de crear una nueva. */
export async function createTopupPreference(input: {
  orderNumber: string;
  eventTitle: string;
  amount: number;
  buyerEmail: string;
  buyerName: string;
}) {
  const client = getClient();
  if (!client) {
    console.warn('[MercadoPago] Using mock topup URL (no access token)');
    return { id: 'mock-preference-topup-' + input.orderNumber, initPoint: `/pago/exito?order=${input.orderNumber}&mock=true` };
  }

  const preference = new Preference(client);
  const baseUrl = process.env.APP_URL || 'https://mansionplayroom.cl';

  const result = await preference.create({
    body: {
      items: [{
        id: input.orderNumber,
        title: `Diferencia Misión 300 - ${input.eventTitle}`,
        quantity: 1,
        unit_price: input.amount,
        currency_id: 'CLP',
      }],
      payer: { email: input.buyerEmail, name: input.buyerName },
      back_urls: {
        success: `${baseUrl}/pago/exito?order=${input.orderNumber}`,
        failure: `${baseUrl}/pago/error?order=${input.orderNumber}`,
        pending: `${baseUrl}/pago/exito?order=${input.orderNumber}&pending=true`,
      },
      auto_return: 'approved',
      external_reference: input.orderNumber,
      notification_url: `${baseUrl}/api/webhooks/mercadopago`,
      statement_descriptor: 'MANSION PLAYROOM',
    },
  });

  return { id: result.id, initPoint: result.init_point };
}

/** Cobra directamente con el token de tarjeta que entrega el Payment Brick
 * (checkout embebido, sin modal ni redirect de Mercado Pago). El monto
 * SIEMPRE viene de nuestro cálculo de servidor (`amount`), nunca de lo que
 * mande el cliente — el Brick ya cobra con el monto correcto porque se
 * inicializa con este mismo valor, pero no hay que confiar en el cliente
 * para el monto real cobrado. */
export async function createCardPayment(input: {
  orderNumber: string;
  amount: number;
  description: string;
  token: string;
  paymentMethodId: string;
  issuerId?: string | number;
  installments?: number;
  payerEmail: string;
  identificationType?: string;
  identificationNumber?: string;
}) {
  const client = getClient();
  if (!client) {
    console.warn('[MercadoPago] No hay access token — no se puede cobrar');
    return { status: 'rejected' as const, statusDetail: 'no_access_token', paymentId: 'mock-' + input.orderNumber, paymentMethodId: input.paymentMethodId };
  }

  const baseUrl = process.env.APP_URL || 'https://mansionplayroom.cl';
  const payment = new Payment(client);

  const result = await payment.create({
    body: {
      transaction_amount: input.amount,
      token: input.token,
      description: input.description,
      installments: input.installments ?? 1,
      payment_method_id: input.paymentMethodId,
      issuer_id: input.issuerId ? Number(input.issuerId) : undefined,
      external_reference: input.orderNumber,
      notification_url: `${baseUrl}/api/webhooks/mercadopago`,
      statement_descriptor: 'MANSION PLAYROOM',
      payer: {
        email: input.payerEmail,
        identification: input.identificationType && input.identificationNumber
          ? { type: input.identificationType, number: input.identificationNumber }
          : undefined,
      },
    },
    requestOptions: { idempotencyKey: `${input.orderNumber}-${Date.now()}` },
  });

  return {
    status: (result.status as 'approved' | 'rejected' | 'in_process' | 'pending') ?? 'pending',
    statusDetail: result.status_detail ?? undefined,
    paymentId: String(result.id ?? ''),
    paymentMethodId: result.payment_method_id ?? input.paymentMethodId,
  };
}

export async function getPaymentInfo(paymentId: string) {
  const client = getClient();
  if (!client) return null;

  const payment = new Payment(client);
  const result = await payment.get({ id: paymentId });
  return result;
}
