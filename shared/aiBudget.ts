/* Barra de saldo del gasto de IA: compara lo que registró el panel (aiUsage)
 * con el tope mensual y el saldo que el dueño anotó a mano (Anthropic no
 * entrega el saldo por API). Es una ESTIMACIÓN: solo cuenta lo que pasa por
 * la plataforma. */

export type AiBudgetLevel = 'sin-tope' | 'ok' | 'warn' | 'danger' | 'blocked';

export interface AiBudgetInput {
  capUsd: number;
  balanceUsd: number;
  /** Gasto del mes en curso (US$). */
  spentMonthUsd: number;
  /** Gasto desde que se anotó el saldo (US$). */
  spentSinceBalanceUsd: number;
}

export interface AiBudget {
  level: AiBudgetLevel;
  capUsd: number;
  spentMonthUsd: number;
  /** % del tope usado (0 si no hay tope). */
  percent: number;
  /** Cuánto queda del tope este mes. */
  capLeftUsd: number;
  /** Saldo estimado: lo anotado menos lo gastado después. null si no se anotó. */
  balanceLeftUsd: number | null;
  /** Lo que realmente se puede gastar: el menor entre lo que queda del tope y el saldo. */
  spendableUsd: number | null;
}

export function computeAiBudget(i: AiBudgetInput): AiBudget {
  const hasCap = i.capUsd > 0;
  const percent = hasCap ? Math.min(100, (i.spentMonthUsd / i.capUsd) * 100) : 0;
  const capLeft = hasCap ? Math.max(0, i.capUsd - i.spentMonthUsd) : 0;
  const balanceLeft = i.balanceUsd > 0 ? Math.max(0, i.balanceUsd - i.spentSinceBalanceUsd) : null;
  const spendable = hasCap && balanceLeft != null ? Math.min(capLeft, balanceLeft) : hasCap ? capLeft : balanceLeft;
  let level: AiBudgetLevel = 'sin-tope';
  if (hasCap || balanceLeft != null) {
    level = 'ok';
    if (percent >= 70 || (balanceLeft != null && balanceLeft < 1.5)) level = 'warn';
    if (percent >= 90 || (balanceLeft != null && balanceLeft < 0.75)) level = 'danger';
    if (percent >= 100 || (balanceLeft != null && balanceLeft <= 0)) level = 'blocked';
  }
  return { level, capUsd: i.capUsd, spentMonthUsd: i.spentMonthUsd, percent, capLeftUsd: capLeft, balanceLeftUsd: balanceLeft, spendableUsd: spendable };
}

/** Inicio del mes en Chile como Date (el tope de la plataforma se reinicia el día 1). */
export function chileMonthStart(now: Date): Date {
  const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(now).split('-').map(Number);
  // Medianoche del día 1 en Chile: se prueba UTC-3 y UTC-4 (horario de verano/invierno).
  for (const offset of [3, 4]) {
    const candidate = new Date(Date.UTC(y, m - 1, 1, offset));
    const [cy, cm, cd] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(candidate).split('-').map(Number);
    if (cy === y && cm === m && cd === 1) return candidate;
  }
  return new Date(Date.UTC(y, m - 1, 1, 4));
}

export function chileMonthKey(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(now).slice(0, 7);
}
