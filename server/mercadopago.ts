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

export async function getPaymentInfo(paymentId: string) {
  const client = getClient();
  if (!client) return null;

  const payment = new Payment(client);
  const result = await payment.get({ id: paymentId });
  return result;
}
