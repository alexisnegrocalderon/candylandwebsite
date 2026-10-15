/* Estadísticas reales de las publicaciones (server/instagramInsights.ts):
 * lo puro, para probarlo sin red. */

export type InsightMediaType = 'reel' | 'carousel' | 'image';

export interface PostInsight {
  id: string;
  type: InsightMediaType;
  caption: string;
  permalink: string;
  thumbnail: string | null;
  timestamp: string | null;
  likes: number;
  comments: number;
  reach: number | null;
  views: number | null;
  saved: number | null;
  shares: number | null;
}

export interface InstagramInsights {
  generatedAt: string;
  posts: PostInsight[];
  /** Meta no entregó estadísticas porque falta el permiso de insights. */
  missingPermission: boolean;
  error: string | null;
}

export const INSIGHT_TYPE_LABEL: Record<InsightMediaType, string> = { reel: 'Reel', carousel: 'Carrusel', image: 'Foto' };

/** Lee la respuesta de `/{media-id}/insights` (formato `values` o `total_value`). */
export function parseInsightMetrics(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const data = (raw as { data?: unknown })?.data;
  if (!Array.isArray(data)) return out;
  for (const m of data) {
    const r = m as { name?: unknown; values?: { value?: unknown }[]; total_value?: { value?: unknown } };
    if (typeof r?.name !== 'string') continue;
    const value = r.total_value?.value ?? r.values?.[0]?.value;
    if (typeof value === 'number' && Number.isFinite(value)) out[r.name] = value;
  }
  return out;
}

/** Interés real: lo que la gente guarda o comparte pesa más que un me gusta. */
export function interestScore(p: PostInsight): number {
  return (p.saved ?? 0) * 3 + (p.shares ?? 0) * 3 + p.comments * 2 + p.likes;
}

export function topBy(posts: PostInsight[], key: 'reach' | 'interest', n = 5): PostInsight[] {
  const value = (p: PostInsight) => (key === 'reach' ? p.reach ?? 0 : interestScore(p));
  return [...posts].sort((a, b) => value(b) - value(a)).slice(0, n);
}

export function averagesByType(posts: PostInsight[]): { type: InsightMediaType; count: number; reach: number; interest: number }[] {
  const groups = new Map<InsightMediaType, PostInsight[]>();
  for (const p of posts) groups.set(p.type, [...(groups.get(p.type) ?? []), p]);
  return Array.from(groups.entries())
    .map(([type, list]) => ({
      type,
      count: list.length,
      reach: Math.round(list.reduce((s, p) => s + (p.reach ?? 0), 0) / list.length),
      interest: Math.round(list.reduce((s, p) => s + interestScore(p), 0) / list.length),
    }))
    .sort((a, b) => b.reach - a.reach);
}

/** Resumen corto para los prompts (Revisar mi perfil, Plan de contenido). */
export function insightsPromptSummary(data: InstagramInsights | null): string {
  if (!data || data.posts.length === 0 || data.posts.every((p) => p.reach == null)) return '';
  const line = (p: PostInsight) =>
    `- ${INSIGHT_TYPE_LABEL[p.type]} (${(p.timestamp ?? '').slice(0, 10)}): alcance ${p.reach ?? '?'}, guardados ${p.saved ?? 0}, compartidos ${p.shares ?? 0}, comentarios ${p.comments}. "${p.caption.replace(/\s+/g, ' ').slice(0, 90)}"`;
  return [
    `ESTADÍSTICAS REALES DE LAS ÚLTIMAS ${data.posts.length} PUBLICACIONES (úsalas para recomendar lo que de verdad funciona):`,
    'Promedio por formato: ' + averagesByType(data.posts).map((a) => `${INSIGHT_TYPE_LABEL[a.type]} alcance ${a.reach} (${a.count})`).join(', '),
    'Las que más interés generaron (guardados y compartidos):',
    ...topBy(data.posts, 'interest', 3).map(line),
  ].join('\n');
}
