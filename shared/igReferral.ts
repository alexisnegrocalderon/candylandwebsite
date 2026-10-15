/* Origen de un chat de Instagram (webhook `messaging_referral`): la persona
 * abrió el chat desde un anuncio o desde un link ig.me con `?ref=código`. */

export type IgReferralSource = 'ad' | 'link' | 'other';

export interface IgReferral {
  source: IgReferralSource;
  /** Código del link (`ref`) o, en un anuncio, el id del anuncio. */
  ref: string | null;
  adTitle: string | null;
}

const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim().slice(0, max);
  return s || null;
};

/** Lee el objeto `referral` de Meta (suelto o pegado a `message`). */
export function parseIgReferral(raw: unknown): IgReferral | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { ref?: unknown; source?: unknown; ad_id?: unknown; ads_context_data?: { ad_title?: unknown } };
  const sourceRaw = typeof r.source === 'string' ? r.source.toUpperCase() : '';
  const source: IgReferralSource = sourceRaw === 'ADS' ? 'ad' : sourceRaw === 'SHORTLINK' || sourceRaw === 'IGME' || r.ref ? 'link' : 'other';
  const ref = clean(r.ref, 120) ?? (typeof r.ad_id === 'string' || typeof r.ad_id === 'number' ? String(r.ad_id) : null);
  const adTitle = clean(r.ads_context_data?.ad_title, 200);
  if (!ref && !adTitle && source === 'other') return null;
  return { source, ref, adTitle };
}

export function igReferralLabel(r: { source: string; ref: string | null; adTitle: string | null }): string {
  if (r.source === 'ad') return `anuncio${r.adTitle ? ` «${r.adTitle}»` : r.ref ? ` ${r.ref}` : ''}`;
  if (r.source === 'link') return `link${r.ref ? ` «${r.ref}»` : ''}`;
  return r.ref ?? 'otro origen';
}

/** Valor para `utm_content`: el código del link, en minúsculas y sin espacios. */
export function referralUtmContent(r: { source: string; ref: string | null } | null): string | undefined {
  if (!r?.ref) return undefined;
  const slug = r.ref.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return slug ? `${r.source === 'ad' ? 'ad' : 'ref'}-${slug}` : undefined;
}

/** Link para compartir: abre el chat de Instagram con un código de origen. */
export function igMeLink(username: string, ref: string): string {
  const code = ref.trim().replace(/\s+/g, '-').slice(0, 60);
  return `https://ig.me/m/${username.replace(/^@/, '')}${code ? `?ref=${encodeURIComponent(code)}` : ''}`;
}
