/* Tarjeta de sellos de la app («Sellos» en Mi cuenta).
 *
 * 6 casillas. La primera viene de regalo al entrar a la app; cada fiesta
 * DISTINTA a la que la persona entra (su entrada escaneada en la puerta)
 * suma un sello. Al llenar la tarjeta se gana 1 Acceso Dúo gratis y empieza
 * una tarjeta nueva (las siguientes ya sin sello de regalo). Pura: el
 * servidor le pasa las fiestas y acá se decide qué se muestra y cuántos
 * premios corresponden. */

export const STAMPS_PER_CARD = 6;
/** El premio: un crédito de este acceso (shared/accessCredit.ts lo cobra en el checkout). */
export const STAMP_REWARD_SLUG = 'duo';
export const STAMP_REWARD_NAME = 'Acceso Dúo';

export interface StampVisit {
  eventId: number;
  title: string;
  /** Cuándo fue la fiesta (o cuándo se escaneó la entrada). */
  date: Date | string | null;
}

export type StampSlot =
  | { kind: 'regalo' }
  | { kind: 'visita'; visit: StampVisit }
  | { kind: 'vacio' };

export interface StampCardState {
  /** Casillas de la tarjeta actual, en orden (siempre 6). */
  slots: StampSlot[];
  filled: number;
  remaining: number;
  /** Tarjetas completas (= premios ganados en total). */
  completedCards: number;
  /** Fiestas a las que entró (todas, para el historial). */
  visits: number;
}

/** Los sellos en orden: el de regalo y después una fiesta por sello. */
function stampSequence(visits: StampVisit[]): StampSlot[] {
  return [{ kind: 'regalo' }, ...visits.map((visit): StampSlot => ({ kind: 'visita', visit }))];
}

export function stampCardState(visits: StampVisit[]): StampCardState {
  const sequence = stampSequence(visits);
  const completedCards = Math.floor(sequence.length / STAMPS_PER_CARD);
  const current = sequence.slice(completedCards * STAMPS_PER_CARD);
  const slots = Array.from({ length: STAMPS_PER_CARD }, (_, i): StampSlot => current[i] ?? { kind: 'vacio' });
  return { slots, filled: current.length, remaining: STAMPS_PER_CARD - current.length, completedCards, visits: visits.length };
}

/** La fiesta que completó la tarjeta n (1, 2, …): su último sello. */
export function visitCompletingCard(visits: StampVisit[], n: number): StampVisit | null {
  const slot = stampSequence(visits)[n * STAMPS_PER_CARD - 1];
  return slot?.kind === 'visita' ? slot.visit : null;
}

/** El código del premio n de un cliente: siempre el mismo, así nunca se entrega dos veces. */
export function stampRewardCode(customerId: number, n: number): string {
  return `SELLOS-${customerId}-${n}`;
}
