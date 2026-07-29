import { useEffect, useRef } from 'react';
import { trpc } from '@/lib/trpc';

/* Formulario de tarjeta embebido de Mercado Pago (Payment Brick): sin modal
 * ni redirect, el usuario nunca sale del sitio.
 *
 * Vive acá y no dentro del checkout porque lo usan dos flujos distintos:
 * la compra de entradas y los tragos que se invitan durante la fiesta.
 * El monto SIEMPRE lo calcula el servidor a partir de la orden guardada
 * (ver processCardPaymentForOrder), así que lo que se pasa por acá es solo
 * lo que la Brick necesita para dibujarse. */

export type PaymentOutcome = 'approved' | 'rejected' | 'in_process' | 'pending';

/** Traduce el motivo de rechazo de Mercado Pago a algo accionable. Un
 * "pago rechazado" a secas deja a la persona sin saber qué hacer. */
export function motivoRechazo(detail?: string): string {
  const mapa: Record<string, string> = {
    cc_rejected_insufficient_amount: 'Tu tarjeta no tiene fondos suficientes.',
    cc_rejected_bad_filled_card_number: 'Revisa el número de tarjeta, parece incorrecto.',
    cc_rejected_bad_filled_date: 'Revisa la fecha de vencimiento de la tarjeta.',
    cc_rejected_bad_filled_security_code: 'Revisa el código de seguridad (CVV).',
    cc_rejected_bad_filled_other: 'Revisa los datos de la tarjeta e intenta de nuevo.',
    cc_rejected_call_for_authorize: 'Tu banco pide que autorices el pago — llámalo o intenta con otra tarjeta.',
    cc_rejected_card_disabled: 'Tu tarjeta está deshabilitada para pagos online — contacta a tu banco.',
    cc_rejected_duplicated_payment: 'Ya hiciste un pago por este mismo monto — revisa si ya se procesó.',
    cc_rejected_high_risk: 'El pago fue rechazado por seguridad. Intenta con otra tarjeta.',
    cc_rejected_max_attempts: 'Llegaste al máximo de intentos con esta tarjeta. Prueba con otra.',
    cc_rejected_other_reason: 'Tu banco rechazó el pago. Intenta con otra tarjeta.',
  };
  return (detail && mapa[detail]) || 'No pudimos procesar el pago con esa tarjeta. Intenta de nuevo o usa otra tarjeta.';
}

export function loadMercadoPagoSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).MercadoPago) return resolve();
    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar Mercado Pago'));
    document.head.appendChild(script);
  });
}

export function PaymentBrick({ orderNumber, amount, containerId = 'mp-payment-brick', onResult, onError }: {
  orderNumber: string;
  amount: number;
  /** Solo hace falta si hubiera dos Bricks vivas en la misma pantalla. */
  containerId?: string;
  onResult: (status: PaymentOutcome, statusDetail?: string) => void;
  onError: (message: string) => void;
}) {
  const controllerRef = useRef<any>(null);
  const processCardPayment = trpc.orders.processCardPayment.useMutation();

  useEffect(() => {
    const publicKey = import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY as string | undefined;
    if (!publicKey) return;
    let cancelled = false;

    (async () => {
      await loadMercadoPagoSdk();
      if (cancelled) return;
      const mp = new (window as any).MercadoPago(publicKey, { locale: 'es-CL' });
      const controller = await mp.bricks().create('payment', containerId, {
        initialization: { amount },
        customization: {
          // No incluir `mercadoPago`/`ticket` acá: la Brick los oculta si no
          // aparecen en el objeto (pasar 'none' no es un valor válido de la API).
          paymentMethods: { creditCard: 'all', debitCard: 'all', prepaidCard: 'all' },
        },
        callbacks: {
          onReady: () => {},
          onSubmit: ({ formData }: any) => new Promise<void>((resolve, reject) => {
            processCardPayment.mutate(
              {
                orderNumber,
                token: formData.token,
                paymentMethodId: formData.payment_method_id,
                issuerId: formData.issuer_id,
                installments: formData.installments,
                identificationType: formData.payer?.identification?.type,
                identificationNumber: formData.payer?.identification?.number,
              },
              {
                onSuccess: (res) => {
                  onResult(res.status as PaymentOutcome, res.statusDetail);
                  if (res.status === 'rejected') {
                    onError(motivoRechazo(res.statusDetail));
                    reject();
                  } else {
                    resolve();
                  }
                },
                onError: (e: any) => {
                  onError(e.message || 'No pudimos procesar el pago. Intenta de nuevo.');
                  reject();
                },
              }
            );
          }),
          onError: (error: any) => {
            console.error('[MP Brick]', error);
          },
        },
      });
      if (cancelled) { controller.unmount?.(); return; }
      controllerRef.current = controller;
    })();

    return () => {
      cancelled = true;
      controllerRef.current?.unmount?.();
      controllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNumber, containerId]);

  return <div id={containerId} />;
}
