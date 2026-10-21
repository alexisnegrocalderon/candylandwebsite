import type { ContestFlashConfig, FlashPrize } from './contest';

/* Reto relámpago: reglas puras. Lo que toca la base y Meta vive en
 * server/contestFlash.ts. */

export const flashPlaces = (flash: ContestFlashConfig) => flash.prizes.length;
export const flashSlotCount = (flash: ContestFlashConfig) => flash.prizes.length + flash.alternates;

export const flashSlotKey = (slot: number) => `flash-slot:${slot}`;
export const flashTryKey = (igUserId: string, n: number) => `flash-try:${igUserId}:${n}`.slice(0, 100);
export const flashLateKey = (participantId: number) => `flash-late:${participantId}`;

/** Intentos que le quedan (null = sin límite). */
export function attemptsLeft(maxAttempts: number, used: number): number | null {
  return maxAttempts <= 0 ? null : Math.max(0, maxAttempts - used);
}

/** Lo que falta para poder lanzar el reto (vacío = listo). */
export function flashBlockers(flash: ContestFlashConfig): string[] {
  const out: string[] = [];
  if (!flash.question.trim()) out.push('Escribe el reto (la pregunta o lo que hay que encontrar).');
  if (flash.answers.length === 0) out.push('Agrega al menos una respuesta aceptada.');
  flash.prizes.forEach((p, i) => {
    const place = `${i + 1}º puesto`;
    if ((p.kind === 'ticket' || p.kind === 'product') && !p.ticketTypeId) out.push(`${place}: elige el ${p.kind === 'ticket' ? 'acceso' : 'producto'} del premio.`);
    if (p.kind === 'playcoins' && p.playcoins <= 0) out.push(`${place}: pon cuántos PlayCoins.`);
    if (p.kind === 'code' && p.percent <= 0) out.push(`${place}: pon el % de descuento.`);
    if (p.kind === 'manual' && !p.label.trim()) out.push(`${place}: escribe qué se entrega.`);
  });
  return out;
}

/** ¿Este premio necesita verificar al ganador (+18, RUT, ACEPTO)? Solo la entrada. */
export const flashNeedsVerification = (prize: FlashPrize | undefined) => prize?.kind === 'ticket';

export const medalFor = (place: number) => (place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : `${place}.`);

/** Descripción corta del premio para el aviso al ganador. */
export function describePrize(prize: FlashPrize, names: { ticket?: string | null; product?: string | null }): string {
  switch (prize.kind) {
    case 'ticket': return `Ganaste ${names.ticket ?? 'tu entrada'} 🎟️`;
    case 'product': return `Ganaste ${names.product ?? 'un producto de la Carta'} 🍸`;
    case 'playcoins': return `Ganaste ${prize.playcoins.toLocaleString('es-CL')} PlayCoins 🪙`;
    case 'code': return `Ganaste un ${prize.percent}% de descuento 🏷️`;
    default: return prize.label.trim() ? `Ganaste: ${prize.label.trim()} 🎁` : 'Ganaste un premio 🎁';
  }
}

export function flashFinalText(template: string, winners: { place: number; username: string | null }[]): string {
  const lines = winners.sort((a, b) => a.place - b.place).map((w) => `${medalFor(w.place)} ${w.username ? `@${w.username}` : 'alguien'}`).join('\n');
  return template.replace(/\{\{\s*ganadores\s*\}\}/g, lines || 'Esta vez nadie acertó 😅').slice(0, 2200);
}
