/* "Ventana a Instagram" de la portada (client/src/components/InstagramShowcase.tsx,
 * server/instagramFeed.ts): lo puro, para probarlo sin red. */

export type ShowcaseMediaType = 'image' | 'reel' | 'carousel';

export interface ShowcaseMedia {
  id: string;
  type: ShowcaseMediaType;
  /** Imagen para la grilla y para el visor (en un reel, su portada). */
  image: string;
  /** Solo reels: el video. */
  video: string | null;
  caption: string;
  permalink: string;
  likes: number | null;
  comments: number | null;
  timestamp: string | null;
}

export interface ShowcaseProfile {
  username: string;
  name: string;
  bio: string;
  picture: string | null;
  followers: number;
  posts: number;
}

export interface InstagramShowcase {
  profile: ShowcaseProfile;
  media: ShowcaseMedia[];
}

export const SHOWCASE_MEDIA_LIMIT = 9;
export const SHOWCASE_CAPTION_CHARS = 300;

const httpsUrl = (v: unknown): string | null => (typeof v === 'string' && /^https:\/\//.test(v) ? v : null);
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

/** Lo que entrega `/me/media` de Meta, en la forma de la sección. Descarta lo
 * que no tiene imagen mostrable o link (no se puede dejar un cuadro roto). */
export function normalizeMedia(raw: unknown): ShowcaseMedia[] {
  if (!Array.isArray(raw)) return [];
  const out: ShowcaseMedia[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const kind = r.media_type;
    const permalink = httpsUrl(r.permalink);
    const id = typeof r.id === 'string' ? r.id : null;
    if (!permalink || !id) continue;
    let type: ShowcaseMediaType;
    let image: string | null;
    let video: string | null = null;
    if (kind === 'VIDEO') {
      type = 'reel';
      image = httpsUrl(r.thumbnail_url);
      video = httpsUrl(r.media_url);
    } else if (kind === 'CAROUSEL_ALBUM') {
      type = 'carousel';
      image = httpsUrl(r.media_url) ?? httpsUrl(r.thumbnail_url);
    } else {
      type = 'image';
      image = httpsUrl(r.media_url);
    }
    if (!image) continue;
    const caption = typeof r.caption === 'string' ? r.caption.trim() : '';
    out.push({
      id,
      type,
      image,
      video,
      caption: Array.from(caption).length > SHOWCASE_CAPTION_CHARS ? `${Array.from(caption).slice(0, SHOWCASE_CAPTION_CHARS - 1).join('').trimEnd()}…` : caption,
      permalink,
      likes: count(r.like_count),
      comments: count(r.comments_count),
      timestamp: typeof r.timestamp === 'string' ? r.timestamp : null,
    });
    if (out.length >= SHOWCASE_MEDIA_LIMIT) break;
  }
  return out;
}

/** Siguiente / anterior en el visor; `null` = se terminó (cerrar). */
export function storyNext(index: number, total: number): number | null {
  return index + 1 < total ? index + 1 : null;
}
export function storyPrev(index: number): number {
  return Math.max(0, index - 1);
}

/** 13730 → "13,7 mil"; 1200000 → "1,2 M"; 950 → "950". Formato chileno. */
export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0';
  const oneDecimal = (v: number) => {
    const s = (Math.floor(v * 10) / 10).toFixed(1).replace(/\.0$/, '');
    return s.replace('.', ',');
  };
  if (n >= 1_000_000) return `${oneDecimal(n / 1_000_000)} M`;
  if (n >= 10_000) return `${oneDecimal(n / 1000)} mil`;
  return Math.round(n).toLocaleString('es-CL');
}
