/* Reactivación de clientes (server/winback.ts): agrupa a quienes ya compraron
 * alguna fiesta en segmentos según cuánto y cuándo participaron, para escribirle
 * a cada grupo un correo distinto sobre el próximo evento. Acá vive lo PURO --
 * la definición de cada segmento y la clasificación -- para poder probarlo sin
 * base de datos ni IA.
 *
 * "Participó" = compró (orden web aprobada) entrada para esa fiesta. Es la
 * señal más confiable que hay para fiestas pasadas: el escaneo en la puerta
 * solo existe desde que se usa el módulo /caja.
 *
 * Los segmentos son EXCLUYENTES (una persona cae en uno solo, por orden de
 * prioridad): escribirle dos correos distintos a la misma persona por la misma
 * fiesta es justo lo que hay que evitar. */

export const WINBACK_SEGMENT_KEYS = ['fieles', 'ultima', 'una_vez', 'dormidos'] as const;
export type WinbackSegmentKey = (typeof WINBACK_SEGMENT_KEYS)[number];

export interface WinbackSegmentDef {
  key: WinbackSegmentKey;
  label: string;
  /** Qué los agrupa, en simple (lo que lee el dueño). */
  description: string;
  /** Cómo hablarles: se le pasa a la IA como objetivo del correo. */
  objective: string;
}

export const WINBACK_SEGMENTS: WinbackSegmentDef[] = [
  {
    key: 'fieles',
    label: 'Los de siempre',
    description: 'Han comprado entrada para 3 o más fiestas distintas.',
    objective: 'Son clientes de la casa, de los que ya han venido muchas veces. Háblales como a gente conocida: agradece que siempre estén, y cuéntales que viene una nueva fiesta. Que se sientan los primeros en enterarse, sin tono de campaña ni de oferta forzada.',
  },
  {
    key: 'ultima',
    label: 'Estuvieron en la última',
    description: 'Compraron para la última fiesta y todavía no son de los de siempre.',
    objective: 'Estuvieron en la última fiesta, así que la experiencia está fresca. Dales las gracias por haber venido y cuéntales de la próxima, con la idea de "esto se repite y se pone mejor". Invítalos a volver y a traer a alguien.',
  },
  {
    key: 'una_vez',
    label: 'Vinieron una vez y no volvieron',
    description: 'Compraron una sola vez, en una fiesta anterior a la última.',
    objective: 'Vinieron una vez hace un tiempo y no han vuelto. Escríbeles con cercanía, sin reproche: "te echamos de menos". Cuéntales lo que viene de nuevo en la próxima fiesta, para que tengan una razón concreta para volver.',
  },
  {
    key: 'dormidos',
    label: 'Estuvieron en dos y se enfriaron',
    description: 'Compraron para dos fiestas, pero ninguna fue la última.',
    objective: 'Vinieron a dos fiestas y hace rato que no los vemos. Háblales como a alguien que ya conoce el ambiente y se perdió las últimas: cuéntales qué cambió y por qué esta vez vale la pena volver.',
  },
];

export const WINBACK_SEGMENT_BY_KEY: Record<WinbackSegmentKey, WinbackSegmentDef> =
  Object.fromEntries(WINBACK_SEGMENTS.map((s) => [s.key, s])) as Record<WinbackSegmentKey, WinbackSegmentDef>;

export function isWinbackSegmentKey(value: unknown): value is WinbackSegmentKey {
  return typeof value === 'string' && (WINBACK_SEGMENT_KEYS as readonly string[]).includes(value);
}

/** Con 3 o más fiestas distintas ya es "de siempre". */
export const WINBACK_LOYAL_MIN_EVENTS = 3;

export interface WinbackClassification {
  segments: Record<WinbackSegmentKey, string[]>;
  /** Quienes ya compraron el evento al que se les quiere invitar: no tiene
   * sentido escribirles, y no entran a ningún segmento. */
  alreadyBought: number;
  /** Quienes nunca compraron una fiesta anterior (compraron solo el evento
   * objetivo, o ninguno): no son "reactivación". */
  noPastEvents: number;
}

/** Clasifica a cada persona en un único segmento, o la deja afuera.
 *
 * - `participation`: por correo (ya normalizado), las fiestas distintas por
 *   las que compró. Puede incluir el evento objetivo; se ignora para contar.
 * - `latestPastEventId`: la fiesta pasada más reciente con ventas (`null` si
 *   no hay ninguna).
 * - `targetEventId`: el evento al que se quiere invitar. Quien ya lo compró
 *   queda afuera.
 *
 * Prioridad: de siempre (3+) > estuvo en la última > una sola vez > dos y se
 * enfrió. Cualquier otro caso (por ejemplo, 2 fiestas donde una fue la última)
 * ya cayó en "estuvo en la última", así que no queda nadie sin segmento. */
export function classifyWinback(input: {
  participation: Map<string, Set<number>>;
  latestPastEventId: number | null;
  targetEventId: number;
}): WinbackClassification {
  const { participation, latestPastEventId, targetEventId } = input;
  const segments: Record<WinbackSegmentKey, string[]> = { fieles: [], ultima: [], una_vez: [], dormidos: [] };
  let alreadyBought = 0;
  let noPastEvents = 0;

  for (const [email, events] of Array.from(participation.entries())) {
    if (events.has(targetEventId)) {
      alreadyBought += 1;
      continue;
    }
    const past = new Set(Array.from(events).filter((id) => id !== targetEventId));
    if (past.size === 0) {
      noPastEvents += 1;
      continue;
    }
    if (past.size >= WINBACK_LOYAL_MIN_EVENTS) segments.fieles.push(email);
    else if (latestPastEventId !== null && past.has(latestPastEventId)) segments.ultima.push(email);
    else if (past.size === 1) segments.una_vez.push(email);
    else segments.dormidos.push(email);
  }

  for (const key of WINBACK_SEGMENT_KEYS) segments[key].sort();
  return { segments, alreadyBought, noPastEvents };
}

/** Prefijo con el que se nombra la campaña de un segmento y un evento: el
 * servidor lo usa para no crear dos veces la misma. */
export function winbackCampaignName(segmentLabel: string, eventTitle: string): string {
  return `Reactivación · ${segmentLabel} · ${eventTitle}`.slice(0, 255);
}

/** Cuántos días tarda en salir una campaña de `recipients` personas, con un
 * tope diario de correos automáticos de `dailyCap` (compartido con las demás
 * campañas y los recordatorios, así que es una cota optimista). */
export function winbackDaysToSend(recipients: number, dailyCap: number): number {
  if (recipients <= 0 || dailyCap <= 0) return 0;
  return Math.ceil(recipients / dailyCap);
}

/** Link del botón del correo: al checkout del evento, con UTM propias para
 * que las ventas aparezcan en "Ventas por Origen" separadas por segmento. */
export function winbackCtaUrl(baseUrl: string, eventSlug: string, segmentKey: WinbackSegmentKey): string {
  const params = new URLSearchParams({ utm_source: 'email', utm_medium: 'mailing', utm_campaign: `reactivacion-${segmentKey}` });
  return `${baseUrl.replace(/\/$/, '')}/checkout/${eventSlug}?${params.toString()}`;
}
