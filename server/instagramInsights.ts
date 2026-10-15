/* Estadísticas reales de las últimas publicaciones (alcance, vistas,
 * guardados, compartidos), desde la API de Meta. Gratis, sin IA. Necesita el
 * permiso `instagram_business_manage_insights` en el token.
 * Se guarda en memoria 3 horas y NO en la base: las miniaturas de Meta
 * vencen, y recalcularlo es barato. */
import { ENV } from './_core/env';
import { fetchOwnMedia } from './instagramSend';
import { parseInsightMetrics, type InstagramInsights, type InsightMediaType, type PostInsight } from '../shared/instagramInsights';

const GRAPH_BASE = 'https://graph.instagram.com/v23.0';
const TTL_MS = 3 * 60 * 60 * 1000;
const MEDIA_LIMIT = 20;
const FULL_METRICS = 'reach,views,saved,shares,total_interactions';
const BASIC_METRICS = 'reach,saved,shares,total_interactions';

let cache: { at: number; data: InstagramInsights } | null = null;

class MissingPermission extends Error {}

async function fetchMediaInsights(mediaId: string): Promise<Record<string, number>> {
  for (const metrics of [FULL_METRICS, BASIC_METRICS]) {
    const response = await fetch(`${GRAPH_BASE}/${mediaId}/insights?metric=${metrics}&access_token=${encodeURIComponent(ENV.igAccessToken)}`);
    const body = await response.json().catch(() => ({})) as { error?: { code?: number; message?: string } };
    if (response.ok) return parseInsightMetrics(body);
    const msg = body.error?.message ?? '';
    if (body.error?.code === 10 || body.error?.code === 200 || /permission/i.test(msg)) throw new MissingPermission(msg);
    // Métrica no disponible para este tipo de publicación: se reintenta con menos.
  }
  return {};
}

function toPost(raw: Record<string, unknown>, metrics: Record<string, number>): PostInsight | null {
  const id = typeof raw.id === 'string' ? raw.id : null;
  const permalink = typeof raw.permalink === 'string' ? raw.permalink : null;
  if (!id || !permalink) return null;
  const type: InsightMediaType = raw.media_type === 'VIDEO' ? 'reel' : raw.media_type === 'CAROUSEL_ALBUM' ? 'carousel' : 'image';
  const thumb = (type === 'reel' ? raw.thumbnail_url : raw.media_url) ?? raw.thumbnail_url;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const opt = (k: string) => (k in metrics ? metrics[k] : null);
  return {
    id,
    type,
    caption: typeof raw.caption === 'string' ? raw.caption.slice(0, 300) : '',
    permalink,
    thumbnail: typeof thumb === 'string' && thumb.startsWith('https://') ? thumb : null,
    timestamp: typeof raw.timestamp === 'string' ? raw.timestamp : null,
    likes: num(raw.like_count),
    comments: num(raw.comments_count),
    reach: opt('reach'),
    views: opt('views'),
    saved: opt('saved'),
    shares: opt('shares'),
  };
}

async function load(): Promise<InstagramInsights> {
  const generatedAt = new Date().toISOString();
  if (!ENV.igAccessToken) return { generatedAt, posts: [], missingPermission: false, error: 'Falta IG_ACCESS_TOKEN en el servidor.' };
  const media = (await fetchOwnMedia(MEDIA_LIMIT)) as Record<string, unknown>[];
  let missingPermission = false;
  const posts: PostInsight[] = [];
  // De a 5 en paralelo: rápido sin golpear el límite de llamadas de Meta.
  for (let i = 0; i < media.length; i += 5) {
    const batch = media.slice(i, i + 5);
    const metrics = await Promise.all(batch.map(async (raw) => {
      if (missingPermission || typeof raw.id !== 'string') return {};
      try { return await fetchMediaInsights(raw.id); } catch (err) { if (err instanceof MissingPermission) missingPermission = true; return {}; }
    }));
    batch.forEach((raw, j) => { const post = toPost(raw, metrics[j]); if (post) posts.push(post); });
  }
  return { generatedAt, posts, missingPermission, error: null };
}

/** Nunca lanza: un error queda en `error` para mostrarlo en el panel. */
export async function getInstagramInsights(opts: { force?: boolean } = {}): Promise<InstagramInsights> {
  if (!opts.force && cache && Date.now() - cache.at < TTL_MS) return cache.data;
  try {
    const data = await load();
    cache = { at: Date.now(), data };
    return data;
  } catch (err) {
    if (cache) return cache.data;
    return { generatedAt: new Date().toISOString(), posts: [], missingPermission: false, error: err instanceof Error ? err.message : 'Meta no entregó las publicaciones.' };
  }
}
