/**
 * Registro del error que devuelve Mercado Pago cuando un cobro con tarjeta falla.
 *
 * Solo LEE y escribe en el log: nunca cambia el error original (quien llama lo vuelve a lanzar tal cual),
 * nunca registra claves, tokens de tarjeta, correos ni nombres.
 */

type AnyErr = {
  message?: unknown;
  status?: unknown;
  error?: unknown;
  cause?: unknown;
};

/** Extrae solo datos técnicos del error (estado, código, mensaje, causas). Nada personal. */
export function describeMpError(err: unknown): Record<string, unknown> {
  const e = (err ?? {}) as AnyErr;
  const causes = Array.isArray(e.cause)
    ? e.cause.slice(0, 5).map((c) => {
        const cc = (c ?? {}) as { code?: unknown; description?: unknown };
        return { code: cc.code, description: typeof cc.description === 'string' ? cc.description.slice(0, 200) : undefined };
      })
    : undefined;
  return {
    status: e.status,
    error: typeof e.error === 'string' ? e.error : undefined,
    message: typeof e.message === 'string' ? e.message.slice(0, 300) : undefined,
    causes,
  };
}

/**
 * Solo en Preview: pregunta a Mercado Pago de quién es el token (`/users/me`) y devuelve datos NO sensibles:
 * número de cuenta, país y si es cuenta de prueba. En producción devuelve null sin hacer ninguna llamada.
 */
export async function diagnoseTokenAccount(
  accessToken: string | undefined,
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, unknown> | null> {
  if (env.VERCEL_ENV !== 'preview') return null;
  if (!accessToken) return { tokenPresent: false };
  try {
    const r = await fetchImpl('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = (await r.json().catch(() => ({}))) as {
      id?: unknown;
      site_id?: unknown;
      tags?: unknown;
      nickname?: unknown;
    };
    const nick = typeof body.nickname === 'string' ? body.nickname : '';
    return {
      httpStatus: r.status,
      tokenPrefix: accessToken.split('-')[0], // "APP_USR" o "TEST": solo el prefijo, nunca el resto
      accountId: body.id,
      siteId: body.site_id,
      // Las cuentas de prueba de Mercado Pago tienen apodo que empieza con TEST / TESTUSER.
      looksLikeTestAccount: /^TEST/i.test(nick),
    };
  } catch (e) {
    return { diagnoseFailed: true, message: e instanceof Error ? e.message.slice(0, 200) : 'error' };
  }
}

/** Escribe en el log del servidor. Nunca lanza: un fallo al registrar no puede afectar el cobro. */
export async function logCardPaymentFailure(
  err: unknown,
  ctx: { orderNumber: string; paymentMethodId: string },
  accessToken: string | undefined,
): Promise<void> {
  try {
    console.error('[MercadoPago] Cobro con tarjeta falló', {
      orderNumber: ctx.orderNumber,
      paymentMethodId: ctx.paymentMethodId,
      ...describeMpError(err),
    });
    const account = await diagnoseTokenAccount(accessToken);
    if (account) console.error('[MercadoPago] Diagnóstico del token (solo Preview)', account);
  } catch {
    /* registrar nunca debe romper el cobro */
  }
}
