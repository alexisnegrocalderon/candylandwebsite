import { CHILE_OFFSET_HOURS } from './eventDay';

/* Programa de Embajadores VIP: toda la lógica que decide plata, nivel y
 * beneficios, sin tocar la base de datos.
 *
 * Vive en `shared/` y no en `server/` porque el panel del embajador también
 * necesita la escala para dibujar su barra de progreso y decir cuánto le
 * falta para subir -- si esto viviera solo en el servidor, el cliente tendría
 * que duplicar los tramos y tarde o temprano quedarían desincronizados.
 * Mismo patrón que `shared/party.ts` y `shared/mission300.ts`.
 *
 * ⚠️ No confundir con `shared/ambassadorTiers.ts` (Bronce/Plata/Oro): ese es
 * el programa de referidos ORGÁNICO, donde cualquier comprador comparte su
 * código y gana premios en especie. Este otro es el programa VIP, con
 * embajadores dados de alta a mano que cobran comisión en plata. Conviven. */

export type ClientType = 'exclusivo' | 'existente';

/** Un tramo de la escala. `maxSales: null` es el último tramo, abierto. */
export type CommissionTier = { minSales: number; maxSales: number | null; percent: number };

export type BenefitTier = { minSales: number; items: string[]; bonusClp: number };

/** Escala por defecto (decisión del dueño). Editable desde el admin: se
 * guarda en `ambassadorProgramConfig.commissionScale`, esto es solo la
 * semilla inicial. */
export const DEFAULT_COMMISSION_SCALE: CommissionTier[] = [
  { minSales: 1, maxSales: 5, percent: 30 },
  { minSales: 6, maxSales: 10, percent: 35 },
  { minSales: 11, maxSales: 20, percent: 40 },
  { minSales: 21, maxSales: 30, percent: 45 },
  { minSales: 31, maxSales: null, percent: 50 },
];

/** Las ventas a clientes que ya estaban en la base antes del programa pagan
 * este % fijo y NUNCA suben de nivel al embajador. */
export const DEFAULT_EXISTING_CLIENT_PERCENT = 10;

/** Beneficios por cantidad de ventas del MES, acumulativos: quien llega a 10
 * también tiene lo de 5 y lo de 1. Con 0 ventas no hay nada. */
export const DEFAULT_BENEFITS: BenefitTier[] = [
  { minSales: 1, items: ['Entrada liberada', '1 acompañante'], bonusClp: 0 },
  { minSales: 5, items: ['1 botella de espumante'], bonusClp: 0 },
  { minSales: 10, items: ['Botella de espumante o de pisco (a elección)', '2 accesos liberados para regalar'], bonusClp: 0 },
  { minSales: 20, items: [], bonusClp: 50000 },
];

/** Lunes. `Date.getUTCDay()` usa 0=domingo, así que 1 es lunes. */
export const DEFAULT_WEEKLY_EMAIL_WEEKDAY = 1;

function sortedScale(scale: CommissionTier[]): CommissionTier[] {
  return [...scale].sort((a, b) => a.minSales - b.minSales);
}

/** El % que le corresponde a la enésima venta exclusiva del mes.
 *
 * Clave: recibe el NÚMERO de esa venta, no el total acumulado -- por eso la
 * escala no es retroactiva (decisión del dueño). La venta 5 paga 30% para
 * siempre, aunque después llegue la 6 y de ahí en adelante se pague 35%. */
export function percentForSaleNumber(saleNumber: number, scale: CommissionTier[] = DEFAULT_COMMISSION_SCALE): number {
  if (!Number.isFinite(saleNumber) || saleNumber < 1) return 0;
  const tiers = sortedScale(scale);
  for (const t of tiers) {
    if (saleNumber >= t.minSales && (t.maxSales === null || saleNumber <= t.maxSales)) return t.percent;
  }
  // Más ventas que el último tramo cerrado (escala mal configurada, sin tramo
  // abierto): se paga el tramo más alto en vez de 0, que sería peor.
  return tiers.length ? tiers[tiers.length - 1].percent : 0;
}

/** Tramo en el que está parado un embajador con `count` ventas exclusivas
 * este mes. `undefined` con 0 ventas: todavía no ganó ningún nivel. */
export function tierForSales(count: number, scale: CommissionTier[] = DEFAULT_COMMISSION_SCALE): CommissionTier | undefined {
  if (count < 1) return undefined;
  const tiers = sortedScale(scale);
  return tiers.find((t) => count >= t.minSales && (t.maxSales === null || count <= t.maxSales)) ?? tiers[tiers.length - 1];
}

/** Próximo objetivo, para la barra de progreso del panel.
 *
 * `target` es la venta en la que EMPIEZA a pagarse el % siguiente, no el
 * final del tramo actual -- así la barra llega a 100% justo cuando el %
 * cambia de verdad. `null` cuando ya está en el tramo más alto. */
export function nextTierTarget(
  count: number,
  scale: CommissionTier[] = DEFAULT_COMMISSION_SCALE,
): { target: number; salesNeeded: number; nextPercent: number } | null {
  const next = sortedScale(scale).find((t) => count < t.minSales);
  if (!next) return null;
  return { target: next.minSales, salesNeeded: next.minSales - count, nextPercent: next.percent };
}

/** Todo lo que desbloqueó este mes, acumulado. */
export function unlockedBenefits(
  monthlySales: number,
  benefits: BenefitTier[] = DEFAULT_BENEFITS,
): { items: string[]; bonusClp: number; tiers: BenefitTier[] } {
  const tiers = [...benefits].sort((a, b) => a.minSales - b.minSales).filter((b) => monthlySales >= b.minSales);
  return {
    items: tiers.flatMap((t) => t.items),
    bonusClp: tiers.reduce((sum, t) => sum + t.bonusClp, 0),
    tiers,
  };
}

/** El siguiente beneficio por desbloquear, para mostrar "te falta X". */
export function nextBenefit(monthlySales: number, benefits: BenefitTier[] = DEFAULT_BENEFITS): BenefitTier | null {
  return [...benefits].sort((a, b) => a.minSales - b.minSales).find((b) => monthlySales < b.minSales) ?? null;
}

function toTime(value: Date | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

export type Attribution = {
  clientType: ClientType;
  /** Si esta venta convierte al cliente en propiedad permanente de quien cobra. */
  assignsOwnership: boolean;
  /** Si esta venta suma para la escala mensual de quien cobra. */
  countsForTier: boolean;
};

/** Decide qué tipo de venta es ESTA, para quien la va a cobrar.
 *
 * Las cinco situaciones posibles, todas cubiertas por tests:
 * 1. Cliente nuevo (no estaba, o entró después del lanzamiento) y sin dueño
 *    → exclusivo: pasa a ser propiedad de quien cobra y suma a su nivel.
 * 2. Cliente propio que vuelve a comprar → exclusivo, suma a su nivel.
 * 3. Cliente que ya estaba en la base antes del lanzamiento → existente:
 *    10% fijo, no suma nivel y no pasa a ser propiedad de nadie, nunca.
 * 4. Cliente de OTRO embajador (código cruzado) → existente para quien
 *    cobra: se le paga la venta al 10%, pero no suma a su nivel. Sin esto,
 *    dos embajadores se pasan clientes entre ellos para inflar el nivel.
 * 5. La propiedad NUNCA se transfiere: quien ya tiene dueño lo conserva. */
export function resolveAttribution(params: {
  /** `null` si el cliente no existía en la base antes de esta compra. */
  priorCustomerFirstSeenAt: Date | string | null;
  launchDate: Date | string;
  /** Dueño actual del cliente, `null` si no tiene. */
  ownerAmbassadorId: number | null;
  /** Quién cobra esta venta (el del código usado, o el dueño si no hubo código). */
  earnerAmbassadorId: number;
}): Attribution {
  const { ownerAmbassadorId, earnerAmbassadorId } = params;

  if (ownerAmbassadorId !== null) {
    const esSuyo = ownerAmbassadorId === earnerAmbassadorId;
    return { clientType: esSuyo ? 'exclusivo' : 'existente', assignsOwnership: false, countsForTier: esSuyo };
  }

  const firstSeen = toTime(params.priorCustomerFirstSeenAt);
  const launch = toTime(params.launchDate);
  // Sin fecha de lanzamiento configurada se asume que todo cliente previo es
  // de la casa: es la lectura conservadora, paga 10% en vez de 30-50%.
  const esNuevo = firstSeen === null || (launch !== null && firstSeen >= launch);

  return esNuevo
    ? { clientType: 'exclusivo', assignsOwnership: true, countsForTier: true }
    : { clientType: 'existente', assignsOwnership: false, countsForTier: false };
}

/** El % final de una venta, ya sabiendo de qué tipo es. */
export function commissionPercentForSale(params: {
  clientType: ClientType;
  /** Número de esta venta dentro del mes (solo importa si es exclusiva). */
  saleNumberThisMonth: number;
  scale?: CommissionTier[];
  existingClientPercent?: number;
  /** Override por embajador: si viene, manda sobre la escala. */
  overridePercent?: number | null;
}): number {
  if (params.overridePercent !== null && params.overridePercent !== undefined) return params.overridePercent;
  if (params.clientType === 'existente') return params.existingClientPercent ?? DEFAULT_EXISTING_CLIENT_PERCENT;
  return percentForSaleNumber(params.saleNumberThisMonth, params.scale ?? DEFAULT_COMMISSION_SCALE);
}

/** Mes calendario en hora de Chile, formato `"2026-08"`.
 *
 * Se guarda en cada comisión para que el corte mensual del nivel y de los
 * beneficios no se mueva según la zona horaria del servidor: una venta de las
 * 22:00 del 31 en Chile es del mes que termina, aunque en UTC ya sea día 1. */
export function monthKeyFor(date: Date | string, offsetHours: number = CHILE_OFFSET_HOURS): string {
  const t = toTime(date);
  if (t === null) return '';
  return new Date(t + offsetHours * 60 * 60 * 1000).toISOString().slice(0, 7);
}

/** Si hoy toca el correo semanal, en hora de Chile. El cron corre todos los
 * días (Vercel Hobby no permite un cron aparte), así que esto es lo que
 * decide si manda o se queda callado. */
export function isWeeklyEmailDay(
  now: Date,
  weekday: number = DEFAULT_WEEKLY_EMAIL_WEEKDAY,
  offsetHours: number = CHILE_OFFSET_HOURS,
): boolean {
  const shifted = new Date(now.getTime() + offsetHours * 60 * 60 * 1000);
  return shifted.getUTCDay() === weekday;
}
