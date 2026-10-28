/* Estadísticas del ensayo de carga de Playmatch (scripts/loadtest-playmatch.ts): percentiles, resumen por endpoint y
 * veredicto contra las metas de la noche. Lógica pura, sin red, para poder probarla (shared/loadStats.test.ts). */

/** Metas para la noche del evento: 95 % de las respuestas en menos de 1 s y casi sin errores. */
export const LOAD_GOALS = { p95Ms: 1000, maxErrorRate: 0.01 } as const;

export interface Sample { endpoint: string; ms: number; ok: boolean; status: number }

/** Percentil `p` (0-100) por rango más cercano; 0 si no hay datos. */
export function percentile(sortedMs: number[], p: number): number {
  if (sortedMs.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sortedMs.length);
  return sortedMs[Math.min(sortedMs.length - 1, Math.max(0, rank - 1))];
}

export interface EndpointStats { endpoint: string; count: number; errors: number; errorRate: number; p50: number; p95: number; p99: number; max: number; statuses: Record<string, number> }

export function summarize(samples: Sample[]): EndpointStats[] {
  const by = new Map<string, Sample[]>();
  for (const s of samples) by.set(s.endpoint, [...(by.get(s.endpoint) ?? []), s]);
  return Array.from(by, ([endpoint, list]) => {
    const ms = list.map((s) => s.ms).sort((a, b) => a - b);
    const errors = list.filter((s) => !s.ok).length;
    const statuses: Record<string, number> = {};
    for (const s of list) statuses[String(s.status)] = (statuses[String(s.status)] ?? 0) + 1;
    return { endpoint, count: list.length, errors, errorRate: errors / list.length, p50: percentile(ms, 50), p95: percentile(ms, 95), p99: percentile(ms, 99), max: ms[ms.length - 1] ?? 0, statuses };
  }).sort((a, b) => b.count - a.count);
}

/** ¿Pasa las metas? Devuelve los motivos si no. */
export function verdict(samples: Sample[], goals = LOAD_GOALS): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (samples.length === 0) return { pass: false, reasons: ['No se hizo ningún pedido.'] };
  const ms = samples.map((s) => s.ms).sort((a, b) => a - b);
  const p95 = percentile(ms, 95);
  const errorRate = samples.filter((s) => !s.ok).length / samples.length;
  if (p95 > goals.p95Ms) reasons.push(`p95 ${p95} ms supera la meta de ${goals.p95Ms} ms`);
  if (errorRate > goals.maxErrorRate) reasons.push(`${(errorRate * 100).toFixed(1)} % de errores supera la meta de ${(goals.maxErrorRate * 100).toFixed(1)} %`);
  return { pass: reasons.length === 0, reasons };
}

/** La cadencia real de la App durante la noche (client/src/pages/Party.tsx y componentes de Playmatch), en segundos. */
export const POLL_PLAN = [
  { endpoint: 'party.getSession', everyS: 20 },
  { endpoint: 'party.listMansion', everyS: 10 },
  { endpoint: 'party.myGifts', everyS: 10 },
  { endpoint: 'party.myMatches', everyS: 8 },
  { endpoint: 'party.swipeDeck', everyS: 15 },
  { endpoint: 'party.costumeGallery', everyS: 20 },
] as const;

/** Pedidos por segundo que genera una persona con la App abierta (sin contar chats ni swipes). */
export function requestsPerSecondPerUser(): number {
  return POLL_PLAN.reduce((sum, p) => sum + 1 / p.everyS, 0);
}

/** Pedidos por segundo esperados para `users` personas (con `chatShare` de ellas con un chat abierto, que pide cada 3 s). */
export function expectedRps(users: number, chatShare = 0.2): number {
  return users * (requestsPerSecondPerUser() + chatShare / 3);
}
