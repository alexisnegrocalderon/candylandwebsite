/* «Automáticos» de Mailing: todo lo que se manda solo a las personas, con cuándo sale, a quién, cómo y qué pasó la
 * última vez. Lo arma server/automationsOverview.ts y lo muestra client/src/components/admin/AutomationsView.tsx. */

export type AutomationState =
  /** Apagado: no sale nada. */
  | 'off'
  /** Prendido y pidiendo cross check: sale cuando lo reportas. */
  | 'cross-check'
  /** Prendido y sale solo (no pide cross check). */
  | 'auto';

/** Los tres avisos de venta son excluyentes: prender uno apaga los otros (server/routers.ts, settings.update). */
export type SalesSendKey = 'foundersPromoEnabled' | 'tanda2PromoEnabled' | 'salesDripEnabled';
export const SALES_SEND_LABELS: Record<SalesSendKey, string> = {
  foundersPromoEnabled: 'Aviso de primeros cupos',
  tanda2PromoEnabled: 'Aviso de la 2ª tanda',
  salesDripEnabled: 'Aviso diario de venta',
};

export interface AutomationLastRun {
  at: string;
  /** «12 enviados», «No salió nada…», etc. */
  result: string;
  /** Cómo terminó: reportado por ti, falló o venció. */
  status: 'done' | 'failed' | 'expired' | 'discarded';
}

export interface AutomationItem {
  key: string;
  title: string;
  /** Qué se manda. */
  what: string;
  /** Cuándo sale (hora de Chile). */
  when: string;
  /** A quién y con qué reglas (topes, espera entre correos). */
  how: string;
  state: AutomationState;
  /** Interruptor de la propia automatización (no el del cross check): está prendida. */
  enabled: boolean;
  /** `crossCheck` de shared/crossCheck.ts: para poder cambiar «pedir cross check». */
  crossCheckKind: string | null;
  /** A cuántas personas le tocaría hoy (null = no se calcula). */
  audience: number | null;
  sentToday: number | null;
  /** Lo que pasó la última vez (de los cross check ya decididos). */
  lastRun: AutomationLastRun | null;
  /** Dónde se prende o se configura. */
  section: string | null;
  /** Interruptor de ajustes que prende este envío desde la propia tarjeta (solo los avisos de venta). */
  enableKey: SalesSendKey | null;
  /** Detalle de lo que viene, una línea por cosa (ej. los pasos próximos del piloto). */
  upcoming: string[];
}

export interface AutomationsOverview {
  /** Cupo diario de correos automáticos. */
  dailyCap: { sent: number; cap: number };
  items: AutomationItem[];
}

/** Hora de Chile (HH:MM) de una hora UTC de un cron, según el horario de verano o invierno de `now`. */
export function chileTimeOfUtc(utcHour: number, utcMinute: number, now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), utcHour, utcMinute));
  return new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const weekdayName = (n: number) => WEEKDAYS[((n % 7) + 7) % 7];
