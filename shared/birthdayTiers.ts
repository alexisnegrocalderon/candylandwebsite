/** Tramos de premios del programa Cumpleañeros -- fuente única compartida
 * entre server/webhooks.ts (materializa el premio), server/email.ts
 * (correos) y la página pública (tabla explicativa). Los tramos NO se
 * acumulan: alcanzar uno reemplaza al anterior (decisión del dueño).
 *
 * Cada ítem se resuelve contra `ticketTypes` DEL EVENTO del cumpleañero al
 * momento de materializar el premio (ticketTypes es por-evento, no global):
 * `matchBy: 'accesoSlug'` busca entre las opciones de "¿cómo vienes?"
 * (ej. 'duo', ya existente), `matchBy: 'internalCode'` busca entre los
 * productos de regalo nuevos que hay que crear por evento (ver plan --
 * BDESP/BDBOT/BDCOV/BDBEB, máximo 10 caracteres por el largo de la
 * columna `ticketTypes.internalCode`). */
export interface BirthdayTierItem {
  matchBy: 'accesoSlug' | 'internalCode';
  value: string;
  quantity: number;
  label: string;
}

export interface BirthdayTier {
  /** También es el valor que se guarda en birthdayPeople.currentTier. */
  tier: number;
  minTickets: number;
  label: string;
  items: BirthdayTierItem[];
  /** true si este tramo incluye la entrada gratis para el próximo evento
   * (se maneja como crédito pendiente -- ver birthdayPeople.pendingNextEventCredit
   * -- porque ese evento puede no existir todavía). */
  includesNextEventCredit: boolean;
}

export const BIRTHDAY_TIERS: BirthdayTier[] = [
  {
    tier: 1,
    minTickets: 1,
    label: '1 entrada vendida con tu código',
    items: [
      { matchBy: 'accesoSlug', value: 'duo', quantity: 1, label: 'Tu entrada gratis (Acceso Dúo, para 2 personas)' },
      { matchBy: 'internalCode', value: 'BDESP', quantity: 1, label: '1 espumante para celebrar y cantar cumpleaños feliz' },
    ],
    includesNextEventCredit: false,
  },
  {
    tier: 2,
    minTickets: 3,
    label: '3 entradas vendidas con tu código',
    items: [
      { matchBy: 'internalCode', value: 'BDESP', quantity: 1, label: '1 espumante de regalo' },
      { matchBy: 'internalCode', value: 'BDCOV', quantity: 2, label: '2 covers' },
    ],
    includesNextEventCredit: true,
  },
  {
    tier: 3,
    minTickets: 5,
    label: '5 entradas vendidas con tu código',
    items: [
      { matchBy: 'internalCode', value: 'BDBOT', quantity: 1, label: 'Botella de regalo (pisco o ron)' },
      { matchBy: 'internalCode', value: 'BDBEB', quantity: 1, label: 'Bebidas de regalo' },
    ],
    includesNextEventCredit: false,
  },
];

/** El tramo más alto que ya se alcanzó con `count` entradas vendidas, o
 * `undefined` si todavía no llega al primero. */
export function tierForCount(count: number): BirthdayTier | undefined {
  return BIRTHDAY_TIERS.filter(t => count >= t.minTickets).pop();
}

/** El próximo tramo por alcanzar, o `undefined` si ya está en el máximo. */
export function nextTierForCount(count: number): BirthdayTier | undefined {
  return BIRTHDAY_TIERS.find(t => count < t.minTickets);
}
